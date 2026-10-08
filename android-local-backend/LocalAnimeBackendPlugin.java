package com.sevenx.anime;

import android.util.Log;
import com.chaquo.python.PyObject;
import com.chaquo.python.Python;
import com.chaquo.python.android.AndroidPlatform;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "LocalAnimeBackend")
public final class LocalAnimeBackendPlugin extends Plugin {
    private static final String TAG = "7xAnimeLocalAPI";
    private static final String BASE_URL = "http://127.0.0.1:8000";
    private static final ExecutorService STARTER = Executors.newSingleThreadExecutor();
    private static volatile String apiToken;

    @PluginMethod
    public void start(PluginCall call) {
        STARTER.execute(() -> {
            try {
                String token = apiToken;
                if (token == null) {
                    synchronized (LocalAnimeBackendPlugin.class) {
                        token = apiToken;
                        if (token == null) {
                            if (!Python.isStarted()) {
                                Python.start(new AndroidPlatform(getContext()));
                            }
                            PyObject module = Python.getInstance().getModule("local_api");
                            module.callAttr("start_background");
                            token = module.callAttr("get_token").toString();
                            if (token == null || token.trim().isEmpty()) {
                                throw new IllegalStateException("Python backend did not return its local token");
                            }
                            waitUntilReady();
                            apiToken = token;
                        }
                    }
                }

                JSObject result = new JSObject();
                result.put("baseUrl", BASE_URL);
                result.put("token", token);
                call.resolve(result);
            } catch (Exception error) {
                Log.e(TAG, "Failed to start local Python API", error);
                call.reject("Could not start the on-device anime API: " + error.getMessage(), error);
            }
        });
    }

    private static void waitUntilReady() throws Exception {
        Exception lastError = null;
        for (int attempt = 0; attempt < 48; attempt++) {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(BASE_URL + "/api/health").openConnection();
                connection.setConnectTimeout(500);
                connection.setReadTimeout(500);
                connection.setRequestMethod("GET");
                if (connection.getResponseCode() == 200) {
                    try (InputStream input = connection.getInputStream()) {
                        byte[] buffer = new byte[256];
                        while (input.read(buffer) != -1) {
                            // Drain the short health response.
                        }
                    }
                    return;
                }
                lastError = new IllegalStateException("Local API health check returned " + connection.getResponseCode());
            } catch (Exception error) {
                lastError = error;
            } finally {
                if (connection != null) {
                    connection.disconnect();
                }
            }
            Thread.sleep(250);
        }
        throw new IllegalStateException(
            "Local API did not become ready within 12 seconds",
            lastError
        );
    }
}
