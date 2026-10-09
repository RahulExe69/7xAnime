# Streaming provider/API research

**Audit date:** 2026-10-09  
**Scope:** The eight entries supplied in the Gemini prompt, plus overlap with 7xAnime's bundled Kuhi providers.  
**Meaning of “functional”:** repository source/build status, project-maintainer statements, and documented routes. A working repository or imported module does **not** prove a particular stream endpoint works for a given episode. Live provider reachability changes frequently; endpoint probes that did not produce a response are explicitly marked *unverified* rather than being called down or up.

## Findings at a glance

| Entry | What it actually is | Capabilities beyond anime | Current evidence | Decision for 7xAnime |
|---|---|---|---|---|
| [amvstrm-ani-api](https://github.com/saurabhgangule/amvstrm-ani-api) | Node REST API using AniList + Gogoanime, with Consumet-backed info/video fallback | No general TMDB movie/TV catalogue or manga-reader API; “movies” routes are Gogoanime anime films | Source and official docs are present. Official base URL is documented as https://api.amvstr.me, but the health/read attempt in this audit returned a gateway error, so live availability is **unverified**. Source is GPL-3.0. | Candidate for a thin HTTP adapter only after endpoint health and response schemas are verified. Do not port its scraper implementation into the app; it overlaps the Consumet/Gogoanime route. |
| [Streambert](https://github.com/truelockmc/streambert) (the penniger/streambert link resolves to the same project) | GPL-3.0 Electron desktop app, not a provider API | **Yes:** live-action movies and TV series, as well as anime. TMDB supplies search/catalog/art/text metadata; videos come from third-party sources. | README describes VidSrc as the main video source, with Videasy and 2Embed alternatives. Anime uses AniList metadata and a separate scraping path. This is a project description, not a live playback test. | Do not register Streambert as one server. Treat its distinct source adapters as separate future integrations only after testing and license review. A movie/TV catalog would be a separate product scope from the current anime watch page. |
| [Seanime](https://github.com/5rahim/seanime) | GPL-3.0 self-hosted media server, web UI and desktop/mobile clients with an extension marketplace | **Yes:** local media, anime streaming via extensions, and manga reading via extensions/local library | The repository publishes release v3.10.3 dated 2026-09-20. Its README explicitly describes extension-based online streaming and manga sources. | Not a drop-in scraper/API. A future adapter should connect to a **user-configured Seanime server** or use the extension interface; do not bundle the entire server into the Android APK. |
| [Consumet API](https://github.com/consumet/api) / the supplied generic https://github.com link | Multi-source API framework; the generic URL in the prompt is not a repository URL | **Yes:** its documentation describes information/source APIs for anime, movies and books; supported coverage depends on installed extensions | The specific official repository could not be read through the repository connector during this audit. The accessible [fork supplied again as “AniProject”](https://github.com/solo12345689/api.consumet.org) explicitly states the public API is no longer available and self-hosting is required. Fork uses GPL-3.0. | Treat the two prompt entries as **one integration**, not two. Build a configurable HTTP client for a self-hosted instance only; never point the APK at an assumed public instance. |
| “anime-website (AniProject)” — [same supplied repository](https://github.com/solo12345689/api.consumet.org) | Same Consumet API fork above, not a distinct provider project | Same as Consumet: content breadth depends on installed providers | Same repository URL and README. No second independent codebase or provider is established by the prompt. | Deduplicate. No separate provider module. |
| [Anify](https://github.com/Eltik/Anify) | Bun/Node full-stack application with a mapping/data backend, frontend and supporting services | **Yes:** anime, manga and light novels | The maintainer's README says the project is no longer maintained because its proxy acquisition method stopped working; mapping/storage logic may still be useful. Root README was available, but no root LICENSE file was found in this audit. | Do **not** count as a working streaming source. Mapping ideas are useful, but no direct adapter until a maintainer-confirmed working source endpoint and reuse license are established. |
| [ani-cli](https://github.com/pystardust/ani-cli) | GPL-3.0 shell CLI, not an HTTP API | Anime only | Its current release page lists v5.1 (2026-09-11); the current README says it scrapes HiAnime. Release notes warn that iOS playback is broken and mention another provider change. | Do not launch the shell script from Android or treat it as an API. A future independent HiAnime adapter would need its own HTTP/parser implementation and real response tests; expect frequent upstream breakage. |
| [Anivault-Scraper](https://github.com/SH0MIK/Anivault-Scraper) | Node/Express TypeScript REST API with episode/server/watch and HLS/subtitle/video proxy routes | **Metadata only:** TMDB and Kitsu are used for anime artwork; this does not make it a live-action movie/TV streaming source. | README calls AnimeHeaven and Anikoto its verified streaming sources and documents proxying, MP4 ranges and subtitle conversion. Its API is designed to be hosted with the AniVault stack; no independently verified public API base was found. No root LICENSE file was found in this audit. | Potential source of an **AnimeHeaven** adapter if a reachable deployment and reuse terms are confirmed. Anikoto duplicates an existing Kuhi source. Prefer calling a user-hosted API through a configured base URL; do not copy unlicensed scraper code. |

## Overlap and duplication rules

1. **Consumet and amvstrm are not two independent new scraper fleets.** amvstrm uses Gogoanime and documents Consumet as an info/video fallback. Keep a single adapter per actual upstream source and use the other API only as fallback metadata/source resolution.
2. **“API.consumet.org” and “AniProject” in the supplied list point to the same repository URL.** They must not produce two picker entries.
3. **Streambert is a client app, not a server.** VidSrc, Videasy and 2Embed are individual upstream source families. They can overlap across other scrapers and should be deduplicated by normalized source URL/provider identity, not by repository name.
4. **Anivault overlaps Kuhi's Anikoto adapter.** If its API becomes available, prioritize its distinct AnimeHeaven route rather than duplicating Anikoto as a second number.
5. **Anify is a multi-service app, and ani-cli is a CLI.** Neither is another HTTP source API that can be dropped into the current race without creating an adapter/runtime layer.

## Recommended adapter/racing architecture

- Keep **one file per source integration**, with a small common contract: get_episodes(anilist_id, context) and watch(anilist_id, audio, episode, context). Each adapter returns normalized stream records with url, type (hls, mp4, embed, or dash), referer/headers, server name, subtitle tracks, and optional skip intervals.
- The registry should include a provider only if its code imports **and** its required external endpoint is configured. An optional/self-hosted integration must not appear as a healthy source just because a Python module exists.
- **Auto** can race eligible sources with per-source timeouts and a short early-winner grace period. A **manual** server choice must stay strict and must not silently return a different provider's stream.
- Record stream-request outcome separately from actual player playback. “Module loaded”, “stream URL returned”, and “video actually played” are three different states. Cache outcomes by anime ID + episode + audio + provider and expire them; failure on one episode must not permanently blacklist a source.
- Filter formats to what the player supports. Do not expose DASH-only results until a DASH engine is implemented. Embed-only results must preserve the provider's frame requirements.
- Configure external aggregators with an explicit base URL (and user-owned/self-hosted endpoint where required). Do not hard-code a guessed public deployment, copy GPL source without complying with its terms, or copy scraper source where the repository provides no license.

## Work already started in the current PR

- The bundled local runtime currently starts from Kuhi's ten native Python adapters and adds one separate AnimeNoSub adapter; the smoke test requires all eleven to import.
- The player retries alternate streams returned by one selected provider, preserves each stream's own referer/header hints, and reports player errors separately from extraction results.
- A native Android WebView navigation guard blocks external top-level redirects while allowing in-frame player navigation; the Android iframe sandbox attribute is removed for the local Android playback path.
- Failed provider buttons are hidden for the current anime/episode/audio after a request or playback failure, with a small **Retry failed** control. This does not use a provider's global “recent fail” counter to hide sources for unrelated episodes.
- Latest CI checks for the existing provider/runtime path must remain green before merging. Live website/provider playback still requires on-device verification.

## References checked

- amvstrm API docs: https://docs.amvstr.me/api/introduction
- Seanime releases: https://github.com/5rahim/seanime/releases
- Consumet fork README / self-hosting note: https://github.com/solo12345689/api.consumet.org
- ani-cli releases: https://github.com/pystardust/ani-cli/releases
- Anivault API routes and source claims: https://github.com/SH0MIK/Anivault-Scraper
