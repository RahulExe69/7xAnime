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
import { ArrowLeft, ArrowRight, Play } from "lucide-react";

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
  const [selectedSlide, setSelectedSlide] = React.useState(0);

  React.useEffect(() => {
    if (!api) return;
    const updateSelected = () => setSelectedSlide(api.selectedScrollSnap());
    updateSelected();
    api.on("select", updateSelected);
    api.on("reInit", updateSelected);
    return () => {
      api.off("select", updateSelected);
      api.off("reInit", updateSelected);
    };
  }, [api]);

  if (props.isDataLoading || !props.spotlightAnime?.length)
    return <LoadingSkeleton />;

  return (
    <div className="relative h-[62svh] min-h-[420px] max-h-[600px] w-full overflow-hidden md:h-[76vh] md:min-h-[540px] md:max-h-[720px]">
      <Carousel className="h-full w-full" setApi={setApi} opts={{ loop: true }}>
        <CarouselContent className="h-full">
          {props.spotlightAnime.map((anime, index) => (
            <CarouselItem key={anime.id || index} className="h-full">
              <HeroCarouselItem anime={anime} />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
      <div className="absolute bottom-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 md:bottom-5">
        {props.spotlightAnime.map((anime, index) => (
          <button key={anime.id || index} type="button" aria-label={`Show spotlight ${index + 1}`} aria-current={selectedSlide === index ? "true" : undefined} onClick={() => api?.scrollTo(index)} className={`h-2 rounded-full transition-all duration-200 ${selectedSlide === index ? "w-7 bg-[#ff3b72]" : "w-2 bg-[#d49aaf]/30 hover:bg-[#d49aaf]/55 dark:bg-white/25 dark:hover:bg-white/50"}`} />
        ))}
      </div>
      <div className="absolute hidden md:flex items-center gap-5 right-10 3xl:bottom-10 bottom-20 z-50 isolate">
        <Button
          onClick={() => {
            api?.scrollPrev();
          }}
          className="h-10 w-10 rounded-full border border-white/20 bg-black/40 text-white backdrop-blur hover:bg-[#ff3b72]"
        >
          <ArrowLeft className="shrink-0" />
        </Button>
        <Button
          onClick={() => api?.scrollNext()}
          className="rounded-full border border-white/25 bg-black/25 text-white backdrop-blur h-10 w-10 hover:border-[#ff3b72]/70 hover:bg-[#ff3b72]"
        >
          <ArrowRight className="shrink-0" />
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
      className="relative h-[62svh] min-h-[420px] max-h-[600px] w-full bg-cover bg-center bg-no-repeat md:h-[76vh] md:min-h-[540px] md:max-h-[720px]"
      style={{ backgroundImage: `url(${bgImage})` }}
    >
      {/* Gradient Overlay */}
      <div className="absolute h-full w-full inset-0 m-auto bg-gradient-to-r from-black/75 via-black/40 to-transparent z-10"></div>
      <div className="absolute h-full w-full inset-0 m-auto bg-gradient-to-t from-[#0b0307] via-[#0b0307]/30 to-transparent z-10"></div>

      {/* Content Section */}
      <div className="relative z-20 h-full w-full">
        <Container className="flex h-full w-full flex-col justify-end pb-12 pt-24 md:justify-center md:pb-10 md:pt-20">
          <div className="max-w-2xl space-y-3 md:space-y-4 lg:w-[48vw]">
            <h1 className="line-clamp-3 max-w-[13ch] text-[2rem] font-black leading-[1.08] tracking-[-0.035em] text-white drop-shadow-2xl sm:max-w-[16ch] sm:text-4xl md:line-clamp-2 md:text-5xl lg:text-6xl">
              {title}
            </h1>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {anime.format && (
                <Badge className="border-0 bg-[#ff3b72] text-white font-semibold">
                  {anime.format}
                </Badge>
              )}
              {anime.seasonYear && (
                <Badge variant="outline" className="text-gray-100 border-white/35">
                  {anime.season ? `${anime.season} ` : ""}{anime.seasonYear}
                </Badge>
              )}
              {!!anime.averageScore && (
                <Badge variant="secondary" className="bg-black/40 text-yellow-200 border border-yellow-300/30">
                  ⭐ {(anime.averageScore > 10 ? anime.averageScore / 10 : anime.averageScore).toFixed(1)}
                </Badge>
              )}
              {anime.genres?.slice(0, 3).map((g) => (
                <span key={g} className="text-gray-400 text-xs">
                  • {g}
                </span>
              ))}
            </div>

            <div className="!mt-6 flex flex-wrap items-center gap-3">
              <ButtonLink
                href={ROUTES.watchAnime(anime.id)}
                LeftIcon={Play}
                className="h-12 rounded-xl bg-[#ff3b72] px-5 text-sm font-bold text-white shadow-lg shadow-[#ff3b72]/25 transition hover:bg-[#ed245c]"
              >
                Watch Now
              </ButtonLink>
              <ButtonLink
                href={ROUTES.animeDetails(anime.id)}
                className="h-12 rounded-xl border border-white/30 bg-black/20 px-5 text-sm font-semibold text-white backdrop-blur transition hover:bg-black/35"
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
    <div className="relative h-[62svh] min-h-[420px] max-h-[600px] w-full overflow-hidden md:h-[76vh] md:min-h-[540px] md:max-h-[720px]">
      <div className="relative z-20 h-full w-full">
        <Container className="flex h-full w-full flex-col justify-end pb-12 pt-24 md:justify-center md:pb-10 md:pt-20">
          <div className="space-y-2 lg:w-[40vw]">
            <div className="h-16 w-[75%] animate-pulse rounded-2xl bg-white/[0.08]"></div>
            <div className="h-24 w-full animate-pulse rounded-xl bg-white/[0.06]"></div>
            <div className="flex items-center gap-5">
              <span className="h-10 w-[7.5rem] animate-pulse rounded-xl bg-white/[0.08]"></span>
              <span className="h-10 w-[7.5rem] animate-pulse bg-slate-700"></span>
            </div>
          </div>
        </Container>
      </div>
      <div className="absolute hidden md:flex items-center gap-5 right-10 bottom-32 z-50 isolate">
        <span className="h-10 w-10 animate-pulse rounded-full bg-white/[0.08]"></span>
        <span className="h-10 w-10 rounded-full animate-pulse bg-slate-700"></span>
      </div>
    </div>
  );
};
export default HeroSection;
