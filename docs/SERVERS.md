# 7xAnime playback servers

This is the source of truth for the providers 7xAnime is allowed to use. Keep this list aligned with `src/lib/server-map.ts`, `ACTIVE_PROVIDER_ORDER` in `android-local-backend/local_api.py`, and the adapter list in `.github/scripts/configure-local-anime-backend.py`.

## Active server list — exactly seven

| Server | Provider | Implementation | Notes |
|---:|---|---|---|
| 1 | **MegaPlay** | Dedicated frontend iframe at `https://megaplay.buzz/stream/ani/{AniListID}/{episode}/{sub-or-dub}` | Default Android playback and final fallback. No Python adapter. |
| 2 | **AniXo** | `android-local-backend/extra-providers/anixo.py` | Manually selectable embed. |
| 3 | **Megavid** | `android-local-backend/extra-providers/megavid.py` | Manually selectable embed. |
| 4 | **TryEmbed** | `android-local-backend/extra-providers/tryembed.py` | Manually selectable embed. |
| 5 | **CinexStream** | `android-local-backend/extra-providers/cinexstream.py` | Manually selectable embed. |
| 6 | **SupaPlay** | `android-local-backend/extra-providers/supaplay.py` | Manual iframe using the documented AniList ID route. Generic `sub`/`dub`; `dub` is not proof of Hindi audio. |
| 7 | **VidPlus** | `android-local-backend/extra-providers/vidplus.py` | Manual iframe using the documented AniList ID route. Generic `sub`/`dub`; no verified Hindi guarantee. |

These are the only supported playback choices. AniXo, Megavid, TryEmbed, CinexStream, SupaPlay, and VidPlus construct cross-origin embed URLs; the parent app cannot guarantee provider playback controls or availability. SupaPlay's `sub`/`dub` and VidPlus's `dub` toggle are generic, not episode-level proof of Hindi audio. A module loading or URL being returned does not prove an episode plays. Test actual playback on Android before claiming reliability.

## Provider architecture and Auto

The Android APK still uses a small part of the pinned Kuhi API project for its existing catalogue endpoints and shared AniList/AniZip context helpers. **Kuhi's broad provider catalogue is not an active source pool.** The build rewrites its provider ranking to exactly `anixo`, `megavid`, `tryembed`, `cinexstream`, `supaplay`, and `vidplus`, then removes all other provider modules from the packaged provider directory. This keeps the shared backend infrastructure while avoiding the unstable, unused Kuhi provider adapters.

The six active adapters are iframe routes, not independent direct-media extractors, so they are excluded from the direct-stream Auto race. On Android, opening an anime should start MegaPlay Server 1. If playback fails, the app may try the six supported manual embeds in order before returning to MegaPlay. SupaPlay and VidPlus remain excluded from the progress-based stall watchdog until their iframe playback-event behavior is verified on Android. Do not route a fresh anime open through the Kuhi Auto endpoint.

## Retired providers — do not re-add without a deliberate review

The following provider adapters were removed from the supported list and are pruned from the Android APK:

- **AnimeParadise** — removed; its direct HLS/signed-link integration was not part of the supported server set.
- **MegaFlix** — removed; not part of the supported active server list.
- **NontonGo** — removed; not part of the supported active server list.
- **AnimeNoSub** — removed; unrelated embed/catalogue adapter.
- **Legacy Kuhi providers** such as AniNeko, AniZone, AniKoto, ReAnime, AniWaves, KAA, AniBD, AnimeGG, Mkissa, and AnimeOnsen — not packaged or selectable.

Do not add retired providers back to `src/lib/server-map.ts`, `ACTIVE_PROVIDER_ORDER`, the extra-adapter copy map, or the provider ranking in the build script unless the provider is deliberately re-evaluated and tested on a real Android device. Research-only candidates belong in a research document, not the runtime provider registry.

## Hindi dub

Hindi dub remains a separate feature using the community `ZeroTwo-Py/anime-api` catalogue through the fixed `/hindi/search` and `/hindi/stream` routes. Its third-party embeds are separate from the seven standard playback choices; do not mix Hindi-mode server numbering with the standard server list. SupaPlay and VidPlus are not yet confirmed as Hindi sources.

## Testing checklist

- Verify that the frontend map and Android `ACTIVE_PROVIDER_ORDER` contain only AniXo, Megavid, TryEmbed, CinexStream, SupaPlay, and VidPlus.
- Verify that the generated APK provider registry contains exactly those six adapters and none of the retired modules.
- Verify a fresh anime open uses MegaPlay Server 1 without displaying a Kuhi Auto retry screen.
- Verify each manual embed on a physical Android device for sub and dub where supported.
- Treat cross-origin provider controls and in-page overlays as provider-owned; the app can filter network requests and block popups but cannot reliably rewrite the provider's internal HUD.
