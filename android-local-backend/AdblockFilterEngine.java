package com.sevenx.anime;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.util.Base64;
import android.util.Log;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import org.mlm.adblock.AdblockEngine;
import org.mlm.adblock.BlockDecision;
import org.mlm.adblock.RequestTypeMapper;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Background-loaded network filter engine for the embedded streaming WebView.
 *
 * Filter lists are downloaded and parsed off the UI thread, then cached in the
 * app's private files directory. If the engine/list download is unavailable,
 * the existing conservative domain denylist remains active (fail-open).
 *
 * This adapter intentionally handles network decisions only. Cosmetic rules
 * and scriptlets are not injected into untrusted provider frames.
 */
public final class AdblockFilterEngine {
    private static final String TAG = "7xAnimeAdblock";
    private static final String PREFS = "7xanime_adblock";
    private static final String PREF_LAST_SUCCESS = "last_filter_success";
    private static final long FILTER_REFRESH_INTERVAL_MS = 7L * 24L * 60L * 60L * 1000L;
    private static final int CONNECT_TIMEOUT_MS = 10000;
    private static final int READ_TIMEOUT_MS = 15000;
    private static final int MAX_FILTER_BYTES = 12 * 1024 * 1024;
    private static final int MAX_RESOURCE_BYTES = 2 * 1024 * 1024;

    private static final String[] FILTER_LIST_URLS = new String[] {
        "https://filters.adtidy.org/extension/chromium/filters/2.txt",
        "https://easylist.to/easylist/easylist.txt",
        "https://filters.adtidy.org/extension/chromium/filters/3.txt"
    };

    private static final ExecutorService WORKER = Executors.newSingleThreadExecutor(r -> {
        Thread thread = new Thread(r, "7xanime-adblock-init");
        thread.setDaemon(true);
        return thread;
    });
    private static final AtomicBoolean INITIALIZING = new AtomicBoolean(false);
    private static volatile AdblockEngine engine;

    private AdblockFilterEngine() {}

    /** Start initialization without blocking Android's UI thread. */
    public static void initialize(Context context) {
        if (context == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        if (!INITIALIZING.compareAndSet(false, true)) return;

        Context appContext = context.getApplicationContext();
        WORKER.execute(() -> {
            try {
                initializeOnWorker(appContext);
            } catch (Throwable error) {
                Log.w(TAG, "Filter engine unavailable; retaining the built-in domain fallback", error);
            } finally {
                INITIALIZING.set(false);
            }
        });
    }

    public static boolean isReady() {
        return engine != null;
    }

    private static void initializeOnWorker(Context context) throws Exception {
        File cacheFile = new File(context.getFilesDir(), "7xanime-adblock-engine.bin");
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        AdblockEngine cachedEngine = null;

        if (cacheFile.isFile() && cacheFile.length() > 0) {
            try {
                AdblockEngine candidate = AdblockEngine.Companion.create();
                if (candidate.deserializeFrom(cacheFile)) {
                    loadResources(context, candidate);
                    cachedEngine = candidate;
                    engine = candidate;
                    Log.i(TAG, "Loaded cached filter engine");
                } else {
                    candidate.close();
                }
            } catch (Throwable error) {
                Log.w(TAG, "Cached filter engine could not be restored", error);
                if (cachedEngine != null) cachedEngine.close();
                cachedEngine = null;
            }
        }

        long lastSuccess = preferences.getLong(PREF_LAST_SUCCESS, 0L);
        if (cachedEngine != null && System.currentTimeMillis() - lastSuccess < FILTER_REFRESH_INTERVAL_MS) {
            return;
        }

        List<String> lists = downloadFilterLists();
        if (lists.isEmpty()) {
            Log.w(TAG, "No filter lists could be downloaded; using cached rules or domain fallback");
            return;
        }

        AdblockEngine freshEngine = null;
        try {
            freshEngine = AdblockEngine.Companion.create();
            StringBuilder rules = new StringBuilder();
            for (String list : lists) {
                if (rules.length() > 0) rules.append('\n');
                rules.append(list);
            }
            if (rules.length() == 0 || !freshEngine.loadFilterList(rules.toString())) {
                Log.w(TAG, "Filter list parser rejected the downloaded rules");
                return;
            }
            loadResources(context, freshEngine);

            File tempFile = new File(context.getFilesDir(), "7xanime-adblock-engine.tmp");
            if (freshEngine.serializeTo(tempFile) && tempFile.isFile() && tempFile.length() > 0) {
                try {
                    Files.move(tempFile.toPath(), cacheFile.toPath(),
                        StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
                } catch (AtomicMoveNotSupportedException unsupported) {
                    Files.move(tempFile.toPath(), cacheFile.toPath(), StandardCopyOption.REPLACE_EXISTING);
                } catch (IOException cacheError) {
                    Log.w(TAG, "Could not persist refreshed engine; keeping it in memory", cacheError);
                }
            } else {
                tempFile.delete();
            }

            engine = freshEngine;
            freshEngine = null;
            if (cachedEngine != null && cachedEngine != engine) {
                cachedEngine.close();
                cachedEngine = null;
            }
            preferences.edit().putLong(PREF_LAST_SUCCESS, System.currentTimeMillis()).apply();
            Log.i(TAG, "Loaded " + lists.size() + " maintained ad-filter lists");
        } finally {
            if (freshEngine != null) freshEngine.close();
        }
    }

    private static void loadResources(Context context, AdblockEngine target) {
        try (InputStream input = context.getAssets().open("adblock/resources.json")) {
            String resources = new String(readLimited(input, MAX_RESOURCE_BYTES), StandardCharsets.UTF_8);
            if (!target.loadResources(resources)) {
                Log.w(TAG, "Redirect/scriptlet resources unavailable; basic network rules remain active");
            }
        } catch (Throwable error) {
            Log.w(TAG, "Could not load bundled redirect resources", error);
        }
    }

    private static List<String> downloadFilterLists() {
        List<String> result = new ArrayList<>();
        for (String endpoint : FILTER_LIST_URLS) {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(endpoint).openConnection();
                connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
                connection.setReadTimeout(READ_TIMEOUT_MS);
                connection.setInstanceFollowRedirects(true);
                connection.setRequestMethod("GET");
                connection.setRequestProperty("Accept", "text/plain,*/*;q=0.8");
                connection.setRequestProperty("User-Agent", "7xAnime-Android/1.0 AdblockEngine");

                int status = connection.getResponseCode();
                if (status < 200 || status >= 300) {
                    Log.w(TAG, "Filter list returned HTTP " + status + ": " + endpoint);
                    continue;
                }
                String list;
                try (InputStream stream = connection.getInputStream()) {
                    list = new String(readLimited(stream, MAX_FILTER_BYTES), StandardCharsets.UTF_8);
                }
                String prefix = list.trim().toLowerCase(Locale.ROOT);
                if (list.length() < 100 || prefix.startsWith("<!doctype html") || prefix.startsWith("<html")) {
                    Log.w(TAG, "Ignoring invalid filter list response: " + endpoint);
                    continue;
                }
                result.add(list);
                Log.i(TAG, "Downloaded ad-filter list: " + endpoint);
            } catch (Throwable error) {
                Log.w(TAG, "Could not download ad-filter list: " + endpoint, error);
            } finally {
                if (connection != null) connection.disconnect();
            }
        }
        return result;
    }

    private static byte[] readLimited(InputStream input, int maxBytes) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[16 * 1024];
        int total = 0;
        int count;
        while ((count = input.read(buffer)) != -1) {
            total += count;
            if (total > maxBytes) throw new IOException("Content exceeded " + maxBytes + " bytes");
            output.write(buffer, 0, count);
        }
        return output.toByteArray();
    }

