# 7xAnime playback server guide

**Server 1 remains MegaPlay**, followed by manually selectable AniXo, Megavid, AnimeParadise, MegaFlix, TryEmbed, CinexStream, and NontonGo. MegaPlay, AniXo and Megavid are user-reported working on a tested title; the remaining manual routes still need real-device verification. Other Kuhi adapters remain parked. Auto excludes these manual-only choices.

## New manual test servers

- **AnimeParadise** — independent candidate using its documented JSON catalog and signed HLS stream endpoint. It is manual-only initially; selecting it triggers matching/resolution so the app does not scrape its API for every anime page. Sub only is exposed because the documented adapter supports subbed episodes.
- **Yomi-derived routes** — the four manual URL adapters use the route patterns documented in [Wabsa-kh/yomi-anime-api](https://github.com/Wabsa-kh/yomi-anime-api): MegaFlix `/stream/ani/{AniListID}/{episode}/{sub|dub}`, TryEmbed `/embed/anime/{AniListID}/{episode}/{sub|dub}`, CinexStream `/api/embed/anime/{sub|dub}/{AniListID}/{episode}?color=7c6ee0`, and NontonGo `/anime/{AniListID}/{episode}/play`. These routes construct embeds; they are not proof of independently verified streams. NontonGo is sub-only.

- **Shared Android ad filtering** — every configured embedded provider uses the same WebView interception layer and maintained filter lists; this is not restricted to Megavid. Provider-owned first-party ads and cosmetic HTML overlays can still evade request-level filtering.

All four Yomi-derived routes and AnimeParadise are held out of automatic provider racing until real Android playback is verified. A module-loaded diagnostic only proves the Python adapter imported; it does not guarantee that a title or episode plays.

## Numbered server labels

The Android package still contains legacy adapter code, but the app exposes only the seven allowlisted manual selections below after Server 1. AnimeParadise is resolved only after explicit selection to avoid unnecessary searches; its HLS/signed-link flow still requires a phone playback check. Other Kuhi adapters are disabled at the app/backend allowlist and must not be contacted by episode discovery or playback. The active server map is:

| Local rank | API provider key | Display name | Provider site |
|---:|---|---|---|
| 1 | `megaplay` | MegaPlay (dedicated iframe) | https://megaplay.buzz |
| 2 | `anixo` | AniXo (manual embed) | https://anixo.buzz |
| 3 | `megavid` | Megavid (manual embed) | https://megavid.buzz |
| 4 | `animeparadise` | AnimeParadise (manual HLS) | https://animeparadise.moe |
| 5 | `megaflix` | MegaFlix (manual embed) | https://www.megaflix.buzz |
| 6 | `tryembed` | TryEmbed (manual embed) | https://tryembed.us.cc |
| 7 | `cinexstream` | CinexStream (manual embed) | https://cinextream.cc |
| 8 | `nontongo` | NontonGo (sub-only manual embed) | https://nontongo.win |

For Sub/Dub, the UI filters providers by the selected audio type and media formats the player can use. The visible provider labels start at **Server 2** because Server 1 is reserved for MegaPlay. AniXo, Megavid, MegaFlix, TryEmbed, CinexStream, and NontonGo are manually selectable iframe endpoints; AnimeParadise returns HLS but stays manual-only during verification. A route response is not playback proof, and all seven choices after MegaPlay are deliberately excluded from Auto. A provider can be loaded but still have no stream for a particular anime/episode; diagnostics distinguish module-load, route/stream extraction, and observed player events. Server choices remain visible after failures; a detected request/player failure marks the choice for retry and advances to the next configured server, finally falling back to MegaPlay after the candidates are exhausted. A same-origin/cross-origin HTML ad overlay may not emit a failure signal, so it cannot always trigger automatic switching. Auto is not a parallel race over the manual iframe choices; it moves through the configured candidates sequentially and uses MegaPlay as final fallback. The same server number may refer to a different provider if the compatible provider set changes.

## Hindi dub catalogue

The Hindi button uses the community project [ZeroTwo-Py/anime-api](https://github.com/ZeroTwo-Py/anime-api), which documents search at `/api/search?s={title}&page=1` and embedded stream results at `/api/stream?id={slug}&season={season}&ep={episode}`. The APK calls the catalogue through fixed, token-protected local routes; the web build calls its public API endpoint directly. Stream results are third-party embeds, not a direct stream guaranteed to work on every device.

While Hindi mode is active, its first available Hindi embed is **Server 1**, followed by Server 2, Server 3, etc. Hindi mode has its own server list, so these numbers refer only to the Hindi embeds. When you return to SUB/ENGLISH, Server 1 is MegaPlay again and the upstream providers start at Server 2.

Hindi titles and episodes are not available in that catalogue for every series. A missing title/episode, blocked embed, or provider outage is reported in the player; regular Sub/Dub and Server 1 remain available. No reliable Urdu-specific episode/stream endpoint was verified during this research, so the app does not label any source as Urdu.

## Fallback URL

Server 1 currently opens:

`https://megaplay.buzz/stream/ani/{anilistId}/{episodeNumber}/{sub-or-dub}`

The iframe progress listener also recognises messages from MegaCloud. Kuhi's pinned source remains in the repository for later research, but it is currently parked: local diagnostics and watch routes allow only AniXo, Megavid, AnimeParadise, MegaFlix, TryEmbed, CinexStream, and NontonGo; background episode discovery skips AnimeParadise until a user selects it. Frontend labels/audio-format capability metadata are kept in `src/lib/server-map.ts`.

## Updating the map

When updating the bundled Kuhi revision, compare its `src/providers/_race.py` `RANKING` list with `KUHI_PROVIDER_ORDER` in `src/lib/server-map.ts`, then test a series with many providers and one with partial provider availability.


## Player UX and ad filtering

Android uses a conservative known-ad-domain request filter, blocks pop-up windows and remote JS alert/confirm/prompt dialogs, and keeps external top-level navigation blocked. It cannot reliably remove HTML overlays served by the provider itself. The player viewport provides native fullscreen/landscape, app-owned swipe gestures and double-tap ±10-second seeking for the app-owned ArtPlayer player; cross-origin embeds may retain provider-owned gesture behaviour. See [PLAYER-MARATHON.md](PLAYER-MARATHON.md) for scope and physical-device test checklist.
