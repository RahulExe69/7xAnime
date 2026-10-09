# Android WebView ad filtering

## What is being integrated

This is an Android-native, EasyList-compatible filter engine for 7xAnime's Capacitor WebView. It extends the existing conservative host denylist with filter-list matching for network requests and the library's supported cosmetic/scriptlet injection. The native engine is from [Edsuns/AdblockAndroid](https://github.com/Edsuns/AdblockAndroid) and is licensed under LGPL-2.1; its license is included in the packaged Android assets and in `third_party/AdblockAndroid-LICENSE.txt`.

This is **not the official uBlock Origin extension or its `@gorhill/ubo-core` package**. uBlock Origin is a browser extension, while its separate Node-oriented core package is not a ready-made Android WebView request interceptor. The selected Android library exposes the WebView-native request hook this app needs. It is a pragmatic compatible engine, not a rebranding or claim that uBO itself is embedded.

## Default lists

On first installation, 7xAnime subscribes to:
- [EasyList](https://easylist.to/easylist/easylist.txt) for common ad requests.
- [EasyPrivacy](https://easylist.to/easylist/easyprivacy.txt) for tracking requests.

The library downloads and installs these filter lists asynchronously. This proof of concept does not add a user-facing list manager or a periodic refresh scheduler yet. Existing static host blocking remains enabled independently as a fallback.

## Failure behaviour and limitations

- If the filter engine is not initialized or throws during a request, the WebView request is allowed to continue through the existing fallback path rather than failing the whole player.
- Filter-list rules can still cause false positives. A blocked request returns the library's blocked response; switch servers if a player breaks.
- Third-party embed pages are cross-origin. The app cannot freely remove HTML overlays or run cosmetic scripts inside a provider's cross-origin iframe.
- Same-host ad assets, newly published rules that have not been downloaded, service-worker behaviour, and ad overlays that do not use a separate request may still escape filtering.
- CI checks the Gradle dependency/repository wiring, filter hooks, license packaging, static build and Android APK compilation. Real-device playback with MegaPlay, AniXo and Megavid remains necessary before treating this as stable.

## Dependency and license

- Project: [Edsuns/AdblockAndroid](https://github.com/Edsuns/AdblockAndroid)
- Maven coordinate: `com.github.Edsuns.AdblockAndroid:ad-filter:v0.9.1` via JitPack, pinned to the upstream v0.9.1 release.
- License: LGPL-2.1. The complete upstream license is in `third_party/AdblockAndroid-LICENSE.txt`, and the build copies it into `assets/THIRD_PARTY_LICENSES/` in the APK.
