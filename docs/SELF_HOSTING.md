# 7xAnime backend setup

## Local full-stack development

The local Compose stack runs the 7xAnime web app, Miruro API, PocketBase and the M3U8 proxy. It is **for development only** and binds service ports to `127.0.0.1` on the host.

1. Copy `.env.backend.example` to `.env.backend`.
2. Replace `PB_ADMIN_PASSWORD` with a unique local password. Keep `.env.backend` private.
3. Run `docker compose up --build`.
4. Open `http://localhost:3000`. PocketBase admin is available at `http://localhost:8090/_/`; the API is on port 8000 and the local proxy on port 4040.

PocketBase imports the collections from `docs/pb.json` on first startup. Data persists in the `pb_data` Docker volume. To reset a disposable local instance, stop Compose and remove that volume deliberately.

### Google sign-in (optional)

Create a Google OAuth 2.0 web client and add the callback URI for the PocketBase origin, such as `http://localhost:8090/api/oauth2-redirect` for local development. Put the client ID and secret in `.env.backend`, then recreate the PocketBase container. For a hosted instance, register the HTTPS PocketBase callback URI instead.

OAuth is optional; email/password and the existing Discord option remain available. Google OAuth is not considered configured merely because the button exists in the app.

## Hosted API/PocketBase/proxy endpoints

An Android APK cannot use these local `localhost` addresses to reach services running on your computer. Host each service behind a stable HTTPS origin and set the repository Actions secrets to those public URLs before running the Android Debug workflow:

- `NEXT_PUBLIC_API_URL`: public Miruro API origin.
- `NEXT_PUBLIC_POCKETBASE_URL`: public PocketBase origin.
- `NEXT_PUBLIC_PROXY_URL`: public M3U8 proxy origin.

These `NEXT_PUBLIC_*` values become client-side app configuration, so they must only contain public endpoint URLs—never passwords or private API credentials.

**Provider reliability caveat:** the Miruro API in this stack is pinned to an upstream source revision, not maintained by 7xAnime. Its own upstream relies on reaching Miruro and may be blocked by Cloudflare or by the hosting network. Docker can package the API, but cannot guarantee the upstream source will return data from every VPS/datacenter IP. Verify search, episode metadata and playback from the actual host before using its URL in a production APK.

Do not expose the PocketBase admin UI publicly with local-development credentials. For production, use a strong secret-managed admin password, HTTPS, backups for the `pb_data` volume, and firewall rules that restrict admin access.
