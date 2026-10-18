"""In-process Android API adapter for the bundled Kuhi Python backend.

The API listens only on loopback. A one-time random token returned through the
native Capacitor bridge protects requests from unrelated apps/web pages.
"""
from __future__ import annotations

import asyncio
import ipaddress
import re
import secrets
import socket
import threading
import weakref
import time
from urllib.parse import urlencode, urljoin, urlsplit

import httpx
import uvicorn
from fastapi import Request
from fastapi.responses import JSONResponse, Response, StreamingResponse

from src.config import HEADERS
from src.endpoints import router
from src.main import app
from src.providers import _race as provider_race

HOST = "127.0.0.1"
PORT = 8000
BASE_URL = f"http://{HOST}:{PORT}"
_TOKEN = secrets.token_urlsafe(32)
_server: uvicorn.Server | None = None
_server_thread: threading.Thread | None = None
_server_lock = threading.Lock()

# Kuhi's native router is mounted at /anime by upstream. Mounting the same
# router at / also supplies the paths expected by the existing 7xAnime client.
app.include_router(router)

# Last per-provider stream-extraction outcome; messages are sanitized before display.
_LOCAL_PROVIDER_DIAGNOSTICS: dict[str, dict] = {}
_LOCAL_WATCH_CACHE: dict[tuple, tuple[float, list]] = {}
LOCAL_CONTEXT_TIMEOUT = 30.0
LOCAL_CONTEXT_CACHE_TTL = 600.0
LOCAL_WATCH_TIMEOUT = 45.0
LOCAL_WATCH_CACHE_TTL = 35.0
LOCAL_ROUTE_TIMEOUT = 80.0
# Active provider order drives deterministic server numbering and diagnostics.
# Newly added sources remain manual-only until real-device playback is verified.
# The allowlist is the complete active set; the build prunes every other adapter.
ACTIVE_PROVIDER_ORDER = ("anixo", "megavid", "cinexstream", "supaplay")
ACTIVE_PROVIDER_ALLOWLIST = set(ACTIVE_PROVIDER_ORDER)
MANUAL_EMBED_ONLY_PROVIDERS = {"anixo", "megavid", "cinexstream", "supaplay"}
_LOCAL_CONTEXT_CACHE: dict[int, tuple[float, dict]] = {}
# Asyncio primitives are event-loop-bound. Keep in-flight work and locks scoped
# to the current loop so isolated test loops cannot reuse a task from another loop.
_LOCAL_CONTEXT_TASKS: dict[tuple[int, int], asyncio.Task] = {}
_LOCAL_CONTEXT_LOCKS: dict[int, asyncio.Lock] = {}


def _safe_provider_error(error: Exception) -> str:
    message = re.sub(r"https?://\S+", "<upstream URL>", str(error or "").strip())
    message = re.sub(r"(?i)(token|key|secret|signature)=([^&\s]+)", r"\1=<redacted>", message)
    return f"{type(error).__name__}: {message[:180]}" if message else type(error).__name__


def _record_local_provider_outcome(
    name: str,
    outcome: str,
    message: str | None,
    seconds: float,
    *,
    anilist_id: int,
    episode: int,
    audio: str,
    cached: bool = False,
) -> None:
    _LOCAL_PROVIDER_DIAGNOSTICS[name] = {
        "outcome": outcome,
        "message": message,
        "seconds": round(max(0.0, seconds), 3),
        "at": int(time.time()),
        "anilistId": int(anilist_id),
        "episode": int(episode),
        "audio": str(audio),
        "cached": cached,
    }


