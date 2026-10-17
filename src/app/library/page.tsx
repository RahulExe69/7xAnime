"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Container from "@/components/container";
import AnimeCard from "@/components/anime-card";
import { ROUTES } from "@/constants/routes";
import useBookMarks, { WatchHistory } from "@/hooks/use-get-bookmark";
import { useAuthStore } from "@/store/auth-store";
import { isLocalBackendEnabled } from "@/lib/api";
import { getRecentLocalWatchProgress } from "@/lib/local-watch-progress";
import { Bookmark, CheckCircle2, Clock3, Compass, Search, Tv, X } from "lucide-react";

const STATUS_FILTERS = [
  { value: "all", label: "All anime" },
  { value: "watching", label: "Watching" },
  { value: "plan_to_watch", label: "Plan to watch" },
  { value: "on_hold", label: "On hold" },
  { value: "completed", label: "Completed" },
  { value: "dropped", label: "Dropped" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];
type LibraryRow = {
  id: string;
  title: string;
  poster: string;
  episode: number;
  status: string;
  progress: WatchHistory | null;
};

const STATUS_LABELS: Record<string, string> = {
  watching: "Watching",
  plan_to_watch: "Plan to watch",
  on_hold: "On hold",
  completed: "Completed",
  dropped: "Dropped",
};

const normalizeStatus = (value: string | undefined) =>
  (value || "watching").toLowerCase().trim().replace(/[\s-]+/g, "_");

export default function LibraryPage() {
  const { auth } = useAuthStore();
  const { bookmarks, isLoading } = useBookMarks({ page: 1, per_page: 100 });
  const [localEntries, setLocalEntries] = useState<ReturnType<typeof getRecentLocalWatchProgress>>([]);
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const localMode = isLocalBackendEnabled();

  useEffect(() => {
    if (localMode) setLocalEntries(getRecentLocalWatchProgress(100));
  }, [localMode]);

  const rows = useMemo<LibraryRow[]>(() => {
    if (localMode) {
      // Local progress can contain multiple episodes per series. Keep the most
      // recently watched entry per anime so My List behaves like a real library.
      const latestByAnime = new Map<string, (typeof localEntries)[number]>();
      localEntries.forEach((entry) => {
        if (!entry.animeId) return;
        const current = latestByAnime.get(entry.animeId);
        if (!current || new Date(entry.updatedAt).getTime() > new Date(current.updatedAt).getTime()) {
          latestByAnime.set(entry.animeId, entry);
        }
      });
      return [...latestByAnime.values()].map((item) => ({
        id: item.animeId,
        title: item.animeTitle || "Anime",
        poster: item.poster || "",
        episode: item.episodeNumber || 1,
        status: "watching",
        progress: {
          id: `local-${item.animeId}`,
          episodeNumber: item.episodeNumber || 1,
          current: item.current || 0,
          timestamp: item.duration || 0,
          created: new Date(item.updatedAt).toISOString(),
        },
      }));
    }

    return (bookmarks || []).map((item) => {
      const history = item.expand?.watchHistory || [];
      const latest = [...history].sort((a, b) => b.episodeNumber - a.episodeNumber)[0] || null;
      return {
        id: item.animeId,
        title: item.animeTitle || "Untitled anime",
        poster: item.thumbnail || "",
        episode: latest?.episodeNumber || 1,
        status: normalizeStatus(item.status),
        progress: latest,
      };
    });
  }, [bookmarks, localEntries, localMode]);

  const availableFilters = localMode
    ? STATUS_FILTERS.filter((filter) => filter.value === "all" || filter.value === "watching")
    : STATUS_FILTERS;

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((item) => {
      const matchesStatus = selectedStatus === "all" || item.status === selectedStatus;
      const matchesSearch = !query || item.title.toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [rows, search, selectedStatus]);

  const watchingCount = rows.filter((item) => item.status === "watching").length;
  const completedCount = rows.filter((item) => item.status === "completed").length;

  return (
    <Container className="min-h-[75vh] space-y-6 pb-14 pt-24 text-white sm:pt-28">
      <header className="relative overflow-hidden rounded-3xl border border-white/[0.09] bg-gradient-to-br from-[#3a0819] via-[#1a0710] to-[#100e18] p-5 sm:p-7">
        <div className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full bg-[#ff3b72]/10 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div className="max-w-xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#ff3b72]/25 bg-[#ff3b72]/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-[#ffbad0]">
              <Bookmark className="h-3.5 w-3.5" /> Personal library
            </div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">My List</h1>
            <p className="mt-2 text-sm leading-6 text-[#b8afcb]">
              Keep track of what you&apos;re watching, what you want to start, and the series you&apos;ve finished.
            </p>
          </div>
          <Link href={ROUTES.SEARCH} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-[#ff3b72] px-4 text-sm font-bold text-white transition hover:bg-[#ed245c] sm:self-auto">
            <Compass className="h-4 w-4" /> Explore anime
          </Link>
        </div>
        <div className="relative mt-6 grid grid-cols-3 gap-2 sm:max-w-lg sm:gap-3">
          <div className="rounded-2xl border border-white/[0.08] bg-black/15 p-3">
            <p className="text-xl font-black tabular-nums">{rows.length}</p>
            <p className="mt-1 text-[11px] font-semibold text-[#aaa1bf] sm:text-xs">Saved anime</p>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-black/15 p-3">
            <p className="flex items-center gap-1.5 text-xl font-black tabular-nums"><Tv className="h-4 w-4 text-[#ff70bd]" />{watchingCount}</p>
            <p className="mt-1 text-[11px] font-semibold text-[#aaa1bf] sm:text-xs">Watching</p>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-black/15 p-3">
            <p className="flex items-center gap-1.5 text-xl font-black tabular-nums"><CheckCircle2 className="h-4 w-4 text-emerald-300" />{completedCount}</p>
            <p className="mt-1 text-[11px] font-semibold text-[#aaa1bf] sm:text-xs">Completed</p>
          </div>
        </div>
      </header>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-extrabold">Your anime shelf</h2>
            <p className="mt-1 text-xs text-[#928aa8]">
              {localMode ? "Based on watch history saved on this device." : auth ? "Your saved statuses and latest episode progress." : "Sign in to keep a synced list across devices."}
            </p>
          </div>
          <label className="flex h-10 w-full items-center gap-2 rounded-xl border border-white/[0.09] bg-[#19070d] px-3 text-[#aaa2bd] sm:max-w-xs">
            <Search className="h-4 w-4 shrink-0" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find anime in your list" aria-label="Search your list" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[#79728e]" />
            {search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search" className="rounded p-1 hover:bg-white/10"><X className="h-3.5 w-3.5" /></button>}
          </label>
        </div>

        <div className="anime-shelf-scroll flex gap-2 overflow-x-auto pb-1">
          {availableFilters.map((filter) => {
            const count = filter.value === "all" ? rows.length : rows.filter((item) => item.status === filter.value).length;
            const active = selectedStatus === filter.value;
            return (
              <button key={filter.value} type="button" onClick={() => setSelectedStatus(filter.value)} aria-pressed={active} className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-bold transition ${active ? "border-[#ff3b72]/45 bg-[#ff3b72]/15 text-[#ffbad0]" : "border-white/[0.08] bg-white/[0.03] text-[#aaa2bd] hover:border-white/20 hover:text-white"}`}>
                {filter.label}<span className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${active ? "bg-[#ff3b72]/20 text-white" : "bg-white/[0.07] text-[#aaa2bd]"}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {isLoading && !localMode ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 6 }, (_, index) => <div key={index} className="aspect-[2/3] animate-pulse rounded-2xl bg-white/[0.05]" />)}
          </div>
        ) : filteredRows.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {filteredRows.map((item) => (
              <AnimeCard
                key={item.id}
                title={item.title}
                poster={item.poster}
                href={ROUTES.watchAnime(item.id, item.episode)}
                quickWatchHref={ROUTES.watchAnime(item.id, item.episode)}
                episodes={item.episode}
                episodeLabel={`Ep ${item.episode}`}
                statusLabel={STATUS_LABELS[item.status] || "In library"}
                watchDetail={item.progress}
                animeId={item.id}
                className="w-full max-w-none"
              />
            ))}
          </div>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center rounded-3xl border border-dashed border-white/[0.12] bg-white/[0.02] px-5 py-10 text-center">
            <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-white/[0.05] text-[#aaa2bd]"><Clock3 className="h-6 w-6" /></div>
            <h3 className="text-base font-bold">{search ? "No matching anime" : selectedStatus === "all" ? "Your list is empty" : `Nothing marked ${STATUS_LABELS[selectedStatus]?.toLowerCase() || "here"} yet`}</h3>
            <p className="mt-2 max-w-sm text-sm leading-6 text-[#928aa8]">
              {localMode ? "Watch an episode and your recent series will appear here." : !auth ? "Sign in to save statuses and sync your anime list across devices." : selectedStatus === "all" && !search ? "Save anime from its details page to build your personal watchlist." : "Try another status, clear the search, or explore more anime."}
            </p>
            {search && <button type="button" onClick={() => setSearch("")} className="mt-4 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-[#d6cfe6] hover:bg-white/[0.06]">Clear search</button>}
            <Link href={ROUTES.SEARCH} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/[0.08] px-4 py-2.5 text-sm font-bold hover:bg-white/[0.13]"><Compass className="h-4 w-4" /> Discover anime</Link>
          </div>
        )}
      </section>
    </Container>
  );
}
