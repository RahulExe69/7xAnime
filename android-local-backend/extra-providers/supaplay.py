"""Manual-only SupaPlay iframe adapter.

Uses SupaPlay's documented AniList-ID embed route. The iframe owns stream
selection and playback; a generic "dub" route is not evidence of Hindi audio.
No scraping or direct-stream extraction is performed here.
"""
from __future__ import annotations

from src.providers._match import episode_meta, expected_count
from src.providers._media import build_ctx

NAME = "supaplay"
BASE = "https://supaplay.fun"


def _episodes_by_audio(anilist_id: int, ctx: dict) -> dict:
    media = ctx.get("media") or {}
    count = expected_count(media, ctx.get("anizip"))
    categories = {"sub": [], "dub": []}
    # SupaPlay exposes an AniList-ID route but does not publish a catalogue
    # endpoint in this adapter's contract. Use the known episode count only.
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
                      or f"SupaPlay {anilist_id}"),
            "source": NAME,
            "numbering": "absolute",
            "episodeOffset": 0,
        },
        "episodes": _episodes_by_audio(int(anilist_id), ctx),
    }


async def watch(anilist_id: int, audio: str, ep: int, ctx: dict | None = None) -> list:
    if audio not in ("sub", "dub", "all"):
        raise RuntimeError(f"SupaPlay audio mode is unsupported: {audio}")
    anime_id = int(anilist_id)
    episode = int(ep)
    if anime_id < 1 or episode < 1:
        raise RuntimeError("SupaPlay requires positive AniList and episode IDs.")

    tracks = ("sub", "dub") if audio == "all" else (audio,)
    return [{
        "url": f"{BASE}/stream/ani/{anime_id}/{episode}/{track}",
        "type": "embed",
        "server": "SupaPlay",
        "upstream": NAME,
        "audio": track,
        "referer": BASE + "/",
    } for track in tracks]
