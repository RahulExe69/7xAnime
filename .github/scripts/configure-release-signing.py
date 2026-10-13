#!/usr/bin/env python3
"""Configure generated Capacitor Android release signing from GitHub Actions secrets."""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path


def fail(message: str) -> None:
    print("ERROR: " + message, file=sys.stderr)
    raise SystemExit(1)


def matching_brace(text: str, open_index: int) -> int:
    depth, quote, escaped = 0, None, False
    for index in range(open_index, len(text)):
        char = text[index]
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            continue
        if char in ("'", '"'):
            quote = char
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return index
    fail("Unbalanced braces in generated Android Gradle file.")
    return -1


def find_block(text: str, pattern: str, label: str) -> tuple[int, int]:
    match = re.search(pattern, text, flags=re.MULTILINE)
    if not match:
        fail("Could not locate " + label + ".")
    open_index = text.find("{", match.start())
    return open_index, matching_brace(text, open_index)


def main() -> None:
    names = (
        "ANDROID_KEYSTORE_PATH",
        "ANDROID_KEYSTORE_PASSWORD",
        "ANDROID_KEY_ALIAS",
        "ANDROID_KEY_PASSWORD",
    )
    missing = [name for name in names if not os.environ.get(name)]
    if missing:
        fail("Missing release-signing environment variables: " + ", ".join(missing))

    keystore = Path(os.environ["ANDROID_KEYSTORE_PATH"])
    if not keystore.is_file() or keystore.stat().st_size == 0:
        fail("The temporary release keystore does not exist or is empty.")

    gradle = Path("android/app/build.gradle")
    if not gradle.is_file():
        fail("Generated android/app/build.gradle is missing.")
    text = gradle.read_text(encoding="utf-8")
    android_open, android_close = find_block(text, r"(?m)^\s*android\s*\{", "android block")
    android_body = text[android_open + 1:android_close]

    signing_block = """
    signingConfigs {
        release {
            storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))
            storeType "JKS"
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
        }
    }
"""
    if not re.search(r"(?m)^\s*signingConfigs\s*\{", android_body):
        text = text[:android_open + 1] + signing_block + text[android_open + 1:]

    android_open, android_close = find_block(text, r"(?m)^\s*android\s*\{", "android block after signing configuration")
    body = text[android_open + 1:android_close]
    build_match = re.search(r"(?m)^\s*buildTypes\s*\{", body)
    if not build_match:
        fail("Could not locate buildTypes block.")
    build_open = android_open + 1 + body.find("{", build_match.start())
    build_close = matching_brace(text, build_open)
    build_body = text[build_open + 1:build_close]
    release_match = re.search(r"(?m)^\s*release\s*\{", build_body)
    if not release_match:
        fail("Could not locate release build type.")
    release_open = build_open + 1 + build_body.find("{", release_match.start())
    release_close = matching_brace(text, release_open)
    release_body = text[release_open + 1:release_close]
    if "signingConfig signingConfigs.release" not in release_body:
        text = text[:release_close] + "\n            signingConfig signingConfigs.release\n        " + text[release_close:]

    gradle.write_text(text, encoding="utf-8")
    check = gradle.read_text(encoding="utf-8")
    if 'storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))' not in check or 'storeType "JKS"' not in check or "signingConfig signingConfigs.release" not in check:
        fail("Could not verify persistent release signing configuration.")
    print("Configured permanent 7xAnime release signing without writing passwords into Gradle files.")


if __name__ == "__main__":
    main()
