import { useState, useEffect } from "react";
import { IWatchedAnime } from "@/types/watched-anime";
import { isLocalBackendEnabled } from "@/lib/api";
import { getLocalWatchProgressForAnime } from "@/lib/local-watch-progress";

export const useGetLastEpisodeWatched = (animeId: string) => {
  const [lastEpisodeWatched, setLastEpisodeWatched] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (isLocalBackendEnabled()) {
      const latest = getLocalWatchProgressForAnime(animeId)[0];
      setLastEpisodeWatched(latest?.episodeId || null);
      return;
    }

    const watchedDetails: Array<IWatchedAnime> =
      JSON.parse(localStorage.getItem("watched") as string) || [];

    const anime = watchedDetails.find(
      (watchedAnime) => watchedAnime.anime.id === animeId,
    );

    if (anime && anime.episodes.length > 0) {
      const lastWatched = anime.episodes[anime.episodes.length - 1]; // Get the last episode
      setLastEpisodeWatched(lastWatched);
    } else {
      setLastEpisodeWatched(null); // No episodes watched
    }
  }, [animeId]);

  return lastEpisodeWatched;
};
