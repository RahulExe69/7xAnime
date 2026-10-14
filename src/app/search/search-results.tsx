"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import SearchBar from "@/components/search-bar";
import { Bookmark, CalendarDays, Flame, Search, SearchX, SlidersHorizontal, Sparkles, TrendingUp, X, ChartNoAxesColumnIncreasing } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import AnimeCard from "@/components/anime-card";

import { useRouter, useSearchParams } from "next/navigation";
import { useGetSearchAnimeResults } from "@/query/get-search-results";
import Pagination from "@/components/common/pagination";
import { useAnimeSearchParams } from "@/hooks/use-anime-search-params";
import Select from "@/components/common/select";
import {
  statuses,
  types,
  ratings,
  seasons,
  languages,
  sort,
  genres,
} from "@/constants/search-filters";
import { SearchAnimeParams } from "@/types/anime";
import Button from "@/components/common/custom-button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

const COLLECTION_TITLES: Record<string, string> = {
  new: "New Today",
  "currently-airing": "Currently Airing",
  trending: "Trending Now",
  popular: "All-Time Popular",
  upcoming: "Coming Next Season",
  "top-airing": "Top Rated Airing Now",
  completed: "Top Completed Series",
};

const SORT_PRESETS = [
  { value: "popular", label: "Most Popular", mode: "collection", icon: Flame },
  { value: "trending", label: "Trending Now", mode: "collection", icon: TrendingUp },
  { value: "score", label: "Highest Rated", mode: "sort", icon: Sparkles },
  { value: "recently-added", label: "Newest First", mode: "sort", icon: CalendarDays },
  { value: "most-watched", label: "Most Watched", mode: "sort", icon: ChartNoAxesColumnIncreasing },
];

