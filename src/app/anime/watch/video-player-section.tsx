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
import { getProviderDisplayName, getServerProviderTitle, isProviderSelectable, KUHI_PROVIDER_ORDER } from "@/lib/server-map";
import { Switch } from "@/components/ui/switch";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PlayerViewport } from "@/components/player-viewport";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { useGetAllEpisodes } from "@/query/get-all-episodes";

import useBookMarks from "@/hooks/use-get-bookmark";
import { api, isLocalBackendEnabled } from "@/lib/api";
import { saveLocalWatchProgress } from "@/lib/local-watch-progress";

type LocalProviderDiagnostic = {
  id: string;
  moduleLoaded: boolean;
  status: "module_unavailable" | "not_tested_yet" | "recent_attempts_failed" | "recent_attempt_succeeded";
  averageSeconds: number | null;
  episodesSeconds: number | null;
  failuresSinceLastSuccess: number;
  lastOutcome?: string | null;
  anilistId?: number | null;
  episode?: number | null;
  audio?: string | null;
  lastError?: string | null;
  lastAttemptSeconds?: number | null;
  lastAttemptAt?: number | null;
  lastAttemptCached?: boolean;
};

type LocalProviderStatus = {
  mode: string;
  defaultProvider: string;
  loadedCount: number;
  providerCount: number;
  providers: LocalProviderDiagnostic[];
  note: string;
};

