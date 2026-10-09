"""Manual-only Megavid embed adapter.

Uses Megavid's documented AniList iframe route. Its optional JSON API is not
used because the docs describe origin restrictions; the iframe owns extraction
and playback. Auto racing excludes this adapter until real playback is proven.
"""
from __future__ import annotations

from src.providers._match import episode_meta, expected_count
from src.providers._media import build_ctx

NAME = "megavid"
BASE = "https://megavid.buzz"


def _episodes_by_audio(anilist_id: int, ctx: dict) -> dict:
    media = ctx.get("media") or {}
    count = expected_count(media, ctx.get("anizip"))
    categories = {"sub": [], "dub": []}
    # No public catalogue endpoint is assumed here. Use only the count already
    # supplied by AniList/AniZip; a missing count does not prevent direct watch.
    if not isinstance(count, int) or count < 1:
        return categories

    for number in range(1, min(count, 1000) + 1):
        info = episode_meta(number, ctx)
        item = {
            "number": number,
            "title": info.get("title") or f"Episode {number}",
            "duration": info.get("duration"),
            "filler": info.get("filler", False),
            "uncensored": info.get("uncensored", False),
            "description": info.get("description"),
            "image": info.get("image"),
            "airDate": info.get("airDate"),
            "sourceNumber": number,
        }
        for audio in ("sub", "dub"):
            categories[audio].append({
                "id": f"watch/{NAME}/{anilist_id}/{audio}/{NAME}-{number}",
                **item,
                "audio": audio,
            })
    return categories


async def get_episodes(anilist_id: int, ctx: dict | None = None) -> dict:
    ctx = ctx or {}
    if not ctx:
        ctx = await build_ctx(int(anilist_id))
    media = ctx.get("media") or {}
    return {
        "meta": {
            "id": str(anilist_id),
            "title": ((media.get("title") or {}).get("english")
                      or (media.get("title") or {}).get("romaji")
                      or f"Megavid {anilist_id}"),
            "source": NAME,
            "numbering": "absolute",
            "episodeOffset": 0,
        },
        "episodes": _episodes_by_audio(int(anilist_id), ctx),
    }


async def watch(anilist_id: int, audio: str, ep: int, ctx: dict | None = None) -> list:
    if audio not in ("sub", "dub", "all"):
        raise RuntimeError(f"Megavid audio mode is unsupported: {audio}")
    episode = int(ep)
    anime_id = int(anilist_id)
    if anime_id < 1 or episode < 1:
        raise RuntimeError("Megavid requires positive AniList and episode IDs.")

    tracks = ("sub", "dub") if audio == "all" else (audio,)
    return [{
        "url": f"{BASE}/ani/{anime_id}/{episode}/{track}",
        "type": "embed",
        "server": "Megavid",
        "upstream": NAME,
        "audio": track,
        "referer": BASE + "/",
    } for track in tracks]
