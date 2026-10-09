#!/usr/bin/env python3
"""Configure the generated Capacitor Android project for a bundled Python API."""
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
    """Find a matching brace while ignoring quoted strings."""
    depth = 0
    quote = None
    escaped = False
    for index in range(open_index, len(content)):
        char = content[index]
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
    fail("Unbalanced braces in generated Gradle file.")
    return -1


def insert_before_block_end(text: str, pattern: str, snippet: str, label: str) -> str:
    match = re.search(pattern, text, flags=re.MULTILINE)
    if not match:
        fail(f"Could not locate {label}.")
    open_index = text.find("{", match.start())
    close_index = matching_brace(text, open_index)
    return text[:close_index] + snippet + text[close_index:]



def patch_settings_gradle() -> None:
    """Ensure the Chaquopy plugin can be resolved from Maven Central."""
    path = ANDROID / "settings.gradle"
    if not path.is_file():
        fail("android/settings.gradle does not exist.")

    text = path.read_text(encoding="utf-8")
    plugin_management = re.search(r"(?m)^\s*pluginManagement\s*\{", text)
    if not plugin_management:
        block = (
            "pluginManagement {\n"
            "    repositories {\n"
            "        gradlePluginPortal()\n"
            "        google()\n"
            "        mavenCentral()\n"
            "    }\n"
            "}\n\n"
        )
        text = block + text
        path.write_text(text, encoding="utf-8")
        return

    open_index = text.find("{", plugin_management.start())
    close_index = matching_brace(text, open_index)
    block = text[open_index:close_index]
    if "mavenCentral()" in block:
        return

    repository_match = re.search(r"(?m)^\s*repositories\s*\{", block)
    if repository_match:
        repo_open = block.find("{", repository_match.start())
        repo_close = matching_brace(block, repo_open)
        block = block[:repo_close] + "\n        mavenCentral()\n    " + block[repo_close:]
    else:
        block = block + "\n    repositories {\n        gradlePluginPortal()\n        google()\n        mavenCentral()\n    }\n"
    text = text[:open_index] + block + text[close_index:]
    path.write_text(text, encoding="utf-8")


def patch_root_gradle() -> None:
    path = ANDROID / "build.gradle"
    if not path.is_file():
        fail("android/build.gradle does not exist.")
    text = path.read_text(encoding="utf-8")
    if "com.chaquo.python" in text:
        return

    plugins_pattern = r"^plugins\s*\{"
    if re.search(plugins_pattern, text, flags=re.MULTILINE):
        text = insert_before_block_end(
            text,
            plugins_pattern,
            f'\n    id "com.chaquo.python" version "{CHAQUOPY_VERSION}" apply false\n',
            "root plugins block",
        )
    else:
        # Capacitor templates which use apply-plugin syntax declare classpaths
        # inside buildscript.dependencies rather than a top-level plugins block.
        deps_pattern = r"^\s*dependencies\s*\{"
        text = insert_before_block_end(
            text,
            deps_pattern,
            f'\n        classpath "com.chaquo.python:gradle:{CHAQUOPY_VERSION}"\n',
            "root buildscript dependencies block",
        )
    path.write_text(text, encoding="utf-8")


