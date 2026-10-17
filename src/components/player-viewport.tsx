"use client";

import React, { PointerEvent, ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { usePathname } from "next/navigation";
import { Maximize2, Minimize2, PictureInPicture, X } from "lucide-react";
import { enterNativePictureInPicture, enterNativePlayerFullscreen, exitNativePlayerFullscreen } from "@/lib/native-player-fullscreen";

type PlayerViewportProps = {
  children: ReactNode;
  className?: string;
  title?: string;
};

type GestureStart = { x: number; y: number; at: number };
type MiniDragGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  startOffsetX: number;
  startOffsetY: number;
  originLeft: number;
  originTop: number;
  originWidth: number;
  originHeight: number;
  moved: boolean;
};
type RectSnapshot = { left: number; top: number; width: number; height: number };

const SWIPE_THRESHOLD = 72;
const SWIPE_MAX_X_DRIFT = 120;

export function PlayerViewport({
  children,
  className = "",
  title = "video",
}: PlayerViewportProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const gestureStartRef = useRef<GestureStart | null>(null);
  const pathname = usePathname() || "/";
  const isWatchRoute = pathname === "/anime/watch" || pathname.startsWith("/anime/watch/");
  const isMiniPlayer = !isWatchRoute;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [miniControlsVisible, setMiniControlsVisible] = useState(false);
  const miniControlsTimerRef = useRef<number | null>(null);
  const [miniOffset, setMiniOffset] = useState({ x: 0, y: 0 });
  const miniOffsetRef = useRef({ x: 0, y: 0 });
  const [isMiniDragging, setIsMiniDragging] = useState(false);
  const miniDragRef = useRef<MiniDragGesture | null>(null);
  const suppressMiniClickRef = useRef(false);
  const lastRectRef = useRef<RectSnapshot | null>(null);
  const layoutAnimationRef = useRef<Animation | null>(null);
  const previousLayoutRef = useRef({ isMiniPlayer, isFullscreen });
  const isFullscreenRef = useRef(false);
  isFullscreenRef.current = isFullscreen;

  const updateMiniOffset = useCallback((next: { x: number; y: number }) => {
    const normalized = {
      x: Number.isFinite(next.x) ? next.x : 0,
      y: Number.isFinite(next.y) ? next.y : 0,
    };
    miniOffsetRef.current = normalized;
    setMiniOffset(normalized);
  }, []);

  // Keep the most recent on-screen rectangle. The FLIP animation uses it as
  // the starting geometry when route state turns the persistent player into
  // a mini-player (or when a mini-player expands back to the page/fullscreen).
  useEffect(() => {
    let frame = 0;
    const capture = () => {
      const node = rootRef.current;
      if (node && layoutAnimationRef.current?.playState !== "running") {
        const rect = node.getBoundingClientRect();
        lastRectRef.current = {
          left: rect.left, top: rect.top, width: rect.width, height: rect.height,
        };
      }
      frame = window.requestAnimationFrame(capture);
    };
    frame = window.requestAnimationFrame(capture);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useLayoutEffect(() => {
    const previous = previousLayoutRef.current;
    const changed = previous.isMiniPlayer !== isMiniPlayer ||
      previous.isFullscreen !== isFullscreen;
    previousLayoutRef.current = { isMiniPlayer, isFullscreen };
    if (!changed) return;

    const node = rootRef.current;
    if (!node) return;
    const from = lastRectRef.current;
    const rect = node.getBoundingClientRect();
    const to: RectSnapshot = {
      left: rect.left, top: rect.top, width: rect.width, height: rect.height,
    };
    const reducedMotion = document.documentElement.dataset.reducedMotion === "true" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion || !from || rect.width < 1 || rect.height < 1) {
      lastRectRef.current = to;
      return;
    }

    const deltaX = from.left - to.left;
    const deltaY = from.top - to.top;
    const scaleX = from.width / to.width;
    const scaleY = from.height / to.height;
    if (
      Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1 &&
      Math.abs(scaleX - 1) < 0.02 && Math.abs(scaleY - 1) < 0.02
    ) {
      lastRectRef.current = to;
      return;
    }

    layoutAnimationRef.current?.cancel();
    const animation = node.animate([
      {
        transform: `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${scaleX}, ${scaleY})`,
        borderRadius: previous.isMiniPlayer ? "14px" : "16px",
      },
      {
        transform: "translate3d(0, 0, 0) scale(1, 1)",
        borderRadius: isMiniPlayer ? "14px" : "16px",
      },
    ], {
      duration: 360,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    });
    layoutAnimationRef.current = animation;
    void animation.finished.then(() => {
      if (layoutAnimationRef.current !== animation) return;
      layoutAnimationRef.current = null;
      const finalRect = node.getBoundingClientRect();
      lastRectRef.current = {
        left: finalRect.left, top: finalRect.top,
        width: finalRect.width, height: finalRect.height,
      };
    }).catch(() => {
      if (layoutAnimationRef.current === animation) layoutAnimationRef.current = null;
    });
    return () => {
      // Do not cancel here: a navigation can immediately trigger another
      // layout effect, which explicitly cancels the previous FLIP animation.
    };
  }, [isMiniPlayer, isFullscreen]);

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

  const dispatchPlayerAction = useCallback((action: "expand-mini-player" | "minimize-player" | "close-mini-player") => {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(`7xanime:${action}`));
  }, []);

  const requestEmbeddedControlsHidden = useCallback(() => {
    const frame = rootRef.current?.querySelector("iframe");
    const target = frame?.contentWindow;
    if (!target) return;
    // Cross-origin providers expose different control APIs. Send harmless,
    // common "disable/hide controls" messages where supported; the touch shield
    // remains the reliable fallback for providers that ignore these requests.
    const commands = [
      { event: "controls", enabled: false, visible: false, value: false },
      { type: "controls", enabled: false, visible: false, value: false },
      { action: "hide-controls" },
      { method: "setControls", value: false },
      { event: "command", func: "setControls", args: [false] },
      { controls: false },
    ];
    for (const command of commands) {
      try { target.postMessage(command, "*"); } catch { /* provider ignored */ }
    }
  }, []);

  const requestEmbeddedControlsVisible = useCallback(() => {
    const frame = rootRef.current?.querySelector("iframe");
    const target = frame?.contentWindow;
    if (!target) return;
    const commands = [
      { event: "controls", enabled: true, visible: true, value: true },
      { type: "controls", enabled: true, visible: true, value: true },
      { action: "show-controls" },
      { method: "setControls", value: true },
      { event: "command", func: "setControls", args: [true] },
      { controls: true },
    ];
    for (const command of commands) {
      try { target.postMessage(command, "*"); } catch { /* provider ignored */ }
    }
  }, []);

  const revealMiniControls = useCallback(() => {
    if (!isMiniPlayer) return;
    requestEmbeddedControlsHidden();
    if (miniControlsTimerRef.current !== null) {
      window.clearTimeout(miniControlsTimerRef.current);
    }
    setMiniControlsVisible(true);
    miniControlsTimerRef.current = window.setTimeout(() => {
      setMiniControlsVisible(false);
      miniControlsTimerRef.current = null;
    }, 3500);
  }, [isMiniPlayer, requestEmbeddedControlsHidden]);

  const startMiniDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!isMiniPlayer) return;
    event.preventDefault();
    event.stopPropagation();
    const node = rootRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const offset = miniOffsetRef.current;
    suppressMiniClickRef.current = false;
    miniDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: offset.x,
      startOffsetY: offset.y,
      originLeft: rect.left,
      originTop: rect.top,
      originWidth: rect.width,
      originHeight: rect.height,
      moved: false,
    };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch {
      // Pointer capture may be unavailable in older Android WebViews.
    }
  }, [isMiniPlayer]);

  const moveMiniPlayer = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = miniDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 6) return;
    if (!drag.moved) setIsMiniDragging(true);
    drag.moved = true;

    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    const left = Math.min(Math.max(drag.originLeft + deltaX, 8), Math.max(8, viewportWidth - drag.originWidth - 8));
    const top = Math.min(Math.max(drag.originTop + deltaY, 8), Math.max(8, viewportHeight - drag.originHeight - 8));
    updateMiniOffset({
      x: drag.startOffsetX + left - drag.originLeft,
      y: drag.startOffsetY + top - drag.originTop,
    });
  }, [updateMiniOffset]);

  const finishMiniDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = miniDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    miniDragRef.current = null;
    if (!drag.moved) {
      setIsMiniDragging(false);
      return;
    }

    suppressMiniClickRef.current = true;
    setIsMiniDragging(false);
    const node = rootRef.current;
    if (node) {
      const rect = node.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
      const snappedLeft = rect.left + rect.width / 2 < viewportWidth / 2
        ? 12
        : Math.max(12, viewportWidth - rect.width - 12);
      const snappedTop = Math.min(Math.max(rect.top, 8), Math.max(8, viewportHeight - rect.height - 8));
      const offset = miniOffsetRef.current;
      updateMiniOffset({
        x: offset.x + snappedLeft - rect.left,
        y: offset.y + snappedTop - rect.top,
      });
    }
    revealMiniControls();
    window.setTimeout(() => { suppressMiniClickRef.current = false; }, 350);
  }, [revealMiniControls, updateMiniOffset]);

  useEffect(() => {
    if (!isMiniPlayer) {
      requestEmbeddedControlsVisible();
      setMiniControlsVisible(false);
      if (miniControlsTimerRef.current !== null) {
        window.clearTimeout(miniControlsTimerRef.current);
        miniControlsTimerRef.current = null;
      }
    }
    return () => {
      if (miniControlsTimerRef.current !== null) {
        window.clearTimeout(miniControlsTimerRef.current);
        miniControlsTimerRef.current = null;
      }
    };
  }, [isMiniPlayer, requestEmbeddedControlsVisible]);

  useEffect(() => {
    if (!isMiniPlayer) return;
    const root = rootRef.current;
    if (!root) return;

    let activeFrame: HTMLIFrameElement | null = null;
    const handleFrameLoad = () => requestEmbeddedControlsHidden();
    const attachFrame = () => {
      const nextFrame = root.querySelector("iframe");
      if (nextFrame === activeFrame) return;
      activeFrame?.removeEventListener("load", handleFrameLoad);
      activeFrame = nextFrame;
      if (activeFrame) {
        activeFrame.addEventListener("load", handleFrameLoad);
        requestEmbeddedControlsHidden();
      }
    };

    const observer = new MutationObserver(attachFrame);
    observer.observe(root, { childList: true, subtree: true });
    attachFrame();
    return () => {
      observer.disconnect();
      activeFrame?.removeEventListener("load", handleFrameLoad);
    };
  }, [isMiniPlayer, requestEmbeddedControlsHidden]);

  const handleVerticalSwipe = useCallback((deltaY: number) => {
    if (deltaY < 0) {
      if (isMiniPlayer) dispatchPlayerAction("expand-mini-player");
      else if (!isFullscreen) void enterFullscreen();
      return;
    }
    if (isFullscreen) void exitFullscreen();
    else if (isMiniPlayer) dispatchPlayerAction("close-mini-player");
    else dispatchPlayerAction("minimize-player");
  }, [dispatchPlayerAction, enterFullscreen, exitFullscreen, isFullscreen, isMiniPlayer]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const handleNativeIframeSwipe = (event: Event) => {
      const detail = (event as CustomEvent<{ deltaY?: number }>).detail;
      if (typeof detail?.deltaY === "number" && Math.abs(detail.deltaY) >= SWIPE_THRESHOLD) {
        handleVerticalSwipe(detail.deltaY);
      }
    };
    window.addEventListener("7xanime:native-player-swipe", handleNativeIframeSwipe);
    return () => window.removeEventListener("7xanime:native-player-swipe", handleNativeIframeSwipe);
  }, [handleVerticalSwipe]);

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

    // In portrait, swipe up expands. Down exits fullscreen, then a second
    // down collapses the same mounted player into the mini-player.
    handleVerticalSwipe(deltaY);
  }, [handleVerticalSwipe]);

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
    handleVerticalSwipe(deltaY);
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
      data-player-mini={isMiniPlayer ? "true" : "false"}
      data-player-viewport="true"
      aria-label={title}
      data-mini-dragging={isMiniDragging ? "true" : "false"}
      style={{ "--mini-player-offset": isMiniPlayer ? `${miniOffset.x}px ${miniOffset.y}px` : "0px 0px" } as React.CSSProperties}
    >
      <div className="absolute inset-0 h-full w-full">
        {children}
      </div>

      {isMiniPlayer && (
        <div
          aria-label="Mini-player interaction shield"
          data-mini-player-interaction-shield="true"
          className={`absolute inset-0 z-[10001] touch-none select-none bg-transparent ${isMiniDragging ? "cursor-grabbing" : "cursor-grab"}`}
          onPointerDown={startMiniDrag}
          onPointerMove={moveMiniPlayer}
          onPointerUp={finishMiniDrag}
          onPointerCancel={finishMiniDrag}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (suppressMiniClickRef.current) {
              suppressMiniClickRef.current = false;
              return;
            }
            revealMiniControls();
          }}
        />
      )}

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
          className={`absolute right-14 top-2 z-[10002] flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-black/65 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 ${isMiniPlayer ? "hidden" : ""}`}
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
        className={`absolute right-2 top-2 z-[10002] flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-black/65 text-white shadow-lg backdrop-blur-sm transition hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 ${isMiniPlayer ? "hidden" : ""}`}
      >
        {isFullscreen ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
      </button>

      {isMiniPlayer && (
        <div className={`pointer-events-none absolute inset-x-0 top-0 z-[10003] flex items-start justify-between gap-2 rounded-t-2xl bg-gradient-to-b from-black/90 via-black/35 to-transparent p-2 pb-5 transition-opacity duration-200 ${miniControlsVisible ? "opacity-100" : "opacity-0"}`}>
          <span className="min-w-0 flex-1 truncate pt-1 text-xs font-semibold text-white drop-shadow">{title.replace(/ video player$/i, "")}</span>
          <div className={`flex shrink-0 items-center gap-1 ${miniControlsVisible ? "pointer-events-auto" : "pointer-events-none"}`}>
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                revealMiniControls();
                dispatchPlayerAction("expand-mini-player");
              }}
              aria-label="Return to full player"
              title="Return to full player"
              className={`grid h-8 w-8 place-items-center rounded-lg border border-white/15 bg-black/65 text-white shadow-md backdrop-blur-sm transition-opacity ${miniControlsVisible ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
            >
              <Maximize2 size={16} />
            </button>
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                revealMiniControls();
                dispatchPlayerAction("close-mini-player");
              }}
              aria-label="Close mini-player"
              title="Close mini-player"
              className={`grid h-8 w-8 place-items-center rounded-lg border border-white/15 bg-black/65 text-white shadow-md backdrop-blur-sm transition-opacity ${miniControlsVisible ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Cross-origin iframe gestures do not bubble to React. The edge rail
          observes swipes without covering the provider's playback controls. */}
      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-0 z-[10001] w-4 touch-none bg-transparent"
        onPointerDown={onRailPointerDown}
        onPointerUp={onRailPointerUp}
        onPointerCancel={() => { gestureStartRef.current = null; }}
      />
    </div>
  );
}

export default PlayerViewport;
