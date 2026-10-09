"""AnimeNoSub provider adapter for the embedded 7xAnime API.

Ported as a small, embed-first adapter so it needs no Node runtime or external API.
A provider importing successfully is not a guarantee a title/episode is available.
"""
from __future__ import annotations

import asyncio
import base64
import re
from urllib.parse import quote, urlencode, urljoin, urlsplit

from src.providers._http import fetch_text
from src.providers._match import (
    attr,
    build_titles,
    decode_entities,
    episode_meta,
    expected_count,
    find_top_slugs,
    get_prequel_offset,
    select_series,
    strip_tags,
)
from src.providers._media import build_ctx
from src.providers import _cache

NAME = "animenosub"
BASE = "https://animenosub.to"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


async def search(query: str) -> list:
    headers = {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": UA,
        "Origin": BASE,
        "Referer": BASE + "/",
    }
    body = urlencode({"action": "ts_ac_do_search", "ts_ac_query": query})
    import httpx
    async with httpx.AsyncClient(timeout=18.0, follow_redirects=True) as client:
        response = await client.post(
            f"{BASE}/wp-admin/admin-ajax.php",
            headers=headers,
            content=body,
        )
    if not response.is_success:
        raise RuntimeError(f"AnimeNoSub search HTTP {response.status_code}")
    data = response.json()
    results = []
    groups = ((data.get("anime") or [{}])[0] or {}).get("all") or []
    for item in groups:
        link = str(item.get("post_link") or "")
        match = re.search(r"/anime/([^/]+)/?$", link)
        if not match:
            continue
        slug = match.group(1)
        title = item.get("post_title") or slug.replace("-", " ")
        results.append({"slug": slug, "text": decode_entities(str(title))})
    return results


async def scrape_series(slug: str) -> list:
    html = await fetch_text(f"{BASE}/anime/{quote(slug, safe='-')}/", {"Referer": BASE + "/"})
    slug_is_dub = bool(re.search(r"(?:^|-)dub$", slug, re.IGNORECASE))
    episodes = []
    seen = set()

    for block_match in re.finditer(r"<li\b[^>]*data-index=[\"']\d+[\"'][^>]*>[\s\S]*?</li>", html, re.IGNORECASE):
        block = block_match.group(0)
        link_match = re.search(r"<a\b[^>]*href=[\"'](https?://animenosub\.to/[^\"]+)[\"'][^>]*>", block, re.IGNORECASE)
        if not link_match:
            link_match = re.search(r"<a\b[^>]*href=[\"']([^\"']+)[\"'][^>]*>", block, re.IGNORECASE)
        label_match = re.search(r"<div\b[^>]*class=[\"'][^\"']*epl-num[^\"']*[\"'][^>]*>([\s\S]*?)</div>", block, re.IGNORECASE)
        if not link_match or not label_match:
            continue

        label = strip_tags(label_match.group(1)).strip()
        if re.fullmatch(r"movie", label, re.IGNORECASE):
            number = 1
        else:
            numeric = re.search(r"\d+(?:\.\d+)?", label)
            if not numeric:
                continue
            number = int(float(numeric.group(0)))
        if number < 1 or number in seen:
            continue

        ep_url = urljoin(BASE + "/", decode_entities(link_match.group(1)))
        if not ep_url.startswith(BASE + "/"):
            continue
        is_dub = slug_is_dub or bool(re.search(r"-dub(?:/|$)", urlsplit(ep_url).path, re.IGNORECASE))
        buttons = block.lower()
        has_sub_marker = "btn-subbed" in buttons
        has_dub_marker = "btn-dubbed" in buttons
        has_sub = has_sub_marker or (is_dub is False and not has_dub_marker)
        has_dub = has_dub_marker or is_dub
        title_match = re.search(r"<i\b[^>]*class=[\"'][^\"']*anititle[^\"']*[\"'][^>]*>([\s\S]*?)</i>", block, re.IGNORECASE)
        title = strip_tags(title_match.group(1)) if title_match else label

        seen.add(number)
        episodes.append({
            "number": number,
            "title": title or f"Episode {number}",
            "epUrl": ep_url,
            "hasSub": has_sub,
            "hasDub": has_dub,
        })

    episodes.sort(key=lambda item: item["number"])
    return episodes


def _embed_origin(value: str, fallback: str) -> str:
    try:
        parts = urlsplit(value)
        if parts.scheme in ("http", "https") and parts.netloc:
            return f"{parts.scheme}://{parts.netloc}/"
    except Exception:
        pass
    return fallback


def _extract_src(text: str) -> str | None:
    decoded = decode_entities(text)
    match = re.search(r"\bsrc\s*=\s*[\"']([^\"']+)[\"']", decoded, re.IGNORECASE)
    if not match:
        return None
    return decode_entities(match.group(1)).strip()