const SearchResults = () => {
  const params = useAnimeSearchParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const displayPhrase = params.q.replace(/^"+|"+$/g, "").trim();
  const hasManualFilters = Boolean(params.q || params.type || params.status || params.rated || params.season || params.language || params.genres || params.sort);
  const requestParams = useMemo(
    () => (!params.collection && !hasManualFilters ? { ...params, collection: "popular" } : params),
    [params, hasManualFilters],
  );
  const collectionTitle = requestParams.collection ? COLLECTION_TITLES[requestParams.collection] : undefined;
  const activePreset = requestParams.collection === "popular" || requestParams.collection === "trending"
    ? requestParams.collection
    : requestParams.sort || (requestParams.collection === "top-airing" ? "score" : undefined);

  const { data: searchResults, isLoading } = useGetSearchAnimeResults(requestParams);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [filters, setFilters] = React.useState<SearchAnimeParams>({
    q: params.q,
    page: params.page,
    type: params.type,
    status: params.status,
    rated: params.rated,
    season: params.season,
    language: params.language,
    sort: params.sort,
    genres: params.genres,
  });

  const handleNextPage = () => {
    if (searchResults?.hasNextPage) {
      handlePageChange((params.page || 1) + 1);
    }
  };

  const handlePreviousPage = () => {
    if ((params.page || 1) > 1) {
      handlePageChange((params.page || 1) - 1);
    }
  };

  const handlePageChange = (pageNumber: number) => {
    if (pageNumber < 1) return;
    const _params = new URLSearchParams(searchParams.toString());
    _params.set("page", pageNumber.toString());
    router.push(`/search?${_params.toString()}`);
  };

  useEffect(() => {
    setFilters({
      q: params.q, page: params.page, type: params.type, status: params.status, rated: params.rated,
      season: params.season, language: params.language, sort: params.sort, genres: params.genres,
    });
  }, [params]);

  const onChange = (key: keyof typeof filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const choosePreset = (preset: (typeof SORT_PRESETS)[number]) => {
    if (preset.mode === "collection") router.push(`/search?collection=${preset.value}`);
    else router.push(`/search?sort=${preset.value}`);
  };

  const applyFilters = () => {
    const next = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (key === "page") return;
      if (typeof value === "string" && value.trim() !== "") next.set(key, value);
    });
    router.push(next.size ? `/search?${next.toString()}` : "/search?collection=popular");
    setFiltersOpen(false);
  };

  const resetFilters = () => {
    setFilters({
      q: "",
      page: 1,
      type: "",
      status: "",
      rated: "",
      season: "",
      language: "",
      sort: "",
      genres: "",
    });
    router.push("/search?collection=popular");
    setFiltersOpen(false);
  };

  return (
    <main className="mx-auto flex min-h-[75vh] w-full max-w-[1600px] flex-col gap-4 px-4 pb-20 pt-20 text-white sm:gap-5 sm:px-6 sm:pb-16 sm:pt-28 lg:px-8">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#ff3b72]/12 text-[#ff9fbe]">
              <Search className="h-[18px] w-[18px]" />
            </span>
            <h1 className="truncate text-[1.55rem] font-black tracking-tight sm:text-3xl">
              {displayPhrase ? "Search results" : "Browse Anime"}
            </h1>
          </div>
          <p className="mt-1 pl-10 text-xs font-medium text-[#b8afcb] sm:text-sm">
            {isLoading ? "Finding your next favourite…" : searchResults ? `${searchResults.animes.length}${searchResults.hasNextPage ? "+" : ""} results` : "Discover your next favourite"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/library" aria-label="My List" title="My List" className="hidden h-10 items-center justify-center gap-2 rounded-xl border border-white/[0.10] bg-white/[0.035] px-3 text-sm font-semibold text-[#d9cbdc] transition hover:border-[#ff3b72]/40 hover:text-[#ffbad0] sm:inline-flex">
            <Bookmark className="h-4 w-4" /> My List
          </Link>
          <button type="button" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen} aria-controls="explore-filters"
            className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition ${filtersOpen ? "border-[#ff3b72]/50 bg-[#ff3b72]/12 text-[#ffbad0]" : "border-white/[0.12] bg-white/[0.035] text-[#d9cbdc] hover:border-[#ff3b72]/40 hover:text-[#ffbad0]"}`}>
            {filtersOpen ? <X className="h-4 w-4" /> : <SlidersHorizontal className="h-4 w-4" />}
            <span>{filtersOpen ? "Close" : "Filters"}</span>
          </button>
        </div>
      </header>

      <nav aria-label="Sort anime" className="anime-shelf-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {SORT_PRESETS.map((preset) => {
          const Icon = preset.icon;
          const active = activePreset === preset.value;
          return (
            <button key={preset.value} type="button" onClick={() => choosePreset(preset)} aria-pressed={active}
              className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-xs font-bold transition sm:text-sm ${active ? "border-[#ff3b72]/55 bg-[#ff3b72]/12 text-[#ffbad0]" : "border-white/[0.10] bg-[#19070d] text-[#c8bfd7] hover:border-[#ff3b72]/35 hover:text-white"}`}>
              <Icon className={`h-4 w-4 ${active ? "text-[#ff9fbe]" : "text-[#a9a0bf]"}`} />
              {preset.label}
            </button>
          );
        })}
      </nav>

      {filtersOpen && (
        <section id="explore-filters" aria-label="Anime filters" className="flex flex-col gap-4 rounded-2xl border border-white/[0.09] bg-[#16070d]/95 p-4 shadow-lg shadow-black/10 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold">Find your kind of anime</h2>
              <p className="mt-1 text-xs text-[#a39ab6]">Search a title or narrow the list with filters.</p>
            </div>
            <button type="button" onClick={resetFilters} className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#ff9fbe] hover:bg-[#ff3b72]/10">Reset all</button>
          </div>
          <SearchBar className="w-full" showFilterButton={false} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Select options={types} placeholder="Type" value={filters.type} onChange={(val) => onChange("type", val)} className="w-full" />
            <Select options={statuses} placeholder="Status" value={filters.status} onChange={(val) => onChange("status", val)} className="w-full" />
            <Select options={ratings} placeholder="Rated" value={filters.rated} onChange={(val) => onChange("rated", val)} className="w-full" />
            <Select options={seasons} placeholder="Season" value={filters.season} onChange={(val) => onChange("season", val)} className="w-full" />
            <Select options={languages} placeholder="Language" value={filters.language} onChange={(val) => onChange("language", val)} className="w-full" />
            <Select options={sort} placeholder="Sort" value={filters.sort} onChange={(val) => onChange("sort", val)} className="w-full" />
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">Genres</p>
            <ToggleGroup type="multiple" className="flex flex-wrap justify-start gap-2" value={filters.genres?.split(",") || []}
              onValueChange={(value) => onChange("genres", value.filter(Boolean).join(","))}>
              {genres.map((genre) => (
                <ToggleGroupItem value={genre.value} key={genre.value} size="sm"
                  className={cn(
                    "rounded-full border border-white/[0.10] bg-white/[0.035] text-[#c7c1dc] hover:border-[#ff3b72]/40 hover:bg-[#ff3b72]/10 hover:text-[#ffbad0]",
                    "data-[state=on]:border-[#ff3b72]/50 data-[state=on]:bg-[#ff3b72]/15 data-[state=on]:text-[#ffbad0]",
                  )}>
                  {genre.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-10 flex-1 rounded-xl bg-[#ff3b72] text-white hover:bg-[#ed245c]" onClick={applyFilters}>Apply filters</Button>
            <Button size="sm" className="h-10 rounded-xl border border-white/10 px-5 text-[#d8ccdf]" onClick={resetFilters} variant="link">Reset</Button>
          </div>
        </section>
      )}

      {displayPhrase && (
        <div className="flex items-center justify-between gap-2">
          <h2 className="min-w-0 truncate text-sm font-semibold text-[#e7dce9]">Results for “{displayPhrase}”</h2>
          <Link href="/search?collection=popular" className="shrink-0 text-xs font-semibold text-[#ff9fbe] hover:text-white">Clear search</Link>
        </div>
      )}
      {collectionTitle && <p className="text-xs font-medium text-[#a39ab6]">{collectionTitle} · curated for you</p>}

      {isLoading && (
        <div className="grid w-full grid-cols-2 content-start gap-x-3 gap-y-4 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
          {Array.from({ length: 10 }, (_, idx) => <div key={idx} className="aspect-[2/3] w-full animate-pulse rounded-2xl bg-white/[0.06]" />)}
        </div>
      )}
      {!isLoading && searchResults?.animes?.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.10] bg-[#16070d] px-5 py-12 text-center">
          <SearchX className="mb-3 h-8 w-8 text-[#ff9fbe]" />
          <h3 className="text-base font-semibold text-white">No anime found</h3>
          <p className="mt-1 max-w-sm text-sm text-[#a39ab6]">Try a different title or loosen a few filters.</p>
          <button type="button" onClick={resetFilters} className="mt-4 rounded-xl bg-[#ff3b72]/12 px-4 py-2 text-sm font-semibold text-[#ffbad0]">Reset filters</button>
        </div>
      )}
      <div className="grid w-full grid-cols-2 content-start gap-x-3 gap-y-4 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
        {searchResults?.animes.map((anime) => (
          <AnimeCard key={anime.id} title={anime.name} format={anime.type} poster={anime.poster}
            href={ROUTES.animeDetails(anime.id)} quickWatchHref={ROUTES.watchAnime(anime.id)}
            episodes={anime.episodes?.sub} score={anime.score} className="w-full min-w-0" showGenre={false} />
        ))}
      </div>
      {searchResults && searchResults.totalPages && (
        <Pagination totalPages={searchResults.totalPages} currentPage={params.page} handleNextPage={handleNextPage}
          handlePageChange={handlePageChange} handlePreviousPage={handlePreviousPage} />
      )}
    </main>
  );;
};

export default SearchResults;
