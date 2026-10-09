# 7xAnime player marathon

The original four-phase player updates have been merged into `master`. CI verifies compile/package behaviour, but physical-device playback is still required before calling the player experience production-ready. The follow-up native filter-list proof of concept is described in [ANDROID-ADBLOCKING.md](ANDROID-ADBLOCKING.md) and remains a separate, device-test-gated change.

## Phase 1 — Ad and redirect protection

The Android WebView now blocks requests to a conservative list of common advertising/redirect domains, rejects pop-up windows, cancels remote JavaScript alert/confirm/prompt dialogs, and denies remote WebView permission requests. The existing navigation guard keeps external top-level pages from replacing the app.

This is best-effort filtering, not a universal ad blocker. Ads loaded from the same host as a player, in-page HTML overlays, obfuscated scripts, new ad domains, and some service-worker paths may still appear. Overblocking can break player bootstrap/video requests, so provider hosts are not blanket-blocked. If a source is stuck, the viewer can select another server.

## Phase 2 — Fullscreen, landscape and swipe

- The app's player viewport has a fullscreen control that requests native immersive landscape mode on Android.
- Swipe up/down on the app-owned player surface enters/exits fullscreen; a narrow edge rail handles cross-origin embeds whose touch events cannot bubble into the app.
- The Android WebChromeClient supports a provider's native HTML video fullscreen custom view, immersive system bars, swipe-down on its edge rail and Back-to-exit handling.
- Esc/Back exits the app-owned fullscreen viewport first. When a provider owns the native fullscreen view, Android Back exits that view before leaving the episode.
- Portrait is restored when leaving fullscreen in the native app.

Cross-origin iframe players control their own controls and touch gestures. Some providers may ignore the app-owned swipe or fullscreen overlay; their own fullscreen button should route through Android's WebChromeClient when their player uses the standard HTML fullscreen API. Verify this behaviour on physical Android.

## Phase 3 — Double-tap ±10 seconds

In 7xAnime's ArtPlayer player, double-tapping the left half seeks backward 10 seconds and the right half seeks forward 10 seconds, with a brief visual indicator. Single taps are delayed briefly to distinguish them from double-taps and toggle playback. ArtPlayer's own double-click fullscreen action is disabled so it does not conflict with seeking.

Third-party iframe players own their media element; 7xAnime cannot override their internal double-tap logic or seek them cross-origin. Such players keep their own gesture behaviour.

## Phase 4 — Regression and release gate

The Android workflow now checks native player/ad-filter wiring in addition to the packaged Python provider smoke test, mocked backend contracts, static export, and Gradle build. After CI passes, manually test:
- MegaPlay Server 1 and every manual server choice, including AnimeParadise and the four Yomi-derived routes.
- Known popup/confirm scams, navigation attempts and legitimate playback after ad filtering.
- Fullscreen enter/exit by button, swipe, Android Back, and provider-native fullscreen; verify landscape/portrait restoration.
- Double-tap rewind/forward, normal single-tap play/pause, seeking near 0/end, and seeking while subtitles/HLS are active.
- Episode and server switching, resuming, screen rotation, and leaving/re-entering playback.

A provider module loading or returning an embed URL is not proof the episode is playing. Do not merge PR #2 until the latest Android build passes and the updated APK is tested on a real phone.
