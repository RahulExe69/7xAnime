"use client";

import { useEffect, useRef } from "react";
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

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;
    let disposed = false;
    let listener: { remove: () => Promise<void> } | undefined;

    const navigate = (target: string) => {
      pendingRoute.current = normalizeRoute(target);
      routerRef.current.replace(target);
    };

    void App.addListener("backButton", () => {
      const overlayBack = new Event("7xanime:back", { cancelable: true });
      window.dispatchEvent(overlayBack);
      if (overlayBack.defaultPrevented) return;
      const rememberedRoute = routeStack.current.pop();
      if (rememberedRoute) {
        navigate(rememberedRoute);
        lastHomeBackAt.current = 0;
        return;
      }
      const current = new URL(currentRoute.current, "https://7xanime.local");
      const currentPath = normalizePath(current.pathname);
      if (currentPath === WATCH) {
        const animeId = current.searchParams.get("anime");
        navigate(animeId ? `${DETAILS}?id=${encodeURIComponent(animeId)}` : HOME);
        lastHomeBackAt.current = 0;
        return;
      }
      if (currentPath !== HOME) {
        navigate(HOME);
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
  }, []);

  return null;
}