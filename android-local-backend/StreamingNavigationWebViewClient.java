package com.sevenx.anime;

import android.net.Uri;
import android.util.Log;
import android.webkit.WebResourceError;
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
 * Keeps every remote player provider inside the app and applies the same
 * provider-agnostic ad-filter engine to all embedded WebView requests. Rules
 * are evaluated from the request/document context rather than a Megavid-only
 * condition. Media/player hosts are not blanket-blocked, avoiding broad URL
 * heuristics that could break video segments.
 */
public final class StreamingNavigationWebViewClient extends BridgeWebViewClient {
    private static final String TAG = "7xAnimeNavigation";

    // Domains where a failed embedded HTML document should be reported to the
    // watch page. This intentionally excludes images, scripts, ad resources,
    // and arbitrary third-party frames.
    private static final Set<String> EMBED_PLAYER_DOMAINS = new HashSet<>(Arrays.asList(
        "megaplay.buzz",
        "anixo.buzz",
        "megavid.buzz",
        "tryembed.us.cc",
        "cinextream.cc"
    ));

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
        "pushcrew.com",
        "onclckmn.com",
        "trafficstars.com",
        "clickadilla.com",
        "adskeeper.co.uk",
        "ad-delivery.net",
        "serve-sys.com",
        "trafficfactory.biz"
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

    private static String headerSourceUrl(WebResourceRequest request) {
        String referer = AdblockFilterEngine.header(request, "Referer");
        return referer == null || referer.isEmpty() ? null : referer;
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri url = request == null ? null : request.getUrl();
        if (isBlockedAdRequest(url)) {
            Log.d(TAG, "Blocked known ad resource: " + url.getHost());
            return blockedResponse();
        }
        if (request != null && url != null) {
            String sourceUrl = headerSourceUrl(request);
            WebResourceResponse filtered = AdblockFilterEngine.intercept(
                url.toString(),
                sourceUrl,
                AdblockFilterEngine.header(request, "Accept"),
                request.isForMainFrame()
            );
            if (filtered != null) {
                Log.d(TAG, "Blocked/replaced by filter-list rule: " + url.getHost());
                return filtered;
            }
        }
        return super.shouldInterceptRequest(view, request);
    }

    private static boolean isEmbeddedPlayerDocument(WebResourceRequest request) {
        if (request == null || request.isForMainFrame()) return false;
        Uri url = request.getUrl();
        if (url == null || !"https".equalsIgnoreCase(url.getScheme())) return false;
        String host = url.getHost() == null ? "" : url.getHost().toLowerCase(Locale.ROOT);

        boolean knownPlayerHost = false;
        for (String domain : EMBED_PLAYER_DOMAINS) {
            if (host.equals(domain) || host.endsWith("." + domain)) {
                knownPlayerHost = true;
                break;
            }
        }
        if (!knownPlayerHost) return false;

        String accept = "";
        for (java.util.Map.Entry<String, String> header : request.getRequestHeaders().entrySet()) {
            if ("accept".equalsIgnoreCase(header.getKey())) {
                accept = header.getValue() == null ? "" : header.getValue().toLowerCase(Locale.ROOT);
                break;
            }
        }
        return accept.contains("text/html");
    }

    private static void reportEmbeddedDocumentFailure(WebView view, Uri url, String reason) {
        if (view == null) return;
        String host = url == null || url.getHost() == null
            ? "unknown"
            : url.getHost().replaceAll("[^A-Za-z0-9.\\-]", "");
        String safeReason = reason == null ? "embed-load-error" : reason.replaceAll("[^A-Za-z0-9_-]", "");
        String script = "window.dispatchEvent(new CustomEvent('7xanime:blocked-player-action',{detail:{reason:'"
            + safeReason + "',host:'" + host + "'}}));";
        view.post(() -> view.evaluateJavascript(script, null));
    }

    @Override
    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        super.onReceivedError(view, request, error);
        if (error == null || !isEmbeddedPlayerDocument(request)) return;

        int code = error.getErrorCode();
        // Chromium's net::ERR_BLOCKED_BY_RESPONSE error code is -27, often emitted
        // when an embed host's response policy blocks display in a nested frame.
        String reason = code == -27 ? "embed-blocked-by-response" : "embed-load-error";
        Log.d(TAG, "Embedded player document failed (" + reason + ", code " + code + ")");
        reportEmbeddedDocumentFailure(view, request.getUrl(), reason);
    }

    @Override
    public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
        super.onReceivedHttpError(view, request, response);
        if (response == null || !isEmbeddedPlayerDocument(request)) return;

        int statusCode = response.getStatusCode();
        if (statusCode < 400) return;
        Log.d(TAG, "Embedded player document returned HTTP " + statusCode);
        reportEmbeddedDocumentFailure(view, request.getUrl(), "embed-http-error");
    }

    private static boolean isExternalTopLevel(Uri url) {
        // Only the app's own local origin can become the main document. Remote
        // player origins are allowed as subframes, never as top-level pages.
        return url == null || !isAppUrl(url);
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri url = request.getUrl();
        if (isBlockedAdRequest(url)) {
            Log.d(TAG, "Blocked navigation to known advertising host: " + url.getHost());
            return true;
        }
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
        if (isBlockedAdRequest(url)) {
            Log.d(TAG, "Blocked navigation to known advertising host: " + url.getHost());
            return true;
        }
        if (isExternalTopLevel(url)) {
            Log.d(TAG, "Blocked external top-level navigation: " + url.getScheme() + "://" + url.getHost());
            reportBlockedNavigation(view, url);
            return true;
        }
        return super.shouldOverrideUrlLoading(view, rawUrl);
    }
}
