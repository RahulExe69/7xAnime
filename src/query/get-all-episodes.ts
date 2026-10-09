import { GET_ALL_EPISODES } from "@/constants/query-keys";
import { api, isLocalBackendEnabled } from "@/lib/api";
import { Episode, IEpisodes } from "@/types/episodes";
import { EpisodeResponse } from "@/types/miruro-api";
import { useQuery } from "react-query";

export interface IEpisodesData extends IEpisodes {
  rawResponse?: EpisodeResponse;
  availableProviders?: string[];
}

const fetchAniListEpisodesFallback = async (
  animeId: string,
): Promise<IEpisodesData> => {
  try {
    const query = `
      query ($id: Int) {
        Media (id: $id, type: ANIME) {
          id
          episodes
          nextAiringEpisode {
            episode
          }
        }
      }
    `;
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        variables: { id: parseInt(animeId, 10) || 0 },
      }),
    });

    const json = await res.json();
    const media = json?.data?.Media;
    const totalEpCount = media?.nextAiringEpisode?.episode
      ? media.nextAiringEpisode.episode - 1
      : media?.episodes || 12;

    const episodes: Episode[] = Array.from(
      { length: totalEpCount > 0 ? totalEpCount : 12 },
      (_, i) => {
        const epNum = i + 1;
        return {
          title: `Episode ${epNum}`,
          episodeId: isLocalBackendEnabled()
            ? `watch/auto/${animeId}/sub/episode-${epNum}`
            : `${epNum}`,
          number: epNum,
          isFiller: false,
          hasSub: true,
          hasDub: false,
        };
      },
    );

    return {
      totalEpisodes: episodes.length,
      episodes,
      availableProviders: [],
    };
  } catch (err) {
    console.error("AniList fallback error:", err);
    const fallbackEpisodes: Episode[] = Array.from({ length: 12 }, (_, i) => ({
      title: `Episode ${i + 1}`,
      episodeId: isLocalBackendEnabled()
        ? `watch/auto/${animeId}/sub/episode-${i + 1}`
        : `${i + 1}`,
      number: i + 1,
      isFiller: false,
      hasSub: true,
      hasDub: false,
    }));
    return {
      totalEpisodes: 12,
      episodes: fallbackEpisodes,
      availableProviders: [],
    };
  }
};

const getAllEpisodes = async (animeId: string): Promise<IEpisodesData> => {
  try {
    const res = await api.get<EpisodeResponse>(`/episodes/${animeId}`);
    const data = res.data;

    const providerNames = Object.keys(data.providers || {});

    const subEpNumbers = new Set<number>();
    const dubEpNumbers = new Set<number>();

    for (const pName of providerNames) {
      const pData = data.providers[pName]?.episodes;
      if (pData?.sub) {
        pData.sub.forEach((ep) => {
          const number = Number(ep.number);
          if (Number.isFinite(number) && number > 0) subEpNumbers.add(number);
        });
      }
      if (pData?.dub) {
        pData.dub.forEach((ep) => {
          const number = Number(ep.number);
          if (Number.isFinite(number) && number > 0) dubEpNumbers.add(number);
        });
      }
    }

    const allEpNumbersSet = new Set<number>([
      ...Array.from(subEpNumbers),
      ...Array.from(dubEpNumbers),
    ]);
    const allEpisodeNumbers = Array.from(allEpNumbersSet).sort((a, b) => a - b);

    const episodeList: Episode[] = allEpisodeNumbers.map((epNum) => {
      let epDetail: any = null;
      let fallbackId = "";

      for (const pName of providerNames) {
        const pData = data.providers[pName]?.episodes;
        const dubMatch = pData?.dub?.find((e) => Number(e.number) === epNum);
        const subMatch = pData?.sub?.find((e) => Number(e.number) === epNum);

        // Prefer an English dub for the episode list's default selection.
        // Keep a SUB candidate as a fallback while continuing to look for DUB
        // on other providers before committing to it.
        if (dubMatch) {
          epDetail = dubMatch;
          fallbackId = dubMatch.id;
          break;
        }
        if (subMatch && !epDetail) {
          epDetail = subMatch;
          fallbackId = subMatch.id;
        }
      }

      return {
        title: epDetail?.title || `Episode ${epNum}`,
        episodeId: fallbackId || `${epNum}`,
        number: epNum,
        isFiller: !!epDetail?.filler,
        hasSub: subEpNumbers.has(epNum),
        hasDub: dubEpNumbers.has(epNum),
      };
    });

    if (episodeList.length === 0) {
      // Keep partial native provider data attached to the AniList fallback.
      // Android can poll it while slow provider scrapers finish, without blocking
      // the player or losing the servers that have already replied.
      const fallback = await fetchAniListEpisodesFallback(animeId);
      return {
        ...fallback,
        rawResponse: data,
        availableProviders: providerNames,
      };
    }

    return {
      totalEpisodes: episodeList.length,
      episodes: episodeList,
      rawResponse: data,
      availableProviders: providerNames,
    };
  } catch (err) {
    console.warn(
      `Upstream /episodes API failed for animeId ${animeId}. Using AniList fallback:`,
      err,
    );
    return await fetchAniListEpisodesFallback(animeId);
  }
};

export const useGetAllEpisodes = (animeId: string) => {
  return useQuery({
    queryFn: () => getAllEpisodes(animeId),
    queryKey: [GET_ALL_EPISODES, animeId],
    enabled: !!animeId,
    staleTime: 1000 * 60 * 15,
    cacheTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
    // The local Android adapter returns an initial partial provider list and
    // marks it complete only after every source has answered or timed out.
    refetchInterval: (data) =>
      isLocalBackendEnabled() &&
      data?.rawResponse?.source === "native" &&
      data.rawResponse.complete === false
        ? 2500
        : false,
    retry: 0,
  });
};
