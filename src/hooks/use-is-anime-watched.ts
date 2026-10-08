import { useState, useEffect } from "react";
import { IWatchedAnime } from "@/types/watched-anime";
import { WatchHistory } from "./use-get-bookmark";
import { isLocalBackendEnabled } from "@/lib/api";
import { getLocalWatchProgressForAnime } from "@/lib/local-watch-progress";

export const useHasAnimeWatched = (
  animeId: string,
  episodeId?: string,
  watchedEpisodes?: WatchHistory[],
) => {
  const [hasWatchedAnime, setHasWatchedAnime] = useState(false);
  const [hasWatchedEpisode, setHasWatchedEpisode] = useState(false);

  useEffect(() => {
    if (isLocalBackendEnabled()) {
      const entries = getLocalWatchProgressForAnime(animeId);
      setHasWatchedAnime(entries.length > 0);
      setHasWatchedEpisode(
        !!episodeId && entries.some((entry) => entry.episodeId === episodeId),
      );
      return;
    }

    const watchedDetails: Array<IWatchedAnime> =
      JSON.parse(localStorage.getItem("watched") as string) || [];

    if (!Array.isArray(watchedDetails)) {
      localStorage.removeItem("watched");
      return;
    }

    const anime = watchedDetails.find(
      (watchedAnime) => watchedAnime.anime.id === animeId,
    );

    if (anime) {
      setHasWatchedAnime(true); // Anime has been watched
      if (episodeId) {
        const episodeWatched = anime.episodes.includes(episodeId);
        setHasWatchedEpisode(episodeWatched); // Set to true if the episode is watched
      }
    } else {
      setHasWatchedAnime(false); // Anime has not been watched
      setHasWatchedEpisode(false); // Episode has not been watched
    }
  }, [animeId, episodeId]);

  if (watchedEpisodes && watchedEpisodes.length > 0) {
    if (episodeId) {
      const episodeWatched = watchedEpisodes.some(
        (episode) => episode.episodeId === episodeId,
      );
      return { hasWatchedAnime: true, hasWatchedEpisode: episodeWatched };
    }
  }

  return { hasWatchedAnime, hasWatchedEpisode };
};
