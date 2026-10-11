package com.sevenx.anime;

import android.net.Uri;
import android.util.Log;
import android.webkit.ServiceWorkerClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

/**
 * Applies the same conservative known-ad host rules to Service Worker fetches.
 * This is installed only on API 24+ and leaves non-ad requests to WebView's
 * normal service-worker handling by returning null.
 */
public final class StreamingServiceWorkerClient extends ServiceWorkerClient {
    private static final String TAG = "7xAnimeServiceWorker";

    @Override
    public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
        Uri url = request == null ? null : request.getUrl();
        if (StreamingNavigationWebViewClient.isBlockedAdRequest(url)) {
            Log.d(TAG, "Blocked service-worker ad resource: " + (url == null ? "" : url.getHost()));
            return StreamingNavigationWebViewClient.blockedResponse();
        }
        return null;
    }
}