async def _get_local_provider_context(anilist_id: int) -> dict:
    """Share and cache AniList/AniZip identity setup across discovery and playback."""
    anime_id = int(anilist_id)
    loop = asyncio.get_running_loop()
    loop_id = id(loop)
    task_key = (loop_id, anime_id)
    lock = _LOCAL_CONTEXT_LOCKS.get(loop_id)
    if lock is None:
        lock = asyncio.Lock()
        _LOCAL_CONTEXT_LOCKS[loop_id] = lock

    now = time.time()
    async with lock:
        cached = _LOCAL_CONTEXT_CACHE.get(anime_id)
        if cached and cached[0] > now:
            return cached[1]
        if cached:
            _LOCAL_CONTEXT_CACHE.pop(anime_id, None)

        task = _LOCAL_CONTEXT_TASKS.get(task_key)
        if task is None or task.cancelled():
            task = asyncio.create_task(provider_race.build_ctx(anime_id))
            _LOCAL_CONTEXT_TASKS[task_key] = task

    try:
        context = await asyncio.wait_for(
            asyncio.shield(task),
            timeout=LOCAL_CONTEXT_TIMEOUT,
        )
    except asyncio.TimeoutError as error:
        async with lock:
            if _LOCAL_CONTEXT_TASKS.get(task_key) is task:
                _LOCAL_CONTEXT_TASKS.pop(task_key, None)
            if not task.done():
                task.cancel()
        raise RuntimeError(
            f"Provider metadata setup timed out after {LOCAL_CONTEXT_TIMEOUT:.0f}s"
        ) from error
    except Exception:
        async with lock:
            if _LOCAL_CONTEXT_TASKS.get(task_key) is task:
                _LOCAL_CONTEXT_TASKS.pop(task_key, None)
        raise

    if not isinstance(context, dict) or not isinstance(context.get("media"), dict):
        async with lock:
            if _LOCAL_CONTEXT_TASKS.get(task_key) is task:
                _LOCAL_CONTEXT_TASKS.pop(task_key, None)
        raise RuntimeError("Provider metadata setup returned an invalid context.")

    async with lock:
        _LOCAL_CONTEXT_CACHE[anime_id] = (
            time.time() + LOCAL_CONTEXT_CACHE_TTL,
            context,
        )
        if _LOCAL_CONTEXT_TASKS.get(task_key) is task:
            _LOCAL_CONTEXT_TASKS.pop(task_key, None)
    return context

# Episode discovery should not hold the watch page hostage while every scraper
# finishes. Context creation and each provider scraper run in the background so
# the first request can return a partial catalogue quickly.
_EPISODE_DISCOVERY_TTL = 300.0
_episode_discovery_lock = asyncio.Lock()
_episode_discovery_cache: dict[int, dict] = {}


async def _collect_episode_provider(anilist_id: int, name: str, mod, ctx: dict, state: dict) -> None:
    try:
        result_name, data = await provider_race._episodes_one(mod, name, anilist_id, ctx)
    except Exception as error:
        print(f"[7XAnime] provider episode lookup failed for {name}: {str(error)[:120]}")
        result_name, data = name, None
        state["failed"].add(result_name)

    state["finished"].add(result_name)
    if data:
        state["providers"][result_name] = data
    if state["initialized"] and len(state["finished"]) >= len(state["provider_names"]):
        state["complete"] = True
        state["expires_at"] = time.time() + _EPISODE_DISCOVERY_TTL


async def _start_episode_provider_discovery(anilist_id: int, state: dict) -> None:
    try:
        mods = [
            (name, mod)
            for name, mod in provider_race.providers()
            if name in ACTIVE_PROVIDER_ALLOWLIST
        ]
        state["provider_names"] = [name for name, _ in mods]
        if not mods:
            state["initialized"] = True
            state["complete"] = True
            state["expires_at"] = time.time() + _EPISODE_DISCOVERY_TTL
            return

        ctx = await _get_local_provider_context(anilist_id)
        state["tasks"] = [
            asyncio.create_task(_collect_episode_provider(anilist_id, name, mod, ctx, state))
            for name, mod in mods
        ]
        state["initialized"] = True
        if not state["provider_names"]:
            state["complete"] = True
            state["expires_at"] = time.time() + _EPISODE_DISCOVERY_TTL
    except Exception as error:
        print(f"[7XAnime] provider discovery initialization failed: {str(error)[:160]}")
        state["initialized"] = True
        state["complete"] = True
        state["finished"].update(state["provider_names"])
        state["failed"].update(state["provider_names"])
        state["expires_at"] = time.time() + _EPISODE_DISCOVERY_TTL


