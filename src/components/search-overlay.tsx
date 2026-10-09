"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, TrendingUp, X, Clock3 } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { useSearchAnime } from "@/query/search-anime";
import { ROUTES } from "@/constants/routes";

const TRENDING_SEARCHES = [
  "Attack on Titan", "Demon Slayer", "One Piece", "Jujutsu Kaisen", "Frieren",
  "Solo Leveling", "Vinland Saga", "Chainsaw Man", "Spy x Family", "Blue Lock",
];

type Props = { open: boolean; onClose: () => void };

export default function SearchOverlay({ open, onClose }: Props) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedValue = useDebounce(value, 280);
  const router = useRouter();
  const { data: results, isLoading } = useSearchAnime(debouncedValue.trim());
  const query = debouncedValue.trim();

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => inputRef.current?.focus(), 60);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Enter" && value.trim()) {
        event.preventDefault();
        router.push(`${ROUTES.SEARCH}?q=${encodeURIComponent(value.trim())}`);
        onClose();
      }
    };
    const onNativeBack = (event: Event) => { event.preventDefault(); onClose(); };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("7xanime:back", onNativeBack);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("7xanime:back", onNativeBack);
    };
  }, [open, onClose, router, value]);

  const trending = useMemo(() => TRENDING_SEARCHES, []);
  if (!open) return null;

  const submitSearch = (search = value) => {
    if (!search.trim()) return;
    router.push(`${ROUTES.SEARCH}?q=${encodeURIComponent(search.trim())}`);
    onClose();
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Search anime" className="fixed inset-0 z-[220] overflow-y-auto bg-[#f8f7fd] text-[#211e38] dark:bg-[#111019] dark:text-white">
      <div className="sticky top-0 z-10 border-b border-[#e4e0ef] bg-[#f8f7fd]/95 backdrop-blur-xl dark:border-[#2c2939] dark:bg-[#111019]/95">
        <div className="mx-auto flex min-h-[74px] max-w-4xl items-center gap-3 px-4 sm:px-6">
          <Search className="h-6 w-6 shrink-0 text-[#604bd3] dark:text-[#b6a8ff]" />
          <input ref={inputRef} value={value} onChange={(event) => setValue(event.target.value)} placeholder="Search anime..." aria-label="Search anime" autoComplete="off" onKeyDown={(event) => { if (event.key === "Enter") submitSearch(); }} className="h-14 min-w-0 flex-1 bg-transparent text-lg font-medium outline-none placeholder:text-[#88839c] focus-visible:ring-0 dark:placeholder:text-[#858096] sm:text-xl" />
          {value && <button type="button" onClick={() => { setValue(""); inputRef.current?.focus(); }} aria-label="Clear search" className="rounded-full p-2 text-[#77718d] hover:bg-[#ece9f7] dark:hover:bg-white/10"><X className="h-4 w-4" /></button>}
          <button type="button" onClick={onClose} className="rounded-xl border border-[#dcd7eb] px-3.5 py-2.5 text-sm font-semibold text-[#716b87] transition hover:bg-[#efedf7] dark:border-[#38344a] dark:text-[#bdb6d2] dark:hover:bg-white/5">Close</button>
        </div>
      </div>
      <div className="mx-auto max-w-4xl px-4 pb-10 pt-7 sm:px-6 sm:pt-9">
        {!query ? (
          <section>
            <h2 className="mb-5 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.17em] text-[#77718e] dark:text-[#a39db9]"><TrendingUp className="h-4 w-4" /> Trending searches</h2>
            <div className="flex flex-wrap gap-2.5">
              {trending.map((term) => <button key={term} onClick={() => { setValue(term); inputRef.current?.focus(); }} className="rounded-full border border-[#dfdaef] bg-[#f0eef9] px-4 py-2.5 text-sm font-medium text-[#5e587b] transition hover:border-[#8b79e3] hover:bg-[#e8e3fb] hover:text-[#4f3fc0] dark:border-[#373149] dark:bg-[#201d2d] dark:text-[#d0c9e6] dark:hover:bg-[#2e2942]">{term}</button>)}
            </div>
            <div className="mt-10 flex items-center gap-2 text-sm text-[#8a849e] dark:text-[#87819a]"><Clock3 className="h-4 w-4" /> Start typing to find a series.</div>
          </section>
        ) : (
          <section>
            <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-xs font-extrabold uppercase tracking-[0.17em] text-[#77718e] dark:text-[#a39db9]">Search results</h2><button onClick={() => submitSearch()} className="text-sm font-bold text-[#604bd3] dark:text-[#b6a8ff]">Show all</button></div>
            {isLoading ? (
              <div className="space-y-2">{[0,1,2,3,4].map((key) => <div key={key} className="flex animate-pulse gap-3 rounded-xl bg-[#efedf7] p-2.5 dark:bg-[#1d1a28]"><div className="h-16 w-12 rounded-lg bg-[#e1deee] dark:bg-[#343044]" /><div className="flex-1 space-y-2 pt-2"><div className="h-3 w-4/5 rounded bg-[#e1deee] dark:bg-[#343044]" /><div className="h-3 w-2/5 rounded bg-[#e1deee] dark:bg-[#343044]" /></div></div>)}</div>
            ) : results?.length ? (
              <div className="space-y-1.5">{results.slice(0, 10).map((anime) => (
                <Link key={anime.id} href={ROUTES.animeDetails(anime.id)} onClick={onClose} className="flex items-center gap-3 rounded-xl p-2.5 transition hover:bg-[#eeebf7] dark:hover:bg-white/[0.06]">
                  <div className="relative h-[70px] w-[50px] shrink-0 overflow-hidden rounded-lg bg-[#e8e5f1] dark:bg-[#262233]"><Image src={anime.poster || "/brand/7xanime-mark.svg"} alt={anime.name} fill sizes="50px" className="object-cover" unoptimized /></div>
                  <div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm font-bold text-[#28243f] dark:text-white">{anime.name || anime.jname}</p><p className="mt-1 text-xs text-[#7f7996] dark:text-[#aaa4c0]">{anime.moreInfo?.filter(Boolean).join(" · ") || anime.type || "Anime"}</p></div>
                  <span className="px-2 text-xs font-semibold text-[#8b83a3]">›</span>
                </Link>
              ))}</div>
            ) : (
              <div className="rounded-2xl border border-[#e4e0ef] bg-white px-4 py-10 text-center dark:border-[#2c2939] dark:bg-[#191724]"><Search className="mx-auto mb-3 h-7 w-7 text-[#8e86a8]" /><p className="font-semibold">No matches found</p><p className="mt-1 text-sm text-[#8a849e] dark:text-[#a49eb8]">Try a shorter title or an alternate name.</p></div>
            )}
            <button onClick={() => submitSearch()} className="mt-4 w-full rounded-xl bg-[#604bd3] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#513cc4]">Show all results for “{query}”</button>
          </section>
        )}
      </div>
    </div>
  );
}
