"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useAnimeStore } from "@/store/anime-store";
import dynamic from "next/dynamic";

const VideoPlayer = dynamic(() => import("@/components/video-player"), {
  ssr: false,
});
import { useGetEpisodeData } from "@/query/get-episode-data";
import { ArrowLeft, Captions, Mic, AlertCircle, Tv } from "lucide-react";
import Link from "next/link";
import { ROUTES } from "@/constants/routes";
import { getServerLabel, getServerProviderTitle } from "@/lib/server-map";
import { Switch } from "@/components/ui/switch";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { useGetAllEpisodes } from "@/query/get-all-episodes";

import useBookMarks from "@/hooks/use-get-bookmark";
import { useGetSourceAvailable } from "@/query/get-source-available";
import { isLocalBackendEnabled } from "@/lib/api";
import { saveLocalWatchProgress } from "@/lib/local-watch-progress";

const VideoPlayerSection = () => {
  const searchParams = useSearchParams();
  const animeIdParam = searchParams.get("anime") || "";
  const epParam = searchParams.get("ep");
  const episodeIdParam = searchParams.get("episode") || "";
  const { selectedEpisode, setSelectedEpisode, anime } = useAnimeStore();

  const { data: isSourceAvailable } = useGetSourceAvailable();
  const { data: allEpisodesData } = useGetAllEpisodes(animeIdParam);

  // Match episode number from ?ep= parameter if present
  const targetEpByNumber = epParam && allEpisodesData?.episodes
    ? allEpisodesData.episodes.find((e) => e.number === Number(epParam))
    : null;

  // Explicit route parameters always win. With no requested episode, start
  // at the first resolved episode rather than trusting global Zustand state:
  // provider IDs can be reused (for example "1", "2"...) by API fallbacks for
  // different anime, so membership alone cannot prove a selection belongs here.
  const activeEpisodeId = epParam
    ? targetEpByNumber?.episodeId || ""
    : episodeIdParam || allEpisodesData?.episodes?.[0]?.episodeId || "";

  // Sync selectedEpisode in store with ?ep= parameter if provided
  useEffect(() => {
    if (targetEpByNumber?.episodeId && selectedEpisode !== targetEpByNumber.episodeId) {
      setSelectedEpisode(targetEpByNumber.episodeId);
    }
  }, [targetEpByNumber?.episodeId, selectedEpisode, setSelectedEpisode]);

  const isPrimaryDisabled = isSourceAvailable === false;

  const [useFallback, setUseFallback] = useState<boolean>(false);
  const [forcePrimary, setForcePrimary] = useState<boolean>(false);

  const {
    data: episodeData,
    isLoading: isLoadingData,
    refetch: retryEpisodeData,
  } = useGetEpisodeData(activeEpisodeId, (!isPrimaryDisabled || forcePrimary) && !useFallback);

  const [autoSkip, setAutoSkip] = useState<boolean>(true);
  const [preferredCategory, setPreferredCategory] = useState<"sub" | "dub">("sub");

  const { createOrUpdateBookMark, syncWatchProgress } = useBookMarks({
    animeID: animeIdParam,
    populate: false,
  });

  const fallbackBookmarkIdRef = React.useRef<string | null>(null);
  const fallbackWatchedRecordIdRef = React.useRef<string | null>(null);
  const lastSyncedTimeRef = React.useRef<number>(0);

  useEffect(() => {
    setUseFallback(false);
    setForcePrimary(false);
  }, [activeEpisodeId]);

  useEffect(() => {
    const storedSkip = localStorage.getItem("autoSkip");
    if (storedSkip !== null) setAutoSkip(storedSkip === "true");

    const storedCategory = localStorage.getItem("preferredCategory");
    if (storedCategory === "sub" || storedCategory === "dub") {
      setPreferredCategory(storedCategory);
    }
  }, []);

  function onHandleAutoSkipChange(value: boolean) {
    setAutoSkip(value);
    localStorage.setItem("autoSkip", JSON.stringify(value));
  }

  // Extract dynamic providers from EpisodeResponse
  const rawProviders = useMemo(
    () => allEpisodesData?.rawResponse?.providers || {},
    [allEpisodesData?.rawResponse?.providers],
  );
  const providerNames = useMemo(() => Object.keys(rawProviders), [rawProviders]);

  // Extract current episode number from activeEpisodeId
  const activeEpisodeNumberFromList = allEpisodesData?.episodes?.find(
    (episode) => episode.episodeId === activeEpisodeId,
  )?.number;
  const activeEpisodeSlug = activeEpisodeId.split("/").pop() || "";
  const activeEpisodeNumberFromSlug = Number(activeEpisodeSlug.match(/(\d+)$/)?.[1]) || 0;
  const currentEpNumber = activeEpisodeNumberFromList || activeEpisodeNumberFromSlug || 1;

  const updateEpisodeUrl = (episodeId: string) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("episode", episodeId);
    url.searchParams.delete("ep");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  };

  // Check sub/dub availability for this episode
  const hasSub = providerNames.some(
    (p) => (rawProviders[p]?.episodes?.sub?.length || 0) > 0,
  );
  const hasDub = providerNames.some(
    (p) => (rawProviders[p]?.episodes?.dub?.length || 0) > 0,
  );

  const handleCategoryChange = (cat: "sub" | "dub") => {
    setPreferredCategory(cat);
    localStorage.setItem("preferredCategory", cat);

    // Switch active episode to the first available server of that category for current episode
    if (providerNames.length > 0) {
      for (const pName of providerNames) {
        const pData = rawProviders[pName]?.episodes?.[cat] || [];
        const targetEp = pData.find((ep: any) => ep.number === currentEpNumber) || pData[0];
        if (targetEp?.id) {
          setSelectedEpisode(targetEp.id);
          updateEpisodeUrl(targetEp.id);
          break;
        }
      }
    }
  };

  // Synchronize activeEpisodeId category with preferredCategory ("sub" or "dub")
  useEffect(() => {
    if (!providerNames.length || !allEpisodesData?.rawResponse?.providers) return;

    const cleanParts = activeEpisodeId.replace(/^\//, "").split("/");
    const activeCat = cleanParts[3] === "dub" ? "dub" : "sub";

    // If active episode category does not match preferredCategory, switch to preferredCategory if available
    if (activeCat !== preferredCategory) {
      for (const pName of providerNames) {
        const pData = rawProviders[pName]?.episodes?.[preferredCategory] || [];
        const targetEp = pData.find((ep: any) => ep.number === currentEpNumber);
        if (targetEp?.id) {
          setSelectedEpisode(targetEp.id);
          updateEpisodeUrl(targetEp.id);
          break;
        }
      }
    }
  }, [
    currentEpNumber,
    preferredCategory,
    providerNames,
    rawProviders,
    activeEpisodeId,
    setSelectedEpisode,
    allEpisodesData,
  ]);

  const isFallbackActive =
    (!forcePrimary && isSourceAvailable === false) ||
    useFallback ||
    (!isLoadingData && (!episodeData || !episodeData.sources?.length));

  // Listen to postMessage events from Fallback Player iframe (megaplay.buzz / megacloud)
  useEffect(() => {
    fallbackWatchedRecordIdRef.current = null;
    lastSyncedTimeRef.current = 0;

    if (!isFallbackActive || !animeIdParam || !activeEpisodeId) return;

    let isMounted = true;

    const initBookmark = async () => {
      if (isLocalBackendEnabled()) return;
      const animeName = anime?.anime?.info?.name || "Anime";
      const poster = anime?.anime?.info?.poster || "";
      const bId = await createOrUpdateBookMark(
        animeIdParam,
        animeName,
        poster,
        "watching",
        false,
      );
      if (isMounted) {
        fallbackBookmarkIdRef.current = bId;
      }
    };

    initBookmark();

    const handleIframeMessage = async (event: MessageEvent) => {
      let data = event.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }

      if (!data || typeof data !== "object") return;

      // Extract currentTime and duration from time/watching-log events
      let currentTime: number | null = null;
      let duration: number | null = null;

      if (typeof data.currentTime === "number") {
        currentTime = data.currentTime;
      } else if (typeof data.time === "number") {
        currentTime = data.time;
      }

      if (typeof data.duration === "number") {
        duration = data.duration;
      }

      const isComplete = data.event === "complete";

      if (currentTime !== null && duration !== null && duration > 0) {
        const now = Math.floor(currentTime);
        // Throttle updates every 10 seconds or on complete
        if (isComplete || Math.abs(now - lastSyncedTimeRef.current) >= 10) {
          lastSyncedTimeRef.current = now;

          if (isLocalBackendEnabled()) {
            saveLocalWatchProgress({
              animeId: animeIdParam || anime?.anime?.info?.id || "0",
              episodeId: activeEpisodeId,
              episodeNumber: Number(currentEpNumber) || 1,
              animeTitle: anime?.anime?.info?.name || "Anime",
              poster: anime?.anime?.info?.poster || "",
              current: currentTime,
              duration: duration,
            });
          } else if (fallbackBookmarkIdRef.current) {
            const recordId = await syncWatchProgress(
              fallbackBookmarkIdRef.current,
              fallbackWatchedRecordIdRef.current,
              {
                episodeId: activeEpisodeId,
                episodeNumber: Number(currentEpNumber) || 1,
                current: currentTime,
                duration: duration,
              },
            );
            if (recordId && isMounted) {
              fallbackWatchedRecordIdRef.current = recordId;
            }
          }
        }
      }
    };

    window.addEventListener("message", handleIframeMessage);
    return () => {
      isMounted = false;
      window.removeEventListener("message", handleIframeMessage);
    };
  }, [
    useFallback,
    isLoadingData,
    episodeData,
    activeEpisodeId,
    animeIdParam,
    anime,
    currentEpNumber,
    createOrUpdateBookMark,
    syncWatchProgress,
  ]);

  const handleProviderSelect = (pName: string, category: "sub" | "dub") => {
    setPreferredCategory(category);
    localStorage.setItem("preferredCategory", category);

    const pData = rawProviders[pName]?.episodes?.[category] || [];
    const targetEp = pData.find((ep: any) => ep.number === currentEpNumber) || pData[0];
    if (targetEp?.id) {
      setSelectedEpisode(targetEp.id);
      updateEpisodeUrl(targetEp.id);
    }
  };

  // Cleanly extract active provider and category regardless of leading slash e.g. "watch/kiwi/178005/sub/slug"
  const cleanParts = activeEpisodeId.replace(/^\//, "").split("/");
  const currentProviderName = cleanParts[1] || providerNames[0] || "auto";
  const activeCategory = cleanParts[3] === "dub" ? "dub" : preferredCategory;
  const activeServerLabel = getServerLabel(providerNames, currentProviderName);
  const playerHeader = (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/[0.07] bg-[#101018] px-3 py-3 sm:px-4">
      <Link
        href={ROUTES.animeDetails(animeIdParam)}
        aria-label="Back to anime details"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-200 transition hover:border-[#ff2f9d]/40 hover:bg-[#ff2f9d]/10 hover:text-white"
      >
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-white sm:text-base">
          {anime?.anime?.info?.name || "Now Playing"}
        </p>
        <p className="mt-0.5 truncate text-xs text-zinc-400">
          Episode {currentEpNumber} <span className="px-1 text-zinc-600">·</span> {activeCategory.toUpperCase()} <span className="px-1 text-zinc-600">·</span> {activeServerLabel}
        </p>
      </div>
      <Link
        href="#episode-list"
        className="shrink-0 rounded-lg px-2 py-2 text-xs font-semibold text-[#ff70bd] transition hover:bg-[#ff2f9d]/10 sm:px-3"
      >
        Episodes
      </Link>
    </div>
  );

  if (!activeEpisodeId || isLoadingData) {
    return (
      <div className="space-y-3">
        {playerHeader}
        <div
        role="status"
        aria-live="polite"
        className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.035] text-sm text-zinc-400"
      >
        <span className="h-7 w-7 animate-spin rounded-full border-2 border-violet-400/25 border-t-violet-300" />
        <span>{activeEpisodeId ? "Finding a playable stream…" : "Preparing episode…"}</span>
        </div>
      </div>
    );
  }

  // Fallback player if API stream fails, throws error, returns no sources, or sys_source_available is false
  if (isFallbackActive) {
    const fallbackAnimeId = animeIdParam || anime?.anime?.info?.id || "1";
    const fallbackEpId = currentEpNumber || "1";
    const fallbackSrc = `https://megaplay.buzz/stream/ani/${fallbackAnimeId}/${fallbackEpId}/${activeCategory}`;

    return (
      <div className="flex w-full flex-col gap-3">
        {playerHeader}
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl shadow-black/40">
          <iframe
            key={`${fallbackAnimeId}-${fallbackEpId}-${activeCategory}`}
            src={fallbackSrc}
            width="100%"
            height="100%"
            allowFullScreen
            className="w-full h-full border-0"
          ></iframe>
        </div>
        <div className="flex flex-col justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.035] p-3 sm:flex-row sm:items-center sm:p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold text-gray-400 tracking-wider">CATEGORY:</span>
            <Button
              size="sm"
              variant="ghost"
              disabled={!hasSub}
              onClick={() => handleCategoryChange("sub")}
              className={`h-8 px-4 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition ${
                activeCategory === "sub"
                  ? "bg-[#ff2f9d] text-white hover:bg-[#ff56ad]"
                  : "bg-slate-800 text-gray-400 hover:bg-slate-700"
              }`}
            >
              <Captions className="h-3.5 w-3.5" /> SUB
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!hasDub}
              onClick={() => handleCategoryChange("dub")}
              className={`h-8 px-4 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition ${
                activeCategory === "dub"
                  ? "bg-[#ff2f9d] text-white hover:bg-[#ff56ad]"
                  : "bg-slate-800 text-gray-400 hover:bg-slate-700"
              }`}
            >
              <Mic className="h-3.5 w-3.5" /> DUB
            </Button>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setForcePrimary(true);
              setUseFallback(false);
              void retryEpisodeData();
            }}
            className="flex h-8 shrink-0 items-center gap-1.5 self-start border-white/10 bg-white/[0.04] px-3 text-xs text-zinc-200 hover:bg-white/[0.08] sm:self-auto"
          >
            <Tv className="h-3.5 w-3.5 text-blue-400" /> Try Primary Player
          </Button>
        </div>
        <Alert variant="destructive" className="border-[#ff2f9d]/20 bg-[#ff2f9d]/[0.06] text-zinc-300 rounded-xl">
          <AlertCircle className="h-4 w-4 text-[#ff70bd]" />
          <AlertTitle className="font-bold">Fallback player active · MegaPlay</AlertTitle>
          <AlertDescription className="text-xs text-red-300/80 mt-1">
            Primary extraction did not return a playable stream. MegaPlay is active as the fallback player.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div>
      {playerHeader}
      <VideoPlayer
        key={episodeData.sources?.[0]?.url}
        episodeInfo={episodeData}
        serversData={{
          episodeId: activeEpisodeId,
          episodeNo: String(currentEpNumber),
          sub: providerNames.map((p, idx) => ({ serverId: idx + 1, serverName: getServerLabel(providerNames, p) })),
          dub: [],
          raw: [],
        }}
        animeInfo={{
          id: anime?.anime?.info?.id || "0",
          title: anime?.anime?.info?.name || "Anime",
          image: anime?.anime?.info?.poster || "",
        }}
        subOrDub={activeCategory}
        autoSkip={autoSkip}
        onError={() => setUseFallback(true)}
      />
      <div className="flex w-full flex-col gap-3 rounded-2xl border border-white/[0.07] bg-[#101018] p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-[#ff2f9d]/15 px-2.5 py-1.5 text-xs font-extrabold text-[#ff70bd]">
              {activeServerLabel}
            </span>
            <span className="text-xs text-zinc-400" title={getServerProviderTitle(providerNames, currentProviderName)}>
              Active server
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl border border-white/[0.08] bg-black/20 p-1">
              <Button
                size="sm"
                variant="ghost"
                disabled={!hasSub}
                onClick={() => handleCategoryChange("sub")}
                className={`h-8 rounded-lg px-3 text-xs font-bold transition ${activeCategory === "sub" ? "bg-[#ff2f9d] text-white hover:bg-[#ff56ad]" : "text-zinc-400 hover:text-white"}`}
              >
                <Captions className="mr-1.5 h-3.5 w-3.5" /> SUB
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!hasDub}
                onClick={() => handleCategoryChange("dub")}
                className={`h-8 rounded-lg px-3 text-xs font-bold transition ${activeCategory === "dub" ? "bg-[#ff2f9d] text-white hover:bg-[#ff56ad]" : "text-zinc-400 hover:text-white"}`}
              >
                <Mic className="mr-1.5 h-3.5 w-3.5" /> DUB
              </Button>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2">
              <Switch checked={autoSkip} onCheckedChange={onHandleAutoSkipChange} id="auto-skip" />
              <label htmlFor="auto-skip" className="whitespace-nowrap text-xs font-medium text-zinc-300">Auto skip</label>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
          {providerNames.map((pName) => {
            const availableEpisodes = rawProviders[pName]?.episodes?.[activeCategory] || [];
            if (!availableEpisodes.length) return null;
            const isActive = currentProviderName.toLowerCase() === pName.toLowerCase();
            return (
              <Button
                size="sm"
                key={`${activeCategory}-${pName}`}
                title={getServerProviderTitle(providerNames, pName)}
                aria-label={getServerProviderTitle(providerNames, pName)}
                onClick={() => handleProviderSelect(pName, activeCategory)}
                className={`h-9 shrink-0 rounded-xl px-4 text-xs font-bold transition ${isActive
                  ? "bg-[#ff2f9d] text-white shadow-md shadow-[#ff2f9d]/20"
                  : "border border-white/[0.08] bg-white/[0.035] text-zinc-300 hover:border-[#ff2f9d]/30 hover:bg-[#ff2f9d]/10 hover:text-white"
                }`}
              >
                {getServerLabel(providerNames, pName)}
              </Button>
            );
          })}
          {!providerNames.some((pName) => (rawProviders[pName]?.episodes?.[activeCategory] || []).length > 0) && (
            <span className="flex items-center gap-2 px-2 text-xs text-zinc-400">
              Automatic provider selection is active while episode sources load.
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
          <p className="text-[11px] leading-relaxed text-zinc-500">
            Server numbers are series-specific. Hold a server button to view its provider.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setUseFallback(true)}
            className="h-8 shrink-0 gap-1.5 border-[#ff2f9d]/20 bg-[#ff2f9d]/[0.06] px-3 text-xs text-zinc-200 hover:bg-[#ff2f9d]/[0.12]"
          >
            <Tv className="h-3.5 w-3.5 text-[#ff70bd]" /> Fallback player
          </Button>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayerSection;
