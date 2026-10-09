import { GET_EPISODE_DATA } from "@/constants/query-keys";
import { api } from "@/lib/api";
import { IEpisodeSource } from "@/types/episodes";
import { WatchSourcesResponse } from "@/types/miruro-api";
import { useQuery } from "react-query";

type StreamWithHeaders = {
  url: string;
  type: string;
  referer?: string;
  headers?: Record<string, string>;
};

const getEpisodeData = async (
  episodeId: string,
): Promise<IEpisodeSource> => {
  const endpoint = episodeId.startsWith("/") ? episodeId : `/${episodeId}`;
  const res = await api.get<WatchSourcesResponse>(endpoint, { timeout: 20000 });
  const data = res.data;

  // IDs supplied by Kuhi use watch/{provider}/{anilistId}/{audio}/{episode}.
  // Remove empty path parts so a leading slash cannot shift the ID index.
  const parts = endpoint.split("?")[0].split("/").filter(Boolean);
  const anilistId = Number(parts[0] === "watch" ? parts[2] : parts[2] || parts[3]) || 0;
  const firstStream = data.streams?.[0] as StreamWithHeaders | undefined;
  const referer = firstStream?.referer || firstStream?.headers?.Referer || "";

  return {
    headers: { Referer: referer },
    subtitles: (data.subtitles || []).map((sub) => ({
      lang: sub.label || "Subtitle",
      url: sub.file,
    })),
    intro: data.intro || { start: 0, end: 0 },
    outro: data.outro || { start: 0, end: 0 },
    sources: (data.streams || []).map((stream) => ({
      url: stream.url,
      type: stream.type,
    })),
    anilistID: anilistId,
    malID: 0,
  };
};

export const useGetEpisodeData = (episodeId: string, enabled: boolean = true) => {
  return useQuery({
    queryFn: () => getEpisodeData(episodeId),
    queryKey: [GET_EPISODE_DATA, episodeId],
    refetchOnWindowFocus: false,
    // The source response can contain short-lived signed URLs; do not tear down
    // a playing video just because Android briefly reconnects after app switching.
    // A retry remains available through the player/server fallback path.
    refetchOnReconnect: false,
    staleTime: 1000 * 60,
    retry: 1,
    retryDelay: 1000,
    enabled: !!episodeId && enabled,
  });
};
