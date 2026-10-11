package com.sevenx.anime;

import android.net.Uri;
import android.util.Log;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Keeps remote players inside the app and applies a conservative first-party
 * WebView request filter for known ad/redirect networks. Media/player hosts are
 * not blanket-blocked; this deliberately prefers a short host list over broad
 * URL heuristics that might break video segments.
 */
public final class StreamingNavigationWebViewClient extends BridgeWebViewClient {
    private static final String TAG = "7xAnimeNavigation";

    private static final Set<String> BLOCKED_AD_DOMAINS = new HashSet<>(Arrays.asList(
        "doubleclick.net",
        "googlesyndication.com",
        "googleadservices.com",
        "adservice.google.com",
        "adnxs.com",
        "appnexus.com",
        "adform.net",
        "adsterra.com",
        "exoclick.com",
        "exosrv.com",
        "onclickads.net",
        "popads.net",
        "popcash.net",
        "popunder.net",
        "propellerads.com",
        "propeller-tracking.com",
        "trafficjunky.net",
        "juicyads.com",
        "hilltopads.net",
        "ad-maven.com",
        "admaven.com",
        "bidgear.com",
        "mgid.com",
        "taboola.com",
        "outbrain.com",
        "revcontent.com",
        "criteo.com",
        "smartadserver.com",
        "pubmatic.com",
        "openx.net",
        "rubiconproject.com",
        "amazon-adsystem.com",
        "sharethrough.com",
        "adroll.com",
        "adsrvr.org",
        "contextweb.com",
        "bidvertiser.com",
        "adcash.com",
        "clickadu.com",
        "pushalert.co",
        "pushengage.com",
        "webpushr.com",
        "pushcrew.com"
    ));

    public StreamingNavigationWebViewClient(Bridge bridge) {
        super(bridge);
    }

    private static boolean isAppUrl(Uri url) {
        if (url == null) return false;
        String scheme = url.getScheme() == null ? "" : url.getScheme().toLowerCase(Locale.ROOT);
        String host = url.getHost() == null ? "" : url.getHost().toLowerCase(Locale.ROOT);
        if (!"http".equals(scheme) && !"https".equals(scheme)) return false;
        return "localhost".equals(host)
            || "127.0.0.1".equals(host)
            || "::1".equals(host);
    }

    private static boolean isBlockedAdHost(String rawHost) {
        if (rawHost == null || rawHost.isEmpty()) return false;
        String host = rawHost.toLowerCase(Locale.ROOT);
        for (String domain : BLOCKED_AD_DOMAINS) {
            if (host.equals(domain) || host.endsWith("." + domain)) return true;
        }
        return false;
    }

    static boolean isBlockedAdRequest(Uri url) {
        if (url == null || isAppUrl(url)) return false;
        String scheme = url.getScheme();
        if (scheme == null || (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme))) {
            return false;
        }
        return isBlockedAdHost(url.getHost());
    }

    private static void reportBlockedNavigation(WebView view, Uri url) {
        if (view == null) return;
        String host = url == null || url.getHost() == null
            ? ""
            : url.getHost().replaceAll("[^A-Za-z0-9.\\-]", "");
        String script = "window.dispatchEvent(new CustomEvent('7xanime:blocked-player-action',{detail:{reason:'top-level-redirect',host:'"
            + host + "'}}));";
        view.post(() -> view.evaluateJavascript(script, null));
    }

    static WebResourceResponse blockedResponse() {
        // A successful empty response avoids noisy net::ERR_BLOCKED_BY_CLIENT
        // errors in players that tolerate missing ad scripts or tracking pixels.
        return new WebResourceResponse(
            "text/plain",
            StandardCharsets.UTF_8.name(),
            204,
            "No Content",
            Collections.emptyMap(),
            new ByteArrayInputStream(new byte[0])
        );
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri url = request == null ? null : request.getUrl();
        if (isBlockedAdRequest(url)) {
            Log.d(TAG, "Blocked ad resource: " + url.getHost());
            return blockedResponse();
        }
        return super.shouldInterceptRequest(view, request);
    }

    private static boolean isExternalTopLevel(Uri url) {
        // Only the app's own local origin can become the main document. Remote
        // player origins are allowed as subframes, never as top-level pages.
        return url == null || !isAppUrl(url);
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri url = request.getUrl();
        if (!request.isForMainFrame()) {
            // Keep normal iframe/player navigation in the current WebView.
            // External top-level navigation and popups are blocked separately.
            return false;
        }
        if (isExternalTopLevel(url)) {
            Log.d(TAG, "Blocked external top-level navigation: " + url.getScheme() + "://" + url.getHost());
            reportBlockedNavigation(view, url);
            return true;
        }
        return super.shouldOverrideUrlLoading(view, request);
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, String rawUrl) {
        Uri url = Uri.parse(rawUrl == null ? "" : rawUrl);
        if (isExternalTopLevel(url)) {
            Log.d(TAG, "Blocked external top-level navigation: " + url.getScheme() + "://" + url.getHost());
            reportBlockedNavigation(view, url);
            return true;
        }
        return super.shouldOverrideUrlLoading(view, rawUrl);
    }
}
