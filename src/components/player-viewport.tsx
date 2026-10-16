"use client";

import React, { PointerEvent, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Maximize2, Minimize2, PictureInPicture } from "lucide-react";
import { enterNativePictureInPicture, enterNativePlayerFullscreen, exitNativePlayerFullscreen } from "@/lib/native-player-fullscreen";

type PlayerViewportProps = {
  children: ReactNode;
  className?: string;
  title?: string;
};

type GestureStart = { x: number; y: number; at: number };

const SWIPE_THRESHOLD = 72;
const SWIPE_MAX_X_DRIFT = 120;

export function PlayerViewport({
  children,
  className = "",
  title = "video",
}: PlayerViewportProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const gestureStartRef = useRef<GestureStart | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isFullscreenRef = useRef(false);
  isFullscreenRef.current = isFullscreen;

  const enterFullscreen = useCallback(async () => {
    if (isFullscreen) return;
    setIsFullscreen(true);
    await enterNativePlayerFullscreen();
  }, [isFullscreen]);

  const exitFullscreen = useCallback(async () => {
    if (!isFullscreen) return;
    setIsFullscreen(false);
    await exitNativePlayerFullscreen();
  }, [isFullscreen]);

  const toggleFullscreen = useCallback(() => {
    if (isFullscreen) void exitFullscreen();
    else void enterFullscreen();
  }, [enterFullscreen, exitFullscreen, isFullscreen]);

  const enterPictureInPicture = useCallback(() => {
    void enterNativePictureInPicture();
  }, []);

  const startGesture = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse") return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, textarea, select, [role='button'], .art-controls, .art-control")) {
      gestureStartRef.current = null;
      return;
    }
    gestureStartRef.current = { x: event.clientX, y: event.clientY, at: Date.now() };
  }, []);

  const finishGesture = useCallback((event: PointerEvent<HTMLElement>) => {
    const start = gestureStartRef.current;
    gestureStartRef.current = null;
    if (!start || event.pointerType === "mouse") return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) > SWIPE_MAX_X_DRIFT || Math.abs(deltaY) < SWIPE_THRESHOLD) return;

    // Swipe up enters landscape fullscreen; swipe down exits. Touch starts
    // inside a cross-origin iframe cannot bubble to this wrapper, so the
    // narrow gesture rail below handles the same gestures for embedded servers.
    if (deltaY < 0 && !isFullscreen) void enterFullscreen();
    if (deltaY > 0 && isFullscreen) void exitFullscreen();
  }, [enterFullscreen, exitFullscreen, isFullscreen]);

  const onRailPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    gestureStartRef.current = { x: event.clientX, y: event.clientY, at: Date.now() };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is not implemented by every Android WebView version.
    }
  };

  const onRailPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const start = gestureStartRef.current;
    gestureStartRef.current = null;
    if (!start) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) > SWIPE_MAX_X_DRIFT || Math.abs(deltaY) < SWIPE_THRESHOLD) return;
    if (deltaY < 0 && !isFullscreen) void enterFullscreen();
    if (deltaY > 0 && isFullscreen) void exitFullscreen();
  };

  useEffect(() => {
    if (!isFullscreen) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Backspace") {
        event.preventDefault();
        void exitFullscreen();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    let disposed = false;
    let removeBackListener: (() => void) | null = null;
    void App.addListener("backButton", () => {
      void exitFullscreen();
    }).then((listener) => {
      if (disposed) {
        void listener.remove();
      } else {
        removeBackListener = () => { void listener.remove(); };
      }
    }).catch(() => {
      // Browser preview has no native back-button event.
    });

    return () => {
      disposed = true;
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      removeBackListener?.();
    };
  }, [exitFullscreen, isFullscreen]);

  useEffect(() => {
    return () => {
      if (isFullscreenRef.current) void exitNativePlayerFullscreen();
    };
  }, []);

  const viewportClasses = isFullscreen
    ? "fixed inset-0 z-[10000] !m-0 !h-[100dvh] !min-h-0 !w-screen !max-h-none !max-w-none !aspect-auto !rounded-none !border-0 !shadow-none bg-black"
    : "relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl shadow-black/40";

  return (
    <div
      ref={rootRef}
      className={`${viewportClasses} ${className}`}
      onPointerDown={startGesture}
      onPointerUp={finishGesture}
      onPointerCancel={() => { gestureStartRef.current = null; }}
      data-player-fullscreen={isFullscreen ? "true" : "false"}
      data-player-viewport="true"
      aria-label={title}
    >
      <div className="absolute inset-0 h-full w-full">
        {children}
      </div>

      {Capacitor.isNativePlatform() && (
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            enterPictureInPicture();
          }}
          title="Picture-in-picture"
          aria-label="Picture-in-picture"
          className="absolute right-14 top-2 z-[10002] flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-black/65 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
        >
          <PictureInPicture size={18} />
        </button>
      )}

      <button
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleFullscreen();
        }}
        title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        className="absolute right-2 top-2 z-[10002] flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-black/65 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
      >
        {isFullscreen ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
      </button>

      {/* Cross-origin iframe gestures do not bubble to React. A slim edge rail
          preserves normal player controls while still making vertical swipes work. */}
      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-0 z-[10001] w-3 touch-none bg-transparent"
        onPointerDown={onRailPointerDown}
        onPointerUp={onRailPointerUp}
        onPointerCancel={() => { gestureStartRef.current = null; }}
      />
    </div>
  );
}

export default PlayerViewport;
