import { registerPlugin } from "@capacitor/core";

interface PlayerFullscreenNative {
  enter(): Promise<void>;
  exit(): Promise<void>;
  enterPictureInPicture(): Promise<void>;
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


function setPictureInPictureUiMode(active: boolean): void {
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("sevenx-pip-mode", active);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("7xanime:pip-mode", { detail: { active } }));
  }
}

/** Enter Android Activity PiP, which also supports cross-origin iframe players. */
export async function enterNativePictureInPicture(): Promise<boolean> {
  // Set this before Android backgrounds the Activity so the app-state listener
  // doesn't unmount the iframe in the transition to PiP.
  setPictureInPictureUiMode(true);
  try {
    await NativePlayerFullscreen.enterPictureInPicture();
    return true;
  } catch {
    setPictureInPictureUiMode(false);
    return false;
  }
}