async def scrape_embeds(ep_url: str) -> list:
    html = await fetch_text(ep_url, {"Referer": BASE + "/"})
    streams = []
    seen = set()

    for match in re.finditer(r"<option\b[^>]*>([\s\S]*?)</option>", html, re.IGNORECASE):
        tag = match.group(0)
        encoded = attr(tag.split(">", 1)[0] + ">", "value")
        label = strip_tags(match.group(1))
        if not encoded or not label or "select video server" in label.lower():
            continue
        try:
            snippet = base64.b64decode(encoded + "=" * (-len(encoded) % 4)).decode("utf-8", "ignore")
        except Exception:
            continue
        src = _extract_src(snippet)
        if not src:
            continue
        embed_url = urljoin(ep_url, src)
        parts = urlsplit(embed_url)
        if parts.scheme not in ("http", "https") or not parts.netloc or embed_url in seen:
            continue
        seen.add(embed_url)
        streams.append({
            "url": embed_url,
            "type": "embed",
            "server": label.strip(),
            "referer": _embed_origin(embed_url, BASE + "/"),
            "audio": "dub" if re.search(r"\bdub\b", label, re.IGNORECASE) else None,
            "priority": len(streams) + 1,
        })

    # Backup: if the episode page exposes a known iframe without the option list,
    # preserve it as an embedded source rather than assuming it is a direct video.
    if not streams:
        for match in re.finditer(r"<iframe\b[^>]*>", html, re.IGNORECASE):
            src = attr(match.group(0), "src")
            if not src:
                continue
            embed_url = urljoin(ep_url, decode_entities(src))
            if urlsplit(embed_url).scheme not in ("http", "https") or embed_url in seen:
                continue
            if not re.search(r"vidmoly|vtbe|streamtape|dood|filemoon|upn\.one|bysesayeveum", embed_url, re.IGNORECASE):
                continue
            streams.append({
                "url": embed_url,
                "type": "embed",
                "server": "Direct embed",
                "referer": _embed_origin(embed_url, BASE + "/"),
                "priority": 1,
            })
            break

    return streams


async def resolve_series(anilist_id: int, ctx: dict | None = None) -> dict:
    ctx = ctx or await build_ctx(anilist_id)
    cache_key = f"np:{NAME}:{anilist_id}"
    cached = _cache.cached(cache_key, _cache.SHOW_IDENTITY_TTL)
    if cached is not None:
        return cached

    media = ctx.get("media") or {}
    titles = build_titles(media, ctx.get("anizip"))
    candidates = await find_top_slugs(titles, search)
    expected = expected_count(media, ctx.get("anizip"))
    try:
        offset = await get_prequel_offset(anilist_id)
    except Exception:
        offset = 0
    selected = await select_series(
        candidates,
        scrape_series,
        expected,
        media.get("status"),
        offset,
        min_score=0.58,
    )
    if not selected:
        raise RuntimeError(f"AnimeNoSub match not found for AniList {anilist_id}")

    result = {
        "slug": selected["slug"],
        "title": selected["title"],
        "mode": selected["mode"],
        "offset": offset,
        "score": selected["score"],
    }
    _cache.set(cache_key, result, _cache.SHOW_IDENTITY_TTL)
    return result


def _episode_lists(anilist_id: int, series: dict, episodes: list, ctx: dict, expected) -> dict:
    sub, dub = [], []
    for episode in episodes:
        provider_number = episode["number"]
        number = provider_number - series["offset"] if series["mode"] == "offset" else provider_number
        if number < 1 or (expected and number > expected):
            continue
        meta = episode_meta(number, ctx)
        base = {
            "number": number,
            "title": meta.get("title") or episode.get("title") or f"Episode {number}",
            "duration": meta.get("duration"),
            "filler": meta.get("filler", False),
            "uncensored": meta.get("uncensored", False),
            "description": meta.get("description"),
            "image": meta.get("image"),
            "airDate": meta.get("airDate"),
            "sourceNumber": provider_number,
        }
        if episode.get("hasSub"):
            sub.append({"id": f"watch/{NAME}/{anilist_id}/sub/{NAME}-{number}", **base, "audio": "sub"})
        if episode.get("hasDub"):
            dub.append({"id": f"watch/{NAME}/{anilist_id}/dub/{NAME}-{number}", **base, "audio": "dub"})
    return {"sub": sub, "dub": dub}


async def get_episodes(anilist_id: int, ctx: dict | None = None) -> dict:
    ctx = ctx or await build_ctx(anilist_id)
    media = ctx.get("media") or {}
    series = await resolve_series(anilist_id, ctx)
    episodes = await scrape_series(series["slug"])
    expected = expected_count(media, ctx.get("anizip"))
    return {
        "meta": {
            "id": series["slug"],
            "title": series["title"],
            "source": NAME,
            "matchScore": round(float(series.get("score") or 0), 3),
            "numbering": series["mode"],
            "episodeOffset": series["offset"] if series["mode"] == "offset" else 0,
        },
        "episodes": _episode_lists(anilist_id, series, episodes, ctx, expected),
    }


async def watch(anilist_id: int, audio: str, ep: int, ctx: dict | None = None) -> list:
    if audio not in ("sub", "dub", "all"):
        raise RuntimeError(f"AnimeNoSub unknown audio '{audio}'")
    ctx = ctx or await build_ctx(anilist_id)
    series = await resolve_series(anilist_id, ctx)
    provider_number = int(ep) + series["offset"] if series["mode"] == "offset" else int(ep)
    episodes = await scrape_series(series["slug"])
    chosen = next(
        (item for item in episodes if item["number"] == provider_number and
         (audio == "all" or item.get("hasDub" if audio == "dub" else "hasSub"))),
        None,
    )
    if chosen is None:
        raise RuntimeError(f"AnimeNoSub {audio} episode {provider_number} not found")
    streams = await scrape_embeds(chosen["epUrl"])
    if audio != "all":
        filtered = [s for s in streams if not s.get("audio") or s["audio"] == audio]
        if filtered:
            streams = filtered
    if not streams:
        raise RuntimeError(f"AnimeNoSub has no embeds for episode {provider_number}")
    return streams
