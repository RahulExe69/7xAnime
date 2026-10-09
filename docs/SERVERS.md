# 7xAnime playback server guide

The player displays anonymous labels such as **Server1**, **Server2**, and **Server3**. These are stable display labels for the providers returned by the API, not provider names.

## Kuhi provider mapping

The Android APK bundles a pinned snapshot of [Kuhi's anime API](https://github.com/aryaniiil/anime-api). The provider ranking in that snapshot is:

| Kuhi rank | API provider key | Display name | Provider site |
|---:|---|---|---|
| 1 | `anineko` | AniNeko | https://anineko.to |
| 2 | `anizone` | AniZone | https://anizone.to |
| 3 | `anikoto` | AniKoto | https://anikototv.to |
| 4 | `reanime` | ReAnime | https://reanime.to |
| 5 | `aniwaves` | AniWaves | https://aniwaves.ru |
| 6 | `kaa` | KAA | https://kaa.lt |
| 7 | `anibd` | AniBD | https://epeng.animeapps.top |
| 8 | `animegg` | AnimeGG | https://www.animegg.org |
| 9 | `mkissa` | MKissa | https://mkissa.to |
| 10 | `animeonsen` | AnimeOnsen | https://www.animeonsen.xyz |

**How Server numbers work:** API providers are returned in Kuhi's ranking order with providers that have no episodes for the selected anime omitted. The UI labels the returned list Server1, Server2, … in that order. That means Server2 on one anime can be a different provider from Server2 on another series. Sub/Dub availability may differ. Long-press or focus a server button to see the exact provider name and site in its tooltip/accessibility label.

The frontend mapping is in `src/lib/server-map.ts`. The authoritative ranking is `src/providers/_race.py` from the pinned source revision declared in `.github/scripts/fetch-kuhi-backend.sh`.

## Fallback player

If primary stream extraction fails or produces no playable source, the UI can activate MegaPlay's fallback endpoint:

`https://megaplay.buzz/stream/ani/{anilistId}/{episodeNumber}/{sub-or-dub}`

The legacy iframe progress listener also recognises MegaCloud messages. Fallback playback is separate from the numbered Kuhi provider list; the UI calls it **Fallback player · MegaPlay**.

## Updating this guide

If the bundled Kuhi snapshot changes, compare its `src/providers/_race.py` `RANKING` list to `KUHI_PROVIDER_ORDER` in `src/lib/server-map.ts` and update the table. Verify the displayed labels against `/episodes/{anilistId}.providers` for an anime with several sources and one with missing providers.
