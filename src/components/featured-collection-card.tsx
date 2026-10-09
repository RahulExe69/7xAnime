import React from "react";
import AnimeCard from "./anime-card";
import { MediaList } from "@/types/miruro-api";
import { ROUTES } from "@/constants/routes";

type Props = {
  title: string;
  anime: MediaList[];
};

const FeaturedCollectionCard = (props: Props) => {
  if (!props.anime || props.anime.length < 3) return null;

  return (
    <div className="flex h-[17rem] w-full flex-col items-center gap-2 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#111019] sm:h-[18rem]">
      <h5 className="pt-4 text-center text-sm font-semibold sm:text-base">{props.title}</h5>
      <div className="w-full relative grow flex">
        {props.anime.slice(0, 3).map((item, index) => {
          const title = item.title?.english || item.title?.romaji || item.title?.native || "Untitled";
          const poster = item.coverImage?.extraLarge || item.coverImage?.large || "";
          const classNames = [
            "absolute md:bottom-[-5.25rem] bottom-[-4.25rem] left-[15%] rotate-[-20deg] w-[9.375rem] border-[.50rem] border-[#111019]",
            "absolute md:bottom-[-6.25rem] bottom-[-5rem] rotate-[-10deg] left-[30%] w-[9.375rem] border-[.50rem] border-[#212121]",
            "absolute md:bottom-[-6.25rem] bottom-[-6rem] left-[45%] rotate-[5deg] w-[9.375rem] border-[.50rem] border-[#212121]",
          ];

          return (
            <AnimeCard
              key={item.id || index}
              title={title}
              format={item.format}
              score={item.averageScore}
              className={classNames[index]}
              poster={poster}
              href={ROUTES.animeDetails(item.id)}
              quickWatchHref={ROUTES.watchAnime(item.id)}
            />
          );
        })}
      </div>
    </div>
  );
};

export default FeaturedCollectionCard;
