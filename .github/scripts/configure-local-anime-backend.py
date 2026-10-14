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

    # Keep minSdk at 26 for the adblock-rust wrapper and compile against API 37,
    # which is required by the published AAR metadata. Do not change targetSdk.
    variables = ANDROID / "variables.gradle"
    patched_min_sdk = False
    patched_compile_sdk = False
    if variables.is_file():
        variables_text = variables.read_text(encoding="utf-8")
        variables_text, min_count = re.subn(
            r"(?m)^(\s*minSdkVersion\s*=\s*)\d+",
            r"\g<1>26",
            variables_text,
            count=1,
        )
        variables_text, compile_count = re.subn(
            r"(?m)^(\s*compileSdkVersion\s*=\s*)\d+",
            r"\g<1>37",
            variables_text,
            count=1,
        )
        if min_count:
            patched_min_sdk = True
        if compile_count:
            patched_compile_sdk = True
        if min_count or compile_count:
            variables.write_text(variables_text, encoding="utf-8")

    if not patched_min_sdk:
        patterns = [
            r"(?m)^(\s*minSdkVersion\s+)(?:rootProject\.ext\.minSdkVersion|\d+)",
            r"(?m)^(\s*minSdk\s*=\s*)(?:rootProject\.ext\.minSdkVersion|\d+)",
        ]
        for pattern in patterns:
            text, count = re.subn(pattern, r"\g<1>26", text, count=1)
            if count:
                patched_min_sdk = True
                break
    if not patched_min_sdk:
        fail("Could not raise Android minSdk to API level 26 required by the adblock-rust wrapper.")
    if not patched_compile_sdk:
        fail("Could not raise Android compileSdk to API level 37 required by the adblock-rust AAR.")

    default_pattern = r"^\s*defaultConfig\s*\{"
    default_match = re.search(default_pattern, text, flags=re.MULTILINE)
    if not default_match:
        fail("Could not locate app defaultConfig block.")
    default_open = text.find("{", default_match.start())
    default_close = matching_brace(text, default_open)
    default_config = text[default_open:default_close]

    requested_abis = [
        item.strip()
        for item in os.environ.get("ANDROID_ABI_FILTERS", "arm64-v8a,x86_64").split(",")
        if item.strip()
    ]
    allowed_abis = {"arm64-v8a", "x86_64"}
    if not requested_abis or len(set(requested_abis)) != len(requested_abis):
        fail("ANDROID_ABI_FILTERS must list one or more unique supported ABIs.")
    unsupported_abis = sorted(set(requested_abis) - allowed_abis)
    if unsupported_abis:
        fail("Unsupported Android ABI filter(s): " + ", ".join(unsupported_abis))
    abi_filters = "abiFilters " + ", ".join(f'"{abi}"' for abi in requested_abis)

    if "abiFilters" in default_config:
        default_config, abi_count = re.subn(
            r"(?m)^(\\s*)abiFilters\\s+[^\\n]+$",
            lambda match: match.group(1) + abi_filters,
            default_config,
            count=1,
        )
        if abi_count != 1:
            fail("Could not update the generated Android ABI filters.")
        text = text[:default_open] + default_config + text[default_close:]
    else:
        text = (
            text[:default_close]
            + "\\n        ndk {\\n            " + abi_filters + "\\n        }\\n    "
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

    if "io.github.mlm-games:adblock:0.1.3" not in text:
        text = insert_before_block_end(
            text,
            r"^dependencies\s*\{",
            '\n    implementation "io.github.mlm-games:adblock:0.1.3"\n',
            "app dependencies block",
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
    if "android.permission.REQUEST_INSTALL_PACKAGES" not in text:
        text = text.replace(
            "<application",
            '    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />\n\n    <application',
            1,
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

    provider_authority = '"${applicationId}.fileprovider"'
    if provider_authority not in text:
        provider = """
        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths" />
        </provider>
"""
        if "</application>" not in text:
            fail("Could not locate AndroidManifest application terminator for FileProvider.")
        text = text.replace("</application>", provider + "    </application>", 1)

    path_source = ROOT / "android-local-backend/file_paths.xml"
    if not path_source.is_file():
        fail("The native updater FileProvider path configuration is missing.")
    path_target = ANDROID / "app/src/main/res/xml/file_paths.xml"
    path_target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path_source, path_target)

    if "android.permission.REQUEST_INSTALL_PACKAGES" not in text:
        fail("Could not add Android REQUEST_INSTALL_PACKAGES permission.")
    if provider_authority not in text or "@xml/file_paths" not in text:
        fail("Could not configure Android FileProvider for update installation.")
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
    """Register native plugins idempotently before BridgeActivity initializes."""
    text = main_activity.read_text(encoding="utf-8")
    text = add_import(text, "import com.sevenx.anime.LocalAnimeBackendPlugin;")
    text = add_import(text, "import com.sevenx.anime.PlayerFullscreenPlugin;")
    if "import com.getcapacitor.BridgeActivity;" not in text:
        text = add_import(text, "import com.getcapacitor.BridgeActivity;")

    on_create = re.search(r"(?s)void\s+onCreate\s*\([^)]*\)\s*\{", text)
    if not on_create:
        class_match = re.search(r"class\s+MainActivity\s+extends\s+BridgeActivity\s*\{", text)
        if not class_match:
            fail("Could not locate MainActivity.onCreate or class declaration.")
        text = add_import(text, "import android.os.Bundle;")
        class_match = re.search(r"class\s+MainActivity\s+extends\s+BridgeActivity\s*\{", text)
        close = text.rfind("}")
        if close < class_match.end():
            fail("Could not locate MainActivity class terminator.")
        method = (
            "\n    @Override\n"
            "    public void onCreate(Bundle savedInstanceState) {\n"
            "        registerPlugin(LocalAnimeBackendPlugin.class);\n"
            "        registerPlugin(PlayerFullscreenPlugin.class);\n"
            "        super.onCreate(savedInstanceState);\n"
            "    }\n"
        )
        text = text[:close] + method + text[close:]
    else:
        remaining = text[on_create.end():]
        super_call = re.search(
            r"super\.onCreate\s*\(\s*savedInstanceState\s*\)\s*;",
            remaining,
        )
        if not super_call:
            fail("MainActivity has an onCreate method without the expected super call.")
        missing_registrations = []
        if "registerPlugin(LocalAnimeBackendPlugin.class)" not in text:
            missing_registrations.append("registerPlugin(LocalAnimeBackendPlugin.class);")
        if "registerPlugin(PlayerFullscreenPlugin.class)" not in text:
            missing_registrations.append("registerPlugin(PlayerFullscreenPlugin.class);")
        if missing_registrations:
            position = on_create.end() + super_call.start()
            insert = "\n        " + "\n        ".join(missing_registrations) + "\n        "
            text = text[:position] + insert + text[position:]
    main_activity.write_text(text, encoding="utf-8")


def install_navigation_guard(main_activity: Path) -> None:
    """Keep main-frame navigation in-app without sandboxing the streaming iframe itself."""
    text = main_activity.read_text(encoding="utf-8")
    text = add_import(text, "import com.sevenx.anime.StreamingNavigationWebViewClient;")
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


def install_service_worker_filter(main_activity: Path) -> None:
    """Apply the same known-ad request rules to Service Worker fetches on API 24+."""
    text = main_activity.read_text(encoding="utf-8")
    text = add_import(text, "import android.os.Build;")
    text = add_import(text, "import android.webkit.ServiceWorkerController;")
    text = add_import(text, "import com.sevenx.anime.StreamingServiceWorkerClient;")

    marker = "StreamingServiceWorkerClient()"
    if marker in text:
        return

    super_call = re.search(
        r"super\.onCreate\s*\(\s*savedInstanceState\s*\)\s*;",
        text,
    )
    if not super_call:
        fail("Could not find MainActivity.onCreate super call to install service-worker filtering.")

    statement = (
        "\n        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {"
        "\n            ServiceWorkerController.getInstance().setServiceWorkerClient(new StreamingServiceWorkerClient());"
        "\n        }"
    )
    position = super_call.end()
    text = text[:position] + statement + text[position:]
    main_activity.write_text(text, encoding="utf-8")


def install_adblock_filter_engine(main_activity: Path) -> None:
    """Initialize the rule engine without blocking the Activity startup thread."""
    text = main_activity.read_text(encoding="utf-8")
    text = add_import(text, "import com.sevenx.anime.AdblockFilterEngine;")
    statement = "AdblockFilterEngine.initialize(getApplicationContext());"
    if statement in text:
        return

    super_call = re.search(
        r"super\.onCreate\s*\(\s*savedInstanceState\s*\)\s*;",
        text,
    )
    if not super_call:
        fail("Could not find MainActivity.onCreate super call to initialize ad filtering.")

    position = super_call.end()
    text = text[:position] + "\n        " + statement + text[position:]
    main_activity.write_text(text, encoding="utf-8")


def install_streaming_chrome_client(main_activity: Path) -> None:
    """Install popup filtering, native iframe fullscreen, and fullscreen Back handling."""
    text = main_activity.read_text(encoding="utf-8")
    text = add_import(text, "import com.sevenx.anime.StreamingWebChromeClient;")

    class_match = re.search(r"class\s+MainActivity\s+extends\s+BridgeActivity\s*\{", text)
    if not class_match:
        fail("Could not locate MainActivity class to install streaming Chrome client.")

    field = "private StreamingWebChromeClient streamingWebChromeClient;"
    if field not in text:
        position = class_match.end()
        text = text[:position] + "\n    " + field + "\n" + text[position:]

    statement = (
        "streamingWebChromeClient = new StreamingWebChromeClient(getBridge());"
        "\n        getBridge().getWebView().setWebChromeClient(streamingWebChromeClient);"
    )
    if "setWebChromeClient(streamingWebChromeClient)" not in text:
        super_call = re.search(
            r"super\.onCreate\s*\(\s*savedInstanceState\s*\)\s*;",
            text,
        )
        if not super_call:
            fail("Could not find MainActivity.onCreate super call to install fullscreen Chrome client.")
        position = super_call.end()
        text = text[:position] + "\n        " + statement + text[position:]

    back_marker = "streamingWebChromeClient.handleBackPressed()"
    if back_marker not in text:
        if re.search(r"void\s+onBackPressed\s*\(", text):
            fail("MainActivity already overrides onBackPressed; add fullscreen handling to that override explicitly.")
        close = text.rfind("}")
        if close < class_match.end():
            fail("Could not locate MainActivity class terminator for fullscreen Back handler.")
        method = (
            "\n    @Override\n"
            "    public void onBackPressed() {\n"
            "        if (streamingWebChromeClient != null && streamingWebChromeClient.handleBackPressed()) {\n"
            "            return;\n"
            "        }\n"
            "        super.onBackPressed();\n"
            "    }\n"
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

    # Copy the independently authored extra adapters into the packaged provider tree.
    # AniXo and Megavid are manual-only embed servers; local_api.py excludes them
    # from Auto racing so a constructed iframe URL cannot masquerade as playback.
    extra_providers = {
        "animenosub": "android-local-backend/extra-providers/animenosub.py",
        "anixo": "android-local-backend/extra-providers/anixo.py",
        "megavid": "android-local-backend/extra-providers/megavid.py",
        "animeparadise": "android-local-backend/extra-providers/animeparadise.py",
        "megaflix": "android-local-backend/extra-providers/megaflix.py",
        "tryembed": "android-local-backend/extra-providers/tryembed.py",
        "cinexstream": "android-local-backend/extra-providers/cinexstream.py",
        "nontongo": "android-local-backend/extra-providers/nontongo.py",
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
    for provider_name in ("anixo", "megavid", "animeparadise", "megaflix", "tryembed", "cinexstream", "nontongo"):
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



def install_update_bridge(main_activity: Path) -> None:
    """Expose a narrowly scoped native bridge for official APK update installation."""
    text = main_activity.read_text(encoding="utf-8")
    text = add_import(text, "import com.sevenx.anime.UpdateBridge;")

    class_match = re.search(r"class\s+MainActivity\s+extends\s+BridgeActivity\s*\{", text)
    if not class_match:
        fail("Could not locate MainActivity for native update bridge setup.")
    field = "private UpdateBridge updateBridge;"
    if field not in text:
        text = text[:class_match.end()] + "\n    " + field + "\n" + text[class_match.end():]

    if 'addJavascriptInterface(updateBridge, "Android")' not in text:
        super_call = re.search(r"super\.onCreate\s*\(\s*savedInstanceState\s*\)\s*;", text)
        if not super_call:
            fail("Could not locate MainActivity.onCreate super call for update bridge setup.")
        statement = (
            "\n        updateBridge = new UpdateBridge(this);"
            "\n        if (getBridge() != null && getBridge().getWebView() != null) {"
            '\n            getBridge().getWebView().addJavascriptInterface(updateBridge, "Android");'
            '\n            getBridge().getWebView().addJavascriptInterface(updateBridge, "AndroidBridge");'
            "\n        }"
        )
        position = super_call.end()
        text = text[:position] + statement + text[position:]

    on_resume = re.search(r"void\s+onResume\s*\([^)]*\)\s*\{", text)
    if not on_resume:
        close = text.rfind("}")
        method = (
            "\n    @Override\n"
            "    public void onResume() {\n"
            "        super.onResume();\n"
            "        if (updateBridge != null) updateBridge.resumePendingInstall();\n"
            "    }\n"
        )
        text = text[:close] + method + text[close:]
    elif "updateBridge.resumePendingInstall()" not in text:
        open_index = text.find("{", on_resume.start())
        close_index = matching_brace(text, open_index)
        body = text[open_index + 1:close_index]
        super_resume = re.search(r"super\.onResume\s*\(\s*\)\s*;", body)
        insert_at = open_index + 1 + super_resume.end() if super_resume else open_index + 1
        text = text[:insert_at] + "\n        if (updateBridge != null) updateBridge.resumePendingInstall();\n" + text[insert_at:]

    main_activity.write_text(text, encoding="utf-8")

def main() -> None:
    if not ANDROID.is_dir():
        fail("The generated android/ directory is missing; generate Android with Capacitor first.")

    copy_python_source()
    patch_settings_gradle()
    patch_root_gradle()
    patch_app_gradle()
    patch_manifest()

    proguard_source = ROOT / "android-local-backend/proguard-7xanime-rules.pro"
    if not proguard_source.is_file():
        fail("The 7xAnime-specific ProGuard rules file is missing.")
    shutil.copy2(proguard_source, ANDROID / "app/proguard-7xanime-rules.pro")

    native_sources = {
        "LocalAnimeBackendPlugin.java": ROOT / "android-local-backend/LocalAnimeBackendPlugin.java",
        "StreamingNavigationWebViewClient.java": ROOT / "android-local-backend/StreamingNavigationWebViewClient.java",
        "StreamingServiceWorkerClient.java": ROOT / "android-local-backend/StreamingServiceWorkerClient.java",
        "AdblockFilterEngine.java": ROOT / "android-local-backend/AdblockFilterEngine.java",
        "StreamingWebChromeClient.java": ROOT / "android-local-backend/StreamingWebChromeClient.java",
        "PlayerFullscreenPlugin.java": ROOT / "android-local-backend/PlayerFullscreenPlugin.java",
        "UpdateBridge.java": ROOT / "android-local-backend/UpdateBridge.java",
    }
    for filename, source in native_sources.items():
        if not source.is_file():
            fail(f"Required native Android source is missing: {source}")

    package_dir = ANDROID / "app/src/main/java/com/sevenx/anime"
    package_dir.mkdir(parents=True, exist_ok=True)
    for filename, source in native_sources.items():
        shutil.copy2(source, package_dir / filename)

    candidates = list((ANDROID / "app/src/main/java").rglob("MainActivity.java"))
    if len(candidates) != 1:
        fail(f"Expected one generated MainActivity.java, found {len(candidates)}.")
    register_plugin(candidates[0])
    install_navigation_guard(candidates[0])
    install_service_worker_filter(candidates[0])
    install_streaming_chrome_client(candidates[0])
    install_adblock_filter_engine(candidates[0])
    install_update_bridge(candidates[0])

    print("Configured 7xAnime with maintained filter-list blocking, domain fallback, popup protection, and fullscreen support.")


if __name__ == "__main__":
    main()
