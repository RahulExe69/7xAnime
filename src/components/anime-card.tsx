import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Play } from "lucide-react";

import { cn, formatSecondsToMMSS } from "@/lib/utils";
import { ROUTES } from "@/constants/routes";
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
  quickWatchHref?: string | null;
  showGenre?: boolean;
  watchDetail?: WatchHistory | null;
};

const AnimeCard = ({ displayDetails = true, variant = "sm", ...props }: Props) => {
  const safeCurrent = typeof props.watchDetail?.current === "number" ? props.watchDetail.current : 0;
  const safeTotal = typeof props.watchDetail?.timestamp === "number" && props.watchDetail.timestamp > 0 ? props.watchDetail.timestamp : 0;
  const clampedCurrent = Math.min(safeCurrent, safeTotal);
  const percentage = safeTotal > 0 ? (clampedCurrent / safeTotal) * 100 : 0;
  const detailsHref = props.href || ROUTES.HOME;

  return (
    <div className={cn([
      "group relative isolate w-full overflow-hidden rounded-2xl border border-white/[0.07] bg-[#111018] shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[#ff2f9d]/35 hover:shadow-xl hover:shadow-[#ff2f9d]/10",
      variant === "sm" && "aspect-[2/3] min-w-0 max-w-[11.5rem]",
      variant === "lg" && "aspect-[2/3] h-auto w-full max-w-[9rem] shrink-0 sm:max-w-[11rem] md:aspect-auto md:h-[22rem] md:max-w-[15rem] lg:w-[15rem]",
      props.className,
    ])}>
      <Image src={props.poster || "/brand/7xanime-mark.svg"} alt={props.title} height={100} width={100} sizes="(max-width: 640px) 44vw, (max-width: 1024px) 22vw, 180px" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" unoptimized />
      <Link href={detailsHref} aria-label={`View details for ${props.title}`} className="absolute inset-0 z-10 rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ff2f9d]">
        <span className="sr-only">View details for {props.title}</span>
      </Link>
      {displayDetails && <>
        <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-t from-[#06060a]/[.98] via-[#06060a]/15 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col gap-1 px-2.5 pb-2.5 sm:px-3 sm:pb-3">
          <h5 className="line-clamp-2 text-xs font-bold leading-snug text-white sm:text-sm">{props.title}</h5>
          {props.watchDetail && <>
            <p className="text-[10px] text-zinc-400 sm:text-xs">Episode {props.watchDetail.episodeNumber} · {formatSecondsToMMSS(props.watchDetail.current)} / {formatSecondsToMMSS(props.watchDetail.timestamp)}</p>
            <Progress value={percentage} />
          </>}
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {props.episodeCard && !!props.episodes && <Badge className="border-0 bg-[#ff2f9d]/90 px-1.5 py-0.5 text-[10px] text-white">Ep {props.episodes}</Badge>}
            {props.format && <Badge variant="outline" className="border-white/20 bg-black/35 px-1.5 py-0.5 text-[10px] text-zinc-200">{props.format}</Badge>}
            {!!props.score && <span className="ml-auto text-[11px] font-semibold text-yellow-400">★ {props.score}%</span>}
          </div>
        </div>
      </>}
      {props.quickWatchHref && <Link href={props.quickWatchHref} title={`Watch ${props.title} now`} aria-label={`Watch ${props.title} now`} className="absolute right-2 top-2 z-30 grid h-9 w-9 place-items-center rounded-full border border-white/25 bg-[#ff2f9d] text-white shadow-lg shadow-black/35 transition hover:scale-105 hover:bg-[#ff56ad] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
        <Play className="ml-0.5 h-4 w-4 fill-current" aria-hidden="true" />
      </Link>}
    </div>
  );
};

export default AnimeCard;