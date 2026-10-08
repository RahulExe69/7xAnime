#!/usr/bin/env python3
"""Import PocketBase collections from pb.json.

Handles:
- Skipping system collections (already created by PocketBase)
- Updating existing collections with missing fields (e.g. users needs avatar/autoSkip)
- Fixing relation collectionId references to match actual IDs in this instance
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error

PB_URL = os.environ.get("PB_URL", "http://pocketbase:8090")
PB_EMAIL = os.environ.get("PB_ADMIN_EMAIL", "")
PB_PASSWORD = os.environ.get("PB_ADMIN_PASSWORD", "")
PB_JSON = os.environ.get("PB_JSON", "/pb_collections.json")


def api(method, path, token=None, data=None):
    url = f"{PB_URL}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, {}


def configure_google_oauth(token):
    """Enable the Google OAuth2 provider once credentials are available."""
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()

    if not client_id or not client_secret:
        print("[init] Google OAuth2 credentials not set, skipping")
        return

    status, users = api("GET", "/api/collections/users", token=token)
    if status != 200:
        print(f"[init] Could not load users collection: {status}")
        return

    oauth2 = dict(users.get("oauth2") or {})
    providers = [p for p in oauth2.get("providers", []) if p.get("name") != "google"]
    providers.append({
        "name": "google",
        "clientId": client_id,
        "clientSecret": client_secret,
    })
    oauth2["enabled"] = True
    oauth2["providers"] = providers

    status, resp = api("PATCH", f"/api/collections/{users['id']}", token=token,
                       data={"oauth2": oauth2})
    if status == 200:
        print("[init] Google OAuth2 provider enabled")
    else:
        print(f"[init] Google provider update failed: {status} {json.dumps(resp)[:200]}")


def main():
    # Wait for PocketBase
    for _ in range(30):
        try:
            status, _ = api("GET", "/api/health")
            if status == 200:
                break
        except Exception:
            pass
        time.sleep(1)
    else:
        print("[init] PocketBase not ready, skipping")
        sys.exit(0)

    # Authenticate using environment-provided local admin credentials.
    if not PB_EMAIL or not PB_PASSWORD:
        print("[init] PB_ADMIN_EMAIL/PB_ADMIN_PASSWORD are required")
        sys.exit(1)

    status, data = api("POST", "/api/collections/_superusers/auth-with-password",
                       data={"identity": PB_EMAIL, "password": PB_PASSWORD})
    if status != 200 or "token" not in data:
        print(f"[init] Auth failed: {status} {data}")
        sys.exit(0)
    token = data["token"]

    # Get existing collections (name -> {id, fields})
    status, data = api("GET", "/api/collections?perPage=200", token=token)
    existing = {}
    items = []
    if status == 200:
        items = data.get("items", data.get("collections", []))
        if isinstance(data, list):
            items = data
    for c in items:
        if isinstance(c, dict):
            existing[c["name"]] = c

    # Load pb.json
    with open(PB_JSON) as f:
        collections = json.load(f)

    # First pass: create/update collections that have no relation fields
    # (or whose relations point to system collections like _pb_users_auth_)
    # Second pass: create collections with relations to non-system collections
    def has_external_relation(col):
        for field in col.get("fields", []):
            if field.get("type") == "relation":
                cid = field.get("collectionId", "")
                # _pb_users_auth_ is a system placeholder that PocketBase understands
                if cid and not cid.startswith("_"):
                    return True
        return False

    ordered = sorted(collections, key=lambda c: has_external_relation(c))

    # Map of original collectionId -> actual collectionId
    id_map = {}
    for name, info in existing.items():
        id_map[info.get("id", "")] = info.get("id", "")

    for col in ordered:
        name = col.get("name", "")
        if col.get("system", False) or name.startswith("_"):
            print(f"[init] Skip system: {name}")
            continue

        # Fix relation collectionIds to point to actual collections
        payload = {k: v for k, v in col.items() if k not in ("created", "updated", "id")}
        for field in payload.get("fields", []):
            if field.get("type") == "relation":
                old_cid = field.get("collectionId", "")
                if old_cid and not old_cid.startswith("_"):
                    # Try to find the actual collection by looking up which pb.json
                    # collection had this original ID
                    for src in collections:
                        if src.get("id") == old_cid and src["name"] in existing:
                            field["collectionId"] = existing[src["name"]]["id"]
                            break
                    else:
                        # Maybe the collection was already created in this run
                        if old_cid in id_map:
                            field["collectionId"] = id_map[old_cid]

        if name in existing:
            # Update existing collection with missing fields
            existing_fields = {f["name"] for f in existing[name].get("fields", [])}
            new_fields = [f for f in payload.get("fields", [])
                         if f["name"] not in existing_fields]
            if new_fields:
                # Rebuild full field list: existing + new
                merged_fields = list(existing[name].get("fields", [])) + new_fields
                update_payload = {"fields": merged_fields}
                # Preserve other settings from pb.json
                for k in ("listRule", "viewRule", "createRule", "updateRule", "deleteRule"):
                    if k in payload:
                        update_payload[k] = payload[k]
                status, resp = api("PATCH", f"/api/collections/{existing[name]['id']}",
                                   token=token, data=update_payload)
                if status == 200:
                    print(f"[init] Updated collection: {name} (added {len(new_fields)} fields)")
                else:
                    print(f"[init] Update {name} failed: {status} {json.dumps(resp)[:200]}")
            else:
                print(f"[init] Exists, no changes: {name}")
        else:
            status, resp = api("POST", "/api/collections", token=token, data=payload)
            if status == 200:
                print(f"[init] Created collection: {name}")
                id_map[col.get("id", "")] = resp.get("id", "")
                existing[name] = resp
            elif status == 400 and "exists" in json.dumps(resp).lower():
                print(f"[init] Exists: {name}")
            else:
                print(f"[init] Failed {name}: {status} {json.dumps(resp)[:200]}")

    configure_google_oauth(token)

    print("[init] Done")


if __name__ == "__main__":
    main()
