"""Manual-first AnimeParadise adapter.

AnimeParadise exposes a public JSON catalog and signed HLS stream URLs. This
adapter resolves only the selected episode; it is not called by Auto until
real Android playback has been verified.
"""
from __future__ import annotations

from urllib.parse import quote, urlencode

import httpx

from src.providers import _cache
from src.providers._match import (
    build_titles,
    episode_meta,
    expected_count,
    find_top_slugs,
    get_prequel_offset,
    select_series,
)
from src.providers._media import build_ctx

NAME = "animeparadise"
API_BASE = "https://api.animeparadise.moe"
STREAM_BASE = "https://stream.animeparadise.moe"
WEB_BASE = "https://animeparadise.moe"
USER_AGENT = (
    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
)


async def _get_json(path: str, params: dict | None = None) -> dict:
    """Fetch one documented API route, with bounded requests and site context."""
    async with httpx.AsyncClient(timeout=18.0, follow_redirects=True) as client:
        response = await client.get(
            f"{API_BASE}{path}",
            params=params,
            headers={
                "User-Agent": USER_AGENT,
                "Origin": WEB_BASE,
                "Referer": WEB_BASE + "/",
                "Accept": "application/json",
            },
        )
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise RuntimeError("AnimeParadise returned an invalid JSON response")
    return payload


async def search(query: str) -> list[dict]:
    payload = await _get_json("/search", {"q": query, "limit": 20})
    items = payload.get("data")
    output = []
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        media_id = item.get("_id") or item.get("id")
        if media_id is None:
            continue
        alternatives = item.get("alternativeTitle")
        alternatives = alternatives if isinstance(alternatives, dict) else {}
        title = alternatives.get("english") or item.get("title") or str(media_id)
        output.append({"slug": str(media_id), "text": str(title)})
    return output


async def episode_catalogue(media_id: str) -> list[dict]:
    payload = await _get_json(f"/anime/{quote(str(media_id), safe='')}/episode")
    data = payload.get("data")
    output = []
    for item in data if isinstance(data, list) else []:
        if not isinstance(item, dict) or item.get("uid") is None:
            continue
        try:
            number_value = float(item.get("number"))
        except (TypeError, ValueError):
            continue
        # The player route currently uses whole-number episode IDs. Ignore
        # non-integer specials rather than silently resolving the wrong episode.
        if number_value < 1 or not number_value.is_integer():
            continue
        output.append({
            "number": int(number_value),
            "title": str(item.get("title") or f"Episode {int(number_value)}"),
            "uid": str(item["uid"]),
            "mediaId": str(media_id),
        })
    output.sort(key=lambda item: item["number"])
    return output


async def resolve_series(anilist_id: int, ctx: dict | None = None) -> dict:
    """Match the AniList identity to the provider catalogue and cache the match."""
    cache_key = f"np:{NAME}:{int(anilist_id)}"
    cached = _cache.cached(cache_key, _cache.SHOW_IDENTITY_TTL)
    if cached is not None:
        return cached

    ctx = ctx or await build_ctx(int(anilist_id))
    media = ctx.get("media") or {}
    titles = build_titles(media, ctx.get("anizip"))
    candidates = await find_top_slugs(titles, search)
    expected = expected_count(media, ctx.get("anizip"))
    try:
        offset = await get_prequel_offset(int(anilist_id))
    except Exception:
        offset = 0

    selected = await select_series(
        candidates,
        episode_catalogue,
        expected,
        media.get("status"),
        offset,
        min_score=0.58,
    )
    if not selected:
        raise RuntimeError(f"AnimeParadise match not found for AniList {anilist_id}")

    result = {
        "mediaId": str(selected["slug"]),
        "title": str(selected.get("title") or selected["slug"]),
        "mode": str(selected.get("mode") or "direct"),
        "offset": int(offset or 0),
        "score": float(selected.get("score") or 0),
    }
    _cache.set(cache_key, result, _cache.SHOW_IDENTITY_TTL)
    return result


