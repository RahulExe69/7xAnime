# Muse India Official Hindi Source — Qualification and Integration Plan

**Date:** 2026-10-18  
**Status:** Qualification only — no runtime implementation or build approved  
**Repository:** RahulExe69/7xAnime  
**Related evaluation:** `docs/HINDI_DUB_PROVIDER_EVALUATION.md`

## Goal

Qualify a supplementary Hindi source based on videos published by the verified [Muse India YouTube channel](https://www.youtube.com/channel/UCYYhAzgWuxPauRXdPpLAX3Q). If the source's feed supports reliable episode matching, integrate it into the existing Hindi selector using only official YouTube video IDs and the official embedded player. The five standard SUB/ENGLISH providers and current Hindi source must remain unchanged.

## Why this candidate

YouTube's channel record marks Muse India as verified and describes its uploads as licensed, legal anime content. The channel metadata exposes a Hindi-dub section. YouTube documents the Atom video feed pattern in its [Data API push-notifications guide](https://developers.google.com/youtube/data/guides/push_notifications), and documents its [official embedded player](https://support.google.com/youtube/answer/171780).

Initial channel feed:

```
https://www.youtube.com/feeds/videos.xml?channel_id=UCYYhAzgWuxPauRXdPpLAX3Q
```

This is a feed-based discovery lead, not yet a proven full catalogue. The exact live feed could not be fetched from the current work environment, and channel feeds typically expose only recent uploads. The feed alone may not cover older episodes. No Hindi-specific playlist ID has yet been confirmed.

## Non-negotiable boundaries

- Do not extract, download, unwrap, proxy, or reconstruct direct YouTube media streams. Return an official video embed URL only.
- Do not scrape YouTube HTML or call undocumented internal endpoints to discover playlists.
- Do not package a YouTube Data API key or other credential in the APK. If the Data API becomes necessary, use a suitably configured owner-controlled service or a verified, public playlist feed; account for YouTube's API terms and developer policies.
- Verify the official channel/video identity and an episode-specific Hindi signal. A generic word such as `dub`, a title similarity, or an unrelated video returned from the feed is not sufficient.
- Never map an episode if season or episode number is ambiguous. Prefer no result over a wrong episode.
- Keep this source separate from `src/lib/server-map.ts`, `ACTIVE_PROVIDER_ORDER`, and the Android standard-provider allowlist.
- Keep the existing ZeroTwo-Py-backed Hindi source as fallback. A feed failure must not erase its valid results or block normal SUB/ENGLISH playback.
- No build during this qualification phase.

## Qualification gate — complete before changing runtime code

### Task 1: Verify current feed and coverage

- [ ] Fetch the official channel feed from a supported network runtime and record status, content type, response shape, and the channel ID included in entries.
- [ ] Confirm whether recent feed entries include full episodes or only trailers/promos and whether Hindi is explicit in title metadata.
- [ ] Search the official channel's public playlists manually and identify a Hindi-dub playlist only if its playlist ID is explicitly exposed by the channel. Do not infer IDs or scrape HTML.
- [ ] Determine the true coverage limit. If only 15 recent uploads are available and no Hindi playlist feed exists, classify it as a recent-uploads supplement rather than a general Hindi episode source.
- [ ] Use the officially documented feed URL `https://www.youtube.com/xml/feeds/videos.xml?channel_id=UCYYhAzgWuxPauRXdPpLAX3Q`. If the audit environment cannot resolve YouTube, mark the fetch blocked by environment and do not report the feed as down.
- [ ] Use known official episode metadata as fixtures only: Classroom of the Elite Episode 08 (`0hU9TBeuZQQ`, published 2026-06-25) and Cells at Work! S1E10 (`Tab-cFyTKp8`, published 2026-06-14). These are indexed metadata, not verified feed membership or live embed playback.

### Task 2: Verify title and episode mapping

- [ ] Pick one currently public full episode published by the official channel.
- [ ] Record the source title, video ID, explicit Hindi signal, season/episode markers, and availability in the supported feed.
- [ ] Verify the catalogue identity against the title options 7xAnime already passes to `getHindiDubStreams`.
- [ ] Prove strict matching can select the requested episode without mixing seasons or accepting shorts, trailers, previews, or unrelated results.
- [ ] If the feed doesn't carry enough identity information, stop and record NO-GO for automatic episode matching.

### Task 3: Verify player compatibility

- [ ] Construct only `https://www.youtube.com/embed/{videoId}` after validating the video ID format and source identity.
- [ ] Test the embed inside the current Android `PlayerViewport` and existing iframe policy, including autoplay requirements, Back behavior, app background/foreground, and Picture-in-Picture interaction.
- [ ] Confirm YouTube receives an allowed app identity/referrer in the Capacitor WebView (`com.sevenx.anime`); treat Error 153 or blocked playback as a failed gate, not a reason to bypass player safeguards.
- [ ] Verify 7xAnime's mini-player, close affordances, swipe/fullscreen transitions, and any custom controls never obscure YouTube's player surface/controls. If the standard YouTube UI cannot remain unobstructed, do not ship this source inside `PlayerViewport`.
- [ ] Confirm the video stays playable using YouTube's player controls and doesn't depend on direct-stream extraction.
- [ ] A returned feed entry is not evidence of playable video; report physical Android playback separately.

### Gate decision

Proceed only if Tasks 1–3 pass for at least one known episode and the result is useful enough to justify a narrowly scoped feature. Otherwise make no runtime changes and record the exact limitation.

## Conditional implementation (only after GO)

### Task 4: Add an isolated local feed route

- [ ] Add a small helper using Python's standard-library XML parser; do not add Node.js or new Python dependencies to the APK.
- [ ] Fetch only the fixed official channel/verified playlist feed URLs over HTTPS. Bound timeout and response size; don't accept arbitrary feed URLs from query parameters.
- [ ] Parse Atom title, published time, channel ID, video ID, and video link. Reject malformed entries, unexpected channel IDs, duplicate video IDs, and non-HTTPS media destinations.
- [ ] Cache successful feed results briefly in memory. Do not cache errors as "no Hindi episode".
- [ ] Return safe normalized metadata to the local client, never raw XML or untrusted HTML.

### Task 5: Merge with the existing Hindi resolver

- [ ] Add an isolated function to `src/lib/hindi-dub.ts` that asks the local route for candidate feed entries when the local backend is enabled.
- [ ] The official candidate lookup must have its own short timeout and failure boundary; existing Hindi results remain available even when the official feed fails.
- [ ] Merge candidates instead of replacing the existing result. De-duplicate by YouTube video ID and return only official player embed URLs.
- [ ] Require exact title/alias match, explicit Hindi evidence, and exact requested episode number. Do not invent season matching or infer Hindi from generic dub labels.
- [ ] Consider whether the current function signature needs season metadata; if season cannot be resolved, fail closed rather than widening the match.
- [ ] Keep `hasHindiDubForAnime` strict. A recent upload is not proof that episode 1 or the full series is available.

### Task 6: Automated verification

- [ ] Add fixture-based Python tests for well-formed Atom entries, incorrect channel IDs, missing video IDs, malformed XML, unsafe URLs, duplicate IDs, wrong episode numbers, and false-positive Hindi matches.
- [ ] Add focused TypeScript tests for stream merging and failure isolation using the existing test tooling. Do not add a large test framework for this feature.
- [ ] Run only focused tests first. Do not build until the user approves the implementation phase.
- [ ] After a GO implementation, install a debug APK and verify a real video on a physical Android device before describing the source as supported.

## Expected outcome

A written GO/NO-GO with a real feed sample, source provenance, episode match, Hindi evidence, player compatibility, and known coverage limits. This plan does not approve an integration merely because the channel is verified.
