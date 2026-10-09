package com.sevenx.anime;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.os.Message;
import android.net.Uri;
import android.widget.FrameLayout;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

/**
 * Capacitor WebChromeClient with real video fullscreen support and conservative
 * anti-pop-up handling. Third-party JS alert/confirm/prompt dialogs are often
 * used by fake "allow/robot check" ads; they are cancelled rather than shown as
 * native system dialogs. Regular app-origin dialogs keep Capacitor behaviour.
 */
public final class StreamingWebChromeClient extends BridgeWebChromeClient {
    private static final String TAG = "7xAnimeWebChrome";

    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private ViewGroup contentContainer;
    private WebView webView;
    private int previousOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
    private int previousSystemUiVisibility = 0;
    private boolean previousFullscreenFlag = false;

    private final Bridge bridgeRef;

    public StreamingWebChromeClient(Bridge bridge) {
        super(bridge);
        this.bridgeRef = bridge;
    }

    private static boolean isAppOrigin(String rawUrl) {
        if (rawUrl == null || rawUrl.isEmpty()) return false;
        Uri uri = Uri.parse(rawUrl);
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
        return ("http".equals(scheme) || "https".equals(scheme))
            && ("localhost".equals(host) || "127.0.0.1".equals(host) || "::1".equals(host));
    }

    @Override
    public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
        // Never spawn a new WebView/window for pop-under ads or target=_blank.
        // Normal in-frame navigation continues through StreamingNavigationWebViewClient.
        Log.d(TAG, "Blocked third-party popup window");
        return false;
    }

    @Override
    public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
        if (!isAppOrigin(url)) {
            Log.d(TAG, "Cancelled third-party JavaScript alert from " + safeHost(url));
            result.cancel();
            return true;
        }
        return super.onJsAlert(view, url, message, result);
    }

    @Override
    public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
        if (!isAppOrigin(url)) {
            Log.d(TAG, "Cancelled third-party JavaScript confirm from " + safeHost(url));
            result.cancel();
            return true;
        }
        return super.onJsConfirm(view, url, message, result);
    }

    @Override
    public boolean onJsPrompt(WebView view, String url, String message, String defaultValue, JsPromptResult result) {
        if (!isAppOrigin(url)) {
            Log.d(TAG, "Cancelled third-party JavaScript prompt from " + safeHost(url));
            result.cancel();
            return true;
        }
        return super.onJsPrompt(view, url, message, defaultValue, result);
    }

    private static String safeHost(String rawUrl) {
        try {
            String host = Uri.parse(rawUrl).getHost();
            return host == null ? "unknown host" : host;
        } catch (Exception ignored) {
            return "unknown host";
        }
    }

    @Override
    public void onShowCustomView(View view, CustomViewCallback callback) {
        Activity activity = getBridgeActivity();
        if (activity == null || view == null) {
            if (callback != null) callback.onCustomViewHidden();
            return;
        }
        if (customView != null) {
            if (callback != null) callback.onCustomViewHidden();
            return;
        }

        Window window = activity.getWindow();
        View decor = window.getDecorView();
        previousOrientation = activity.getRequestedOrientation();
        previousSystemUiVisibility = decor.getSystemUiVisibility();
        previousFullscreenFlag = (window.getAttributes().flags & WindowManager.LayoutParams.FLAG_FULLSCREEN) != 0;

        customView = view;
        customViewCallback = callback;
        webView = getBridgeWebView();
        contentContainer = activity.findViewById(android.R.id.content);

        if (webView != null) webView.setVisibility(View.GONE);
        if (contentContainer != null) {
            contentContainer.addView(
                customView,
                new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
            );
        }

        activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        decor.setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        );
        Log.d(TAG, "Entered native video fullscreen");
    }

    @Override
    public void onHideCustomView() {
        Activity activity = getBridgeActivity();
        if (activity == null || customView == null) return;

        if (contentContainer != null) {
            contentContainer.removeView(customView);
        }
        if (webView != null) webView.setVisibility(View.VISIBLE);

        Window window = activity.getWindow();
        View decor = window.getDecorView();
        if (previousFullscreenFlag) {
            window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        }
        decor.setSystemUiVisibility(previousSystemUiVisibility);
        int orientationToRestore = previousOrientation == ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            ? ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
            : previousOrientation;
        activity.setRequestedOrientation(orientationToRestore);

        View oldCustomView = customView;
        WebChromeClient.CustomViewCallback callback = customViewCallback;
        customView = null;
        customViewCallback = null;
        contentContainer = null;
        webView = null;
        if (callback != null) callback.onCustomViewHidden();
        Log.d(TAG, "Exited native video fullscreen");
    }

    private Activity getBridgeActivity() {
        return getBridge() == null ? null : getBridge().getActivity();
    }

    private WebView getBridgeWebView() {
        return getBridge() == null ? null : getBridge().getWebView();
    }

    private Bridge getBridge() {
        // BridgeWebChromeClient intentionally keeps its reference private. The
        // constructor captures the same bridge here for fullscreen lifecycle use.
        return bridgeRef;
    }

}
