# Hindi AnimeHeaven Provider — Design Specification

**Date:** 2026-10-18  
**Status:** Historical AnimeHeaven design; no runtime implementation approved. The current candidate selection is superseded by [HINDI_DUB_PROVIDER_EVALUATION.md](../../HINDI_DUB_PROVIDER_EVALUATION.md): WatchAnimeWorld / AnimeWorldIndia is the next local-native evaluation lead, but remains HOLD until site-term, episode-identity, Hindi-evidence, and playback gates pass.  
**Working branch:** feat/hindi-animeheaven-provider  
**Repository:** RahulExe69/7xAnime

## 1. Goal

Evaluate and, only if the source passes the gates in this spec, add AnimeHeaven as an isolated additional source in 7xAnime's existing Hindi playback flow. The feature must expand episode-level Hindi availability without changing the standard playback servers, damaging the existing Hindi catalogue, creating a duplicate source entry, or claiming playback works without evidence.

The first task in the implementation plan is a qualification gate: identify an authorized, reachable API deployment and confirm its API contract and usage/reuse terms. The upstream repository [SH0MIK/Anivault-Scraper](https://github.com/SH0MIK/Anivault-Scraper) currently exposes no declared repository license through GitHub metadata, and no independently verified public API base has been established in the current audit. Its README's source-status claims are statements by that project's maintainers, not evidence that an episode plays in 7xAnime. **Do not copy or port its scraper implementation.** If a permitted, usable endpoint cannot be established, stop the integration work at the qualification gate and report the blocker rather than ship a non-working provider.

## 2. Current state and constraints

- The standard playback list is exactly five: MegaPlay (Server 1/default/final fallback), AniXo, Megavid, TryEmbed, and CinexStream. This feature must not register anything in src/lib/server-map.ts, ACTIVE_PROVIDER_ORDER, or the Android provider-packaging allowlist.
- Hindi is already a separate path. src/lib/hindi-dub.ts resolves titles against the community catalogue at https://anime-api-ashen-chi.vercel.app/api; the Android local backend proxies fixed /hindi/search and /hindi/stream routes. The watch UI conditionally presents Hindi and a distinct Hindi server selector.
- The existing flow should remain usable when the new source is unavailable, slow, disabled, or returns no match. Candidate failures must not break or delay ordinary SUB/ENGLISH playback.
- AnimeHeaven may be a separate source from the existing community catalogue, while Anikoto can overlap the legacy Kuhi source family. This design targets AnimeHeaven only; Anikoto is not a second entry in this change.
- A generic dub result does not, by itself, prove the audio is Hindi. Series metadata or the presence of a language selector is not enough evidence either.

## 3. User experience

1. Preserve the current compact SUB / ENGLISH / HINDI language controls and the separate Hindi server row.
2. Continue to show HINDI only when at least one Hindi stream resolves for the currently selected episode and passes the language-evidence rule below.
3. Keep the existing Hindi provider available as a fallback source. Add AnimeHeaven results as distinct, clearly attributed options only after the candidate has passed the qualification gate.
4. Label each choice with a stable, human-readable source name and a useful host/source hint when available. Deduplicate identical embed/stream URLs and do not show multiple choices that only wrap the same underlying source.
5. Switching to a Hindi server remains an explicit user action. A failed manual selection must not silently substitute an unrelated source or switch the user out of Hindi mode. The user may manually choose another returned Hindi source.
6. No empty or placeholder provider button, no fabricated “Hindi available” badge, and no new standard-server numbering.

### Hindi evidence levels

Keep evidence states distinct in code, logs, tests, and documentation:

- **API responds:** the candidate endpoint returned a well-formed response.
- **Episode resolves:** the returned record matches the selected anime, season, and episode.
- **Hindi supported:** the source response or independently verified episode evidence confirms Hindi audio for this episode—not merely any dub.
- **Playback verified:** video and Hindi audio were confirmed on a physical Android device using the intended app/player build.

Only the states supported by available evidence may be claimed. For initial UI eligibility, require episode resolution and Hindi-specific evidence. Mark physical playback as unverified until actually tested on device.

## 4. Architecture

### 4.1 Isolated adapter

Keep the new source-specific logic in a small adapter boundary used by the existing Hindi resolver. Do not import the AniVault project, its dependency tree, or its scraper files. Do not introduce a Node.js service into the Android APK as part of this change.

The adapter should accept a normalized title set plus the requested episode (and season/part information when the existing model makes it available). It should return normalized Hindi stream candidates, including:

- a stable source/provider ID (for example, animeheaven);
- a display label;
- resolved episode identity and any trustworthy match evidence;
- an HTTPS embed or stream URL, media type, and required public playback metadata where supported;
- the underlying host/source identity needed for deduplication and diagnostics;
- an explicit language-evidence field that can distinguish verified Hindi from an unspecified dub.

Do not assume Anivault's README examples fully specify its current response shape. Confirm exact schemas against the selected API revision and its live authorized deployment before writing the adapter.

### 4.2 Source configuration

The candidate must be disabled by default until a concrete, permitted API base has been verified and deliberately configured. Do not hard-code a guessed public host. Prefer a deployment controlled by the project owner or a source whose public API/usage terms explicitly support this use. If the integration requires a separately hosted service, document its ownership, deployment, uptime, network/privacy implications, and ongoing maintenance before enabling the client.

Only a fixed, validated base URL and the known AnimeHeaven route family may be used. Do not expose a generic proxy endpoint that fetches arbitrary user-supplied URLs. Validate redirects and destination hosts where this code performs server-side fetches. Bound request timeout, concurrency, response size, and returned candidate count.

### 4.3 Resolution and normalization

- Resolve catalogue identity and episode numbers conservatively. Do not treat a fuzzy title match as definitive; compare alternate titles, year/season where available, and episode numbering.
- Keep per-source IDs isolated. Never reuse an ID from the current Hindi catalogue as an AnimeHeaven ID.
- Normalize adapter results before the UI sees them. Keep source-specific raw response payloads out of UI components and logs.
- Deduplicate candidates by normalized underlying source identity and URL, while preserving distinct source options when they genuinely lead to independent playback.
- Treat “no result,” timeout, invalid response, wrong episode, unsupported media, and upstream failure as different internal outcomes, but return a safe user-facing message without leaking signed URLs, tokens, cookies, or private headers.

### 4.4 Failure isolation and fallback

- Failure of the new source must not throw away results from the current Hindi catalogue.
- The initial implementation may query the two adapters concurrently only if it uses a small bounded concurrency and each operation has its own timeout. Otherwise, query the new source after the existing source so it cannot delay the current behaviour. The implementation plan must choose the simplest approach consistent with current code and timing.
- Fallback from a failed manual source must remain explicit. Do not silently play another source under the originally selected server label.
- Use bounded cache lifetimes for metadata/results if needed; do not permanently cache request errors as missing episodes.
- Keep diagnostics sanitized and scoped to the selected episode/source.

## 5. API and integration qualification gate

Before runtime integration, record the exact API base URL and owner, deployment status, endpoint schemas, API version/revision, source identity, usage terms, and the date of the check.

Use the documented AnimeHeaven flow only as a starting point for schema inspection: search/ID mapping, episode mapping, server discovery for the requested episode, and strict watch resolution. Verify that the API can return the correct series and episode and does not silently fall through to another source. A health endpoint that returns “ok” is not enough; server/source status in a response is not enough; an embed URL being returned is not proof of playback.

Do not bypass DRM, authentication, paywalls, access controls, or private token/key protections. If the candidate requires that, or usage/reuse rights are unclear, do not integrate it. Record the reason in docs/HINDI_DUB_PROVIDER_EVALUATION.md and stop this candidate.

## 6. Error handling and security

- Use finite connection/read timeouts, bounded redirects and response size, and a bounded number of title/episode candidates.
- Restrict accepted schemes to HTTPS for the external configured API and to the supported schemes/media types for returned playback records. Reject malformed URLs.
- For server-side requests, block loopback, private, link-local, and metadata-service destinations where inappropriate; revalidate redirect destinations. The configured API base must not be user-controlled.
- Do not allow the new adapter to become a generic fetch/proxy primitive.
- Sanitize errors and never log full signed URLs, cookies, authorization headers, token/key/signature query values, or raw upstream bodies.
- Ensure provider failure is isolated from the app's primary watch page and does not block the existing Hindi or standard flows.

## 7. Tests and verification

Use test-driven development for every runtime behavior change: write a focused failing test, run it to confirm the expected failure, implement the smallest fix, then rerun it and the full relevant suite.

Required automated coverage:

- parses valid candidate search/server/watch responses and rejects malformed payloads;
- only accepts the selected episode/season and never labels a generic dub as Hindi without language evidence;
- treats timeout, non-success status, bad JSON, unsupported scheme, and empty results as isolated source failures;
- deduplicates identical source URLs and preserves genuinely distinct source identities;
- a failed new source does not suppress valid results from the current Hindi source;
- a manual selection never silently returns an unrelated provider's result;
- new provider remains disabled when its API base is absent or invalid;
- standard server registry, ordering, MegaPlay default/fallback, and Android packaging allowlist remain unchanged;
- Python /hindi/search and /hindi/stream contract tests remain green if backend files are touched.

Verification levels must be reported honestly and separately:

1. unit/contract tests;
2. application lint/typecheck/build (run only after implementation is approved and complete; no build as part of writing this spec);
3. test from the actual deployed endpoint and record sanitized evidence;
4. physical Android playback test for at least one known Hindi episode, including seek and a source failure/retry.

Do not claim step 3 or 4 if it has not been performed. A green build is not evidence that a third-party stream works.

## 8. Scope boundaries and acceptance criteria

### In scope

- Qualification of one candidate source: AnimeHeaven via a permitted API.
- One isolated adapter and its minimal configuration only if the qualification gate passes.
- Normalized source identity and episode-specific Hindi evidence.
- Minimal integration into the existing Hindi resolver and source-choice UI, with regression tests.
- Update docs/SERVERS.md only if the new Hindi source has genuinely become supported, while keeping it clearly separate from the five standard servers; update docs/HINDI_DUB_PROVIDER_EVALUATION.md with evidence and limitations.

### Out of scope

- Changing MegaPlay, AniXo, Megavid, TryEmbed, or CinexStream.
- Replacing, renaming, or removing the current Hindi catalogue.
- Registering Hindi sources in src/lib/server-map.ts or Android standard-provider registries.
- Enabling an unverified public endpoint by default.
- Copying unlicensed Anivault code, adding its complete service/dependency stack, or implementing an arbitrary remote proxy.
- Implementing HiAnime/MegaCloud extraction, Anikoto, Consumet, Anify, or unrelated candidate providers in the same change.
- Claiming all episodes have Hindi simply because one episode resolves.

### Done means

The candidate either (A) passes qualification and is implemented behind a deliberate, validated configuration with passing tests, no regression in current sources, and clearly reported playback-verification status; or (B) fails qualification and the runtime remains unchanged while the research log records the exact blocker and evidence. A non-working provider must never be exposed merely to make the picker look fuller.

## 9. Rollback

Because the change is isolated to its own feature branch and adapter boundary, rollback consists of reverting the adapter/resolver/UI commits and any related tests/docs. No database migration or standard-provider registry change is expected. The current Hindi catalogue remains the baseline throughout.

## 10. Files likely to be affected if qualification passes

- src/lib/hindi-dub.ts — adapter contract, normalization and aggregation.
- src/app/anime/watch/video-player-section.tsx — only the minimal source labeling/selection changes needed.
- android-local-backend/local_api.py and .github/scripts/test-local-anime-backend.py — only if an authenticated fixed-route proxy is actually required by the selected architecture; avoid touching otherwise.
- Focused tests for the TypeScript resolver, using the repository's current test tooling if available; do not introduce a large testing dependency just for this adapter.
- docs/HINDI_DUB_PROVIDER_EVALUATION.md and possibly docs/SERVERS.md only after the implementation status is evidenced.

Do not pre-commit to touching every file in this list. Inspect the concrete endpoint and existing test tooling first, then keep the implementation smaller if possible.
