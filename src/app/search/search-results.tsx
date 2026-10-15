"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import SearchBar from "@/components/search-bar";
import { BarChart3, Bookmark, CalendarDays, CheckCircle2, Flame, Search, SearchX, SlidersHorizontal, Sparkles, TrendingUp, X } from "lucide-react";
import { ROUTES } from "@/constants/routes";

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
import { IAnime, SearchAnimeParams } from "@/types/anime";
import Button from "@/components/common/custom-button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import useAnimeAvailabilityFilter from "@/hooks/use-anime-availability-filter";

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
  { value: "most-episodes", label: "Most Episodes", mode: "sort", icon: BarChart3 },
];

function AnimeResultCard({ anime }: { anime: IAnime }) {
  const score = typeof anime.score === "number" && anime.score > 0
    ? (anime.score > 10 ? anime.score / 10 : anime.score).toFixed(1)
    : null;
  const episodes = anime.episodes?.sub || anime.episodes?.dub || 0;

  return (
    <article className="group min-w-0 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#19070d] shadow-[0_8px_22px_rgba(0,0,0,0.16)] transition hover:border-[#ff3b72]/45 hover:shadow-[0_10px_24px_rgba(255,59,114,0.10)]">
      <Link href={ROUTES.animeDetails(anime.id)} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ff3b72]" aria-label={`View ${anime.name} details`}>
        <div className="relative aspect-[2/3] w-full overflow-hidden bg-[#210b14]">
          <Image src={anime.poster || "/brand/7xanime-mark.svg"} alt={anime.name} fill sizes="(max-width: 640px) 46vw, (max-width: 1024px) 28vw, 220px" className="object-cover transition-transform duration-200 group-hover:scale-[1.025]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#100309]/65 to-transparent" />
          {score && <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[#0a0306]/90 px-2 py-1 text-xs font-extrabold text-white shadow backdrop-blur"><span className="text-amber-300">★</span>{score}</span>}
        </div>
        <div className="min-h-[82px] p-3">
          <h2 className="line-clamp-2 text-sm font-extrabold leading-5 tracking-[-0.01em] text-[#fff3f7]">{anime.name}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-[#a99baa]">
            {score && <span className="inline-flex items-center gap-1 font-bold text-amber-300"><span>★</span>{score}</span>}
            {anime.type && <span>{anime.type}</span>}
            {episodes > 0 && <span>· {episodes} ep</span>}
          </div>
        </div>
      </Link>
    </article>
  );
}

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
  const collectionTitle = params.collection ? COLLECTION_TITLES[params.collection] : undefined;
  const activePreset = requestParams.collection === "popular" || requestParams.collection === "trending"
    ? requestParams.collection
    : requestParams.sort || (requestParams.collection === "top-airing" ? "score" : undefined);

  const { data: searchResults, isLoading } = useGetSearchAnimeResults(requestParams);
  const availableOnly = searchParams.get("available") === "1";
  const { filteredItems: visibleAnimes, isChecking: isCheckingAvailability, unknownCount } = useAnimeAvailabilityFilter(searchResults?.animes, availableOnly);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const noSearchMatches = !isLoading && !isCheckingAvailability && !!searchResults && (
    availableOnly ? visibleAnimes.length === 0 : searchResults.animes.length === 0
  );

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
    const next = new URLSearchParams();
    if (preset.mode === "collection") next.set("collection", preset.value);
    else next.set("sort", preset.value);
    if (availableOnly) next.set("available", "1");
    router.push(`/search?${next.toString()}`);
  };

  const toggleAvailability = () => {
    const next = new URLSearchParams(searchParams.toString());
    if (availableOnly) next.delete("available");
    else next.set("available", "1");
    next.set("page", "1");
    router.push(`/search?${next.toString()}`);
  };

  const applyFilters = () => {
    const next = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (key === "page") return;
      if (typeof value === "string" && value.trim() !== "") next.set(key, value);
    });
    if (availableOnly) next.set("available", "1");
    const query = next.toString();
    router.push(query ? `/search?${query}` : "/search?collection=popular");
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
    <main className="mx-auto flex min-h-[75vh] w-full max-w-[1600px] flex-col gap-4 px-4 pb-20 pt-14 text-white sm:gap-5 sm:px-6 sm:pb-16 sm:pt-28 lg:px-8">
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
            {isLoading ? "Finding your next favourite…" : availableOnly && isCheckingAvailability ? "Checking provider episodes…" : availableOnly ? `${visibleAnimes.length} confirmed on this page${unknownCount ? ` · ${unknownCount} unverified` : ""}` : searchResults ? `${searchResults.animes.length}${searchResults.hasNextPage ? "+" : ""} results` : "Discover your next favourite"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/library" aria-label="My List" title="My List" className="hidden h-10 items-center justify-center gap-2 rounded-xl border border-white/[0.10] bg-white/[0.035] px-3 text-sm font-semibold text-[#d9cbdc] transition hover:border-[#ff3b72]/40 hover:text-[#ffbad0] sm:inline-flex">
            <Bookmark className="h-4 w-4" /> My List
          </Link>
          <button type="button" onClick={toggleAvailability} aria-pressed={availableOnly} aria-label="Filter to titles with provider episode listings" title="Show only titles with provider episode listings"
            className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold transition ${availableOnly ? "border-[#ff3b72]/50 bg-[#ff3b72]/12 text-[#ffbad0]" : "border-white/[0.12] bg-white/[0.035] text-[#d9cbdc] hover:border-[#ff3b72]/40 hover:text-[#ffbad0]"}`}>
            <CheckCircle2 className="h-4 w-4" /><span className="hidden sm:inline">Available</span>
          </button>
          <button type="button" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen} aria-controls="explore-filters"
            className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition ${filtersOpen ? "border-[#ff3b72]/50 bg-[#ff3b72]/12 text-[#ffbad0]" : "border-white/[0.12] bg-white/[0.035] text-[#d9cbdc] hover:border-[#ff3b72]/40 hover:text-[#ffbad0]"}`}>
            {filtersOpen ? <X className="h-4 w-4" /> : <SlidersHorizontal className="h-4 w-4" />}
            <span>{filtersOpen ? "Close" : "Filters"}</span>
          </button>
        </div>
      </header>

      <nav aria-label="Sort anime" className="flex flex-wrap gap-2 px-0 pb-1">
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
          <Link href={availableOnly ? "/search?collection=popular&available=1" : "/search?collection=popular"} className="shrink-0 text-xs font-semibold text-[#ff9fbe] hover:text-white">Clear search</Link>
        </div>
      )}
      {collectionTitle && !["popular", "trending"].includes(params.collection || "") && <p className="text-xs font-medium text-[#a39ab6]">{collectionTitle} · curated for you</p>}

      {(isLoading || (availableOnly && isCheckingAvailability)) && (
        <div className="grid w-full grid-cols-2 content-start gap-x-3 gap-y-4 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
          {Array.from({ length: 10 }, (_, idx) => <div key={idx} className="aspect-[2/3] w-full animate-pulse rounded-2xl bg-white/[0.06]" />)}
        </div>
      )}
      {noSearchMatches && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.10] bg-[#16070d] px-5 py-12 text-center">
          <SearchX className="mb-3 h-8 w-8 text-[#ff9fbe]" />
          <h3 className="text-base font-semibold text-white">{availableOnly && searchResults?.animes.length ? "No confirmed playable matches" : "No anime found"}</h3>
          <p className="mt-1 max-w-sm text-sm text-[#a39ab6]">{availableOnly && searchResults?.animes.length ? (unknownCount > 0 ? `${unknownCount} title(s) could not be verified because a provider did not respond. They are excluded rather than shown as playable; try again later.` : "No title on this page has a confirmed provider episode listing for your selected catalogue results.") : "Try a different title or loosen a few filters."}</p>
          <button type="button" onClick={resetFilters} className="mt-4 rounded-xl bg-[#ff3b72]/12 px-4 py-2 text-sm font-semibold text-[#ffbad0]">Reset filters</button>
        </div>
      )}
      <div className="grid w-full grid-cols-2 content-start gap-x-3 gap-y-4 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
        {visibleAnimes.map((anime) => <AnimeResultCard key={anime.id} anime={anime} />)}
      </div>
      {availableOnly && !isCheckingAvailability && unknownCount > 0 && <p role="status" className="text-xs text-[#a39ab6]">{unknownCount} title(s) could not be verified and are not shown as available.</p>}
      {searchResults && searchResults.totalPages && (
        <Pagination totalPages={searchResults.totalPages} currentPage={params.page} handleNextPage={handleNextPage}
          handlePageChange={handlePageChange} handlePreviousPage={handlePreviousPage} />
      )}
    </main>
  );
};

export default SearchResults;