const isProviderDiagnosticForSelection = (
  item: LocalProviderDiagnostic,
  anilistId: string | number | undefined,
  episode: number | string,
  audio: string,
): boolean =>
  item.anilistId === Number(anilistId)
  && item.episode === Number(episode)
  && item.audio === audio;

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

  useEffect(() => {
    const savedAudio = localStorage.getItem("preferredAudio");
    if (savedAudio === "sub" || savedAudio === "dub") {
      setPreferredCategory(savedAudio);
    }
  }, []);
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
  const hasManualProviderSelection =
    isLocalBackendEnabled() &&
    !!episodeIdParam &&
    !episodeIdParam.startsWith("watch/auto/");

  // Only mirror an explicit episode ID from the URL into Zustand.
  // When a URL contains only ?ep=N, EpisodePlaylist owns the highlighted
  // selection while the player may use a temporary watch/auto URL. Syncing
  // that temporary URL back into the same store creates a feedback loop:
  // the player writes watch/auto/.../dub/episode-N, the playlist writes its
  // provider episode ID, and the two effects keep triggering each other
  // until React throws error #185 (maximum update depth exceeded).
  useEffect(() => {
    if (!episodeIdParam || selectedEpisode === episodeIdParam) return;
    setSelectedEpisode(episodeIdParam);
  }, [episodeIdParam, selectedEpisode, setSelectedEpisode]);

  const [useFallback, setUseFallback] = useState<boolean>(false);
  const [isHindiMode, setIsHindiMode] = useState<boolean>(false);
  const [selectedHindiServer, setSelectedHindiServer] = useState<number>(0);
  const [manualProviderPlaybackFailed, setManualProviderPlaybackFailed] = useState(false);
  const [playbackSourceIndex, setPlaybackSourceIndex] = useState(0);
  const [lastPlayerError, setLastPlayerError] = useState<string | null>(null);
  const [streamResolutionTimedOut, setStreamResolutionTimedOut] = useState(false);
  const [streamRetryKey, setStreamRetryKey] = useState(0);
  const [playerRetryKey, setPlayerRetryKey] = useState(0);
  const [retryingPlayback, setRetryingPlayback] = useState<{ episodeId: string; attempt: number } | null>(null);
  const [retryingResolution, setRetryingResolution] = useState<{ episodeId: string; attempt: number } | null>(null);
  const [providerPlaybackOutcomes, setProviderPlaybackOutcomes] = useState<Record<string, "playing" | "failed" | "retrying">>({});
  const attemptedSourceIdsRef = useRef<Set<string>>(new Set());
  const blockedPlayerActionAtRef = useRef(0);
  const playbackRetriesRef = useRef<{ key: string; count: number }>({ key: "", count: 0 });
  const resolutionRetriesRef = useRef<Record<string, number>>({});
  const resolutionRetryInFlightRef = useRef<string | null>(null);
  const resolutionRetryReleaseTimerRef = useRef<number | null>(null);
  const lastEmbedProgressRef = useRef<{
    animeId: string; episodeId: string; episodeNumber: number; animeTitle: string;
    poster: string; current: number; duration: number;
  } | null>(null);
  const embedLoadStartedAtRef = useRef(0);
  const lastEmbedSignalAtRef = useRef(0);
  const externalEmbedFrameRef = useRef<HTMLIFrameElement | null>(null);

  const flushLatestEmbedProgress = useCallback(() => {
    const latest = lastEmbedProgressRef.current;
    if (latest && isLocalBackendEnabled()) saveLocalWatchProgress(latest);
  }, []);

  useEffect(() => {
    const latest = lastEmbedProgressRef.current;
    if (latest && latest.episodeId !== activeEpisodeId) {
      flushLatestEmbedProgress();
      lastEmbedProgressRef.current = null;
    }
    setManualProviderPlaybackFailed(false);
    setPlaybackSourceIndex(0);
    setLastPlayerError(null);
    playbackRetriesRef.current = { key: `${activeEpisodeId}|0`, count: 0 };
    resolutionRetriesRef.current[activeEpisodeId] = 0;
    resolutionRetryInFlightRef.current = null;
    if (resolutionRetryReleaseTimerRef.current !== null) {
      window.clearTimeout(resolutionRetryReleaseTimerRef.current);
      resolutionRetryReleaseTimerRef.current = null;
    }
    embedLoadStartedAtRef.current = 0;
    lastEmbedSignalAtRef.current = 0;
    setRetryingPlayback(null);
    setRetryingResolution(null);
  }, [activeEpisodeId, flushLatestEmbedProgress]);

  const {
    data: episodeData,
    isLoading: isLoadingData,
    isFetching: isFetchingEpisodeData,
    isError: isEpisodeDataError,
    refetch: retryEpisodeData,
  } = useGetEpisodeData(activeEpisodeId, !useFallback && !isHindiMode);

  const hasPlayableSources = Array.isArray(episodeData?.sources) &&
    episodeData.sources.some((source) =>
      typeof source?.url === "string" && source.url.trim().length > 0,
    );
  const streamRequestFailed = isEpisodeDataError ||
    (!!episodeData && !hasPlayableSources);

  // Never leave the video area in an endless loading state. Provider requests
  // may finish later, but the viewer gets a usable retry/fallback action quickly.
  useEffect(() => {
    setStreamResolutionTimedOut(false);
    if (
      !activeEpisodeId ||
      useFallback ||
      isHindiMode ||
      !isLoadingData ||
      streamRequestFailed
    ) return;

    const timeoutId = window.setTimeout(() => setStreamResolutionTimedOut(true), 15000);
    return () => window.clearTimeout(timeoutId);
  }, [
    activeEpisodeId,
    useFallback,
    isHindiMode,
    isLoadingData,
    streamRequestFailed,
    streamRetryKey,
  ]);

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

  useEffect(() => {
    setProviderPlaybackOutcomes({});
  }, [animeIdParam, currentEpNumber, preferredCategory]);

  const automaticCandidates = useMemo(() => {
    const candidates: Array<{ id: string; category: "dub" | "sub" }> = [];
    if (isLocalBackendEnabled()) {
      // Include every allowlisted manual route, even when that server does not
      // contribute a catalogue. On a detected failure, continue to the next
      // server automatically; SUB-only sources are switched to SUB explicitly.
      const orderedProviders = [
        ...KUHI_PROVIDER_ORDER,
        ...providerNames.filter((name) => !KUHI_PROVIDER_ORDER.includes(name as (typeof KUHI_PROVIDER_ORDER)[number])),
      ];
      for (const providerName of orderedProviders) {
        const category = isProviderSelectable(providerName, preferredCategory)
          ? preferredCategory
          : isProviderSelectable(providerName, preferredCategory === "sub" ? "dub" : "sub")
            ? (preferredCategory === "sub" ? "dub" : "sub")
            : preferredCategory;
        const providerEpisodes = rawProviders[providerName]?.episodes?.[category] || [];
        const episode = providerEpisodes.find((item) => Number(item.number) === currentEpNumber);
        const id = episode?.id ||
          `watch/${providerName}/${animeIdParam}/${category}/${providerName}-${currentEpNumber}`;
        if (id && !candidates.some((candidate) => candidate.id === id)) {
          candidates.push({ id, category });
        }
      }
      return candidates;
    }

    for (const category of ["dub", "sub"] as const) {
      for (const providerName of providerNames) {
        const providerEpisodes = rawProviders[providerName]?.episodes?.[category] || [];
        if (!providerEpisodes.length) continue;
        const episode = providerEpisodes.find((item) => Number(item.number) === currentEpNumber);
        const id = episode?.id || "";
        if (id && !candidates.some((candidate) => candidate.id === id)) {
          candidates.push({ id, category });
        }
      }
    }
    return candidates;
  }, [providerNames, rawProviders, currentEpNumber, animeIdParam, preferredCategory]);

  useEffect(() => {
    attemptedSourceIdsRef.current.clear();
    setUseFallback(false);
    setIsHindiMode(false);
    setSelectedHindiServer(0);
    setPreferredCategory(localStorage.getItem("preferredAudio") === "sub" ? "sub" : "dub");
  }, [animeIdParam, currentEpNumber]);

  useEffect(() => {
    if (activeEpisodeId) attemptedSourceIdsRef.current.add(activeEpisodeId);
  }, [activeEpisodeId]);

  const advanceAfterSourceFailure = useCallback(() => {
    flushLatestEmbedProgress();
    if (activeEpisodeId) attemptedSourceIdsRef.current.add(activeEpisodeId);
    const currentCandidateIndex = automaticCandidates.findIndex((candidate) => candidate.id === activeEpisodeId);
    const orderedCandidates = currentCandidateIndex >= 0
      ? [
          ...automaticCandidates.slice(currentCandidateIndex + 1),
          ...automaticCandidates.slice(0, currentCandidateIndex),
        ]
      : automaticCandidates;
    const next = orderedCandidates.find((candidate) => !attemptedSourceIdsRef.current.has(candidate.id));
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
  }, [activeEpisodeId, automaticCandidates, currentEpNumber, flushLatestEmbedProgress, setSelectedEpisode]);

  useEffect(() => {
    if (!activeEpisodeId || isHindiMode || useFallback || isLoadingData || isFetchingEpisodeData) return;
    const requestFailed = streamRequestFailed;
    if (!requestFailed) {
      resolutionRetriesRef.current[activeEpisodeId] = 0;
      return;
    }
    if (resolutionRetryInFlightRef.current === activeEpisodeId) return;

    // Retry the currently selected route twice before marking it unavailable
    // or moving servers. Keep the route selected during each request attempt.
    const attempts = resolutionRetriesRef.current[activeEpisodeId] || 0;
    if (attempts < 2) {
      const attempt = attempts + 1;
      resolutionRetriesRef.current[activeEpisodeId] = attempt;
      resolutionRetryInFlightRef.current = activeEpisodeId;
      setRetryingResolution({ episodeId: activeEpisodeId, attempt });
      const retryEpisode = activeEpisodeId;
      const release = () => {
        if (resolutionRetryInFlightRef.current !== retryEpisode) return;
        resolutionRetryInFlightRef.current = null;
        if (resolutionRetryReleaseTimerRef.current !== null) {
          window.clearTimeout(resolutionRetryReleaseTimerRef.current);
          resolutionRetryReleaseTimerRef.current = null;
        }
        setRetryingResolution((current) =>
          current?.episodeId === retryEpisode ? null : current,
        );
      };
      const timer = window.setTimeout(() => {
        void retryEpisodeData().finally(release);
        // A stalled request must not lock recovery forever; allow the timeout
        // watchdog to make the next decision even if the upstream never settles.
        resolutionRetryReleaseTimerRef.current = window.setTimeout(release, 12000);
      }, 350);
      return () => window.clearTimeout(timer);
    }

    resolutionRetriesRef.current[activeEpisodeId] = 0;
    resolutionRetryInFlightRef.current = null;
    setRetryingResolution((current) =>
      current?.episodeId === activeEpisodeId ? null : current,
    );

    // After two attempts, advance from Auto to MegaPlay or to the next
    // configured provider for a manual selection.
    if (isLocalBackendEnabled() && activeEpisodeId.startsWith("watch/auto/")) {
      setUseFallback(true);
      return;
    }

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
    isEpisodeDataError, isEpisodesLoading, isHindiMode, isLoadingData, isFetchingEpisodeData,
    retryEpisodeData, streamRequestFailed, useFallback, hasManualProviderSelection,
  ]);
  // A provider can hang without ever returning an HTTP/stream error. Treat the
  // 15-second timeout like a failure: retry the same route twice, then switch.
  useEffect(() => {
    if (!streamResolutionTimedOut || !isLoadingData || isHindiMode || useFallback || !activeEpisodeId) return;
    if (resolutionRetryInFlightRef.current === activeEpisodeId) return;

    const attempts = resolutionRetriesRef.current[activeEpisodeId] || 0;
    if (attempts >= 2) {
      resolutionRetriesRef.current[activeEpisodeId] = 0;
      resolutionRetryInFlightRef.current = null;
      setRetryingResolution(null);
      if (isLocalBackendEnabled() && activeEpisodeId.startsWith("watch/auto/")) {
        setUseFallback(true);
      } else {
        advanceAfterSourceFailure();
      }
      return;
    }

    const attempt = attempts + 1;
    const retryEpisode = activeEpisodeId;
    resolutionRetriesRef.current[retryEpisode] = attempt;
    resolutionRetryInFlightRef.current = retryEpisode;
    setRetryingResolution({ episodeId: retryEpisode, attempt });
    setStreamResolutionTimedOut(false);
    setStreamRetryKey((previous) => previous + 1);

    const release = () => {
      if (resolutionRetryInFlightRef.current !== retryEpisode) return;
      resolutionRetryInFlightRef.current = null;
      if (resolutionRetryReleaseTimerRef.current !== null) {
        window.clearTimeout(resolutionRetryReleaseTimerRef.current);
        resolutionRetryReleaseTimerRef.current = null;
      }
      setRetryingResolution((current) =>
        current?.episodeId === retryEpisode ? null : current,
      );
    };

    void retryEpisodeData().finally(release);
    resolutionRetryReleaseTimerRef.current = window.setTimeout(release, 12000);
    // Intentionally no effect cleanup: turning off the timed-out UI immediately
    // must not cancel the in-flight recovery attempt's release guard.
  }, [
    streamResolutionTimedOut, isLoadingData, isHindiMode, useFallback, activeEpisodeId,
    advanceAfterSourceFailure, retryEpisodeData,
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

  const { data: localProviderStatus, isLoading: isLoadingProviderStatus } = useQuery<LocalProviderStatus>({
    queryKey: ["local-provider-status"],
    queryFn: async () => (await api.get<LocalProviderStatus>("/api/diagnostics/providers")).data,
    enabled: isLocalBackendEnabled(),
    staleTime: 1000 * 15,
    refetchInterval: isLocalBackendEnabled() ? 5000 : false,
    refetchOnWindowFocus: false,
    retry: 0,
  });

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
    localStorage.setItem("preferredAudio", cat);

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
      // Only accept progress emitted by the active embedded player frame.
      if (event.source !== externalEmbedFrameRef.current?.contentWindow) return;
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
        const progress = {
          animeId: animeIdParam || anime?.anime?.info?.id || "0",
          episodeId: activeEpisodeId,
          episodeNumber: Number(currentEpNumber) || 1,
          animeTitle: anime?.anime?.info?.name || "Anime",
          poster: anime?.anime?.info?.poster || "",
          current: currentTime,
          duration,
        };
        // Keep the freshest position in memory even when persisted updates are
        // throttled; flush it immediately before an automatic server switch.
        lastEmbedProgressRef.current = progress;
        lastEmbedSignalAtRef.current = Date.now();
        const now = Math.floor(currentTime);
        // Throttle updates every 10 seconds or on complete
        if (isComplete || Math.abs(now - lastSyncedTimeRef.current) >= 10) {
          lastSyncedTimeRef.current = now;

          if (isLocalBackendEnabled()) {
            saveLocalWatchProgress(progress);
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
      const latest = lastEmbedProgressRef.current;
      if (isLocalBackendEnabled() && latest?.episodeId === activeEpisodeId) {
        saveLocalWatchProgress(latest);
      }
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
    const resolvedCategory = isProviderSelectable(pName, category)
      ? category
      : isProviderSelectable(pName, "sub")
        ? "sub"
        : "dub";
    setPreferredCategory(resolvedCategory);
    const pData = rawProviders[pName]?.episodes?.[resolvedCategory] || [];
    const targetEp = pData.find((ep) => Number(ep.number) === currentEpNumber);
    // URL-only routes can play even when they do not contribute an episode
    // catalogue; the native adapter validates the requested episode on demand.
    const targetId = targetEp?.id || (isLocalBackendEnabled()
      ? `watch/${pName}/${animeIdParam}/${resolvedCategory}/${pName}-${currentEpNumber}`
      : "");
    if (targetId) {
      const retryCurrentServer = activeEpisodeId === targetId;
      flushLatestEmbedProgress();
      playbackRetriesRef.current = { key: `${targetId}|0`, count: 0 };
      resolutionRetriesRef.current[targetId] = 0;
      setRetryingPlayback(null);
      setRetryingResolution(null);
      attemptedSourceIdsRef.current.delete(targetId);
      setProviderPlaybackOutcomes((previous) => {
        if (!(pName in previous)) return previous;
        const updated = { ...previous };
        delete updated[pName];
        return updated;
      });
      setManualProviderPlaybackFailed(false);
      setPlaybackSourceIndex(0);
      setLastPlayerError(null);
      setStreamResolutionTimedOut(false);
      setSelectedEpisode(targetId);
      updateEpisodeUrl(targetId, currentEpNumber);
      if (retryCurrentServer) {
        setStreamRetryKey((previous) => previous + 1);
        void retryEpisodeData();
      }
    }
  };

  const cleanParts = activeEpisodeId.replace(/^\//, "").split("/");
  const currentProviderName = cleanParts[1] || providerNames[0] || "auto";
  const activeCategory = cleanParts[3] === "dub" ? "dub" : cleanParts[3] === "sub" ? "sub" : preferredCategory;
  const availableProviderNames = providerNames.filter(
    (providerName) => (rawProviders[providerName]?.episodes?.[activeCategory] || []).length > 0,
  );
  // For Android, show every provider module that actually imports successfully,
  // not only the providers whose episode catalogue happened to return a list.
  // Each button uses a strict per-provider request; unavailable sources show an
  // honest error instead of silently swapping to another server.
  const serverProviderNames = isLocalBackendEnabled()
    ? (localProviderStatus?.providers.filter((item) => item.moduleLoaded).map((item) => item.id) || availableProviderNames)
    : availableProviderNames;
  // Keep every loaded server visible. SUB-only sources (AnimeParadise and
  // NontonGo) remain discoverable while ENGLISH is selected and switch to SUB
  // when tapped; a failure changes the status tint, never removes the button.
  const selectableServerProviderNames = serverProviderNames;
  const failedServerProviderNames = selectableServerProviderNames.filter(
    (providerName) => providerPlaybackOutcomes[providerName] === "failed",
  );
  const visibleServerProviderNames = selectableServerProviderNames;

  useEffect(() => {
    if (!isLocalBackendEnabled() || !hasManualProviderSelection || isLoadingData) return;
    const failed = isEpisodeDataError || (!!episodeData && (
      !hasPlayableSources ||
      (!!episodeData.providerStatus && episodeData.providerStatus !== "ok")
    ));
    if (!failed || retryingResolution?.episodeId === activeEpisodeId) return;

    const providerName = episodeData?.provider || currentProviderName;
    if (!providerName || providerName === "auto") return;
    setProviderPlaybackOutcomes((previous) =>
      previous[providerName] === "failed"
        ? previous
        : { ...previous, [providerName]: "failed" },
    );
  }, [
    currentProviderName,
    episodeData,
    hasManualProviderSelection,
    hasPlayableSources,
    isEpisodeDataError,
    isLoadingData,
    retryingResolution,
    activeEpisodeId,
  ]);

  // An automatic provider race reports the outcomes of sources it actually
  // attempted. Apply those failures to this screen's scoped hide/retry state;
  // never infer per-episode failure from the backend's global failure counters.
  useEffect(() => {
    const timings = episodeData?.timings;
    if (!isLocalBackendEnabled() || !activeEpisodeId.startsWith("watch/auto/") || !timings) return;
    const failedProviders = Object.entries(timings)
      .filter(([, outcome]) => outcome && outcome.ok === false)
      .map(([providerName]) => providerName);
    if (!failedProviders.length || retryingResolution?.episodeId === activeEpisodeId) return;
    setProviderPlaybackOutcomes((previous) => {
      let changed = false;
      const next = { ...previous };
      for (const providerName of failedProviders) {
        if (next[providerName] !== "failed") {
          next[providerName] = "failed";
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [activeEpisodeId, episodeData?.timings, retryingResolution]);

  const selectedProviderIndex = visibleServerProviderNames.indexOf(currentProviderName);
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
  const actualProviderName = episodeData?.provider || "";
  const activeServerLabel = isAutomaticServerActive
    ? actualProviderName && actualProviderName !== "auto"
      ? `Auto → ${getProviderDisplayName(actualProviderName)}`
      : "Auto"
    : !useFallback && !isHindiMode && providerPlaybackOutcomes[currentProviderName] === "failed"
      ? `${getProviderDisplayName(currentProviderName)} unavailable`
      : activeServerNumber === 1
        ? "Server 1 — MegaPlay"
        : `Server ${activeServerNumber} — ${getProviderDisplayName(currentProviderName)}`;

  const selectFallbackServer = (category?: "sub" | "dub") => {
    flushLatestEmbedProgress();
    setRetryingPlayback(null);
    if (category) setPreferredCategory(category);
    setIsHindiMode(false);
    setStreamResolutionTimedOut(false);
    setUseFallback(true);
  };

  const retryStreamResolution = () => {
    setStreamResolutionTimedOut(false);
    setStreamRetryKey((previous) => previous + 1);
    void retryEpisodeData();
  };

  const selectHindiMode = () => {
    if (!hindiStreams.length) return;
    flushLatestEmbedProgress();
    setRetryingPlayback(null);
    setUseFallback(false);
    setSelectedHindiServer(0);
    setIsHindiMode(true);
  };

  const selectAutomaticServer = () => {
    flushLatestEmbedProgress();
    setRetryingPlayback(null);
    setIsHindiMode(false);
    setUseFallback(false);
    const targetId = `watch/auto/${animeIdParam}/${activeCategory}/episode-${currentEpNumber}`;
    attemptedSourceIdsRef.current.delete(targetId);
    setSelectedEpisode(targetId);
    updateEpisodeUrl(targetId, currentEpNumber);
  };

  const handlePlayerError = useCallback((detail?: string) => {
    const retryKey = `${activeEpisodeId}|${playbackSourceIndex}`;
    if (playbackRetriesRef.current.key !== retryKey) {
      playbackRetriesRef.current = { key: retryKey, count: 0 };
    }
    const providerKey = useFallback ? "megaplay" : episodeData?.provider || currentProviderName;

    // Persist the last known point before restarting the current player.
    flushLatestEmbedProgress();
    if (playbackRetriesRef.current.count < 2) {
      const attempt = playbackRetriesRef.current.count + 1;
      playbackRetriesRef.current.count = attempt;
      setRetryingPlayback({ episodeId: activeEpisodeId, attempt });
      if (providerKey && providerKey !== "auto") {
        setProviderPlaybackOutcomes((previous) => ({ ...previous, [providerKey]: "retrying" }));
      }
      setLastPlayerError(detail || null);
      setPlayerRetryKey((previous) => previous + 1);
      // Refresh short-lived direct media URLs while remounting the player frame.
      void retryEpisodeData();
      return;
    }

    setRetryingPlayback(null);
    // If this provider supplied alternate URLs, try those next. The current URL
    // itself has already received two recovery attempts.
    const nextSourceIndex = playbackSourceIndex + 1;
    if (episodeData?.sources?.[nextSourceIndex]?.url) {
      playbackRetriesRef.current = { key: `${activeEpisodeId}|${nextSourceIndex}`, count: 0 };
      setLastPlayerError(detail || null);
      setPlaybackSourceIndex(nextSourceIndex);
      setManualProviderPlaybackFailed(false);
      return;
    }

    setLastPlayerError(detail || null);
    if (providerKey && providerKey !== "auto") {
      setProviderPlaybackOutcomes((previous) => ({ ...previous, [providerKey]: "failed" }));
    }
    if (hasManualProviderSelection) {
      setManualProviderPlaybackFailed(true);
    }
    // Two retries failed: switch to the next configured server, keeping the same
    // anime/episode/audio selection and the latest saved position.
    advanceAfterSourceFailure();
  }, [
    activeEpisodeId, advanceAfterSourceFailure, currentProviderName,
    episodeData?.provider, episodeData?.sources, flushLatestEmbedProgress,
    hasManualProviderSelection, playbackSourceIndex, retryEpisodeData, useFallback,
  ]);

  const handlePlayerPlaybackReady = useCallback(() => {
    playbackRetriesRef.current = { key: `${activeEpisodeId}|${playbackSourceIndex}`, count: 0 };
    setRetryingPlayback(null);
    const providerKey = useFallback ? "megaplay" : episodeData?.provider || currentProviderName;
    if (providerKey && providerKey !== "auto") {
      setProviderPlaybackOutcomes((previous) => ({ ...previous, [providerKey]: "playing" }));
    }
  }, [activeEpisodeId, currentProviderName, episodeData?.provider, playbackSourceIndex, useFallback]);

  // Native WebView ad protection emits this event when it cancels a remote
  // JS dialog, popup window, remote permission request, or top-level redirect.
  // These are strong signals of a deceptive interstitial; switch servers rather
  // than leaving the viewer stuck on an empty "robot check" page.
  useEffect(() => {
    if (!isLocalBackendEnabled()) return;

    const handleBlockedPlayerAction = (event: Event) => {
      if (isHindiMode) return;
      const now = Date.now();
      if (now - blockedPlayerActionAtRef.current < 900) return;
      blockedPlayerActionAtRef.current = now;

      const detail = (event as CustomEvent<{ reason?: string; host?: string }>).detail || {};
      const reason = String(detail.reason || "blocked popup");
      const host = String(detail.host || "third-party player");
      const providerKey = useFallback || isFallbackActive ? "megaplay" : currentProviderName;

      // Blocked popups, JS dialogs and top-level redirects are recovery signals,
      // not a reason to skip the retry sequence. Remount the current frame twice;
      // repeated interruption then advances to another configured server.
      handlePlayerError(`Blocked ${reason} from ${host}; reconnecting to the current server.`);
    };

    window.addEventListener("7xanime:blocked-player-action", handleBlockedPlayerAction);
    return () => window.removeEventListener("7xanime:blocked-player-action", handleBlockedPlayerAction);
  }, [
    activeEpisodeId,
    advanceAfterSourceFailure,
    automaticCandidates,
    currentEpNumber,
    currentProviderName,
    handlePlayerError,
    isFallbackActive,
    isHindiMode,
    isLocalBackendEnabled,
    useFallback,
  ]);

  // Trust player events only from the active iframe and its configured provider origin.
  const observedEmbedProvider = (useFallback ? "megaplay" : episodeData?.provider || currentProviderName || "").toLowerCase();
  const observedEmbedSource = useFallback ? { type: "embed", url: "" } : episodeData?.sources?.[playbackSourceIndex];
  useEffect(() => {
    if (!isLocalBackendEnabled() || (!useFallback && observedEmbedSource?.type !== "embed")) return;

    const expectedHosts: Record<string, string> = {
      megaplay: "megaplay.buzz",
      anixo: "anixo.buzz",
      megavid: "megavid.buzz",
      megaflix: "megaflix.buzz",
      tryembed: "tryembed.us.cc",
      cinexstream: "cinextream.cc",
      nontongo: "nontongo.win",
    };
    const expectedHost = expectedHosts[observedEmbedProvider];
    if (!expectedHost) return;
    const handleEmbedMessage = (event: MessageEvent) => {
      if (event.source !== externalEmbedFrameRef.current?.contentWindow) return;

      let raw = event.data;
      if (typeof raw === "string") {
        try { raw = JSON.parse(raw); } catch { return; }
      }
      if (!raw || typeof raw !== "object") return;

      let hostname = "";
      try { hostname = new URL(event.origin).hostname.toLowerCase(); } catch { return; }
      if (hostname !== expectedHost && !hostname.endsWith(`.${expectedHost}`)) return;

      const payload = raw as Record<string, unknown>;
      const eventType = String(payload.event || payload.type || payload.action || "").toLowerCase();
      const status = String(payload.status || "").toLowerCase();
      const failed = eventType.includes("error") || status === "error";
      if (failed) {
        handlePlayerError(`${getProviderDisplayName(observedEmbedProvider)} reported a playback error.`);
        return;
      }

      const playbackObserved =
        ["aniembed:play", "aniembed:ended"].includes(String(payload.type || "").toLowerCase()) ||
        ["play", "playing", "time", "progress", "timeupdate", "watching-log", "complete"].includes(eventType);
      if (playbackObserved) {
        lastEmbedSignalAtRef.current = Date.now();
        playbackRetriesRef.current = { key: `${activeEpisodeId}|${playbackSourceIndex}`, count: 0 };
        setRetryingPlayback(null);
        setProviderPlaybackOutcomes((previous) =>
          previous[observedEmbedProvider] === "playing"
            ? previous
            : { ...previous, [observedEmbedProvider]: "playing" },
        );
      }
    };

    window.addEventListener("message", handleEmbedMessage);
    return () => window.removeEventListener("message", handleEmbedMessage);
  }, [
    observedEmbedProvider,
    observedEmbedSource?.type,
    observedEmbedSource?.url,
    handlePlayerError,
    useFallback,
  ]);

  // Known event-reporting iframe players (MegaPlay, AniXo, Megavid, MegaFlix)
  // should emit playback/progress signals. If their page remains stuck on an
  // upstream error or interstitial and never reports progress, retry the same
  // iframe twice before switching providers. We cannot inspect/click inside a
  // cross-origin iframe, so this watchdog relies on its documented event API.
  useEffect(() => {
    const watchedProviders = ["megaplay", "anixo", "megavid", "megaflix"];
    if (
      !isLocalBackendEnabled() ||
      (!useFallback && observedEmbedSource?.type !== "embed") ||
      !watchedProviders.includes(observedEmbedProvider)
    ) return;

    embedLoadStartedAtRef.current = Date.now();
    lastEmbedSignalAtRef.current = 0;
    const interval = window.setInterval(() => {
      const lastSignal = Math.max(embedLoadStartedAtRef.current, lastEmbedSignalAtRef.current);
      if (Date.now() - lastSignal < 18000) return;
      // Reset the baseline before calling into React so rapid repeated timer
      // ticks cannot consume both retries for the same stalled frame.
      embedLoadStartedAtRef.current = Date.now();
      handlePlayerError(`${getProviderDisplayName(observedEmbedProvider)} stopped reporting playback; retrying this player.`);
    }, 2500);

    return () => window.clearInterval(interval);
  }, [
    activeEpisodeId, playbackSourceIndex, playerRetryKey,
    observedEmbedProvider, observedEmbedSource?.type, observedEmbedSource?.url,
    useFallback, handlePlayerError,
  ]);

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
          <Button size="sm" variant="ghost" disabled={nativeCatalogueComplete && !hasSub} onClick={() => handleCategoryChange("sub")} className={`h-8 rounded-lg px-3 text-xs font-bold transition ${!isHindiMode && activeCategory === "sub" ? "bg-[#ff3b72] text-white hover:bg-[#ff56ad]" : "text-zinc-400 hover:text-white"}`}>
            <Captions className="mr-1.5 h-3.5 w-3.5" /> SUB
          </Button>
          <Button size="sm" variant="ghost" disabled={nativeCatalogueComplete && !hasDub} onClick={() => handleCategoryChange("dub")} className={`h-8 rounded-lg px-3 text-xs font-bold transition ${!isHindiMode && activeCategory === "dub" ? "bg-[#ff3b72] text-white hover:bg-[#ff56ad]" : "text-zinc-400 hover:text-white"}`}>
            <Mic className="mr-1.5 h-3.5 w-3.5" /> ENGLISH
          </Button>
          {hindiStreams.length > 0 && (
            <Button size="sm" variant="ghost" onClick={selectHindiMode} className={`h-8 rounded-lg px-3 text-xs font-bold transition ${isHindiMode ? "bg-[#ff3b72] text-white hover:bg-[#ff56ad]" : "text-zinc-400 hover:text-white"}`}>
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
            <Button key={stream.embed} size="sm" title={`Server ${index + 1} — Hindi dub — ${stream.host}`} aria-label={`Server ${index + 1} — Hindi dub — ${stream.host}`} onClick={() => setSelectedHindiServer(index)} className={`h-9 min-w-9 rounded-xl px-3 text-xs font-extrabold transition ${activeServerNumber === index + 1 ? "bg-[#ff3b72] text-white" : "border border-white/[0.08] bg-white/[0.035] text-zinc-300 hover:border-[#ff3b72]/30 hover:bg-[#ff3b72]/10"}`}>{index + 1}</Button>
          ))
        ) : (
          <>
            <Button size="sm" title="Server 1 — MegaPlay" aria-label="Server 1 — MegaPlay" onClick={() => selectFallbackServer()} className={`h-10 min-w-12 rounded-xl px-2.5 text-xs font-extrabold transition ${activeServerNumber === 1 && (useFallback || isFallbackActive) ? "bg-[#ff3b72] text-white" : "border border-white/[0.08] bg-white/[0.035] text-zinc-300 hover:border-[#ff3b72]/30 hover:bg-[#ff3b72]/10"}`}>
              <span className="flex flex-col items-center gap-0.5 leading-none"><span>1</span><span className="text-[8px] font-semibold opacity-80">MegaPlay</span></span>
            </Button>
            {visibleServerProviderNames.map((providerName, index) => {
              const supportsAudio = isProviderSelectable(providerName, activeCategory);
              const failed = providerPlaybackOutcomes[providerName] === "failed";
              const serverName = getProviderDisplayName(providerName);
              return (
                <Button
                  key={`${activeCategory}-${providerName}`}
                  size="sm"
                  title={supportsAudio ? getServerProviderTitle(visibleServerProviderNames, providerName) : `${serverName} supports SUB only; tap to switch audio`}
                  aria-label={supportsAudio ? getServerProviderTitle(visibleServerProviderNames, providerName) : `${serverName}, SUB only; tap to switch audio`}
                  onClick={() => handleProviderSelect(providerName, activeCategory)}
                  className={`h-10 min-w-12 rounded-xl px-2.5 text-xs font-extrabold transition ${currentProviderName === providerName && !useFallback && !isHindiMode ? "bg-[#ff3b72] text-white" : failed ? "border border-rose-400/35 bg-rose-400/[0.06] text-zinc-300 hover:border-rose-300/60" : "border border-white/[0.08] bg-white/[0.035] text-zinc-300 hover:border-[#ff3b72]/30 hover:bg-[#ff3b72]/10"}`}
                >
                  <span className="flex flex-col items-center gap-0.5 leading-none">
                    <span>{index + 2}</span>
                    <span className="text-[8px] font-semibold opacity-80">{serverName}</span>
                    {!supportsAudio && <span className="text-[7px] font-bold text-amber-300">SUB only</span>}
                    {providerPlaybackOutcomes[providerName] === "retrying" && <span className="text-[7px] font-bold text-amber-200">Retrying</span>}
                    {failed && <span className="text-[7px] font-bold text-rose-300">Failed</span>}
                  </span>
                </Button>
              );
            })}
            {retryingPlayback?.episodeId === activeEpisodeId && (
              <span className="self-center px-1 text-[10px] text-amber-200" role="status" aria-live="polite">
                Reconnecting to current server · attempt {retryingPlayback.attempt}/2…
              </span>
            )}
            {retryingResolution?.episodeId === activeEpisodeId && (
              <span className="self-center px-1 text-[10px] text-amber-200" role="status" aria-live="polite">
                Retrying server response · attempt {retryingResolution.attempt}/2…
              </span>
            )}
            {failedServerProviderNames.length > 0 && (
              <span className="self-center px-1 text-[10px] text-zinc-500" role="status">
                Automatically skipped {failedServerProviderNames.length} failed server{failedServerProviderNames.length === 1 ? "" : "s"}; tap a server to test it again.
              </span>
            )}
            {isLocalBackendEnabled() && !nativeCatalogueComplete && availableProviderNames.length === 0 && (
              <span className="px-2 text-xs text-zinc-500" role="status">Finding servers…</span>
            )}
          </>
        )}
      </div>
      {isLocalBackendEnabled() && (
        <details className="border-t border-white/[0.06] pt-3 text-xs text-zinc-400">
          <summary className="cursor-pointer select-none font-semibold text-zinc-300">
            Provider diagnostics {localProviderStatus ? `· ${localProviderStatus.loadedCount}/${localProviderStatus.providerCount} modules loaded` : isLoadingProviderStatus ? "· checking…" : ""}
          </summary>
          <p className="mt-2 leading-5 text-zinc-500">
            Loaded means the provider module is present, not that every anime has a playable stream. “URL returned” is not playback proof; AniXo and Megavid need trusted player events, while AnimeParadise needs successful HLS playback.
          </p>
          <div className="mt-2 max-h-52 space-y-1.5 overflow-y-auto pr-1">
            {(localProviderStatus?.providers || []).map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.025] px-2.5 py-2">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-semibold text-zinc-300">{getProviderDisplayName(item.id)}</span>
                  {isProviderDiagnosticForSelection(item, animeIdParam, currentEpNumber, activeCategory) && item.lastError && <span title={item.lastError} className="break-words text-[10px] leading-4 text-rose-300/90">{item.lastError}</span>}
                </span>
                <span className="shrink-0 text-right">
                  <span className={
                    providerPlaybackOutcomes[item.id] === "playing"
                      ? "text-emerald-300"
                      : providerPlaybackOutcomes[item.id] === "failed"
                        ? "text-rose-300"
                        : !isProviderDiagnosticForSelection(item, animeIdParam, currentEpNumber, activeCategory)
                          ? "text-zinc-500"
                          : item.status === "recent_attempts_failed" || item.status === "module_unavailable"
                            ? "text-rose-300"
                            : item.status === "recent_attempt_succeeded" ? "text-sky-300" : "text-zinc-500"
                  }>
                    {providerPlaybackOutcomes[item.id] === "playing"
                      ? "Playback OK"
                      : providerPlaybackOutcomes[item.id] === "failed"
                        ? "Playback failed"
                        : item.status === "module_unavailable"
                          ? "Module missing"
                          : !isProviderDiagnosticForSelection(item, animeIdParam, currentEpNumber, activeCategory)
                            ? "Not tested for this episode"
                          : item.status === "not_tested_yet"
                            ? "Not tested"
                            : item.status === "recent_attempts_failed"
                              ? item.lastOutcome === "timeout"
                                ? "Request timed out"
                                : item.lastOutcome === "no_sources"
                                  ? "No sources returned"
                                  : item.lastOutcome === "unsupported_format"
                                    ? "Unsupported format"
                                    : item.lastError
                                      ? "Request error"
                                      : "Stream request failed"
                              : item.status === "recent_attempt_succeeded"
                                ? (item.id === "anixo" || item.id === "megavid")
                                  ? "Embed URL returned — playback unverified"
                                  : "Stream found"
                                : "Not tested"}
                  </span>
                  {typeof item.averageSeconds === "number" && <span className="ml-2 tabular-nums text-zinc-500">{item.averageSeconds.toFixed(1)}s avg</span>}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
  const playerHeader = (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/[0.07] bg-[#101018] px-3 py-3 sm:px-4">
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("7xanime:navigate-back"))}
        aria-label="Back to previous page"
        title="Back"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-200 transition hover:border-[#ff3b72]/40 hover:bg-[#ff3b72]/10 hover:text-white"
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
        className="shrink-0 rounded-lg px-2 py-2 text-xs font-semibold text-[#ff70bd] transition hover:bg-[#ff3b72]/10 sm:px-3"
      >
        Episodes
      </Link>
    </div>
  );

  if (isHindiMode && isLoadingHindi) {
    return (
      <div className="space-y-3">
        {playerHeader}
        <div role="status" aria-live="polite" className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-2xl border border-[#4b1727] bg-white text-sm text-[#716b87] dark:border-[#302c40] dark:bg-[#14121c] dark:text-zinc-400">
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-[#ff3b72]/25 border-t-[#ff3b72]" />
          <span>Finding Hindi dub for episode {currentEpNumber}…</span>
        </div>
        <p className="text-xs text-[#d49aaf] dark:text-zinc-500">Hindi sources come from a community-maintained catalogue, so some anime or episodes may be missing.</p>
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
          <PlayerViewport title="Hindi video player">
            <iframe
              key={selectedHindi.embed}
              src={selectedHindi.embed}
              title={`${hindiDubData?.matchedTitle || anime?.anime?.info?.name || "Anime"} episode ${currentEpNumber} Hindi dub via ${selectedHindi.host}`}
              width="100%"
              height="100%"
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
              allowFullScreen
              sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
              referrerPolicy="strict-origin-when-cross-origin"
              className="absolute inset-0 h-full w-full border-0"
            />
          </PlayerViewport>
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

  if (!activeEpisodeId || (!useFallback && isLoadingData && !streamRequestFailed && !streamResolutionTimedOut)) {
    return (
      <div className="space-y-3">
        {playerHeader}
        <div
          role="status"
          aria-live="polite"
          className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.035] text-sm text-zinc-400"
        >
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-rose-400/25 border-t-rose-300" />
          <span>{retryingResolution?.episodeId === activeEpisodeId
            ? `Retrying server response · attempt ${retryingResolution.attempt}/2…`
            : activeEpisodeId ? "Finding a playable stream…" : "Preparing episode…"}</span>
        </div>
        {playerControls}
      </div>
    );
  }

  if (streamResolutionTimedOut && isLoadingData && !useFallback && !isHindiMode) {
    return (
      <div className="space-y-3">
        {playerHeader}
        <Alert className="rounded-2xl border-amber-300/15 bg-amber-300/[0.04] text-zinc-200">
          <AlertCircle className="h-4 w-4 text-amber-300" />
          <AlertTitle className="font-bold">This server is taking too long</AlertTitle>
          <AlertDescription className="mt-1 flex flex-col gap-3 text-sm text-zinc-400">
            The stream request has not returned a playable source yet. You can retry this server or open MegaPlay now; there is no need to wait for the request to finish.
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => selectFallbackServer()}>Open Server 1 · MegaPlay</Button>
              <Button size="sm" variant="secondary" onClick={retryStreamResolution}>Retry this server</Button>
            </div>
          </AlertDescription>
        </Alert>
        {playerControls}
      </div>
    );
  }

  // Never mount ArtPlayer with an undefined or empty stream response. That
  // transient render happens before useEffect can switch to the fallback player
  // and can crash the entire Next route on slower Android devices.
  if (retryingResolution?.episodeId === activeEpisodeId) {
    return (
      <div className="space-y-3">
        {playerHeader}
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.035] text-sm text-zinc-300" role="status" aria-live="polite">
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-rose-400/25 border-t-rose-300" />
          <span>Reconnecting to {getProviderDisplayName(currentProviderName)} · attempt {retryingResolution.attempt}/2…</span>
          <span className="text-xs text-zinc-500">Keeping the same episode and server while we retry.</span>
        </div>
        {playerControls}
      </div>
    );
  }

  if (hasManualProviderSelection && !useFallback && (streamRequestFailed || manualProviderPlaybackFailed)) {
    const failedProvider = episodeData?.provider || currentProviderName;
    return (
      <div className="space-y-3">
        {playerHeader}
        <Alert className="rounded-2xl border-amber-300/15 bg-amber-300/[0.04] text-zinc-200">
          <AlertCircle className="h-4 w-4 text-amber-300" />
          <AlertTitle className="font-bold">{getProviderDisplayName(failedProvider)} could not play this episode</AlertTitle>
          <AlertDescription className="mt-1 flex flex-col gap-3 text-sm text-zinc-400">
            {episodeData?.providerError || (manualProviderPlaybackFailed
              ? `Playback failed: ${lastPlayerError || "the provider returned a stream that the player could not play."}`
              : "This provider returned no playable stream for this episode. It has not been silently replaced with another provider.")}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={selectAutomaticServer}>Try Auto</Button>
              <Button size="sm" onClick={() => selectFallbackServer()}>Try Server 1 · MegaPlay</Button>
            </div>
            <span className="text-xs text-zinc-500">Or tap a differently named provider below to test that server directly.</span>
          </AlertDescription>
        </Alert>
        {playerControls}
      </div>
    );
  }

  if (isFallbackActive || (streamRequestFailed && !hasManualProviderSelection)) {
    const fallbackAnimeId = animeIdParam || anime?.anime?.info?.id || "1";
    const fallbackEpId = currentEpNumber || "1";
    const fallbackSrc = `https://megaplay.buzz/stream/ani/${fallbackAnimeId}/${fallbackEpId}/${activeCategory}`;
    return (
      <div className="flex w-full flex-col gap-3">
        {playerHeader}
        <PlayerViewport title="MegaPlay video player">
          <iframe
            ref={externalEmbedFrameRef}
            key={`${fallbackAnimeId}-${fallbackEpId}-${activeCategory}:${playerRetryKey}`}
            src={`${fallbackSrc}?color=%23ff3b72&autoplay=true`}
            title={`${anime?.anime?.info?.name || "Anime"} episode ${currentEpNumber} via MegaPlay`}
            width="100%"
            height="100%"
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            allowFullScreen
            sandbox={isLocalBackendEnabled() ? undefined : "allow-scripts allow-same-origin allow-forms allow-presentation"}
            referrerPolicy="strict-origin-when-cross-origin"
            onError={() => handlePlayerError("MegaPlay embedded player failed to load.")}
            className="absolute inset-0 h-full w-full border-0"
          />
        </PlayerViewport>
        {playerControls}
      </div>
    );
  }

  const firstResolvedSource = episodeData?.sources?.[playbackSourceIndex];
  if (episodeData && firstResolvedSource?.type === "embed" && firstResolvedSource.url) {
    const embedProvider = episodeData.provider || currentProviderName;
    return (
      <div className="flex w-full flex-col gap-3">
        {playerHeader}
        <PlayerViewport title={`${getProviderDisplayName(embedProvider)} video player`}>
          <iframe
            ref={externalEmbedFrameRef}
            key={`${firstResolvedSource.url}:${playerRetryKey}`}
            src={firstResolvedSource.url}
            title={`${anime?.anime?.info?.name || "Anime"} episode ${currentEpNumber} via ${getProviderDisplayName(embedProvider)}`}
            width="100%"
            height="100%"
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            allowFullScreen
            sandbox={isLocalBackendEnabled() ? undefined : "allow-scripts allow-same-origin allow-forms allow-presentation"}
            referrerPolicy="strict-origin-when-cross-origin"
            onError={() => handlePlayerError("Embedded provider player failed to load.")}
            className="absolute inset-0 h-full w-full border-0"
          />
        </PlayerViewport>
        <p className="text-xs text-zinc-500">
          {`Embedded source: ${getProviderDisplayName(embedProvider)}. External top-level navigation is blocked by Android.`}
        </p>
        {playerControls}
      </div>
    );
  }

  if (!episodeData || !hasPlayableSources) {
    return (
      <div className="space-y-3">
        {playerHeader}
        <Alert className="rounded-2xl border-white/[0.08] bg-[#101018] text-zinc-200">
          <AlertCircle className="h-4 w-4 text-[#ff70bd]" />
          <AlertTitle className="font-bold">No playable stream was returned</AlertTitle>
          <AlertDescription className="mt-1 flex flex-col gap-3 text-sm text-zinc-400">
            This provider did not return a usable video URL. Try the alternate player or another server.
            <Button size="sm" variant="secondary" onClick={() => selectFallbackServer()}>Try Server 1</Button>
          </AlertDescription>
        </Alert>
        {playerControls}
      </div>
    );
  }

  const selectedPlaybackSource = episodeData.sources[playbackSourceIndex];
  if (!selectedPlaybackSource?.url) {
    return (
      <div className="space-y-3">
        {playerHeader}
        <Alert className="rounded-2xl border-white/[0.08] bg-[#101018] text-zinc-200">
          <AlertCircle className="h-4 w-4 text-[#ff70bd]" />
          <AlertTitle className="font-bold">No more streams from this provider</AlertTitle>
          <AlertDescription className="mt-1 text-sm text-zinc-400">
            Try Auto or select another server.
          </AlertDescription>
        </Alert>
        {playerControls}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {playerHeader}
      <PlayerViewport title="7xAnime video player">
        <VideoPlayer
          key={`${selectedPlaybackSource.url}:${playerRetryKey}`}
          className="!h-full !min-h-0 !max-h-none !aspect-auto"
          episodeInfo={{ ...episodeData, sources: [selectedPlaybackSource] }}
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
          onError={handlePlayerError}
          onPlaybackReady={handlePlayerPlaybackReady}
        />
      </PlayerViewport>
      {playerControls}
    </div>
  );
};

export default VideoPlayerSection;
