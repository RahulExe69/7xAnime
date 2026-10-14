import { SEARCH_ANIME } from "@/constants/query-keys";
import { api } from "@/lib/api";
import { IAnimeSearch, SearchAnimeParams } from "@/types/anime";
import { MediaList, PaginatedResponse } from "@/types/miruro-api";
import { useQuery } from "react-query";

const COLLECTION_REQUESTS: Record<string, { endpoint: string; params?: Record<string, string> }> = {
  new: { endpoint: "/recent" },
  trending: { endpoint: "/trending" },
  popular: { endpoint: "/popular" },
  upcoming: { endpoint: "/upcoming" },
  "currently-airing": { endpoint: "/filter", params: { status: "RELEASING", sort: "START_DATE_DESC" } },
  "top-airing": { endpoint: "/filter", params: { status: "RELEASING", sort: "SCORE_DESC" } },
  completed: { endpoint: "/filter", params: { status: "FINISHED", sort: "SCORE_DESC" } },
};

const SORT_API_VALUES: Record<string, string> = {
  default: "POPULARITY_DESC",
  score: "SCORE_DESC",
  "recently-added": "START_DATE_DESC",
  "released-date": "START_DATE_DESC",
  "recently-updated": "UPDATED_AT_DESC",
  "most-watched": "POPULARITY_DESC",
  "most-episodes": "EPISODES_DESC",
  "name-a-z": "TITLE_ROMAJI",
};

const searchAnime = async (params: SearchAnimeParams): Promise<IAnimeSearch> => {
  const sortValue = params.sort ? SORT_API_VALUES[params.sort] || params.sort.toUpperCase() : undefined;
  const requestParams: Record<string, any> = {
    page: params.page || 1,
    per_page: 20,
    genre: params.genres || undefined,
    season: params.season ? params.season.toUpperCase() : undefined,
    format: params.type ? params.type.toUpperCase() : undefined,
    status: params.status ? params.status.toUpperCase() : undefined,
    sort: sortValue,
  };

  const cleanQuery = params.q ? params.q.replace(/^"+|"+$/g, "").trim() : "";

  // Curated homepage sections keep their real data source when opening View All.
  const collectionRequest = params.collection ? COLLECTION_REQUESTS[params.collection] : undefined;
  const endpoint = collectionRequest?.endpoint || (
    cleanQuery && !params.genres && !params.season && !params.type && !params.status
      ? "/search"
      : "/filter"
  );

  if (collectionRequest?.params) Object.assign(requestParams, collectionRequest.params);
  if (endpoint === "/search") requestParams.query = cleanQuery;

  const res = await api.get<PaginatedResponse<MediaList>>(endpoint, {
    params: requestParams,
  });

  const data = res.data;
  const results = (data.results || []).filter((item) => !item.isAdult);

  const calculatedPages = Math.ceil((data.total || 0) / (data.perPage || 20));
  const totalPages = Math.min(calculatedPages, 20);

  return {
    animes: results.map((m) => ({
      id: String(m.id),
      name: m.title?.english || m.title?.romaji || m.title?.native || "Untitled",
      jname: m.title?.native || m.title?.romaji || "",
      poster: m.coverImage?.extraLarge || m.coverImage?.large || "",
      episodes: {
        sub: m.episodes || 0,
        // The catalogue's episode count does not establish English-dub availability.
        dub: 0,
      },
      type: m.format as any,
      score: m.averageScore,
    })),
    totalPages: totalPages > 0 ? totalPages : 1,
    hasNextPage: data.hasNextPage,
    currentPage: data.page,
  };
};

export const useGetSearchAnimeResults = (params: SearchAnimeParams) => {
  return useQuery({
    queryFn: () => searchAnime(params),
    queryKey: [SEARCH_ANIME, { ...params }],
  });
};

