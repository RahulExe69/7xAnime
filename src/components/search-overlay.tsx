"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Info, Search, X } from "lucide-react";
import useDebounce from "@/hooks/use-debounce";
import { useSearchAnime } from "@/query/search-anime";
import useAnimeAvailabilityFilter from "@/hooks/use-anime-availability-filter";
import { ROUTES } from "@/constants/routes";

type Props = { open: boolean; onClose: () => void };

export default function SearchOverlay({ open, onClose }: Props) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedValue = useDebounce(value, 280);
  const router = useRouter();
  const { data: results, isLoading } = useSearchAnime(debouncedValue.trim());
  const [availableOnly, setAvailableOnly] = useState(false);
  const availability = useAnimeAvailabilityFilter(results, open && availableOnly);
  const visibleResults = availableOnly ? availability.filteredItems : (results || []);
  const query = debouncedValue.trim();

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => inputRef.current?.focus(), 60);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
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
  }, [open, onClose, router]);

  if (!open) return null;

  const submitSearch = (search = value) => {
    if (!search.trim()) return;
    const searchParams = new URLSearchParams({ q: search.trim() });
    if (availableOnly) searchParams.set("available", "1");
    router.push(`${ROUTES.SEARCH}?${searchParams.toString()}`);
    onClose();
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Search anime" className="fixed inset-0 z-[220] overflow-y-auto bg-[#100309] text-white">
      <div className="sticky top-0 z-10 border-b border-white/[0.07] bg-[#100309]/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[74px] max-w-4xl items-center gap-3 px-4 sm:px-6">
          <Search className="h-6 w-6 shrink-0 text-[#ff3b72] dark:text-[#ff9fbe]" />
          <input ref={inputRef} value={value} onChange={(event) => setValue(event.target.value)} placeholder="Search anime..." aria-label="Search anime" autoComplete="off" onKeyDown={(event) => { if (event.key === "Enter") submitSearch(); }} className="h-14 min-w-0 flex-1 bg-transparent text-lg font-medium outline-none placeholder:text-[#c49dad] focus-visible:ring-0 dark:placeholder:text-[#bd92a2] sm:text-xl" />
          {value && <button type="button" onClick={() => { setValue(""); inputRef.current?.focus(); }} aria-label="Clear search" className="rounded-full p-2 text-[#77718d] hover:bg-[#ece9f7] dark:hover:bg-white/10"><X className="h-4 w-4" /></button>}
          <button type="button" onClick={onClose} className="rounded-xl border border-white/10 px-3.5 py-2.5 text-sm font-semibold text-[#bdb6d2] transition hover:bg-white/[0.07]">Close</button>
        </div>
      </div>
      <div className="mx-auto max-w-4xl px-4 pb-10 pt-7 sm:px-6 sm:pt-9">
        {!query ? (
          <section className="flex min-h-[38vh] flex-col items-center justify-center text-center">
            <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.035] text-[#ff9fbe]"><Search className="h-6 w-6" /></span>
            <h2 className="text-lg font-bold text-white">Find your next series</h2>
            <p className="mt-2 max-w-sm text-sm text-[#c59dad]">Search the catalogue by anime title. Results are loaded from the live catalogue.</p>
          </section>
        ) : (
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xs font-extrabold uppercase tracking-[0.17em] text-[#77718e] dark:text-[#a39db9]">Search results</h2>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setAvailableOnly((current) => !current)} aria-pressed={availableOnly} title="Only show titles with provider episode listings" className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-bold transition ${availableOnly ? "border-[#ff3b72]/55 bg-[#ff3b72]/12 text-[#ffbad0]" : "border-white/10 text-[#c8bfd7] hover:border-[#ff3b72]/35"}`}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Available only
                </button>
                <button onClick={() => submitSearch()} className="text-sm font-bold text-[#ff3b72] dark:text-[#ff9fbe]">Show all</button>
              </div>
            </div>
            {isLoading || (availableOnly && availability.isChecking) ? (
              <div className="space-y-2">{[0,1,2,3,4].map((key) => <div key={key} className="flex animate-pulse gap-3 rounded-xl bg-[#efedf7] p-2.5 dark:bg-[#1d1a28]"><div className="h-16 w-12 rounded-lg bg-[#e1deee] dark:bg-[#401020]" /><div className="flex-1 space-y-2 pt-2"><div className="h-3 w-4/5 rounded bg-[#e1deee] dark:bg-[#401020]" /><div className="h-3 w-2/5 rounded bg-[#e1deee] dark:bg-[#401020]" /></div></div>)}</div>
            ) : visibleResults.length ? (
              <div className="space-y-1.5">{visibleResults.slice(0, 10).map((anime) => (
                <div key={anime.id} className="flex items-center gap-2 rounded-xl p-2.5 transition hover:bg-[#eeebf7] dark:hover:bg-white/[0.06]">
                  <Link href={ROUTES.watchAnime(anime.id)} onClick={onClose} aria-label={`Watch ${anime.name || anime.jname}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="relative h-[70px] w-[50px] shrink-0 overflow-hidden rounded-lg bg-[#e8e5f1] dark:bg-[#262233]"><Image src={anime.poster || "/brand/7xanime-mark.svg"} alt={anime.name} fill sizes="50px" className="object-cover" /></div>
                  <div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm font-bold text-[#28243f] dark:text-white">{anime.name || anime.jname}</p><p className="mt-1 text-xs text-[#7f7996] dark:text-[#d6abbc]">{anime.moreInfo?.filter(Boolean).join(" · ") || anime.type || "Anime"}</p></div>
                  <span className="px-1 text-xs font-semibold text-[#8b83a3]">▶</span>
                  </Link>
                  <Link href={ROUTES.animeDetails(anime.id)} onClick={onClose} title={`Details for ${anime.name || anime.jname}`} aria-label={`Details for ${anime.name || anime.jname}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#4b1727] text-[#77718f] hover:bg-[#ded8f5] dark:border-[#38344a] dark:text-[#bdb6d2] dark:hover:bg-white/10"><Info className="h-4 w-4" aria-hidden="true" /></Link>
                </div>
              ))}</div>
            ) : (
              <div className="rounded-2xl border border-[#40101f] bg-white px-4 py-10 text-center dark:border-[#2c2939] dark:bg-[#19070d]"><Search className="mx-auto mb-3 h-7 w-7 text-[#8e86a8]" /><p className="font-semibold">No matches found</p><p className="mt-1 text-sm text-[#8a849e] dark:text-[#a49eb8]">{availableOnly && (results?.length || 0) > 0 ? (availability.unknownCount > 0 ? `${availability.unknownCount} title(s) could not be verified because providers did not respond. Try again later or turn off this filter.` : "No checked titles have provider episode listings for this query.") : "Try a shorter title or an alternate name."}</p></div>
            )}
            {availableOnly && !availability.isChecking && visibleResults.length > 0 && availability.unknownCount > 0 && <p role="status" className="mt-3 text-xs text-[#a39ab6]">{availability.unknownCount} additional title(s) could not be verified and are not shown as available.</p>}
            <button onClick={() => submitSearch()} className="mt-4 w-full rounded-xl bg-[#ff3b72] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#ed245c]">Show all results for “{query}”</button>
          </section>
        )}
      </div>
    </div>
  );
}
