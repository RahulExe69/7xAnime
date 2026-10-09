"use client";

import { useCallback, useEffect, useRef } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

const HOME = "/";
const WATCH = "/anime/watch";
const DETAILS = "/anime";

const normalizePath = (pathname: string) => {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed || HOME;
};

const normalizeRoute = (href: string) => {
  const url = new URL(href, "https://7xanime.local");
  return `${normalizePath(url.pathname)}${url.search}`;
};

const isMeaningfulRouteChange = (from: string, to: string) => {
  const previous = new URL(from, "https://7xanime.local");
  const next = new URL(to, "https://7xanime.local");
  const previousPath = normalizePath(previous.pathname);
  const nextPath = normalizePath(next.pathname);
  if (previousPath !== nextPath) return true;
  if (previousPath === DETAILS) {
    return previous.searchParams.get("id") !== next.searchParams.get("id");
  }
  if (previousPath === "/profile") {
    return previous.searchParams.get("username") !== next.searchParams.get("username");
  }
  if (previousPath === "/search") {
    return previous.search !== next.search;
  }
  return false;
};

/** Keep Android system Back inside the app before allowing an intentional exit. */
export default function NativeBackHandler() {
  const pathname = usePathname() || HOME;
  const searchParams = useSearchParams();
  const router = useRouter();
  const search = searchParams.toString();
  const route = `${pathname}${search ? `?${search}` : ""}`;
  const routeStack = useRef<string[]>([]);
  const currentRoute = useRef(route);
  const pendingRoute = useRef<string | null>(null);
  const routerRef = useRef(router);
  const lastHomeBackAt = useRef(0);

  useEffect(() => { routerRef.current = router; }, [router]);

  const navigateInApp = useCallback((target: string) => {
    pendingRoute.current = normalizeRoute(target);
    routerRef.current.replace(target);
  }, []);

  const navigateBackInApp = useCallback(() => {
    const current = new URL(currentRoute.current, "https://7xanime.local");
    const currentPath = normalizePath(current.pathname);
    let rememberedRoute = routeStack.current.pop();

    // Treat the detail screen as the one-time entry point to an anime. When
    // leaving playback, return to the page that opened it instead of reopening
    // the same detail screen a second time.
    if (currentPath === WATCH && rememberedRoute) {
      const remembered = new URL(rememberedRoute, "https://7xanime.local");
      if (normalizePath(remembered.pathname) === DETAILS) {
        rememberedRoute = routeStack.current.pop() || "/search";
      }
    }

    if (rememberedRoute) {
      navigateInApp(rememberedRoute);
      lastHomeBackAt.current = 0;
      return;
    }
    if (currentPath === WATCH) {
      navigateInApp("/search");
      lastHomeBackAt.current = 0;
      return;
    }
    if (currentPath !== HOME) {
      navigateInApp(HOME);
      lastHomeBackAt.current = 0;
      return;
    }
    const now = Date.now();
    if (now - lastHomeBackAt.current < 1800) {
      void App.exitApp();
      return;
    }
    lastHomeBackAt.current = now;
    toast("Press back again to exit 7xAnime", { duration: 1600 });
  }, [navigateInApp]);

  // The in-player back arrow and Android's system Back share one route-aware
  // handler, so neither sends the user to the anime details page by default.
  useEffect(() => {
    const handleRequestedBack = () => {
      const overlayBack = new Event("7xanime:back", { cancelable: true });
      window.dispatchEvent(overlayBack);
      if (overlayBack.defaultPrevented) return;
      navigateBackInApp();
    };
    window.addEventListener("7xanime:navigate-back", handleRequestedBack);
    return () => window.removeEventListener("7xanime:navigate-back", handleRequestedBack);
  }, [navigateBackInApp]);

  useEffect(() => {
    const next = normalizeRoute(route);
    const current = normalizeRoute(currentRoute.current);
    if (next === current) return;
    if (pendingRoute.current && normalizeRoute(pendingRoute.current) === next) {
      pendingRoute.current = null;
    } else if (isMeaningfulRouteChange(current, next)) {
      routeStack.current.push(current);
      if (routeStack.current.length > 30) routeStack.current.shift();
    }
    currentRoute.current = next;
  }, [route]);

  // On Android, the OS may reclaim the WebView while another app is open.
  // Remember only a live watch route when backgrounding; if the app is recreated
  // at "/", restore that exact episode rather than dumping the viewer at Home.
  const restoreAttempted = useRef(false);
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;
    const resumeKey = "7xanime:pending-watch-resume";

    const isWatchRoute = (value: string) => {
      const target = new URL(normalizeRoute(value), "https://7xanime.local");
      return normalizePath(target.pathname) === WATCH && !!target.searchParams.get("anime");
    };
    const persistWatchRoute = () => {
      const target = normalizeRoute(currentRoute.current);
      if (!isWatchRoute(target)) return;
      try {
        localStorage.setItem(resumeKey, JSON.stringify({ route: target, timestamp: Date.now() }));
      } catch { /* Storage may be unavailable in restricted WebView contexts. */ }
    };
    const clearPendingResume = () => {
      try { localStorage.removeItem(resumeKey); } catch { /* Best-effort cleanup. */ }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") persistWatchRoute();
      else if (isWatchRoute(currentRoute.current)) clearPendingResume();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", persistWatchRoute);
    let disposed = false;
    let listener: { remove: () => Promise<void> } | undefined;
    void App.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) persistWatchRoute();
      else if (isWatchRoute(currentRoute.current)) clearPendingResume();
    }).then((handle) => {
      if (disposed) void handle.remove();
      else listener = handle;
    }).catch((error) => {
      console.warn("Could not register watch-route resume handling:", error);
    });

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", persistWatchRoute);
      if (listener) void listener.remove();
    };
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android" || restoreAttempted.current) return;
    restoreAttempted.current = true;
    if (normalizePath(pathname) !== HOME) {
      try { localStorage.removeItem("7xanime:pending-watch-resume"); } catch {}
      return;
    }

    try {
      const raw = localStorage.getItem("7xanime:pending-watch-resume");
      if (!raw) return;
      const saved = JSON.parse(raw) as { route?: string; timestamp?: number };
      const age = Date.now() - Number(saved.timestamp || 0);
      const target = typeof saved.route === "string" ? normalizeRoute(saved.route) : "";
      const parsed = target ? new URL(target, "https://7xanime.local") : null;
      const validRoute = !!parsed &&
        normalizePath(parsed.pathname) === WATCH &&
        !!parsed.searchParams.get("anime") &&
        age >= 0 && age <= 30 * 60 * 1000;
      localStorage.removeItem("7xanime:pending-watch-resume");
      if (validRoute && target) {
        pendingRoute.current = target;
        routerRef.current.replace(target);
      }
    } catch {
      try { localStorage.removeItem("7xanime:pending-watch-resume"); } catch {}
    }
  }, [pathname, search]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;
    let disposed = false;
    let listener: { remove: () => Promise<void> } | undefined;

    void App.addListener("backButton", () => {
      const overlayBack = new Event("7xanime:back", { cancelable: true });
      window.dispatchEvent(overlayBack);
      if (overlayBack.defaultPrevented) return;
      navigateBackInApp();
    }).then((handle) => {
      if (disposed) void handle.remove();
      else listener = handle;
    }).catch((error) => {
      console.warn("Could not register Android back-button handling:", error);
    });

    return () => {
      disposed = true;
      if (listener) void listener.remove();
    };
  }, [navigateBackInApp]);

  return null;
}