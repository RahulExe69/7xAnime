"use client";

import React from "react";
import Container from "./container";
import AnimeCard from "./anime-card";

import BlurFade from "./ui/blur-fade";
import { MediaList } from "@/types/miruro-api";
import { ROUTES } from "@/constants/routes";

import Button from "./common/custom-button";
import { ArrowLeft, ArrowRight } from "lucide-react";
import SectionHeading from "./section-heading";

type Props = {
  animeList: MediaList[];
  loading: boolean;
  title: string;
  page?: number;
  hasNextPage?: boolean;
  onPageChange?: (newPage: number) => void;
};

const AnimeSections = ({
  animeList,
  loading,
  title: sectionTitle,
  page = 1,
  hasNextPage = false,
  onPageChange,
}: Props) => {
  if (loading) return <LoadingSkeleton />;
  if (!animeList?.length) {
    return (
      <Container className="flex flex-col gap-4 py-7 sm:py-9">
        <SectionHeading eyebrow="Explore the archive" title={sectionTitle} />
        <div className="w-full rounded-2xl border border-white/[0.07] bg-white/[0.025] px-4 py-8 text-center text-sm text-zinc-400">
          No anime to display right now. Try again in a little while.
        </div>
      </Container>
    );
  }
  return (
    <Container className="flex flex-col gap-4 py-7 items-center lg:items-start sm:gap-5 sm:py-9">
      <SectionHeading eyebrow="Explore the archive" title={sectionTitle} />
      <div className="grid w-full grid-cols-2 content-start gap-x-3 gap-y-5 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
        {animeList.map((anime, idx) => {
          const title =
            anime.title?.english || anime.title?.romaji || anime.title?.native || "Untitled";
          const poster =
            anime.coverImage?.extraLarge || anime.coverImage?.large || "";

          return (
            <BlurFade key={`${anime.id}-${idx}`} delay={idx * 0.03} inView>
              <AnimeCard
                title={title}
                format={anime.format}
                score={anime.averageScore}
                poster={poster}
                className="self-center justify-self-center"
                href={`${ROUTES.ANIME_DETAILS}/${anime.id}`}
              />
            </BlurFade>
          );
        })}
      </div>
      {onPageChange && (
        <div className="flex items-center justify-end w-full gap-3 mt-4">
          <Button
            onClick={() => onPageChange(Math.max(page - 1, 1))}
            disabled={page <= 1}
            className="h-9 w-9 rounded-full border border-white/10 bg-white/5 p-0 hover:bg-violet-500/15 disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4 text-white" />
          </Button>
          <Button
            onClick={() => onPageChange(page + 1)}
            disabled={!hasNextPage}
            className="rounded-full bg-slate-800 border border-slate-700 h-9 w-9 p-0 hover:bg-slate-700 disabled:opacity-40"
          >
            <ArrowRight className="h-4 w-4 text-white" />
          </Button>
        </div>
      )}
    </Container>
  );
};

const LoadingSkeleton = () => {
  return (
    <Container className="flex flex-col gap-4 py-7 items-center lg:items-start sm:gap-5 sm:py-9">
      <div className="h-10 w-[15.625rem] animate-pulse bg-slate-700"></div>
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

export default AnimeSections;
