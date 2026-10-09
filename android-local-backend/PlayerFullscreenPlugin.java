package com.sevenx.anime;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Native bridge for landscape, immersive player fullscreen in Capacitor. */
@CapacitorPlugin(name = "PlayerFullscreen")
public final class PlayerFullscreenPlugin extends Plugin {
    private boolean hasSavedWindowState = false;
    private int previousOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
    private int previousSystemUiVisibility = 0;
    private boolean previousFullscreenFlag = false;

    @PluginMethod
    public void enter(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Player fullscreen is unavailable");
            return;
        }
        activity.runOnUiThread(() -> {
            Window window = activity.getWindow();
            View decor = window.getDecorView();
            if (!hasSavedWindowState) {
                previousOrientation = activity.getRequestedOrientation();
                previousSystemUiVisibility = decor.getSystemUiVisibility();
                previousFullscreenFlag =
                    (window.getAttributes().flags & WindowManager.LayoutParams.FLAG_FULLSCREEN) != 0;
                hasSavedWindowState = true;
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
            call.resolve();
        });
    }

    @PluginMethod
    public void exit(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.resolve();
            return;
        }
        activity.runOnUiThread(() -> {
            Window window = activity.getWindow();
            View decor = window.getDecorView();
            if (hasSavedWindowState) {
                if (previousFullscreenFlag) {
                    window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
                } else {
                    window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
                }
                decor.setSystemUiVisibility(previousSystemUiVisibility);
                int orientationToRestore =
                    previousOrientation == ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                        ? ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
                        : previousOrientation;
                activity.setRequestedOrientation(orientationToRestore);
                hasSavedWindowState = false;
            } else {
                activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
                window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
                decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
            }
            call.resolve();
        });
    }
}
