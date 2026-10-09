# Streaming provider/API research

**Audit date:** 2026-10-09  
**Scope:** The eight entries supplied in the Gemini prompt, plus overlap with 7xAnime's bundled Kuhi providers.  
**Meaning of “functional”:** repository source/build status, project-maintainer statements, and documented routes. A working repository or imported module does **not** prove a particular stream endpoint works for a given episode. Live provider reachability changes frequently; endpoint probes that did not produce a response are explicitly marked *unverified* rather than being called down or up.

## Findings at a glance

| Entry | What it actually is | Capabilities beyond anime | Current evidence | Decision for 7xAnime |
|---|---|---|---|---|
| [amvstrm-ani-api](https://github.com/saurabhgangule/amvstrm-ani-api) | Node REST API using AniList + Gogoanime, with Consumet-backed info/video fallback | No general TMDB movie/TV catalogue or manga-reader API; “movies” routes are Gogoanime anime films | Source and official docs are present. Official base URL is documented as https://api.amvstr.me, but the health/read attempt in this audit returned a gateway error, so live availability is **unverified**. Source is GPL-3.0. | Candidate for a thin HTTP adapter only after endpoint health and response schemas are verified. Do not port its scraper implementation into the app; it overlaps the Consumet/Gogoanime route. |
| [Streambert](https://github.com/truelockmc/streambert) (the penniger/streambert link resolves to the same project) | GPL-3.0 Electron desktop app, not a provider API | **Yes:** live-action movies and TV series, as well as anime. TMDB supplies search/catalog/art/text metadata; videos come from third-party sources. | Current canonical README describes VidSrc as the main video source, with Videasy and VidKing alternatives; the supplied penniger alias snapshot mentioned 2Embed instead, so the exact fallback list is inconsistent across the reviewed pages. Anime uses AniList metadata and a separate AllManga.to scraping path. This is a project description, not a live playback test. | Do not register Streambert as one server. Treat its distinct source adapters as separate future integrations only after testing and license review. A movie/TV catalog would be a separate product scope from the current anime watch page. |
| [Seanime](https://github.com/5rahim/seanime) | GPL-3.0 self-hosted media server, web UI and desktop/mobile clients with an extension marketplace | **Yes:** local media, anime streaming via extensions, and manga reading via extensions/local library | The repository publishes release v3.10.3 dated 2026-09-20. Its README explicitly describes extension-based online streaming and manga sources. | Not a drop-in scraper/API. A future adapter should connect to a **user-configured Seanime server** or use the extension interface; do not bundle the entire server into the Android APK. |
| Consumet API (prompt URL is the generic [github.com](https://github.com); likely intended repository: [consumet/api.consumet.org](https://github.com/consumet/api.consumet.org)) | Multi-source API framework, not one scraper/provider | **Yes:** documentation historically describes information/source APIs for anime, movies and books; exact coverage depends on installed extensions | The generic prompt URL does not identify a repository. GitHub returned a repository-access block (451) when the likely official repository was checked, so its current implementation could not be audited directly. The public API should not be assumed reachable. | No default integration until the repository/base URL is confirmed and a host is verified. A configurable self-hosted HTTP client is the sensible route. |
| “anime-website (AniProject)” — [solo12345689/api.consumet.org](https://github.com/solo12345689/api.consumet.org) | A separate repository/fork in the Consumet API project family | Same broad API goal; practical coverage depends on that fork's current extensions | This repository's README explicitly says the public API is no longer available and self-hosting is required; source is GPL-3.0. | It is a potential alternate implementation of the **same API family**, not a second independent source catalog by default. Compare API version/routes before supporting both. |
| [Anify](https://github.com/Eltik/Anify) | Bun/Node full-stack application with a mapping/data backend, frontend and supporting services | **Yes:** anime, manga and light novels | The maintainer's README says the project is no longer maintained because its proxy acquisition method stopped working; mapping/storage logic may still be useful. Root README was available, but no root LICENSE file was found in this audit. | Do **not** count as a working streaming source. Mapping ideas are useful, but no direct adapter until a maintainer-confirmed working source endpoint and reuse license are established. |
| [ani-cli](https://github.com/pystardust/ani-cli) | GPL-3.0 shell CLI, not an HTTP API | Anime only | Its current release page lists v5.1 (2026-09-11); the current README says it scrapes HiAnime. Release notes warn that iOS playback is broken and mention another provider change. | Do not launch the shell script from Android or treat it as an API. A future independent HiAnime adapter would need its own HTTP/parser implementation and real response tests; expect frequent upstream breakage. |
| [Anivault-Scraper](https://github.com/SH0MIK/Anivault-Scraper) | Node/Express TypeScript REST API with episode/server/watch and HLS/subtitle/video proxy routes | **Metadata only:** TMDB and Kitsu are used for anime artwork; this does not make it a live-action movie/TV streaming source. | README calls AnimeHeaven and Anikoto its verified streaming sources and documents proxying, MP4 ranges and subtitle conversion. Its API is designed to be hosted with the AniVault stack; no independently verified public API base was found. No root LICENSE file was found in this audit. | Potential source of an **AnimeHeaven** adapter if a reachable deployment and reuse terms are confirmed. Anikoto duplicates an existing Kuhi source. Prefer calling a user-hosted API through a configured base URL; do not copy unlicensed scraper code. |

## Overlap and duplication rules

1. **Consumet and amvstrm overlap.** amvstrm uses Gogoanime and documents Consumet as an info/video fallback. Keep a single adapter per actual upstream source and use the other API only as fallback metadata/source resolution.
2. **The Consumet entry is underspecified, while AniProject is a separate repository in the same project family.** Confirm which repository/deployment is intended before integrating; do not add two duplicate picker entries when both resolve the same source catalog.
3. **Streambert is a client app, not a server.** VidSrc, Videasy and VidKing are individual upstream source families in the canonical README; a supplied alias snapshot instead mentioned 2Embed. They can overlap across other scrapers and should be deduplicated by normalized source URL/provider identity, not by repository name.
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

- The bundled local runtime currently starts from Kuhi's ten native Python adapters and adds one separately authored, embed-first AnimeNoSub adapter (not one of the eight Gemini-listed repositories); the smoke test requires all eleven to import.
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


## Follow-up review: why the Android provider set failed

### Source-of-truth and runtime findings

The bundled Kuhi pin in `.github/scripts/fetch-kuhi-backend.sh` is `aryaniiil/anime-api@d9a785ad030d6fc6a8ad709291be9612c864449e`. At this audit, GitHub's compare endpoint reported that pin as identical to upstream `main`; the problem is not simply an obviously stale commit. Upstream describes the API as experimental and explicitly disclaims reliability. Its native race uses a 75-second per-provider watch timeout and catches provider exceptions as an empty result, which can hide the difference between a missing episode, an HTTP error, and a timeout.

The Android packaging patch had reduced that 75-second provider timeout to 8 seconds and wrapped the whole extraction route in a 10-second deadline. The client request timeout was 20 seconds. That mismatch is a confirmed local implementation defect and a strong possible cause of the broad failures seen in the phone screenshots. The follow-up branch now budgets 30 seconds for shared AniList/AniZip context setup, 45 seconds per provider, 80 seconds for the complete local watch route and 85 seconds for the frontend request. Context is cached and shared between episode discovery and playback; in-flight tasks and locks are scoped to their asyncio event loop so isolated test loops cannot reuse loop-bound tasks. It records sanitized per-provider outcomes for timeout, request exception, empty result, unsupported format, or usable streams, and returns Auto-race outcomes to the picker so failures for the active anime/episode/audio can be hidden and retried. These are bounded responsiveness limits, not guarantees of upstream availability. The cause of any individual provider failure remains unconfirmed until the revised APK diagnostics are reviewed on a phone.

### Newly checked candidate repositories

- **Anivexa-API** ([repository](https://github.com/walterwhite-69/Anivexa-API)): current repository contains 12 JavaScript provider modules and requires a Node service with Playwright Core and `wreq-js`. It documents self-hosting and warns that shared datacenter IPs are often blocked. GitHub did not expose a root LICENSE file at the expected path during this audit, so do not copy its scraper modules into this repository or assume a public endpoint exists. It is a candidate only for a remote adapter after a base URL is deployed, reuse terms are established, and its response contract and stream playback are tested.
- **amvstrm-ani-api** ([repository](https://github.com/saurabhgangule/amvstrm-ani-api)): GPL-3.0, with `https://api.amvstr.me` documented as the official base. The endpoint could not be independently confirmed live in this audit (the earlier endpoint probe returned a gateway error, and direct retrieval was unavailable to the browser tool). Do not add a picker entry based on a README URL alone; retry a live health/schema probe before enabling it.
- **Anivault-Scraper** ([repository](https://github.com/SH0MIK/Anivault-Scraper)): documents AnimeHeaven and Anikoto extraction routes and a Node/TypeScript service. No root LICENSE file was found in the expected path and no independently verified public base URL was identified. Prefer a user-owned deployment plus a configurable remote adapter; Anikoto would duplicate the existing Kuhi route.
- **Streambert** is still a desktop client rather than a server. Its source families must be assessed individually; do not expose one fake “Streambert” server.
- **Seanime** is a self-hosted server/extension system; the appropriate integration is a user-configured Seanime endpoint, not bundling its whole stack.
- **Consumet/AniProject** require a verified repository/deployment; the public deployment claims in the supplied links do not currently establish a dependable source. **Anify** reports its former proxy approach is no longer maintained, and **ani-cli** is a shell CLI rather than a portable Android API.

### Integration gate

A source becomes selectable only when a supported adapter is present, its external requirements are configured, it returns normalized streams, and a real Android playback attempt confirms the URL/headers/media type work. Module import, a successful API response, or a repository's “active” table are not sufficient evidence. The three outcomes remain distinct: module loaded, usable stream extracted, and playback actually started. No additional external backend has been deployed as part of this audit, so these candidates are researched but not yet shipped as available servers.


## Follow-up research: direct embed platforms and MegaPlay-like sources

**Follow-up audit date:** 2026-10-10  
**Purpose:** Identify practical alternatives when native stream extraction is unreliable, document embed-based providers separately from API/scraper adapters, and avoid presenting unverified sources as working servers.

### Executive summary

The most promising next experiment is **direct embed playback**, not blindly adding more scraper modules. Platforms such as AniXo and Megavid document player/embed routes that can be loaded in a WebView. That is a different integration contract from a native extractor: the app delegates source selection and playback to the provider's embedded player, rather than expecting a direct HLS/MP4 URL.

The user also identified **yomi.to** as a real-world reference: in their observed player, MegaPlay appears as Server 1 / the primary server and is also used as a fallback. This is valuable product evidence that MegaPlay can be used as a first-class player route and as a recovery path. It is recorded here as a **user-reported observation**, not as an independently reproduced test. We should inspect yomi.to's current behaviour and terms before copying its exact ordering or fallback logic. A platform showing MegaPlay as a selectable player is not proof that every MegaPlay episode works on every device.

### Candidate matrix

| Candidate | Integration shape | What the available evidence says | Main risks / caveats | Recommendation |
|---|---|---|---|---|
| [AniXo](https://anixo.buzz/) | Direct iframe/embed; provider-managed engine selection and failover | Its current official site documents AniList/MAL-based embed routes and a `track` parameter for sub/dub. The site advertises multiple engines and automatic failover. | Site claims and route documentation are not a successful playback test on our Android WebView. Providers may change paths, block embedding, show ads, or depend on third-party cookies/headers. | **Priority 1 embed experiment.** Use the current official route format below; test on a physical Android device before enabling as healthy. |
| [Megavid](https://megavid.buzz/) | Direct iframe/embed; optional documented JSON source API | Official docs describe AniList/MAL routes, sub/dub, and player events. A JSON endpoint is also documented, but access may be origin-restricted. | Do not assume the JSON endpoint is a public CORS-friendly extraction API. Prefer its documented iframe first. Playback and event delivery are unverified on our device. | **Priority 2 embed experiment.** Keep distinct from AniXo and native HLS/MP4 providers. |
| [MegaPlay](https://megaplay.buzz/) | Provider-managed embedded player/source | User points to yomi.to using MegaPlay as its primary server and fallback. The earlier SDK research includes MegaPlay integration code and E2E test definitions, which are useful implementation clues but not current uptime evidence. | Exact live domain/routes may change. A test in another project or yomi.to does not guarantee our app's WebView, episode mapping, sub/dub, or fallback works. | **High priority to validate**, especially because the user's reference platform appears to rely on it. Treat as a player integration with explicit health/playback verification, not a guaranteed direct-media extractor. |
| [NontonGo](https://www.nontongo.win/) | Direct embed routes; also advertises non-anime media endpoints | Official site documents anime embed patterns and movie/TV endpoints. The site warns of popup ads. | Higher ad/navigation/UX risk; third-party embed can redirect or open popups. Movie/TV support is broader than 7xAnime's current anime scope. | Lower priority. Do not enable by default until popup handling, navigation boundaries, and real playback are tested. |
| [AnimeParadise](https://stream.animeparadise.moe/) | Native API + HLS/media source (based on third-party SDK implementation) | The `anime-sdk` repository includes an AnimeParadise E2E test that exercises API-to-stream flow and uses FFmpeg/screenshot output as a playback-oriented assertion. | Repository tests are historical evidence, not current service health; upstream may change or block requests. | Potential native adapter after fresh endpoint/schema checks and a real Android playback test. |
| [AniCult](https://github.com/aluukill/AniCult) | Open-source client-side SPA/reference implementation | Its app code defines embed providers including MegaPlay, AniXo, and Megavid. Last observed repository activity was 2026-09-22. | A client reference shows integration patterns, not that its provider endpoints are currently healthy. Its AniXo URL shape appears older than the current official route documentation. | Use as a code-reading reference; follow each provider's current official docs rather than copying stale URLs. |
| [anime-sdk](https://github.com/hexxt-git/anime-sdk) | TypeScript SDK with provider adapters and E2E tests | Includes MegaPlay, Anikoto (using MegaPlay), Allmanga/AllAnime, Gogoanime, Goyabu, AnimeParadise, and manga-related functionality. Some E2E tests use FFmpeg and screenshot checks rather than only asserting a non-empty response. | Latest visible work/release evidence was around June 2026, so treat tests as historical. Some providers have known failure notes (including HTTP 403 in its tested environment). | Best code/test reference for native adapter contracts and test design; do not infer current uptime from passing historical tests. |
| [MiruroAPI](https://github.com/Shineii86/MiruroAPI) | Aggregator with multiple pipe providers and direct embed helpers | README describes a dozen pipe providers and direct embeds for Megavid/AniXo. The project also says the API may be temporarily paused; hosted pipe calls encountered Cloudflare/5xx issues in the prior audit. | Hosted aggregator reliability is not established. Pipe API failures should not be confused with direct embed availability. | Do not depend on its public API. The documented direct embeds can be assessed independently. |
| [Yomi Anime API](https://github.com/Wabsa-kh/yomi-anime-api) | Thin API/URL aggregator | README lists MegaPlay, MegaFlix, TryEmbed, CinexStream, and NontonGo. Its source mainly constructs URL strings; the included basic test checks that sources are non-empty rather than proving video playback. | A URL existing in JSON is not a resolved stream or playable video. TryEmbed has not met our trust/playback bar. | Reference only; do not treat its server list as evidence of live working sources. |
| [Cosmic API](https://github.com/JUSTCHILL098/cosmic-api) | Wrapper around MegaPlay | Its implementation largely wraps MegaPlay and labels the returned source accordingly. | Not an independent upstream source; adding it beside MegaPlay may duplicate the same dependency while creating another failure point. | Do not count it as an independent fallback. Consider only if its wrapper provides a verified, material technical benefit. |
| [yomi.to](https://yomi.to/) | Reference streaming platform / server picker | **User-reported:** MegaPlay is shown as Server 1 / primary and is also used as a fallback. This matches a useful design pattern: primary route plus recovery route. | We have not independently reproduced the current server order or fallback sequence in this audit. The site may change behaviour and may have legal/terms constraints. | Study behaviour and user experience; validate MegaPlay directly in 7xAnime. Do not copy proprietary code or assume the same server ordering is universally best. |

### Route patterns documented by provider sites

These are route patterns from the respective providers' public documentation, recorded as **integration references**, not tested playable URLs. IDs and episode numbers must be normalized correctly, and the route should be generated only from current official documentation.

- **AniXo**
  - AniList: `https://anixo.buzz/embed/ani/{AniListID}/{episode}?track={sub|dub}`
  - MAL: `https://anixo.buzz/embed/mal/{MALId}/{episode}?track={sub|dub}`
  - Prefer the current `track` query parameter. An older client reference used a language path segment; do not blindly reuse that stale shape.
- **Megavid**
  - AniList: `https://megavid.buzz/ani/{AniListID}/{episode}/{sub|dub}`
  - MAL: `https://megavid.buzz/mal/{MALId}/{episode}/{sub|dub}`
  - Its documented JSON source endpoint may be origin-restricted; test the embed before building an extraction adapter around the JSON route.
- **NontonGo**
  - AniList-style route documented by the site: `https://nontongo.win/anime/{ANILIST_ID}/{EPISODE}/play`
  - MAL-style route documented by the site: `https://nontongo.win/anime/stream?id={MAL_ID}&e={EPISODE}&type=MAL_ID`
  - Treat popup/redirect behaviour as a launch-blocking UX/security test, not a minor detail.

No MegaPlay URL template is hard-coded in this document because a current official route template has not been independently established here. Inspect the current provider docs/site and the existing SDK adapter before implementation.

### Recommended 7xAnime playback strategy

1. **Keep two integration types distinct.**
   - Native source adapter: returns a normalized HLS/MP4 stream URL and the required headers, subtitles, and skip intervals.
   - Embed provider: returns a provider page URL that must be rendered in a compatible WebView/player surface.
   Do not pass an embed page to a native HLS player or pretend that the embed URL is a direct media URL.
2. **Test MegaPlay as a primary route and fallback.** First confirm the current route and ID format; then test sub and dub, several episodes, resume/seek, buffering, and an actual video frame on a physical Android device. Separately test fallback when the primary fails. Record diagnostics that distinguish page load, provider error, and actual playback start.
3. **Prototype AniXo and Megavid as separate embed choices.** Keep the manual choice strict. Auto may race embed page readiness or use a documented provider-managed failover, but it must not report success merely because an iframe navigated.
4. **Use a robust fallback state machine.** Primary fails before playback → try the next eligible server. Playback starts then errors → offer/perform a controlled fallback while preserving episode and audio selection. Avoid endless loops, duplicate fallback to the same underlying upstream, and silently switching a manually selected server.
5. **Avoid duplicate providers masquerading as redundancy.** Anikoto can be a MegaPlay-backed route; Cosmic is largely a MegaPlay wrapper; a second API that calls the same source is not independent fallback capacity. Track upstream identity separately from the visible server label.
6. **Harden the Android embed surface.** Allow required iframe subframes and media requests; prevent arbitrary top-level navigation out of the app; test redirects, popup windows, cookies, mixed content, autoplay/user gesture requirements, fullscreen, back navigation, and external intents. Do not broadly block all provider subresources while trying to prevent top-level redirects.
7. **Do not declare a source healthy based on import or HTTP 200.** Use separate states: module available → provider page/stream returned → player initialized → playback observed. For embeds, a video frame/time progression or explicit reliable player event is stronger evidence than page load alone.
8. **Keep user-facing server lists clean.** Do not show dead/unconfigured providers. Hide a failure only for the current anime + episode + audio selection, let the user retry, and do not permanently blacklist a provider after one transient failure.
9. **Re-check before each release.** Provider endpoints, domains, ads, embedding policy, and anti-bot protections change frequently. Keep a dated audit and a small repeatable device test checklist.

### Practical verification checklist

- [ ] The chosen anime maps to the correct AniList/MAL ID.
- [ ] Episode numbering matches the provider (including specials/season splits).
- [ ] Sub and dub routes are distinct and correctly selected.
- [ ] The embedded page remains inside the app and the actual video starts.
- [ ] At least one real frame appears and playback time advances.
- [ ] Seeking, pause/resume, fullscreen, and back navigation work.
- [ ] No unhandled popup or unexpected external-app redirect appears.
- [ ] Primary-server failure activates exactly one sensible fallback.
- [ ] A manually selected server never silently plays another provider.
- [ ] Diagnostics identify the selected provider, timeout/error class, and whether playback ever began, without leaking tokens or personal data.

### Evidence and confidence notes

- **Official provider pages/docs** support the URL patterns and the platforms' own feature claims; they do not establish uptime or playback in 7xAnime.
- **AniCult and anime-sdk** are useful open-source references for implementation and testing. The SDK's E2E test design is stronger evidence than a test that merely checks for a non-empty URL, but stale tests remain historical evidence.
- **MiruroAPI, Yomi Anime API, and Cosmic API** should not be counted as independent live sources without tracing their underlying upstreams and testing actual playback.
- **yomi.to MegaPlay ordering/fallback** is included as the user's observed behaviour and a design lead; it is not labelled independently verified.
- No new external source is marked production-ready by this research alone. The current PR must remain unmerged until the actual Android playback path is verified.

## Implementation update: AniXo and Megavid adapters (2026-10-10)

The current PR now contains independently written, manual-only adapters for AniXo and Megavid under `android-local-backend/extra-providers/`. Each uses the provider's documented AniList ID route and returns a normalized `type: embed` source. The Android packaging script copies both adapters into the bundled Python provider tree; the frontend provider map labels them as iframe servers.

- **AniXo:** confirmed route shape from its live official docs: `/embed/ani/{aniListId}/{episode}?track={sub|dub}`. Its docs also describe a parent-window play event, which can provide positive playback evidence. [Official docs](https://anixo.buzz/).
- **Megavid:** confirmed route shape from its live official docs: `/ani/{anilist-id}/{ep-num}/{sub|dub}`. Its docs describe progress/completion/error events and state that player pages must be embedded in an iframe. Its documented JSON source API is not used because origin restrictions are described. [Official docs](https://megavid.buzz/).
- **Auto is intentionally kept separate:** both adapters are excluded from the local Auto extraction race. Their routes can be generated without scraping or resolving a stream, so allowing them to win Auto would turn a syntactically valid URL into a false “working” result.
- **MegaPlay remains Server 1:** its official site currently documents the AniList form `https://megaplay.buzz/stream/ani/{anilist-id}/{ep-num}/{language}` and the app already uses it as the dedicated iframe choice and when native extraction needs a fallback. MegaPlay-backed wrappers such as Anikoto/Cosmic are not counted as independent upstreams.
- **Not integrated in this iteration:** NontonGo stays deferred because its own site warns of popup behaviour and it needs a dedicated top-level-navigation/popup review. MiruroAPI remains unsuitable as a required dependency until its hosted service is independently confirmed. AnimeParadise remains a later native-adapter candidate pending fresh live-media and Android verification.

The network-free contract tests now cover the two new route templates, sub/dub paths, synthetic episode metadata when AniList/AniZip gives a count, and exclusion from Auto racing. These tests verify our adapter logic—not the providers' availability or real playback.

**Release gate remains unchanged:** the adapters are implemented in the draft PR, not declared healthy or production-ready. On a physical Android device, verify at least one real frame and time progression for AniXo and Megavid, then test error signalling, sub/dub, correct episode numbering, seeking, fullscreen, back navigation, redirects/popups, and recovery. Where the provider sends no trustworthy playback event, manual observation is still required.

## Provider pause after physical-device verification (2026-10-10)

The user tested the current Android build and reported that **MegaPlay (Server 1), AniXo, and Megavid work** for the tested title/episode. This is stronger evidence than route-construction tests, but it is not a universal availability guarantee. AnimeParadise and Cosmic Player were added afterward as manual-only experiments and have not yet had a real-device playback check.

To avoid repeatedly hammering unproductive upstreams, the app exposes MegaPlay as Server 1 plus four explicit manual selections: AniXo, Megavid, AnimeParadise, and Cosmic Player. The backend allowlist filters routes to those choices; Auto does not invoke the parked Kuhi native-provider race or any new candidate. AnimeParadise catalogue lookups are deferred until a user explicitly selects it. Cosmic is a MegaPlay-backed player wrapper, not an independent upstream. Legacy Kuhi adapter code remains bundled but parked, and AnimeNoSub remains parked.

The eight researched, not-yet-integrated candidates remain **research only** and have not been queried or integrated as part of this change:
1. [amvstrm-ani-api](https://github.com/saurabhgangule/amvstrm-ani-api)
2. [Streambert](https://github.com/truelockmc/streambert)
3. [Seanime](https://github.com/5rahim/seanime)
4. [Consumet API](https://github.com/consumet/api.consumet.org)
5. [AniProject](https://github.com/solo12345689/api.consumet.org)
6. [Anify](https://github.com/Eltik/Anify)
7. [ani-cli](https://github.com/pystardust/ani-cli)
8. [Anivault-Scraper](https://github.com/SH0MIK/Anivault-Scraper)

No requests have been made to those eight candidates as part of this pause. Revisit them only after the user specifies the next step. Do not start probing them in the background.


### Implementation follow-up: AnimeParadise and Cosmic

- **AnimeParadise** is implemented as a small Python adapter around the documented `api.animeparadise.moe` search, episode, and signed-stream endpoints. It returns HLS plus external subtitle tracks. Resolution is triggered only on explicit provider selection and is held out of Auto while signed-link expiry/IP binding and actual Android playback are validated.
- **Cosmic Player** is implemented as an iframe adapter to the documented Cosmic embed page. Cosmic's example response labels its source `megaplay` (server `zen-1`), so it is a custom player comparison—not a separate upstream. Player messages are accepted only from the exact iframe window and the configured Cosmic origin/channel.
- **Megavid fake “Allow” overlay:** the card in the user's screenshot is rendered inside the cross-origin Megavid player iframe. The app warns viewers not to grant permissions and offers a quick switch to MegaPlay/AniXo. The overlay cannot be safely removed by styling the parent document; any sandbox or network filter requires provider-specific verification to avoid breaking playback.
- Both new adapters are deliberately manual-only and have mocked contract tests. Build success will prove packaging only; a phone playback check is still required before enabling Auto or merging PR #2.