async def _progressive_merged_episodes(anilist_id: int) -> dict | None:
    anime_id = int(anilist_id)
    now = time.time()
    async with _episode_discovery_lock:
        state = _episode_discovery_cache.get(anime_id)
        if state and state["complete"] and now >= state["expires_at"]:
            _episode_discovery_cache.pop(anime_id, None)
            state = None

        if state is None:
            state = {
                "providers": {},
                "finished": set(),
                "failed": set(),
                "provider_names": [],
                "tasks": [],
                "initialized": False,
                "complete": False,
                "expires_at": now + _EPISODE_DISCOVERY_TTL,
                "initialization_task": None,
            }
            _episode_discovery_cache[anime_id] = state
            state["initialization_task"] = asyncio.create_task(
                _start_episode_provider_discovery(anime_id, state)
            )

    # Bound the initial setup wait as well as the provider wait; a slow shared
    # context request must not block the Watch screen before the player can start.
    initializer = state.get("initialization_task")
    if initializer is not None and not initializer.done():
        await asyncio.wait({initializer}, timeout=0.4)

    pending = [task for task in state["tasks"] if not task.done()]
    if pending:
        await asyncio.wait(
            pending,
            timeout=0.5 if not state["providers"] else 0.05,
            return_when=asyncio.FIRST_COMPLETED,
        )

    if state["initialized"] and len(state["finished"]) >= len(state["provider_names"]):
        state["complete"] = True
        state["expires_at"] = time.time() + _EPISODE_DISCOVERY_TTL
    ordered_providers = {
        name: state["providers"][name]
        for name in state["provider_names"]
        if name in state["providers"]
    }
    return {
        "anilistId": anime_id,
        "source": "native",
        "providers": ordered_providers,
        "providerNames": list(state["provider_names"]),
        "failedProviders": sorted(state["failed"]),
        "complete": state["complete"],
    }


provider_race.merged_episodes = _progressive_merged_episodes

@app.middleware("http")
async def local_request_guard(request: Request, call_next):
    # Health is polled by native Java before the token is returned to JS.
    if request.url.path == "/api/health" or request.method == "OPTIONS":
        return await call_next(request)

    supplied = request.headers.get("x-7xanime-token") or request.query_params.get("token", "")
    if not secrets.compare_digest(str(supplied), _TOKEN):
        return JSONResponse({"detail": "Local API token missing or invalid"}, status_code=403)

    return await call_next(request)


@app.get("/api/health")
async def local_health():
    return {"status": "ok", "service": "7xanime-local-api"}


@app.get("/api/diagnostics/providers")
async def local_provider_status():
    """Expose embedded provider import and recent attempt diagnostics to the app."""
    snapshot = provider_race.providers_status()
    available = set(snapshot.get("available") or []) & ACTIVE_PROVIDER_ALLOWLIST
    latency = snapshot.get("latency") or {}
    providers = []
    for name in ACTIVE_PROVIDER_ORDER:
        metrics = latency.get(name) or {}
        attempt = _LOCAL_PROVIDER_DIAGNOSTICS.get(name) or {}
        loaded = name in available
        avg_seconds = metrics.get("avg_seconds")
        failures = int(metrics.get("failures") or 0)
        if not loaded:
            status = "module_unavailable"
        elif avg_seconds is None and failures == 0:
            status = "not_tested_yet"
        elif failures:
            status = "recent_attempts_failed"
        else:
            status = "recent_attempt_succeeded"
        providers.append({
            "id": name,
            "moduleLoaded": loaded,
            "status": status,
            "averageSeconds": avg_seconds,
            "episodesSeconds": metrics.get("episodes_seconds"),
            "failuresSinceLastSuccess": failures,
            "lastOutcome": attempt.get("outcome"),
            "lastError": attempt.get("message"),
            "anilistId": attempt.get("anilistId"),
            "episode": attempt.get("episode"),
            "audio": attempt.get("audio"),
            "lastAttemptSeconds": attempt.get("seconds"),
            "lastAttemptAt": attempt.get("at"),
            "lastAttemptCached": attempt.get("cached", False),
        })
    return {
        "mode": "embedded",
        "defaultProvider": snapshot.get("defaultProvider"),
        "loadedCount": len(available),
        "providerCount": len(ACTIVE_PROVIDER_ALLOWLIST),
        "providers": providers,
        "note": "Only AniXo, Megavid, CinexStream, and SupaPlay are packaged as provider adapters. Module-loaded status is not a live guarantee for every anime or episode; attempt metrics are collected as you select or play providers. These four adapters construct cross-origin embeds, while MegaPlay is the dedicated frontend Server 1 fallback.",
    }


