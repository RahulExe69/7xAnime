# 7xAnime player marathon

This work stays in draft PR #2 and is split into four phases. CI verifies compile/package behaviour, but physical-device playback is still required before calling the player experience production-ready.

## Phase 1 — Ad and redirect protection

The Android WebView blocks requests to a conservative list of known advertising/redirect domains, rejects pop-up windows, denies WebView permission requests from embedded providers, and prevents external top-level pages from replacing the app.

**JavaScript dialogs are suppressed unconditionally.** Some Chromium/OEM WebViews can report the top-level app URL when a nested, cross-origin player iframe calls `alert()`, `confirm()`, or `prompt()`. Using that callback URL to decide whether a dialog is trusted can accidentally show the native Android “Verify you are not a bot” / “Click Allow” dialog. 7xAnime does not use JavaScript dialogs for its own UI, so the native WebChromeClient cancels them regardless of the reported URL. Before-unload prompts are accepted to avoid trapping the viewer on an embed page. When a dialog, popup, or external redirect is blocked, the player marks the source failed and advances to another provider (eventually MegaPlay).

The Android player combines the existing conservative known-domain fallback with a maintained network-filter engine based on Brave’s adblock-rust through the Kotlin/JNI wrapper io.github.mlm-games:adblock:0.1.3. It downloads AdGuard Base, EasyList, and AdGuard Tracking Protection on a background worker, caches the compiled engine privately, and refreshes lists weekly. If download or engine initialization fails, the existing known-domain rules remain in effect and nonmatching requests fail open. The engine also applies to Service Worker fetches on Android API 26+.

This is still **best-effort filtering, not a universal ad blocker**. Cosmetic filter rules and scriptlets are not injected into untrusted provider frames by this adapter, so first-party ads, in-page HTML overlays, deceptive verification pages, and obfuscated scripts may still appear. The native dialog suppression and provider-switching fallback remain separate protections. Rewrite-only filter decisions are deliberately allowed through unchanged rather than refetching URLs and risking provider cookies or media playback. The Android minimum SDK is now API 26 (Android 8.0), and the generated project compiles against API 37 to satisfy the published AAR metadata without changing targetSdk. The project currently uses AGP 8.13, so the API 37 compile must pass CI before the dependency choice is accepted. Physical-device regression tests remain required for startup, playback, subtitles, provider switching, and deceptive prompt cases.

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
