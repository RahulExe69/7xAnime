"use client";

import EpisodeCard from "./common/episode-card";
import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useAnimeStore } from "@/store/anime-store";
import { Episode, IEpisodes } from "@/types/episodes";
import Select, { ISelectOptions } from "./common/select";
import { Input } from "./ui/input";
import { Bookmark } from "@/hooks/use-get-bookmark";

type Props = {
  animeId: string;
  title: string;
  subOrDub?: { sub: number; dub: number };
  episodes: IEpisodes;
  isLoading: boolean;
  bookmarks?: Bookmark[] | null;
};

const EpisodePlaylist = ({
  animeId,
  title,
  subOrDub,
  episodes,
  isLoading,
  bookmarks,
}: Props) => {
  const searchParams = useSearchParams();

  const episodeId = searchParams.get("episode");
  const episodeNumberParam = searchParams.get("ep");
  const isLatestEpisode = searchParams.get("type");

  const { setSelectedEpisode } = useAnimeStore();

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const episodeRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [currentGroup, setCurrentGroup] = useState(
    `1 - ${Math.min(50, episodes?.totalEpisodes!)}`,
  );
  const [search, setSearch] = useState("");

  const [start, end] = currentGroup.split(" - ").map(Number);
  const filtered = episodes.episodes.filter((_, index) => {
    return index >= start - 1 && index <= end - 1;
  });

  const [filteredEpisodes, setFilteredEpisodes] =
    React.useState<Episode[]>(filtered);

  useEffect(() => {
    if (!episodes?.episodes?.length) return;

    // Route parameters are authoritative. Never guess from the characters in a
    // provider's episode slug (some IDs end in "12", not "episode-12").
    if (episodeId) {
      setSelectedEpisode(episodeId);
      return;
    }

    if (episodeNumberParam) {
      const requestedEpisode = episodes.episodes.find(
        (episode) => episode.number === Number(episodeNumberParam),
      );
      if (requestedEpisode?.episodeId) {
        setSelectedEpisode(requestedEpisode.episodeId);
      }
      return;
    }

    const currentSelectionBelongsToThisAnime = episodes.episodes.some(
      (episode) => episode.episodeId === selectedEpisode,
    );
    if (currentSelectionBelongsToThisAnime) return;

    const fallbackEpisode = isLatestEpisode
      ? episodes.episodes[episodes.episodes.length - 1]
      : episodes.episodes[0];
    if (fallbackEpisode?.episodeId) {
      setSelectedEpisode(fallbackEpisode.episodeId);
    }
  }, [
    episodes,
    episodeId,
    episodeNumberParam,
    isLatestEpisode,
    selectedEpisode,
    setSelectedEpisode,
  ]);

  useEffect(() => {
    if (!episodes || currentGroup === "") return;
    const [start, end] = currentGroup.split(" - ").map(Number);
    const filtered = episodes.episodes.filter((_, index) => {
      return index >= start - 1 && index <= end - 1;
    });

    setFilteredEpisodes(filtered);
  }, [episodes, currentGroup]);

  useEffect(() => {
    const episodeIndex = episodes?.episodes.findIndex(
      (episode) => episode.episodeId === episodeId,
    );

    if (
      episodeIndex !== undefined &&
      episodeIndex >= 0 &&
      episodeRefs.current[episodeIndex]
    ) {
      const episodeElement = episodeRefs.current[episodeIndex];
      const scrollContainer = scrollContainerRef.current;

      if (episodeElement && scrollContainer) {
        // Get the top offset of the episode relative to the scroll container
        const episodeOffsetTop = episodeElement.offsetTop;

        // Scroll the container directly to the episode's top position
        scrollContainer.scrollTop =
          episodeOffsetTop -
          scrollContainer.offsetHeight / 2 +
          episodeElement.offsetHeight / 2 +
          80; //Adding some extra px to achieve better positioning
      }
    }
    //eslint-disable-next-line
  }, [animeId, episodes]);

  const handleOnSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!episodes) return;
    const value = e.target.value;
    setSearch(value);

    if (!value) {
      // check if group is selected and filter based on that
      const [start, end] = currentGroup.split(" - ").map(Number);
      const filtered = episodes.episodes.filter((_, index) => {
        return index >= start - 1 && index <= end - 1;
      });
      setFilteredEpisodes(filtered);
      return;
    }

    const filtered = episodes?.episodes.filter((episode) =>
      episode.number.toString().toLowerCase().includes(value.toLowerCase()),
    );

    setFilteredEpisodes(filtered);
  };

  const handleOnSelectChange = (range: string) => {
    setCurrentGroup(range);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  };

  const groupOptions = (): ISelectOptions[] => {
    let start = 1;
    const end = episodes?.totalEpisodes;
    const options: ISelectOptions[] = [];
    // group episodes in range of 50
    while (start <= end!) {
      const range = `${start} - ${Math.min(start + 49, end!)}`;
      options.push({
        label: range,
        value: range,
      });
      start += 50;
    }
    return options;
  };

  return (
    episodes && (
      <div className="col-span-1 flex w-full flex-col gap-0 overflow-hidden rounded-2xl border border-white/10 bg-[#101018] min-h-[320px] max-h-[70vh] lg:min-h-[500px]">
        <div className="h-fit border-b border-white/[0.07] bg-white/[0.035] px-4 py-4">
          <h3 className="text-base font-semibold tracking-tight">Episode Playlist</h3>
          <span className="text-sm font-thin">{title}</span>
          <div className="flex flex-row w-full items-center justify-between gap-2 mt-2">
            <Input
              placeholder="Search Episode"
              value={search}
              onChange={handleOnSearchChange}
              className="min-w-0 w-1/2 rounded-xl"
            />
            <Select
              value={currentGroup}
              placeholder={currentGroup}
              onChange={handleOnSelectChange}
              options={groupOptions()}
              className="w-1/2"
            />
          </div>
        </div>
        <div
          ref={scrollContainerRef}
          className="flex flex-grow flex-col gap-1 overflow-y-auto px-2 pb-3"
        >
          {filteredEpisodes &&
            filteredEpisodes.map((episode, idx) => (
              //@ts-expect-error type mismatch
              <div key={idx} ref={(el) => (episodeRefs.current[idx] = el)}>
                <EpisodeCard
                  subOrDub={subOrDub}
                  variant={"list"}
                  episode={episode}
                  animeId={animeId}
                  watchedEpisodes={bookmarks?.[0].expand.watchHistory}
                />
              </div>
            ))}
          {!filteredEpisodes?.length && !isLoading && "No Episodes"}
          {isLoading && <PlaylistSkeleton />}
        </div>
      </div>
    )
  );
};

const PlaylistSkeleton = () => {
  return (
    <>
      {[1, 1, 1, 1, 1, 1, 1, 1, 1].map((_, idx) => {
        return (
          <div
            className="relative flex min-h-16 w-full animate-pulse items-center gap-4 rounded-xl bg-white/[0.05]"
            key={idx}
          ></div>
        );
      })}
    </>
  );
};

export default EpisodePlaylist;