def _player_stream_kind(stream: dict) -> str:
    """Classify provider output by the media type the Android player can consume."""
    stream_type = str(stream.get("type") or "").strip().lower()
    url = str(stream.get("url") or "").strip()
    path = urlsplit(url).path.lower()
    if "dash" in stream_type or path.endswith(".mpd"):
        return "dash"
    if "hls" in stream_type or "m3u8" in stream_type or path.endswith(".m3u8"):
        return "m3u8"
    if "mp4" in stream_type or path.endswith(".mp4"):
        return "mp4"
    if "embed" in stream_type or "iframe" in stream_type:
        return "embed"
    # Provider adapters sometimes return opaque embed URLs without a type.
    return "embed" if url else "unknown"


def _playable_streams(streams: list | None) -> list:
    # Android's native player supports HLS and MP4; embed-only sources are
    # rendered in a sandboxed iframe. DASH (.mpd) is not treated as playable
    # until a DASH engine is installed, rather than mislabelled as HLS.
    rank = {"m3u8": 0, "mp4": 1, "embed": 2}
    valid = [
        {**stream, "type": _player_stream_kind(stream)}
        for stream in (streams or [])
        if isinstance(stream, dict)
        and stream.get("url")
        and _player_stream_kind(stream) in rank
    ]
    return sorted(valid, key=lambda stream: rank.get(stream.get("type", "embed"), 9))


async def _watch_one_for_player(mod, name, anilist_id, ep, audio, ctx):
    """Run one provider with a mobile-safe budget and preserve actionable diagnostics."""
    key = (name, int(anilist_id), int(ep), str(audio))
    cached = _LOCAL_WATCH_CACHE.get(key)
    now = time.time()
    if cached and cached[0] > now:
        streams = cached[1]
        _record_local_provider_outcome(name, "streams_returned", None, 0.0, anilist_id=anilist_id, episode=ep, audio=audio, cached=True)
        return name, streams, 0.0, bool(streams)
    if cached:
        _LOCAL_WATCH_CACHE.pop(key, None)

    started = time.monotonic()
    try:
        raw_streams = await asyncio.wait_for(
            mod.watch(anilist_id, audio, ep, ctx),
            timeout=LOCAL_WATCH_TIMEOUT,
        )
    except asyncio.CancelledError:
        raise
    except (asyncio.TimeoutError, httpx.TimeoutException) as error:
        seconds = time.monotonic() - started
        message = f"Provider timed out after {LOCAL_WATCH_TIMEOUT:.0f}s"
        if str(error).strip():
            message += f" ({type(error).__name__})"
        _record_local_provider_outcome(name, "timeout", message, seconds, anilist_id=anilist_id, episode=ep, audio=audio)
        return name, [], seconds, False
    except Exception as error:
        seconds = time.monotonic() - started
        _record_local_provider_outcome(name, "request_error", _safe_provider_error(error), seconds, anilist_id=anilist_id, episode=ep, audio=audio)
        return name, [], seconds, False

    seconds = time.monotonic() - started
    raw_streams = raw_streams if isinstance(raw_streams, list) else []
    playable = _playable_streams(raw_streams)
    if not raw_streams:
        _record_local_provider_outcome(
            name, "no_sources", "Provider returned no stream for this anime, episode and audio.", seconds,
            anilist_id=anilist_id, episode=ep, audio=audio
        )
        return name, [], seconds, False
    if not playable:
        _record_local_provider_outcome(
            name, "unsupported_format",
            "Provider returned sources, but none are supported (HLS, MP4 or embed; DASH is not enabled).",
            seconds,
            anilist_id=anilist_id, episode=ep, audio=audio,
        )
        return name, [], seconds, False

    _LOCAL_WATCH_CACHE[key] = (time.time() + LOCAL_WATCH_CACHE_TTL, playable)
    _record_local_provider_outcome(
        name, "streams_returned", None, seconds,
        anilist_id=anilist_id, episode=ep, audio=audio,
    )
    return name, playable, seconds, True


