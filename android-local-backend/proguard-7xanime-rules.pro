# Keep JavaScript-bridge methods exposed to WebView by name. These methods are
# discovered reflectively by Android and cannot be safely renamed by R8.
-keepclassmembers class com.sevenx.anime.UpdateBridge {
    @android.webkit.JavascriptInterface <methods>;
}

# Capacitor discovers plugin methods through annotations/reflection instead of
# direct Java call sites. Retain only our small app-owned plugin classes.
-keep class com.sevenx.anime.LocalAnimeBackendPlugin { *; }
-keep class com.sevenx.anime.PlayerFullscreenPlugin { *; }
