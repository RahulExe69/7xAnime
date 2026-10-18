"use client";

import { Suspense, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import VideoPlayerSection from "@/app/anime/watch/video-player-section";
import { ROUTES } from "@/constants/routes";

type PersistentWatchExperienceProps = {
  children: ReactNode;
};

type WatchLocationDetail = {
  href?: string;
};

export function PersistentWatchExperience({ children }: PersistentWatchExperienceProps) {
  const pathname = usePathname() || ROUTES.HOME;
  const router = useRouter();
  const searchParams = useSearchParams();
  const isWatchRoute = pathname === ROUTES.WATCH || pathname.startsWith(`${ROUTES.WATCH}/`);
  const watchLocationKey = isWatchRoute
    ? `${searchParams.get("anime") || ""}:${searchParams.get("episode") || ""}:${searchParams.get("ep") || ""}`
    : "";
  const [hasPlayerSession, setHasPlayerSession] = useState(isWatchRoute);
  const lastWatchHrefRef = useRef<string>(ROUTES.WATCH);
  const lastBrowsePathRef = useRef<string>(ROUTES.HOME);

  // Next.js can restore the previous browse-page scroll offset both when
  // entering the watch route and when changing episodes on the same pathname.
  // Include the watch query identity so each newly opened episode starts with
  // its player visible. The persistent player is hosted in the root layout.
  useLayoutEffect(() => {
    if (!isWatchRoute) return;

    const resetScrollPosition = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    resetScrollPosition();
    // A second pass wins over scroll restoration scheduled by route navigation.
    const frame = window.requestAnimationFrame(resetScrollPosition);
    return () => window.cancelAnimationFrame(frame);
  }, [isWatchRoute, watchLocationKey]);

  useEffect(() => {
    if (isWatchRoute) {
      setHasPlayerSession(true);
      lastWatchHrefRef.current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    } else {
      lastBrowsePathRef.current = pathname || ROUTES.HOME;
    }
  }, [isWatchRoute, pathname]);

  useEffect(() => {
    const rememberWatchLocation = (event: Event) => {
      const detail = (event as CustomEvent<WatchLocationDetail>).detail;
      if (typeof detail?.href === "string" && detail.href.startsWith(ROUTES.WATCH)) {
        lastWatchHrefRef.current = detail.href;
      }
    };
    const expandMiniPlayer = () => {
      router.push(lastWatchHrefRef.current || ROUTES.WATCH);
    };
    const minimizePlayer = () => {
      const destination = lastBrowsePathRef.current || ROUTES.HOME;
      router.push(destination === ROUTES.WATCH ? ROUTES.HOME : destination);
    };
    const closeMiniPlayer = () => setHasPlayerSession(false);

    window.addEventListener("7xanime:watch-location", rememberWatchLocation);
    window.addEventListener("7xanime:expand-mini-player", expandMiniPlayer);
    window.addEventListener("7xanime:minimize-player", minimizePlayer);
    window.addEventListener("7xanime:close-mini-player", closeMiniPlayer);
    return () => {
      window.removeEventListener("7xanime:watch-location", rememberWatchLocation);
      window.removeEventListener("7xanime:expand-mini-player", expandMiniPlayer);
      window.removeEventListener("7xanime:minimize-player", minimizePlayer);
      window.removeEventListener("7xanime:close-mini-player", closeMiniPlayer);
    };
  }, [router]);

  const shouldMountPlayer = isWatchRoute || hasPlayerSession;
  const playerMode = isWatchRoute ? "watch" : hasPlayerSession ? "mini" : "browse";

  return (
    <div className="persistent-watch-experience" data-player-mode={playerMode}>
      <div data-persistent-route-content="true">
        {!isWatchRoute ? children : null}
      </div>
      {shouldMountPlayer && (
        <div data-persistent-watch-player="true" data-player-mode={isWatchRoute ? "watch" : "mini"}>
          <Suspense fallback={null}>
            <VideoPlayerSection isWatchRoute={isWatchRoute} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
