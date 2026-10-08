"use client";
import React, { Suspense, useEffect, useState } from "react";
import Image from "next/image";

import parse from "html-react-parser";
import Container from "@/components/container";
import AnimeCard from "@/components/anime-card";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import WatchButton from "@/components/watch-button";
import { IAnime } from "@/types/anime";
import AnimeCarousel from "@/components/anime-carousel";
import AnimeEpisodes from "@/components/anime-episodes";
import CharacterCard from "@/components/common/character-card";
import { ROUTES } from "@/constants/routes";
import WatchTrailer from "@/components/watch-trailer";
import Select, { ISelectOptions } from "@/components/common/select";
import {
  Ban,
  BookmarkCheck,
  CheckCheck,
  Hand,
  Heart,
  TvMinimalPlay,
} from "lucide-react";
import { useGetAnimeDetails } from "@/query/get-anime-details";
import { useSearchParams } from "next/navigation";
import Loading from "@/app/loading";
import { useAuthStore } from "@/store/auth-store";
import { toast } from "sonner";
import useBookMarks from "@/hooks/use-get-bookmark";

const SelectOptions: ISelectOptions[] = [
  {
    value: "plan to watch",
    label: "Plan to Watch",
    icon: BookmarkCheck,
  },
  {
    value: "watching",
    label: "Watching",
    icon: TvMinimalPlay,
  },
  {
    value: "completed",
    label: "Completed",
    icon: CheckCheck,
  },
  {
    value: "on hold",
    label: "On Hold",
    icon: Hand,
  },
  {
    value: "dropped",
    label: "Dropped",
    icon: Ban,
  },
];

