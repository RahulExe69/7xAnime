"use client";

import parse from "html-react-parser";
import { ROUTES } from "@/constants/routes";

import Container from "@/components/container";
import AnimeCard from "@/components/anime-card";
import { useAnimeStore } from "@/store/anime-store";

import EpisodePlaylist from "@/components/episode-playlist";
import Select, { ISelectOptions } from "@/components/common/select";
import {
  Ban,
  BookmarkCheck,
  CheckCheck,
  Hand,
  TvMinimalPlay,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useGetAnimeDetails } from "@/query/get-anime-details";
import React, { ReactNode, Suspense, useEffect, useState } from "react";
import AnimeCarousel from "@/components/anime-carousel";
import { IAnime } from "@/types/anime";
import useBookMarks from "@/hooks/use-get-bookmark";
import { toast } from "sonner";
import { useGetAllEpisodes } from "@/query/get-all-episodes";
import CommentsSection from "@/components/comments/comments-section";

type Props = {
  children: ReactNode;
};

const WatchLayoutFallback = () => (
  <div role="status" aria-live="polite" className="mx-auto mt-3 w-full max-w-screen-2xl px-3 sm:px-5">
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
      <div className="space-y-3 lg:col-span-3">
        <div className="aspect-video w-full animate-pulse rounded-2xl bg-[#171421]" />
        <div className="h-10 w-full animate-pulse rounded-xl bg-[#171421]" />
      </div>
      <div className="space-y-2 rounded-2xl border border-white/[0.06] bg-[#101018] p-3">
        <div className="h-5 w-24 animate-pulse rounded bg-white/[0.06]" />
        {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-11 animate-pulse rounded-xl bg-white/[0.04]" />)}
      </div>
    </div>
  </div>
);

const Layout = (props: Props) => (
  <Suspense fallback={<WatchLayoutFallback />}>
    <LayoutContent {...props} />
  </Suspense>
);

const LayoutContent = (props: Props) => {
  const searchParams = useSearchParams();
  const { setAnime, selectedEpisode, setSelectedEpisode } = useAnimeStore();
  const router = useRouter();

  const currentAnimeId = searchParams.get("anime");
  const animeId = currentAnimeId;
  const episodeId = searchParams.get("episode");

  const epNumberParam = searchParams.get("ep");
  const currentEpNum = epNumberParam ? Number(epNumberParam) : 1;

  const { data: anime } = useGetAnimeDetails(animeId as string);

  useEffect(() => {
    if (anime) {
      setAnime(anime);
    }
  }, [anime, setAnime]);

  useEffect(() => {
    // Derive animeId directly from the URL; mirroring it in local state can
    // briefly leave an old/null ID during navigation and redirect a valid
    // Start Watching transition back to the homepage.
    if (!animeId && typeof window !== "undefined") {
      router.replace(ROUTES.HOME);
    }
  }, [animeId, router]);

  const { bookmarks, createOrUpdateBookMark } = useBookMarks({
    animeID: currentAnimeId as string,
    page: 1,
    per_page: 1,
  });
  const [selected, setSelected] = useState<string>("Plan to Watch");

  useEffect(() => {
    if (bookmarks?.[0]?.status) {
      setSelected(bookmarks[0].status);
    }
  }, [bookmarks]);

  const SelectOptions: ISelectOptions[] = [
    {
      label: "Watching",
      value: "watching",
      icon: TvMinimalPlay,
    },
    {
      label: "Plan to watch",
      value: "plan_to_watch",
      icon: BookmarkCheck,
    },
    {
      label: "On Hold",
      value: "on_hold",
      icon: Hand,
    },
    {
      label: "Completed",
      value: "completed",
      icon: CheckCheck,
    },
    {
      label: "Dropped",
      value: "dropped",
      icon: Ban,
    },
  ];

  const handleSelect = async (value: string) => {
    if (!anime?.anime.info.name || !anime?.anime.info.poster) return;
    const previousSelected = selected;
    setSelected(value);

    try {
      await createOrUpdateBookMark(
        currentAnimeId as string,
        anime?.anime.info.name!,
        anime?.anime.info.poster!,
        value,
      );
    } catch (error) {
      console.log(error);
      setSelected(previousSelected);
      toast.error("Error adding to list", { style: { background: "red" } });
    }
  };

  const { data: episodes, isLoading: episodeLoading } = useGetAllEpisodes(
    animeId as string,
  );

  // Track the selected episode for highlighting, but do not rewrite an
  // episode-number URL into a provider-specific URL during initial discovery.
  // The Android player can start its auto route immediately while the provider
  // list is still loading, and URL replacement here used to restart that work.
  useEffect(() => {
    if (episodeId) {
      if (selectedEpisode !== episodeId) setSelectedEpisode(episodeId);
      return;
    }
    if (!episodes?.episodes?.length) return;
    const epNum = epNumberParam ? Number(epNumberParam) : 1;
    const matchedEp =
      episodes.episodes.find((episode) => Number(episode.number) === epNum) || episodes.episodes[0];
    if (matchedEp?.episodeId && selectedEpisode !== matchedEp.episodeId) {
      setSelectedEpisode(matchedEp.episodeId);
    }
  }, [episodes, episodeId, epNumberParam, selectedEpisode, setSelectedEpisode]);

  return (
      <Container className="mt-3 space-y-5 pb-12 sm:mt-5 md:mt-6 md:space-y-7">
        <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-4 lg:gap-5">
          <div className="lg:col-span-3 col-span-1 lg:mb-0">
            {props.children}
          </div>
          {episodes ? (
            <EpisodePlaylist
              animeId={animeId as string}
              title={anime?.anime.info.name || "Episodes"}
              subOrDub={anime?.anime.info.stats.episodes}
              episodes={episodes}
              isLoading={episodeLoading}
              bookmarks={bookmarks}
            />
          ) : (
            <div className="min-h-[260px] max-h-[58vh] space-y-3 overflow-hidden rounded-2xl border border-white/10 bg-[#101018] p-3 lg:min-h-[500px]">
              <div className="h-5 w-24 animate-pulse rounded bg-white/[0.06]" />
              <div className="h-9 w-full animate-pulse rounded-xl bg-white/[0.05]" />
              {Array.from({ length: 7 }, (_, index) => <div key={index} className="h-11 animate-pulse rounded-xl bg-white/[0.04]" />)}
            </div>
          )}
        </div>
        {anime?.anime.info ? (
          <>
        <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-[#101018] p-3 sm:flex-row sm:items-start sm:gap-4">
          <AnimeCard
            title={anime?.anime.info.name}
            poster={anime?.anime.info.poster}
            subTitle={anime?.anime.moreInfo.aired}
            displayDetails={false}
            className="!rounded-xl"
            href={ROUTES.animeDetails(anime?.anime.info.id || "")}
          />
          <div className="flex min-w-0 flex-col gap-3">
            <Select
              placeholder="Add to list"
              value={selected}
              options={SelectOptions}
              onChange={handleSelect}
            />
            <h1 className="z-[100] text-xl font-bold tracking-tight sm:text-2xl">
              {anime?.anime.info.name}
            </h1>
            <p className="line-clamp-3 text-sm leading-6 text-zinc-300">{parse(anime?.anime.info.description as string)}</p>
          </div>
        </div>


            <CommentsSection
              animeId={animeId as string}
              animeTitle={anime.anime.info.name || "Anime"}
              episodeNumber={currentEpNum}
            />

            <AnimeCarousel
              title={"Also Watch"}
              anime={anime.relatedAnimes as IAnime[]}
            />
            <AnimeCarousel
              title={"Recommended"}
              anime={anime.recommendedAnimes as IAnime[]}
            />
          </>
        ) : null}
      </Container>
    );
};

export default Layout;
