"use client";

import React, { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "./ui/input";
import { Search, ArrowDownToLine, ListFilter } from "lucide-react";
import EpisodeCard from "./common/episode-card";
import { useGetAllEpisodes } from "@/query/get-all-episodes";
import { Episode } from "@/types/episodes";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

type Props = {
  animeId: string;
};

const RANGE_SIZE = 50;

const AnimeEpisodes = ({ animeId }: Props) => {
  const { data, isLoading } = useGetAllEpisodes(animeId);
  const episodes = data?.episodes ?? [];
  const [query, setQuery] = useState("");
  const [selectedRange, setSelectedRange] = useState("1-50");
  const [jumpTo, setJumpTo] = useState("");
  const [jumpTarget, setJumpTarget] = useState<number | null>(null);

  const ranges = useMemo(() => {
    const result: string[] = [];
    for (let start = 1; start <= episodes.length; start += RANGE_SIZE) {
      result.push(`${start}-${Math.min(start + RANGE_SIZE - 1, episodes.length)}`);
    }
    return result;
  }, [episodes.length]);

  useEffect(() => {
    if (!ranges.length) return;
    if (!ranges.includes(selectedRange)) setSelectedRange(ranges[0]);
  }, [ranges, selectedRange]);

  const visibleEpisodes = useMemo(() => {
    if (jumpTarget !== null) return episodes.filter((episode) => Number(episode.number) === jumpTarget);
    const search = query.trim().toLocaleLowerCase();
    if (search) {
      // Search the complete catalogue, not only the currently selected range.
      return episodes.filter((episode) => {
        const number = String(episode.number);
        const title = (episode.title || "").toLocaleLowerCase();
        return number.includes(search) || title.includes(search);
      });
    }

    const [start, end] = (ranges.includes(selectedRange) ? selectedRange : ranges[0] || "1-50")
      .split("-")
      .map(Number);
    return episodes.filter((episode, index) => {
      const number = Number(episode.number) || index + 1;
      return number >= start && number <= end;
    });
  }, [episodes, jumpTarget, query, ranges, selectedRange]);

  const handleJump = () => {
    const target = Number(jumpTo);
    if (!Number.isInteger(target) || target < 1 || target > episodes.length) return;
    const range = ranges.find((item) => {
      const [start, end] = item.split("-").map(Number);
      return target >= start && target <= end;
    });
    if (range) setSelectedRange(range);
    setQuery("");
    setJumpTarget(target);
    requestAnimationFrame(() => {
      document.getElementById(`episode-option-${target}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  };

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2 text-xs text-zinc-400">
            <ListFilter className="h-4 w-4 shrink-0 text-[#ff9fbe]" />
            <span>{query.trim() ? `${visibleEpisodes.length} results` : `${episodes.length} episodes available`}</span>
            {!query.trim() && episodes.length > RANGE_SIZE && (
              <span className="text-zinc-600">· Showing a range to keep navigation quick</span>
            )}
          </div>
          {ranges.length > 1 && (
            <Select value={selectedRange} onValueChange={(value) => { setSelectedRange(value); setQuery(""); setJumpTarget(null); }}>
              <SelectTrigger aria-label="Episode range" className="h-9 w-full rounded-xl border-white/10 bg-white/[0.04] text-xs text-zinc-200 sm:w-[170px]">
                <SelectValue placeholder="Choose episodes" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {ranges.map((range) => (
                    <SelectItem key={range} value={range}>Episodes {range}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(160px,220px)]">
          <div className="relative min-w-0">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <Input
              value={query}
              onChange={(event) => { setJumpTarget(null); setQuery(event.target.value); }}
              placeholder="Search any episode number or title…"
              aria-label="Search all episodes"
              className="h-10 w-full rounded-xl border-white/10 bg-white/[0.04] pl-9 text-sm text-white placeholder:text-zinc-500"
            />
          </div>
          <form
            className="flex min-w-0 gap-2"
            onSubmit={(event) => { event.preventDefault(); handleJump(); }}
          >
            <Input
              inputMode="numeric"
              type="number"
              min={1}
              max={episodes.length || undefined}
              value={jumpTo}
              onChange={(event) => setJumpTo(event.target.value)}
              placeholder="Jump to episode #"
              aria-label="Jump to episode number"
              className="h-10 min-w-0 rounded-xl border-white/10 bg-white/[0.04] text-sm text-white placeholder:text-zinc-500"
            />
            <button type="submit" disabled={!jumpTo || !episodes.length} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#ff3b72]/15 px-3 text-xs font-bold text-[#ff9fbe] transition hover:bg-[#ff3b72]/25 disabled:cursor-not-allowed disabled:opacity-40">
              <ArrowDownToLine className="h-3.5 w-3.5" /> Go
            </button>
          </form>
        </div>
      </div>

      <div
        className="max-h-[min(62vh,34rem)] w-full space-y-1.5 overflow-y-auto overscroll-contain rounded-xl border border-white/[0.06] bg-black/10 p-2 pr-1.5 [scrollbar-gutter:stable]"
        aria-label="Episode choices"
      >
        {visibleEpisodes.map((episode: Episode) => (
          <div id={`episode-option-${episode.number}`} key={episode.episodeId || episode.number} className="scroll-m-2">
            <EpisodeCard episode={episode} className="w-full" animeId={animeId} variant="list" />
          </div>
        ))}
        {!visibleEpisodes.length && !isLoading && (
          <div className="flex min-h-24 items-center justify-center rounded-xl px-4 text-center text-sm text-zinc-500">
            {query ? "No episodes match that search. Try another title or number." : "No episodes available."}
          </div>
        )}
        {isLoading && Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className={cn("h-12 w-full animate-pulse rounded-lg bg-white/[0.045]")} />
        ))}
      </div>
      {(query.trim() || jumpTarget !== null) && (
        <button type="button" onClick={() => { setQuery(""); setJumpTarget(null); }} className="text-xs font-semibold text-[#ff9fbe] hover:text-white">
          Clear filter and return to selected range
        </button>
      )}
    </div>
  );
};

export default AnimeEpisodes;
