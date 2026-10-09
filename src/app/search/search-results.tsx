"use client";

import React from "react";
import Link from "next/link";
import SearchBar from "@/components/search-bar";
import { Bookmark, CalendarDays, CheckCircle2, Flame, Search, SearchX, Sparkles, TrendingUp } from "lucide-react";
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

const EXPLORE_COLLECTIONS = [
  { value: "trending", title: "Trending", description: "Popular this week", icon: Flame },
  { value: "currently-airing", title: "Airing now", description: "Series releasing now", icon: CalendarDays },
  { value: "popular", title: "Fan favourites", description: "All-time popular picks", icon: TrendingUp },
  { value: "upcoming", title: "Coming soon", description: "Next season watchlist", icon: Sparkles },
  { value: "new", title: "New today", description: "Recently updated anime", icon: CheckCircle2 },
  { value: "completed", title: "Completed", description: "Finished stories to binge", icon: Bookmark },
];

const SearchResults = () => {
  const params = useAnimeSearchParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const displayPhrase = params.q.replace(/^"+|"+$/g, "").trim();
  const collectionTitle = params.collection ? COLLECTION_TITLES[params.collection] : undefined;

  const { data: searchResults, isLoading } = useGetSearchAnimeResults(params);

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

  const onChange = (key: keyof typeof filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const applyFilters = () => {
    const searchParams = new URLSearchParams();

    onChange("q", params.q);

    Object.entries(filters).forEach(([key, value]) => {
      if (typeof value === "string" && value.trim() !== "") {
        searchParams.set(key, value);
      } else if (typeof value === "number" && !isNaN(value)) {
        searchParams.set(key, value.toString());
      }
    });

    searchParams.delete("page");

    router.push(`/search?${searchParams.toString()}`);
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
    router.push('/search?q=""');
  };

  return (
    <div className="mx-auto flex min-h-[75vh] w-full max-w-[1600px] flex-col gap-6 px-4 pb-16 pt-28 text-[#211e38] sm:gap-8 md:px-6 lg:pt-32 lg:px-8 dark:text-white">
      <section className="flex flex-col justify-between gap-4 rounded-3xl border border-[#dedbea] bg-gradient-to-br from-[#f7f4ff] via-white to-[#fff3fa] p-5 shadow-[0_8px_28px_rgba(37,25,81,0.05)] dark:border-[#302c40] dark:from-[#21152e] dark:via-[#171421] dark:to-[#21121e] sm:flex-row sm:items-end sm:p-7">
        <div className="max-w-2xl">
          <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#b62b80] dark:text-[#ff8bc8]">Discover something new</p>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Explore Anime</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#77728f] dark:text-[#b8afcb]">Browse what is trending, find currently airing shows, or build your next binge from completed series.</p>
        </div>
        <Link href="/library" className="inline-flex h-10 shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-[#dedbea] bg-white px-4 text-sm font-bold text-[#433a61] transition hover:border-[#ff2f9d]/40 hover:text-[#b62b80] dark:border-white/10 dark:bg-white/[0.04] dark:text-[#e5deef] dark:hover:border-[#ff2f9d]/40 dark:hover:text-[#ff9acb] sm:self-auto">
          <Bookmark className="h-4 w-4" /> My List
        </Link>
      </section>

      <section aria-label="Explore anime collections" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {EXPLORE_COLLECTIONS.map((collection) => {
          const Icon = collection.icon;
          const active = params.collection === collection.value;
          return (
            <Link key={collection.value} href={`/search?collection=${collection.value}`} aria-current={active ? "page" : undefined}
              className={`group rounded-2xl border p-3.5 transition sm:p-4 ${active ? "border-[#ff2f9d]/45 bg-[#ff2f9d]/10" : "border-[#dedbea] bg-white hover:border-[#ff2f9d]/35 hover:bg-[#fff8fc] dark:border-[#302c40] dark:bg-[#191724] dark:hover:border-[#ff2f9d]/35 dark:hover:bg-[#211a2b]"}`}>
              <span className={`mb-3 grid h-9 w-9 place-items-center rounded-xl ${active ? "bg-[#ff2f9d]/15 text-[#c62b82] dark:text-[#ff9acb]" : "bg-[#f0ebff] text-[#604bd3] dark:bg-[#604bd3]/15 dark:text-[#b6a8ff]"}`}><Icon className="h-4 w-4" /></span>
              <span className="block text-sm font-extrabold">{collection.title}</span>
              <span className="mt-1 block text-[11px] leading-4 text-[#77728f] dark:text-[#a39db9]">{collection.description}</span>
            </Link>
          );
        })}
      </section>

      <div className="flex flex-col gap-5 rounded-2xl border border-[#dedbea] bg-white p-4 shadow-[0_5px_20px_rgba(37,25,81,0.035)] sm:p-6 dark:border-[#302c40] dark:bg-[#191724]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><Search className="h-5 w-5 text-[#604bd3] dark:text-[#b6a8ff]" /><p className="text-lg font-semibold">{collectionTitle ? `Browse ${collectionTitle}` : "Search & filters"}</p></div><span className="text-xs text-[#77728f] dark:text-[#a39db9]">{collectionTitle ? `Curated list: ${collectionTitle}` : "Search by title or narrow results by type, language, season, and genre."}</span></div><SearchBar className="max-w-2xl" showFilterButton={false} /><p className="text-sm font-semibold text-[#5f5a73] dark:text-zinc-300">Refine results</p>
        <div className="flex flex-wrap gap-3">
          <Select
            options={types}
            placeholder="Type"
            value={filters.type}
            onChange={(val) => onChange("type", val)}
          />
          <Select
            options={statuses}
            placeholder="Status"
            value={filters.status}
            onChange={(val) => onChange("status", val)}
          />
          <Select
            options={ratings}
            placeholder="Rated"
            value={filters.rated}
            onChange={(val) => onChange("rated", val)}
          />
          <Select
            options={seasons}
            placeholder="Season"
            value={filters.season}
            onChange={(val) => onChange("season", val)}
          />
          <Select
            options={languages}
            placeholder="Language"
            value={filters.language}
            onChange={(val) => onChange("language", val)}
          />
          <Select
            options={sort}
            placeholder="Sort"
            value={filters.sort}
            onChange={(val) => onChange("sort", val)}
          />
        </div>
        <div>
          <p className="text-lg font-semibold mt-4">Genres</p>
          <ToggleGroup
            type="multiple"
            className="flex flex-wrap justify-start gap-2 mt-4"
            value={filters.genres?.split(",") || []}
            onValueChange={(value) => {
              onChange("genres", value.filter(Boolean).join(","));
            }}
          >
            {genres.map((genre) => (
              <ToggleGroupItem
                value={genre.value}
                key={genre.value}
                size="sm"
                className={cn(
                  "rounded-full border border-[#dedbea] bg-[#f8f7fd] text-[#625d79] hover:border-[#8b79e3] hover:text-[#604bd3] hover:bg-[#eeeafb] dark:border-[#393449] dark:bg-[#201d2a] dark:text-[#c7c1dc] dark:hover:bg-[#302b42]",
                  "data-[state=on]:border-[#8b79e3] data-[state=on]:text-[#4935bd] data-[state=on]:bg-[#e5e0fb] dark:data-[state=on]:border-[#8b79e3] dark:data-[state=on]:text-white dark:data-[state=on]:bg-violet-500/30",
                  filters.genres?.split(",").includes(genre.value)
                    ? "bg-[#e5e0fb] text-[#4935bd] dark:bg-violet-500/30 dark:text-white"
                    : "text-[#625d79] dark:text-slate-300",
                )}
              >
                {genre.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="flex items-center gap-2 mt-4">
          <Button
            size="sm"
            className="w-[6.25rem] rounded-xl bg-[#604bd3] text-white hover:bg-[#5140c4]"
            onClick={applyFilters}
          >
            Filter
          </Button>
          <Button
            size="sm"
            className="w-[6.25rem]"
            onClick={resetFilters}
            variant="link"
          >
            Reset
          </Button>
        </div>
      </div>
      <div className="text-xl font-semibold tracking-tight sm:text-2xl">
        {collectionTitle || (displayPhrase === "" ? "Filter Results" : (
          <>
            Search Results for{" "}
            <span className="font-[800]">&quot;{params.q}&quot;</span>
          </>
        ))}
      </div>
      {isLoading && (
        <div className="grid w-full grid-cols-2 content-start gap-x-3 gap-y-5 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
          {[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1].map((_, idx) => {
            return (
              <div
                key={idx}
                className="aspect-[2/3] w-full rounded-2xl animate-pulse bg-[#e9e7f2] dark:bg-white/[0.06]"
              ></div>
            );
          })}
        </div>
      )}
      {!isLoading && searchResults?.animes?.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[#dedbea] bg-white px-5 py-12 text-center dark:border-[#302c40] dark:bg-[#191724]">
          <SearchX className="mb-3 h-8 w-8 text-violet-300" />
          <h3 className="text-base font-semibold text-[#211e38] dark:text-white">No anime found</h3>
          <p className="mt-1 max-w-sm text-sm text-[#77728f] dark:text-zinc-400">Try a different title or loosen a few filters.</p>
        </div>
      )}
      <div className="grid w-full grid-cols-2 content-start gap-x-3 gap-y-5 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
        {searchResults?.animes.map((anime) => (
          <AnimeCard
            key={anime.id}
            title={anime.name}
            format={anime.type}
            poster={anime.poster}
            href={ROUTES.animeDetails(anime.id)}
            quickWatchHref={ROUTES.watchAnime(anime.id)}
            className="w-full min-w-0"
            showGenre={false}
          />
        ))}
      </div>
      {searchResults && searchResults.totalPages && (
        <Pagination
          totalPages={searchResults?.totalPages}
          currentPage={params.page}
          handleNextPage={handleNextPage}
          handlePageChange={handlePageChange}
          handlePreviousPage={handlePreviousPage}
        />
      )}
    </div>
  );
};

export default SearchResults;
