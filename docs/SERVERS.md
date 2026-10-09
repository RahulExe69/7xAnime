# 7xAnime playback server guide

**Active servers are limited to three known-working choices:** Server 1 is MegaPlay, followed by AniXo and Megavid. The screenshot/device test confirms these three can play. Kuhi's native adapters and the other researched APIs are parked and are not queried; re-enable or integrate them only when explicitly requested. Auto no longer races the inactive providers.

## New manual test servers

- **AnimeParadise** — independent candidate using its documented JSON catalog and signed HLS stream endpoint. It is manual-only initially; selecting it triggers matching/resolution so the app does not scrape its API for every anime page. Sub only is exposed because the documented adapter supports subbed episodes.
- **Cosmic Player** — opens Cosmic's custom embedded Vidstack player to compare the player interface with Server 1. Cosmic's documented API sample identifies **MegaPlay** as its stream source, so this is a player comparison, not a new independent provider. The deployed embed host may vary or be unavailable; verify on-device.
- **Megavid warning** — its third-party embed sometimes displays a deceptive “Click Allow” / robot-check card. Do not tap Allow or grant notification permissions. Because the overlay is inside a cross-origin iframe, the app cannot safely remove it from the parent document. Switch to MegaPlay or AniXo if it appears.

Both new choices are held out of automatic provider racing until real Android playback is verified. A module-loaded diagnostic only proves the Python adapter imported; it does not guarantee that a title or episode plays.

## Numbered server labels

The Android package still contains legacy adapter code, but the app exposes only AniXo and Megavid as Server 2 and Server 3. MegaPlay is Server 1. The other eleven adapters are disabled at the app/backend allowlist and must not be contacted by episode discovery or playback. The active server map is:

| Local rank | API provider key | Display name | Provider site |
|---:|---|---|---|
| 1 | `megaplay` | MegaPlay (dedicated iframe) | https://megaplay.buzz |
| 2 | `anixo` | AniXo (manual embed) | https://anixo.buzz |
| 3 | `megavid` | Megavid (manual embed) | https://megavid.buzz |

For Sub/Dub, the UI filters providers by the selected audio type and media formats the player can use. The visible provider labels start at **Server 2** because Server 1 is reserved for MegaPlay. AniXo and Megavid are manually selectable iframe endpoints; a route response is not playback proof, and these two are deliberately excluded from Auto. A provider can be loaded but still have no stream for a particular anime/episode; diagnostics distinguish module-load, route/stream extraction, and observed player events. Manual selections are strict: selecting one provider never silently returns another provider's stream. Auto is the only cross-provider race. The same server number may refer to a different provider if the compatible provider set changes.

## Hindi dub catalogue

The Hindi button uses the community project [ZeroTwo-Py/anime-api](https://github.com/ZeroTwo-Py/anime-api), which documents search at `/api/search?s={title}&page=1` and embedded stream results at `/api/stream?id={slug}&season={season}&ep={episode}`. The APK calls the catalogue through fixed, token-protected local routes; the web build calls its public API endpoint directly. Stream results are third-party embeds, not a direct stream guaranteed to work on every device.

While Hindi mode is active, its first available Hindi embed is **Server 1**, followed by Server 2, Server 3, etc. Hindi mode has its own server list, so these numbers refer only to the Hindi embeds. When you return to SUB/ENGLISH, Server 1 is MegaPlay again and the upstream providers start at Server 2.

Hindi titles and episodes are not available in that catalogue for every series. A missing title/episode, blocked embed, or provider outage is reported in the player; regular Sub/Dub and Server 1 remain available. No reliable Urdu-specific episode/stream endpoint was verified during this research, so the app does not label any source as Urdu.

## Fallback URL

Server 1 currently opens:

`https://megaplay.buzz/stream/ani/{anilistId}/{episodeNumber}/{sub-or-dub}`

The iframe progress listener also recognises messages from MegaCloud. Kuhi's pinned source remains in the repository for later research, but it is currently parked: local episode discovery, diagnostics, and watch routes only allow AniXo and Megavid. Frontend labels/audio-format capability metadata are kept in `src/lib/server-map.ts`.

## Updating the map

When updating the bundled Kuhi revision, compare its `src/providers/_race.py` `RANKING` list with `KUHI_PROVIDER_ORDER` in `src/lib/server-map.ts`, then test a series with many providers and one with partial provider availability.
