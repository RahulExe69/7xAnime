"use client";

import React, { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Flame, Star, Trophy, CheckCircle2, CalendarClock, TrendingUp } from "lucide-react";
import AnimeShelf from "@/components/anime-shelf";
import { useGetTrendingAnime } from "@/query/get-trending-anime";
import { useGetPopularAnime } from "@/query/get-popular-anime";
import { useGetUpcomingAnime } from "@/query/get-upcoming-anime";
import { useGetFilteredAnime } from "@/query/get-filtered-anime";

export type DeferredCollection = "currently-airing" | "trending" | "popular" | "upcoming" | "top-airing" | "completed";

type Props = {
  collection: DeferredCollection;
  title: string;
  eyebrow: string;
  viewAllHref: string;
  icon?: ReactNode;
};

function ShelfSkeleton({ title, eyebrow, icon }: Pick<Props, "title" | "eyebrow" | "icon">) {
  return (
    <section aria-hidden="true" className="w-full py-5 sm:py-7">
      <div className="mb-4 flex items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8f879f] sm:text-[11px]">{eyebrow}</span>
          <h2 className="flex items-center gap-2 text-[21px] font-extrabold leading-tight text-white sm:text-2xl">{icon}<span>{title}</span></h2>
        </div>
      </div>
      <div className="anime-shelf-scroll flex gap-3 overflow-hidden px-4 sm:gap-4 sm:px-6 lg:px-8">
        {[0, 1, 2, 3, 4].map((item) => <div key={item} className="w-[42vw] max-w-[11.5rem] shrink-0 sm:w-[28vw] md:w-[22vw] lg:w-[16vw]">
          <div className="aspect-[2/3] animate-pulse rounded-xl border border-white/[0.07] bg-[#1b0710] sm:rounded-2xl" />
        </div>)}
      </div>
    </section>
  );
}

function CurrentlyAiring({ ...props }: Props) {
  const { data, isLoading } = useGetFilteredAnime("RELEASING", "START_DATE_DESC", 18);
  return <AnimeShelf title={props.title} eyebrow={props.eyebrow} icon={props.icon || <Flame className="h-5 w-5 text-orange-400" />} viewAllHref={props.viewAllHref} items={data?.results || []} loading={isLoading} />;
}
function Trending({ ...props }: Props) {
  const { data, isLoading } = useGetTrendingAnime(1, 18);
  return <AnimeShelf title={props.title} eyebrow={props.eyebrow} icon={props.icon || <TrendingUp className="h-5 w-5 text-[#ff3b72]" />} viewAllHref={props.viewAllHref} items={data?.results || []} loading={isLoading} />;
}
function Popular({ ...props }: Props) {
  const { data, isLoading } = useGetPopularAnime(1, 18);
  return <AnimeShelf title={props.title} eyebrow={props.eyebrow} icon={props.icon || <Star className="h-5 w-5 text-amber-300" />} viewAllHref={props.viewAllHref} items={data?.results || []} loading={isLoading} />;
}
function Upcoming({ ...props }: Props) {
  const { data, isLoading } = useGetUpcomingAnime(1, 18);
  return <AnimeShelf title={props.title} eyebrow={props.eyebrow} icon={props.icon || <CalendarClock className="h-5 w-5 text-[#ff3b72]" />} viewAllHref={props.viewAllHref} items={data?.results || []} loading={isLoading} />;
}
function TopAiring({ ...props }: Props) {
  const { data, isLoading } = useGetFilteredAnime("RELEASING", "SCORE_DESC", 18);
  return <AnimeShelf title={props.title} eyebrow={props.eyebrow} icon={props.icon || <Trophy className="h-5 w-5 text-amber-300" />} viewAllHref={props.viewAllHref} items={data?.results || []} loading={isLoading} />;
}
function Completed({ ...props }: Props) {
  const { data, isLoading } = useGetFilteredAnime("FINISHED", "SCORE_DESC", 18);
  return <AnimeShelf title={props.title} eyebrow={props.eyebrow} icon={props.icon || <CheckCircle2 className="h-5 w-5 text-emerald-300" />} viewAllHref={props.viewAllHref} items={data?.results || []} loading={isLoading} />;
}

function CollectionContent(props: Props) {
  switch (props.collection) {
    case "currently-airing": return <CurrentlyAiring {...props} />;
    case "trending": return <Trending {...props} />;
    case "popular": return <Popular {...props} />;
    case "upcoming": return <Upcoming {...props} />;
    case "top-airing": return <TopAiring {...props} />;
    case "completed": return <Completed {...props} />;
  }
}

/** Defer below-the-fold collection requests until the user approaches the shelf. */
export default function DeferredAnimeShelf(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(false);

  useEffect(() => {
    const element = hostRef.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setNearViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: "220px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return <div ref={hostRef}>{nearViewport ? <CollectionContent {...props} /> : <ShelfSkeleton title={props.title} eyebrow={props.eyebrow} icon={props.icon} />}</div>;
}
