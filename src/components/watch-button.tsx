"use client";

import React from "react";
import { CirclePlay } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { ButtonLink } from "./common/button-link";
import { useHasAnimeWatched } from "@/hooks/use-is-anime-watched";
import { useGetLastEpisodeWatched } from "@/hooks/use-get-last-episode-watched";

type Props = {
  animeId: string;
};

const WatchButton = ({ animeId }: Props) => {
  const { hasWatchedAnime } = useHasAnimeWatched(animeId);
  const latestEpisodeWatched = useGetLastEpisodeWatched(animeId);

  const watchParams = new URLSearchParams({ anime: animeId });
  if (hasWatchedAnime && latestEpisodeWatched) {
    watchParams.set("episode", latestEpisodeWatched);
  }

  return (
    <ButtonLink
      href={`${ROUTES.WATCH}?${watchParams.toString()}`}
      className="max-w-fit text-base"
      LeftIcon={CirclePlay}
    >
      {hasWatchedAnime && latestEpisodeWatched ? "Continue Watching" : "Start Watching"}
    </ButtonLink>
  );
};

export default WatchButton;
