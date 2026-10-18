# Hindi-Dub Provider Research and Integration Plan

**Audit date:** 2026-10-18  
**Status:** Research only — no candidate was added, enabled, probed, or packaged by this document.  
**Purpose:** Preserve the findings and integration boundaries for future evaluation without changing or confusing current 7xAnime providers.

> This is not the runtime provider list. The active server allowlist remains exactly as documented in [SERVERS.md](SERVERS.md). Do not register any candidate below in the frontend server map, Python provider order, packaging script, or Android APK because it appears in this research.

## 1. Executive summary

The supplied findings describe four different kinds of work, not four ready-to-use streaming backends:

1. **HiAnime / MegaCloud extraction** — an extraction technique whose current viability and per-episode Hindi audio availability must be proven.
2. **Regional source adapters (Anivault-Scraper and Indian-language sites)** — potentially relevant for Hindi/Tamil/Telugu catalogue coverage, but source availability, reuse rights, and actual playback remain unverified.
3. **Unified provider frameworks (Consumet / Anify)** — useful architectural references; neither should be assumed to be a working Hindi-dub source.
4. **ID mapping and caching (Renime-API / WatchAnimeWorld)** — a useful matching optimization, but the supplied prompt did not identify concrete repositories or a verified mapping endpoint.

**Initial investigation priority:** inspect Anivault-Scraper's source and documented routes, especially its distinct AnimeHeaven path, then test whether an authorized, reachable instance can resolve a small set of Hindi-dub episodes. This is a research priority, not approval to integrate or copy its implementation.

## 2. Current 7xAnime boundaries — preserve these

### Standard playback providers

The supported standard server choices now remain exactly seven (SupaPlay and VidPlus have generic dub selectors but are not yet verified as Hindi-specific sources):

1. MegaPlay — Server 1 and the default/final fallback.
2. AniXo.
3. Megavid.
4. TryEmbed.
5. CinexStream.
6. SupaPlay.
7. VidPlus.

See [SERVERS.md](SERVERS.md), the source of truth for the active list and Android packaging allowlist. MegaPlay and its fallback role are not two different providers.

The Android local Python backend packages the existing shared catalogue/context code and only the six existing extra adapters (AniXo, Megavid, TryEmbed, CinexStream, SupaPlay, VidPlus). The other legacy Kuhi adapters are intentionally pruned.

### Existing Hindi route

[SERVERS.md](SERVERS.md) documents an existing separate Hindi-dub feature using the community ZeroTwo-Py/anime-api catalogue through the /hindi/search and /hindi/stream routes. This route is distinct from the seven standard playback choices.

Before any future work, inspect the current implementation and tests. Do not assume this route is healthy or replaceable solely from a README claim. Do not rename it, overwrite it, or silently route it through a new candidate.

### No-change rule for this research

This document is not permission to:

- add a candidate to the active server picker or Auto race;
- change default audio ordering, server numbering, or the existing MegaPlay fallback;
- re-enable retired Kuhi modules or retired standard providers;
- rewrite the existing Hindi endpoints;
- add new dependencies or Node.js services to the APK;
- run live probes against unrelated providers not selected for evaluation.

A future integration must be proposed separately and reviewed against the current code and physical Android playback results.

## 3. Candidate A — HiAnime / MegaCloud extraction

**Target names supplied:** HiAnime, MegaCloud, RapidCloud.  
**Claimed value:** resolve an HLS master playlist that may advertise multiple audio renditions, potentially including Hindi when the selected episode actually offers it.

### What this could provide

- A way to inspect source metadata and available HLS renditions for a particular episode.
- Potentially a direct HLS playback route, if the provider legitimately exposes a usable playlist and the player supports its format, request headers, and audio-selection behavior.
- A source-level reference for how current HiAnime-compatible extractors discover an embed and parse a media response.

### What remains unproven

- Whether a specific public HiAnime scraper repository is currently maintained and working. The prompt did not provide one exact repository URL.
- Whether the current upstream flow still resolves successfully from 7xAnime's runtime environment.
- Whether Hindi is present for a given anime/episode. A single .m3u8 URL does **not** prove Hindi audio exists; inspect the master playlist's audio media groups and actual variant playlist behavior.
- Whether the resulting stream is playable on Android WebView/ArtPlayer without a special proxy or unsupported media feature.
- Whether required request headers and redirects are stable and can be handled safely.

### Evaluation rules

1. Record the exact repository URL, commit/release, license, and date reviewed.
2. Prefer documented/public interfaces and normal embed navigation. Do not implement DRM circumvention, defeat access controls, or reproduce private token/key-decryption steps intended to bypass protections.
3. For any authorized test response, inspect the master playlist and enumerate declared audio groups/languages instead of inferring language from the URL or page title.
4. Confirm that the player can select the intended audio rendition. If it cannot, classify the candidate as unsupported until that capability is implemented and tested.
5. Mark provider reachability as **unverified** until tested from the relevant deployment/runtime; a code repository is not proof of live availability.

**Current decision:** research-only. No extractor or runtime change approved.

## 4. Candidate B — Regional source adapters / Anivault-Scraper

