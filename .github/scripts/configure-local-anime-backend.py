#!/usr/bin/env python3
"""Configure the generated Capacitor project for an on-device Python API."""
from __future__ import annotations

import os
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ANDROID = ROOT / "android"
PYTHON_ROOT = ANDROID / "app/src/main/python"
CHAQUOPY_VERSION = "17.0.0"
PYTHON_VERSION = "3.11"


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def matching_brace(content: str, open_index: int) -> int:
    depth = 0
    quote = None
    escaped = False
    for index in range(open_index, len(content)):
        char = content[index]
        if quote:
            if escaped:
                escaped = False
            elif char == "\\\\":
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
    fail("Unbalanced braces in generated Gradle file.")
    return -1


def patch_root_gradle() -> None:
    path = ANDROID / "build.gradle"
    if not path.is_file():
        fail("android/build.gradle does not exist.")
    text = path.read_text(encoding="utf-8")
    if "com.chaquo.python" in text:
        return

    plugins_match = re.search(r"(?m)^plugins\\s*\\{", text)
    if plugins_match:
        brace = text.find("{", plugins_match.start())
        close = matching_brace(text, brace)
        text = text[:close] + (
            f'    id "com.chaquo.python" version "{CHAQUOPY_VERSION}" apply false\\n'
        ) + text[close:]
    else:
        deps_match = re.search(r"(?m)^\\s*dependencies\\s*\\{", text)
        if not deps_match:
            fail("No buildscript dependencies block found in android/build.gradle.")
        brace = text.find("{", deps_match.start())
        close = matching_brace(text, brace)
        text = text[:close] + (
            f'    classpath "com.chaquo.python:gradle:{CHAQUOPY_VERSION}"\\n'
        ) + text[close:]

    path.write_text(text, encoding="utf-8")


def patch_app_gradle() -> None:
    path = ANDROID / "app/build.gradle"
    if not path.is_file():
        fail("android/app/build.gradle does not exist.")
    text = path.read_text(encoding="utf-8")

    if "com.chaquo.python" not in text:
        apply_match = re.search(
            r"(?m)^\\s*apply plugin:\\s*['\"]com\\.android\\.application['\"].*$",
            text,
        )
        if apply_match:
            insert_at = apply_match.end()
            text = text[:insert_at] + "\\napply plugin: 'com.chaquo.python'" + text[insert_at:]
        else:
            plugins_match = re.search(r"(?m)^plugins\\s*\\{", text)
            if not plugins_match:
                fail("Could not locate app-level Gradle plugin declaration.")
            brace = text.find("{", plugins_match.start())
            close = matching_brace(text, brace)
            text = text[:close] + '    id "com.chaquo.python"\\n' + text[close:]

    variables = ANDROID / "variables.gradle"
    patched_min_sdk = False
    if variables.is_file():
        variables_text = variables.read_text(encoding="utf-8")
        variables_text, count = re.subn(
            r"(?m)^(\\s*minSdkVersion\\s*=\\s*)\\d+",
            r"\\g<1>24",
            variables_text,
            count=1,
        )
        if count:
            variables.write_text(variables_text, encoding="utf-8")
            patched_min_sdk = True

    if not patched_min_sdk:
        text, count = re.subn(
            r"(?m)^(\\s*minSdkVersion\\s+)(?:rootProject\\.ext\\.minSdkVersion|\\d+)",
            r"\\g<1>24",
            text,
            count=1,
        )
        if count == 0:
            text, count = re.subn(
                r"(?m)^(\\s*minSdk\\s*=\\s*)(?:rootProject\\.ext\\.minSdkVersion|\\d+)",
                r"\\g<1>24",
                text,
                count=1,
            )
        if count == 0:
            fail("Could not raise Android minSdk to Chaquopy's required API level 24.")

    default_match = re.search(r"(?m)^\\s*defaultConfig\\s*\\{", text)
    if not default_match:
        fail("Could not locate app defaultConfig block.")
    open_index = text.find("{", default_match.start())
    close_index = matching_brace(text, open_index)
    default_config = text[open_index:close_index]
    if "abiFilters" not in default_config:
        text = text[:close_index] + (
            '\\n        ndk {\\n            abiFilters "arm64-v8a", "x86_64"\\n        }\\n    '
        ) + text[close_index:]

    if "chaquopy {" not in text:
        text += (
            "\\n\\nchaquopy {\\n"
            "    defaultConfig {\\n"
            f'        version = "{PYTHON_VERSION}"\\n'
            "        pip {\\n"
            '            install("-r", "src/main/python/requirements.txt")\\n'
            "        }\\n"
            "    }\\n"
            "}\\n"
        )

    path.write_text(text, encoding="utf-8")


