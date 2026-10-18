"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { useAnimeStore } from "@/store/anime-store";
import dynamic from "next/dynamic";

const VideoPlayer = dynamic(() => import("@/components/video-player"), {
  ssr: false,
});
const AnimeEpisodes = dynamic(() => import("@/components/anime-episodes"), {
  ssr: false,
  loading: () => <div role="status" className="py-8 text-center text-sm text-zinc-500">Loading episodes…</div>,
});
import { useGetEpisodeData } from "@/query/get-episode-data";
import { useQuery } from "react-query";
import { getHindiDubStreams } from "@/lib/hindi-dub";
import { ArrowLeft, Captions, Mic, AlertCircle, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import Image from "next/image";
import AnimeCard from "@/components/anime-card";
import { ROUTES } from "@/constants/routes";
import parse from "html-react-parser";
import Link from "next/link";
import { getProviderDisplayName, getServerProviderTitle, isProviderSelectable, ACTIVE_EMBED_PROVIDER_ORDER } from "@/lib/server-map";
import { Switch } from "@/components/ui/switch";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PlayerViewport } from "@/components/player-viewport";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { useGetAllEpisodes } from "@/query/get-all-episodes";
import { useGetAnimeDetails } from "@/query/get-anime-details";

import useBookMarks from "@/hooks/use-get-bookmark";
import { api, isLocalBackendEnabled } from "@/lib/api";
import { getLocalWatchProgress, saveLocalWatchProgress } from "@/lib/local-watch-progress";

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

// Cross-origin providers differ in the seek API they expose. Ask the common
// player-message protocols for a seek, without reading or modifying their page.
// Providers with no remote seek API ignore these messages; direct media playback
// uses ArtPlayer's native seek/resume path instead.
const PLAYER_JS_VERSION = "0.0.11";

// Embed providers do not share one control protocol. Keep commands conservative
// (pause/seek/state only) and send common object and JSON envelopes; unsupported
// protocols are ignored by the provider.
const requestExternalPlayerSeek = (frame: HTMLIFrameElement, seconds: number) => {
  const target = frame.contentWindow;
  if (!target || !Number.isFinite(seconds) || seconds < 1) return;
  const time = Math.max(0, Math.floor(seconds));
  const objectCommands = [
    { event: "seek", time, currentTime: time },
    { type: "seek", time, currentTime: time },
    { action: "seek", time, currentTime: time },
    { event: "command", func: "seekTo", args: [time, true] },
    { func: "seekTo", args: [time, true] },
    { method: "seekTo", value: time },
  ];
  for (const command of objectCommands) {
    try { target.postMessage(command, "*"); } catch { /* provider ignored */ }
  }

  const protocolCommands = [
    { context: "player.js", version: PLAYER_JS_VERSION, method: "setCurrentTime", value: time, listener: "7xanime-resume-seek" },
    { eventName: "postmessage:do:seek", data: { position: time } },
    { method: "seek", params: { time, position: time } },
  ];
  for (const command of protocolCommands) {
    try { target.postMessage(JSON.stringify(command), "*"); } catch { /* provider ignored */ }
  }
};

// Third-party embeds have no universal pause API. Try the existing generic
// commands plus the common Player.js, eventName, and method/params protocols.
const requestExternalPlayerPause = (frame: HTMLIFrameElement) => {
  const target = frame.contentWindow;
  if (!target) return;
  const objectCommands = [
    { event: "pause" },
    { type: "pause" },
    { action: "pause" },
    { method: "pause" },
    { command: "pause" },
    { event: "command", func: "pauseVideo", args: [] },
    { func: "pauseVideo", args: [] },
  ];
  for (const command of objectCommands) {
    try { target.postMessage(command, "*"); } catch { /* provider ignored */ }
  }

  const protocolCommands = [
    { context: "player.js", version: PLAYER_JS_VERSION, method: "pause" },
    { eventName: "postmessage:do:pause" },
    { method: "pause", params: {} },
  ];
  for (const command of protocolCommands) {
    try { target.postMessage(JSON.stringify(command), "*"); } catch { /* provider ignored */ }
  }
  try { target.postMessage("pause", "*"); } catch { /* provider ignored */ }
};

// Resume commands are best-effort because cross-origin providers expose different
// APIs. The iframe is deliberately kept mounted across app background/foreground.
const requestExternalPlayerPlay = (frame: HTMLIFrameElement) => {
  const target = frame.contentWindow;
  if (!target) return;
  const objectCommands = [
    { event: "play" },
    { type: "play" },
    { action: "play" },
    { method: "play" },
    { command: "play" },
    { event: "command", func: "playVideo", args: [] },
    { func: "playVideo", args: [] },
  ];
  for (const command of objectCommands) {
    try { target.postMessage(command, "*"); } catch { /* provider ignored */ }
  }
  const protocolCommands = [
    { context: "player.js", version: PLAYER_JS_VERSION, method: "play" },
    { eventName: "postmessage:do:play" },
    { method: "play", params: {} },
  ];
  for (const command of protocolCommands) {
    try { target.postMessage(JSON.stringify(command), "*"); } catch { /* provider ignored */ }
  }
  try { target.postMessage("play", "*"); } catch { /* provider ignored */ }
};

// Query common state APIs so a silent pause is not mistaken for a stalled
// stream. This is best-effort: many third-party embeds expose events only.
const requestExternalPlayerState = (frame: HTMLIFrameElement) => {
  const target = frame.contentWindow;
  if (!target) return;
  const objectCommands = [
    { event: "getPaused" },
    { type: "getPaused" },
    { action: "getPaused" },
    { method: "getPaused", params: {} },
  ];
  for (const command of objectCommands) {
    try { target.postMessage(command, "*"); } catch { /* provider ignored */ }
  }

  const protocolCommands = [
    { context: "player.js", version: PLAYER_JS_VERSION, method: "getPaused", listener: "7xanime-paused-state" },
    { eventName: "postmessage:get:isplaying" },
  ];
  for (const command of protocolCommands) {
    try { target.postMessage(JSON.stringify(command), "*"); } catch { /* provider ignored */ }
  }
};

