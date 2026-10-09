"""Independent embed-first adapter for the public AnimeNoSub episode pages.

The adapter parses the page markup with Python's standard HTMLParser rather
than importing or porting another repository's scraper implementation.
Availability varies by title, language and upstream server.
"""
from __future__ import annotations

import asyncio
import base64
import re
from html.parser import HTMLParser
from urllib.parse import quote, urlencode, urljoin, urlsplit

import httpx

from src.providers import _cache
from src.providers._http import fetch_text
from src.providers._match import (
    build_titles,
    decode_entities,
    episode_meta,
    expected_count,
    find_top_slugs,
    get_prequel_offset,
    select_series,
)
from src.providers._media import build_ctx

NAME = "animenosub"
BASE = "https://animenosub.to"
USER_AGENT = (
    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
)
_VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}


class _Node:
    __slots__ = ("tag", "attrs", "parent", "children", "text")

    def __init__(self, tag: str, attrs: dict[str, str | None], parent: "_Node | None" = None):
        self.tag = tag.lower()
        self.attrs = attrs
        self.parent = parent
        self.children: list[_Node] = []
        self.text: list[str] = []


class _TreeParser(HTMLParser):
    """Small tolerant HTML tree for the limited fields this adapter needs."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = _Node("#document", {})
        self.stack = [self.root]

    def handle_starttag(self, tag: str, attrs):
        node = _Node(tag, dict(attrs), self.stack[-1])
        self.stack[-1].children.append(node)
        if tag.lower() not in _VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag: str, attrs):
        node = _Node(tag, dict(attrs), self.stack[-1])
        self.stack[-1].children.append(node)

    def handle_endtag(self, tag: str):
        name = tag.lower()
        for position in range(len(self.stack) - 1, 0, -1):
            if self.stack[position].tag == name:
                del self.stack[position:]
                return

    def handle_data(self, data: str):
        self.stack[-1].text.append(data)


def _parse_html(markup: str) -> _Node:
    parser = _TreeParser()
    parser.feed(markup or "")
    parser.close()
    return parser.root


def _walk(node: _Node):
    for child in node.children:
        yield child
        yield from _walk(child)


def _class_tokens(node: _Node) -> set[str]:
    return set((node.attrs.get("class") or "").split())


def _has_class(node: _Node, class_name: str) -> bool:
    return class_name in _class_tokens(node)


def _text(node: _Node) -> str:
    return " ".join(
        part.strip()
        for item in (node, *_walk(node))
        for part in item.text
        if part.strip()
    )


def _first(node: _Node, predicate):
    return next((child for child in _walk(node) if predicate(child)), None)


def _absolute_http_url(value: str, page_url: str) -> str | None:
    url = urljoin(page_url, decode_entities(value or "").strip())
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        return None
    return url


def _page_series_slug(url: str) -> str | None:
    parts = urlsplit(url)
    if parts.hostname not in {"animenosub.to", "www.animenosub.to"}:
        return None
    match = re.search(r"/anime/([^/?#]+)/?$", parts.path)
    return match.group(1) if match else None


async def search(query: str) -> list[dict]:
    form = urlencode({"action": "ts_ac_do_search", "ts_ac_query": query})
    headers = {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "Origin": BASE,
        "Referer": BASE + "/",
    }
    async with httpx.AsyncClient(timeout=18.0, follow_redirects=True) as client:
        response = await client.post(
            BASE + "/wp-admin/admin-ajax.php",
            content=form,
            headers=headers,
        )
    if not response.is_success:
        raise RuntimeError(f"AnimeNoSub search HTTP {response.status_code}")
    payload = response.json()
    collections = payload.get("anime") if isinstance(payload, dict) else None
    first_group = collections[0] if isinstance(collections, list) and collections else {}
    results = first_group.get("all") if isinstance(first_group, dict) else []
    output = []
    for item in results if isinstance(results, list) else []:
        if not isinstance(item, dict):
            continue
        link = str(item.get("post_link") or "")
        slug = _page_series_slug(link)
        if slug:
            output.append({
                "slug": slug,
                "text": decode_entities(str(item.get("post_title") or slug.replace("-", " "))),
            })
    return output


async def episode_catalogue(slug: str) -> list[dict]:
    url = f"{BASE}/anime/{quote(slug, safe='-')}/"
    markup = await fetch_text(url, {"Referer": BASE + "/"})
    root = _parse_html(markup)
    episodes = []
    seen = set()

    for item in _walk(root):
        if item.tag != "li" or item.attrs.get("data-index") is None:
            continue
        number_node = _first(item, lambda node: _has_class(node, "epl-num"))
        link_node = _first(item, lambda node: node.tag == "a" and bool(node.attrs.get("href")))
        if number_node is None or link_node is None:
            continue
        label = _text(number_node).strip()
        if label.lower() == "movie":
            number = 1
        else:
            match = re.search(r"\d+(?:\.\d+)?", label)
            if not match:
                continue
            number = int(float(match.group(0)))
        if number < 1 or number in seen:
            continue
        episode_url = _absolute_http_url(str(link_node.attrs.get("href") or ""), url)
        if not episode_url or not episode_url.startswith(BASE + "/"):
            continue

        all_classes = set()
        for node in (item, *_walk(item)):
            all_classes.update(_class_tokens(node))
        path = urlsplit(episode_url).path.lower()
        dub_only = slug.lower().endswith("-dub") or "-dub/" in path or path.endswith("-dub")
        sub_marker = "btn-subbed" in all_classes
        dub_marker = "btn-dubbed" in all_classes
        has_sub = sub_marker or (not dub_marker and not dub_only)
        has_dub = dub_marker or dub_only
        title_node = _first(item, lambda node: node.tag == "i" and _has_class(node, "anititle"))
        title = _text(title_node) if title_node else label

        seen.add(number)
        episodes.append({
            "number": number,
            "title": title or f"Episode {number}",
            "url": episode_url,
            "hasSub": has_sub,
            "hasDub": has_dub,
        })

    episodes.sort(key=lambda episode: episode["number"])
    return episodes


class _SourceScanner(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.sources: list[str] = []

    def handle_starttag(self, tag: str, attrs):
        values = dict(attrs)
        for key in ("src", "data-src"):
            value = values.get(key)
            if value:
                self.sources.append(value)

    def handle_startendtag(self, tag: str, attrs):
        self.handle_starttag(tag, attrs)


def _first_embedded_url(fragment: str) -> str | None:
    scanner = _SourceScanner()
    scanner.feed(fragment or "")
    scanner.close()
    return scanner.sources[0] if scanner.sources else None


async def source_options(episode_url: str) -> list[dict]:
    markup = await fetch_text(episode_url, {"Referer": BASE + "/"})
    root = _parse_html(markup)
    streams, seen = [], set()

    for option in (node for node in _walk(root) if node.tag == "option"):
        token = str(option.attrs.get("value") or "").strip()
        label = _text(option).strip()
        if not token or not label or "select video server" in label.lower():
            continue
        try:
            fragment = base64.b64decode(token + "=" * (-len(token) % 4), validate=False).decode("utf-8", "ignore")
        except Exception:
            continue
        raw_url = _first_embedded_url(fragment)
        target = _absolute_http_url(raw_url or "", episode_url)
        if not target or target in seen:
            continue
        seen.add(target)
        origin = _origin(target) or BASE + "/"
        streams.append({
            "url": target,
            "type": "embed",
            "server": label,
            "referer": origin,
            "audio": "dub" if "dub" in label.lower().split() else None,
            "priority": len(streams) + 1,
        })

    # Some episodes only expose a regular iframe; retain a small, explicit
    # allowlist rather than accepting every unrelated frame on the page.
    if not streams:
        for frame in (node for node in _walk(root) if node.tag == "iframe"):
            target = _absolute_http_url(
                str(frame.attrs.get("src") or frame.attrs.get("data-src") or ""),
                episode_url,
            )
            if not target:
                continue
            host = (urlsplit(target).hostname or "").lower()
            if not any(name in host for name in ("vidmoly", "streamtape", "filemoon", "upn.one")):
                continue
            streams.append({
                "url": target,
                "type": "embed",
                "server": "Direct embed",
                "referer": _origin(target) or BASE + "/",
                "priority": 1,
            })
            break

    return streams


def _origin(value: str) -> str | None:
    parsed = urlsplit(value)
    return f"{parsed.scheme}://{parsed.netloc}/" if parsed.scheme in ("http", "https") and parsed.netloc else None


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
        candidates, episode_catalogue, expected, media.get("status"), offset, min_score=0.58
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


def _numbered_episodes(anilist_id: int, series: dict, catalog: list[dict], ctx: dict, expected):
    categories = {"sub": [], "dub": []}
    for raw in catalog:
        source_number = raw["number"]
        number = source_number - series["offset"] if series["mode"] == "offset" else source_number
        if number < 1 or (expected and number > expected):
            continue
        info = episode_meta(number, ctx)
        metadata = {
            "number": number,
            "title": info.get("title") or raw.get("title") or f"Episode {number}",
            "duration": info.get("duration"),
            "filler": info.get("filler", False),
            "uncensored": info.get("uncensored", False),
            "description": info.get("description"),
            "image": info.get("image"),
            "airDate": info.get("airDate"),
            "sourceNumber": source_number,
        }
        for audio, enabled in (("sub", raw.get("hasSub")), ("dub", raw.get("hasDub"))):
            if enabled:
                categories[audio].append({
                    "id": f"watch/{NAME}/{anilist_id}/{audio}/{NAME}-{number}",
                    **metadata,
                    "audio": audio,
                })
    return categories


async def get_episodes(anilist_id: int, ctx: dict | None = None) -> dict:
    ctx = ctx or await build_ctx(anilist_id)
    media = ctx.get("media") or {}
    series = await resolve_series(anilist_id, ctx)
    catalog = await episode_catalogue(series["slug"])
    return {
        "meta": {
            "id": series["slug"],
            "title": series["title"],
            "source": NAME,
            "matchScore": round(float(series.get("score") or 0), 3),
            "numbering": series["mode"],
            "episodeOffset": series["offset"] if series["mode"] == "offset" else 0,
        },
        "episodes": _numbered_episodes(
            anilist_id, series, catalog, ctx, expected_count(media, ctx.get("anizip"))
        ),
    }


async def watch(anilist_id: int, audio: str, ep: int, ctx: dict | None = None) -> list:
    if audio not in ("sub", "dub", "all"):
        raise RuntimeError(f"AnimeNoSub audio mode is unsupported: {audio}")
    ctx = ctx or await build_ctx(anilist_id)
    series = await resolve_series(anilist_id, ctx)
    provider_number = int(ep) + series["offset"] if series["mode"] == "offset" else int(ep)
    catalog = await episode_catalogue(series["slug"])
    selected = next(
        (item for item in catalog if item["number"] == provider_number and
         (audio == "all" or item.get("hasDub" if audio == "dub" else "hasSub"))),
        None,
    )
    if selected is None:
        raise RuntimeError(f"AnimeNoSub has no {audio} episode {provider_number}")
    streams = await source_options(selected["url"])
    if audio != "all":
        matching = [item for item in streams if not item.get("audio") or item["audio"] == audio]
        if matching:
            streams = matching
    if not streams:
        raise RuntimeError(f"AnimeNoSub returned no video servers for episode {provider_number}")
    return streams
