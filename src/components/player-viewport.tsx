"use client";

import { PointerEvent, ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
  mode: "pending" | "drag";
};
type RectSnapshot = { left: number; top: number; width: number; height: number };
type SavedWatchLayout = {
  rect: RectSnapshot;
  viewportWidth: number;
  viewportHeight: number;
};
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
  origin: RectSnapshot;
  miniTarget: RectSnapshot | null;
  inlineTarget: RectSnapshot | null;
  fullscreenTarget: RectSnapshot | null;
  previewing: boolean;
  axis: "undecided" | "vertical" | "horizontal";
  direction: "collapse" | "expand" | null;
  lastSampleAt: number;
  lastDeltaY: number;
  velocityY: number;
};

const SWIPE_THRESHOLD = 72;
const SWIPE_MAX_X_DRIFT = 120;
const SWIPE_TOUCH_SLOP = 8;
const SWIPE_FLING_DISTANCE = 34;
const SWIPE_FLING_VELOCITY = 680;
const SWIPE_ANIMATION_DISTANCE = 240;

const shouldCommitVerticalSwipe = (distance: number, velocityTowardGesture: number) =>
  distance >= SWIPE_THRESHOLD ||
  (distance >= SWIPE_FLING_DISTANCE && velocityTowardGesture >= SWIPE_FLING_VELOCITY);