const PageContent = () => {
  const searchParams = useSearchParams();
  const slug = searchParams.get("id") || "";

  const { data: anime, isLoading } = useGetAnimeDetails(slug as string);
  const { auth } = useAuthStore();
  const { bookmarks, createOrUpdateBookMark } = useBookMarks({
    animeID: slug as string,
    page: 1,
    per_page: 1,
  });
  const [selected, setSelected] = useState(bookmarks?.[0]?.status || "");

  useEffect(() => {
    const currentStatus = bookmarks?.[0]?.status;
    if (currentStatus && currentStatus !== selected) {
      setSelected(currentStatus);
    }
  }, [bookmarks, selected]);

  const handleSelect = async (value: string) => {
    if (!auth) {
      return;
    }
    const previousSelected = selected;
    setSelected(value);

    try {
      await createOrUpdateBookMark(
        slug as string,
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

  return isLoading || !anime ? (
    <Loading />
  ) : (
    <div className="relative z-10 w-full pb-8">
      <div className="relative h-[26vh] min-h-[190px] w-full overflow-hidden md:h-[34vh] md:min-h-[280px]">
        <Image
          src={
            anime.anime.info.bannerImage || anime.anime.info.poster
          }
          alt={anime.anime.info.name}
          height={100}
          width={100}
          className="h-full w-full object-cover opacity-80"
          unoptimized
        />

        <WatchTrailer
          videoHref={anime.anime.info.promotionalVideos[0]?.source}
        />
        <div className="absolute inset-0 m-auto h-full w-full bg-gradient-to-r from-[#09090f]/95 via-[#09090f]/45 to-transparent"></div>
      </div>
      <Container className="relative z-10 -mt-16 space-y-7 pb-16 md:-mt-24 md:space-y-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:gap-6 md:gap-8">
          <AnimeCard
            title={anime.anime.info.name}
            poster={anime.anime.info.poster}
            href={ROUTES.animeDetails(anime.anime.info.id)}
            displayDetails={false}
            variant="lg"
            className="shrink-0"
          />
          <div className="flex min-w-0 flex-col gap-3 pb-2 sm:pb-4">
            <h1 className="z-[9] text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl md:text-4xl">
              {anime.anime.info.name}
            </h1>
            <div className="flex flex-wrap items-center gap-3">
              <WatchButton />
              {auth && (
                <Select
                  placeholder="Add to list"
                  value={bookmarks?.[0]?.status || selected}
                  options={SelectOptions}
                  onChange={handleSelect}
                  placeholderIcon={Heart}
                />
              )}
            </div>
          </div>
        </div>
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="flex h-fit w-full items-center justify-start gap-1 overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.025] p-1 text-base">
            <TabsTrigger
              value="overview"
              className="rounded-lg px-3 py-2 text-sm font-semibold sm:text-base"
            >
              Overview
            </TabsTrigger>

            <TabsTrigger
              value="episodes"
              className="md:text-2xl text-lg font-semibold"
            >
              Episodes
            </TabsTrigger>
            {anime.anime.info.charactersVoiceActors.length > 0 && (
              <TabsTrigger
                value="characters"
                className="md:text-2xl text-lg font-semibold"
              >
                Characters
              </TabsTrigger>
            )}
            {anime.seasons.length > 0 && (
              <TabsTrigger
                value="relations"
                className="md:text-2xl text-lg font-semibold"
              >
                Relations
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent
            value="overview"
            className="mt-6 grid w-full grid-cols-1 gap-x-10 gap-y-7 md:grid-cols-5 md:gap-y-5"
          >
            <div className="col-span-1 flex w-full flex-col gap-4">
              <h3 className="text-xl font-semibold">Details</h3>
              <div className="grid w-full grid-cols-[90px_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs sm:text-sm md:grid-cols-2 md:gap-x-2">
                <h3>Aired</h3>
                <span>{anime.anime.moreInfo.aired}</span>

                <h3>Rating</h3>
                <span>{anime.anime.info.stats.rating}</span>

                <h3>Genres</h3>
                <span>{anime.anime.moreInfo.genres.join(", ")}</span>

                <h3>Type</h3>
                <span>{anime.anime.info.stats.type}</span>

                <h3>Status</h3>
                <span>{anime.anime.moreInfo.status}</span>

                <h3>Season</h3>
                <span className="capitalize">{}</span>

                <h3>Studios</h3>
                <span>{anime.anime.moreInfo.studios}</span>
              </div>
            </div>
            <div className="col-span-4 flex flex-col gap-3">
              <h3 className="text-xl font-semibold">Description</h3>
              <div className="text-sm leading-7 text-zinc-300">
                {parse(anime.anime.info.description || "")}
              </div>
            </div>
          </TabsContent>

          <TabsContent
            value="relations"
            className="flex w-full flex-col gap-4"
          >
            <h3 className="text-xl font-semibold">Relations</h3>
            <div className="grid w-full grid-cols-2 content-start gap-x-3 gap-y-5 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
              {anime.seasons.map((relation, idx) => {
                return (
                  !relation.isCurrent && (
                    <AnimeCard
                      key={idx}
                      title={relation.name}
                      subTitle={relation.title}
                      poster={relation.poster}
                      className="self-center justify-self-center"
                      href={ROUTES.animeDetails(relation.id)}
                    />
                  )
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="episodes" className="flex flex-col gap-5">
            <AnimeEpisodes animeId={anime.anime.info.id} />
          </TabsContent>
          {!!anime.anime.info.charactersVoiceActors.length && (
            <TabsContent
              value="characters"
              className="w-full flex flex-col gap-5 "
            >
              <h3 className="text-xl font-semibold">Anime Characters</h3>
              <div className="grid lg:grid-cols-5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7 w-full gap-5 content-center">
                {anime.anime.info.charactersVoiceActors.map(
                  (character, idx) => {
                    return (
                      <CharacterCard
                        key={idx}
                        character={character}
                        className="self-center justify-self-center"
                      />
                    );
                  },
                )}
              </div>
            </TabsContent>
          )}
        </Tabs>

        {!!anime.recommendedAnimes.length && (
          <AnimeCarousel
            anime={anime.recommendedAnimes as IAnime[]}
            title="Recommended"
            className="pt-20"
          />
        )}
      </Container>
    </div>
  );
  //eslint-disable-next-line
};

const Page = () => (
  <Suspense fallback={<Loading />}>
    <PageContent />
  </Suspense>
);

export default Page;
