"use client";

import React from "react";
import { useGetSpotlightAnime } from "@/query/get-spotlight-anime";
import { useGetRecentAnime } from "@/query/get-recent-anime";
import dynamic from "next/dynamic";
import AnimeShelf from "@/components/anime-shelf";
import ContinueWatching from "@/components/continue-watching";
import DeferredAnimeShelf from "@/components/deferred-anime-shelf";
import DeferredMount from "@/components/deferred-mount";

const HeroSection = dynamic(() => import("@/components/hero-section"));
const AnimeSchedule = dynamic(() => import("@/components/anime-schedule"));
const RecentCommentsSection = dynamic(() => import("@/components/recent-comments-section"));

export default function Home() {
  const { data: spotlightList = [], isLoading: loadingSpotlight } = useGetSpotlightAnime();
  const { data: recentRes, isLoading: loadingRecent } = useGetRecentAnime(1, 18);

  return (
    <main className="min-h-screen overflow-x-clip bg-transparent pb-10 text-white">
      <HeroSection spotlightAnime={spotlightList} isDataLoading={loadingSpotlight} />
      <div id="continue-watching" className="scroll-mt-20">
        <ContinueWatching loading={false} />
      </div>
      <AnimeShelf title="New Today" eyebrow="Recently updated" mode="new" viewAllHref="/search?collection=new" items={recentRes?.results || []} loading={loadingRecent} />
      <DeferredAnimeShelf collection="currently-airing" title="Currently Airing" eyebrow="On the air" viewAllHref="/search?collection=currently-airing" />
      <DeferredAnimeShelf collection="trending" title="Trending Now" eyebrow="Popular this week" viewAllHref="/search?collection=trending" />
      <DeferredAnimeShelf collection="popular" title="All-Time Popular" eyebrow="Fan favourites" viewAllHref="/search?collection=popular" />
      <DeferredAnimeShelf collection="upcoming" title="Coming Next Season" eyebrow="Up next" viewAllHref="/search?collection=upcoming" />
      <DeferredAnimeShelf collection="top-airing" title="Top Rated Airing Now" eyebrow="Highest rated this season" viewAllHref="/search?collection=top-airing" />
      <DeferredAnimeShelf collection="completed" title="Top Completed Series" eyebrow="Worth catching up on" viewAllHref="/search?collection=completed" />
      <DeferredMount minHeight="480px"><div className="mt-4"><AnimeSchedule /></div></DeferredMount>
      <DeferredMount minHeight="240px"><RecentCommentsSection /></DeferredMount>
    </main>
  );
}