def _subtitle_tracks(value: object) -> list[dict]:
    tracks = []
    if not isinstance(value, list):
        return tracks
    for item in value:
        if not isinstance(item, dict):
            continue
        url = item.get("url") or item.get("src") or item.get("file")
        if not isinstance(url, str) or not url.startswith(("https://", "http://")):
            continue
        label = item.get("label") or item.get("name") or item.get("language") or item.get("lang") or "Subtitle"
        track = {"url": url, "lang": str(label), "label": str(label)}
        if item.get("format") or item.get("type"):
            track["format"] = str(item.get("format") or item.get("type"))
        tracks.append(track)
    return tracks


def _numbered_episodes(anilist_id: int, series: dict, catalog: list[dict], ctx: dict, expected):
    episodes = []
    offset = series["offset"] if series["mode"] == "offset" else 0
    for raw in catalog:
        number = int(raw["number"]) - offset
        if number < 1 or (expected and number > expected):
            continue
        info = episode_meta(number, ctx)
        episodes.append({
            "id": f"watch/{NAME}/{anilist_id}/sub/{NAME}-{number}",
            "number": number,
            "title": info.get("title") or raw.get("title") or f"Episode {number}",
            "duration": info.get("duration"),
            "filler": info.get("filler", False),
            "uncensored": info.get("uncensored", False),
            "description": info.get("description"),
            "image": info.get("image"),
            "airDate": info.get("airDate"),
            "sourceNumber": raw["number"],
            "audio": "sub",
        })
    return episodes


async def get_episodes(anilist_id: int, ctx: dict | None = None) -> dict:
    ctx = ctx or await build_ctx(int(anilist_id))
    media = ctx.get("media") or {}
    series = await resolve_series(int(anilist_id), ctx)
    catalog = await episode_catalogue(series["mediaId"])
    return {
        "meta": {
            "id": series["mediaId"],
            "title": series["title"],
            "source": NAME,
            "matchScore": round(series["score"], 3),
            "numbering": series["mode"],
            "episodeOffset": series["offset"] if series["mode"] == "offset" else 0,
        },
        "episodes": {
            "sub": _numbered_episodes(
                int(anilist_id), series, catalog, ctx, expected_count(media, ctx.get("anizip"))
            ),
            "dub": [],
        },
    }


async def watch(anilist_id: int, audio: str, ep: int, ctx: dict | None = None) -> list:
    if audio not in ("sub", "all"):
        raise RuntimeError("AnimeParadise currently supports subbed episodes only")
    anime_id = int(anilist_id)
    episode_number = int(ep)
    if anime_id < 1 or episode_number < 1:
        raise RuntimeError("AnimeParadise requires positive AniList and episode IDs")

    ctx = ctx or await build_ctx(anime_id)
    series = await resolve_series(anime_id, ctx)
    provider_number = episode_number + (
        series["offset"] if series["mode"] == "offset" else 0
    )
    catalog = await episode_catalogue(series["mediaId"])
    selected = next(
        (item for item in catalog if int(item["number"]) == provider_number),
        None,
    )
    if selected is None:
        raise RuntimeError(f"AnimeParadise has no sub episode {provider_number}")

    payload = await _get_json(
        f"/ep/{quote(selected['uid'], safe='')}",
        {"origin": series["mediaId"]},
    )
    data = payload.get("data")
    data = data if isinstance(data, dict) else {}
    episode_data = data.get("episode")
    episode_data = episode_data if isinstance(episode_data, dict) else {}
    stream_link = episode_data.get("streamLink")
    if not isinstance(stream_link, str) or not stream_link.strip():
        raise RuntimeError("AnimeParadise did not return a stream token")

    stream_url = f"{STREAM_BASE}/m3u8?{urlencode({'url': stream_link})}"
    subtitles = _subtitle_tracks(episode_data.get("subData"))
    return [{
        "url": stream_url,
        "type": "hls",
        "server": "AnimeParadise",
        "upstream": NAME,
        "audio": "sub",
        "referer": WEB_BASE + "/",
        "subtitles": subtitles,
    }]
