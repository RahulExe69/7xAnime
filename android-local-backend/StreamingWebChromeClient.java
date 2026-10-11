package com.sevenx.anime;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.MotionEvent;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.os.Message;
import android.net.Uri;
import android.widget.FrameLayout;
import android.widget.FrameLayout.LayoutParams;
import android.view.Gravity;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

/**
 * Capacitor WebChromeClient with video fullscreen support and anti-pop-up handling.
 * JavaScript alert/confirm/prompt dialogs are suppressed from every origin because
 * nested iframes can be misreported as the local app origin on some OEM WebViews.
 * 7xAnime does not use browser-native JavaScript dialogs for its own UI.
 */
public final class StreamingWebChromeClient extends BridgeWebChromeClient {
    private static final String TAG = "7xAnimeWebChrome";

    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private ViewGroup contentContainer;
    private FrameLayout fullscreenRoot;
    private WebView webView;
    private int previousOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
    private int previousSystemUiVisibility = 0;
    private boolean previousFullscreenFlag = false;
    private float swipeStartX = 0;
    private float swipeStartY = 0;

    private final Bridge bridgeRef;

    public StreamingWebChromeClient(Bridge bridge) {
        super(bridge);
        this.bridgeRef = bridge;
    }

    private static void reportBlockedPlayerAction(WebView view, String reason, String host) {
        if (view == null) return;
        String safeReason = reason == null ? "blocked" : reason.replaceAll("[^A-Za-z0-9_-]", "");
        String safeHost = host == null ? "" : host.replaceAll("[^A-Za-z0-9.\\-]", "");
        String script = "window.dispatchEvent(new CustomEvent('7xanime:blocked-player-action',{detail:{reason:'"
            + safeReason + "',host:'" + safeHost + "'}}));";
        view.post(() -> view.evaluateJavascript(script, null));
    }

    @Override
    public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
        // Never spawn a new WebView/window for pop-under ads or target=_blank.
        // Normal in-frame navigation continues through StreamingNavigationWebViewClient.
        Log.d(TAG, "Blocked third-party popup window");
        reportBlockedPlayerAction(view, "popup", safeHost(view == null ? "" : view.getUrl()));
        return false;
    }

    // WebView may report the top-level URL for a dialog opened by a nested frame
    // on some Chromium/OEM combinations. Never trust the callback URL to decide
    // whether a JavaScript dialog is safe: player frames can spoof native-looking
    // "Allow", "robot check", and notification prompts with alert/confirm/prompt.
    // 7xAnime does not use JS dialogs for its own UI, so suppress them everywhere.
    @Override
    public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
        Log.d(TAG, "Suppressed JavaScript alert from " + safeHost(url));
        if (result != null) result.cancel();
        reportBlockedPlayerAction(view, "javascript-alert", safeHost(url));
        return true;
    }

    @Override
    public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
        Log.d(TAG, "Suppressed JavaScript confirm from " + safeHost(url));
        if (result != null) result.cancel();
        reportBlockedPlayerAction(view, "javascript-confirm", safeHost(url));
        return true;
    }

    @Override
    public boolean onJsPrompt(WebView view, String url, String message, String defaultValue, JsPromptResult result) {
        Log.d(TAG, "Suppressed JavaScript prompt from " + safeHost(url));
        if (result != null) result.cancel();
        reportBlockedPlayerAction(view, "javascript-prompt", safeHost(url));
        return true;
    }

    @Override
    public boolean onJsBeforeUnload(WebView view, String url, String message, JsResult result) {
        // Do not let third-party pages trap Back/navigation behind a native confirm.
        // Confirm the unload so the viewer can always leave a deceptive player page.
        Log.d(TAG, "Suppressed JavaScript before-unload confirmation from " + safeHost(url));
        if (result != null) result.confirm();
        return true;
    }

    @Override
    public void onPermissionRequest(PermissionRequest request) {
        String origin = request == null || request.getOrigin() == null
            ? ""
            : request.getOrigin().toString();
        if (!isAppOrigin(origin)) {
            Log.d(TAG, "Denied web permission request from " + safeHost(origin));
            if (request != null) request.deny();
            reportBlockedPlayerAction(getBridgeWebView(), "permission-request", safeHost(origin));
            return;
        }
        super.onPermissionRequest(request);
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
        fullscreenRoot = new FrameLayout(activity);
        fullscreenRoot.setBackgroundColor(Color.BLACK);
        fullscreenRoot.addView(
            customView,
            new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );
        installSwipeToClose(fullscreenRoot);
        if (contentContainer != null) {
            contentContainer.addView(
                fullscreenRoot,
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

    private int dp(Activity activity, int value) {
        return Math.round(value * activity.getResources().getDisplayMetrics().density);
    }

    private void installSwipeToClose(FrameLayout root) {
        Activity activity = getBridgeActivity();
        if (activity == null) return;

        // The fullscreen custom view may consume touch events itself. Add a
        // narrow edge rail so a downward swipe can always leave native fullscreen
        // without putting a transparent overlay over the player's normal controls.
        View gestureRail = new View(activity);
        gestureRail.setBackgroundColor(Color.TRANSPARENT);
        gestureRail.setClickable(true);
        gestureRail.setOnTouchListener((touchedView, event) -> {
            if (event.getAction() == MotionEvent.ACTION_DOWN) {
                swipeStartX = event.getRawX();
                swipeStartY = event.getRawY();
                return true;
            }
            if (event.getAction() == MotionEvent.ACTION_UP) {
                float dx = event.getRawX() - swipeStartX;
                float dy = event.getRawY() - swipeStartY;
                if (dy > dp(activity, 64) && Math.abs(dx) < dp(activity, 120)) {
                    onHideCustomView();
                }
                return true;
            }
            return true;
        });
        FrameLayout.LayoutParams railParams = new FrameLayout.LayoutParams(
            dp(activity, 24),
            ViewGroup.LayoutParams.MATCH_PARENT,
            Gravity.RIGHT | Gravity.TOP
        );
        root.addView(gestureRail, railParams);
    }

    /** Let MainActivity consume Back before leaving the episode while fullscreen. */
    public boolean handleBackPressed() {
        if (customView == null) return false;
        onHideCustomView();
        return true;
    }

    @Override
    public void onHideCustomView() {
        Activity activity = getBridgeActivity();
        if (activity == null || customView == null) return;

        if (contentContainer != null && fullscreenRoot != null) {
            contentContainer.removeView(fullscreenRoot);
        } else if (contentContainer != null) {
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
        fullscreenRoot = null;
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
