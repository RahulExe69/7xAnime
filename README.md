![7xAnime brand mark and wordmark](public/brand/7xanime-lockup.svg)

Watch your favourite anime anywhere, anytime. No Ads.

7xAnime is a free, open-source anime streaming app and website. It is built using the [Next Js](https://nextjs.org/) framework, [Shadcn/ui](https://ui.shadcn.com), and [Tailwind CSS](https://tailwindcss.com/).

_7xAnime is still under development and may encounter many bugs. Feel free to open any issue regarding bugs or features_

## Features

- **No Ads** - No ads, no popups, no redirects, no bullshit.
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

More details, optional Google OAuth setup, and the Android HTTPS endpoint requirements are in [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md). The bundled Miruro API may be blocked by Cloudflare or the hosting provider's IP range, so verify it from the actual deployment before relying on it.

## Android APK with an on-device API

The Android debug build now has an experimental **local-backend** path: the APK bundles
a Python runtime and a pinned Kuhi API snapshot, starts the API on `127.0.0.1:8000`,
and routes catalog, episode extraction, and HLS proxy requests through that loopback
service. This path does **not** require the three hosted API/proxy/PocketBase Actions
secrets or a server we own.

The app still uses the internet to reach AniList, providers, and stream CDNs. The
standalone build runs in guest mode: watch progress is local to the device, while
accounts, shared comments, and synced watch lists still require a shared PocketBase
server. The Kuhi MIT license notice is bundled at [public/licenses/Kuhi-MIT-LICENSE.txt](public/licenses/Kuhi-MIT-LICENSE.txt).

Pushes to the PR now trigger both static validation and an Android debug build. The
APK artifact is a development build until search, episode lists, extraction, subtitles,
HLS playback, and watch-progress restore are tested on a real Android device; a green
build proves packaging, not upstream stream availability.

## Support

Join the Discord server: <https://discord.gg/6yAJ3XDHTt>