    /**
     * Return a WebView response only when a filter rule blocks/replaces a
     * request. Null lets normal WebView processing continue unchanged.
     */
    static WebResourceResponse intercept(
        String rawUrl,
        String sourceUrl,
        String acceptHeader,
        boolean isForMainFrame
    ) {
        if (rawUrl == null || rawUrl.isEmpty() || isForMainFrame) return null;

        Uri uri = Uri.parse(rawUrl);
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        if ((!scheme.equals("http") && !scheme.equals("https")) || isAppHost(host)) return null;

        AdblockEngine current = engine;
        if (current == null) return null;

        String documentUrl = sourceUrl == null || sourceUrl.isEmpty() ? rawUrl : sourceUrl;
        try {
            String requestType = RequestTypeMapper.INSTANCE.from(uri, acceptHeader);
            BlockDecision decision = current.checkNetworkRequest(rawUrl, documentUrl, requestType);

            String redirect = decision.getRedirect();
            if (redirect != null && !redirect.isEmpty()) {
                WebResourceResponse replacement = responseForDataUrl(redirect);
                if (replacement != null) return replacement;
            }

            // Avoid refetching rewritten URLs because provider cookies, headers,
            // and media signatures may depend on the original WebView request.
            String rewrittenUrl = decision.getRewrittenUrl();
            if (rewrittenUrl != null && !rewrittenUrl.equals(rawUrl)) return null;

            if (decision.getMatched()) {
                return StreamingNavigationWebViewClient.blockedResponse();
            }
        } catch (Throwable error) {
            Log.w(TAG, "Filter evaluation failed open for " + host, error);
        }
        return null;
    }

    static String header(WebResourceRequest request, String name) {
        if (request == null || name == null) return null;
        Map<String, String> headers = request.getRequestHeaders();
        if (headers == null) return null;
        for (Map.Entry<String, String> entry : headers.entrySet()) {
            if (entry.getKey() != null && entry.getKey().equalsIgnoreCase(name)) {
                return entry.getValue();
            }
        }
        return null;
    }

    private static boolean isAppHost(String host) {
        return "localhost".equals(host) || "127.0.0.1".equals(host) || "::1".equals(host);
    }

    private static WebResourceResponse responseForDataUrl(String rawDataUrl) {
        try {
            if (!rawDataUrl.regionMatches(true, 0, "data:", 0, 5)) return null;
            int comma = rawDataUrl.indexOf(',');
            if (comma < 0) return null;

            String metadata = rawDataUrl.substring(5, comma);
            String[] parts = metadata.split(";");
            String mimeType = "text/plain";
            String charsetName = "UTF-8";
            boolean base64 = false;
            if (parts.length > 0 && !parts[0].isEmpty() && parts[0].contains("/")) {
                mimeType = parts[0];
            }
            for (String part : parts) {
                String lower = part.toLowerCase(Locale.ROOT);
                if ("base64".equals(lower)) base64 = true;
                else if (lower.startsWith("charset=")) charsetName = part.substring("charset=".length());
            }

            String payload = Uri.decode(rawDataUrl.substring(comma + 1));
            byte[] body;
            if (base64) {
                body = Base64.decode(payload, Base64.DEFAULT);
            } else {
                Charset charset;
                try {
                    charset = Charset.forName(charsetName);
                } catch (Throwable ignored) {
                    charset = StandardCharsets.UTF_8;
                    charsetName = "UTF-8";
                }
                body = payload.getBytes(charset);
            }
            return new WebResourceResponse(mimeType, charsetName, new ByteArrayInputStream(body));
        } catch (Throwable error) {
            Log.w(TAG, "Could not serve a filter redirect resource", error);
            return null;
        }
    }
}
