"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Container from "@/components/container";
import AnimeCard from "@/components/anime-card";
import SectionHeading from "@/components/section-heading";
import { ROUTES } from "@/constants/routes";
import useBookMarks from "@/hooks/use-get-bookmark";
import { useAuthStore } from "@/store/auth-store";
import { isLocalBackendEnabled } from "@/lib/api";
import { getRecentLocalWatchProgress } from "@/lib/local-watch-progress";
import { Bookmark, Play } from "lucide-react";

export default function LibraryPage() {
  const { auth } = useAuthStore();
  const { bookmarks } = useBookMarks({ page: 1, per_page: 100 });
  const [localEntries, setLocalEntries] = useState<ReturnType<typeof getRecentLocalWatchProgress>>([]);
  const localMode = isLocalBackendEnabled();
  useEffect(() => { if (localMode) setLocalEntries(getRecentLocalWatchProgress(100)); }, [localMode]);

  const rows = localMode
    ? localEntries.map((item) => ({ id: item.animeId, title: item.animeTitle || "Anime", poster: item.poster || "/brand/7xanime-mark.svg", episode: item.episodeNumber, current: item.current, duration: item.duration }))
    : (bookmarks || []).map((item) => {
        const last = item.expand?.watchHistory?.slice().sort((a, b) => b.episodeNumber - a.episodeNumber)[0];
        return { id: item.animeId, title: item.animeTitle, poster: item.thumbnail, episode: last?.episodeNumber || 1, current: last?.current || 0, duration: last?.timestamp || 0 };
      });

  return (
    <Container className="min-h-[75vh] space-y-6 pt-24 pb-12 sm:pt-28">
      <div className="flex items-center gap-3"><Bookmark className="h-6 w-6 text-[#604bd3]" /><SectionHeading title="My List" eyebrow="Your anime library" /></div>
      {!rows.length ? (
        <div className="rounded-2xl border border-[#dedbea] bg-white px-5 py-10 text-center shadow-sm dark:border-[#2b283a] dark:bg-[#171520]">
          <Bookmark className="mx-auto mb-3 h-10 w-10 text-[#8f88a9]" />
          <h2 className="text-lg font-bold text-[#27233c] dark:text-white">Nothing here yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#77728f] dark:text-[#aaa5c0]">{localMode ? "Your recently watched episodes will appear here as your on-device history builds up." : auth ? "Add anime to your list from its details page and it will show up here." : "Sign in to keep a synced list, or start watching to build your local history."}</p>
          <Link href={ROUTES.SEARCH} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#604bd3] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#513bc2]"><Play className="h-4 w-4 fill-current" /> Browse anime</Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {rows.map((item, index) => <AnimeCard key={`${item.id}-${index}`} title={item.title} poster={item.poster} href={ROUTES.watchAnime(item.id, item.episode)} quickWatchHref={ROUTES.watchAnime(item.id, item.episode)} episodes={item.episode} episodeLabel={`Ep ${item.episode}`} />)}
        </div>
      )}
    </Container>
  );
}
