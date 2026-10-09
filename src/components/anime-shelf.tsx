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
          {mode === "new" && <span className="hidden items-center gap-1.5 rounded-full border border-[#ff2f9d]/20 bg-[#ff2f9d]/[0.07] px-3 py-1.5 text-[11px] font-extrabold tracking-wide text-[#ff8bc8] sm:inline-flex"><span className="h-1.5 w-1.5 rounded-full bg-[#ff2f9d]" /> LATEST</span>}
          {viewAll && <Link href={allHref} className="hidden items-center gap-1 text-sm font-medium text-[#696480] transition hover:text-[#ff2f9d] dark:text-[#b8b2cc] dark:hover:text-[#ff8bc8] sm:inline-flex">View all <span aria-hidden="true">›</span></Link>}
          <Button variant="outline" size="icon" onClick={() => scroll(-1)} aria-label={`Previous ${title}`} className="h-9 w-9 rounded-full border-[#dedbea] bg-white text-[#77728f] hover:bg-[#f1effa] disabled:opacity-35 dark:border-[#332f47] dark:bg-[#191724] dark:text-[#c3bdd8] dark:hover:bg-[#282437]"><ArrowLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => scroll(1)} aria-label={`Next ${title}`} className="h-9 w-9 rounded-full border-[#d9d5e8] bg-[#efedf8] text-[#514b70] hover:bg-[#e2def5] dark:border-[#332f47] dark:bg-[#201d2d] dark:text-[#d0c9ea] dark:hover:bg-[#302b42]"><ArrowRight className="h-4 w-4" /></Button>
        </div>
      </div>
      <div ref={scrollRef} className="anime-shelf-scroll flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:gap-4 sm:px-6 lg:gap-5 lg:px-8">
        {loading ? Array.from({ length: 6 }, (_, i) => <div key={i} className="w-[42vw] max-w-[11.5rem] shrink-0 snap-start overflow-hidden rounded-xl border border-white/[0.07] bg-[#17131f] sm:w-[28vw] md:w-[22vw] lg:w-[16vw]"><div className="aspect-[2/3] animate-pulse bg-[#24202d]" /></div>) : items.map((anime) => {
          const titleText = anime.title?.english || anime.title?.romaji || anime.title?.native || "Untitled";
          const poster = anime.coverImage?.extraLarge || anime.coverImage?.large || "";
          const nextEpisode = anime.nextAiringEpisode?.episode;
          // AniList reports the upcoming episode number; the most recently aired
          // episode is one lower. Only use episode-count as a fallback for titles
          // with no airing metadata instead of assuming it is the latest episode.
          const latestEpisode = nextEpisode
            ? Math.max(1, nextEpisode - 1)
            : Math.max(1, anime.episodes || 1);
          const episodeLabel = mode === "new" ? `EP ${latestEpisode}` : nextEpisode ? `EP ${nextEpisode}` : null;
          const statusLabel = anime.seasonYear ? String(anime.seasonYear) : null;
          return <div key={anime.id} className="w-[42vw] max-w-[11.5rem] shrink-0 snap-start sm:w-[28vw] md:w-[22vw] lg:w-[16vw]">
            <AnimeCard
              title={titleText}
              languageAliases={[anime.title?.native || "", anime.title?.romaji || ""].filter((alias) => alias && alias !== titleText)}
              poster={poster}
              score={anime.averageScore}
              format={anime.format}
              episodes={anime.episodes}
              episodeCard={false}
              episodeLabel={episodeLabel}
              statusLabel={statusLabel}
              href={ROUTES.animeDetails(anime.id)}
              quickWatchHref={ROUTES.watchAnime(anime.id, mode === "new" ? latestEpisode : undefined)}
            />
          </div>;
        })}
      </div>
      {viewAll && <div className="px-4 pt-1 sm:hidden"><Link href={allHref} className="inline-flex items-center gap-1 text-xs font-semibold text-[#696480]">View all <span aria-hidden="true">›</span></Link></div>}
    </section>
  );
}