"""In-process Android API adapter for the bundled Kuhi Python backend.

The API listens only on loopback. A one-time random token returned through the
native Capacitor bridge protects requests from unrelated apps/web pages.
"""
from __future__ import annotations

import ipaddress
import re
import secrets
import threading
from urllib.parse import urlencode, urljoin, urlsplit

import httpx
import uvicorn
from fastapi import Request
from fastapi.responses import JSONResponse, Response

from src.config import HEADERS
from src.endpoints import extract_simple, router
from src.main import app

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


def _episode_number_from_slug(episode_slug: str) -> int:
    # Kuhi emits ids such as "watch/anineko/12345/sub/anineko-12".
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

    from src.providers import _race as provider_race

    preferred = provider.lower() if provider.lower() in provider_race.RANKING else None
    data = await extract_simple(
        query=str(anilist_id),
        episode=episode_number,
        audio=audio,
        provider=preferred,
    )

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
    if host in {"localhost", "localhost.localdomain"} or host.endswith(".local"):
        raise ValueError("Local network targets are not allowed")
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        address = None  # Domain name rather than a literal IP address.
    if address is not None and not address.is_global:
        raise ValueError("Local or private IP targets are not allowed")
    return value


def _proxied_url(target: str, referer: str) -> str:
    return BASE_URL + "/api/proxy?" + urlencode({
        "url": target,
        "referer": referer,
        "token": _TOKEN,
    })


@app.get("/api/proxy")
async def local_media_proxy(url: str, referer: str = ""):
    """Proxy HLS manifests and segments on-device, rewriting child URLs."""
    try:
        target = _validated_remote_url(url)
        effective_referer = referer.strip() or f"{urlsplit(target).scheme}://{urlsplit(target).netloc}/"
        headers = dict(HEADERS)
        headers["Referer"] = effective_referer

        async with httpx.AsyncClient(timeout=35.0, follow_redirects=True) as client:
            upstream = await client.get(target, headers=headers)

        content_type = upstream.headers.get("content-type", "application/octet-stream")
        is_manifest = (
            ".m3u8" in urlsplit(target).path.lower()
            or "mpegurl" in content_type.lower()
            or upstream.content[:128].lstrip().startswith(b"#EXTM3U")
        )
        if not upstream.is_success:
            return Response(
                content=upstream.content,
                status_code=upstream.status_code,
                media_type=content_type,
            )

        if is_manifest:
            rewritten = []
            for line in upstream.text.splitlines():
                stripped = line.strip()
                if stripped.startswith("#"):
                    # HLS encryption keys and initialization maps use URI attributes.
                    if 'URI="' in line:
                        line = re.sub(
                            r'URI="([^"]+)"',
                            lambda found: 'URI="' + _proxied_url(
                                urljoin(target, found.group(1)), effective_referer
                            ) + '"',
                            line,
                        )
                    rewritten.append(line)
                elif stripped:
                    rewritten.append(_proxied_url(urljoin(target, stripped), effective_referer))
                else:
                    rewritten.append(line)
            return Response(
                content="\n".join(rewritten),
                media_type="application/vnd.apple.mpegurl",
                headers={"Cache-Control": "no-store"},
            )

        return Response(
            content=upstream.content,
            status_code=upstream.status_code,
            media_type=content_type,
            headers={"Cache-Control": "no-store"},
        )
    except ValueError as error:
        return JSONResponse({"detail": str(error)}, status_code=400)
    except Exception as error:
        return JSONResponse({"detail": f"Media proxy failed: {error}"}, status_code=502)


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
