import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Info } from "lucide-react";
import { cn, formatSecondsToMMSS } from "@/lib/utils";
import { ROUTES } from "@/constants/routes";
import { WatchHistory } from "@/hooks/use-get-bookmark";
import { Progress } from "./ui/progress";

type Props = {
  className?: string; poster: string; title: string; episodeCard?: boolean;
  episodes?: number | null; score?: number | null; format?: string | null;
  subTitle?: string; displayDetails?: boolean; variant?: "sm" | "lg";
  href?: string; quickWatchHref?: string | null; showGenre?: boolean;
  watchDetail?: WatchHistory | null; episodeLabel?: string | null;
  statusLabel?: string | null; animeId?: string | number;
};

const formatScore = (score?: number | null) => {
  if (!score || !Number.isFinite(score)) return null;
  return score > 10 ? (score / 10).toFixed(1) : score.toFixed(1);
};

const AnimeCard = ({ displayDetails = true, variant = "sm", ...props }: Props) => {
  const safeCurrent = typeof props.watchDetail?.current === "number" ? props.watchDetail.current : 0;
  const safeTotal = typeof props.watchDetail?.timestamp === "number" && props.watchDetail.timestamp > 0 ? props.watchDetail.timestamp : 0;
  const percentage = safeTotal > 0 ? (Math.min(safeCurrent, safeTotal) / safeTotal) * 100 : 0;
  const score = formatScore(props.score);
  const suppliedHref = props.href || ROUTES.HOME;
  const animeId = (() => {
    if (props.animeId !== undefined && props.animeId !== null) return String(props.animeId);
    try {
      const route = new URL(props.quickWatchHref || suppliedHref, "https://7xanime.local");
      const queryId = route.searchParams.get("id") || route.searchParams.get("anime");
      if (queryId) return queryId;
      const parts = route.pathname.split("/").filter(Boolean);
      return parts[0] === "anime" && parts[1] !== "watch" ? decodeURIComponent(parts[1] || "") : "";
    } catch { return ""; }
  })();
  const detailsHref = (() => {
    try {
      const route = new URL(suppliedHref, "https://7xanime.local");
      if (route.pathname.replace(/\/$/, "") === ROUTES.WATCH && animeId) return ROUTES.animeDetails(animeId);
    } catch {}
    return suppliedHref;
  })();
  const playHref = props.quickWatchHref || (animeId ? ROUTES.watchAnime(animeId) : suppliedHref);

  return (
    <article className={cn(
      "group relative isolate w-full min-w-0 overflow-hidden rounded-xl border border-white/[0.09] bg-[#19070d] shadow-[0_8px_22px_rgba(0,0,0,0.18)] transition-colors duration-150 hover:border-[#ff3b72]/70 hover:shadow-[0_10px_28px_rgba(255,59,114,0.13)]",
      variant === "sm" && "max-w-[11.5rem]",
      variant === "lg" && "max-w-[15rem]",
      props.className,
    )}>
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-[#1b0710]">
        {props.poster ? <Image src={props.poster} alt={props.title} fill sizes="(max-width: 640px) 42vw, (max-width: 1024px) 22vw, 180px" className="object-cover transition-transform duration-150 group-hover:scale-[1.02]" /> : <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-[#351021] via-[#1b0a17] to-[#100b18]" />}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0a0306] via-[#0a0306]/10 to-black/20" />
        {score && <span className="absolute right-2 top-2 z-[5] inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[#0a0306]/85 px-2 py-1 text-[11px] font-bold text-white shadow-sm backdrop-blur-sm"><span className="text-amber-300">★</span> {score}</span>}
        {props.episodeCard && !!props.episodes && !props.episodeLabel && <span className="absolute left-2 top-10 z-[5] rounded-lg border border-white/10 bg-[#0a0306]/85 px-2 py-1 text-[10px] font-bold text-white backdrop-blur-sm">EP {props.episodes}</span>}
        {props.episodeLabel && !props.watchDetail && <span className="absolute left-2 top-10 z-[5] max-w-[calc(100%-1rem)] truncate rounded-lg border border-white/10 bg-[#0a0306]/85 px-2 py-1 text-[10px] font-bold text-white backdrop-blur-sm">{props.episodeLabel}</span>}
        <Link href={playHref} aria-label={`Watch ${props.title}`} className="absolute inset-0 z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ff3b72]"><span className="sr-only">Watch {props.title}</span></Link>
        {displayDetails && <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col gap-1.5 bg-gradient-to-t from-[#0a0306] via-[#0a0306]/90 to-transparent px-3 pb-3 pr-10 pt-16">
          <h3 className="line-clamp-2 text-[13px] font-extrabold leading-[1.25] tracking-[-0.01em] text-white sm:text-sm">{props.title}</h3>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-medium text-zinc-300 sm:text-[11px]">
            {props.format && <span>{props.format}</span>}{!!props.episodes && <span>{props.episodes} ep</span>}{props.statusLabel && <span>{props.statusLabel}</span>}
          </div>
          {props.subTitle && <p className="line-clamp-1 text-[10px] text-zinc-400">{props.subTitle}</p>}
          {props.watchDetail && <div className="mt-1 flex flex-col gap-1 text-[10px] text-zinc-300"><span>Ep {props.watchDetail.episodeNumber} · {formatSecondsToMMSS(props.watchDetail.current)} left</span><Progress value={percentage} className="h-1 bg-white/20" /></div>}
        </div>}
        {animeId && <Link href={detailsHref} title={`Details for ${props.title}`} aria-label={`Details for ${props.title}`} className="absolute bottom-2 right-2 z-30 grid h-8 w-8 place-items-center rounded-lg border border-white/20 bg-[#0a0306]/85 text-white shadow-lg backdrop-blur transition-colors hover:border-[#ff3b72] hover:bg-[#ff3b72] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><Info className="h-4 w-4" aria-hidden="true" /></Link>}
      </div>
    </article>
  );
};

export default AnimeCard;
