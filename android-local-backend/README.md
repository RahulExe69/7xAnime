# On-device Python backend

The Android build uses Chaquopy to package a Python interpreter and a local HTTP API
inside the APK. The API binds only to `127.0.0.1:8000`; a Capacitor native bridge starts
it on demand and hands a random per-process token to the bundled JavaScript client.

At build time, `.github/scripts/fetch-kuhi-backend.sh` retrieves a pinned snapshot of the Kuhi API repository. 7xAnime retains only the shared catalogue/context API pieces from that snapshot; the APK build rewrites the provider registry to **AniXo, Megavid, TryEmbed, CinexStream, SupaPlay, and VidPlus only**, then prunes all other provider modules. MegaPlay is the dedicated frontend Server 1 iframe and does not use a Python adapter. The upstream API is licensed under MIT; the copyright and license text is bundled under `public/licenses/Kuhi-MIT-LICENSE.txt` to preserve the upstream notice.

Do not interpret the upstream Kuhi provider catalogue as the list of supported 7xAnime servers. The maintained seven-server list is MegaPlay, AniXo, Megavid, TryEmbed, CinexStream, SupaPlay, and VidPlus; see [the server guide](../docs/SERVERS.md). Retired providers must not be copied into the Android package without a deliberate review and real-device verification.

## Scope and limitations

The local API removes our need to host the catalog/extraction/proxy services ourselves.
It still makes internet requests to AniList, anime providers, and stream CDNs. Provider
availability may change independently of the app.

The standalone APK runs in guest mode: per-device watch progress remains local, while
PocketBase-backed accounts, community comments, and synced watch lists are deliberately
not presented as working features without a shared server. They remain available in the
website/full-stack deployment where PocketBase is configured.

The initial Android build is a prototype. A successful APK compilation confirms the
packaging pipeline, not that every upstream provider works on a real device. Validate
search, series detail, episode list, extraction, HLS playback, subtitles, and resume
progress on a phone before calling the build stable.