def _episode_number_from_slug(episode_slug: str) -> int:
    # Provider episode IDs end with an episode number, e.g. "watch/anixo/12345/sub/anixo-12".
    # Extract the final number regardless of the provider-specific slug prefix.
    match = re.search(r"(\d+)\s*$", episode_slug)
    return int(match.group(1)) if match else 1


@app.get("/watch/{provider}/{anilist_id}/{audio}/{episode_slug:path}")
async def legacy_watch_route(provider: str, anilist_id: int, audio: str, episode_slug: str):
    """Translate Kuhi's episode IDs to its native extraction route."""
    episode_number = _episode_number_from_slug(episode_slug)
    audio = (audio or "sub").lower()
    if audio not in {"sub", "dub"}:
        audio = "sub"

    requested_provider = (provider or "").strip().lower()
    is_auto = requested_provider == "auto"
    preferred = requested_provider if requested_provider in ACTIVE_PROVIDER_ALLOWLIST else None

    async def extract_streams() -> dict:
        # Automatic Kuhi routing is retired. A manually selected server must
        # never silently return another provider's stream.
        if is_auto:
            return {
                "anilistId": anilist_id,
                "episode": episode_number,
                "type": audio,
                "provider": "auto",
                "requestedProvider": "auto",
                "providerStatus": "auto_disabled",
                "providerError": "The legacy Kuhi Auto race is disabled. Use MegaPlay Server 1 or choose one of the six supported embed servers.",
                "streams": [],
                "subtitles": [],
            }

        if preferred is None:
            return {
                "anilistId": anilist_id,
                "episode": episode_number,
                "type": audio,
                "provider": requested_provider,
                "requestedProvider": requested_provider,
                "providerStatus": "unsupported_provider",
                "providerError": "This server name is not in the bundled provider list.",
                "streams": [],
                "subtitles": [],
            }

        provider_modules = {
            name: mod for name, mod in provider_race.providers()
            if name in ACTIVE_PROVIDER_ALLOWLIST
        }
        module = provider_modules.get(preferred)
        if module is None:
            return {
                "anilistId": anilist_id,
                "episode": episode_number,
                "type": audio,
                "provider": preferred,
                "requestedProvider": preferred,
                "providerStatus": "provider_unavailable",
                "providerError": "This provider could not be loaded in the embedded API.",
                "streams": [],
                "subtitles": [],
            }

        # Embed-route adapters only construct their documented iframe URL;
        # they do not need AniList/AniZip metadata setup before the player opens.
        # Skip the shared metadata request for them to avoid a false loading delay.
        ctx = (
            {}
            if preferred in MANUAL_EMBED_ONLY_PROVIDERS
            else await _get_local_provider_context(anilist_id)
        )
        actual_name, streams, seconds, ok = await _watch_one_for_player(
            module, preferred, anilist_id, episode_number, audio, ctx
        )
        provider_race.record_latency(actual_name, seconds, ok)
        streams = (streams or []) if ok else []
        return {
            "anilistId": anilist_id,
            "episode": episode_number,
            "type": audio,
            "provider": actual_name,
            "requestedProvider": preferred,
            "defaultProvider": provider_race.default_provider(),
            "providerStatus": "ok" if ok and streams else "no_stream",
            "providerError": None if ok and streams else "The selected provider returned no stream for this episode.",
            "timings": {actual_name: {"seconds": seconds, "ok": bool(ok and streams)}},
            "streams": streams,
            "subtitles": provider_race.merge_subtitles(streams),
        }

    # Bound metadata setup plus stream extraction. Manual selection stays strict;
    # Auto is rejected before any provider request is made.
    try:
        data = await asyncio.wait_for(extract_streams(), timeout=LOCAL_ROUTE_TIMEOUT)
    except asyncio.TimeoutError:
        print(
            f"[7XAnime] stream lookup timed out for provider={provider}, "
            f"anime={anilist_id}, episode={episode_number}"
        )
        data = {
            "anilistId": anilist_id,
            "episode": episode_number,
            "type": audio,
            "provider": preferred or ("auto" if is_auto else requested_provider),
            "requestedProvider": preferred or ("auto" if is_auto else requested_provider),
            "providerStatus": "timeout",
            "providerError": "The selected stream lookup exceeded the request budget.",
            "streams": [],
            "subtitles": [],
        }
    except Exception as error:
        print(
            f"[7XAnime] stream lookup failed for provider={provider}, "
            f"anime={anilist_id}, episode={episode_number}: {str(error)[:160]}"
        )
        data = {
            "anilistId": anilist_id,
            "episode": episode_number,
            "type": audio,
            "provider": preferred or ("auto" if is_auto else requested_provider),
            "requestedProvider": preferred or ("auto" if is_auto else requested_provider),
            "providerStatus": "error",
            "providerError": _safe_provider_error(error),
            "streams": [],
            "subtitles": [],
        }

    # Normalize subtitle fields to the names consumed by the current frontend.
    normalized_subtitles = []
    for item in (data or {}).get("subtitles", []):
        if not isinstance(item, dict):
            continue
        file_url = item.get("file") or item.get("url") or item.get("src")
        if not file_url:
            continue
        normalized_subtitles.append({
            **item,
            "file": file_url,
            "label": item.get("label") or item.get("lang") or item.get("language") or "Subtitle",
        })

    data = dict(data or {})
    data["subtitles"] = normalized_subtitles
    return data


