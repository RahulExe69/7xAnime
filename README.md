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

## Playback servers

7xAnime supports exactly seven standard playback choices: **MegaPlay (Server 1), AniXo, Megavid, TryEmbed, CinexStream, SupaPlay, and VidPlus**. MegaPlay is the default Android iframe; the other six are manual embed routes. SupaPlay's `sub`/`dub` is generic. VidPlus requests its documented `server=hindi` selection in dub mode, but the resulting audio is not yet verified as Hindi. AnimeParadise, MegaFlix, NontonGo, AnimeNoSub, and the legacy Kuhi provider pool are retired and are not packaged as active providers. See [the server guide](docs/SERVERS.md) for the maintained allowlist and retirement notes.

The Android APK retains only the small shared Kuhi API/catalogue infrastructure needed by the current backend; its unrelated provider adapters are pruned at build time. The six embed providers are cross-origin, so provider-owned player controls and overlays cannot always be customized or removed by the parent app.

## Player experience marathon

The Android player work applies a shared, provider-agnostic best-effort ad/redirect filter to embedded player requests, blocks pop-up windows and remote JavaScript prompt dialogs, a native landscape fullscreen bridge with swipe/Back support, and double-tap ±10-second seeking in the app-owned ArtPlayer player. See [the player marathon notes](docs/PLAYER-MARATHON.md) for exact coverage and cross-origin iframe limitations. Known ad-domain filtering can never remove every in-page ad, especially content served by the player itself.

When playback is detected as failed, 7xAnime saves the latest available timestamp, retries the current player twice, then tries the other six supported embed servers before returning to MegaPlay. SupaPlay and VidPlus are kept out of the progress-based stall watchdog until their iframe behavior is verified on an Android device. Failed servers are hidden from the chooser for the current session. A visual ad overlay inside a cross-origin iframe is not reliably detectable or dismissible by the parent app; blocked network requests/pop-ups and stalled event-reporting embeds can trigger recovery, but this cannot guarantee removal of every in-page ad.

## Android APK with an on-device API

The Android debug build has an experimental **local-backend** path: the APK bundles
a Python runtime and the shared catalogue/context portion of a pinned Kuhi API snapshot,
starts the API on `127.0.0.1:8000`, and routes supported provider requests and media proxy
traffic through that loopback service. The only standard playback choices are MegaPlay
(Server 1), AniXo, Megavid, TryEmbed, CinexStream, SupaPlay, and VidPlus. Unused upstream Kuhi provider modules
are pruned from the packaged APK. A returned embed URL is not proof that the selected
episode actually plays. This path does **not** require the three hosted API/proxy/PocketBase Actions
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
