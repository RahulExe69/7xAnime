import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Play } from "lucide-react";

import { cn, formatSecondsToMMSS } from "@/lib/utils";
import { ROUTES } from "@/constants/routes";
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
  quickWatchHref?: string | null;
  showGenre?: boolean;
  watchDetail?: WatchHistory | null;
  episodeLabel?: string | null;
  statusLabel?: string | null;
};

const formatScore = (score?: number | null) => {
  if (!score || !Number.isFinite(score)) return null;
  return score > 10 ? (score / 10).toFixed(1) : score.toFixed(1);
};

const AnimeCard = ({ displayDetails = true, variant = "sm", ...props }: Props) => {
  const safeCurrent = typeof props.watchDetail?.current === "number" ? props.watchDetail.current : 0;
  const safeTotal = typeof props.watchDetail?.timestamp === "number" && props.watchDetail.timestamp > 0 ? props.watchDetail.timestamp : 0;
  const clampedCurrent = Math.min(safeCurrent, safeTotal);
  const percentage = safeTotal > 0 ? (clampedCurrent / safeTotal) * 100 : 0;
  const score = formatScore(props.score);
  const detailsHref = props.href || ROUTES.HOME;

  return (
    <div className={cn(
      "group relative isolate flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-[#dedbea] bg-white shadow-[0_5px_18px_rgba(37,25,81,0.045)] transition duration-200 hover:-translate-y-0.5 hover:border-[#8b73ed]/65 hover:shadow-[0_9px_26px_rgba(88,68,173,0.12)] dark:border-[#332f47] dark:bg-[#191724] dark:hover:border-[#7565ce]",
      variant === "sm" && "max-w-[11.5rem]",
      variant === "lg" && "max-w-[15rem]",
      props.className,
    )}>
      <div className="relative aspect-[2/3] w-full shrink-0 overflow-hidden bg-[#ebe9f4]">
        <Image
          src={props.poster || "/brand/7xanime-mark.svg"}
          alt={props.title}
          fill
          sizes="(max-width: 640px) 44vw, (max-width: 1024px) 22vw, 180px"
          className="object-cover transition-transform duration-300 group-hover:scale-[1.025]"
          unoptimized
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10" />
        {score && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/80 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm backdrop-blur-sm">
            <span className="text-amber-300">★</span> {score}
          </span>
        )}
        {props.episodeCard && !!props.episodes && (
          <span className="absolute left-2 top-2 rounded-lg bg-[#12111c]/90 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm">
            EP {props.episodes}
          </span>
        )}
        {props.watchDetail && (
          <div className="absolute inset-x-2 bottom-2 flex flex-col gap-1 rounded-xl bg-black/80 px-2.5 py-2 text-[11px] font-semibold text-white backdrop-blur-sm">
            <span>Ep {props.watchDetail.episodeNumber} · {formatSecondsToMMSS(props.watchDetail.current)} left in session</span>
            <Progress value={percentage} className="h-1 bg-white/25" />
          </div>
        )}
        {props.episodeLabel && !props.watchDetail && (
          <span className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-lg bg-black/80 px-2.5 py-1.5 text-[11px] font-bold text-white backdrop-blur-sm">
            {props.episodeLabel}
          </span>
        )}
        <Link href={detailsHref} aria-label={`View details for ${props.title}`} className="absolute inset-0 z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#6b55d9]">
          <span className="sr-only">View details for {props.title}</span>
        </Link>
        {props.quickWatchHref && (
          <Link href={props.quickWatchHref} title={`Watch ${props.title} now`} aria-label={`Watch ${props.title} now`} className="absolute bottom-2 right-2 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/35 bg-[#604bd3] text-white shadow-lg shadow-black/30 transition hover:scale-105 hover:bg-[#5038c4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:h-10 sm:w-10 sm:group-hover:w-auto sm:group-hover:rounded-full sm:group-hover:px-3">
            <Play className="ml-0.5 h-4 w-4 fill-current" />
            <span className="hidden pl-1 text-xs font-bold sm:group-hover:inline">Watch now</span>
          </Link>
        )}
      </div>

      {displayDetails && (
        <div className="flex min-h-[108px] flex-1 flex-col gap-2.5 px-3 py-3 sm:min-h-[118px] sm:px-3.5">
          <h3 className="line-clamp-2 min-h-[2.6em] text-[13px] font-bold leading-[1.3] text-[#1e1b32] dark:text-white sm:text-[15px]">
            {props.title}
          </h3>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#716d85] dark:text-[#aaa5c0] sm:text-xs">
            {score && <span className="font-bold text-[#b49a0b]">★ {score}</span>}
            {props.format && <span>{props.format}</span>}
            {!!props.episodes && <span>{props.episodes} ep</span>}
            {props.statusLabel && <span>{props.statusLabel}</span>}
          </div>
          {props.watchDetail && (
            <div className="mt-auto flex flex-col gap-1.5">
              <p className="text-[10px] text-[#716d85] dark:text-[#aaa5c0]">Episode {props.watchDetail.episodeNumber} · {formatSecondsToMMSS(props.watchDetail.current)} / {formatSecondsToMMSS(props.watchDetail.timestamp)}</p>
              <Progress value={percentage} className="h-1.5 bg-[#e8e5f1]" />
            </div>
          )}
          {props.subTitle && <p className="line-clamp-1 text-[11px] text-[#716d85] dark:text-[#aaa5c0]">{props.subTitle}</p>}
        </div>
      )}
    </div>
  );
};

export default AnimeCard;