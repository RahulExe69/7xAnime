"use client";

import React, { useRef } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Zap } from "lucide-react";
import { MediaList } from "@/types/miruro-api";
import { ROUTES } from "@/constants/routes";
import AnimeCard from "@/components/anime-card";
import SectionHeading from "@/components/section-heading";
import { Button } from "@/components/ui/button";

type Props = {
  title: string;
  items?: MediaList[];
  loading?: boolean;
  icon?: React.ReactNode;
  eyebrow?: string;
  mode?: "new" | "normal";
  viewAll?: boolean;
  viewAllHref?: string;
};

export default function AnimeShelf({ title, items = [], loading = false, icon, eyebrow, mode = "normal", viewAll = true, viewAllHref }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const allHref = viewAllHref || `${ROUTES.SEARCH}?q=%22%22`;
  const scroll = (direction: -1 | 1) => {
    scrollRef.current?.scrollBy({ left: direction * Math.max(220, Math.round(scrollRef.current.clientWidth * 0.76)), behavior: "smooth" });
  };
  if (!loading && !items.length) return null;

  return (
    <section id={title.toLowerCase().includes("trending") ? "trending" : undefined} className="w-full scroll-mt-24 py-5 sm:py-7">
      <div className="mb-4 flex items-center justify-between gap-3 px-4 sm:mb-5 sm:px-6 lg:px-8">
        <SectionHeading title={title} eyebrow={eyebrow} icon={icon || (mode === "new" ? <Zap className="h-5 w-5 fill-current" /> : undefined)} />
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {mode === "new" && <span className="hidden items-center gap-1.5 rounded-full bg-[#e3f4e9] px-3 py-1.5 text-[11px] font-extrabold tracking-wide text-[#21985a] dark:bg-[#183126] dark:text-[#86e0ae] sm:inline-flex"><span className="h-2 w-2 rounded-full bg-[#20a35c]" /> LIVE</span>}
          {viewAll && <Link href={allHref} className="hidden items-center gap-1 text-sm font-medium text-[#696480] transition hover:text-[#604bd3] dark:text-[#b8b2cc] dark:hover:text-[#b7aaff] sm:inline-flex">View all <span aria-hidden="true">›</span></Link>}
          <Button variant="outline" size="icon" onClick={() => scroll(-1)} aria-label={`Previous ${title}`} className="h-9 w-9 rounded-full border-[#dedbea] bg-white text-[#77728f] hover:bg-[#f1effa] disabled:opacity-35 dark:border-[#332f47] dark:bg-[#191724] dark:text-[#c3bdd8] dark:hover:bg-[#282437]"><ArrowLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => scroll(1)} aria-label={`Next ${title}`} className="h-9 w-9 rounded-full border-[#d9d5e8] bg-[#efedf8] text-[#514b70] hover:bg-[#e2def5] dark:border-[#332f47] dark:bg-[#201d2d] dark:text-[#d0c9ea] dark:hover:bg-[#302b42]"><ArrowRight className="h-4 w-4" /></Button>
        </div>
      </div>
      <div ref={scrollRef} className="anime-shelf-scroll flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:gap-4 sm:px-6 lg:gap-5 lg:px-8">
        {loading ? Array.from({ length: 6 }, (_, i) => <div key={i} className="w-[44%] shrink-0 snap-start animate-pulse overflow-hidden rounded-2xl border border-[#e3e0ee] bg-white dark:border-[#302c40] dark:bg-[#191724] sm:w-[28%] md:w-[22%] lg:w-[16%]"><div className="aspect-[2/3] bg-[#e9e7f2] dark:bg-[#2b273b]" /><div className="space-y-3 p-3"><div className="h-4 rounded bg-[#e9e7f2]" /><div className="h-3 w-2/3 rounded bg-[#e9e7f2]" /></div></div>) : items.map((anime) => {
          const titleText = anime.title?.english || anime.title?.romaji || anime.title?.native || "Untitled";
          const poster = anime.coverImage?.extraLarge || anime.coverImage?.large || "";
          const nextEpisode = anime.nextAiringEpisode?.episode;
          const episodeLabel = mode === "new" ? `EP ${anime.episodes || 1}` : nextEpisode ? `EP ${nextEpisode}` : null;
          const statusLabel = anime.seasonYear ? String(anime.seasonYear) : null;
          return <div key={anime.id} className="mode === "new" ? "w-[38%] shrink-0 snap-start sm:w-[28%] md:w-[22%] lg:w-[16%]" : "w-[35%] shrink-0 snap-start sm:w-[28%] md:w-[22%] lg:w-[16%]"">
            <AnimeCard
              title={titleText}
              poster={poster}
              score={anime.averageScore}
              format={anime.format}
              episodes={mode === "new" ? anime.episodes : anime.episodes}
              episodeCard={false}
              episodeLabel={episodeLabel}
              statusLabel={statusLabel}
              href={ROUTES.animeDetails(anime.id)}
              quickWatchHref={ROUTES.watchAnime(anime.id, mode === "new" ? anime.episodes || 1 : undefined)}
            />
          </div>;
        })}
      </div>
      {viewAll && <div className="px-4 pt-1 sm:hidden"><Link href={allHref} className="inline-flex items-center gap-1 text-xs font-semibold text-[#696480]">View all <span aria-hidden="true">›</span></Link></div>}
    </section>
  );
}