HINDI_API_BASE = "https://anime-api-ashen-chi.vercel.app/api"


async def _fetch_hindi_api(path: str, params: dict):
    """Proxy a fixed set of endpoints from the community Hindi anime catalog."""
    try:
        async with httpx.AsyncClient(timeout=9.0, follow_redirects=True) as client:
            upstream = await client.get(f"{HINDI_API_BASE}/{path}", params=params)
        if not upstream.is_success:
            return JSONResponse(
                {"success": False, "detail": f"Hindi catalogue returned HTTP {upstream.status_code}"},
                status_code=502,
            )
        try:
            return upstream.json()
        except ValueError:
            return JSONResponse({"success": False, "detail": "Hindi catalogue returned invalid JSON"}, status_code=502)
    except Exception:
        return JSONResponse({"success": False, "detail": "Hindi catalogue is temporarily unavailable"}, status_code=502)


@app.get("/hindi/search")
async def hindi_catalogue_search(s: str, page: int = 1):
    return await _fetch_hindi_api("search", {"s": s, "page": max(1, page)})


@app.get("/hindi/stream")
async def hindi_catalogue_stream(id: str, season: int = 1, ep: int = 1):
    return await _fetch_hindi_api(
        "stream",
        {"id": id, "season": max(1, season), "ep": max(1, ep)},
    )


def _validated_remote_url(value: str) -> str:
    value = (value or "").strip()
    if value.startswith("//"):
        value = "https:" + value
    parts = urlsplit(value)
    if parts.scheme not in {"http", "https"} or not parts.hostname:
        raise ValueError("Only absolute HTTP(S) media URLs are supported")
    host = parts.hostname.lower().rstrip(".")
    if (
        host in {"localhost", "localhost.localdomain"}
        or host.endswith((".localhost", ".local", ".internal", ".home.arpa"))
    ):
        raise ValueError("Local network targets are not allowed")
    try:
        address = ipaddress.ip_address(host.split("%", 1)[0])
    except ValueError:
        address = None  # Domain name rather than a literal IP address.
    if address is not None and not address.is_global:
        raise ValueError("Local or private IP targets are not allowed")
    if parts.username or parts.password:
        raise ValueError("Credential-bearing media URLs are not allowed")
    return value


