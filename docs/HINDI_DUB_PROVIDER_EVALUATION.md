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

The supported standard server choices remain exactly five:

1. MegaPlay — Server 1 and the default/final fallback.
2. AniXo.
3. Megavid.
4. TryEmbed.
5. CinexStream.

See [SERVERS.md](SERVERS.md), the source of truth for the active list and Android packaging allowlist. MegaPlay and its fallback role are not two different providers.

The Android local Python backend packages the existing shared catalogue/context code and only the four existing extra adapters (AniXo, Megavid, TryEmbed, CinexStream). The other legacy Kuhi adapters are intentionally pruned.

### Existing Hindi route

[SERVERS.md](SERVERS.md) documents an existing separate Hindi-dub feature using the community ZeroTwo-Py/anime-api catalogue through the /hindi/search and /hindi/stream routes. This route is distinct from the five standard SUB/ENGLISH playback choices.

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
3. **Preserve the five-server list.** Do not renumber standard servers or make a Hindi candidate look like a duplicate standard server. Hindi selection remains separate and available only when actually confirmed for the episode.
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

Until those facts are available, leave the current Hindi catalogue and the five standard servers unchanged. Revisit this candidate only after an authorized deployment and source-language evidence are available. This is a qualification failure, not proof that AnimeHeaven itself is offline.
