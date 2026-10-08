import React from "react";
import Link from "next/link";
import Image from "next/image";

import { cn, formatSecondsToMMSS } from "@/lib/utils";
import { Badge } from "./ui/badge";
import { WatchHistory } from "@/hooks/use-get-bookmark";
import { Progress } from "./ui/progress";

type Props = {
  className?: string;
  poster: string;
  title: string;
  episodeCard?: boolean;
  episodes?: number | null;
  score?: number | null;
  format?: string | null;
  subTitle?: string;
  displayDetails?: boolean;
  variant?: "sm" | "lg";
  href?: string;
  showGenre?: boolean;
  watchDetail?: WatchHistory | null;
};

const AnimeCard = ({
  displayDetails = true,
  variant = "sm",
  ...props
}: Props) => {
  const safeCurrent =
    typeof props.watchDetail?.current === "number"
      ? props.watchDetail.current
      : 0;
  const safeTotal =
    typeof props.watchDetail?.timestamp === "number" &&
    props.watchDetail.timestamp > 0
      ? props.watchDetail.timestamp
      : 0;

  const clampedCurrent = Math.min(safeCurrent, safeTotal);
  const percentage = safeTotal > 0 ? (clampedCurrent / safeTotal) * 100 : 0;

  return (
    <Link href={props.href as string} className="block w-full">
      <div
        className={cn([
          "group relative w-full overflow-hidden rounded-2xl border border-white/[0.06] bg-zinc-900 shadow-sm transition duration-200 ease-out hover:-translate-y-1 hover:border-violet-400/30 hover:shadow-xl hover:shadow-violet-950/20",
          variant === "sm" && "aspect-[2/3] min-w-0 max-w-[11.5rem]",
          variant === "lg" && "aspect-[2/3] h-auto w-full max-w-[9rem] shrink-0 sm:max-w-[11rem] md:aspect-auto md:h-[22rem] md:max-w-[15rem] lg:w-[15rem]",
          props.className,
        ])}
      >
        <Image
          src={props.poster}
          alt={props.title}
          height={100}
          width={100}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          unoptimized
        />
        {displayDetails && (
          <>
            <div className="absolute inset-0 m-auto h-full w-full bg-gradient-to-t from-black/95 via-black/20 to-transparent"></div>
            <div className="absolute bottom-0 flex w-full flex-col gap-1 px-2.5 pb-2.5 sm:px-3 sm:pb-3">
              <h5 className="line-clamp-2 text-xs font-semibold leading-snug text-white sm:text-sm">{props.title}</h5>
              {props.watchDetail && (
                <>
                  <p className="text-xs text-gray-400">
                    Episode {props.watchDetail.episodeNumber} -{" "}
                    {formatSecondsToMMSS(props.watchDetail.current)} /{" "}
                    {formatSecondsToMMSS(props.watchDetail.timestamp)}
                  </p>
                  <Progress value={percentage} />
                </>
              )}
              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                {props.episodeCard && !!props.episodes && (
                  <Badge className="border-0 bg-violet-500/90 px-1.5 py-0.5 text-[10px] text-white">
                    Ep {props.episodes}
                  </Badge>
                )}
                {props.format && (
                  <Badge variant="outline" className="border-white/20 bg-black/35 px-1.5 py-0.5 text-[10px] text-zinc-200">
                    {props.format}
                  </Badge>
                )}
                {!!props.score && (
                  <span className="text-[11px] font-semibold text-yellow-400 ml-auto">
                    ⭐ {props.score}%
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Link>
  );
};

export default AnimeCard;

