"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Clock3, Film, Play } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { IAnime } from "@/types/anime";
import { WatchHistory } from "@/hooks/use-get-bookmark";
import SectionHeading from "./section-heading";
import useBookMarks from "@/hooks/use-get-bookmark";
import { useAuthStore } from "@/store/auth-store";
import { api, isLocalBackendEnabled } from "@/lib/api";
import { getRecentLocalWatchProgress } from "@/lib/local-watch-progress";
import { Button } from "./ui/button";

type WatchedAnime = IAnime & { episode: WatchHistory | string };

const isGenericTitle = (value?: string | null) =>
  !value?.trim() || /^(anime|untitled|continue watching|unknown anime|loading anime details…|anime details unavailable)$/i.test(value.trim());

const isBrandArtwork = (value?: string | null) => {
  if (!value?.trim()) return true;
  const source = value.trim().toLowerCase();
  return source.includes("7xanime-mark.svg")
    || source.includes("7xanime-icon.png")
    || source.includes("/products/7xanime/assets/icon.png")
    || source.endsWith("/logo.png");
};

type AnimeInfoResponse = {
  title?: { english?: string | null; romaji?: string | null; native?: string | null } | null;
  coverImage?: { extraLarge?: string | null; large?: string | null } | null;
};

async function resolveAnimeMetadata(id: string): Promise<{ title: string; poster: string } | null> {
  if (!id) return null;
  try {
    const response = await api.get<AnimeInfoResponse>(`/info/${encodeURIComponent(id)}`);
    const media = response.data;
    const title = media.title?.english?.trim()
      || media.title?.romaji?.trim()
      || media.title?.native?.trim()
      || "";
    const poster = media.coverImage?.extraLarge?.trim()
      || media.coverImage?.large?.trim()
      || "";
    if (!title && !poster) return null;
    return { title, poster };
  } catch {
    // Metadata is best-effort; saved progress must remain usable offline.
    return null;
  }
}

