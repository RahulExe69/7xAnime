import { useQuery } from "react-query";
import { api } from "@/lib/api";
import { MediaList, PaginatedResponse, MediaStatus, SortOption } from "@/types/miruro-api";

export const GET_FILTERED_ANIME = "GET_FILTERED_ANIME";

export const useGetFilteredAnime = (status: MediaStatus, sort: SortOption, perPage = 18) => {
  return useQuery({
    queryKey: [GET_FILTERED_ANIME, status, sort, perPage],
    queryFn: async (): Promise<PaginatedResponse<MediaList>> => {
      const res = await api.get<PaginatedResponse<MediaList>>("/filter", {
        params: { status, sort, page: 1, per_page: perPage },
      });
      return { ...res.data, results: (res.data.results || []).filter((item) => !item.isAdult) };
    },
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });
};