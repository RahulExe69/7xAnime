import { registerPlugin } from "@capacitor/core";

interface PlayerFullscreenNative {
  enter(): Promise<void>;
  exit(): Promise<void>;
}

// Implemented by PlayerFullscreenPlugin in Android. Browser builds have no
// native implementation, so the helpers below gracefully fall back to the
// Screen Orientation API where the browser permits it.
const NativePlayerFullscreen = registerPlugin<PlayerFullscreenNative>("PlayerFullscreen");

type ScreenOrientationWithLock = ScreenOrientation & {
  lock?: (orientation: "landscape" | "portrait") => Promise<void>;
  unlock?: () => void;
};

export async function enterNativePlayerFullscreen(): Promise<void> {
  try {
    await NativePlayerFullscreen.enter();
  } catch {
    // Expected in the ordinary browser build and on platforms without this plugin.
  }

  try {
    const orientation = typeof screen !== "undefined"
      ? screen.orientation as ScreenOrientationWithLock
      : undefined;
    await orientation?.lock?.("landscape");
  } catch {
    // Orientation locking requires browser/device support and may require fullscreen.
  }
}

export async function exitNativePlayerFullscreen(): Promise<void> {
  try {
    await NativePlayerFullscreen.exit();
  } catch {
    // Expected outside the native Android app.
  }

  try {
    const orientation = typeof screen !== "undefined"
      ? screen.orientation as ScreenOrientationWithLock
      : undefined;
    orientation?.unlock?.();
  } catch {
    // Ignore devices that do not implement Screen Orientation unlock.
  }
}
