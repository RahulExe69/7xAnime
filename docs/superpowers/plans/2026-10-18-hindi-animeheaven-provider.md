# Hindi AnimeHeaven Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Qualify and, only if evidence supports it, add AnimeHeaven as a separate, episode-verified source in the existing Hindi playback flow without changing 7xAnime's five standard servers.

**Architecture:** Begin with a source qualification gate. If an authorized and reachable API endpoint, usable contract, and Hindi-specific episode evidence are established, add an isolated adapter that normalizes and merges its candidates with the current Hindi results. Keep source selection explicit and keep candidate failure isolated from the existing Hindi source and standard playback.

**Tech Stack:** Next.js/React/TypeScript; existing Axios client and Hindi resolver; Android local FastAPI adapter only if needed; existing Python unittest/TestClient suite; Node's built-in test runner for isolated resolver utilities. Do not add a large test framework merely for this provider.

**Spec:** `docs/superpowers/specs/2026-10-18-hindi-animeheaven-provider-design.md`

**Execution status (2026-10-18):** The AnimeHeaven gate and the follow-up DesiDubAnime/Renime candidate sweep reached **NO-GO**. No reviewed candidate currently satisfies deployment/usage permission and episode-specific Hindi-evidence requirements. Runtime tasks 2–6 are intentionally blocked. See `docs/HINDI_DUB_PROVIDER_EVALUATION.md` for the full evidence record and reopening criteria.

## Global Constraints

- The standard playback list remains exactly MegaPlay, AniXo, Megavid, TryEmbed, and CinexStream.
- Hindi sources remain separate from `src/lib/server-map.ts`, `ACTIVE_PROVIDER_ORDER`, and the Android standard-provider packaging allowlist.
- Keep the existing Hindi source; candidate errors must not suppress valid results from it.
- Do not copy or port Anivault-Scraper implementation code; GitHub currently reports no declared repository license for that project.
- Do not guess or hard-code a public API base. The candidate is disabled unless an explicitly configured, permitted base is verified.
- A generic `dub` response or an embed URL does not prove Hindi audio or playable output.
- Use finite request timeouts and response-size limits; validate HTTPS URLs and redirect destinations for server-side requests; block loopback, private, link-local, and metadata-service destinations where inappropriate.
- No DRM circumvention, private-token/key bypass, arbitrary URL proxy, or user-controlled API base.
- Use test-first changes for runtime behavior. Do not run a build during the design/qualification phase; after implementation, run verification and a build only as agreed.
- Report API response, correct episode resolution, Hindi confirmation, and physical-device playback as separate evidence levels.

## Review Focus

1. **A generic dub is not Hindi.** Test that no candidate is marked Hindi without a source-language signal or an explicitly justified, episode-specific verification result. Owned by Tasks 1 and 3.
2. **Wrong sequel/season/episode matches.** Test that a title match alone cannot authorize a source result and that the selected episode identity is preserved. Owned by Tasks 1 and 3.
3. **Source outage must not erase existing results.** Test timeout, HTTP error, malformed JSON, and empty AnimeHeaven results while a valid current Hindi result remains available. Owned by Task 4.
4. **Duplicate wrappers must not create duplicate server buttons.** Test de-duplication using normalized URL and underlying source identity, without collapsing independent sources. Owned by Tasks 3 and 4.
5. **Unset or unsafe configuration must fail closed.** Test missing/invalid API base, non-HTTPS API URLs, unsafe returned URLs, and redirected destinations where server-side fetches are used. Owned by Tasks 1 and 3.

---

## Qualification Gate — do not execute implementation tasks unless this passes

### Task 1: Qualify the AnimeHeaven API and Hindi evidence

