# 7xAnime Android release and force-update system

## What this adds

- A separate signed-release workflow; pull-request builds remain debug APKs and do not need signing secrets.
- A permanent Android signing identity restored from GitHub Actions Secrets for every official release.
- A public release channel at https://github.com/RahulExe69/7xAnime-Releases.
- An Android-only startup check against the latest published release. If the published version is newer, the app shows a blocking update screen with release notes and a native download/install flow.
- A SHA-256 checksum and a verified APK signature for each published release.

## One-time signing secrets

Open RahulExe69/7xAnime → Settings → Secrets and variables → Actions → New repository secret. Use values from the private signing-secrets bundle supplied separately.

| Secret | Value |
| --- | --- |
| ANDROID_KEYSTORE_BASE64 | Entire one-line Base64 value for the JKS keystore |
| ANDROID_KEYSTORE_PASSWORD | Store password |
| ANDROID_KEY_ALIAS | 7xanime-release |
| ANDROID_KEY_PASSWORD | Private-key password |
| RELEASE_REPO_TOKEN | Fine-grained PAT with permission to publish releases to RahulExe69/7xAnime-Releases |

Keep the original keystore and passwords in a private backup. Never commit the keystore, Base64 string, or passwords to either repository. Losing or replacing the signing key can prevent existing release installations from accepting future updates.

### Fine-grained token

Create a fine-grained GitHub token scoped only to RahulExe69/7xAnime-Releases, with repository Contents: Read and write permission (Metadata read-only). Save it as RELEASE_REPO_TOKEN in the source repository RahulExe69/7xAnime. The installed app does not contain or need this token; only GitHub Actions uses it to create releases and upload APK assets.

## Publishing a release

1. Merge the release-system changes into master.
2. Open Actions → 7xAnime Signed Release → Run workflow.
3. Set a new monotonically increasing semantic version such as 1.0.3. Optionally provide release notes.
4. The workflow builds production package ID com.sevenx.anime, signs it with the permanent keystore, verifies the signature, creates a checksum, and publishes the APK to 7xAnime-Releases.
5. On the next startup, installed Android builds compare their app version with the latest published release. Older versions must update before using the app.

A source tag such as v1.0.4 also triggers a release build. Do not publish a lower versionCode than the last release.

## Debug versus release

The existing debug workflow still emits a debug APK with package ID com.sevenx.anime.debug, so it can be installed beside the production app. Official APKs use com.sevenx.anime and the persistent release key. Debug APKs are not published to the public release repository.

## Release architecture and size optimization

Each official release publishes two signed APKs using the same package ID, version code, and permanent signing key:

- `7xAnime-vX.Y.Z.apk` is the universal build containing `arm64-v8a` and `x86_64`. It is uploaded first to preserve compatibility with older updater code that selects the first APK asset.
- `7xAnime-vX.Y.Z-arm64-v8a.apk` contains only the ARM64 native runtime and libraries and is preferred by current Android builds when the device reports `arm64-v8a`.

The current updater asks the native bridge for Android's supported ABI order and picks a matching architecture asset. If no matching asset exists, it falls back to the unsuffixed universal APK. Releases also enable R8 minification and Android resource shrinking with narrow keep rules for the JavaScript bridge and Capacitor plugins.

Pull-request CI runs a size comparison using the same source tree: an unoptimized universal release build, an R8/resource-shrunk universal build, and an R8/resource-shrunk ARM64 build. The comparison artifacts are unsigned and are only for measurement; they must never be published as official releases. The report separates the savings from code/resource shrinking from the savings from excluding x86-64 runtime files.

## Troubleshooting

- If the release workflow fails immediately, verify all five secrets exist and that the PAT has write access to 7xAnime-Releases.
- If signing fails, re-check the Base64 keystore value, alias, store password, and key password against the original backup.
- Android may ask the user to allow installation from 7xAnime. That is an Android system security control; the app opens the system setting and resumes installation after permission is granted.
- The update gate checks the latest published GitHub Release and fails open if the network/API is temporarily unavailable. Upload an APK asset to each release; the gate reads the asset URL from the release API instead of guessing an asset filename.
