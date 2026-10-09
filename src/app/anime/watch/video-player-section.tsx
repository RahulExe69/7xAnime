"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAnimeStore } from "@/store/anime-store";
import dynamic from "next/dynamic";

const VideoPlayer = dynamic(() => import("@/components/video-player"), {
  ssr: false,
});
import { useGetEpisodeData } from "@/query/get-episode-data";
import { useQuery } from "react-query";
import { getHindiDubStreams } from "@/lib/hindi-dub";
import { ArrowLeft, Captions, Mic, AlertCircle } from "lucide-react";
import Link from "next/link";
import { getServerProviderTitle } from "@/lib/server-map";
import { Switch } from "@/components/ui/switch";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { useGetAllEpisodes } from "@/query/get-all-episodes";

import useBookMarks from "@/hooks/use-get-bookmark";
import { isLocalBackendEnabled } from "@/lib/api";
import { saveLocalWatchProgress } from "@/lib/local-watch-progress";

const updateEpisodeUrl = (episodeId: string, episodeNumber: number) => {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("episode", episodeId);
  url.searchParams.set("ep", String(episodeNumber));
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
};

const VideoPlayerSection = () => {
  const searchParams = useSearchParams();
  const animeIdParam = searchParams.get("anime") || "";
  const epParam = searchParams.get("ep");
  const episodeIdParam = searchParams.get("episode") || "";
  const { selectedEpisode, setSelectedEpisode, anime } = useAnimeStore();

  const { data: allEpisodesData, isLoading: isEpisodesLoading } = useGetAllEpisodes(animeIdParam);
  const [preferredCategory, setPreferredCategory] = useState<"sub" | "dub">("dub");
  const requestedEpisodeNumber = Math.max(1, Number(epParam) || 1);

  const rawProviders = useMemo(
    () => allEpisodesData?.rawResponse?.providers || {},
    [allEpisodesData?.rawResponse?.providers],
  );
  const providerNames = useMemo(() => Object.keys(rawProviders), [rawProviders]);

  const targetEpByNumber = allEpisodesData?.episodes
    ? allEpisodesData.episodes.find((episode) => Number(episode.number) === requestedEpisodeNumber)
    : null;
  const preferredEpisodeId = useMemo(() => {
    if (episodeIdParam) return "";
    const requestedNumber = Math.max(1, Number(epParam) || 1);
    for (const providerName of providerNames) {
      const candidate = rawProviders[providerName]?.episodes?.[preferredCategory]
        ?.find((episode) => episode.number === requestedNumber);
      if (candidate?.id) return candidate.id;
    }
    return "";
  }, [episodeIdParam, epParam, preferredCategory, providerNames, rawProviders]);

  // In the Android build, start with Kuhi's automatic route immediately. The
  // local API races providers for a working stream while the full provider
  // catalogue continues loading; waiting for every episode scraper first made
  // the watch screen look frozen for far too long.
  const localAutoEpisodeId = isLocalBackendEnabled() && animeIdParam
    ? `watch/auto/${animeIdParam}/${preferredCategory}/episode-${requestedEpisodeNumber}`
    : "";
  const activeEpisodeId = episodeIdParam || localAutoEpisodeId || preferredEpisodeId ||
    (epParam ? targetEpByNumber?.episodeId || "" : allEpisodesData?.episodes?.[0]?.episodeId || "");

  useEffect(() => {
    if (activeEpisodeId && selectedEpisode !== activeEpisodeId) {
      setSelectedEpisode(activeEpisodeId);
    }
  }, [activeEpisodeId, selectedEpisode, setSelectedEpisode]);

  const [useFallback, setUseFallback] = useState<boolean>(false);
  const [isHindiMode, setIsHindiMode] = useState<boolean>(false);
  const [selectedHindiServer, setSelectedHindiServer] = useState<number>(0);
  const attemptedSourceIdsRef = useRef<Set<string>>(new Set());

  const {
    data: episodeData,
    isLoading: isLoadingData,
    isError: isEpisodeDataError,
  } = useGetEpisodeData(activeEpisodeId, !useFallback && !isHindiMode);

  const [autoSkip, setAutoSkip] = useState<boolean>(true);

  const { createOrUpdateBookMark, syncWatchProgress } = useBookMarks({
    animeID: animeIdParam,
    populate: false,
  });

  const fallbackBookmarkIdRef = React.useRef<string | null>(null);
  const fallbackWatchedRecordIdRef = React.useRef<string | null>(null);
  const lastSyncedTimeRef = React.useRef<number>(0);

  useEffect(() => {
    const storedSkip = localStorage.getItem("autoSkip");
    if (storedSkip !== null) setAutoSkip(storedSkip === "true");
  }, []);



  function onHandleAutoSkipChange(value: boolean) {
    setAutoSkip(value);
    localStorage.setItem("autoSkip", JSON.stringify(value));
  }

  // Extract current episode number from activeEpisodeId
  const activeEpisodeNumberFromList = allEpisodesData?.episodes?.find(
    (episode) => episode.episodeId === activeEpisodeId,
  )?.number;
  const activeEpisodeSlug = activeEpisodeId.split("/").pop() || "";
  const activeEpisodeNumberFromSlug = Number(activeEpisodeSlug.match(/(\d+)$/)?.[1]) || 0;
  const currentEpNumber = activeEpisodeNumberFromList || activeEpisodeNumberFromSlug || Math.max(1, Number(epParam) || 1);

  const automaticCandidates = useMemo(() => {
    const candidates: Array<{ id: string; category: "dub" | "sub" }> = [];
    for (const category of ["dub", "sub"] as const) {
      for (const providerName of providerNames) {
        const providerEpisodes = rawProviders[providerName]?.episodes?.[category] || [];
        if (!providerEpisodes.length) continue;
        const episode = providerEpisodes.find((item) => Number(item.number) === currentEpNumber);
        const id = episode?.id || (isLocalBackendEnabled()
          ? `watch/${providerName}/${animeIdParam}/${category}/${providerName}-${currentEpNumber}`
          : "");
        if (id && !candidates.some((candidate) => candidate.id === id)) {
          candidates.push({ id, category });
        }
      }
    }
    return candidates;
  }, [providerNames, rawProviders, currentEpNumber, animeIdParam]);

  useEffect(() => {
    attemptedSourceIdsRef.current.clear();
    setUseFallback(false);
    setIsHindiMode(false);
    setSelectedHindiServer(0);
    setPreferredCategory("dub");
  }, [animeIdParam, currentEpNumber]);

  useEffect(() => {
    if (activeEpisodeId) attemptedSourceIdsRef.current.add(activeEpisodeId);
  }, [activeEpisodeId]);

  const advanceAfterSourceFailure = useCallback(() => {
    if (activeEpisodeId) attemptedSourceIdsRef.current.add(activeEpisodeId);
    const next = automaticCandidates.find((candidate) => !attemptedSourceIdsRef.current.has(candidate.id));
    if (next) {
      attemptedSourceIdsRef.current.add(next.id);
      setUseFallback(false);
      setIsHindiMode(false);
      setPreferredCategory(next.category);
      setSelectedEpisode(next.id);
      updateEpisodeUrl(next.id, currentEpNumber);
      return;
    }
    setUseFallback(true);
  }, [activeEpisodeId, automaticCandidates, currentEpNumber, setSelectedEpisode]);

  useEffect(() => {
    if (!activeEpisodeId || isHindiMode || useFallback || isLoadingData) return;
    const requestFailed = isEpisodeDataError || (!!episodeData && !episodeData.sources?.length);
    if (!requestFailed) return;

    // The local "auto" route has already raced every bundled stream provider.
    // If that race returned no source, trying the same providers sequentially
    // can add another long wait per host; move to Server 1 instead.
    if (isLocalBackendEnabled() && activeEpisodeId.startsWith("watch/auto/")) {
      setUseFallback(true);
      return;
    }

    // Let the initial local provider discovery yield at least a first batch
    // before falling back. If every known candidate has already failed, keep
    // waiting for the in-flight catalogue rather than giving up after two hosts.
    if (isLocalBackendEnabled() && isEpisodesLoading) return;
    const nativeCatalogue = allEpisodesData?.rawResponse?.source === "native";
    const catalogueComplete = allEpisodesData?.rawResponse?.complete === true;
    if (
      isLocalBackendEnabled() &&
      nativeCatalogue &&
      !catalogueComplete &&
      automaticCandidates.every((candidate) => attemptedSourceIdsRef.current.has(candidate.id))
    ) {
      return;
    }
    advanceAfterSourceFailure();
  }, [
    activeEpisodeId, advanceAfterSourceFailure, allEpisodesData?.rawResponse?.complete,
    allEpisodesData?.rawResponse?.source, automaticCandidates, episodeData,
    isEpisodeDataError, isEpisodesLoading, isHindiMode, isLoadingData, useFallback,
  ]);
  const animeTitleOptions = useMemo(
    () => [...new Set([
      anime?.anime?.info?.name || "",
      anime?.anime?.moreInfo?.japanese || "",
    ].map((title) => title.trim()).filter(Boolean))],
    [anime?.anime?.info?.name, anime?.anime?.moreInfo?.japanese],
  );
  const {
    data: hindiDubData,
    isLoading: isLoadingHindi,

  } = useQuery({
    queryKey: ["HINDI_DUB_STREAMS", animeIdParam, currentEpNumber, animeTitleOptions],
    queryFn: () => getHindiDubStreams(animeTitleOptions, currentEpNumber),
    enabled: !!animeTitleOptions.length && !!currentEpNumber,
    retry: 0,
    staleTime: 1000 * 60 * 10,
  });
  const hindiStreams = hindiDubData?.streams || [];

  // Check sub/dub availability for this episode
  const hasSub = providerNames.some((p) => (rawProviders[p]?.episodes?.sub || []).length > 0);
  const hasDub = providerNames.some((p) => (rawProviders[p]?.episodes?.dub || []).length > 0);
  const nativeCatalogueComplete =
    allEpisodesData?.rawResponse?.source === "native" &&
    allEpisodesData.rawResponse.complete === true;

  const handleCategoryChange = (cat: "sub" | "dub") => {
    setIsHindiMode(false);
    setUseFallback(false);
    setPreferredCategory(cat);

    const categoryProviders = providerNames.filter(
      (name) => (rawProviders[name]?.episodes?.[cat] || []).length > 0,
    );
    const preferredProvider = categoryProviders.find((name) =>
      (rawProviders[name]?.episodes?.[cat] || []).some((episode) => Number(episode.number) === currentEpNumber),
    ) || categoryProviders[0];

    const target = preferredProvider
      ? (rawProviders[preferredProvider]?.episodes?.[cat] || [])
          .find((episode) => Number(episode.number) === currentEpNumber)
      : undefined;
    const targetId = target?.id || (isLocalBackendEnabled() && preferredProvider
      ? `watch/${preferredProvider}/${animeIdParam}/${cat}/${preferredProvider}-${currentEpNumber}`
      : isLocalBackendEnabled()
        ? `watch/auto/${animeIdParam}/${cat}/episode-${currentEpNumber}`
        : "");

    if (targetId) {
      attemptedSourceIdsRef.current.delete(targetId);
      setSelectedEpisode(targetId);
      updateEpisodeUrl(targetId, currentEpNumber);
    }
  };

  const isFallbackActive = !isHindiMode && (
    useFallback
  );

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
    setIsHindiMode(false);
    setUseFallback(false);
    setPreferredCategory(category);
    const pData = rawProviders[pName]?.episodes?.[category] || [];
    const targetEp = pData.find((ep) => Number(ep.number) === currentEpNumber);
    // Episode catalogues can be incomplete even when a source can play the
    // requested episode. The local adapter accepts the trailing episode number
    // and lets the selected provider try extraction directly.
    const targetId = targetEp?.id || (isLocalBackendEnabled()
      ? `watch/${pName}/${animeIdParam}/${category}/${pName}-${currentEpNumber}`
      : "");
    if (targetId) {
      attemptedSourceIdsRef.current.delete(targetId);
      setSelectedEpisode(targetId);
      updateEpisodeUrl(targetId, currentEpNumber);
    }
  };

  const cleanParts = activeEpisodeId.replace(/^\//, "").split("/");
  const currentProviderName = cleanParts[1] || providerNames[0] || "auto";
  const activeCategory = cleanParts[3] === "dub" ? "dub" : cleanParts[3] === "sub" ? "sub" : preferredCategory;
  const availableProviderNames = providerNames.filter(
    (providerName) => (rawProviders[providerName]?.episodes?.[activeCategory] || []).length > 0,
  );
  const selectedProviderIndex = availableProviderNames.indexOf(currentProviderName);
  const fallbackServerNumber = 1;
  const activeServerNumber = isHindiMode
    ? selectedHindiServer + 1
    : useFallback || isFallbackActive
      ? fallbackServerNumber
      : selectedProviderIndex >= 0 ? selectedProviderIndex + 2 : 1;
  const isAutomaticServerActive =
    isLocalBackendEnabled() &&
    currentProviderName === "auto" &&
    !isHindiMode &&
    !useFallback;
  const activeServerLabel = isAutomaticServerActive ? "Auto" : `Server ${activeServerNumber}`;

  const selectFallbackServer = (category?: "sub" | "dub") => {
    if (category) setPreferredCategory(category);
    setIsHindiMode(false);
    setUseFallback(true);
  };
  const selectHindiMode = () => {
    if (!hindiStreams.length) return;
    setUseFallback(false);
    setSelectedHindiServer(0);
    setIsHindiMode(true);
  };

  const playerAnimeInfo = useMemo(
    () => ({
      id: anime?.anime?.info?.id || "0",
      title: anime?.anime?.info?.name || "Anime",
      image: anime?.anime?.info?.poster || "",
    }),
    [anime?.anime?.info?.id, anime?.anime?.info?.name, anime?.anime?.info?.poster],
  );

  const playerControls = (
    <div className="flex w-full flex-col gap-3 rounded-2xl border border-white/[0.07] bg-[#101018] p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-black/20 p-1">
          <Button size="sm" variant="ghost" disabled={nativeCatalogueComplete && !hasSub} onClick={() => handleCategoryChange("sub")} className={`h-8 rounded-lg px-3 text-xs font-bold transition ${!isHindiMode && activeCategory === "sub" ? "bg-[#ff2f9d] text-white hover:bg-[#ff56ad]" : "text-zinc-400 hover:text-white"}`}>
            <Captions className="mr-1.5 h-3.5 w-3.5" /> SUB
          </Button>
          <Button size="sm" variant="ghost" disabled={nativeCatalogueComplete && !hasDub} onClick={() => handleCategoryChange("dub")} className={`h-8 rounded-lg px-3 text-xs font-bold transition ${!isHindiMode && activeCategory === "dub" ? "bg-[#ff2f9d] text-white hover:bg-[#ff56ad]" : "text-zinc-400 hover:text-white"}`}>
            <Mic className="mr-1.5 h-3.5 w-3.5" /> ENGLISH
          </Button>
          {hindiStreams.length > 0 && (
            <Button size="sm" variant="ghost" onClick={selectHindiMode} className={`h-8 rounded-lg px-3 text-xs font-bold transition ${isHindiMode ? "bg-[#ff2f9d] text-white hover:bg-[#ff56ad]" : "text-zinc-400 hover:text-white"}`}>
              <span className="mr-1.5">हिं</span> HINDI
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2">
          <Switch checked={autoSkip} onCheckedChange={onHandleAutoSkipChange} id="auto-skip" />
          <label htmlFor="auto-skip" className="whitespace-nowrap text-xs font-medium text-zinc-300">Auto skip</label>
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
        <span className="mr-1 text-xs font-extrabold tracking-wide text-zinc-400">Server:</span>
        {isHindiMode ? (
          hindiStreams.map((stream, index) => (
            <Button key={stream.embed} size="sm" title={`Server ${index + 1} — Hindi dub — ${stream.host}`} aria-label={`Server ${index + 1} — Hindi dub — ${stream.host}`} onClick={() => setSelectedHindiServer(index)} className={`h-9 min-w-9 rounded-xl px-3 text-xs font-extrabold transition ${activeServerNumber === index + 1 ? "bg-[#ff2f9d] text-white" : "border border-white/[0.08] bg-white/[0.035] text-zinc-300 hover:border-[#ff2f9d]/30 hover:bg-[#ff2f9d]/10"}`}>{index + 1}</Button>
          ))
        ) : (
          <>
            <Button size="sm" title="Server 1 — MegaPlay" aria-label="Server 1 — MegaPlay" onClick={() => selectFallbackServer()} className={`h-9 min-w-9 rounded-xl px-3 text-xs font-extrabold transition ${activeServerNumber === 1 && (useFallback || isFallbackActive) ? "bg-[#ff2f9d] text-white" : "border border-white/[0.08] bg-white/[0.035] text-zinc-300 hover:border-[#ff2f9d]/30 hover:bg-[#ff2f9d]/10"}`}>1</Button>
            {availableProviderNames.map((providerName, index) => (
              <Button key={`${activeCategory}-${providerName}`} size="sm" title={getServerProviderTitle(availableProviderNames, providerName)} aria-label={getServerProviderTitle(availableProviderNames, providerName)} onClick={() => handleProviderSelect(providerName, activeCategory)} className={`h-9 min-w-9 rounded-xl px-3 text-xs font-extrabold transition ${activeServerNumber === index + 2 ? "bg-[#ff2f9d] text-white" : "border border-white/[0.08] bg-white/[0.035] text-zinc-300 hover:border-[#ff2f9d]/30 hover:bg-[#ff2f9d]/10"}`}>{index + 2}</Button>
            ))}
            {isLocalBackendEnabled() && !nativeCatalogueComplete && availableProviderNames.length === 0 && (
              <span className="px-2 text-xs text-zinc-500" role="status">Finding servers…</span>
            )}
          </>
        )}
      </div>
    </div>
  );
  const playerHeader = (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/[0.07] bg-[#101018] px-3 py-3 sm:px-4">
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("7xanime:navigate-back"))}
        aria-label="Back to previous page"
        title="Back"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-200 transition hover:border-[#ff2f9d]/40 hover:bg-[#ff2f9d]/10 hover:text-white"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-white sm:text-base">
          {anime?.anime?.info?.name || "Now Playing"}
        </p>
        <p className="mt-0.5 truncate text-xs text-zinc-400">
          Episode {currentEpNumber} <span className="px-1 text-zinc-600">·</span> {isHindiMode ? "HINDI" : activeCategory === "dub" ? "ENGLISH" : "SUB"} <span className="px-1 text-zinc-600">·</span> {activeServerLabel}
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

  if (isHindiMode && isLoadingHindi) {
    return (
      <div className="space-y-3">
        {playerHeader}
        <div role="status" aria-live="polite" className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-2xl border border-[#dedbea] bg-white text-sm text-[#716b87] dark:border-[#302c40] dark:bg-[#14121c] dark:text-zinc-400">
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-[#604bd3]/25 border-t-[#604bd3]" />
          <span>Finding Hindi dub for episode {currentEpNumber}…</span>
        </div>
        <p className="text-xs text-[#77728f] dark:text-zinc-500">Hindi sources come from a community-maintained catalogue, so some anime or episodes may be missing.</p>
        {playerControls}
      </div>
    );
  }

  if (isHindiMode) {
    const selectedHindi = hindiStreams[selectedHindiServer];
    return (
      <div className="flex w-full flex-col gap-3">
        {playerHeader}
        {selectedHindi ? (
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl shadow-black/40">
            <iframe
              key={selectedHindi.embed}
              src={selectedHindi.embed}
              title={`${hindiDubData?.matchedTitle || anime?.anime?.info?.name || "Anime"} episode ${currentEpNumber} Hindi dub via ${selectedHindi.host}`}
              width="100%"
              height="100%"
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              className="absolute inset-0 h-full w-full border-0"
            />
          </div>
        ) : (
          <Alert className="rounded-2xl border-white/[0.08] bg-[#101018] text-zinc-200">
            <AlertCircle className="h-4 w-4 text-[#ff70bd]" />
            <AlertTitle className="font-bold">Hindi stream temporarily unavailable</AlertTitle>
            <AlertDescription className="mt-1 text-sm text-zinc-400">This episode has no verified playable Hindi embed right now.</AlertDescription>
          </Alert>
        )}
        {playerControls}
      </div>
    );
  }

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
        {playerControls}
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
          <iframe key={`${fallbackAnimeId}-${fallbackEpId}-${activeCategory}`} src={fallbackSrc} title={`${anime?.anime?.info?.name || "Anime"} episode ${currentEpNumber}`} width="100%" height="100%" allowFullScreen className="absolute inset-0 h-full w-full border-0" />
        </div>
        {playerControls}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {playerHeader}
      <VideoPlayer
        key={episodeData?.sources?.[0]?.url}
        episodeInfo={episodeData!}
        serversData={{
          episodeId: activeEpisodeId,
          episodeNo: String(currentEpNumber),
          sub: availableProviderNames.map((providerName, index) => ({ serverId: index + 2, serverName: `Server ${index + 2}` })),
          dub: [],
          raw: [],
        }}
        animeInfo={playerAnimeInfo}
        subOrDub={activeCategory}
        autoSkip={autoSkip}
        onError={advanceAfterSourceFailure}
      />
      {playerControls}
    </div>
  );
};

export default VideoPlayerSection;