**Files:**
- Modify only if the gate fails or source facts change: `docs/HINDI_DUB_PROVIDER_EVALUATION.md`
- Read: upstream [Anivault-Scraper README](https://github.com/SH0MIK/Anivault-Scraper), [routes](https://github.com/SH0MIK/Anivault-Scraper/blob/main/src/routes.ts), [AnimeHeaven scraper description](https://github.com/SH0MIK/Anivault-Scraper/blob/main/src/scrapers/animeheaven.ts), and `src/lib/hindi-dub.ts`

**Produces:** A timestamped go/no-go record with exact deployment base and owner, API contract/revision, usage/reuse basis, CORS/reachability evidence from the intended client runtime, one correct title/episode mapping, explicit Hindi evidence, source uniqueness, and the remaining physical-playback limitation.

- [ ] **Step 1: Record existing facts before testing.** Capture the candidate's canonical repository/revision, missing declared license, documented route contract, existing source overlap, and 7xAnime's current Hindi API behavior. Do not copy upstream scraper code.
- [ ] **Step 2: Identify a permitted real API deployment.** Use only a documented or owner-authorized API base. Do not infer a Railway/Vercel hostname from a repository name. If no permitted deployment exists, stop and record that no runtime integration can be shipped without an owner-authorized service or separately approved hosting plan.
- [ ] **Step 3: Confirm contract and usage terms.** Verify the exact search → info/ID mapping → episodes → servers → strict watch response fields and whether responses expose a Hindi-specific language signal. A health check, generic `type=dub`, or returned embed URL alone is insufficient.
- [ ] **Step 4: Test one known episode conservatively.** Confirm the exact series and episode mapping, ensure strict mode does not silently use another source, and record source language evidence without logging signed URLs, cookies, tokens, or private headers. If there is no reliable Hindi proof or the usage basis is unclear, mark NO-GO.
- [ ] **Step 5: Update the evaluation record.** Document date, sanitized request/response facts, deployment provenance, episode match, Hindi evidence, and GO/NO-GO decision. Do not expose raw signed URLs or private headers.
- [ ] **Step 6: Apply the gate.** If NO-GO, make no runtime changes, run no build, and finish by reporting the exact blocker. If GO, proceed through the following tasks.

Expected output: a justified GO or NO-GO, not a provider button.

---

## Conditional implementation tasks (only after Task 1 is GO)

### Task 2: Add focused test coverage for Hindi-source normalization

**Files:**
- Create: `src/lib/hindi-provider-normalization.mjs`
- Create: `src/lib/hindi-provider-normalization.d.mts`
- Create: `tests/hindi-provider-normalization.test.mjs`

**Interfaces:**
- Export `isSafeHttpsUrl(value: unknown, allowedHosts?: string[]): value is string`, `hasExplicitHindiEvidence(value: unknown): boolean`, and `dedupeHindiCandidates<T extends { sourceId: string; embed: string }>(candidates: T[]): T[]`.
- `hasExplicitHindiEvidence` returns true only for an explicit Hindi-specific language value from the qualified schema; generic values such as `dub`, `English`, missing fields, and guessed title matches return false.
- Keep these helpers independent of React, Axios, and app-level imports so the Node built-in test runner exercises the same production logic without new dependencies.
- The declaration file must match the actual .mjs exports exactly and provide the TypeScript types consumed by the existing resolver.

- [ ] **Step 1: Write failing tests** with Node's `node:test` and `node:assert/strict` for valid candidate normalization, malformed responses, generic-dub rejection, invalid schemes, unsafe URLs, and duplicate URL/source identity.
- [ ] **Step 2: Run the focused tests** with `node --test tests/hindi-provider-normalization.test.mjs`. Expected: FAIL because the new helpers are not implemented.
- [ ] **Step 3: Implement the minimal pure helpers** in `src/lib/hindi-provider-normalization.mjs` and mirror their exact signatures in its declaration file.
- [ ] **Step 4: Re-run the focused tests**. Expected: PASS with assertions on normalized records and rejection conditions.
- [ ] **Step 5: Commit** as `feat: add tested Hindi provider normalization helpers`.

### Task 3: Add a disabled-by-default AnimeHeaven adapter

**Files:**
- Create: `src/lib/hindi-providers/animeheaven.mjs`
- Create: `src/lib/hindi-providers/animeheaven.d.mts`
- Create: `tests/hindi-animeheaven.test.mjs`
- Modify configuration docs only after Task 1 confirms the endpoint and terms

**Interfaces:**
- Export `getAnimeHeavenHindiStreams(input: AnimeHeavenInput): Promise<AnimeHeavenStreamCandidate[]>` from the .mjs module and define the same signature in the declaration file.
- `AnimeHeavenInput` contains `titles: string[]`, `episode: number`, `apiBase: string | undefined`, and `requestJson(url: string, params: Record<string, string | number>, options: { timeoutMs: number; maxBytes: number }): Promise<unknown>` for deterministic tests.
- `AnimeHeavenStreamCandidate` contains `sourceId: "animeheaven"`, `sourceLabel: "AnimeHeaven"`, `languageEvidence: "explicit-hindi-metadata"`, `server: string`, `embed: string`, `host: string`, `seriesTitle: string`, `seriesId: string`, `season: number`, and `episode: number`.
- The adapter returns an empty array with a sanitized internal failure outcome when disabled or when resolution fails; it must not throw into the primary watch path. An AnimeHeaven candidate is emitted only when the confirmed response contains explicit Hindi-specific evidence; a generic `dub` value must be rejected.
- Read the base only from `NEXT_PUBLIC_HINDI_ANIMEHEAVEN_API_BASE`, passed into the adapter by the existing client-side module. Treat the base as public configuration, not a secret; validate HTTPS and host, and stay disabled if absent or invalid.
- Keep resolver/adapter calls bounded by timeouts, candidate counts, and response-size limits. Because the client requests the verified API directly, test actual browser/WebView CORS; if the direct path cannot work, stop and revisit the architecture instead of adding an arbitrary proxy.

- [ ] **Step 1: Write failing adapter tests** for disabled configuration, title lookup, correct episode mapping, explicit Hindi evidence, invalid payload, HTTP error, timeout, non-HTTPS API base, unsafe result URL, redirect behavior, oversized response, and strict-source response behavior. Include one near-match title and one wrong episode case.
- [ ] **Step 2: Run the focused tests** with `node --test tests/hindi-animeheaven.test.mjs` and verify failure is caused by missing adapter behavior, not test/setup errors.
- [ ] **Step 3: Implement the minimum adapter** using only confirmed route parameters and response fields from Task 1. Keep request count bounded, apply finite timeouts/response limits, bound the candidate count, validate URLs, and avoid logging raw upstream bodies or signed URLs.
- [ ] **Step 4: Re-run focused tests**. Expected: PASS, with source failures becoming local results rather than rejecting the primary watch query.
- [ ] **Step 5: Commit** as `feat: add isolated AnimeHeaven Hindi adapter`.

Do not create a generic proxy route. If qualification proves direct requests cannot work, stop before implementation and revise the spec rather than slipping a backend deployment into this change.

### Task 4: Aggregate the new source without regressing current Hindi results

**Files:**
- Modify: `src/lib/hindi-dub.ts`
- Test: `tests/hindi-animeheaven.test.mjs` or the established resolver-test file
- Modify only if necessary: existing Hindi API tests in `.github/scripts/test-local-anime-backend.py`

**Interfaces:**
- Preserve the current export signature `getHindiDubStreams(titles: string[], episode: number)`.
- Extend `HindiDubStream` with required `sourceId: "community-hindi" | "animeheaven"`, `sourceLabel: string`, and `languageEvidence: "hindi-catalogue-contract" | "explicit-hindi-metadata"` fields. Assign the current catalogue's fixed source/evidence values at its normalization boundary; map Task 3's `AnimeHeavenStreamCandidate[]` to the AnimeHeaven values without weakening its evidence requirement.
- Merge candidates into the same `HindiDubStream[]` array shape. Keep `matchedTitle` meaningful for the current source and avoid presenting source-specific matching data as a global match.

- [ ] **Step 1: Write failing orchestration tests**: a timeout or invalid response from AnimeHeaven does not suppress a valid existing Hindi candidate; a valid distinct candidate is included; identical URLs/underlying sources collapse to one option; results for the wrong episode are excluded.
- [ ] **Step 2: Run the focused tests** and verify the expected failures.
- [ ] **Step 3: Implement bounded source aggregation**. Choose sequential or bounded concurrent lookups based on the current resolver timings; never let the optional source make ordinary SUB/ENGLISH playback wait. Preserve the original source when the new source is unavailable.
- [ ] **Step 4: Run the focused tests**, then run existing backend contract tests if backend code changed. Expected: all relevant tests pass, current Hindi behavior is retained, and all five standard provider definitions remain unchanged.
- [ ] **Step 5: Commit** as `feat: merge qualified AnimeHeaven Hindi results`.

### Task 5: Display honest source choices in the existing Hindi selector

**Files:**
- Modify: `src/app/anime/watch/video-player-section.tsx`
- Test: focused normalization/resolver tests plus TypeScript and lint checks

**Interfaces:**
- Keep the existing SUB / ENGLISH / HINDI controls and the distinct Hindi server row.
- Use stable source labels supplied by the normalized result, falling back to the current source label for existing catalogue entries.
- Do not change standard server numbers or standard-server selection logic.

- [ ] **Step 1: Add/extend a failing pure test** to assert that source label/identity survive normalization and that duplicate source options are not separately surfaced.
- [ ] **Step 2: Verify the test fails** for the missing source identity/label behavior.
- [ ] **Step 3: Make the minimal UI change** needed to display the genuine source label and host, without redesigning the player controls.
- [ ] **Step 4: Run focused tests plus the available lint/typecheck commands**. Do not trigger an APK/release build unless separately requested. Verify that Hindi remains hidden when there is no episode-verified Hindi result.
- [ ] **Step 5: Commit** as `feat: label Hindi playback sources accurately`.

### Task 6: Final regression review and evidence record

**Rollback check:** Confirm every new runtime path is behind the explicit validated configuration and can be disabled by removing that setting. If review uncovers a provider-specific regression, revert the adapter/resolver/UI commits as a unit; the existing catalogue and five standard servers must continue to work.

**Files:**
- Create: `tests/standard-server-regression.test.mjs`
- Modify: `docs/HINDI_DUB_PROVIDER_EVALUATION.md`
- Modify: `docs/SELF_HOSTING.md` to document `NEXT_PUBLIC_HINDI_ANIMEHEAVEN_API_BASE` only if the source qualifies and the setting is supported by existing build configuration
- Modify: `docs/SERVERS.md` only if the new source has genuinely passed support criteria, and keep it in a separate Hindi section
- Read-only regression targets: `src/lib/server-map.ts`, `android-local-backend/local_api.py`, `.github/scripts/configure-local-anime-backend.py`

- [ ] **Step 1: Write the regression assertion** in `tests/standard-server-regression.test.mjs` using Node's built-in test runner. Assert the frontend and Python registry contain exactly `anixo`, `megavid`, `tryembed`, and `cinexstream`; assert the Android packaging list matches those four; assert MegaPlay remains Server 1/default/fallback and no Hindi-only source is registered in the standard list.
- [ ] **Step 2: Run the regression test** with `node --test tests/standard-server-regression.test.mjs`. Expected: PASS against the current standard registry. If it fails, stop and investigate the pre-existing mismatch instead of editing the production registries to make the test pass.
- [ ] **Step 3: Record evidence states separately** in `docs/HINDI_DUB_PROVIDER_EVALUATION.md`: API responds, episode resolves, Hindi confirmed, and playback verified. Set playback verified only after physical-device test.
- [ ] **Step 4: Run the full relevant test suite**: `node --test tests/hindi-provider-normalization.test.mjs tests/hindi-animeheaven.test.mjs tests/standard-server-regression.test.mjs`, `npm run lint`, `npx tsc --noEmit` where compatible with repository settings, and `python .github/scripts/test-local-anime-backend.py` if Python backend files or contracts changed. Record any pre-existing failures by name.
- [ ] **Step 5: Review final diff** against the spec, verify the standard server map/order/build packaging remain unchanged, and commit as `test: verify Hindi provider isolation and record evidence`.
- [ ] **Step 6: Open a PR** from `feat/hindi-animeheaven-provider` to `master`, with test results, endpoint evidence and explicit statement that physical Android playback is unverified unless a device test actually occurred.

## Final implementation report

The final report must say one of the following:

- **GO shipped for review:** exact permitted endpoint/configuration identified, unit/contract tests passed, regression list unchanged, and physical-device playback status accurately stated.
- **NO-GO / runtime unchanged:** explain the concrete blocker (for example: no authorized deployment, unclear usage terms, absent Hindi-specific signal, or incorrect episode mapping) and link the updated evaluation record.

A successful typecheck/build must never be described as proof that the third-party stream plays. Do not merge the PR or trigger a release build unless explicitly directed.

## Continuation checkpoint — further Hindi-source qualification (2026-10-18)

The AnimeHeaven gate remained NO-GO, so a bounded next-candidate sweep was recorded before considering any runtime changes:

- **DesiDubAnime API — NO-GO:** The repository documents a Hindi catalogue route but no authorized existing public API base; its repository `LICENSE` file was not found; the source site's DMCA notice contains a private-use-only statement; and no episode-specific Hindi/audio playback evidence was gathered.
- **Renime-API — NO-GO:** The project README declares an ISC code license and lists AnimeSalt/WatchAnimeWorld upstreams, but documents a local-only API base and educational/research use. The code license does not grant rights from those upstream sites, and a specific episode's Hindi audio signal was not established.
- **Ruling:** Stop before Tasks 2–6. Do not add an adapter, deploy/fork an unapproved scraper service, guess a public API base, modify providers, or run a build. This costs additional evaluation time and delays a potentially useful provider, but avoids enabling an endpoint or audio label without the plan's required evidence.
- **Reopen criteria:** An authorized deployment or explicitly approved self-hosting plan; a clear usage basis for the scraper code and upstream sources; an exact contract; episode-specific Hindi evidence; then bounded resolution and later physical-device playback verification.
- The live Android playback status for all these candidates remains **unverified**. Existing Hindi playback and the five standard provider definitions remain untouched.

See `docs/HINDI_DUB_PROVIDER_EVALUATION.md` for the evidence record and source links.

