"use client";

import React, { useEffect, useState } from "react";
import Container from "./container";
import AnimeCard from "./anime-card";
import { ROUTES } from "@/constants/routes";
import BlurFade from "./ui/blur-fade";
import { IAnime } from "@/types/anime";
import { History } from "lucide-react";
import SectionHeading from "./section-heading";
import useBookMarks, { WatchHistory } from "@/hooks/use-get-bookmark";
import { useAuthStore } from "@/store/auth-store";
import { isLocalBackendEnabled } from "@/lib/api";
import { getRecentLocalWatchProgress } from "@/lib/local-watch-progress";

type Props = {
  loading: boolean;
};

interface WatchedAnime extends IAnime {
  episode: WatchHistory | string;
}

const ContinueWatching = (props: Props) => {
  const [anime, setAnime] = useState<WatchedAnime[] | null>(null);

  const { auth } = useAuthStore();
  const { bookmarks } = useBookMarks({
    page: 1,
    per_page: 14,
    status: "watching",
  });

  useEffect(() => {
    if (isLocalBackendEnabled()) {
      const localEntries = getRecentLocalWatchProgress(14);
      const localAnime = localEntries
        .filter((entry) => !!entry.animeId && !!(entry.poster || entry.animeTitle))
        .map((entry) => ({
          id: entry.animeId,
          name: entry.animeTitle || "Continue Watching",
          poster: entry.poster || "/brand/7xanime-mark.svg",
          episode: {
            id: "local",
            user: "local",
            episodeNumber: entry.episodeNumber,
            current: entry.current,
            timestamp: entry.duration,
            created: new Date(entry.updatedAt).toISOString(),
          } as WatchHistory,
        }));
      setAnime(localAnime.length ? (localAnime as WatchedAnime[]) : null);
      return;
    }

    if (!auth) {
      if (typeof window !== "undefined") {
        const storedData = localStorage.getItem("watched");
        const watchedAnimes: {
          anime: { id: string; title: string; poster: string };
          episodes: string[];
        }[] = storedData ? JSON.parse(storedData) : [];

        if (!Array.isArray(watchedAnimes)) {
          localStorage.removeItem("watched");
          return;
        }

        const animes = watchedAnimes.reverse().map((anime) => ({
          id: anime.anime.id,
          name: anime.anime.title,
          poster: anime.anime.poster,
          episode: anime.episodes[anime.episodes.length - 1],
        }));
        setAnime(animes as WatchedAnime[]);
      }
    } else {
      if (bookmarks && bookmarks.length > 0) {
        const animes = bookmarks
          .map((anime) => ({
            id: anime.animeId,
            name: anime.animeTitle,
            poster: anime.thumbnail,
            episode: anime.expand?.watchHistory
              ? anime.expand.watchHistory.sort(
                  (a, b) => b.episodeNumber - a.episodeNumber,
                )[0]
              : null,
          }))
          .filter((item) => !!item.episode);

        setAnime(animes.length > 0 ? (animes as WatchedAnime[]) : null);
      } else {
        setAnime(null);
      }
    }
  }, [auth, bookmarks]);

  if (props.loading) return <LoadingSkeleton />;

  if ((!anime || !anime.length) && !props.loading) return <></>;

  return (
    <Container className="flex flex-col gap-4 py-7 items-center lg:items-start sm:gap-5 sm:py-9">
      <SectionHeading eyebrow="Pick up where you left off" title="Continue Watching" icon={<History className="h-5 w-5 text-violet-400" />} />
      <div className="grid w-full grid-cols-2 content-start gap-x-3 gap-y-5 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
        {anime?.map(
          (ani, idx) =>
            ani.episode && (
              <BlurFade key={idx} delay={idx * 0.05} inView>
                <AnimeCard
                  title={ani.name}
                  poster={ani.poster}
                  className="self-center justify-self-center"
                  href={`${ROUTES.WATCH}?anime=${ani.id}&ep=${typeof ani.episode !== "string" ? ani.episode.episodeNumber : 1}`}
                  watchDetail={
                    typeof ani.episode !== "string" ? ani.episode : null
                  }
                />
              </BlurFade>
            ),
        )}
      </div>
    </Container>
  );
};

const LoadingSkeleton = () => {
  return (
    <Container className="relative z-20 flex flex-col gap-4 py-7 items-center lg:items-start sm:gap-5 sm:py-9">
      <div className="h-10 w-[15.625rem] animate-pulse bg-white/[0.06]"></div>
      <div className="grid w-full grid-cols-2 content-start gap-x-3 gap-y-5 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
        {[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1].map((_, idx) => {
          return (
            <div
              key={idx}
              className="aspect-[2/3] w-full rounded-2xl animate-pulse bg-white/[0.06]"
            ></div>
          );
        })}
      </div>
    </Container>
  );
};

export default ContinueWatching;
