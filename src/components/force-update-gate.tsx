"use client";
import { useEffect, useMemo, useState } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { ArrowDownToLine, CheckCircle2, Download, ExternalLink, LoaderCircle, ShieldAlert, Sparkles, TriangleAlert } from "lucide-react";

const RELEASE_API = "https://api.github.com/repos/RahulExe69/7xAnime-Releases/releases/latest";
type GateStatus = "checking" | "none" | "required" | "downloading" | "installing" | "permission" | "error";
type ReleaseAsset = { name?: string; size?: number; browser_download_url?: string };
type LatestRelease = { tag_name?: string; body?: string; published_at?: string; assets?: ReleaseAsset[] };
type NativeUpdateBridge = {
  getAppVersionName?: () => string;
  getSupportedAbis?: () => string;
  downloadAndInstallUpdate?: (url: string, version: string) => void;
  installDownloadedUpdate?: () => void;
  openInstallPermissionSettings?: () => void;
};
declare global {
  interface Window {
    Android?: NativeUpdateBridge;
    AndroidBridge?: NativeUpdateBridge;
    onNativeUpdateProgress?: (downloaded: number, total: number, percent: number, state: string, error?: string) => void;
  }
}
function cleanVersion(version: string): string {
  return version.trim().replace(/^v/i, "").split(/[+-]/)[0];
}
function compareVersions(left: string, right: string): number {
  const a = cleanVersion(left).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const b = cleanVersion(right).split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const av = a[i] || 0, bv = b[i] || 0;
    if (av !== bv) return av > bv ? 1 : -1;
  }
  return 0;
}
function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "APK";
  return size >= 1048576 ? (size / 1048576).toFixed(1) + " MB" : Math.round(size / 1024) + " KB";
}
function getBridge(): NativeUpdateBridge | undefined {
  return typeof window === "undefined" ? undefined : (window.Android || window.AndroidBridge);
}
export default function ForceUpdateGate() {
  const [status, setStatus] = useState<GateStatus>("none");
  const [currentVersion, setCurrentVersion] = useState("—");
  const [latestVersion, setLatestVersion] = useState("");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [apkSize, setApkSize] = useState(0);
  const [progress, setProgress] = useState(0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let disposed = false;
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
      setStatus("none");
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    setStatus("checking");
    window.onNativeUpdateProgress = (downloaded, total, percent, nativeState, error) => {
      if (disposed) return;
      setDownloadedBytes(Math.max(0, downloaded || 0));
      setTotalBytes(Math.max(0, total || 0));
      setProgress(Math.max(0, Math.min(100, percent || 0)));
      if (nativeState === "permission") {
        setStatus("permission");
        setErrorMessage(error || "Allow 7xAnime to install apps in Android settings, then return here.");
      } else if (nativeState === "downloading") {
        setStatus("downloading");
        setErrorMessage("");
      } else if (nativeState === "installing") {
        setStatus("installing");
        setErrorMessage(error || "");
      } else if (nativeState === "error") {
        setStatus("error");
        setErrorMessage(error || "The update could not be installed. Please retry.");
      } else if (nativeState === "idle") {
        setStatus("required");
      }
    };
    void (async () => {
      try {
        let installedVersion = "0.0.0";
        try {
          const appInfo = await App.getInfo();
          if (appInfo.id && appInfo.id.endsWith(".debug")) {
            if (!disposed) setStatus("none");
            return;
          }
          if (appInfo.version) installedVersion = appInfo.version;
        } catch {
          const nativeVersion = getBridge()?.getAppVersionName?.();
          if (nativeVersion) installedVersion = nativeVersion;
        }
        const response = await fetch(RELEASE_API, {
          cache: "no-store",
          headers: { Accept: "application/vnd.github+json" },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Release API returned HTTP " + response.status + ".");
        const release = (await response.json()) as LatestRelease;
        const tag = typeof release.tag_name === "string" ? release.tag_name : "";
        const apkAssets = Array.isArray(release.assets)
          ? release.assets.filter((asset) => asset.name?.toLowerCase().endsWith(".apk") && !!asset.browser_download_url)
          : [];
        const supportedAbis = (getBridge()?.getSupportedAbis?.() || "")
          .split(",")
          .map((abi) => abi.trim().toLowerCase())
          .filter(Boolean);
        const architectureApk = supportedAbis
          .map((abi) => apkAssets.find((asset) => asset.name?.toLowerCase().endsWith(`-${abi}.apk`)))
          .find((asset) => !!asset);
        // Keep the unsuffixed universal APK as a fallback for older releases,
        // older native bridges, and devices without a matching architecture asset.
        const universalApk = apkAssets.find((asset) =>
          !/-(?:arm64-v8a|x86_64|armeabi-v7a|x86)\.apk$/i.test(asset.name || ""));
        const apk = architectureApk || universalApk;
        if (!/^v?\d+\.\d+\.\d+(?:[-+][0-9a-z.-]+)?$/i.test(tag) || !apk?.browser_download_url) {
          throw new Error("The latest published release does not contain a valid versioned APK.");
        }
        if (disposed) return;
        const latest = cleanVersion(tag);
        setCurrentVersion(installedVersion);
        setLatestVersion(latest);
        setReleaseNotes(release.body || "Performance improvements and bug fixes.");
        setPublishedAt(release.published_at || "");
        setDownloadUrl(apk.browser_download_url);
        setApkSize(apk.size || 0);
        setErrorMessage("");
        setStatus(compareVersions(latest, installedVersion) > 0 ? "required" : "none");
      } catch {
        if (!disposed) setStatus("none"); // Network failures fail open and retry on next startup.
      } finally {
        window.clearTimeout(timeout);
      }
    })();
    return () => {
      disposed = true;
      controller.abort();
      window.clearTimeout(timeout);
      delete window.onNativeUpdateProgress;
    };
  }, []);

  useEffect(() => {
    if (!["checking", "required", "downloading", "installing", "permission", "error"].includes(status)) return;
    const preventDismiss = (event: Event) => event.preventDefault();
    window.addEventListener("7xanime:back", preventDismiss);
    return () => window.removeEventListener("7xanime:back", preventDismiss);
  }, [status]);

  const notes = useMemo(() => {
    const cleaned = releaseNotes
      .replace(/<!--[\\s\\S]*?-->/g, "")
      .split(/\\r?\\n/)
      .map((line) => line.trim())
      .filter((line) => {
        if (!line || /^#+\\s/.test(line) || /^[-*_]{3,}$/.test(line)) return false;
        if (/^(full changelog|compare view|view changes|release notes|what's new|changelog)\\b/i.test(line)) return false;
        if (/^\\*\\*?(file|package|size|sha-256|android version code|optimizations|architectures|signing|apk)\\*\\*?:/i.test(line)) return false;
        if (/^https?:\\/\\//i.test(line)) return false;
        return true;
      })
      .map((line) => line
        .replace(/^[-*•]\\s+/, "")
        .replace(/^\\d+[.)]\\s+/, "")
        .replace(/\\[([^\\]]+)\\]\\([^)]+\\)/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\\*\\*(.*?)\\*\\*/g, "$1")
        .replace(/\\s+/g, " ")
        .trim())
      .filter((line) => line && !/^(full changelog|see all changes|download|assets)\\b/i.test(line));
    const unique = Array.from(new Set(cleaned));
    return unique.slice(0, 5).map((line) => line.length > 135 ? line.slice(0, 132).replace(/\\s+\\S*$/, "") + "…" : line);
  }, [releaseNotes]);

  const startDownload = () => {
    setErrorMessage("");
    setProgress(0);
    setDownloadedBytes(0);
    setTotalBytes(apkSize);
    const bridge = getBridge();
    if (!downloadUrl || !bridge?.downloadAndInstallUpdate) {
      setStatus("error");
      setErrorMessage("The native installer is unavailable or the release has no APK. Try the direct download below.");
      return;
    }
    setStatus("downloading");
    bridge.downloadAndInstallUpdate(downloadUrl, latestVersion);
  };
  const retry = () => {
    const bridge = getBridge();
    if (status === "permission" && bridge?.openInstallPermissionSettings) {
      bridge.openInstallPermissionSettings();
      return;
    }
    if (status === "installing" && bridge?.installDownloadedUpdate) {
      bridge.installDownloadedUpdate();
      return;
    }
    startDownload();
  };
  if (status === "none") return null;
  const displayDate = publishedAt
    ? new Date(publishedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : "Latest release";
  return (
    <div className="fixed inset-0 z-[99999] h-[100dvh] w-full overflow-hidden bg-[#080308] text-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-fuchsia-600/15 blur-[100px]" />
        <div className="absolute -bottom-24 -right-16 h-80 w-80 rounded-full bg-violet-600/15 blur-[110px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(236,72,153,0.08),transparent_55%)]" />
      </div>

      <section aria-live="polite" aria-modal="true" role="dialog" aria-labelledby="7xanime-update-title"
        className="relative z-10 flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#10070e]/95">
        <header className="shrink-0 border-b border-white/[0.08] px-4 pb-4 pt-[calc(env(safe-area-inset-top)+0.85rem)] sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/[0.08] bg-black/35 p-1.5">
              <img src="/brand/7xanime-icon.png" alt="" className="h-full w-full object-contain" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#ff9fbe]">7xAnime · Official release</p>
              <h1 id="7xanime-update-title" className="text-xl font-black tracking-tight sm:text-2xl">Update available</h1>
              <p className="mt-0.5 text-xs text-white/55 sm:text-sm">
                {status === "checking" ? "Checking for the latest version…" : "A newer version is ready to install."}
              </p>
            </div>
          </div>
          {status !== "checking" && (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">7xAnime v{latestVersion}</p>
                <p className="mt-0.5 text-[11px] text-white/45">Released {displayDate}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-semibold text-[#ffbad0]">{formatBytes(apkSize)}</p>
                <p className="mt-0.5 text-[10px] text-white/40">APK update</p>
              </div>
            </div>
          )}
        </header>

        {status === "checking" ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <LoaderCircle className="h-9 w-9 animate-spin text-[#ff9fbe]" />
            <p className="font-semibold">Checking the latest release…</p>
            <p className="text-sm text-white/45">This usually takes only a moment.</p>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
            <div className="mb-4 flex items-center justify-between gap-3 text-xs">
              <span className="text-white/45">Installed version</span>
              <span className="rounded-lg bg-white/[0.05] px-2.5 py-1 font-mono text-white/80">v{currentVersion}</span>
            </div>

            <section className="rounded-2xl border border-white/[0.08] bg-[#160a12] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-extrabold tracking-tight">What’s new</h2>
                  <p className="mt-1 text-xs text-white/45">The latest improvements in this version</p>
                </div>
                <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[#ff9fbe]" />
              </div>
              {notes.length ? (
                <ul className="mt-4 space-y-3">
                  {notes.map((note, index) => (
                    <li key={String(index) + "-" + note} className="flex items-start gap-2.5">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#ff9fbe]/85" />
                      <p className="line-clamp-2 min-w-0 text-sm leading-5 text-white/75">{note}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm leading-5 text-white/65">Stability improvements and fixes are ready for you.</p>
              )}
            </section>

            {(status === "downloading" || status === "installing") && (
              <div className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4">
                <div className="mb-2 flex items-center justify-between gap-3 text-xs text-white/65">
                  <span>{status === "downloading" ? "Downloading update" : "Opening Android installer"}</span>
                  <span>{status === "downloading" ? progress + "%" : "Please wait"}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className={"h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-400 transition-all duration-200 " + (status === "installing" ? "w-full animate-pulse" : "")}
                    style={status === "downloading" ? { width: progress + "%" } : undefined} />
                </div>
                {totalBytes > 0 && status === "downloading" && (
                  <p className="mt-2 text-right text-[11px] text-white/40">{formatBytes(downloadedBytes)} of {formatBytes(totalBytes)}</p>
                )}
              </div>
            )}

            {status === "permission" && (
              <div className="mt-4 flex gap-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.07] p-3 text-sm text-amber-100/85">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" /><span>{errorMessage || "Allow 7xAnime to install apps, then return here."}</span>
              </div>
            )}
            {status === "error" && (
              <div className="mt-4 flex gap-3 rounded-xl border border-rose-300/20 bg-rose-300/[0.07] p-3 text-sm text-rose-100/85">
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" /><span>{errorMessage}</span>
              </div>
            )}
          </div>
        )}

        {status !== "checking" && (
          <footer className="shrink-0 border-t border-white/[0.08] bg-[#10070e]/98 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:px-6">
            <button type="button" onClick={retry} disabled={status === "downloading"}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-500 px-4 py-3 text-sm font-extrabold text-white shadow-lg shadow-fuchsia-950/25 disabled:cursor-wait disabled:opacity-60">
              {status === "downloading" ? <><LoaderCircle className="h-5 w-5 animate-spin" /> Downloading update</> :
               status === "installing" ? <><CheckCircle2 className="h-5 w-5" /> Continue to Android installer</> :
               status === "permission" ? <><ShieldAlert className="h-5 w-5" /> Allow installation</> :
               status === "error" ? <><ArrowDownToLine className="h-5 w-5" /> Retry update</> :
               <><Download className="h-5 w-5" /> Download & install v{latestVersion}</>}
            </button>
            {status === "error" && downloadUrl && (
              <button type="button" onClick={() => window.open(downloadUrl, "_blank", "noopener,noreferrer")}
                className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-white/70 hover:bg-white/[0.04]">
                <ExternalLink className="h-4 w-4" /> Open APK download instead
              </button>
            )}
            <p className="mt-2 text-center text-[10px] leading-4 text-white/30">Official signed APK · 7xAnime Releases</p>
          </footer>
        )}
      </section>
    </div>
}
