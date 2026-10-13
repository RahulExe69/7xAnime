<p align="center">
  <img src="public/brand/7xanime-icon.png" alt="7xAnime app icon" width="96" />
  &nbsp;
  <img src="public/brand/7xanime-wordmark.png" alt="7xAnime wordmark" width="280" />
</p>

Watch your favourite anime anywhere, anytime. No Ads.

7xAnime is a free, open-source anime streaming app and website. It is built using the [Next Js](https://nextjs.org/) framework, [Shadcn/ui](https://ui.shadcn.com), and [Tailwind CSS](https://tailwindcss.com/).

_7xAnime is still under development and may encounter many bugs. Feel free to open any issue regarding bugs or features_

## Features

- **Ad-filtered playback** - Shared network filter lists plus popup and deceptive JavaScript-dialog blocking across supported embedded player providers.
- **PWA Support** - 7xAnime is a PWA, which means you can install it on your phone.

## Contributing

```
fork the repo

git clone <forked-repo>
git checkout -b <new-feature>
git add <changed-file>
git commit -m "New feature"
git push origin <new-feature>

then submit a pull request
```

## Local Development

### Prerequisite

- Node js
- Golang (if you wish to use my proxy server)
- [Pocketbase](https://pocketbase.io)

### Proxy Server

Head over to [Proxy-M3U8](https://github.com/Dovakiin0/proxy-m3u8) and follow the instruction to setup. or if you wish to use your own proxy server, feel free.

### Pocketbase

Follow the instruction from the official website. Setup initial superadmin credentials. Once inside dashboard, go to settings > Import Collections and paste the content from [collection-JSON](https://github.com/RahulExe69/7xAnime/blob/master/docs/pb.json) and click import.

You will need discord client secret if you wish to use login from discord feature.

### Frontend

Clone the repo and `cd 7xAnime/`.

Open the `.env` file and configure your API, proxy, and PocketBase endpoints. Then:

```
npm install
npm run dev
```

### Using Docker

For local full-stack development, first copy `.env.backend.example` to `.env.backend` and replace `PB_ADMIN_PASSWORD` with a unique local password. Then run:

```bash
docker compose up --build
```

Open `http://localhost:3000`. The stack runs the 7xAnime web app, Miruro API (port 8000), PocketBase (port 8090) and M3U8 proxy (port 4040). Backend ports are bound to localhost for local development only. PocketBase imports the schema from `docs/pb.json` automatically and persists data in the `pb_data` volume.

More details, optional Google OAuth setup, and the Android HTTPS endpoint requirements are in [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md). The bundled Miruro API may be blocked by Cloudflare or the hosting provider's IP range, so verify it from the actual deployment before relying on it. The candidate provider API audit and integration decisions are tracked in [docs/PROVIDER_RESEARCH.md](docs/PROVIDER_RESEARCH.md).

## Manual playback candidates

The Android local backend exposes manual server choices for AniXo, Megavid, AnimeParadise, MegaFlix, TryEmbed, CinexStream, and NontonGo, alongside the dedicated MegaPlay Server 1 iframe. The four Yomi-derived adapters construct documented embed URLs rather than extracting media themselves. Manual candidates stay out of Auto until verified on a real Android device. See [server notes](docs/SERVERS.md) and the [provider research log](docs/PROVIDER_RESEARCH.md).

The shared Android ad-filter engine, known-domain fallback, popup blocking, permission denial, and JavaScript-dialog suppression run for all configured embedded providers—not only Megavid. Provider-served first-party ads or cosmetic HTML overlays may still escape network filtering because those layers are owned by the cross-origin player. The player offers Retry or Server 1 after 15 seconds of unresolved stream loading, and an explicitly selected MegaPlay fallback renders without waiting for the background request.

## Player experience marathon

The Android player work applies a shared, provider-agnostic best-effort ad/redirect filter to embedded player requests, blocks pop-up windows and remote JavaScript prompt dialogs, a native landscape fullscreen bridge with swipe/Back support, and double-tap ±10-second seeking in the app-owned ArtPlayer player. See [the player marathon notes](docs/PLAYER-MARATHON.md) for exact coverage and cross-origin iframe limitations. Known ad-domain filtering can never remove every in-page ad, especially content served by the player itself.

When playback is detected as failed, 7xAnime keeps the server button visible and tries the next configured server before returning to MegaPlay at the end. Failed servers remain available to retry. A visual ad overlay inside a cross-origin iframe is not reliably detectable by the parent app, so this automatic switching cannot trigger on every in-page ad.

## Android APK with an on-device API

The Android debug build has an experimental **local-backend** path: the APK bundles
a Python runtime and a pinned Kuhi API snapshot plus independently authored adapters,
starts the API on `127.0.0.1:8000`, and routes provider requests and media proxy traffic
through that loopback service. The provider map offers MegaPlay as Server 1, followed by
AniXo, Megavid, AnimeParadise, MegaFlix, TryEmbed, CinexStream, and NontonGo. The other Kuhi adapters remain parked.
AnimeParadise is a direct HLS candidate exposed only after manual selection. AniXo,
Megavid, AnimeParadise, MegaFlix, TryEmbed, CinexStream, and NontonGo remain
manual-only until tested on a physical Android device; a returned URL is not proof that the selected episode actually plays. This path does **not** require the three hosted API/proxy/PocketBase Actions
secrets or a server we own.

The app still uses the internet to reach AniList, providers, and stream CDNs. The
standalone build runs in guest mode: watch progress is local to the device, while
accounts, shared comments, and synced watch lists still require a shared PocketBase
server. The Kuhi MIT license notice is bundled at [public/licenses/Kuhi-MIT-LICENSE.txt](public/licenses/Kuhi-MIT-LICENSE.txt).

Pushes to the PR now trigger both static validation and an Android debug build. The
APK artifact is a development build until search, episode lists, extraction, subtitles,
HLS playback, and watch-progress restore are tested on a real Android device; a green
build proves packaging, not upstream stream availability.

## App guide

- [Playback server mapping](docs/SERVERS.md) explains what each numbered server slot uses.
- The Android back button navigates the in-app route history first; on Home, a deliberate double press exits.
- Anime cards include a one-tap Watch action, while the details page remains available for synopsis and related series.

## Support

Join the Discord server: <https://discord.gg/6yAJ3XDHTt>
