"use client";

import {
  Carousel,
  CarouselApi,
  CarouselContent,
  CarouselItem,
} from "./ui/carousel";

import Container from "./container";
import { Button } from "./ui/button";

import React from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { ROUTES } from "@/constants/routes";
import { ButtonLink } from "./common/button-link";
import { MediaList } from "@/types/miruro-api";
import { Badge } from "./ui/badge";

type IHeroSectionProps = {
  spotlightAnime: MediaList[];
  isDataLoading: boolean;
};

const HeroSection = (props: IHeroSectionProps) => {
  const [api, setApi] = React.useState<CarouselApi>();

  if (props.isDataLoading || !props.spotlightAnime?.length)
    return <LoadingSkeleton />;

  return (
    <div className="relative h-[64svh] min-h-[430px] max-h-[700px] w-full md:h-[78vh] md:min-h-[560px]">
      <Carousel className="w-full" setApi={setApi} opts={{ loop: true }}>
        <CarouselContent>
          {props.spotlightAnime.map((anime, index) => (
            <CarouselItem key={anime.id || index}>
              <HeroCarouselItem anime={anime} />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
      <div className="absolute hidden md:flex items-center gap-5 right-10 3xl:bottom-10 bottom-24 z-50 isolate">
        <Button
          onClick={() => {
            api?.scrollPrev();
          }}
          className="rounded-full bg-transparent border border-white h-10 w-10 hover:bg-slate-500"
        >
          <ArrowLeft className="text-white shrink-0" />
        </Button>
        <Button
          onClick={() => api?.scrollNext()}
          className="rounded-full bg-transparent border border-white h-10 w-10 hover:bg-slate-500"
        >
          <ArrowRight className="text-white shrink-0" />
        </Button>
      </div>
    </div>
  );
};

const HeroCarouselItem = ({ anime }: { anime: MediaList }) => {
  const bgImage =
    anime.bannerImage ||
    anime.coverImage?.extraLarge ||
    anime.coverImage?.large ||
    "";
  const title =
    anime.title?.english || anime.title?.romaji || anime.title?.native || "Untitled";

  return (
    <div
      className="relative h-[64svh] min-h-[430px] max-h-[700px] w-full bg-cover bg-center bg-no-repeat md:h-[78vh] md:min-h-[560px]"
      style={{ backgroundImage: `url(${bgImage})` }}
    >
      {/* Gradient Overlay */}
      <div className="absolute h-full w-full inset-0 m-auto bg-gradient-to-r from-[#09090f]/95 via-[#09090f]/65 to-transparent z-10"></div>
      <div className="absolute h-full w-full inset-0 m-auto bg-gradient-to-t from-[#09090f] via-[#09090f]/20 to-transparent z-10"></div>

      {/* Content Section */}
      <div className="relative z-20 h-full w-full">
        <Container className="flex h-full w-full flex-col justify-end pb-12 pt-24 md:justify-center md:pb-10 md:pt-20">
          <div className="max-w-2xl space-y-3 md:space-y-4 lg:w-[48vw]">
            <h1 className="line-clamp-3 text-3xl font-black leading-tight tracking-tight text-white drop-shadow-2xl sm:text-4xl md:line-clamp-2 md:text-5xl lg:text-6xl">
              {title}
            </h1>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {anime.format && (
                <Badge className="border-0 bg-violet-500/90 text-white font-semibold">
                  {anime.format}
                </Badge>
              )}
              {anime.seasonYear && (
                <Badge variant="outline" className="text-gray-300 border-gray-600">
                  {anime.season ? `${anime.season} ` : ""}{anime.seasonYear}
                </Badge>
              )}
              {!!anime.averageScore && (
                <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-300 border border-yellow-500/40">
                  ⭐ {anime.averageScore}% Score
                </Badge>
              )}
              {anime.genres?.slice(0, 3).map((g) => (
                <span key={g} className="text-gray-400 text-xs">
                  • {g}
                </span>
              ))}
            </div>

            <div className="flex items-center gap-5 !mt-6">
              <ButtonLink
                href={ROUTES.animeDetails(anime.id)}
                className="h-10 rounded-xl bg-violet-500 px-5 text-sm font-semibold text-white shadow-lg shadow-violet-950/30 transition-colors hover:bg-violet-400"
              >
                View Details
              </ButtonLink>
            </div>
          </div>
        </Container>
      </div>
    </div>
  );
};

const LoadingSkeleton = () => {
  return (
    <div className="relative h-[64svh] min-h-[430px] max-h-[700px] w-full md:h-[78vh] md:min-h-[560px]">
      <div className="relative z-20 h-full w-full">
        <Container className="flex h-full w-full flex-col justify-end pb-12 pt-24 md:justify-center md:pb-10 md:pt-20">
          <div className="space-y-2 lg:w-[40vw]">
            <div className="h-16 animate-pulse bg-slate-700 w-[75%]"></div>
            <div className="h-40 animate-pulse w-full bg-slate-700"></div>
            <div className="flex items-center gap-5">
              <span className="h-10 w-[7.5rem] animate-pulse bg-slate-700"></span>
              <span className="h-10 w-[7.5rem] animate-pulse bg-slate-700"></span>
            </div>
          </div>
        </Container>
      </div>
      <div className="absolute hidden md:flex items-center gap-5 right-10 bottom-32 z-50 isolate">
        <span className="h-10 w-10 rounded-full animate-pulse bg-slate-700"></span>
        <span className="h-10 w-10 rounded-full animate-pulse bg-slate-700"></span>
      </div>
    </div>
  );
};
export default HeroSection;