def patch_manifest() -> None:
    path = ANDROID / "app/src/main/AndroidManifest.xml"
    if not path.is_file():
        fail("AndroidManifest.xml does not exist.")
    text = path.read_text(encoding="utf-8")
    if "android.permission.INTERNET" not in text:
        if 'xmlns:android="http://schemas.android.com/apk/res/android"' not in text:
            text = text.replace(
                "<manifest",
                '<manifest\\n    xmlns:android="http://schemas.android.com/apk/res/android"',
                1,
            )
        text = text.replace(
            "<application",
            '    <uses-permission android:name="android.permission.INTERNET" />\\n\\n    <application',
            1,
        )
    if "android:usesCleartextTraffic=" not in text:
        text = re.sub(
            r"<application\\b",
            '<application android:usesCleartextTraffic="true"',
            text,
            count=1,
        )
    path.write_text(text, encoding="utf-8")


def register_plugin(main_activity: Path) -> None:
    text = main_activity.read_text(encoding="utf-8")
    if "registerPlugin(LocalAnimeBackendPlugin.class)" in text:
        return

    if "import android.os.Bundle;" not in text:
        text = re.sub(r"(?m)^(package [^;]+;\\s*)", r"\\1\\nimport android.os.Bundle;", text, count=1)
    if "import com.sevenx.anime.LocalAnimeBackendPlugin;" not in text:
        text = re.sub(
            r"(?m)^(package [^;]+;\\s*)",
            r"\\1\\nimport com.sevenx.anime.LocalAnimeBackendPlugin;",
            text,
            count=1,
        )
    if "import com.getcapacitor.BridgeActivity;" not in text:
        text = text.replace(
            "import com.sevenx.anime.LocalAnimeBackendPlugin;",
            "import com.sevenx.anime.LocalAnimeBackendPlugin;\\nimport com.getcapacitor.BridgeActivity;",
            1,
        )

    on_create = re.search(r"(?s)void\\s+onCreate\\s*\\([^)]*\\)\\s*\\{", text)
    if on_create:
        remaining = text[on_create.end():]
        super_call = re.search(r"super\\.onCreate\\s*\\(\\s*savedInstanceState\\s*\\)\\s*;", remaining)
        if super_call:
            position = on_create.end() + super_call.start()
            text = text[:position] + "registerPlugin(LocalAnimeBackendPlugin.class);\\n        " + text[position:]
        else:
            fail("MainActivity has an onCreate method without the expected super call.")
    else:
        class_match = re.search(r"class\\s+MainActivity\\s+extends\\s+BridgeActivity\\s*\\{", text)
        if not class_match:
            fail("Could not locate MainActivity class declaration.")
        close = text.rfind("}")
        if close < class_match.end():
            fail("Could not locate MainActivity class terminator.")
        method = (
            "\\n    @Override\\n"
            "    public void onCreate(Bundle savedInstanceState) {\\n"
            "        registerPlugin(LocalAnimeBackendPlugin.class);\\n"
            "        super.onCreate(savedInstanceState);\\n"
            "    }\\n"
        )
        text = text[:close] + method + text[close:]
    main_activity.write_text(text, encoding="utf-8")


def copy_python_source() -> None:
    source_dir = Path(os.environ.get("KUHI_SOURCE_DIR", "")).expanduser()
    if not source_dir.is_dir() or not (source_dir / "src/main.py").is_file():
        fail("KUHI_SOURCE_DIR must point to the checked-out pinned Kuhi API repository.")

    local_api = ROOT / "android-local-backend/local_api.py"
    requirements = ROOT / "android-local-backend/requirements-android.txt"
    if not local_api.is_file() or not requirements.is_file():
        fail("The local API adapter or pinned Android requirements file is missing.")

    PYTHON_ROOT.mkdir(parents=True, exist_ok=True)
    destination_src = PYTHON_ROOT / "src"
    if destination_src.exists():
        shutil.rmtree(destination_src)
    shutil.copytree(source_dir / "src", destination_src)
    shutil.copy2(local_api, PYTHON_ROOT / "local_api.py")
    shutil.copy2(requirements, PYTHON_ROOT / "requirements.txt")

    import py_compile
    py_compile.compile(str(PYTHON_ROOT / "local_api.py"), doraise=True)


def main() -> None:
    if not ANDROID.is_dir():
        fail("The generated android/ directory is missing. Run the Capacitor Android generation step first.")

    copy_python_source()
    patch_root_gradle()
    patch_app_gradle()
    patch_manifest()

    java_source = ROOT / "android-local-backend/LocalAnimeBackendPlugin.java"
    package_dir = ANDROID / "app/src/main/java/com/sevenx/anime"
    package_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(java_source, package_dir / "LocalAnimeBackendPlugin.java")

    candidates = list((ANDROID / "app/src/main/java").rglob("MainActivity.java"))
    if len(candidates) != 1:
        fail(f"Expected one generated MainActivity.java, found {len(candidates)}.")
    register_plugin(candidates[0])

    print("Configured 7xAnime with an embedded Python API (loopback-only, on-demand).")


if __name__ == "__main__":
    main()