**Target names supplied:** Anivault-Scraper; DesiDubAnime; Senshi; Anikoto; related regional indexing sites.  
**Repository identified in prior research:** [SH0MIK/Anivault-Scraper](https://github.com/SH0MIK/Anivault-Scraper).

### Why it matters

This is the most relevant candidate family for finding regionally localized audio rather than assuming a global anime source will offer Hindi. Anivault-Scraper is a TypeScript/Node/Express API project with episode/server/watch routes and media-related proxying documented by its README.

The previously reviewed README claimed AnimeHeaven and Anikoto as verified sources, described subtitle handling and media proxy routes, and indicated that Miruro was offline at that point. These are upstream project statements, not independent live-playback verification. Status can change.

### Distinct-source and duplication concerns

- **Anikoto overlaps the legacy Kuhi source family** already examined in PROVIDER_RESEARCH.md. Do not add it as a new server merely because a different API wraps it.
- The distinct **AnimeHeaven** path is a more interesting first comparison, provided a reachable deployment and lawful reuse terms are confirmed.
- Senshi may depend on anti-bot challenges; do not equate a page being indexed with the scraper being able to resolve it from the target host.
- The names DesiDubAnime and Senshi do not, by themselves, identify a stable API contract. Exact canonical URLs, source code, license, and response schema must be recorded before implementation.
- Do not assume every regional source has Hindi audio for every episode. Track language availability per episode and source response.

### Deployment and reuse

The reviewed Anivault repository did not have a root license file at the time of the prior audit. Re-check the current repository and dependencies before reusing code. If reuse rights are unclear, treat it as behavioral/architectural reference only; do not copy its scraper implementation into 7xAnime.

If evaluation requires its own Node.js service, first decide whether a user-hosted/configurable endpoint is acceptable. Do not silently add a separate service requirement to the standalone Android APK or hard-code an unverified public base URL.

**Current decision:** first source family to inspect in a future evaluation; no integration approved.

## 5. Candidate C — Unified provider frameworks (Consumet / Anify)

**Targets supplied:** Consumet and Anify.  
**Claimed value:** a provider-class or adapter pattern that allows new sources to be registered behind a common interface.

### Architectural value

A common provider contract can make 7xAnime integrations easier to test and maintain. Candidate adapters should be isolated behind a stable boundary and return normalized records rather than leaking source-specific response shapes into UI code.

A possible future contract, subject to review against the existing Python backend, could normalize:

- source identity and display label;
- anime/episode mapping;
- stream URL and media type (HLS, MP4, DASH, or embed);
- required public request headers/referer where appropriate;
- subtitle tracks and declared audio renditions;
- extraction status, timeout/error category, and source attribution.

This is a design sketch only; it does not prescribe creating a new provider registry now.

### Consumet

Consumet is a framework/API family, not one guaranteed live source. The exact repository, revision, deployment, route contract, and license must be pinned before considering an adapter. Public instances and upstream source modules can change or become unavailable. Do not treat an old public base URL or a fork as reliable without verification.

### Anify

The previously reviewed [Eltik/Anify](https://github.com/Eltik/Anify) README said the project was no longer maintained because its proxy-acquisition method stopped working. Mapping/data structures may still be informative, but that does not make it a current streaming source. Re-check current status and reuse terms before relying on it.

### Integration boundary

The existing backend is Python and runs locally in the Android APK. A Node/Bun framework is not a drop-in Python module. If a separate service is ever proposed, document hosting, maintenance, network, privacy, and standalone-APK implications first. Prefer a small adapter around a verified, permitted API over importing an entire unrelated application stack.

**Current decision:** use as architecture references only; no framework migration or new service approved.

## 6. Candidate D — ID mapping and local cache (Renime-API / WatchAnimeWorld)

**Targets supplied:** Renime-API and WatchAnimeWorld.  
**Claimed value:** map global catalogue identifiers (such as AniList/MAL IDs) to regional source IDs, reducing repeated title searches and improving episode matching.

### Useful concept

A mapping layer can reduce mismatches between a catalogue title and a localized source. A future cache could store:

- canonical catalogue ID and namespace;
- source/provider ID and normalized title;
- alternate titles used for matching;
- match confidence and matching rationale;
- language/audio evidence and the episode scope it applies to;
- source revision/last-checked timestamp and expiry;
- negative results only with a short TTL, so temporary source failures are not cached as permanent absence.

### Matching rules

- Do not equate a fuzzy title match with a confirmed mapping. Prefer explicit IDs when available; otherwise compare normalized titles, alternate titles, year/season, and episode numbering.
- Keep mappings source-specific. One source's ID must never be reused as another source's ID.
- Keep audio availability episode-specific; a series-level “Hindi available” flag can be misleading.
- Cache metadata/mapping separately from playback health. A valid mapping does not prove a playable stream.
- Use bounded expiry and revalidate stale mappings. Avoid permanently caching network errors as “not found.”
- Do not add SQLite solely because the prompt suggested it; inspect current cache/storage patterns first and choose the smallest compatible mechanism.

### Evidence gap

The supplied prompt did not identify exact Renime-API or WatchAnimeWorld repository URLs, current code, license, or a verified API schema. Those names are not sufficient to implement or call an endpoint. Obtain exact source links before proceeding.

**Current decision:** architecture idea only; no mapping table, database, or resolver added.

## 7. Suggested evaluation matrix (before any code change)

Evaluate one candidate source at a time. Use a small, documented set of anime/episodes known to have Hindi audio from a lawful source. Do not assume the source supports Hindi merely because it serves dubbed content.

| Check | Evidence required | Pass condition |
|---|---|---|
| Source identity | Canonical URL, repository, revision, license/terms | Exact project and reuse/usage terms are understood |
| Runtime reachability | Timestamped request from the intended runtime/host | A response is received; errors are recorded distinctly |
| Catalogue match | Requested AniList ID, source ID, title/alternate title | Correct series and season are resolved |
| Episode mapping | Requested episode and returned source episode | Episode numbering and specials are not silently mismatched |
| Language proof | Explicit audio metadata or verified playback/audio selection | Hindi is actually available for that episode |
| Extraction | Normalized result, format, headers, subtitles | A usable stream/embed is returned without bypassing access controls |
| Playback | Physical Android test with result and device/app build | Video and intended audio play; seeking and recovery are checked |
| Stability | Repeated bounded tests and failure classification | Results are reproducible enough for the intended fallback role |
| Duplication | Compare underlying host/source with current providers | It adds a distinct source, not just a wrapper around an existing source |
| Maintenance | Upstream activity, endpoint ownership, rate limits | Known failure modes and maintenance burden are acceptable |

Use separate result labels:

- **Code found** — source repository exists.
- **API responds** — endpoint returns a response.
- **Episode resolves** — requested episode maps correctly.
- **Hindi confirmed** — target language is explicitly evidenced.
- **Playback verified** — video and selected audio work on the target device.

Never collapse these into a single “working” label.

## 8. Required implementation guardrails if a candidate is approved later

1. **Separate branch and PR.** Keep provider experiments isolated from player gestures/lifecycle work and from documentation. Base future work on current master, not an old provider branch.
2. **No default enablement.** A candidate starts disabled/research-only. Add it to a runtime registry only after review and explicit acceptance.
3. **Preserve the seven-server list.** Do not renumber standard servers or make a Hindi candidate look like a duplicate standard server. SupaPlay and VidPlus are not confirmed Hindi-specific sources; Hindi selection remains separate and available only when actually confirmed for the episode.
4. **Do not change existing providers.** No edits to MegaPlay, AniXo, Megavid, TryEmbed, or CinexStream while testing a new candidate unless a separate, justified fix is required.
5. **No false language badges.** Do not label a title or episode “Hindi” based on catalogue metadata, a series-level guess, or the mere presence of a dub/sub selector.
6. **Strict manual choice.** A manual selection must not silently return another provider's stream. Any fallback must be explicit and observable.
7. **Bounded network work.** Use timeouts, bounded concurrency, safe redirects, response-size limits, and sanitized errors. Do not expose tokens, cookies, signed URLs, or private headers in logs.
8. **Validate remote URLs.** Prevent SSRF in any proxy or fetch route: restrict schemes, block loopback/private/link-local destinations where inappropriate, revalidate redirect targets, and do not accept arbitrary user-supplied proxy destinations.
9. **Respect access and reuse terms.** Use public/authorized interfaces and comply with repository licenses and source terms. Do not implement DRM circumvention, defeat access controls, or copy unlicensed scraper code.
10. **Test separately from builds.** Static/unit/API-contract tests can verify our code, but only a real-device playback test can verify a third-party episode stream. A green build is not proof of stream availability.

## 9. Next steps — deliberately not executed

1. Re-open [Anivault-Scraper](https://github.com/SH0MIK/Anivault-Scraper) and record its current license, latest commit, route schemas, deployment requirements, and exact AnimeHeaven/Anikoto paths.
2. Identify the exact HiAnime extraction repository intended by the original findings; pin its commit and check whether it still resolves a test episode through its documented interface.
3. Obtain canonical URLs for DesiDubAnime, Senshi, Renime-API, and WatchAnimeWorld. Do not infer URLs from names.
4. Inspect the existing /hindi/search and /hindi/stream implementation and tests without modifying them.
5. Choose one permitted candidate and one known Hindi episode for a controlled, documented test.
6. Only after evidence is collected, prepare a separate implementation proposal with exact files, API contract, tests, fallback behavior, and a rollback plan.

No live endpoint probes, code porting, provider registration, dependency changes, or builds are part of this document-only change.


## Follow-up qualification gate — AnimeHeaven via Anivault-Scraper (2026-10-18)

**Decision: NO-GO for runtime integration at this time.** The implementation plan's mandatory qualification gate did not pass, so no adapter, provider registry entry, dependency, runtime route, or playback UI change was made.

### Evidence checked

- Canonical repository: [SH0MIK/Anivault-Scraper](https://github.com/SH0MIK/Anivault-Scraper), default branch `main`. GitHub repository metadata currently reports `license: null`; no root `LICENSE` file appeared in its root contents.
- Latest commit visible during this check: `7cbf2052ccbb472d2ad643978371ba1cb72c5671` (2026-10-01, “Preserve AnimeHeaven episode referer during playback”).
- The repository's README documents the API flow and example routes, but does not identify a concrete public API base for 7xAnime to call. Its server entrypoint listens on the configured `PORT` and logs a localhost API address, which is a self-hosting instruction, not evidence of a shared public deployment.
- GitHub metadata does not establish a permitted API instance for this project. The official site linked from the repository is not enough to infer or guess an API hostname or its usage terms.
- The repository's documented source flow distinguishes source type `dub`, but the public contract reviewed so far does not establish an episode-specific Hindi-language field sufficient for 7xAnime's “Hindi” label. A generic dub flag is not Hindi proof.
- The official website links to Terms of Use and Privacy pages, but their contents could not be retrieved in the current review. Do not infer API reuse permission from those link labels.
- Repository code and README claims were reviewed as documentation only. No guessed API hostname was probed; no live episode lookup was attempted; no scraper code was copied.

### What is needed to reopen the gate

1. A concrete API base explicitly supplied or authorized by the upstream owner, with permission/usage terms applicable to calling it from 7xAnime.
2. A confirmable route contract and an episode-specific signal that identifies Hindi rather than just “dub.”
3. A safe, bounded sample resolution for one known episode, followed later by physical Android playback verification.

Until those facts are available, leave the current Hindi catalogue and the seven standard servers unchanged. Revisit this candidate only after an authorized deployment and source-language evidence are available. This is a qualification failure, not proof that AnimeHeaven itself is offline.

## Follow-up qualification gate — DesiDubAnime API and Renime-API (2026-10-18)

**Decision: NO-GO for runtime integration for both candidates at the evidence threshold used by this plan.** This is a documentation-only qualification sweep. No live stream/endpoint probes were made, no third-party scraper source was copied, and no runtime configuration or provider registry was changed.

### Candidate A — DesiDubAnime scraping API

- Canonical repository reviewed: [solo12345689/DesiDubAnime-api](https://github.com/solo12345689/DesiDubAnime-api), README blob `c18728c1cd2e8831eee4ce951e13522f1dc1d313`.
- The documented API has a language index and Hindi-specific catalogue route: `GET /api/languages` and `GET /api/language/hindi`. The documented episode path is search/discovery → anime details → paginated episodes → `GET /api/watch/{episode_slug}`.
- The README only documents a locally hosted base (`http://127.0.0.1:8000`) and generic instructions for deploying a copy to a cloud host. It does not name an authorized, existing public API deployment for 7xAnime.
- The repository's `LICENSE` path was not found by the GitHub contents endpoint; no code-reuse license was established. Do not copy or port this API source on the assumption that public visibility grants reuse rights.
- The site's published [DMCA notice](https://www.desidubanime.me/dmca/) includes a “private use only” statement. No clearer terms authorizing 7xAnime's automated integration were established.
- A `hindi` catalogue slug is useful language-specific discovery evidence, but it does not by itself prove that a particular episode's resolved stream contains Hindi audio. No episode was resolved or playback-tested in this review.

**Gate result: NO-GO.** Missing permitted deployment and code/reuse basis; no episode-specific Hindi/playback evidence. Reopen only after the source owner supplies/authorizes a suitable deployment or gives permission applicable to a separately reviewed self-hosted implementation, and a known episode can be verified without bypassing access controls.

### Candidate B — Renime-API

- Canonical repository reviewed: [itzzzDark/Renime-API](https://github.com/itzzzDark/Renime-API). Its README declares an ISC code license and describes a Hindi-first API whose listed upstream providers are AnimeSalt and WatchAnimeWorld.
- The README provides a local API base (`http://localhost:3000/api`) and local start instructions, not a concrete authorized public deployment for 7xAnime.
- The README labels the project for educational/research use and warns integrators to handle copyright compliance and upstream site terms themselves. An ISC code license applies to the repository's code; it does not establish permission from the upstream streaming sites to scrape or redistribute their content.
- The README's endpoint map documents search, details, episodes, and embed routes, but the material reviewed did not establish an episode-specific Hindi audio field or verified Hindi playback contract for a particular episode.
- No live endpoint probes, episode lookup, or playback test were performed because the required permitted deployment and upstream usage basis were not established.

**Gate result: NO-GO.** The code license alone is insufficient. A permitted deployment/architecture, an acceptable usage basis for the upstream sites, and explicit episode-level Hindi evidence are still missing.

### Current ruling

Keep the existing ZeroTwo-Py Hindi catalogue and the seven standard servers unchanged. Neither candidate advances to runtime tasks. Do not guess a hosted base URL, use a public deployment without authorization, or silently create a new scraping service. A new self-hosted architecture requires an explicit decision and a fresh review of applicable upstream terms before implementation.

## Follow-up qualification gate — HiAnime and Senshi (2026-10-18)

**Decision: NO-GO for runtime integration at current evidence threshold.** This check remains documentation-only; no endpoint was guessed or probed, no episode source was requested, and no runtime file was changed.

### Candidate C — HiAnime / Aniwatch API

- Canonical code repository reviewed: [VoidX3D/hianime-api](https://github.com/VoidX3D/hianime-api) (README blob `ed7a03fc938849c7c0f29a546fc07df3336e4955`; MIT LICENSE blob `0909ca65bdd1e9b1eece9c14aa4a981e2e242fe5`). The README identifies the upstream site as `hianimez.to`.
- The API documents a local base (`http://localhost:4000`) and instructions for users to host their own instance. It explicitly notes that the prior hosted showcase was misused and says no later hosted version is available, recommending a personal deployment.
- The README documents `subbed-anime` and `dubbed-anime` categories and episode-server/source routes. The material reviewed does not establish an explicit Hindi-language field; “dubbed” alone is not enough to mark a candidate Hindi.
- The MIT license permits reuse of the repository code under its conditions, but it does not grant permission from the upstream streaming site to scrape or redistribute its content. The API is described as unofficial; upstream usage permission and a permitted 7xAnime deployment were not established.
- No episode resolution or physical playback test was performed.

**Gate result: NO-GO.** The implementation has no Hindi-specific episode evidence and no approved API deployment/upstream usage basis. Do not enable its generic dub results as Hindi.

### Senshi candidate search

- Searches for a Senshi-specific anime API or `senshi.live` scraper surfaced [SH0MIK/Anivault-Scraper](https://github.com/SH0MIK/Anivault-Scraper) and forks of that same project, rather than a separate, independently documented Senshi API with a known owner-authorized deployment.
- Anivault-Scraper is already covered by the AnimeHeaven NO-GO record: no declared repo license, no permitted public API base identified, and no verified episode-specific Hindi contract. A fork does not clear those blockers by itself.
- No independent endpoint was guessed or probed.

**Gate result: NO-GO / insufficient evidence.** Reopen only with a canonical Senshi integration, a permitted deployment/usage basis, and a Hindi-specific episode signal.

### Current candidate status

AnimeHeaven via Anivault-Scraper, DesiDubAnime API, Renime-API, and HiAnime/Aniwatch API are not approved for runtime integration; Senshi remains unqualified because no separate authorized integration was identified. Preserve the existing Hindi catalogue and seven standard providers. A source must pass the same deployment/permission and episode-level Hindi gate regardless of how popular its scraper is.

## Candidate qualification — Tatakai API (2026-10-18)

**Decision: HOLD — promising public API lead, not yet approved for runtime integration.** Unlike the previous candidates, the public Tatakai API landing page advertises a dedicated Hindi-dubbed search route and explicitly invites developers to use its SDK or REST endpoints. The remaining uncertainty is specific and actionable: the route schema/version, episode-level language and watch contract, API usage expectations, and upstream content terms need confirmation. No live content endpoint was called in this check, no source code was copied, and no runtime code was changed.

### Evidence found

- Public API landing page: [api.tatakai.me](https://api.tatakai.me/). Its page labels the service “Live,” advertises standard REST integration, and lists `GET /api/v1/hindidubbed/search` as a Hindi/regional search endpoint. This is a better documented deployment lead than a repository that only says “run on localhost.”
- Public docs entry: [api.tatakai.me/docs](https://api.tatakai.me/docs). The documentation shell is reachable to web search, but its detailed endpoint schema could not be read in this review.
- Upstream repository page: [Snozxyx/TatakaiAPI](https://github.com/Snozxyx/TatakaiAPI). Its indexed README describes a multi-provider scraper and advertises the hosted docs/API. It also says the project is tied to the main Tatakai project and does not recommend using the API project independently.
- Route-contract inconsistency: the current landing-page snippet shows `/api/v1/hindidubbed/search`. An indexed SDK copy, [keplerking100/TatakaiAPI](https://github.com/keplerking100/TatakaiAPI/blob/main/sdk/src/index.ts), constructs `/hindidubbed/search?title=...` beneath a configurable `/api/v1` base. Other indexed documentation for the older repository uses `/api/v1/animehindidubbed/search`, with `/info` and `/watch` routes. These may reflect version drift. The SDK/fork source confirms a plausible `/hindidubbed/search?title=` → `/hindidubbed/anime/:slug` flow, but that is not proof the hosted v5 API exposes the same schema. Do not hard-code any route until the deployed schema is confirmed.
- License/usage ambiguity: GitHub's repository page identifies the code license as MIT, while the indexed README claims MPL-2.0 and separately says projects based on it must be open-sourced and credited. The same README describes the project as non-commercial/educational and cautions against using the API independently. Those statements are inconsistent and must not be treated as a settled license analysis.
- Upstream-media caveat: the [main Tatakai project's legal section](https://github.com/Snozxyx/Tatakai) says third-party extensions, scraping integrations, and public APIs remain subject to the respective content owners' rights and terms. The API landing page's invitation to integrate is evidence of an API developer interface; it is not a rights grant from the upstream media sources.

- Additional schema evidence: [Tatakai-core's API reference](https://github.com/gabhastigiri/Tatakai-core/blob/main/docs/api-reference.md) documents a separate WatchAnimeWorld edge-function response with `sources[]` fields `language`, `langCode`, `isDub`, `providerName`, and `needsHeadless`; its sample includes `language: "Hindi"` and `langCode: "hi"`. This is useful evidence of a source contract that could represent Hindi explicitly, but the published object is an example, not a live response for a known episode. The documented endpoint is `GET /functions/v1/watchanimeworld-scraper` and its code sample sends `Authorization: Bearer ${supabaseAnonKey}`; this appears tied to that app's Supabase project and is not a generally reusable public endpoint or credential. Do not reuse its API/credentials without owner authorization. It does not resolve the deployed Tatakai API's own response contract or upstream-use question.
- Hindi evidence is not yet episode-specific. A source-level contract is available in the [keplerking100 fork's scraper route](https://github.com/keplerking100/TatakaiAPI/blob/main/src/routes/animehindidubbed/index.ts): the search route returns `animeList` records with title/slug; the anime route returns a `servers` object grouped into `filemoon`, `servabyss`, and `vidgroud`, each an array of `{ name, url }` pairs. That implementation identifies its scraper as AnimeHindiDubbed and targets `animehindidubbed.in`, but it does not put a normalized episode number/ID or `language: Hindi`/`langCode: hi` field on each stream. The `name` may encode episode identity, which must be checked against a real known episode. This fork's code schema is not confirmation of the current hosted API's schema. No known episode was resolved or playback-verified.

### Network and verification limits

- The web retrieval tool could not open the documented API route itself. The local runtime also could not resolve `api.tatakai.me` because DNS resolution is unavailable in this environment. This is an environment blocker, **not evidence that the API is offline**.
- No guessed endpoint, host, or version was probed. No stream URL or upstream episode was requested, and there is no physical Android playback result to report.
- No runtime tests or build were run because no runtime change was made.

### What will reopen the gate

1. A maintainer-published current OpenAPI/endpoint schema or equivalent confirmation of the exact deployed search → info → episode → watch path and response fields.
2. Confirmation that the API is intended for independent third-party client integration and clarification of the README/license discrepancy where applicable; upstream content source terms must be reviewed separately.
3. A bounded sample for one known series/episode, with stable episode identity and explicit `Hindi`/`hi`-specific audio evidence—not merely `dub`.
4. Later physical-device playback verification before the source can be labelled playback-verified.

**Ruling:** Keep this candidate as the top follow-up lead, but leave it disabled and do not implement a speculative adapter. Preserve the existing ZeroTwo-Py catalogue and seven standard servers. This HOLD is different from “the API is offline” or “the candidate has no Hindi catalogue”; it means the integration contract and episode proof are still incomplete.

## Candidate qualification — AnimeWorldIndia API family (2026-10-18)

**Decision: NO-GO for runtime integration on the available evidence.** A Hindi-focused catalogue route exists, but the documented API is self-hosted, the stream response lacks episode-specific language fields, and upstream rights/usage permission is not established. Documentation review only; no live request, scraper-code copy, runtime change, test, or build was performed.

### Candidate A — AniBiee / AnimeWorldIndia Scraper API

- Canonical repository reviewed: [MSMods-Pro/AnimeWorldIndia-Api](https://github.com/MSMods-Pro/AnimeWorldIndia-Api), README blob `a9cc79a737277710e60cd294ecb19acd61bd5e6a`; LICENSE blob `a3b0402e148a47487f25d50a08717c3ace331a2b`. The code uses an ISC license.
- The README explicitly frames the API as educational/research use and places responsibility for copyright and site terms on the integrator. That is not evidence that the upstream AnimeWorldIndia site authorizes 7xAnime to scrape or redistribute its streams.
- Documented route flow: `GET /api/search?q=...` → `GET /api/info/:id` → `GET /api/episodes/:id/:season` → `GET /api/embed/:id`. The catalogue supports `GET /api/category/language/hindi`.
- The documented embed response is a generic `servers[]` list containing `server`, `name`, and `url`; no per-stream `language`, `langCode`, or explicit episode audio-language field appears in the reviewed schema. A Hindi catalogue filter cannot by itself prove the stream for a particular episode has Hindi audio.
- No public deployment base is documented. The README tells users to install/run the service themselves, and the service applies origin/referer allowlisting (or requires a configured wildcard) and rate limiting. Do not guess a hosted hostname or assume the author's demo domain is an API.
- Repository ownership/documentation references are inconsistent (the README's clone URL, maintenance badge, and package metadata point to different owner names). This increases the need to obtain the canonical project/deployment from its maintainer rather than fork or guess.
- No API response was sampled and no known episode was resolved or played.

**Gate result: NO-GO.** No authorized public deployment, no established upstream reuse basis, and no episode-specific Hindi proof. The ISC license covers this repository's code; it does not grant rights from the streaming site or rights holders.

### Candidate B — AnimeWorld-India PHP API

- Reviewed [queryof/AnimeWorld-India-Api-Streaming-api-for-hIndi-animes](https://github.com/queryof/AnimeWorld-India-Api-Streaming-api-for-hIndi-animes). Its README documents a PHP application hosted locally using XAMPP/WAMP/MAMP, with endpoints under `/api/anime-world-india/v1/`.
- The stream endpoint accepts an episode/movie identifier and returns source links; the published README does not identify an authorized public API base, and no LICENSE file was found in the reviewed repository path.
- The documentation exposes sample schemas and local example URLs only. It does not provide an episode-level audio-language field or verified Hindi playback sample.

**Gate result: NO-GO.** Local-development API, unclear code-reuse basis, no permitted deployment, and no episode-specific Hindi evidence. Do not infer an API host from the source website's name.

### Ruling

Neither AnimeWorldIndia implementation clears the gate. Keep the current ZeroTwo-Py Hindi source and seven standard providers unchanged. Tatakai remains the strongest follow-up lead because its public docs show a Hindi route and a separate WatchAnimeWorld response schema with `language`/`langCode`, but Tatakai is still **HOLD** until the deployed response contract, independent-client usage expectations, and known-episode language mapping are verified. This sweep does not prove any candidate is offline.

## Candidate qualification — Anivexa API and Zangetsu provider manifest (2026-10-18)

**Decision: NO-GO for direct 7xAnime integration on the reviewed evidence.** These candidates are technically relevant, but neither clears the combination of a permitted API/deployment, Hindi-specific episode evidence, and an acceptable source-code/usage basis. No source code was copied and no live stream endpoint was probed.

### Candidate C — Anivexa API

- Reviewed [walterwhite-69/Anivexa-API](https://github.com/walterwhite-69/Anivexa-API), current README documentation. It aggregates multiple sources and documents `GET /episodes/:anilistId`, `GET /watch/:provider/:anilistId/sub|dub/:provider-:ep`, and a ReAnime HLS redirect.
- The reviewed current provider list describes generic `sub`/`dub` behavior and source-specific capabilities but does not establish episode-specific Hindi audio for any returned candidate. A generic `dub` route is not Hindi proof.
- Its README documents self-hosting, cautions that Vercel deployments are widely blocked by providers, and explicitly says provider requests should be for sources that host their own content, not scrapers of third-party sites. A historical public Vercel instance appears in an issue, but its author describes provider failures caused by Vercel IP blocks; it is not an approved dependable deployment for 7xAnime.
- The repository's root file list has no visible LICENSE file, and no permitted public base intended for independent use is documented.

**Gate result: NO-GO.** Generic dub only, no dependable/authorized deployment, no code-reuse basis established, and the project's own contributor guidance discourages scraping third-party sites. Do not treat a historical public deployment as authorization.

### Candidate D — Zangetsu Spyou provider manifest (AnimeSalt / AnimixStream)

- Reviewed [Spyou/Zangetsu-spyou-provider](https://github.com/Spyou/Zangetsu-spyou-provider): the README and `index.json` identify AnimeSalt, AnimixStream, and other sources with a manifest-level `lang: "hi"`. The README claims AnimeSalt has Hindi/Tamil/Telugu/English/Japanese tracks in a single HLS master, and AnimixStream has Hindi multi-audio HLS.
- This is a JavaScript scraper-plugin bundle for the Zangetsu app, not a documented public REST API for other clients. The repository's `package.json` sets `"private": true`; no LICENSE file was found at the repository root. No permission to port or redistribute those provider scripts is established.
- The manifest-level `lang: "hi"` is only a discovery label. Although its README describes a multi-audio source, there is no sample from a known episode proving the current audio-track list, default audio behavior, episode mapping, or playback in 7xAnime.
- No live network tests were run; the README's optional live test suite would access third-party sites, and there is no approved 7xAnime integration contract or code-reuse basis yet.

**Gate result: NO-GO for direct port; research lead only.** Do not copy the provider scripts while no license is declared. Any fresh implementation would still need a separate review of source terms, safe playback behavior, correct episode mapping, and how the 7xAnime player will select a Hindi audio track from a multi-audio master.

### Local-backend reassessment — official source is now the preferred direction

**Confirmed architecture:** the Android package's FastAPI server is on-device, but its current `/hindi/search` and `/hindi/stream` routes are a proxy to `anime-api-ashen-chi.vercel.app`. The transport wrapper is local; the catalogue/extraction implementation is still remote.

#### Candidate A — Muse India official YouTube channel (HOLD; preferred)

The [Muse India channel](https://www.youtube.com/channel/UCYYhAzgWuxPauRXdPpLAX3Q) is listed by YouTube as verified and describes itself as publishing copyrighted, legal anime content free on YouTube. Its public channel metadata includes a Hindi-dub anime section. See the [channel result](https://www.youtube.com/channel/UCYYhAzgWuxPauRXdPpLAX3Q), YouTube's [official embedded-player guidance](https://support.google.com/youtube/answer/171780), the [YouTube Data API Services Terms](https://developers.google.com/youtube/terms/api-services-terms-of-service), and the [official video-feed format reference](https://developers.google.com/youtube/data/guides/push_notifications).

**Preferred design:** use official YouTube video IDs and the official embedded player only. Do not download, unwrap, proxy, or extract direct video streams. Keep it as an optional source in the existing Hindi selector; do not touch the seven standard playback choices.

A no-key local-backend discovery experiment should use the channel feed URL documented by YouTube's current push-notification guide:

`https://www.youtube.com/xml/feeds/videos.xml?channel_id=UCYYhAzgWuxPauRXdPpLAX3Q`

The feed format is official, but the exact Muse India feed could not be live-fetched from this work environment: public DNS resolution is unavailable here and the web retrieval returned a cache miss. This is an **environment limitation**, not evidence the endpoint is offline. Channel feeds expose recent uploads (commonly the newest 15) rather than a complete historic episode catalogue, so the feed alone is not enough for reliable back-catalogue search. A Hindi-specific public playlist feed may improve coverage, but no playlist ID has been independently verified. [YouTube push-notifications guide](https://developers.google.com/youtube/data/guides/push_notifications?hl=en) · [recent-upload feed limits](https://hushread.com/blog/youtube-channel-rss-feed)

**Do not ship a YouTube Data API key inside the APK.** If playlist-based discovery needs the Data API, use an appropriately restricted project credential through a suitable owner-controlled backend or obtain a verified playlist ID by a permitted manual process. Respect the YouTube API Terms and keep the official player/branding/ads behavior intact.

**Episode-level examples found in YouTube's indexed metadata (not live playback tests):**

- [[Hindi Dub] Classroom of the Elite — Episode 08 | Muse IN](https://www.youtube.com/watch?v=0hU9TBeuZQQ) — search metadata identifies the uploader as the verified Muse India channel, published June 25, 2026.
- [[Hindi Dub] Cells at Work! — Episode 10 (S1E10) | Muse IN](https://www.youtube.com/watch?v=Tab-cFyTKp8) — search metadata identifies the uploader as the verified Muse India channel, published June 14, 2026.

These prove that identifiable official Hindi-dub episode records exist, but not that they are still playable, members of the live feed, or embeddable inside 7xAnime. The episode records are useful fixtures for strict title/episode parsing; they do not remove the feed-coverage gate.

**Android player compliance is a hard gate.** The app ID is `com.sevenx.anime` and Capacitor currently serves the app from the HTTPS local origin. The current Hindi iframe's `strict-origin-when-cross-origin` policy permits a referrer but does not itself prove that YouTube receives the required app identity. Google's player requirements say embedded clients must identify themselves with a `Referer` and provide the registered app ID in WebView scenarios where the browser does not provide it automatically. They also prohibit overlays covering any part of the YouTube player. The current custom player/miniplayer must therefore be tested for both referrer/error-153 behavior and whether custom close/mini controls overlap the standard YouTube UI. If satisfying these requirements would require a risky global Capacitor-origin change or covering native player controls, this provider is a NO-GO for the in-app player; do not weaken policy or disable YouTube features. [Required Minimum Functionality — identity, viewport, and overlays](https://developers.google.com/youtube/terms/required-minimum-functionality)

Qualification gate before any implementation:

1. Verify a current official Hindi-dub playlist/feed and sample its real XML response from a supported runtime.
2. Confirm a known video belongs to the official channel and is actually the correct show/episode; generic title overlap is insufficient.
3. Require explicit Hindi evidence in the video title or a verified Hindi-specific playlist, plus an unambiguous requested episode number. If season cannot be mapped, do not return the result.
4. Use a standard YouTube embed URL for the returned video ID and verify the embed works in the Android WebView/PlayerViewport, including playback controls and lifecycle behavior.
5. Keep the result as a separate optional Hindi stream. Existing Hindi lookup remains available if the official feed fails, has no match, or doesn't include the requested episode.

**Current decision: HOLD for source-coverage and device verification; best direction on permission and architecture.** The official channel is a valid source family to pursue, but no feed was live-tested and no playback has been verified in 7xAnime yet.

#### Candidate B — WatchAnimeWorld / AnimeWorldIndia scraper family (NO-GO for runtime integration)

The [MSMods-Pro/AnimeWorldIndia-Api](https://github.com/MSMods-Pro/AnimeWorldIndia-Api) repository declares an ISC code license and documents Hindi-language catalogue filtering, season episode lookup, and embed lookup. Its own README describes the tool as educational/research use and puts legal compliance on integrators. The inspected code identifies itself as a WatchAnimeWorld scraper, hardcodes `https://watchanimeworld.net`, and current discovery showed domain redirection. Its generic `servers[].url` contract does not confirm Hindi audio for an individual episode.

The code license covers the scraper code, **not** the underlying streamed shows or the website's media. No source-site authorization or sufficiently clear permission basis for integrating its scraped media was established. Do not port its scraper, create a Python clone of the extraction flow, or treat self-hosting as authorization. Revisit only if there is an explicit permission/authorized-content basis, stable documented contract, and episode-level evidence.

#### Other candidates

- **Tatakai API — HOLD, not selected:** public route advertises Hindi search, but the actual deployed response schema, integration terms, and episode-level language signal have not been verified; related repository license/use statements are inconsistent.
- **AnimeSalt / AnimixStream via Zangetsu manifest — research only:** technical multi-audio claims are interesting, but no reusable plugin license or 7xAnime API contract was established. Do not copy/port the manifest scripts.
- **AnimeHeaven/Anivault-Scraper, DesiDubAnime API, Renime-API, HiAnime/Aniwatch API, Anivexa, and unspecified Senshi integrations — NO-GO or unqualified** under the previous audit.

Keep the current ZeroTwo-Py Hindi catalogue and seven standard providers unchanged. No candidate has cleared the gate; this does not establish that any site/API is offline.