export function PlayerViewport({
  children,
  className = "",
  title = "video",
}: PlayerViewportProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname() || "/";
  const isWatchRoute = pathname === "/anime/watch" || pathname.startsWith("/anime/watch/");
  const isMiniPlayer = !isWatchRoute;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [miniControlsVisible, setMiniControlsVisible] = useState(false);
  const miniControlsTimerRef = useRef<number | null>(null);
  const miniOffsetRef = useRef({ x: 0, y: 0 });
  const nativeSwipeRef = useRef<NativeSwipeSession | null>(null);
  const pointerSwipeRef = useRef<NativeSwipeSession | null>(null);
  const swipePreviewActiveRef = useRef(false);
  const ancillaryStylesRef = useRef(new Map<HTMLElement, { opacity: string; pointerEvents: string; transition: string; translate: string; willChange: string }>());
  const routeContentStyleRef = useRef<{ element: HTMLElement; opacity: string; pointerEvents: string; transition: string; translate: string; willChange: string } | null>(null);
  const [isMiniDragging, setIsMiniDragging] = useState(false);
  const miniDragRef = useRef<MiniDragGesture | null>(null);
  const suppressMiniClickRef = useRef(false);
  const watchLayoutRef = useRef<SavedWatchLayout | null>(null);
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

  // Move the surrounding watch-page content with the video as it minimises, while fading it out in sync.
  const applySwipeContentProgress = useCallback((rawProgress: number, direction: "collapse" | "expand" | "restore") => {
    const progress = Math.min(1, Math.max(0, rawProgress));
    // Leaving fullscreen reveals the watch-page content as the video returns
    // to inline layout. Minimise/expand transitions fade that content away.
    const opacity = String(direction === "restore" ? progress : 1 - progress);
    const blockInteractions = direction === "restore" ? progress < 0.96 : progress > 0.04;
    const viewport = rootRef.current;
    const playerHost = viewport?.closest<HTMLElement>("[data-persistent-watch-player]") ?? null;

    if (viewport && playerHost && !(direction === "expand" && isMiniPlayer)) {
      let branch: HTMLElement = viewport;
      while (branch.parentElement && branch.parentElement !== playerHost) {
        const parent = branch.parentElement;
        Array.from(parent.children).forEach((child) => {
          const element = child as HTMLElement;
          if (element === branch || element.contains(viewport)) return;
          if (!ancillaryStylesRef.current.has(element)) {
            ancillaryStylesRef.current.set(element, {
              opacity: element.style.opacity,
              pointerEvents: element.style.pointerEvents,
              transition: element.style.transition,
              translate: element.style.translate,
              willChange: element.style.willChange,
            });
          }
          element.style.transition = "none";
          element.style.opacity = opacity;
          const original = ancillaryStylesRef.current.get(element);
          const travelDistance = Math.min(window.innerHeight * 0.42, 420);
          element.style.translate = direction === "collapse"
            ? `0 ${Math.round(travelDistance * progress)}px`
            : original?.translate ?? "";
          element.style.willChange = direction === "collapse" && progress > 0
            ? "translate, opacity"
            : original?.willChange ?? "";
          element.style.pointerEvents = blockInteractions ? "none" : original?.pointerEvents ?? "";
        });
        branch = parent;
      }
    }

    const routeContent = document.querySelector<HTMLElement>("[data-persistent-route-content]");
    if (direction === "expand" && isMiniPlayer) {
      if (routeContent) {
        if (!routeContentStyleRef.current || routeContentStyleRef.current.element !== routeContent) {
          routeContentStyleRef.current = {
            element: routeContent,
            opacity: routeContent.style.opacity,
            pointerEvents: routeContent.style.pointerEvents,
            transition: routeContent.style.transition,
            translate: routeContent.style.translate,
            willChange: routeContent.style.willChange,
          };
        }
        routeContent.style.transition = "none";
        routeContent.style.opacity = opacity;
        routeContent.style.pointerEvents = blockInteractions ? "none" : routeContentStyleRef.current.pointerEvents;
      }
      // Fade app chrome (navigation/footer) away too, not just the route's
      // scrolling contents, while the mini-player grows to take over the screen.
      const surface = document.querySelector<HTMLElement>(".persistent-watch-experience");
      const surfaceParent = surface?.parentElement;
      if (surface && surfaceParent) {
        Array.from(surfaceParent.children).forEach((child) => {
          const element = child as HTMLElement;
          if (element === surface || (viewport && element.contains(viewport))) return;
          if (!ancillaryStylesRef.current.has(element)) {
            ancillaryStylesRef.current.set(element, {
              opacity: element.style.opacity,
              pointerEvents: element.style.pointerEvents,
              transition: element.style.transition,
              translate: element.style.translate,
              willChange: element.style.willChange,
            });
          }
          element.style.transition = "none";
          element.style.opacity = opacity;
          element.style.pointerEvents = blockInteractions ? "none" : ancillaryStylesRef.current.get(element)?.pointerEvents ?? "";
        });
      }
    }

    document.documentElement.style.setProperty("--player-swipe-progress", String(progress));
    document.documentElement.dataset.playerSwipeDirection = direction;
  }, [isMiniPlayer]);

  const clearSwipeContentProgress = useCallback((animate = false) => {
    const restore = (element: HTMLElement, original: { opacity: string; pointerEvents: string; transition: string }) => {
      if (animate) {
        element.style.transition = "opacity 150ms ease-out";
        element.style.opacity = original.opacity;
        element.style.pointerEvents = original.pointerEvents;
        element.style.translate = original.translate;
        element.style.willChange = original.willChange;
        window.setTimeout(() => {
          element.style.transition = original.transition;
        }, 170);
      } else {
        element.style.opacity = original.opacity;
        element.style.pointerEvents = original.pointerEvents;
        element.style.transition = original.transition;
        element.style.translate = original.translate;
        element.style.willChange = original.willChange;
      }
    };
    ancillaryStylesRef.current.forEach((original, element) => restore(element, original));
    ancillaryStylesRef.current.clear();
    if (routeContentStyleRef.current) {
      restore(routeContentStyleRef.current.element, routeContentStyleRef.current);
      routeContentStyleRef.current = null;
    }
    delete document.documentElement.dataset.playerSwipeDirection;
    document.documentElement.style.removeProperty("--player-swipe-progress");
  }, []);

  const applyPlayerPreview = useCallback((origin: RectSnapshot, target: RectSnapshot, rawProgress: number) => {
    const node = rootRef.current;
    if (!node || origin.width <= 0 || origin.height <= 0) return;
    const progress = Math.min(1, Math.max(0, rawProgress));
    const left = origin.left + (target.left - origin.left) * progress;
    const top = origin.top + (target.top - origin.top) * progress;
    const width = origin.width + (target.width - origin.width) * progress;
    const height = origin.height + (target.height - origin.height) * progress;
    const scaleX = width / origin.width;
    const scaleY = height / origin.height;
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    const targetIsFullscreen = target.width >= viewportWidth * 0.92 && target.height >= viewportHeight * 0.92;
    const originRadius = target.width < origin.width * 0.75 ? 16 : 14;
    const targetRadius = targetIsFullscreen ? 0 : 14;
    const borderRadius = originRadius + (targetRadius - originRadius) * progress;
    if (progress <= 0) {
      // Returning to the gesture origin is an exact reset, not another
      // animation; release the compositor hint immediately.
      node.style.transform = "";
      node.style.transformOrigin = "";
      node.style.borderRadius = "";
      node.style.transition = "";
      node.style.willChange = "";
    } else {
      node.style.transition = "none";
      node.style.transformOrigin = "top left";
      node.style.willChange = "transform";
      node.style.transform = `translate3d(${left - origin.left}px, ${top - origin.top}px, 0) scale(${scaleX}, ${scaleY})`;
      node.style.borderRadius = `${borderRadius}px`;
    }
    lastRectRef.current = { left, top, width, height };
    swipePreviewActiveRef.current = progress > 0;
  }, []);

  const settlePreviewToOrigin = useCallback((node: HTMLDivElement) => {
    const currentTransform = node.style.transform;
    swipePreviewActiveRef.current = false;
    const clear = () => {
      if (swipePreviewActiveRef.current) return;
      node.style.transform = "";
      node.style.transformOrigin = "";
      node.style.borderRadius = "";
      node.style.transition = "";
      node.style.willChange = "";
      clearSwipeContentProgress(true);
    };
    if (!currentTransform) {
      clear();
      return;
    }
    const animation = node.animate(
      [
        { transform: currentTransform, borderRadius: node.style.borderRadius || "14px" },
        { transform: "translate3d(0, 0, 0) scale(1, 1)", borderRadius: "14px" },
      ],
      { duration: 210, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
    void animation.finished.then(clear).catch(clear);
  }, [clearSwipeContentProgress]);

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

    // The mini-player swipe requests fullscreen and route expansion in one
    // gesture. If React commits the fullscreen state one render before the
    // watch route, keep the finger-following transform alive until both states
    // agree, avoiding a snap back to mini size between the two commits.
    const waitingForExpandedWatchRoute =
      previous.isMiniPlayer && isMiniPlayer && isFullscreen && swipePreviewActiveRef.current;
    previousLayoutRef.current = { isMiniPlayer, isFullscreen };
    if (waitingForExpandedWatchRoute || !changed) return;

    const node = rootRef.current;
    if (!node) return;
    const from = lastRectRef.current;
    const interactiveSwipeTransition = swipePreviewActiveRef.current &&
      (previous.isMiniPlayer !== isMiniPlayer || previous.isFullscreen !== isFullscreen);
    if (interactiveSwipeTransition) {
      // The live gesture follows the finger with an inline transform. Clear it
      // before measuring the destination; FLIP continues from the last visible
      // gesture frame into the fixed mini-player slot without jumping.
      node.style.transform = "";
      node.style.transformOrigin = "";
      node.style.borderRadius = "";
      node.style.transition = "";
      node.style.willChange = "";
      swipePreviewActiveRef.current = false;
      clearSwipeContentProgress(false);
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
      duration: 280,
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
  }, [isMiniPlayer, isFullscreen, clearSwipeContentProgress]);


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

  const requestEmbeddedPictureInPictureDisabled = useCallback(() => {
    const frame = rootRef.current?.querySelector("iframe");
    const target = frame?.contentWindow;
    if (!target) return;
    // There is no cross-provider standard for hiding the PiP button, but send
    // the common opt-out messages as a best effort. The iframe's Permissions
    // Policy also denies PiP, even when a provider ignores these messages.
    const commands = [
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
      mode: "pending",
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
    if (!drag.moved && Math.hypot(deltaX, deltaY) < SWIPE_TOUCH_SLOP) return;
    if (!drag.moved) setIsMiniDragging(true);
    drag.moved = true;

    if (drag.mode === "pending") {
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      if (absX > 18 || absY > 18) {
        drag.mode = "drag";
      } else {
        // Any swipe direction moves the mini-player; tapping it restores the page.
        return;
      }
    }

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
    const cancelled = event.type === "pointercancel";
    if (cancelled) {
      setIsMiniDragging(false);
      return;
    }

    if (!drag.moved || drag.mode === "pending") {
      // Some Android WebViews suppress click after a prevented pointer-down.
      // Commit the tap on pointer-up and suppress any duplicate synthetic click.
      setIsMiniDragging(false);
      suppressMiniClickRef.current = true;
      dispatchPlayerAction("expand-mini-player");
      window.setTimeout(() => { suppressMiniClickRef.current = false; }, 350);
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
  }, [dispatchPlayerAction, revealMiniControls, updateMiniOffset]);

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
    const root = rootRef.current;
    if (!root) return;

    let activeFrame: HTMLIFrameElement | null = null;
    const handleFrameLoad = () => {
      requestEmbeddedPictureInPictureDisabled();
      if (isMiniPlayer) requestEmbeddedControlsHidden();
    };
    const attachFrame = () => {
      const nextFrame = root.querySelector("iframe");
      if (nextFrame === activeFrame) return;
      activeFrame?.removeEventListener("load", handleFrameLoad);
      activeFrame = nextFrame;
      if (activeFrame) {
        activeFrame.addEventListener("load", handleFrameLoad);
        requestEmbeddedPictureInPictureDisabled();
        if (isMiniPlayer) requestEmbeddedControlsHidden();
      }
    };

    const observer = new MutationObserver(attachFrame);
    observer.observe(root, { childList: true, subtree: true });
    attachFrame();
    return () => {
      observer.disconnect();
      activeFrame?.removeEventListener("load", handleFrameLoad);
    };
  }, [isMiniPlayer, requestEmbeddedControlsHidden, requestEmbeddedPictureInPictureDisabled]);

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
        video.setAttribute("controlslist", "noremoteplayback");
      });
    };
    disablePictureInPicture();
    const observer = new MutationObserver(disablePictureInPicture);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const createSwipeSession = useCallback((startX: number, startY: number, sampleTime = performance.now()): NativeSwipeSession => {
    const node = rootRef.current;
    const rect = node?.getBoundingClientRect();
    const origin: RectSnapshot = rect
      ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
      : { left: 0, top: 0, width: 1, height: 1 };
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    let miniTarget: RectSnapshot | null = null;
    // Only the inline watch-page player can minimise; fullscreen exits to inline first.
    if (!isMiniPlayer && !isFullscreen) {
      const probe = document.createElement("div");
      probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom);";
      document.body.appendChild(probe);
      const safeBottom = Number.parseFloat(getComputedStyle(probe).paddingBottom) || 0;
      probe.remove();
      const targetWidth = Math.min(Math.max(190, viewportWidth * 0.58), Math.min(360, viewportWidth - 24));
      const targetHeight = targetWidth * 9 / 16;
      miniTarget = {
        left: viewportWidth - targetWidth - 12,
        top: viewportHeight - 88 - safeBottom - targetHeight,
        width: targetWidth,
        height: targetHeight,
      };
    }

    let inlineTarget: RectSnapshot | null = null;
    if (isFullscreen) {
      const saved = watchLayoutRef.current;
      if (saved && saved.viewportWidth > 0 && saved.rect.width > 0 && saved.rect.height > 0) {
        const savedWasLandscape = saved.viewportWidth > saved.viewportHeight;
        const currentIsLandscape = viewportWidth > viewportHeight;
        if (savedWasLandscape !== currentIsLandscape) {
          // During orientation restoration preview a centered 16:9 inline frame.
          const targetWidth = Math.min(viewportWidth, viewportHeight * 16 / 9);
          const targetHeight = targetWidth * 9 / 16;
          inlineTarget = {
            left: (viewportWidth - targetWidth) / 2,
            top: 0,
            width: targetWidth,
            height: targetHeight,
          };
        } else {
          const scale = viewportWidth / saved.viewportWidth;
          const width = Math.min(viewportWidth, saved.rect.width * scale);
          const height = Math.min(viewportHeight, saved.rect.height * scale);
          inlineTarget = {
            left: Math.min(Math.max(0, saved.rect.left * scale), Math.max(0, viewportWidth - width)),
            top: Math.min(Math.max(0, saved.rect.top * scale), Math.max(0, viewportHeight - height)),
            width,
            height,
          };
        }
      } else {
        const width = Math.min(viewportWidth, viewportHeight * 16 / 9);
        inlineTarget = {
          left: (viewportWidth - width) / 2,
          top: 0,
          width,
          height: width * 9 / 16,
        };
      }
    }

    const fullscreenTarget: RectSnapshot | null = isFullscreen ? null : {
      left: 0, top: 0, width: viewportWidth, height: viewportHeight,
    };
    return {
      isMiniPlayer, isFullscreen, startX, startY, origin,
      miniTarget, inlineTarget, fullscreenTarget, previewing: false,
      axis: "undecided", direction: null,
      lastSampleAt: sampleTime, lastDeltaY: 0, velocityY: 0,
    };
  }, [isFullscreen, isMiniPlayer]);

  const updateSwipePreview = useCallback((
    session: NativeSwipeSession,
    deltaX: number,
    deltaY: number,
    sampleTime = performance.now(),
  ) => {
    if (session.isMiniPlayer) return;

    const sampleDeltaY = deltaY - session.lastDeltaY;
    const sampleElapsed = sampleTime - session.lastSampleAt;
    if (sampleElapsed > 0 && Math.abs(sampleDeltaY) >= 0.5) {
      session.velocityY = Math.max(-4500, Math.min(4500, (sampleDeltaY / sampleElapsed) * 1000));
    }
    session.lastSampleAt = sampleTime;
    session.lastDeltaY = deltaY;

    if (session.axis === "undecided" && Math.hypot(deltaX, deltaY) >= SWIPE_TOUCH_SLOP) {
      if (Math.abs(deltaY) >= Math.abs(deltaX) * 1.15) {
        session.axis = "vertical";
        session.direction = deltaY >= 0 ? "collapse" : "expand";
      } else if (Math.abs(deltaX) >= Math.abs(deltaY) * 1.15) {
        session.axis = "horizontal";
      }
    }

    // Lock to the first intentional axis/direction; small reversals or diagonal
    // noise cannot turn one continuous swipe into two separate player actions.
    if (session.axis !== "vertical" || !session.direction) return;

    if (session.direction === "collapse") {
      const target = session.isFullscreen ? session.inlineTarget : session.miniTarget;
      if (!target) return;
      const progress = Math.min(1, Math.max(0, deltaY / SWIPE_ANIMATION_DISTANCE));
      applyPlayerPreview(session.origin, target, progress);
      applySwipeContentProgress(progress, session.isFullscreen ? "restore" : "collapse");
      session.previewing = progress > 0;
      return;
    }

    if (session.direction === "expand" && session.fullscreenTarget) {
      const progress = Math.min(1, Math.max(0, -deltaY / SWIPE_ANIMATION_DISTANCE));
      applyPlayerPreview(session.origin, session.fullscreenTarget, progress);
      applySwipeContentProgress(progress, "expand");
      session.previewing = progress > 0;
    }
  }, [applyPlayerPreview, applySwipeContentProgress]);

  const commitSwipeGesture = useCallback((session: NativeSwipeSession, deltaX: number, deltaY: number) => {
    const directionAtRelease = deltaY >= 0 ? "collapse" : "expand";
    const velocityTowardGesture = Math.sign(deltaY) * session.velocityY;
    const canCommit = session.axis === "vertical" &&
      session.direction === directionAtRelease &&
      Math.abs(deltaX) <= SWIPE_MAX_X_DRIFT &&
      shouldCommitVerticalSwipe(Math.abs(deltaY), velocityTowardGesture) &&
      !session.isMiniPlayer;

    if (!canCommit) {
      const node = rootRef.current;
      if (node && session.previewing) settlePreviewToOrigin(node);
      else clearSwipeContentProgress(true);
      return;
    }

    // Fullscreen down -> inline watch page. A second, distinct down gesture
    // from that inline state is what minimises the video for browsing.
    if (session.isFullscreen && session.direction === "collapse" && deltaY > 0 && session.inlineTarget) {
      const progress = Math.min(1, Math.max(0, deltaY / SWIPE_ANIMATION_DISTANCE));
      applyPlayerPreview(session.origin, session.inlineTarget, progress);
      applySwipeContentProgress(progress, "restore");
      swipePreviewActiveRef.current = true;
      setIsFullscreen(false);
      void exitNativePlayerFullscreen();
      return;
    }

    if (!session.isFullscreen && session.direction === "collapse" && deltaY > 0 && session.miniTarget) {
      const progress = Math.min(1, Math.max(0, deltaY / SWIPE_ANIMATION_DISTANCE));
      applyPlayerPreview(session.origin, session.miniTarget, progress);
      applySwipeContentProgress(progress, "collapse");
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
      watchLayoutRef.current = { rect: session.origin, viewportWidth, viewportHeight };
      swipePreviewActiveRef.current = true;
      dispatchPlayerAction("minimize-player");
      return;
    }

    if (!session.isFullscreen && session.direction === "expand" && deltaY < 0 && session.fullscreenTarget) {
      const progress = Math.min(1, Math.max(0, -deltaY / SWIPE_ANIMATION_DISTANCE));
      applyPlayerPreview(session.origin, session.fullscreenTarget, progress);
      applySwipeContentProgress(progress, "expand");
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
      watchLayoutRef.current = { rect: session.origin, viewportWidth, viewportHeight };
      swipePreviewActiveRef.current = true;
      void enterFullscreen();
      return;
    }

    const node = rootRef.current;
    if (node && session.previewing) settlePreviewToOrigin(node);
    else clearSwipeContentProgress(true);
  }, [
    applyPlayerPreview, applySwipeContentProgress, clearSwipeContentProgress,
    dispatchPlayerAction, enterFullscreen, settlePreviewToOrigin,
  ]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const handleNativeSwipeProgress = (event: Event) => {
      const detail = (event as CustomEvent<NativeSwipeProgress>).detail;
      if (!detail || !["start", "move", "end", "cancel"].includes(detail.phase)) return;
      const node = rootRef.current;
      if (!node) return;

      if (detail.phase === "start") {
        const hitTarget = document.elementFromPoint(detail.startX, detail.startY);
        if (!hitTarget || !node.contains(hitTarget)) {
          nativeSwipeRef.current = null;
          return;
        }
        nativeSwipeRef.current = createSwipeSession(detail.startX, detail.startY, detail.elapsed);
        return;
      }

      const session = nativeSwipeRef.current;
      if (!session) return;
      const deltaX = detail.currentX - session.startX;
      const deltaY = detail.currentY - session.startY;

      if (detail.phase === "move") {
        updateSwipePreview(session, deltaX, deltaY, detail.elapsed);
        return;
      }

      nativeSwipeRef.current = null;
      if (detail.phase === "end") {
        updateSwipePreview(session, deltaX, deltaY, detail.elapsed);
        commitSwipeGesture(session, deltaX, deltaY);
      } else if (session.previewing) {
        settlePreviewToOrigin(node);
      } else {
        clearSwipeContentProgress(true);
      }
    };
    window.addEventListener("7xanime:native-player-swipe-progress", handleNativeSwipeProgress);
    return () => window.removeEventListener("7xanime:native-player-swipe-progress", handleNativeSwipeProgress);
  }, [
    clearSwipeContentProgress, commitSwipeGesture, createSwipeSession,
    settlePreviewToOrigin, updateSwipePreview,
  ]);

  const startGesture = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse") return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, textarea, select, [role='button'], .art-controls, .art-control")) {
      pointerSwipeRef.current = null;
      return;
    }
    pointerSwipeRef.current = createSwipeSession(event.clientX, event.clientY, event.timeStamp);
  }, [createSwipeSession]);

  const moveGesture = useCallback((event: PointerEvent<HTMLElement>) => {
    const session = pointerSwipeRef.current;
    if (!session || event.pointerType === "mouse") return;
    updateSwipePreview(session, event.clientX - session.startX, event.clientY - session.startY, event.timeStamp);
  }, [updateSwipePreview]);

  const finishGesture = useCallback((event: PointerEvent<HTMLElement>) => {
    const session = pointerSwipeRef.current;
    pointerSwipeRef.current = null;
    if (!session || event.pointerType === "mouse") return;
    const deltaX = event.clientX - session.startX;
    const deltaY = event.clientY - session.startY;
    updateSwipePreview(session, deltaX, deltaY, event.timeStamp);
    commitSwipeGesture(session, deltaX, deltaY);
  }, [commitSwipeGesture, updateSwipePreview]);

  const cancelGesture = useCallback(() => {
    const session = pointerSwipeRef.current;
    pointerSwipeRef.current = null;
    const node = rootRef.current;
    if (session?.previewing && node) settlePreviewToOrigin(node);
    else clearSwipeContentProgress(true);
  }, [clearSwipeContentProgress, settlePreviewToOrigin]);

  const onRailPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (isMiniPlayer) return;
    pointerSwipeRef.current = createSwipeSession(event.clientX, event.clientY, event.timeStamp);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is not implemented by every Android WebView version.
    }
  };

  const onRailPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const session = pointerSwipeRef.current;
    if (session) updateSwipePreview(
      session,
      event.clientX - session.startX,
      event.clientY - session.startY,
      event.timeStamp,
    );
  };

  const onRailPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const session = pointerSwipeRef.current;
    pointerSwipeRef.current = null;
    if (session) {
      const deltaX = event.clientX - session.startX;
      const deltaY = event.clientY - session.startY;
      updateSwipePreview(session, deltaX, deltaY, event.timeStamp);
      commitSwipeGesture(session, deltaX, deltaY);
    }
  };

  const onRailPointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const session = pointerSwipeRef.current;
    pointerSwipeRef.current = null;
    if (session?.previewing && rootRef.current) settlePreviewToOrigin(rootRef.current);
    else clearSwipeContentProgress(true);
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
    ? "fixed inset-0 z-[10000] !m-0 !h-[100dvh] !min-h-0 !w-screen !max-h-none !max-w-none !aspect-auto !rounded-none !border-0 !shadow-none bg-black touch-pan-x"
    : "relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl shadow-black/40 touch-pan-x";

  return (
    <div
      ref={rootRef}
      className={`${viewportClasses} ${className}`}
      onPointerDown={startGesture}
      onPointerMove={moveGesture}
      onPointerUp={finishGesture}
      onPointerCancel={cancelGesture}
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
        className={`absolute inset-y-0 right-0 z-[10001] w-4 touch-none bg-transparent ${isMiniPlayer ? "hidden" : ""}`}
        onPointerDown={onRailPointerDown}
        onPointerMove={onRailPointerMove}
        onPointerUp={onRailPointerUp}
        onPointerCancel={onRailPointerCancel}
      />
    </div>
  );
}

export default PlayerViewport;
