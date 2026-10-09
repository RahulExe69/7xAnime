# 7xAnime playback server guide

**Server1 is always the MegaPlay fallback player.** It is the first option on the watch screen and remains available when the primary provider list is empty or a stream fails.

## Numbered server labels

The bundled Kuhi API uses these provider keys and ranking order:

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

For Sub/Dub, providers are returned in this ranking order, but providers with no matching episodes for that anime are omitted. The visible labels start at **Server2** because Server1 is reserved for the fallback. The same number can refer to a different upstream provider on a different series. Focus or long-press the numbered provider button to reveal its current provider name and site.

## Hindi dub catalogue

The Hindi button uses the community project [ZeroTwo-Py/anime-api](https://github.com/ZeroTwo-Py/anime-api), which documents search at `/api/search?s={title}&page=1` and embedded stream results at `/api/stream?id={slug}&season={season}&ep={episode}`. The APK calls the catalogue through fixed, token-protected local routes; the web build calls its public API endpoint directly. Stream results are third-party embeds, not a direct stream guaranteed to work on every device.

While Hindi mode is active, its first available embed is **Server2**, followed by additional embeds as Server3, Server4, etc. This numbering is for the selected Hindi mode; it does not assert that Server2 is the same provider as Server2 in the Sub/Dub list.

Hindi titles and episodes are not available in that catalogue for every series. A missing title/episode, blocked embed, or provider outage is reported in the player; regular Sub/Dub and Server1 remain available. No reliable Urdu-specific episode/stream endpoint was verified during this research, so the app does not label any source as Urdu.

## Fallback URL

Server1 currently opens:

`https://megaplay.buzz/stream/ani/{anilistId}/{episodeNumber}/{sub-or-dub}`

The iframe progress listener also recognises messages from MegaCloud. The pinned Kuhi provider order is defined by `src/providers/_race.py` in the source revision declared in `.github/scripts/fetch-kuhi-backend.sh`. Frontend labels and metadata are kept in `src/lib/server-map.ts`.

## Updating the map

When updating the bundled Kuhi revision, compare its `src/providers/_race.py` `RANKING` list with `KUHI_PROVIDER_ORDER` in `src/lib/server-map.ts`, then test a series with many providers and one with partial provider availability.