async def _validated_public_remote_url(value: str) -> str:
    """Reject private DNS answers as well as private IP literals before every request."""
    target = _validated_remote_url(value)
    host = urlsplit(target).hostname
    if not host:
        raise ValueError("Media URL is missing a hostname")
    try:
        ipaddress.ip_address(host.split("%", 1)[0])
        return target  # _validated_remote_url has already checked literal IP addresses.
    except ValueError:
        pass

    loop = asyncio.get_running_loop()
    port = urlsplit(target).port or (443 if urlsplit(target).scheme == "https" else 80)
    try:
        records = await asyncio.wait_for(
            loop.getaddrinfo(host, port, type=socket.SOCK_STREAM),
            timeout=5.0,
        )
    except Exception as error:
        raise ValueError("Media hostname could not be resolved safely") from error

    addresses = {record[4][0].split("%", 1)[0] for record in records}
    if not addresses:
        raise ValueError("Media hostname has no usable public addresses")
    try:
        if any(not ipaddress.ip_address(address).is_global for address in addresses):
            raise ValueError("Media hostname resolves to a private or reserved IP address")
    except ValueError as error:
        if str(error) == "Media hostname resolves to a private or reserved IP address":
            raise
        raise ValueError("Media hostname resolved to an invalid IP address") from error
    return target


# Clients are scoped to an event loop because the API also runs inside isolated test loops.
# Keeping them alive between requests enables HTTP connection reuse for HLS playlists/segments.
_MEDIA_CLIENTS = weakref.WeakKeyDictionary()


def _get_media_http_client() -> httpx.AsyncClient:
    loop = asyncio.get_running_loop()
    client = _MEDIA_CLIENTS.get(loop)
    if client is None:
        client = httpx.AsyncClient(
            timeout=httpx.Timeout(connect=8.0, read=35.0, write=10.0, pool=5.0),
            follow_redirects=False,
            limits=httpx.Limits(
                max_connections=24,
                max_keepalive_connections=12,
                keepalive_expiry=25.0,
            ),
        )
        _MEDIA_CLIENTS[loop] = client
    return client


@app.on_event("shutdown")
async def _close_media_http_client() -> None:
    loop = asyncio.get_running_loop()
    client = _MEDIA_CLIENTS.pop(loop, None)
    if client is not None:
        await client.aclose()


def _proxied_url(target: str, referer: str) -> str:
    return BASE_URL + "/api/proxy?" + urlencode({
        "url": target,
        "referer": referer,
        "token": _TOKEN,
    })


def _media_proxy_headers(upstream: httpx.Response) -> dict[str, str]:
    headers = {"Cache-Control": "no-store"}
    for name in (
        "content-range",
        "accept-ranges",
        "content-length",
        "content-encoding",
        "last-modified",
        "etag",
        "content-disposition",
    ):
        value = upstream.headers.get(name)
        if value:
            headers[name] = value
    return headers


