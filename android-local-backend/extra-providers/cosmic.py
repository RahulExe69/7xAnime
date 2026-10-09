"""Manual-only Cosmic player adapter.

Cosmic is a player/embed wrapper, not a confirmed independent stream provider:
its documented example identifies MegaPlay as the upstream source.
"""
from __future__ import annotations

from src.providers._match import episode_meta, expected_count
from src.providers._media import build_ctx

NAME = "cosmic"
BASE = "https://cosmic-api-azure.vercel.app"


def _episodes_by_audio(anilist_id: int, ctx: dict) -> dict:
    media = ctx.get("media") or {}
    count = expected_count(media, ctx.get("anizip"))
    categories = {"sub": [], "dub": []}
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
    ctx = ctx or await build_ctx(int(anilist_id))
    media = ctx.get("media") or {}
    title = (
        (media.get("title") or {}).get("english")
        or (media.get("title") or {}).get("romaji")
        or f"Anime {anilist_id}"
    )
    return {
        "meta": {
            "id": str(anilist_id),
            "title": str(title),
            "source": NAME,
            "numbering": "absolute",
            "episodeOffset": 0,
        },
        "episodes": _episodes_by_audio(int(anilist_id), ctx),
    }


async def watch(anilist_id: int, audio: str, ep: int, ctx: dict | None = None) -> list:
    if audio not in ("sub", "dub", "all"):
        raise RuntimeError(f"Cosmic audio mode is unsupported: {audio}")
    anime_id = int(anilist_id)
    episode = int(ep)
    if anime_id < 1 or episode < 1:
        raise RuntimeError("Cosmic requires positive AniList and episode IDs")

    # The embed merges SUB/DUB into one Vidstack UI. Audio selection is inside
    # Cosmic's player; the 7xAnime category is retained for its labels/progress.
    return [{
        "url": f"{BASE}/embeds/{anime_id}/{episode}",
        "type": "embed",
        "server": "Cosmic Player",
        "upstream": NAME,
        "audio": audio if audio != "all" else "sub",
        "referer": BASE + "/",
    }]
