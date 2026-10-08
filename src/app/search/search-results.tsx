"use client";

import React from "react";
import SearchBar from "@/components/search-bar";
import { Search, SearchX } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import AnimeCard from "@/components/anime-card";

import BlurFade from "@/components/ui/blur-fade";
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

const SearchResults = () => {
  const params = useAnimeSearchParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const displayPhrase = params.q.replace(/^"+|"+$/g, "").trim();

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
    <div className="mx-auto flex min-h-[75vh] w-full max-w-[1600px] flex-col gap-6 px-4 pb-16 pt-28 sm:gap-8 md:px-6 lg:pt-32 lg:px-8">
      <div className="flex flex-col gap-5 rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4 backdrop-blur-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><Search className="h-5 w-5 text-violet-300" /><p className="text-lg font-semibold">Find your next anime</p></div><span className="text-xs text-zinc-500">Search by title or narrow it down with filters</span></div><SearchBar className="max-w-2xl" showFilterButton={false} /><p className="text-sm font-semibold text-zinc-300">Refine results</p>
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
                  "rounded-full border border-white/10 bg-white/[0.03] hover:border-violet-400/60 hover:text-violet-200 hover:bg-violet-500/10",
                  "data-[state=on]:border-violet-400/60 data-[state=on]:text-white data-[state=on]:bg-violet-500/30",
                  filters.genres?.split(",").includes(genre.value)
                    ? "bg-violet-500/30 text-white"
                    : "text-slate-300",
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
            className="w-[6.25rem] rounded-xl bg-violet-500 text-white hover:bg-violet-400"
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
        {displayPhrase === "" ? (
          "Filter Results"
        ) : (
          <>
            Search Results for{" "}
            <span className="font-[800]">&quot;{params.q}&quot;</span>
          </>
        )}
      </div>
      {isLoading && (
        <div className="grid w-full grid-cols-2 content-start gap-x-3 gap-y-5 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
          {[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1].map((_, idx) => {
            return (
              <div
                key={idx}
                className="aspect-[2/3] w-full rounded-2xl animate-pulse bg-white/[0.06]"
              ></div>
            );
          })}
        </div>
      )}
      {!isLoading && searchResults?.animes?.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.025] px-5 py-12 text-center">
          <SearchX className="mb-3 h-8 w-8 text-violet-300" />
          <h3 className="text-base font-semibold text-zinc-100">No anime found</h3>
          <p className="mt-1 max-w-sm text-sm text-zinc-400">Try a different title or loosen a few filters.</p>
        </div>
      )}
      <div className="grid w-full grid-cols-2 content-start gap-x-3 gap-y-5 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
        {searchResults?.animes.map((anime, idx) => (
          <BlurFade key={idx} delay={idx * 0.05} inView>
            <AnimeCard
              title={anime.name}
              format={anime.type}
              poster={anime.poster}
              href={ROUTES.animeDetails(anime.id)}
              className="self-center justify-self-center"
              showGenre={false}
            />
          </BlurFade>
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