@app.get("/api/proxy")
async def local_media_proxy(request: Request, url: str, referer: str = ""):
    """Stream media with range support, validated redirects, and pooled upstream connections."""
    upstream: httpx.Response | None = None
    try:
        target = await _validated_public_remote_url(url)
        effective_referer = referer.strip() or f"{urlsplit(target).scheme}://{urlsplit(target).netloc}/"
        headers = dict(HEADERS)
        headers["Referer"] = effective_referer
        # Preserve Range/If-Range so MP4 seeking does not force a full-file download.
        for name in ("range", "if-range"):
            value = request.headers.get(name)
            if value:
                headers[name.title()] = value

        client = _get_media_http_client()
        for redirect_count in range(6):
            target = await _validated_public_remote_url(target)
            outbound = client.build_request("GET", target, headers=headers)
            upstream = await client.send(outbound, stream=True, follow_redirects=False)
            location = upstream.headers.get("location")
            if upstream.status_code not in {301, 302, 303, 307, 308} or not location:
                break

            await upstream.aclose()
            upstream = None
            if redirect_count == 5:
                raise ValueError("Media source exceeded the redirect limit")
            target = urljoin(target, location)
        else:
            raise ValueError("Media source exceeded the redirect limit")

        assert upstream is not None
        content_type = upstream.headers.get("content-type", "application/octet-stream")
        iterator = upstream.aiter_raw().__aiter__()
        prefix_chunks: list[bytes] = []
        prefix = bytearray()
        while len(prefix) < 128:
            try:
                chunk = await anext(iterator)
            except StopAsyncIteration:
                break
            if not chunk:
                continue
            prefix_chunks.append(chunk)
            prefix.extend(chunk)
            if b"\n" in prefix and prefix.lstrip().startswith(b"#EXTM3U"):
                break

        is_manifest = (
            ".m3u8" in urlsplit(target).path.lower()
            or "mpegurl" in content_type.lower()
            or bytes(prefix).lstrip().startswith(b"#EXTM3U")
        )
        forwarded_headers = _media_proxy_headers(upstream)

        async def stream_remaining():
            try:
                for chunk in prefix_chunks:
                    yield chunk
                async for chunk in iterator:
                    yield chunk
            finally:
                if upstream is not None:
                    await upstream.aclose()

        if not upstream.is_success:
            # Keep error responses streamable too; providers sometimes return sizeable HTML pages.
            return StreamingResponse(
                stream_remaining(),
                status_code=upstream.status_code,
                media_type=content_type,
                headers=forwarded_headers,
            )

        if is_manifest:
            chunks = list(prefix_chunks)
            async for chunk in iterator:
                chunks.append(chunk)
            await upstream.aclose()
            body = b"".join(chunks).decode(upstream.encoding or "utf-8", errors="replace")
            rewritten = []
            for line in body.splitlines():
                stripped = line.strip()
                if stripped.startswith("#"):
                    # HLS encryption keys and initialization maps may use URI attributes.
                    if 'URI="' in line:
                        def rewrite_uri(found):
                            absolute = urljoin(target, found.group(1))
                            if urlsplit(absolute).scheme not in {"http", "https"}:
                                return found.group(0)
                            return 'URI="' + _proxied_url(absolute, effective_referer) + '"'

                        line = re.sub(r'URI="([^"]+)"', rewrite_uri, line)
                    rewritten.append(line)
                elif stripped:
                    absolute = urljoin(target, stripped)
                    if urlsplit(absolute).scheme in {"http", "https"}:
                        rewritten.append(_proxied_url(absolute, effective_referer))
                    else:
                        rewritten.append(line)
                else:
                    rewritten.append(line)
            return Response(
                content="\n".join(rewritten),
                media_type="application/vnd.apple.mpegurl",
                headers={"Cache-Control": "no-store"},
            )

        return StreamingResponse(
            stream_remaining(),
            status_code=upstream.status_code,
            media_type=content_type,
            headers=forwarded_headers,
        )
    except ValueError as error:
        if upstream is not None:
            await upstream.aclose()
        return JSONResponse({"detail": str(error)}, status_code=400)
    except Exception:
        if upstream is not None:
            await upstream.aclose()
        return JSONResponse({"detail": "Media proxy is temporarily unavailable"}, status_code=502)


def get_token() -> str:
    """Return the per-process token only to the native bridge."""
    return _TOKEN


def _serve() -> None:
    global _server
    config = uvicorn.Config(
        app,
        host=HOST,
        port=PORT,
        log_level="warning",
        access_log=False,
        loop="asyncio",
        lifespan="on",
    )
    _server = uvicorn.Server(config)
    _server.run()


def start_background() -> str:
    """Start the API in a daemon thread and return its private token."""
    global _server_thread
    with _server_lock:
        if _server_thread is None or not _server_thread.is_alive():
            _server_thread = threading.Thread(
                target=_serve,
                name="7xanime-local-api",
                daemon=True,
            )
            _server_thread.start()
    return _TOKEN