const VideoPlayerSection = ({ isWatchRoute }: { isWatchRoute: boolean }) => {
  const searchParams = useSearchParams();
  const liveAnimeIdParam = searchParams.get("anime") || "";
  const liveEpParam = searchParams.get("ep");
  const liveEpisodeIdParam = searchParams.get("episode") || "";
  const lastWatchParamsRef = useRef<{
    animeId: string;
    episode: string | null;
    episodeId: string;
  } | null>(null);

  if (isWatchRoute) {
    lastWatchParamsRef.current = {
      animeId: liveAnimeIdParam,
      episode: liveEpParam,
      episodeId: liveEpisodeIdParam,
    };
  }
  const lastWatchParams = lastWatchParamsRef.current;
  const animeIdParam = isWatchRoute ? liveAnimeIdParam : lastWatchParams?.animeId || "";
  const epParam = isWatchRoute ? liveEpParam : lastWatchParams?.episode ?? null;
  const episodeIdParam = isWatchRoute ? liveEpisodeIdParam : lastWatchParams?.episodeId || "";
  const { selectedEpisode, setSelectedEpisode, anime: storeAnime } = useAnimeStore();
  const { data: fetchedAnimeDetails } = useGetAnimeDetails(animeIdParam);
  const [showFullAnimeDetails, setShowFullAnimeDetails] = useState(false);
  const storedDetailsMatch = storeAnime?.anime?.info?.id === animeIdParam ||
    Number(storeAnime?.anime?.info?.anilistId) === Number(animeIdParam);
  const metadataCandidate = storedDetailsMatch ? storeAnime : fetchedAnimeDetails ?? storeAnime;
  const watchAnimeRef = useRef(metadataCandidate ?? storeAnime);
  if (isWatchRoute && metadataCandidate?.anime?.info?.id) {
    watchAnimeRef.current = metadataCandidate;
  }
  // Keep playing metadata frozen while browsing elsewhere, but fetch it when a
  // watch URL is opened directly and the shared store has no matching anime.
  const anime = isWatchRoute
    ? metadataCandidate ?? storeAnime
    : watchAnimeRef.current ?? metadataCandidate ?? storeAnime;
  const watchNextRecommendations = useMemo(() => {
    const candidates = [...(anime?.recommendedAnimes ?? []), ...(anime?.relatedAnimes ?? [])];
    const seen = new Set<string>();
    return candidates.filter((item) => {
      const id = String(item.id || "");
      if (!id || id === String(animeIdParam) || seen.has(id) || !item.poster) return false;
      seen.add(id);
      return true;
    }).slice(0, 12);
  }, [anime?.recommendedAnimes, anime?.relatedAnimes, animeIdParam]);

  const { data: allEpisodesData, isLoading: isEpisodesLoading } = useGetAllEpisodes(animeIdParam);
  const [preferredCategory, setPreferredCategory] = useState<"sub" | "dub">("dub");

  useEffect(() => {
    const savedAudio = localStorage.getItem("preferredAudio");
    if (savedAudio === "sub" || savedAudio === "dub") {
      setPreferredCategory(savedAudio);
    }
  }, []);

  useEffect(() => {
    if (!isLocalBackendEnabled()) return;

    let disposed = false;
    let appListener: { remove: () => Promise<void> } | null = null;

    const clearLifecycleResumeTimers = () => {
      lifecycleResumeTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      lifecycleResumeTimersRef.current = [];
    };
    const onPipMode = (event: Event) => {
      const detail = (event as CustomEvent<{ active?: boolean }>).detail;
      setNativePipActive(detail?.active === true);
    };
    window.addEventListener("7xanime:pip-mode", onPipMode);

    void App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) {
        appIsActiveRef.current = true;
        // A known-playing and a known-paused embed need different recovery paths.
        // In particular, the pause event emitted by our background pause command
        // must not become a permanent user-pause flag after the app returns.
        const snapshot = backgroundPlaybackRef.current;
        const frame = externalEmbedFrameRef.current;
        clearLifecycleResumeTimers();

        if (frame && (snapshot.embedWasPlaying || snapshot.embedWasPaused)) {
          const resumeMode = snapshot.embedWasPlaying ? "playing" : "paused";
          const resumeStartedAt = Date.now();
          const sourceAtResume = frame.src;
          backgroundResumeModeRef.current = resumeMode;
          backgroundResumeStartedAtRef.current = resumeStartedAt;
          embedPlaybackStateRef.current = resumeMode;
          pauseAfterEmbedRecoveryRef.current = resumeMode === "paused";
          lastEmbedSignalAtRef.current = 0;
          lastEmbedProgressAtRef.current = 0;
          embedLoadStartedAtRef.current = resumeStartedAt;
          if (resumeMode === "playing") {
            embedHasObservedPlaybackRef.current = true;
            requestExternalPlayerPlay(frame);
          } else {
            requestExternalPlayerPause(frame);
          }

          // Some providers ignore the first postMessage after WebView resume.
          // Retry state/play-or-pause commands briefly while keeping the same
          // iframe mounted; only rebuild it if it never responds at all.
          for (const delay of [400, 1100, 2200]) {
            const timer = window.setTimeout(() => {
              if (externalEmbedFrameRef.current !== frame ||
                  frame.src !== sourceAtResume ||
                  !appIsActiveRef.current ||
                  backgroundResumeStartedAtRef.current !== resumeStartedAt) return;
              if (backgroundResumeModeRef.current === "playing") {
                requestExternalPlayerPlay(frame);
              } else if (backgroundResumeModeRef.current === "paused") {
                requestExternalPlayerPause(frame);
              }
              requestExternalPlayerState(frame);
            }, delay);
            lifecycleResumeTimersRef.current.push(timer);
          }

          const recoveryTimer = window.setTimeout(() => {
            if (externalEmbedFrameRef.current !== frame ||
                frame.src !== sourceAtResume ||
                !appIsActiveRef.current ||
                backgroundResumeStartedAtRef.current !== resumeStartedAt ||
                backgroundResumeModeRef.current !== resumeMode) return;
            // A provider that produces no state/progress response after foreground
            // was often left as a white iframe by Android. Recreate only that
            // unresponsive frame; requestEmbedResume restores its saved position
            // and the resume mode keeps a previously paused episode paused.
            setPlayerRetryKey((previous) => previous + 1);
          }, 4800);
          lifecycleResumeTimersRef.current.push(recoveryTimer);
        }

        snapshot.directVideos.forEach((video) => {
          if (!video.isConnected) return;
          void video.play().catch(() => {
            // Autoplay policy may require a manual tap after returning from background.
          });
        });
        backgroundPlaybackRef.current = {
          embedWasPlaying: false,
          embedWasPaused: false,
          directVideos: [],
        };
        setAppIsActive(true);
        return;
      }

      appIsActiveRef.current = false;
      clearLifecycleResumeTimers();
      const pipActive = document.documentElement.classList.contains("sevenx-pip-mode");
      setNativePipActive(pipActive);
      if (!pipActive) {
        const frame = externalEmbedFrameRef.current;
        // Save the freshest known position before Android suspends the WebView.
        const latestProgress = lastEmbedProgressRef.current;
        if (latestProgress) saveLocalWatchProgress(latestProgress);

        const embedWasPlaying = !!frame && embedPlaybackStateRef.current === "playing";
        const embedWasPaused = !!frame && embedPlaybackStateRef.current === "paused";
        backgroundPlaybackRef.current = { embedWasPlaying, embedWasPaused, directVideos: [] };
        backgroundResumeModeRef.current = embedWasPlaying
          ? "playing"
          : embedWasPaused
            ? "paused"
            : null;
        if (frame && embedWasPlaying) {
          // Record our own pause before asking the provider to pause.
          backgroundResumeStartedAtRef.current = Date.now();
          requestExternalPlayerPause(frame);
        }
        const directVideos = Array.from(document.querySelectorAll("video"))
          .filter((video) => !video.paused && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA);
        backgroundPlaybackRef.current.directVideos = directVideos;
        directVideos.forEach((video) => video.pause());
      } else {
        // Do not interfere with an explicitly active native Picture-in-picture session.
        backgroundResumeModeRef.current = null;
        backgroundPlaybackRef.current = {
          embedWasPlaying: false,
          embedWasPaused: false,
          directVideos: [],
        };
      }
      setAppIsActive(false);
    }).then((listener) => {
      if (disposed) void listener.remove();
      else appListener = listener;
    }).catch(() => {
      // The browser preview has no native App lifecycle listener.
    });

    return () => {
      disposed = true;
      clearLifecycleResumeTimers();
      window.removeEventListener("7xanime:pip-mode", onPipMode);
      if (appListener) void appListener.remove();
    };
  }, []);
  const requestedEpisodeNumber = Math.max(1, Number(epParam) || 1);

  const rawProviders = useMemo(
    () => allEpisodesData?.rawResponse?.providers || {},
    [allEpisodesData?.rawResponse?.providers],
  );
  const providerNames = useMemo(
    () => Object.keys(rawProviders).filter((name) => isProviderSelectable(name, preferredCategory)),
    [rawProviders],
  );

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

  // Android starts with the dedicated MegaPlay iframe. The six retained embed
  // providers are explicit alternatives, not an automatic extraction race.
  const localFallbackEpisodeId = isLocalBackendEnabled() && animeIdParam
    ? `watch/megaplay/${animeIdParam}/${preferredCategory}/episode-${requestedEpisodeNumber}`
    : "";
  const activeEpisodeId = episodeIdParam || localFallbackEpisodeId || preferredEpisodeId ||
    (epParam ? targetEpByNumber?.episodeId || "" : allEpisodesData?.episodes?.[0]?.episodeId || "");
  const hasManualProviderSelection =
    isLocalBackendEnabled() &&
    !!episodeIdParam &&
    !episodeIdParam.startsWith("watch/megaplay/");

  useEffect(() => {
    if (!isWatchRoute || typeof window === "undefined") return;
    const href = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.dispatchEvent(new CustomEvent("7xanime:watch-location", { detail: { href } }));
  }, [isWatchRoute, animeIdParam, epParam, episodeIdParam, activeEpisodeId]);

  // Only mirror an explicit episode ID from the URL into Zustand.
  // When a URL contains only ?ep=N, EpisodePlaylist owns the highlighted
  // selection while the player may use a temporary watch/megaplay URL. Syncing
  // that temporary URL back into the same store creates a feedback loop:
  // the player writes watch/megaplay/.../dub/episode-N, the playlist writes its
  // provider episode ID, and the two effects keep triggering each other
  // until React throws error #185 (maximum update depth exceeded).
  useEffect(() => {
    if (!episodeIdParam || selectedEpisode === episodeIdParam) return;
    setSelectedEpisode(episodeIdParam);
  }, [episodeIdParam, selectedEpisode, setSelectedEpisode]);

  // On native Android, begin with Server 1 (MegaPlay) immediately. The legacy
  // Kuhi Auto race is retired; the six supported embed providers are explicit
  // alternatives selected from the server chooser.
  const [useFallback, setUseFallback] = useState<boolean>(() => isLocalBackendEnabled());
  const [isHindiMode, setIsHindiMode] = useState<boolean>(false);
  const [selectedHindiServer, setSelectedHindiServer] = useState<number>(0);
  const [appIsActive, setAppIsActive] = useState(true);
  const [nativePipActive, setNativePipActive] = useState(false);
  const appIsActiveRef = useRef(true);
  const backgroundResumeModeRef = useRef<"playing" | "paused" | null>(null);
  const backgroundResumeStartedAtRef = useRef(0);
  const lifecycleResumeTimersRef = useRef<number[]>([]);
  const backgroundPlaybackRef = useRef<{
    embedWasPlaying: boolean;
    embedWasPaused: boolean;
    directVideos: HTMLVideoElement[];
  }>({ embedWasPlaying: false, embedWasPaused: false, directVideos: [] });
  const [manualProviderPlaybackFailed, setManualProviderPlaybackFailed] = useState(false);
  const [fallbackPlaybackFailed, setFallbackPlaybackFailed] = useState(false);
  const [playbackSourceIndex, setPlaybackSourceIndex] = useState(0);
  const [lastPlayerError, setLastPlayerError] = useState<string | null>(null);
  const [streamResolutionTimedOut, setStreamResolutionTimedOut] = useState(false);
  const [streamRetryKey, setStreamRetryKey] = useState(0);
  const [playerRetryKey, setPlayerRetryKey] = useState(0);
  const [retryingPlayback, setRetryingPlayback] = useState<{ episodeId: string; attempt: number } | null>(null);
  const [retryingResolution, setRetryingResolution] = useState<{ episodeId: string; attempt: number } | null>(null);
  const [resolutionRetryTick, setResolutionRetryTick] = useState(0);
  const [providerPlaybackOutcomes, setProviderPlaybackOutcomes] = useState<Record<string, "playing" | "failed" | "retrying">>({});
  const attemptedSourceIdsRef = useRef<Set<string>>(new Set());
  const blockedPlayerActionAtRef = useRef<{ retryKey: number; at: number }>({ retryKey: -1, at: 0 });
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
  const embedPlaybackStateRef = useRef<"unknown" | "playing" | "paused">("unknown");
  const pauseAfterEmbedRecoveryRef = useRef(false);
  const externalEmbedFrameRef = useRef<HTMLIFrameElement | null>(null);
  const embedResumeTimersRef = useRef<number[]>([]);
  const lastEmbedMediaTimeRef = useRef<{ key: string; seconds: number } | null>(null);
  const lastEmbedStateProbeAtRef = useRef(0);
  const lastEmbedProgressAtRef = useRef(0);
  const lastEmbedStateReplyAtRef = useRef(0);
  const embedHasObservedPlaybackRef = useRef(false);
  const embedProviderPauseEventsRef = useRef(false);
  const embedStateQuerySupportedRef = useRef(false);

  const requestEmbedResume = useCallback(() => {
    if (!isLocalBackendEnabled()) return;
    const frame = externalEmbedFrameRef.current;
    if (!frame?.contentWindow) return;
    const progressAnimeId = animeIdParam || anime?.anime?.info?.id || "0";
    const progress = getLocalWatchProgress(
      progressAnimeId,
      activeEpisodeId,
      requestedEpisodeNumber,
    ) ?? (
      anime?.anime?.info?.id && anime.anime.info.id !== progressAnimeId
        ? getLocalWatchProgress(
            anime.anime.info.id,
            activeEpisodeId,
            requestedEpisodeNumber,
          )
        : null
    );
    const resumeTime = progress && progress.current >= 5 && progress.duration > 0 &&
      progress.current < progress.duration - 15
      ? progress.current
      : null;
    // Restore the last position and query playback state whenever an embed is
    // loaded. Some providers return pause/play state only after initialization,
    // so state probes continue even when there is no saved position to seek to.
    const resumeModeAtLoad = backgroundResumeModeRef.current;
    const shouldRemainPaused = resumeModeAtLoad === "paused" ||
      (resumeModeAtLoad !== "playing" &&
        (pauseAfterEmbedRecoveryRef.current || embedPlaybackStateRef.current === "paused"));

    embedResumeTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    embedResumeTimersRef.current = [];
    const frameAtSchedule = frame;
    const sourceAtSchedule = frame.src;
    const delays = shouldRemainPaused
      ? [0, 500, 1300, 2800, 5000, 8000, 12000]
      : [0, 500, 1300, 2800, 5000];
    for (const delay of delays) {
      const timer = window.setTimeout(() => {
        if (externalEmbedFrameRef.current !== frameAtSchedule ||
            frameAtSchedule.src !== sourceAtSchedule) return;

        // Read the current refs at dispatch time, not the values captured when
        // these timers were queued. A play/timeupdate event must cancel pause
        // restoration, while a pause-state response must prevent a resume seek.
        const activeResumeMode = backgroundResumeModeRef.current;
        const remainPaused = activeResumeMode === "paused" ||
          (activeResumeMode !== "playing" &&
            (pauseAfterEmbedRecoveryRef.current || embedPlaybackStateRef.current === "paused"));
        if (remainPaused) {
          // A paused player recovered after app background still needs its saved
          // position restored, but must never be switched into playback.
          if (activeResumeMode === "paused" && resumeTime !== null) {
            requestExternalPlayerSeek(frameAtSchedule, resumeTime);
          }
          requestExternalPlayerPause(frameAtSchedule);
        } else if (resumeTime !== null) {
          requestExternalPlayerSeek(frameAtSchedule, resumeTime);
        }
        requestExternalPlayerState(frameAtSchedule);
      }, delay);
      embedResumeTimersRef.current.push(timer);
    }
  }, [animeIdParam, anime?.anime?.info?.id, activeEpisodeId, requestedEpisodeNumber]);

  useEffect(() => () => {
    embedResumeTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    embedResumeTimersRef.current = [];
  }, []);

  useEffect(() => {
    // Paused/playing state belongs to an episode, not to the next one.
    lifecycleResumeTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    lifecycleResumeTimersRef.current = [];
    backgroundResumeModeRef.current = null;
    backgroundResumeStartedAtRef.current = 0;
    embedPlaybackStateRef.current = "unknown";
    pauseAfterEmbedRecoveryRef.current = false;
    lastEmbedMediaTimeRef.current = null;
    lastEmbedStateProbeAtRef.current = 0;
    lastEmbedProgressAtRef.current = 0;
    lastEmbedStateReplyAtRef.current = 0;
    embedHasObservedPlaybackRef.current = false;
    embedProviderPauseEventsRef.current = false;
    embedStateQuerySupportedRef.current = false;
  }, [activeEpisodeId, playbackSourceIndex]);

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
    setFallbackPlaybackFailed(false);
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
  const isFallbackActive = !isHindiMode && (
    useFallback || (streamRequestFailed && !hasManualProviderSelection)
  );

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

  const advanceInProgressRef = useRef(false);

  useEffect(() => {
    advanceInProgressRef.current = false;
  }, [activeEpisodeId]);

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
        ...ACTIVE_EMBED_PROVIDER_ORDER,
        ...providerNames.filter((name) => !ACTIVE_EMBED_PROVIDER_ORDER.includes(name as (typeof ACTIVE_EMBED_PROVIDER_ORDER)[number])),
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
    // Android should start with the dedicated MegaPlay iframe (Server 1).
    // Resetting this to false sends every newly opened anime into the local
    // Keep a newly opened anime on MegaPlay rather than sending it through the
    // retired Auto route, which has no eligible direct-stream providers.
    setUseFallback(isLocalBackendEnabled());
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
    // A provider has reached this path only after its retry budget was exhausted.
    // Keep it out of the chooser while continuing through the internal candidate list.
    if (hasManualProviderSelection && !isFallbackActive) {
      const failedProvider = episodeData?.provider || activeEpisodeId.replace(/^\//, "").split("/")[1];
      if (failedProvider && failedProvider !== "auto") {
        setProviderPlaybackOutcomes((previous) =>
          previous[failedProvider] === "failed"
            ? previous
            : { ...previous, [failedProvider]: "failed" },
        );
      }
    }
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
      setFallbackPlaybackFailed(false);
      setUseFallback(false);
      setIsHindiMode(false);
      setPreferredCategory(next.category);
      setSelectedEpisode(next.id);
      updateEpisodeUrl(next.id, currentEpNumber);
      return;
    }
    if (!isFallbackActive) {
      playbackRetriesRef.current = { key: `${activeEpisodeId}|0`, count: 0 };
      setPlaybackSourceIndex(0);
      setFallbackPlaybackFailed(false);
      setUseFallback(true);
      return;
    }
    setFallbackPlaybackFailed(true);
    setLastPlayerError("All configured servers failed to start playback for this episode.");
  }, [activeEpisodeId, automaticCandidates, currentEpNumber, flushLatestEmbedProgress, hasManualProviderSelection, episodeData?.provider, isFallbackActive, setSelectedEpisode]);

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
        setResolutionRetryTick((tick) => tick + 1);
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

    // After two attempts, keep the MegaPlay episode route on Server 1 or advance
    // a failed manual selection to the next configured embed provider.
    if (isLocalBackendEnabled() && activeEpisodeId.startsWith("watch/megaplay/")) {
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
    resolutionRetryTick,
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
      if (isLocalBackendEnabled() && activeEpisodeId.startsWith("watch/megaplay/")) {
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
      setResolutionRetryTick((tick) => tick + 1);
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
    // Diagnostics are shared by the chooser and debug panel; refresh less often than player progress events.
    refetchInterval: isLocalBackendEnabled() ? 15000 : false,
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
      : "");

    if (targetId) {
      setUseFallback(false);
      attemptedSourceIdsRef.current.delete(targetId);
      setSelectedEpisode(targetId);
      updateEpisodeUrl(targetId, currentEpNumber);
    } else {
      // No supported embed advertises this audio track; keep playback on
      // MegaPlay instead of routing the request into the retired Kuhi Auto pool.
      setUseFallback(isLocalBackendEnabled());
    }
  };

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

      // Providers differ on whether progress fields are top-level or wrapped in
      // a data/detail object. Read both shapes so a recovered embed can resume
      // from the last known position even when its message envelope differs.
      const nestedData = data.data && typeof data.data === "object"
        ? data.data as Record<string, unknown>
        : data.detail && typeof data.detail === "object"
          ? data.detail as Record<string, unknown>
          : {};
      const messagePayload = { ...nestedData, ...data };
      let currentTime: number | null = null;
      let duration: number | null = null;

      if (typeof messagePayload.currentTime === "number") {
        currentTime = messagePayload.currentTime;
      } else if (typeof messagePayload.time === "number") {
        currentTime = messagePayload.time;
      } else if (typeof messagePayload.position === "number") {
        currentTime = messagePayload.position;
      }

      if (typeof messagePayload.duration === "number") {
        duration = messagePayload.duration;
      }

      const isComplete = String(messagePayload.event ?? messagePayload.type ?? "")
        .trim().toLowerCase().replace(/[_\s]+/g, "-") === "complete";

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
          saveLocalWatchProgress(progress);

          if (!isLocalBackendEnabled() && fallbackBookmarkIdRef.current) {
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
      setFallbackPlaybackFailed(false);
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
  const currentProviderName = cleanParts[1] || providerNames[0] || "megaplay";
  const activeCategory = cleanParts[3] === "dub" ? "dub" : cleanParts[3] === "sub" ? "sub" : preferredCategory;


  const advanceToNextEpisode = useCallback(() => {
    if (advanceInProgressRef.current || !animeIdParam || !activeEpisodeId) return;
    const nextNumber = Number(currentEpNumber) + 1;
    if (!Number.isFinite(nextNumber) || nextNumber < 2) return;

    const currentProviderEpisodes = rawProviders[currentProviderName]?.episodes?.[activeCategory] || [];
    const nextProviderEpisode = currentProviderEpisodes.find((episode) => Number(episode.number) === nextNumber);
    const nextAnyProviderEpisode = providerNames
      .map((providerName) => rawProviders[providerName]?.episodes?.[activeCategory] || [])
      .flat()
      .find((episode) => Number(episode.number) === nextNumber);
    const catalogueEpisode = allEpisodesData?.episodes?.find((episode) => Number(episode.number) === nextNumber);

    // A complete native catalogue is authoritative. Do not manufacture an
    // episode-N URL after the final known episode just because the local API
    // can accept arbitrary episode numbers.
    if (nativeCatalogueComplete && !catalogueEpisode) {
      advanceInProgressRef.current = true;
      return;
    }

    const nextEpisodeId = isLocalBackendEnabled()
      ? "watch/megaplay/" + animeIdParam + "/" + activeCategory + "/episode-" + nextNumber
      : nextProviderEpisode?.id || nextAnyProviderEpisode?.id || catalogueEpisode?.episodeId || "";
    if (!nextEpisodeId) return;

    advanceInProgressRef.current = true;
    if (!isWatchRoute) {
      lastWatchParamsRef.current = {
        animeId: animeIdParam,
        episode: String(nextNumber),
        episodeId: nextEpisodeId,
      };
    }
    setUseFallback(isLocalBackendEnabled());
    setIsHindiMode(false);
    setSelectedEpisode(nextEpisodeId);

    if (isWatchRoute) {
      updateEpisodeUrl(nextEpisodeId, nextNumber);
    } else {
      const nextUrl = new URL("/anime/watch", window.location.origin);
      nextUrl.searchParams.set("anime", animeIdParam);
      nextUrl.searchParams.set("ep", String(nextNumber));
      nextUrl.searchParams.set("episode", nextEpisodeId);
      window.dispatchEvent(new CustomEvent("7xanime:watch-location", {
        detail: { href: nextUrl.pathname + nextUrl.search },
      }));
    }
  }, [activeCategory, activeEpisodeId, allEpisodesData?.episodes, animeIdParam, currentEpNumber, currentProviderName, isWatchRoute, nativeCatalogueComplete, providerNames, rawProviders, setSelectedEpisode]);
  const availableProviderNames = providerNames.filter(
    (providerName) => (rawProviders[providerName]?.episodes?.[activeCategory] || []).length > 0,
  );
  // For Android, show every provider module that actually imports successfully,
  // not only the providers whose episode catalogue happened to return a list.
  // Each button uses a strict per-provider request; unavailable sources show an
  // honest error instead of silently swapping to another server.
  const serverProviderNames = isLocalBackendEnabled()
    ? (localProviderStatus?.providers
        .filter((item) => item.moduleLoaded)
        .map((item) => item.id) || availableProviderNames)
    : availableProviderNames;
  // Keep SUB-only servers discoverable while ENGLISH is selected, but hide a
  // provider after its recovery attempts fail. The internal failover sequence
  // retains the complete supported provider order.
  const selectableServerProviderNames = serverProviderNames;
  const failedServerProviderNames = selectableServerProviderNames.filter(
    (providerName) => providerPlaybackOutcomes[providerName] === "failed",
  );
  const visibleServerProviderNames = selectableServerProviderNames.filter(
    (providerName) => providerPlaybackOutcomes[providerName] !== "failed",
  );

  const selectedProviderIndex = visibleServerProviderNames.indexOf(currentProviderName);
  const fallbackServerNumber = 1;
  const activeServerNumber = isHindiMode
    ? selectedHindiServer + 1
    : useFallback || isFallbackActive
      ? fallbackServerNumber
      : selectedProviderIndex >= 0 ? selectedProviderIndex + 2 : 1;
  const activeServerLabel =
    !isFallbackActive && !isHindiMode && providerPlaybackOutcomes[currentProviderName] === "failed"
      ? `${getProviderDisplayName(currentProviderName)} unavailable`
      : activeServerNumber === 1
        ? "Server 1 — MegaPlay"
        : `Server ${activeServerNumber} — ${getProviderDisplayName(currentProviderName)}`;

  const selectFallbackServer = (category?: "sub" | "dub") => {
    flushLatestEmbedProgress();
    setFallbackPlaybackFailed(false);
    playbackRetriesRef.current = { key: `${activeEpisodeId}|0`, count: 0 };
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


  const handlePlayerError = useCallback((detail?: string) => {
    // Do not resolve/retry/switch providers while the app is hidden. Explicit
    // PiP is a visible playback session and may continue using normal recovery.
    if (isLocalBackendEnabled() && !appIsActive && !nativePipActive) return;

    // A paused embed is not a stalled embed. Retrying this path remounts the
    // cross-origin iframe, which loses its manual pause even if we send a later
    // best-effort pause message. Ignore recovery signals until the provider
    // explicitly reports playback again; reinforce pause on the existing frame.
    if (embedPlaybackStateRef.current === "paused") {
      pauseAfterEmbedRecoveryRef.current = true;
      lastEmbedSignalAtRef.current = Date.now();
      const pausedFrame = externalEmbedFrameRef.current;
      if (pausedFrame) requestExternalPlayerPause(pausedFrame);
      return;
    }

    const retryKey = `${activeEpisodeId}|${playbackSourceIndex}`;
    if (playbackRetriesRef.current.key !== retryKey) {
      playbackRetriesRef.current = { key: retryKey, count: 0 };
    }
    const providerKey = isFallbackActive ? "megaplay" : episodeData?.provider || currentProviderName;

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
    if (!isFallbackActive && episodeData?.sources?.[nextSourceIndex]?.url) {
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
    hasManualProviderSelection, playbackSourceIndex, retryEpisodeData, isFallbackActive,
    appIsActive, nativePipActive,
  ]);

  const handlePlayerPlaybackReady = useCallback(() => {
    playbackRetriesRef.current = { key: `${activeEpisodeId}|${playbackSourceIndex}`, count: 0 };
    setRetryingPlayback(null);
    const providerKey = isFallbackActive ? "megaplay" : episodeData?.provider || currentProviderName;
    if (providerKey && providerKey !== "auto") {
      setProviderPlaybackOutcomes((previous) => ({ ...previous, [providerKey]: "playing" }));
    }
  }, [activeEpisodeId, currentProviderName, episodeData?.provider, playbackSourceIndex, isFallbackActive]);

  // Native interception reports both blocked ad interactions and actual player-document errors.
  // Popups, remote JavaScript dialogs, permissions, and top-level ad redirects are expected
  // to be suppressed, so they must not consume playback retries or hide a server. Only a
  // failed embedded player document is treated as a provider playback failure.
  useEffect(() => {
    if (!isLocalBackendEnabled()) return;

    const handleBlockedPlayerAction = (event: Event) => {
      if (isHindiMode) return;
      const detail = (event as CustomEvent<{ reason?: string; host?: string }>).detail || {};
      const reason = String(detail.reason || "blocked");
      const host = String(detail.host || "third-party player");

      // Blocking an ad, popup or dialog means protection worked; it is not a player failure.
      if (!reason.startsWith("embed-")) return;

      const now = Date.now();
      if (
        blockedPlayerActionAtRef.current.retryKey === playerRetryKey &&
        now - blockedPlayerActionAtRef.current.at < 900
      ) return;
      blockedPlayerActionAtRef.current = { retryKey: playerRetryKey, at: now };

      // A frame refused by X-Frame-Options/CSP will not start by repeatedly reloading
      // the same URL. Move to the next provider immediately and preserve the reason.
      if (reason === "embed-blocked-by-response") {
        setLastPlayerError(`${getProviderDisplayName(currentProviderName)} refused iframe embedding (${host}).`);
        advanceAfterSourceFailure();
        return;
      }

      // Do not reconnect a deliberately paused player; preserve its current state.
      if (embedPlaybackStateRef.current === "paused") {
        lastEmbedSignalAtRef.current = now;
        const pausedFrame = externalEmbedFrameRef.current;
        if (pausedFrame) requestExternalPlayerPause(pausedFrame);
        return;
      }

      handlePlayerError(`Embedded player document failed (${reason}) on ${host}; reconnecting.`);
    };

    window.addEventListener("7xanime:blocked-player-action", handleBlockedPlayerAction);
    return () => window.removeEventListener("7xanime:blocked-player-action", handleBlockedPlayerAction);
  }, [
    advanceAfterSourceFailure,
    currentProviderName,
    handlePlayerError,
    isHindiMode,
    isLocalBackendEnabled,
    playerRetryKey,
  ]);

  // Trust player events only from the active iframe and its configured provider origin.
  const observedEmbedProvider = (isFallbackActive ? "megaplay" : episodeData?.provider || currentProviderName || "").toLowerCase();
  const observedEmbedSource = isFallbackActive ? { type: "embed", url: "" } : episodeData?.sources?.[playbackSourceIndex];
  useEffect(() => {
    if (!isLocalBackendEnabled() || (!isFallbackActive && observedEmbedSource?.type !== "embed")) return;

    const expectedHosts: Record<string, string[]> = {
      megaplay: ["megaplay.buzz"],
      anixo: ["anixo.buzz"],
      megavid: ["megavid.buzz"],
        cinexstream: ["cinextream.cc"],
      supaplay: ["supaplay.fun"],
      };
    const acceptedHosts = expectedHosts[observedEmbedProvider];
    if (!acceptedHosts) return;
    const handleEmbedMessage = (event: MessageEvent) => {
      if (event.source !== externalEmbedFrameRef.current?.contentWindow) return;

      let raw = event.data;
      if (typeof raw === "string") {
        try { raw = JSON.parse(raw); } catch { return; }
      }
      if (!raw || typeof raw !== "object") return;

      let hostname = "";
      try { hostname = new URL(event.origin).hostname.toLowerCase(); } catch { return; }
      if (!acceptedHosts.some((expectedHost) =>
        hostname === expectedHost || hostname.endsWith(`.${expectedHost}`)
      )) return;

      const payload = raw as Record<string, unknown>;
      const normalizeEventName = (value: unknown) =>
        String(value ?? "")
          .trim()
          .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
          .toLowerCase()
          .replace(/[\s_]+/g, "-");
      const nestedPayloads = [payload.data, payload.detail, payload.payload]
        .filter((value): value is Record<string, unknown> =>
          !!value && typeof value === "object" && !Array.isArray(value),
        );
      const fields = (source: Record<string, unknown>) => [
        source.event, source.eventName, source.event_name, source.type,
        source.action, source.name, source.status, source.state,
        source.playbackState, source.playerState,
      ];
      const eventNames = [payload, ...nestedPayloads]
        .flatMap(fields)
        .map(normalizeEventName)
        .filter((name): name is string => name.length > 0);
      const eventType = eventNames[0] || "";
      const statusNames = [payload.status, payload.state, payload.playbackState, payload.playerState,
        ...nestedPayloads.flatMap((item) => [item.status, item.state, item.playbackState, item.playerState])]
        .map(normalizeEventName)
        .filter((name): name is string => name.length > 0);
      const pausedQueryNames = ["get-paused", "getpaused", "paused-state"];
      const playingQueryNames = ["get-is-playing", "getisplaying", "is-playing", "isplaying"];
      const isPausedQueryResponse = eventNames.some((name) => pausedQueryNames.includes(name)) ||
        payload.context === "player.js" && eventNames.some((name) => name.includes("paused"));
      const isPlayingQueryResponse = eventNames.some((name) => playingQueryNames.includes(name)) ||
        payload.context === "player.js" && eventNames.some((name) => name.includes("playing"));
      const queryStateResponse = isPausedQueryResponse || isPlayingQueryResponse;
      const pausedFlags = [
        payload.paused, payload.isPaused, payload.is_paused,
        ...nestedPayloads.flatMap((item) => [item.paused, item.isPaused, item.is_paused]),
      ];
      const playingFlags = [
        payload.playing, payload.isPlaying,
        ...nestedPayloads.flatMap((item) => [item.playing, item.isPlaying]),
      ];
      const reportsPausedByBoolean = pausedFlags.some((value) => value === true) ||
        ((isPausedQueryResponse || isPlayingQueryResponse) && playingFlags.some((value) => value === false));
      const reportsPlayingByBoolean = playingFlags.some((value) => value === true);
      const queryValue = payload.value ?? payload.result ??
        nestedPayloads.map((item) => item.value ?? item.result).find((value) => value !== undefined);
      const queryReportsPaused = (isPausedQueryResponse && queryValue === true) ||
        (isPlayingQueryResponse && queryValue === false);
      const queryReportsPlaying = (isPausedQueryResponse && queryValue === false) ||
        (isPlayingQueryResponse && queryValue === true);
      const hasExplicitStateValue = pausedFlags.some((value) => typeof value === "boolean") ||
        playingFlags.some((value) => typeof value === "boolean") ||
        typeof queryValue === "boolean";
      if (queryStateResponse && hasExplicitStateValue) {
        embedStateQuerySupportedRef.current = true;
        lastEmbedStateReplyAtRef.current = Date.now();
      }
      const failed = eventNames.some((name) => name.includes("error") || name === "failed")
        || statusNames.includes("error");
      const explicitPauseEvent = !queryStateResponse && (eventNames.some((name) =>
        name === "pause" || name === "paused" || name.endsWith(":pause") ||
        name.endsWith(":paused") || name.endsWith("-pause") || name.endsWith("-paused")
      ) || statusNames.includes("paused"));
      const explicitPlayEvent = !queryStateResponse && (eventNames.some((name) =>
        name === "play" || name === "playing" || name.endsWith(":play") ||
        name.endsWith(":playing") || name.endsWith("-play") || name.endsWith("-playing")
      ) || statusNames.includes("playing"));
      const reportedPaused = explicitPauseEvent || reportsPausedByBoolean || queryReportsPaused;
      const reportedPlaying = explicitPlayEvent || reportsPlayingByBoolean || queryReportsPlaying;
      if (explicitPauseEvent) embedProviderPauseEventsRef.current = true;
      const positionValue = [
        payload.currentTime, payload.time, payload.position,
        ...nestedPayloads.flatMap((item) => [item.currentTime, item.time, item.position]),
      ].find((value) => typeof value === "number" && Number.isFinite(value));
      const progressKey = observedEmbedProvider + "|" + activeEpisodeId + "|" + playbackSourceIndex;
      const previousTime = lastEmbedMediaTimeRef.current;
      const advancedTime = typeof positionValue === "number" && previousTime?.key === progressKey &&
        positionValue > previousTime.seconds + 0.2;
      if (typeof positionValue === "number") {
        lastEmbedMediaTimeRef.current = { key: progressKey, seconds: positionValue };
      }
      const progressEvent = eventNames.some((name) =>
        ["time", "timeupdate", "progress", "watching-log", "on-time", "on-timeupdate"].includes(name)
      );
      const progressIndicatesPlaying = progressEvent && typeof positionValue === "number" &&
        positionValue > 0 && (advancedTime || previousTime?.key !== progressKey);
      if (progressEvent && typeof positionValue === "number" &&
          (advancedTime || previousTime?.key !== progressKey)) {
        lastEmbedProgressAtRef.current = Date.now();
      }
      if (queryStateResponse && (reportedPaused || reportedPlaying)) {
        lastEmbedStateReplyAtRef.current = Date.now();
      }
      const now = Date.now();
      const lifecyclePauseEcho = reportedPaused &&
        backgroundResumeModeRef.current === "playing";
      const foregroundPauseMustWin = backgroundResumeModeRef.current === "paused" &&
        (reportedPlaying || progressIndicatesPlaying);

      if (lifecyclePauseEcho) {
        // This is the pause acknowledgement for the app's own background command,
        // not a deliberate user pause. Reassert play only after the app is visible.
        lastEmbedSignalAtRef.current = now;
        if (appIsActiveRef.current) {
          const activeFrame = externalEmbedFrameRef.current;
          if (activeFrame) requestExternalPlayerPlay(activeFrame);
        }
      } else if (foregroundPauseMustWin) {
        // The provider may wake itself when Android resumes. The last known user
        // state was paused, so keep it paused until we receive a paused response.
        lastEmbedSignalAtRef.current = now;
        const activeFrame = externalEmbedFrameRef.current;
        if (activeFrame) requestExternalPlayerPause(activeFrame);
      } else if (reportedPaused) {
        embedPlaybackStateRef.current = "paused";
        pauseAfterEmbedRecoveryRef.current = true;
        lastEmbedSignalAtRef.current = now;
        lastEmbedProgressAtRef.current = now;
        if (backgroundResumeModeRef.current === "paused") {
          backgroundResumeModeRef.current = null;
        }
        const pausedFrame = externalEmbedFrameRef.current;
        if (pausedFrame) requestExternalPlayerPause(pausedFrame);
      } else if (reportedPlaying || progressIndicatesPlaying) {
        // A number of embed players report time/progress while playing but do not
        // emit a separate play event. Treat an advancing media clock as renewed
        // play intent so stale delayed-pause retries cannot pause it again.
        embedPlaybackStateRef.current = "playing";
        pauseAfterEmbedRecoveryRef.current = false;
        embedHasObservedPlaybackRef.current = true;
        lastEmbedSignalAtRef.current = now;
        if (reportedPlaying) lastEmbedProgressAtRef.current = now;
        if (backgroundResumeModeRef.current === "playing") {
          backgroundResumeModeRef.current = null;
        }
      }

      // Providers disagree on which field carries the ended signal and how
      // they spell it (event/type/action, camelCase, spaces or underscores).
      // Accept explicit completion aliases only; never infer completion from
      // a timeout, stalled stream or generic "ready" event.
      const completionEvents = new Set([
        "aniembed:ended",
        "ended",
        "video-ended",
        "episode-ended",
        "media-ended",
        "onended",
        "complete",
        "completed",
      ]);
      if (eventNames.some((name) => completionEvents.has(name) || /^(video|episode|media)-ended$/.test(name))) {
        advanceToNextEpisode();
        return;
      }
      if (failed) {
        handlePlayerError(`${getProviderDisplayName(observedEmbedProvider)} reported a playback error.`);
        return;
      }

      // CinexStream documents "player_ready" rather than "ready"; normalize all
      // ready aliases so resume/state restoration runs on every supported embed.
      const playerReady = ["ready", "loadedmetadata", "loaded", "player-ready"].includes(eventType) ||
        eventNames.some((name) => name.endsWith(":ready") || name.endsWith("-ready")) ||
        statusNames.includes("ready");
      if (playerReady) requestEmbedResume();

      // Ad/verification interstitials can emit "ready" without actual video.
      // Only timeline/play signals count as proof that the provider is advancing.
      const playbackObserved =
        ["aniembed:play", "aniembed:ended"].includes(String(payload.type || "").toLowerCase()) ||
        eventNames.some((name) =>
          ["play", "playing", "pause", "paused", "seek", "time", "progress", "timeupdate", "watching-log", "complete"].includes(name)
        ) ||
        statusNames.some((name) => ["playing", "paused"].includes(name)) ||
        typeof positionValue === "number";
      if (playbackObserved) {
        lastEmbedSignalAtRef.current = Date.now();
        playbackRetriesRef.current = { key: `${activeEpisodeId}|${playbackSourceIndex}`, count: 0 };
        setRetryingPlayback(null);
      }

      const confirmedPlayback =
        ["aniembed:play"].includes(String(payload.type || "").toLowerCase()) ||
        eventNames.some((name) => ["play", "playing", "time", "progress", "timeupdate", "watching-log", "complete"].includes(name)) ||
        statusNames.includes("playing") ||
        progressIndicatesPlaying;
      if (confirmedPlayback) {
        embedHasObservedPlaybackRef.current = true;
        if (!lastEmbedProgressAtRef.current) lastEmbedProgressAtRef.current = Date.now();
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
    isFallbackActive,
    requestEmbedResume,
    advanceToNextEpisode,
  ]);

  // Known event-reporting iframe players (MegaPlay, AniXo, Megavid, CinexStream)
  // should emit playback/progress signals. If their page remains stuck on an
  // upstream error or interstitial and never reports progress, retry the same
  // iframe twice before switching providers. SupaPlay is manual-only until
  // included in this watchdog until their embeds emit playback events verified by us.
  // We cannot inspect/click inside a cross-origin iframe, so this watchdog relies
  // on documented player events.
  useEffect(() => {
    const watchedProviders = ["megaplay", "anixo", "megavid", "cinexstream"];
    if (
      !isLocalBackendEnabled() ||
      (!appIsActive && !nativePipActive) ||
      (!isFallbackActive && observedEmbedSource?.type !== "embed") ||
      !watchedProviders.includes(observedEmbedProvider)
    ) return;

    embedLoadStartedAtRef.current = Date.now();
    lastEmbedSignalAtRef.current = 0;
    const interval = window.setInterval(() => {
      const now = Date.now();
      const frame = externalEmbedFrameRef.current;
      // Poll for a supported pause-state response while the iframe is active.
      // Several servers do not emit a dedicated pause event, even though they
      // may answer one of the common getPaused/isPlaying queries.
      if (frame && now - lastEmbedStateProbeAtRef.current >= 5000) {
        lastEmbedStateProbeAtRef.current = now;
        requestExternalPlayerState(frame);
      }
      if (embedPlaybackStateRef.current === "paused") {
        // A paused episode is intentionally not advancing. Do not misclassify
        // silence from a paused iframe as a dead stream and remount it.
        embedLoadStartedAtRef.current = now;
        lastEmbedSignalAtRef.current = now;
        return;
      }

      const stallTimeoutMs = 18000;
      const hasRecentStateReply = embedStateQuerySupportedRef.current &&
        now - lastEmbedStateReplyAtRef.current < 12000;
      const canDistinguishPauseFromStall = observedEmbedProvider === "anixo" ||
        embedProviderPauseEventsRef.current ||
        (hasRecentStateReply && embedPlaybackStateRef.current === "playing");
      const lastSignal = Math.max(embedLoadStartedAtRef.current, lastEmbedSignalAtRef.current);
      const lastProgress = Math.max(embedLoadStartedAtRef.current, lastEmbedProgressAtRef.current);
      const lastRelevantActivityAt = embedHasObservedPlaybackRef.current
        ? lastProgress
        : lastSignal;
      if (now - lastRelevantActivityAt < stallTimeoutMs) return;

      // After a provider has started playing, silence alone is not enough to
      // distinguish an intentional pause from a silent stall. AniXo emits pause
      // events; other providers can use automatic stall recovery when they
      // explicitly report pause events or answer a state query. For embeds with
      // neither capability, only explicit error messages trigger reconnection:
      // remounting on silence would restart a deliberately paused episode.
      if (embedHasObservedPlaybackRef.current && !canDistinguishPauseFromStall) {
        embedLoadStartedAtRef.current = now;
        lastEmbedSignalAtRef.current = now;
        return;
      }

      // Reset the baseline before calling into React so rapid repeated timer
      // ticks cannot consume both retries for the same stalled frame.
      embedLoadStartedAtRef.current = now;
      const detail = `${getProviderDisplayName(observedEmbedProvider)} stopped reporting playback; retrying this player.`;
      handlePlayerError(detail);
    }, 2500);

    return () => window.clearInterval(interval);
  }, [
    activeEpisodeId, playbackSourceIndex, playerRetryKey,
    observedEmbedProvider, observedEmbedSource?.type, observedEmbedSource?.url,
    isFallbackActive, handlePlayerError, appIsActive, nativePipActive,
  ]);

  const playerAnimeInfo = useMemo(
    () => ({
      id: isLocalBackendEnabled()
        ? animeIdParam || anime?.anime?.info?.id || "0"
        : anime?.anime?.info?.id || "0",
      legacyId: anime?.anime?.info?.id || undefined,
      title: anime?.anime?.info?.name || "Anime",
      image: anime?.anime?.info?.poster || "",
    }),
    [isLocalBackendEnabled, animeIdParam, anime?.anime?.info?.id, anime?.anime?.info?.name, anime?.anime?.info?.poster],
  );

  // Keep the active player mounted while Android backgrounds the app.
  // Returning a placeholder here unmounts cross-origin iframes and ArtPlayer;
  // when the app resumes React creates a fresh player, which looks like a reconnect
  // and loses the provider's in-memory playback session. The watchdog above is
  // already suspended outside the foreground (unless native PiP is active).
  // Keep the same control surface available in both mini-player and full-screen layouts.
  const playerControls = (
    <>
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
                Automatically skipped {failedServerProviderNames.length} failed server{failedServerProviderNames.length === 1 ? "" : "s"}. Tap a server to retry it, or retry MegaPlay Server 1.
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
            Loaded means the provider module is present, not that every anime has a playable stream. “URL returned” is not playback proof; embedded providers need successful playback on the actual device.
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
    <section id="episode-list" aria-label="Anime episodes" className="scroll-mt-4 rounded-2xl border border-white/[0.07] bg-[#101018] p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#ff9fbe]">Episodes</p>
          <p className="mt-1 text-xs text-zinc-500">Search by title, jump straight to a number, or browse episode ranges.</p>
        </div>
        <span className="shrink-0 rounded-lg border border-[#ff3b72]/25 bg-[#ff3b72]/10 px-2.5 py-1.5 text-xs font-bold text-[#ff9fbe]">Now playing · Ep {currentEpNumber}</span>
      </div>
      <AnimeEpisodes animeId={animeIdParam} />
    </section>
    {anime?.anime?.info && (
      <section id="anime-details" aria-labelledby="anime-details-title" className="relative isolate overflow-hidden rounded-2xl border border-white/[0.08] bg-[#100b13]">
        <div className="absolute inset-0 -z-20 bg-gradient-to-br from-[#3d1026] via-[#17101d] to-[#0b0b12]" />
        {!!anime.anime.info.bannerImage && (
          <Image src={anime.anime.info.bannerImage} alt="" fill unoptimized sizes="(max-width: 768px) 100vw, 1100px" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-35" />
        )}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#0a050b]/95 via-[#0a050b]/80 to-[#0a050b]/55" />
        <div className="space-y-4 p-4 sm:p-6">
          <div className="flex items-start gap-4 sm:gap-5">
            <div className="relative aspect-[2/3] w-[94px] shrink-0 overflow-hidden rounded-xl border border-white/15 bg-black/30 shadow-xl sm:w-[132px]">
              {anime.anime.info.poster && <Image src={anime.anime.info.poster} alt={anime.anime.info.name || "Anime poster"} fill unoptimized sizes="132px" className="object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#ff9fbe]">Anime details</p>
                  <h2 id="anime-details-title" className="text-xl font-black leading-tight text-white sm:text-2xl">{anime.anime.info.name}</h2>
                </div>
                <button type="button" aria-expanded={showFullAnimeDetails} aria-controls="full-anime-details" onClick={() => setShowFullAnimeDetails((expanded) => !expanded)} className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-white/15 bg-black/30 px-2.5 py-2 text-[11px] font-bold text-white transition hover:border-[#ff3b72]/50 hover:bg-[#ff3b72]/15 sm:px-3">
                  {showFullAnimeDetails ? "Less" : "Details"}
                  {showFullAnimeDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold text-zinc-200 sm:text-[11px]">
                {anime.anime.info.stats.type && <span className="rounded-lg border border-white/15 bg-black/25 px-2 py-1">{anime.anime.info.stats.type}</span>}
                {anime.anime.moreInfo.status && anime.anime.moreInfo.status !== "N/A" && <span className="rounded-lg border border-white/15 bg-black/25 px-2 py-1">{anime.anime.moreInfo.status}</span>}
                {anime.anime.moreInfo.premiered && anime.anime.moreInfo.premiered !== "N/A" && <span className="rounded-lg border border-white/15 bg-black/25 px-2 py-1">{anime.anime.moreInfo.premiered}</span>}
                {anime.anime.info.stats.rating && anime.anime.info.stats.rating !== "N/A" && <span className="rounded-lg border border-amber-300/20 bg-amber-300/10 px-2 py-1 text-amber-200">★ {anime.anime.info.stats.rating}</span>}
                {anime.anime.info.stats.episodes?.sub > 0 && <span className="rounded-lg border border-white/15 bg-black/25 px-2 py-1">{anime.anime.info.stats.episodes.sub} eps</span>}
              </div>
              {!!anime.anime.moreInfo.genres?.length && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {anime.anime.moreInfo.genres.slice(0, showFullAnimeDetails ? undefined : 5).map((genre) => <span key={genre} className="rounded-full bg-[#ff3b72]/15 px-2.5 py-1 text-[10px] font-semibold text-[#ffb5cb]">{genre}</span>)}
                </div>
              )}
            </div>
          </div>
          <div className="border-t border-white/10 pt-3">
            <h3 className="mb-1.5 text-xs font-extrabold uppercase tracking-[0.12em] text-zinc-300">Synopsis</h3>
            <div className={`text-sm leading-6 text-zinc-200/90 ${showFullAnimeDetails ? "" : "line-clamp-3 max-h-[4.5rem] overflow-hidden"}`}>
              {anime.anime.info.description ? parse(anime.anime.info.description) : "No synopsis available."}
            </div>
          </div>
          {showFullAnimeDetails && (
            <div id="full-anime-details" className="grid grid-cols-1 gap-3 border-t border-white/10 pt-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["Japanese title", anime.anime.moreInfo.japanese],
                ["Alternative titles", anime.anime.moreInfo.synonyms],
                ["Aired", anime.anime.moreInfo.aired],
                ["Premiered", anime.anime.moreInfo.premiered],
                ["Status", anime.anime.moreInfo.status],
                ["Duration", anime.anime.moreInfo.duration || anime.anime.info.stats.duration],
                ["Score", anime.anime.moreInfo.malscore || anime.anime.info.stats.rating],
                ["Studio", anime.anime.moreInfo.studios],
                ["Producers", anime.anime.moreInfo.producers?.join(", ")],
              ].filter(([, value]) => !!value && value !== "N/A").map(([label, value]) => (
                <div key={String(label)} className="min-w-0 rounded-xl border border-white/[0.08] bg-black/20 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{label}</p>
                  <p className="mt-1 break-words text-xs leading-5 text-zinc-200">{value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    )}
    {watchNextRecommendations.length > 0 && (
      <section aria-labelledby="watch-next-title" className="space-y-3 rounded-2xl border border-white/[0.07] bg-[#101018] p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#ff3b72]/20 bg-[#ff3b72]/10 text-[#ff9fbe]"><Sparkles className="h-4 w-4" /></div>
          <div className="min-w-0">
            <h2 id="watch-next-title" className="text-base font-extrabold text-white sm:text-lg">Watch next</h2>
            <p className="mt-0.5 text-xs text-zinc-500">Similar and related anime picked from the catalogue.</p>
          </div>
        </div>
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
          {watchNextRecommendations.map((item) => (
            <div key={item.id} className="w-[9.5rem] shrink-0 sm:w-[10.5rem]">
              <AnimeCard animeId={item.id} href={ROUTES.animeDetails(item.id)} poster={item.poster} title={item.name} subTitle={item.jname} episodes={item.episodes?.sub || item.episodes?.dub || null} format={item.type} score={"rating" in item && item.rating ? Number(item.rating) : null} variant="sm" className="!max-w-none" />
            </div>
          ))}
        </div>
      </section>
    )}
    </>
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
              ref={externalEmbedFrameRef}
              key={selectedHindi.embed}
              src={selectedHindi.embed}
              onLoad={requestEmbedResume}
              title={`${hindiDubData?.matchedTitle || anime?.anime?.info?.name || "Anime"} episode ${currentEpNumber} Hindi dub via ${selectedHindi.host}`}
              width="100%"
              height="100%"
              allow="autoplay; fullscreen; encrypted-media"
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
              <Button size="sm" onClick={() => selectFallbackServer()}>Try Server 1 · MegaPlay</Button>
            </div>
            <span className="text-xs text-zinc-500">Or tap a differently named provider below to test that server directly.</span>
          </AlertDescription>
        </Alert>
        {playerControls}
      </div>
    );
  }

  if (isFallbackActive && fallbackPlaybackFailed) {
    return (
      <div className="space-y-3">
        {playerHeader}
        <Alert className="rounded-2xl border-rose-300/15 bg-rose-300/[0.04] text-zinc-200">
          <AlertCircle className="h-4 w-4 text-rose-300" />
          <AlertTitle className="font-bold">Playback could not recover</AlertTitle>
          <AlertDescription className="mt-1 flex flex-col gap-3 text-sm text-zinc-400">
            MegaPlay and the available servers could not start this episode after automatic retries. Your latest saved timestamp is kept where a player reported it.
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => selectFallbackServer()}>Retry Server 1 · MegaPlay</Button>
            </div>
            <span className="text-xs text-zinc-500">You can also choose another server below. Embedded providers may not expose a seek command, so exact resume is not guaranteed on every iframe.</span>
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
            src={fallbackSrc}
            onLoad={requestEmbedResume}
            title={`${anime?.anime?.info?.name || "Anime"} episode ${currentEpNumber} via MegaPlay`}
            width="100%"
            height="100%"
            allow="autoplay; fullscreen; encrypted-media"
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
            onLoad={requestEmbedResume}
            title={`${anime?.anime?.info?.name || "Anime"} episode ${currentEpNumber} via ${getProviderDisplayName(embedProvider)}`}
            width="100%"
            height="100%"
            allow="autoplay; fullscreen; encrypted-media"
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
            Try MegaPlay Server 1 or select another server.
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
          onEpisodeEnded={advanceToNextEpisode}
        />
      </PlayerViewport>
      {playerControls}
    </div>
  );
};

export default VideoPlayerSection;
