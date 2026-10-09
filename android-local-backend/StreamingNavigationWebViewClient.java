package com.sevenx.anime;

import android.net.Uri;
import android.util.Log;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

/**
 * Keep top-level navigation inside the Capacitor app while allowing remote
 * video players to load inside iframes. Some player hosts refuse to run when
 * an iframe has the HTML sandbox attribute, so redirect control belongs here
 * rather than in the iframe sandbox.
 */
public final class StreamingNavigationWebViewClient extends BridgeWebViewClient {
    private static final String TAG = "7xAnimeNavigation";

    public StreamingNavigationWebViewClient(Bridge bridge) {
        super(bridge);
    }

    private static boolean isAppUrl(Uri url) {
        if (url == null) return false;
        String scheme = url.getScheme() == null ? "" : url.getScheme().toLowerCase();
        String host = url.getHost() == null ? "" : url.getHost().toLowerCase();
        if (!"http".equals(scheme) && !"https".equals(scheme)) return false;
        return "localhost".equals(host)
            || "127.0.0.1".equals(host)
            || "::1".equals(host);
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
            // Allow iframe navigation in the current WebView. Returning false
            // here also prevents Capacitor from launching an iframe URL in an
            // external ACTION_VIEW intent.
            return false;
        }
        if (isExternalTopLevel(url)) {
            Log.d(TAG, "Blocked external top-level navigation: " + url.getScheme() + "://" + url.getHost());
            return true;
        }
        return super.shouldOverrideUrlLoading(view, request);
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, String rawUrl) {
        Uri url = Uri.parse(rawUrl == null ? "" : rawUrl);
        if (isExternalTopLevel(url)) {
            Log.d(TAG, "Blocked external top-level navigation: " + url.getScheme() + "://" + url.getHost());
            return true;
        }
        return super.shouldOverrideUrlLoading(view, rawUrl);
    }
}