def patch_app_gradle() -> None:
    path = ANDROID / "app/build.gradle"
    if not path.is_file():
        fail("android/app/build.gradle does not exist.")
    text = path.read_text(encoding="utf-8")

    if "com.chaquo.python" not in text:
        plugins_pattern = r"^plugins\s*\{"
        if re.search(plugins_pattern, text, flags=re.MULTILINE):
            text = insert_before_block_end(
                text,
                plugins_pattern,
                '\n    id "com.chaquo.python"\n',
                "app plugins block",
            )
        else:
            android_apply = re.search(
                r"(?m)^(\s*apply plugin:\s*['\"]com\.android\.application['\"].*)$",
                text,
            )
            if android_apply:
                position = android_apply.end()
                text = text[:position] + "\napply plugin: 'com.chaquo.python'" + text[position:]
            else:
                fail("Could not locate app-level Android plugin declaration.")

    # Chaquopy 17 requires minSdk 24. Set the shared version when present.
    variables = ANDROID / "variables.gradle"
    patched_min_sdk = False
    if variables.is_file():
        variables_text = variables.read_text(encoding="utf-8")
        variables_text, count = re.subn(
            r"(?m)^(\s*minSdkVersion\s*=\s*)\d+",
            r"\g<1>24",
            variables_text,
            count=1,
        )
        if count:
            variables.write_text(variables_text, encoding="utf-8")
            patched_min_sdk = True

    if not patched_min_sdk:
        patterns = [
            r"(?m)^(\s*minSdkVersion\s+)(?:rootProject\.ext\.minSdkVersion|\d+)",
            r"(?m)^(\s*minSdk\s*=\s*)(?:rootProject\.ext\.minSdkVersion|\d+)",
        ]
        for pattern in patterns:
            text, count = re.subn(pattern, r"\g<1>24", text, count=1)
            if count:
                patched_min_sdk = True
                break
    if not patched_min_sdk:
        fail("Could not raise Android minSdk to Chaquopy's required API level 24.")

    default_pattern = r"^\s*defaultConfig\s*\{"
    default_match = re.search(default_pattern, text, flags=re.MULTILINE)
    if not default_match:
        fail("Could not locate app defaultConfig block.")
    default_open = text.find("{", default_match.start())
    default_close = matching_brace(text, default_open)
    default_config = text[default_open:default_close]
    if "abiFilters" not in default_config:
        text = (
            text[:default_close]
            + '\n        ndk {\n            abiFilters "arm64-v8a", "x86_64"\n        }\n    '
            + text[default_close:]
        )

    if "chaquopy {" not in text:
        text += (
            "\n\nchaquopy {\n"
            "    defaultConfig {\n"
            f'        version = "{PYTHON_VERSION}"\n'
            "        pip {\n"
            '            install("-r", "src/main/python/requirements.txt")\n'
            "        }\n"
            "    }\n"
            "}\n"
        )

    path.write_text(text, encoding="utf-8")


def patch_manifest() -> None:
    path = ANDROID / "app/src/main/AndroidManifest.xml"
    if not path.is_file():
        fail("AndroidManifest.xml does not exist.")
    text = path.read_text(encoding="utf-8")
    if "xmlns:android=" not in text:
        text = re.sub(
            r"<manifest\b",
            '<manifest xmlns:android="http://schemas.android.com/apk/res/android"',
            text,
            count=1,
        )
    if "android.permission.INTERNET" not in text:
        text = re.sub(
            r"<application\b",
            '    <uses-permission android:name="android.permission.INTERNET" />\n\n    <application',
            text,
            count=1,
        )
    if "android:usesCleartextTraffic=" not in text:
        text = re.sub(
            r"<application\b",
            '<application android:usesCleartextTraffic="true"',
            text,
            count=1,
        )
    if "android.permission.INTERNET" not in text:
        fail("Could not add Android INTERNET permission.")
    if "android:usesCleartextTraffic=" not in text:
        fail("Could not enable loopback HTTP for the local API.")
    path.write_text(text, encoding="utf-8")


def add_import(text: str, import_statement: str) -> str:
    if import_statement in text:
        return text
    package_match = re.search(r"(?m)^package [^;]+;", text)
    if not package_match:
        fail("Could not find MainActivity package declaration.")
    position = package_match.end()
    return text[:position] + "\n\n" + import_statement + text[position:]


def register_plugin(main_activity: Path) -> None:
    text = main_activity.read_text(encoding="utf-8")
    if "registerPlugin(LocalAnimeBackendPlugin.class)" in text:
        return

    text = add_import(text, "import com.sevenx.anime.LocalAnimeBackendPlugin;")
    if "import com.getcapacitor.BridgeActivity;" not in text:
        text = add_import(text, "import com.getcapacitor.BridgeActivity;")

    on_create = re.search(
        r"(?s)void\s+onCreate\s*\([^)]*\)\s*\{",
        text,
    )
    if on_create:
        remaining = text[on_create.end():]
        super_call = re.search(
            r"super\.onCreate\s*\(\s*savedInstanceState\s*\)\s*;",
            remaining,
        )
        if super_call:
            position = on_create.end() + super_call.start()
            text = (
                text[:position]
                + "registerPlugin(LocalAnimeBackendPlugin.class);\n        "
                + text[position:]
            )
        else:
            fail("MainActivity has an onCreate method without the expected super call.")
    else:
        class_match = re.search(
            r"class\s+MainActivity\s+extends\s+BridgeActivity\s*\{",
            text,
        )
        if not class_match:
            fail("Could not locate MainActivity class declaration.")
        text = add_import(text, "import android.os.Bundle;")
        class_match = re.search(
            r"class\s+MainActivity\s+extends\s+BridgeActivity\s*\{",
            text,
        )
        close = text.rfind("}")
        if close < class_match.end():
            fail("Could not locate MainActivity class terminator.")
        method = (
            "\n    @Override\n"
            "    public void onCreate(Bundle savedInstanceState) {\n"
            "        registerPlugin(LocalAnimeBackendPlugin.class);\n"
            "        super.onCreate(savedInstanceState);\n"
            "    }\n"
        )
        text = text[:close] + method + text[close:]
    main_activity.write_text(text, encoding="utf-8")


