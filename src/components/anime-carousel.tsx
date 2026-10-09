"use client";

import React from "react";
import AnimeCard from "./anime-card";
import { IAnime } from "@/types/anime";
import {
  Carousel,
  CarouselApi,
  CarouselContent,
  CarouselItem,
} from "./ui/carousel";
import Button from "./common/custom-button";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/constants/routes";

type Props = {
  anime: IAnime[];
  title: string;
  className?: string;
};

const AnimeCarousel = (props: Props) => {
  const [api, setApi] = React.useState<CarouselApi>();

  return (
    <div className={cn(["flex flex-col gap-5", props.className])}>
      <div className="w-full flex items-center justify-between">
        <h5 className="text-2xl font-bold">{props.title}</h5>
        <div className="flex items-center gap-5">
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
      <Carousel className="w-full" setApi={setApi} opts={{}}>
        <CarouselContent className="w-full">
          {props.anime?.map((ani, idx) => (
            <CarouselItem
              key={ani.id || idx}
              className="basis-[47%] sm:basis-[31%] md:basis-[23%] lg:basis-[19%] xl:basis-[16%] 2xl:basis-[14%]"
            >
              <AnimeCard
                title={ani.name}
                languageAliases={[ani.jname || ""]}
                format={ani.type}
                href={ROUTES.animeDetails(ani.id)}
                quickWatchHref={ROUTES.watchAnime(ani.id)}
                poster={ani.poster}
                className="w-full min-w-0"
              />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </div>
  );
};

export default AnimeCarousel;
