# On-device Python backend

The Android build uses Chaquopy to package a Python interpreter and a local HTTP API
inside the APK. The API binds only to `127.0.0.1:8000`; the Capacitor bridge starts
it on demand and hands its random per-process token to the bundled JavaScript client.

At build time, `.github/scripts/fetch-kuhi-backend.sh` retrieves a pinned snapshot
of the Kuhi API repository and packages its Python modules. This is intentionally a
build-time dependency so upstream code is not copied into this repository's Git
history.

## Important upstream note

As checked on 2026-10-09, the Kuhi repository did not expose a LICENSE file. Public
visibility alone does not grant redistribution rights. This integration is therefore
a development prototype only; confirm the upstream author's license/permission before
publishing or redistributing APKs that contain its code.

The API still needs internet access for metadata, providers, and streams. The local
server removes *our own hosting requirement*; it does not make online media sources
or upstream provider reliability offline.
