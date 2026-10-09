import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Info } from "lucide-react";
import AnimeLanguageBadges from "@/components/anime-language-badges";
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
  animeId?: string | number;
  languageAliases?: string[];
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
    } catch {
      return "";
    }
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
    <article className={cn("group flex min-w-0 flex-col gap-2.5", variant === "sm" && "w-full max-w-[11.5rem]", variant === "lg" && "w-full max-w-[15rem]", props.className)}>
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-white/[0.07] bg-[#171521] shadow-[0_7px_22px_rgba(0,0,0,0.18)] transition-colors duration-150 group-hover:border-[#8b70f2]/60 sm:rounded-2xl">
        <Image src={props.poster || "/brand/7xanime-mark.svg"} alt={props.title} fill sizes="(max-width: 640px) 42vw, (max-width: 1024px) 22vw, 180px" className="object-cover" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/10" />
        {score && <span className="absolute right-2 top-2 z-[5] inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[#111019]/90 px-2 py-1 text-[10px] font-extrabold text-white backdrop-blur-sm sm:text-[11px]"><span className="text-amber-300">★</span>{score}</span>}
        {props.episodeCard && !!props.episodes && <span className="absolute left-2 top-2 z-[5] rounded-lg border border-white/10 bg-[#111019]/90 px-2 py-1 text-[10px] font-bold text-white sm:text-[11px]">EP {props.episodes}</span>}
        {props.episodeLabel && !props.watchDetail && <span className="absolute bottom-2 left-2 z-[5] max-w-[calc(100%-3rem)] truncate rounded-lg border border-white/10 bg-[#111019]/90 px-2 py-1.5 text-[10px] font-bold text-white backdrop-blur-sm sm:text-[11px]">{props.episodeLabel}</span>}
        {props.watchDetail && <div className="absolute inset-x-2 bottom-2 z-[5] flex flex-col gap-1.5 rounded-lg border border-white/10 bg-[#111019]/90 px-2.5 py-2 text-[10px] font-semibold text-white backdrop-blur-sm sm:text-[11px]"><span className="truncate">Ep {props.watchDetail.episodeNumber} · {formatSecondsToMMSS(props.watchDetail.current)} watched</span><Progress value={percentage} className="h-1 bg-white/20" /></div>}
        <Link href={playHref} aria-label={"Watch " + props.title} className="absolute inset-0 z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#a78bfa]"><span className="sr-only">Watch {props.title}</span></Link>
        {animeId && <Link href={detailsHref} title={"Details for " + props.title} aria-label={"Details for " + props.title} className="absolute bottom-2 right-2 z-30 grid h-8 w-8 place-items-center rounded-lg border border-white/15 bg-[#111019]/90 text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-[#604bd3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><Info className="h-4 w-4" aria-hidden="true" /></Link>}
        {animeId && <AnimeLanguageBadges animeId={animeId} titles={[props.title, props.subTitle || "", ...(props.languageAliases || [])].filter(Boolean)} />}
      </div>
      {displayDetails && (
        <div className="flex min-h-[76px] min-w-0 flex-col gap-1 px-0.5">
          <h3 className="line-clamp-2 text-[12px] font-bold leading-[1.35] text-[#eeeaf9] sm:text-sm"><Link href={playHref} className="transition-colors hover:text-[#c4b5fd]">{props.title}</Link></h3>
          <div className="mt-auto flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pt-0.5 text-[10px] font-medium text-[#8f879f] sm:text-[11px]">
            {props.format && <span>{props.format}</span>}
            {!!props.episodes && <span>{props.episodes} eps</span>}
            {props.statusLabel && <span>{props.statusLabel}</span>}
          </div>
          {props.subTitle && <p className="line-clamp-1 text-[10px] text-[#8f879f] sm:text-[11px]">{props.subTitle}</p>}
        </div>
      )}
    </article>
  );
};

export default AnimeCard;
