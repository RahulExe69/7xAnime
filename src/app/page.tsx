"use client";

import React from "react";
import { useGetSpotlightAnime } from "@/query/get-spotlight-anime";
import { useGetRecentAnime } from "@/query/get-recent-anime";
import { useGetPopularAnime } from "@/query/get-popular-anime";
import { useGetTrendingAnime } from "@/query/get-trending-anime";
import { useGetUpcomingAnime } from "@/query/get-upcoming-anime";
import { useGetFilteredAnime } from "@/query/get-filtered-anime";
import { Flame, Star, Trophy, CheckCircle2, CalendarClock } from "lucide-react";
import dynamic from "next/dynamic";
import AnimeShelf from "@/components/anime-shelf";
import ContinueWatching from "@/components/continue-watching";

const HeroSection = dynamic(() => import("@/components/hero-section"));
const AnimeSchedule = dynamic(() => import("@/components/anime-schedule"));
const RecentCommentsSection = dynamic(() => import("@/components/recent-comments-section"));

export default function Home() {
  const { data: spotlightList = [], isLoading: loadingSpotlight } = useGetSpotlightAnime();
  const { data: recentRes, isLoading: loadingRecent } = useGetRecentAnime(1, 18);
  const { data: trendingRes, isLoading: loadingTrending } = useGetTrendingAnime(1, 18);
  const { data: popularRes, isLoading: loadingPopular } = useGetPopularAnime(1, 18);
  const { data: upcomingRes, isLoading: loadingUpcoming } = useGetUpcomingAnime(1, 18);
  const { data: airingRes, isLoading: loadingAiring } = useGetFilteredAnime("RELEASING", "START_DATE_DESC", 18);
  const { data: topAiringRes, isLoading: loadingTopAiring } = useGetFilteredAnime("RELEASING", "SCORE_DESC", 18);
  const { data: completedRes, isLoading: loadingCompleted } = useGetFilteredAnime("FINISHED", "SCORE_DESC", 18);

  return (
    <main className="min-h-screen overflow-hidden bg-[#f6f5fc] pb-10 text-[#1a1830] dark:bg-[#111019] dark:text-white">
      <HeroSection spotlightAnime={spotlightList} isDataLoading={loadingSpotlight} />
      <div id="continue-watching" className="scroll-mt-20">
        <ContinueWatching loading={false} />
      </div>
      <AnimeShelf title="New Today" eyebrow="Freshly updated" mode="new" items={recentRes?.results || []} loading={loadingRecent} />
      <AnimeShelf title="Currently Airing" eyebrow="On the air" icon={<Flame className="h-5 w-5 fill-current text-orange-500" />} items={airingRes?.results || []} loading={loadingAiring} />
      <AnimeShelf title="Trending Now" eyebrow="Popular this week" icon={<span className="text-[#604bd3]">↗</span>} items={trendingRes?.results || []} loading={loadingTrending} />
      <AnimeShelf title="All-Time Popular" eyebrow="Fan favourites" icon={<Star className="h-5 w-5 fill-current text-amber-400" />} items={popularRes?.results || []} loading={loadingPopular} />
      <AnimeShelf title="Coming Next Season" eyebrow="Up next" icon={<CalendarClock className="h-5 w-5 text-[#604bd3]" />} items={upcomingRes?.results || []} loading={loadingUpcoming} />
      <AnimeShelf title="Top Rated Airing Now" eyebrow="Highest rated this season" icon={<Trophy className="h-5 w-5 text-amber-500" />} items={topAiringRes?.results || []} loading={loadingTopAiring} />
      <AnimeShelf title="Top Completed Series" eyebrow="Worth catching up on" icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />} items={completedRes?.results || []} loading={loadingCompleted} />
      <div className="mt-4"><AnimeSchedule /></div>
      <RecentCommentsSection />
    </main>
  );
}