def install_navigation_guard(main_activity: Path) -> None:
    """Keep main-frame navigation in-app without sandboxing the streaming iframe itself."""
    text = main_activity.read_text(encoding="utf-8")
    statement = "getBridge().getWebView().setWebViewClient(new StreamingNavigationWebViewClient(getBridge()));"
    if statement in text:
        return

    super_call = re.search(
        r"super\.onCreate\s*\(\s*savedInstanceState\s*\)\s*;",
        text,
    )
    if not super_call:
        fail("Could not find MainActivity.onCreate super call to install navigation guard.")

    position = super_call.end()
    text = text[:position] + "\n        " + statement + text[position:]
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

    # Copy the independently authored extra adapters into the packaged provider tree.
    # AniXo and Megavid are manual-only embed servers; local_api.py excludes them
    # from Auto racing so a constructed iframe URL cannot masquerade as playback.
    extra_providers = {
        "animenosub": "android-local-backend/extra-providers/animenosub.py",
        "anixo": "android-local-backend/extra-providers/anixo.py",
        "megavid": "android-local-backend/extra-providers/megavid.py",
        "animeparadise": "android-local-backend/extra-providers/animeparadise.py",
        "cosmic": "android-local-backend/extra-providers/cosmic.py",
    }
    for provider_name, relative_path in extra_providers.items():
        extra_provider = ROOT / relative_path
        if not extra_provider.is_file():
            fail(f"The extra {provider_name} provider adapter is missing.")
        shutil.copy2(extra_provider, destination_src / "providers" / f"{provider_name}.py")

    # The pinned upstream snapshot includes PEP 701 f-string syntax that
    # Python 3.11 cannot parse. The Android workflow deliberately uses Python
    # 3.11, so make these two provider modules compatible before importing them.
    anibd_file = destination_src / "providers" / "anibd.py"
    anibd_text = anibd_file.read_text(encoding="utf-8")
    anibd_lines = anibd_text.splitlines()
    anibd_patched = False
    for index, line in enumerate(anibd_lines):
        if "apilink.php?data=" in line and "quote(provider_link" in line:
            indent = line[:len(line) - len(line.lstrip())]
            anibd_lines[index:index + 1] = [
                indent + """encoded_link = quote(provider_link, safe="-_.!~*'()")""",
                indent + """data = await fetch_json(f"{BASE}/apilink.php?data={encoded_link}")""",
            ]
            anibd_patched = True
            break
    if anibd_patched:
        anibd_text = "\n".join(anibd_lines) + "\n"
    elif "encoded_link = quote(provider_link," not in anibd_text:
        fail("Could not apply the Python 3.11 compatibility patch to anibd.py.")
    anibd_file.write_text(anibd_text, encoding="utf-8")

    mkissa_file = destination_src / "providers" / "mkissa.py"
    mkissa_text = mkissa_file.read_text(encoding="utf-8")
    pep701_fragment = """safe="'")"""
    if pep701_fragment in mkissa_text:
        if mkissa_text.count(pep701_fragment) != 2:
            fail("Expected two Python 3.11-incompatible quote expressions in mkissa.py.")
        mkissa_text = mkissa_text.replace(pep701_fragment, "safe=chr(39))")
    elif "safe=chr(39))" not in mkissa_text:
        fail("Could not apply the Python 3.11 compatibility patch to mkissa.py.")
    mkissa_file.write_text(mkissa_text, encoding="utf-8")

    # The upstream race waits up to eight seconds after finding a winning stream,
    # only to collect optional latency measurements. That tail delay is noticeable
    # on mobile, so cancel slower competitors almost immediately after a winner.
    race_file = destination_src / "providers" / "_race.py"
    race_text = race_file.read_text(encoding="utf-8")

    # Register the added adapter only in the copied, packaged provider tree.
    ranking_match = re.search(r"(?s)RANKING\s*=\s*\[(.*?)\]", race_text)
    if not ranking_match:
        fail("Could not locate Kuhi's provider ranking.")
    ranking_block = ranking_match.group(1)
    if '"animenosub"' not in ranking_block:
        if '"animeonsen"' not in ranking_block:
            fail("Could not append AnimeNoSub to Kuhi's provider ranking.")
        ranking_block = ranking_block.replace('"animeonsen"', '"animeonsen", "animenosub"', 1)

    # These added adapters are selectable manually during verification; local_api.py
    # excludes them from Auto so route construction cannot masquerade as playback.
    for provider_name in ("anixo", "megavid", "animeparadise", "cosmic"):
        if f'"{provider_name}"' not in ranking_block:
            ranking_block = ranking_block.rstrip().rstrip(",") + f', "{provider_name}"'
    race_text = race_text[:ranking_match.start(1)] + ranking_block + race_text[ranking_match.end(1):]

    slow_cleanup = "await asyncio.wait(pending, timeout=8.0)"
    if slow_cleanup in race_text:
        race_text = race_text.replace(slow_cleanup, "await asyncio.wait(pending, timeout=0.2)", 1)
    elif "await asyncio.wait(pending, timeout=0.2)" not in race_text:
        fail("Could not locate the upstream stream-race cleanup wait.")

    # A failed stream race must also fail fast enough for the UI to try the next
    # provider or Server 1. Successful providers still return as soon as one wins.
    # Provider extraction can perform several network/decryption steps. Eight seconds
    # caused healthy modules to be reported as failures before extraction completed.
    # Keep Kuhi's standalone routes consistent with the mobile adapter's
    # provider budget. The mobile wrapper enforces its own per-provider timeout.
    old_watch_timeout = "WATCH_TIMEOUT = 75.0"
    if old_watch_timeout in race_text:
        race_text = race_text.replace(old_watch_timeout, "WATCH_TIMEOUT = 45.0", 1)
    elif "WATCH_TIMEOUT = 8.0" in race_text:
        race_text = race_text.replace("WATCH_TIMEOUT = 8.0", "WATCH_TIMEOUT = 45.0", 1)
    elif "WATCH_TIMEOUT = 22.0" in race_text:
        race_text = race_text.replace("WATCH_TIMEOUT = 22.0", "WATCH_TIMEOUT = 45.0", 1)
    elif "WATCH_TIMEOUT = 45.0" not in race_text:
        fail("Could not locate the upstream stream provider timeout.")
    race_file.write_text(race_text, encoding="utf-8")

    shutil.copy2(local_api, PYTHON_ROOT / "local_api.py")
    shutil.copy2(requirements, PYTHON_ROOT / "requirements.txt")

    import py_compile
    py_compile.compile(str(PYTHON_ROOT / "local_api.py"), doraise=True)
    py_compile.compile(str(race_file), doraise=True)
    # Catch optional provider syntax regressions during the build, not only at
    # first playback when the UI would otherwise show a silently missing server.
    for provider_file in (destination_src / "providers").rglob("*.py"):
        py_compile.compile(str(provider_file), doraise=True)


def main() -> None:
    if not ANDROID.is_dir():
        fail("The generated android/ directory is missing; generate Android with Capacitor first.")

    copy_python_source()
    patch_settings_gradle()
    patch_root_gradle()
    patch_app_gradle()
    patch_manifest()

    java_source = ROOT / "android-local-backend/LocalAnimeBackendPlugin.java"
    navigation_source = ROOT / "android-local-backend/StreamingNavigationWebViewClient.java"
    for source in (java_source, navigation_source):
        if not source.is_file():
            fail(f"Required native Android source is missing: {source}")

    package_dir = ANDROID / "app/src/main/java/com/sevenx/anime"
    package_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(java_source, package_dir / "LocalAnimeBackendPlugin.java")
    shutil.copy2(navigation_source, package_dir / "StreamingNavigationWebViewClient.java")

    candidates = list((ANDROID / "app/src/main/java").rglob("MainActivity.java"))
    if len(candidates) != 1:
        fail(f"Expected one generated MainActivity.java, found {len(candidates)}.")
    register_plugin(candidates[0])
    install_navigation_guard(candidates[0])

    print("Configured 7xAnime with an embedded Python API and native external-navigation guard.")


if __name__ == "__main__":
    main()