export default function ContinueWatching({ loading = false }: { loading: boolean }) {
  const [anime, setAnime] = useState<WatchedAnime[] | null>(null);
  const [brokenPosters, setBrokenPosters] = useState<Set<string>>(() => new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const { auth } = useAuthStore();
  const { bookmarks } = useBookMarks({ page: 1, per_page: 14, status: "watching" });
  const localBackend = isLocalBackendEnabled();

  useEffect(() => {
    let active = true;
    setBrokenPosters(new Set());

    if (localBackend) {
      const localEntries = getRecentLocalWatchProgress(14);
      const localAnime = localEntries
        .filter((entry) => !!entry.animeId)
        .map((entry) => ({
          id: entry.animeId,
          name: isGenericTitle(entry.animeTitle) ? "Loading anime details…" : entry.animeTitle!,
          jname: isGenericTitle(entry.animeTitle) ? "" : entry.animeTitle!,
          poster: isBrandArtwork(entry.poster) ? "" : entry.poster!,
          episodes: { sub: entry.episodeNumber, dub: null },
          episode: {
            id: "local", episodeNumber: entry.episodeNumber, current: entry.current,
            timestamp: entry.duration, created: new Date(entry.updatedAt).toISOString(),
          } as WatchHistory,
        })) as WatchedAnime[];

      setAnime(localAnime.length ? localAnime : null);

      // Older progress records can contain a generic title or the old app mark
      // in place of anime artwork. Repair only incomplete records and keep the
      // existing watch history immediately available while metadata loads.
      const incomplete = localEntries.filter((entry) =>
        isGenericTitle(entry.animeTitle) || isBrandArtwork(entry.poster),
      );
      void Promise.all(incomplete.map(async (entry) => ({
        id: entry.animeId,
        metadata: await resolveAnimeMetadata(entry.animeId),
      }))).then((resolved) => {
        if (!active) return;
        const byId = new Map(resolved.filter((row) => row.metadata).map((row) => [row.id, row.metadata!]));
        if (!byId.size) {
          setAnime((current) => current?.map((item) =>
            isGenericTitle(item.name) ? { ...item, name: "Anime details unavailable" } : item,
          ) ?? null);
          return;
        }
        setAnime((current) => current?.map((item) => {
          const metadata = byId.get(String(item.id));
          if (!metadata) return isGenericTitle(item.name) ? { ...item, name: "Anime details unavailable" } : item;
          const title = !isGenericTitle(item.name) ? item.name : metadata.title || "Anime details unavailable";
          const poster = !isBrandArtwork(item.poster) ? item.poster : metadata.poster;
          return { ...item, name: title, jname: title, poster: poster || "" };
        }) ?? null);
      });
      return () => { active = false; };
    }

    if (!auth) {
      try {
        const stored = typeof window !== "undefined" ? localStorage.getItem("watched") : null;
        const watched = stored ? JSON.parse(stored) : [];
        if (!Array.isArray(watched)) { setAnime(null); return () => { active = false; }; }
        const rows = watched.slice().reverse().map((item: any) => ({
          id: String(item.anime?.id || ""),
          name: item.anime?.title || "Anime details unavailable",
          jname: item.anime?.title || "",
          poster: isBrandArtwork(item.anime?.poster) ? "" : item.anime?.poster || "",
          episodes: { sub: item.episodes?.length || 0, dub: null },
          episode: String(item.episodes?.[item.episodes.length - 1] || "1"),
        })).filter((item: WatchedAnime) => !!item.id);
        setAnime(rows.length ? rows as WatchedAnime[] : null);
      } catch { setAnime(null); }
      return () => { active = false; };
    }

    const rows = (bookmarks || []).map((item) => ({
      id: item.animeId, name: item.animeTitle || "Anime details unavailable", jname: item.animeTitle || "",
      poster: isBrandArtwork(item.thumbnail) ? "" : item.thumbnail || "",
      episodes: { sub: item.expand?.watchHistory?.[0]?.episodeNumber || 0, dub: null },
      episode: item.expand?.watchHistory?.slice().sort((a, b) => b.episodeNumber - a.episodeNumber)[0] || null,
    })).filter((item) => !!item.episode) as WatchedAnime[];
    setAnime(rows.length ? rows : null);
    return () => { active = false; };
  }, [auth, bookmarks, localBackend]);

  const scroll = (direction: -1 | 1) =>
    scrollRef.current?.scrollBy({
      left: direction * Math.max(220, Math.round((scrollRef.current?.clientWidth || 320) * 0.75)),
      behavior: "smooth",
    });

  if (loading || !anime?.length) return null;

  return (
    <section className="w-full py-5 sm:py-7">
      <div className="mb-4 flex items-center justify-between gap-3 px-4 sm:mb-5 sm:px-6 lg:px-8">
        <SectionHeading title="Continue Watching" icon={<Clock3 className="h-5 w-5" />} />
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => scroll(-1)} aria-label="Previous continue watching" className="h-9 w-9 rounded-full border-white/[0.08] bg-white/[0.035] text-[#aaa2bd] hover:bg-white/[0.07] dark:border-white/[0.08] dark:bg-white/[0.035] dark:text-[#c3bdd8]"><ArrowLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => scroll(1)} aria-label="Next continue watching" className="h-9 w-9 rounded-full border-white/[0.08] bg-white/[0.06] text-[#d0c9ea] hover:bg-white/[0.10] dark:border-white/[0.08] dark:bg-white/[0.06] dark:text-[#d0c9ea]"><ArrowRight className="h-4 w-4" /></Button>
        </div>
      </div>
      <div ref={scrollRef} className="anime-shelf-scroll flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:gap-4 sm:px-6 lg:px-8">
        {anime.map((item, index) => {
          const episode = item.episode;
          const episodeNumber = typeof episode === "string"
            ? (() => {
                const raw = episode.split("?")[0].split("#")[0];
                const lastPart = raw.split("/").filter(Boolean).pop() || raw;
                const direct = Number(lastPart);
                if (Number.isFinite(direct) && direct > 0) return direct;
                let end = lastPart.length - 1;
                while (end >= 0 && (lastPart.charCodeAt(end) < 48 || lastPart.charCodeAt(end) > 57)) end -= 1;
                let start = end;
                while (start >= 0 && lastPart.charCodeAt(start) >= 48 && lastPart.charCodeAt(start) <= 57) start -= 1;
                const suffix = end >= start + 1 ? Number(lastPart.slice(start + 1, end + 1)) : 0;
                return Number.isFinite(suffix) && suffix > 0 ? suffix : 1;
              })()
            : episode.episodeNumber;
          const current = typeof episode === "string" ? 0 : episode.current || 0;
          const total = typeof episode === "string" ? 0 : episode.timestamp || 0;
          const percent = total > 0 ? Math.min(100, (current / total) * 100) : 0;
          const poster = item.poster && !isBrandArtwork(item.poster) && !brokenPosters.has(String(item.id));
          return (
            <Link key={`${item.id}-${index}`} href={ROUTES.watchAnime(item.id, episodeNumber)} className="group flex w-[68%] max-w-[360px] shrink-0 snap-start items-center gap-3 rounded-2xl border border-white/[0.07] bg-[#19070d] p-2.5 transition-colors duration-150 hover:border-[#ff3b72]/65 dark:border-white/[0.07] dark:bg-[#19070d] dark:hover:border-[#ff3b72] sm:w-[48%] md:w-[38%] lg:w-[30%]">
              <div className="relative grid h-[70px] w-[50px] shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-[#351021] via-[#1b0a17] to-[#100b18]">
                {poster ? <Image src={item.poster} alt={item.name} fill sizes="72px" className="object-cover" onError={() => setBrokenPosters((previous) => new Set(previous).add(String(item.id)))} /> : <Film className="h-6 w-6 text-[#ff7398]" aria-hidden="true" />}
                <span className="absolute inset-0 grid place-items-center bg-black/0 text-white transition group-hover:bg-black/25"><Play className="h-6 w-6 opacity-0 drop-shadow group-hover:opacity-100" /></span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-bold leading-snug text-[#1d1a32] dark:text-white">{item.name}</p>
                <p className="mt-2 text-xs font-semibold text-[#ff7398] dark:text-[#ff9fbe]">Ep {episodeNumber}{total > 0 ? ` · ${Math.round(percent)}% watched` : ""}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#40101f] dark:bg-[#401020]"><div className="h-full rounded-full bg-[#ff3b72]" style={{ width: `${percent}%` }} /></div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
