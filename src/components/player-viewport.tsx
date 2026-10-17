"use client";

import React, { PointerEvent, ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { enterNativePlayerFullscreen, exitNativePlayerFullscreen } from "@/lib/native-player-fullscreen";

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
type NativeSwipeProgress = {
  phase: "start" | "move" | "end" | "cancel";
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  deltaX: number;
  deltaY: number;
  elapsed: number;
};
type NativeSwipeSession = {
  isMiniPlayer: boolean;
  isFullscreen: boolean;
  startX: number;
  startY: number;
  startedAt: number;
  origin: RectSnapshot;
  target: RectSnapshot | null;
  previewing: boolean;
};

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
  const miniOffsetRef = useRef({ x: 0, y: 0 });
  const nativeSwipeRef = useRef<NativeSwipeSession | null>(null);
  const swipePreviewActiveRef = useRef(false);
  const [isMiniDragging, setIsMiniDragging] = useState(false);
  const miniDragRef = useRef<MiniDragGesture | null>(null);
  const suppressMiniClickRef = useRef(false);
  const lastRectRef = useRef<RectSnapshot | null>(null);
  const layoutAnimationRef = useRef<Animation | null>(null);
  const previousLayoutRef = useRef({ isMiniPlayer, isFullscreen });
  const isFullscreenRef = useRef(false);
  isFullscreenRef.current = isFullscreen;

  // Embedded providers now own their visible fullscreen/PiP controls. These
  // native helpers remain for the app's existing swipe-to-fullscreen gestures.
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

  const updateMiniOffset = useCallback((next: { x: number; y: number }) => {
    const normalized = {
      x: Number.isFinite(next.x) ? next.x : 0,
      y: Number.isFinite(next.y) ? next.y : 0,
    };
    miniOffsetRef.current = normalized;
    rootRef.current?.style.setProperty("--mini-player-offset", `${normalized.x}px ${normalized.y}px`);
  }, []);

  // Capture layout only on meaningful browser events instead of forcing a
  // getBoundingClientRect() read every animation frame. The old perpetual RAF
  // loop caused needless main-thread work while the video was playing.
  useEffect(() => {
    let frame = 0;
    const capture = () => {
      frame = 0;
      const node = rootRef.current;
      if (!node || layoutAnimationRef.current?.playState === "running" || swipePreviewActiveRef.current) return;
      const rect = node.getBoundingClientRect();
      lastRectRef.current = {
        left: rect.left, top: rect.top, width: rect.width, height: rect.height,
      };
    };
    const scheduleCapture = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(capture);
    };
    scheduleCapture();
    window.addEventListener("resize", scheduleCapture, { passive: true });
    window.addEventListener("scroll", scheduleCapture, { passive: true, capture: true });
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", scheduleCapture, { passive: true });
    viewport?.addEventListener("scroll", scheduleCapture, { passive: true });
    const node = rootRef.current;
    const observer = node && typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(scheduleCapture)
      : null;
    if (node) observer?.observe(node);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleCapture);
      window.removeEventListener("scroll", scheduleCapture, true);
      viewport?.removeEventListener("resize", scheduleCapture);
      viewport?.removeEventListener("scroll", scheduleCapture);
      observer?.disconnect();
    };
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
    const interactiveSwipeTransition =
      swipePreviewActiveRef.current && !previous.isMiniPlayer && isMiniPlayer;
    if (interactiveSwipeTransition) {
      // The live gesture follows the finger with an inline transform. Clear it
      // before measuring the destination; FLIP continues from the last visible
      // gesture frame into the fixed mini-player slot without jumping.
      node.style.transform = "";
      node.style.transformOrigin = "";
      node.style.borderRadius = "";
      node.style.transition = "";
      swipePreviewActiveRef.current = false;
    }
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
      { event: "picture-in-picture", enabled: false },
      { type: "picture-in-picture", enabled: false },
      { action: "disable-picture-in-picture" },
      { method: "setPictureInPicture", value: false },
      { pictureInPicture: false },
      { pip: false },
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
    const normalized = {
      x: drag.startOffsetX + left - drag.originLeft,
      y: drag.startOffsetY + top - drag.originTop,
    };
    // Drive the compositor directly while dragging. React only updates the
    // final snapped position, not once per touch-move event.
    miniOffsetRef.current = normalized;
    rootRef.current?.style.setProperty("--mini-player-offset", `${normalized.x}px ${normalized.y}px`);
  }, []);

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

  // HTML5 videos rendered in our own document can be explicitly denied native
  // Picture-in-Picture. Cross-origin providers are constrained separately by
  // removing the PiP permission from their iframe allow policy below.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const disablePictureInPicture = () => {
      root.querySelectorAll("video").forEach((video) => {
        video.disablePictureInPicture = true;
        video.setAttribute("disablepictureinpicture", "");
        video.disableRemotePlayback = true;
        video.controlsList.add("noremoteplayback");
      });
    };
    disablePictureInPicture();
    const observer = new MutationObserver(disablePictureInPicture);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

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
    const settlePreview = (node: HTMLDivElement) => {
      const currentTransform = node.style.transform;
      swipePreviewActiveRef.current = false;
      if (!currentTransform) {
        node.style.willChange = "";
        return;
      }
      const animation = node.animate(
        [
          { transform: currentTransform },
          { transform: "translate3d(0, 0, 0) scale(1, 1)" },
        ],
        { duration: 150, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
      void animation.finished.finally(() => {
        if (!swipePreviewActiveRef.current) {
          node.style.transform = "";
          node.style.transformOrigin = "";
          node.style.borderRadius = "";
          node.style.transition = "";
          node.style.willChange = "";
        }
      }).catch(() => undefined);
    };
    const handleNativeSwipeProgress = (event: Event) => {
      const detail = (event as CustomEvent<NativeSwipeProgress>).detail;
      if (!detail || !["start", "move", "end", "cancel"].includes(detail.phase)) return;
      const node = rootRef.current;
      if (!node) return;

      if (detail.phase === "start") {
        const target = document.elementFromPoint(detail.startX, detail.startY);
        if (!target || !node.contains(target)) {
          nativeSwipeRef.current = null;
          return;
        }
        const rect = node.getBoundingClientRect();
        let target: RectSnapshot | null = null;
        if (!isMiniPlayer && !isFullscreen) {
          const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
          const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
          // Read the bottom safe-area inset once at gesture start, never inside
          // the move loop, so finger-following stays compositor-friendly.
          const safeAreaProbe = document.createElement("div");
          safeAreaProbe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom);";
          document.body.appendChild(safeAreaProbe);
          const safeBottom = Number.parseFloat(getComputedStyle(safeAreaProbe).paddingBottom) || 0;
          safeAreaProbe.remove();
          const targetWidth = Math.min(Math.max(190, viewportWidth * 0.58), Math.min(360, viewportWidth - 24));
          const targetHeight = targetWidth * 9 / 16;
          target = {
            left: viewportWidth - targetWidth - 12,
            top: viewportHeight - 88 - safeBottom - targetHeight,
            width: targetWidth,
            height: targetHeight,
          };
        }
        nativeSwipeRef.current = {
          isMiniPlayer,
          isFullscreen,
          startX: detail.startX,
          startY: detail.startY,
          startedAt: detail.elapsed,
          origin: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          target,
          previewing: false,
        };
        return;
      }

      const session = nativeSwipeRef.current;
      if (!session) return;
      const deltaX = detail.currentX - session.startX;
      const deltaY = detail.currentY - session.startY;
      const validVertical = Math.abs(deltaY) >= SWIPE_THRESHOLD && Math.abs(deltaX) <= SWIPE_MAX_X_DRIFT;

      if (detail.phase === "move") {
        // Only the downward, full-player gesture gets the live YouTube-style
        // shrink-to-corner preview. Native iframe touches now update the same
        // element the finger is moving over, rather than waiting for ACTION_UP.
        if (!session.isMiniPlayer && !session.isFullscreen && session.target && deltaY > 4 && Math.abs(deltaX) <= SWIPE_MAX_X_DRIFT) {
          const target = session.target;
          const progress = Math.min(1, Math.max(0, deltaY / 240));
          const left = session.origin.left + (target.left - session.origin.left) * progress;
          const top = session.origin.top + (target.top - session.origin.top) * progress;
          const scaleX = 1 + ((target.width / session.origin.width) - 1) * progress;
          const scaleY = 1 + ((target.height / session.origin.height) - 1) * progress;
          node.style.transition = "none";
          node.style.transformOrigin = "top left";
          node.style.willChange = "transform";
          node.style.transform = `translate3d(${left - session.origin.left}px, ${top - session.origin.top}px, 0) scale(${scaleX}, ${scaleY})`;
          node.style.borderRadius = `${16 + (14 - 16) * progress}px`;
          // Geometry is derivable from the gesture progress, avoiding a forced
          // synchronous layout read on every touch-move.
          lastRectRef.current = {
            left,
            top,
            width: session.origin.width + (target.width - session.origin.width) * progress,
            height: session.origin.height + (target.height - session.origin.height) * progress,
          };
          session.previewing = true;
          swipePreviewActiveRef.current = true;
        }
        return;
      }

      nativeSwipeRef.current = null;
      if (detail.phase === "end" && validVertical) {
        if (!session.isMiniPlayer && deltaY > 0 && !session.isFullscreen) {
          // Keep the final finger-following frame as the FLIP start rectangle.
          swipePreviewActiveRef.current = session.previewing;
          if (session.previewing) dispatchPlayerAction("minimize-player");
          else handleVerticalSwipe(deltaY);
        } else {
          handleVerticalSwipe(deltaY);
        }
      } else if (session.previewing) {
        settlePreview(node);
      }
    };
    window.addEventListener("7xanime:native-player-swipe-progress", handleNativeSwipeProgress);
    return () => window.removeEventListener("7xanime:native-player-swipe-progress", handleNativeSwipeProgress);
  }, [dispatchPlayerAction, handleVerticalSwipe, isMiniPlayer]);

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
            dispatchPlayerAction("expand-mini-player");
          }}
        />
      )}

      {isMiniPlayer && (
        <>
          <div className={`pointer-events-none absolute inset-x-0 top-0 z-[10003] flex items-start justify-between gap-2 rounded-t-2xl bg-gradient-to-b from-black/90 via-black/35 to-transparent p-2 pb-5 transition-opacity duration-200 ${miniControlsVisible ? "opacity-100" : "opacity-0"}`}>
            <span className="min-w-0 flex-1 truncate pt-1 text-xs font-semibold text-white drop-shadow">{title.replace(/ video player$/i, "")}</span>
          </div>
          <button
            type="button"
            data-mini-player-close="true"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              dispatchPlayerAction("close-mini-player");
            }}
            aria-label="Close mini-player"
            title="Close mini-player"
            className="absolute right-1 top-1 z-[10004] grid h-8 w-8 place-items-center rounded-full border-0 bg-transparent p-0 text-white shadow-none drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] transition-transform hover:scale-110 hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          >
            <X size={19} strokeWidth={2.5} />
          </button>
        </>
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
