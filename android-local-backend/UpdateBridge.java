package com.sevenx.anime;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.util.Log;
import androidx.core.content.FileProvider;
import org.json.JSONObject;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

/** Native downloader/installer for published 7xAnime APK releases. */
public final class UpdateBridge {
    private static final String TAG = "7xAnimeUpdater";
    private static final String[] ALLOWED_HOSTS = {
        "github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"
    };
    private final Activity activity;
    private final AtomicBoolean cancelled = new AtomicBoolean(false);
    private volatile boolean downloading = false;
    private volatile File pendingInstallApk;

    public UpdateBridge(Activity activity) {
        this.activity = activity;
        File cached = new File(new File(activity.getCacheDir(), "updates"), "7xAnime-update.apk");
        if (cached.isFile() && cached.length() > 0) pendingInstallApk = cached;
    }

    @JavascriptInterface
    public String getAppVersionName() {
        try {
            PackageInfo info = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
            return info.versionName != null ? info.versionName : "0.0.0";
        } catch (Exception e) { return "0.0.0"; }
    }

    @JavascriptInterface
    public int getAppVersionCode() {
        try {
            PackageInfo info = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) return (int) info.getLongVersionCode();
            //noinspection deprecation
            return info.versionCode;
        } catch (Exception e) { return 0; }
    }

    @JavascriptInterface
    public synchronized void downloadAndInstallUpdate(final String rawUrl, final String version) {
        if (downloading) {
            notifyProgress(0, 0, 0, "downloading", "The update download is already running.");
            return;
        }
        if (!isAllowedUrl(rawUrl)) {
            notifyProgress(0, 0, 0, "error", "The update URL is not a trusted GitHub release URL.");
            return;
        }
        cancelled.set(false);
        downloading = true;
        new Thread(() -> {
            File partial = null;
            try {
                File updateDir = new File(activity.getCacheDir(), "updates");
                if (!updateDir.exists() && !updateDir.mkdirs()) {
                    throw new IllegalStateException("Could not create the update cache folder.");
                }
                partial = new File(updateDir, "7xAnime-update.apk.part");
                File apk = new File(updateDir, "7xAnime-update.apk");
                if (partial.exists()) partial.delete();
                downloadFile(rawUrl, partial);
                if (cancelled.get()) {
                    partial.delete();
                    notifyProgress(0, 0, 0, "idle", "");
                    return;
                }
                verifyApkArchive(partial);
                if (apk.exists() && !apk.delete()) {
                    throw new IllegalStateException("Could not replace the previous update.");
                }
                if (!partial.renameTo(apk)) {
                    throw new IllegalStateException("Could not finalize the downloaded APK.");
                }
                pendingInstallApk = apk;
                notifyProgress(apk.length(), apk.length(), 100, "installing", "");
                activity.runOnUiThread(() -> launchInstallerIfAllowed(apk));
            } catch (Exception e) {
                if (partial != null && partial.exists()) partial.delete();
                if (cancelled.get()) {
                    notifyProgress(0, 0, 0, "idle", "");
                } else {
                    Log.e(TAG, "APK update download failed", e);
                    notifyProgress(0, 0, 0, "error",
                        e.getMessage() != null ? e.getMessage() : "The download failed. Please retry.");
                }
            } finally {
                downloading = false;
            }
        }, "7xAnime-update-download").start();
    }

    @JavascriptInterface
    public void installDownloadedUpdate() {
        File apk = pendingInstallApk;
        if (apk == null || !apk.isFile() || apk.length() == 0) {
            notifyProgress(0, 0, 0, "error", "No verified update APK is cached. Download it again.");
            return;
        }
        activity.runOnUiThread(() -> launchInstallerIfAllowed(apk));
    }

    @JavascriptInterface
    public void openInstallPermissionSettings() {
        activity.runOnUiThread(() -> {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                    !activity.getPackageManager().canRequestPackageInstalls()) {
                    Intent intent = new Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + activity.getPackageName())
                    );
                    activity.startActivity(intent);
                } else {
                    resumePendingInstall();
                }
            } catch (Exception e) {
                Log.e(TAG, "Could not open install permission settings", e);
                notifyProgress(0, 0, 0, "error", "Could not open Android install permission settings.");
            }
        });
    }

    @JavascriptInterface
    public void cancelUpdateDownload() { cancelled.set(true); }

    public void resumePendingInstall() {
        File apk = pendingInstallApk;
        if (apk == null || !apk.isFile() || apk.length() == 0) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !activity.getPackageManager().canRequestPackageInstalls()) return;
        launchInstallerIfAllowed(apk);
    }

    private void launchInstallerIfAllowed(File apk) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !activity.getPackageManager().canRequestPackageInstalls()) {
            pendingInstallApk = apk;
            notifyProgress(apk.length(), apk.length(), 100, "permission",
                "Allow 7xAnime to install apps in Android settings, then return here.");
            try {
                Intent settings = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + activity.getPackageName())
                );
                activity.startActivity(settings);
            } catch (Exception e) {
                Log.e(TAG, "Could not open install permission settings", e);
                notifyProgress(apk.length(), apk.length(), 100, "error",
                    "Could not open Android install permission settings.");
            }
            return;
        }
        try {
            Uri uri = FileProvider.getUriForFile(
                activity, activity.getPackageName() + ".fileprovider", apk
            );
            Intent install = new Intent(Intent.ACTION_VIEW);
            install.setDataAndType(uri, "application/vnd.android.package-archive");
            install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(install);
            notifyProgress(apk.length(), apk.length(), 100, "installing",
                "Confirm the update in Android's package installer.");
        } catch (Exception e) {
            Log.e(TAG, "Could not open Android package installer", e);
            notifyProgress(apk.length(), apk.length(), 100, "error",
                "Android could not open the installer. Tap Install again to retry.");
        }
    }

    private void downloadFile(String rawUrl, File destination) throws Exception {
        URL url = new URL(rawUrl);
        HttpURLConnection connection = null;
        InputStream input = null;
        long downloaded = 0L, total = 0L, lastUpdate = 0L;
        try {
            for (int redirects = 0; redirects <= 5; redirects++) {
                if (!isAllowedUrl(url.toString())) {
                    throw new SecurityException("The download redirected to an untrusted host.");
                }
                connection = (HttpURLConnection) url.openConnection();
                connection.setInstanceFollowRedirects(false);
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(30000);
                connection.setRequestProperty("Accept", "application/octet-stream");
                connection.setRequestProperty("User-Agent", "7xAnime-Android-Updater");
                int code = connection.getResponseCode();
                if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
                    String location = connection.getHeaderField("Location");
                    connection.disconnect();
                    connection = null;
                    if (location == null || redirects == 5) {
                        throw new IllegalStateException("GitHub returned an invalid download redirect.");
                    }
                    url = new URL(url, location);
                    continue;
                }
                if (code != HttpURLConnection.HTTP_OK) {
                    throw new IllegalStateException("GitHub APK download failed (HTTP " + code + ").");
                }
                total = connection.getContentLengthLong();
                input = new BufferedInputStream(connection.getInputStream());
                try (FileOutputStream output = new FileOutputStream(destination)) {
                    byte[] buffer = new byte[32768];
                    int read;
                    while ((read = input.read(buffer)) != -1) {
                        if (cancelled.get()) throw new InterruptedException("Download cancelled.");
                        output.write(buffer, 0, read);
                        downloaded += read;
                        long now = System.currentTimeMillis();
                        if (now - lastUpdate >= 150 || (total > 0 && downloaded >= total)) {
                            int pct = total > 0 ? (int) Math.min(99L, downloaded * 100L / total) : 0;
                            notifyProgress(downloaded, total, pct, "downloading", "");
                            lastUpdate = now;
                        }
                    }
                    output.flush();
                }
                return;
            }
            throw new IllegalStateException("Too many redirects while downloading the update.");
        } finally {
            if (input != null) try { input.close(); } catch (Exception ignored) {}
            if (connection != null) connection.disconnect();
        }
    }

    private void verifyApkArchive(File file) throws Exception {
        if (!file.isFile() || file.length() < 1024) {
            throw new IllegalStateException("The downloaded APK is empty or incomplete.");
        }
        try (FileInputStream input = new FileInputStream(file)) {
            if (input.read() != 'P' || input.read() != 'K') {
                throw new IllegalStateException("The download is not a valid APK archive.");
            }
        }
    }

    private boolean isAllowedUrl(String value) {
        try {
            URL url = new URL(value);
            if (!"https".equalsIgnoreCase(url.getProtocol())) return false;
            String host = url.getHost().toLowerCase(Locale.ROOT);
            for (String allowed : ALLOWED_HOSTS) if (allowed.equals(host)) return true;
            return false;
        } catch (Exception ignored) { return false; }
    }

    private void notifyProgress(long downloaded, long total, int percent, String state, String error) {
        final String safeState = JSONObject.quote(state == null ? "idle" : state);
        final String safeError = JSONObject.quote(error == null ? "" : error);
        final String script = "if (typeof window.onNativeUpdateProgress === 'function') {" +
            "window.onNativeUpdateProgress(" + downloaded + "," + total + "," + percent + "," +
            safeState + "," + safeError + ");}";
        activity.runOnUiThread(() -> {
            try {
                com.getcapacitor.Bridge bridge = ((com.getcapacitor.BridgeActivity) activity).getBridge();
                if (bridge != null && bridge.getWebView() != null) bridge.getWebView().evaluateJavascript(script, null);
            } catch (Exception e) { Log.w(TAG, "Unable to send updater progress to WebView", e); }
        });
    }
}
