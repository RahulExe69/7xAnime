# 7xAnime playback server guide

**Server 1 is the dedicated MegaPlay iframe route.** It is the first manual server choice and is also the recovery player when native extraction returns no source. AniXo and Megavid are additional direct-embed options; they are manual-only until real playback is observed, so Auto never treats a constructed embed URL as a winning stream.

## Numbered server labels

The embedded provider list starts with Kuhi’s ten Python adapters and appends three separately authored adapters: AnimeNoSub, AniXo, and Megavid. AnimeNoSub may discover iframe hosts; AniXo and Megavid generate documented embed routes and are excluded from Auto's race. The numbered order used by the app is:

| Local rank | API provider key | Display name | Provider site |
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
| 11 | `animenosub` | AnimeNoSub (extra adapter) | https://animenosub.to |
| 12 | `anixo` | AniXo (manual embed; not raced by Auto) | https://anixo.buzz |
| 13 | `megavid` | Megavid (manual embed; not raced by Auto) | https://megavid.buzz |

For Sub/Dub, the UI filters providers by the selected audio type and media formats the player can use. The visible provider labels start at **Server 2** because Server 1 is reserved for MegaPlay. AniXo and Megavid are manually selectable iframe endpoints; a route response is not playback proof, and these two are deliberately excluded from Auto. A provider can be loaded but still have no stream for a particular anime/episode; diagnostics distinguish module-load, route/stream extraction, and observed player events. Manual selections are strict: selecting one provider never silently returns another provider's stream. Auto is the only cross-provider race. The same server number may refer to a different provider if the compatible provider set changes.

## Hindi dub catalogue

The Hindi button uses the community project [ZeroTwo-Py/anime-api](https://github.com/ZeroTwo-Py/anime-api), which documents search at `/api/search?s={title}&page=1` and embedded stream results at `/api/stream?id={slug}&season={season}&ep={episode}`. The APK calls the catalogue through fixed, token-protected local routes; the web build calls its public API endpoint directly. Stream results are third-party embeds, not a direct stream guaranteed to work on every device.

While Hindi mode is active, its first available Hindi embed is **Server 1**, followed by Server 2, Server 3, etc. Hindi mode has its own server list, so these numbers refer only to the Hindi embeds. When you return to SUB/ENGLISH, Server 1 is MegaPlay again and the upstream providers start at Server 2.

Hindi titles and episodes are not available in that catalogue for every series. A missing title/episode, blocked embed, or provider outage is reported in the player; regular Sub/Dub and Server 1 remain available. No reliable Urdu-specific episode/stream endpoint was verified during this research, so the app does not label any source as Urdu.

## Fallback URL

Server 1 currently opens:

`https://megaplay.buzz/stream/ani/{anilistId}/{episodeNumber}/{sub-or-dub}`

The iframe progress listener also recognises messages from MegaCloud. The pinned Kuhi provider order originates in `src/providers/_race.py` from the source revision declared in `.github/scripts/fetch-kuhi-backend.sh`; the Android packaging script appends AnimeNoSub, AniXo, and Megavid. Frontend labels/audio-format capability metadata are kept in `src/lib/server-map.ts`.

## Updating the map

When updating the bundled Kuhi revision, compare its `src/providers/_race.py` `RANKING` list with `KUHI_PROVIDER_ORDER` in `src/lib/server-map.ts`, then test a series with many providers and one with partial provider availability.
