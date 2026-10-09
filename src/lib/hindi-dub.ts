import axios from "axios";
import { api, isLocalBackendEnabled } from "@/lib/api";

const HINDI_API_BASE = "https://anime-api-ashen-chi.vercel.app/api";
const HINDI_REQUEST_TIMEOUT_MS = 9000;

export type HindiDubStream = {
  server: string;
  embed: string;
  host: string;
  seriesTitle: string;
  seriesId: string;
  season: number;
  episode: number;
};

type SearchCandidate = {
  title: string;
  anime_id: string;
  season?: number | string;
};

const normalize = (value: string) =>
  (value || "")
    .toLocaleLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\b(the|tv|anime|all)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const scoreTitle = (candidate: string, query: string) => {
  const left = normalize(candidate);
  const right = normalize(query);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.86;
  const leftTokens = new Set(left.split(" "));
  const rightTokens = new Set(right.split(" "));
  const overlap = [...rightTokens].filter((token) => leftTokens.has(token)).length;
  return overlap / Math.max(rightTokens.size, leftTokens.size, 1);
};

const getHindiJson = async <T,>(route: "search" | "stream", params: Record<string, string | number>) => {
  if (isLocalBackendEnabled()) {
    const response = await api.get<T>(`/hindi/${route}`, { params, timeout: 10500 });
    return response.data;
  }
  const response = await axios.get<T>(`${HINDI_API_BASE}/${route}`, {
    params: route === "search"
      ? { s: params.s, page: params.page || 1 }
      : { id: params.id, season: params.season || 1, ep: params.ep || 1 },
    timeout: HINDI_REQUEST_TIMEOUT_MS,
  });
  return response.data;
};

const parseCandidates = (body: any): SearchCandidate[] => {
  const root = body?.results ?? body?.data ?? body;
  const values = Array.isArray(root) ? root : Array.isArray(root?.results) ? root.results : [];
  return values
    .filter((item: any) => item && typeof item.anime_id === "string")
    .map((item: any) => ({
      title: String(item.title || item.name || item.anime_id),
      anime_id: String(item.anime_id),
      season: item.season,
    }));
};

const parseEmbeds = (body: any): Array<{ server: string; embed: string }> => {
  const root = body?.results ?? body?.data ?? body;
  const values = Array.isArray(root) ? root : Array.isArray(root?.results) ? root.results : [];
  return values
    .map((item: any) => ({
      server: String(item.server || "Hindi stream"),
      embed: String(item.embed || item.url || ""),
    }))
    .filter((item: { embed: string }) => /^https?:\/\//i.test(item.embed));
};

const seasonFromTitle = (title: string) => {
  const match = title.match(/\bseason\s*(\d+)\b|\bS(\d+)\b/i);
  return Number(match?.[1] || match?.[2]) || 0;
};

/** Strict badge lookup: only announce Hindi when an exact title/alias has a playable episode-1 embed. */
export async function hasHindiDubForAnime(titles: string[]): Promise<boolean> {
  const queries = [...new Set(titles.map((title) => title.trim()).filter(Boolean))].slice(0, 3);
  for (const title of queries) {
    try {
      const body = await getHindiJson<any>("search", { s: title, page: 1 });
      const titleKey = normalize(title);
      const candidate = parseCandidates(body).find((item) =>
        normalize(item.title) === titleKey || normalize(item.anime_id.replace(/-/g, " ")) === titleKey,
      );
      if (!candidate) continue;

      const season = seasonFromTitle(candidate.title) || Number(candidate.season) || 1;
      const seasons = [...new Set([season, ...(season > 1 ? [1] : [])])];
      for (const candidateSeason of seasons) {
        const streams = await getHindiJson<any>("stream", { id: candidate.anime_id, season: candidateSeason, ep: 1 });
        if (parseEmbeds(streams).length > 0) return true;
      }
    } catch {
      // Unknown/unavailable means no Hindi badge: do not advertise unverified language support.
    }
  }
  return false;
}

export async function getHindiDubStreams(
  titles: string[],
  episode: number,
): Promise<{ streams: HindiDubStream[]; matchedTitle: string }> {
  const titleQueries = [...new Set(titles.map((title) => title.trim()).filter(Boolean))].slice(0, 3);
  const searchResponses = await Promise.all(titleQueries.map(async (title) => {
    try {
      const body = await getHindiJson<any>("search", { s: title, page: 1 });
      return { title, candidates: parseCandidates(body) };
    } catch {
      return { title, candidates: [] as SearchCandidate[] };
    }
  }));
  const candidates: Array<SearchCandidate & { score: number; queryTitle: string }> = [];
  for (const response of searchResponses) {
    for (const candidate of response.candidates) {
      const score = Math.max(
        scoreTitle(candidate.title, response.title),
        scoreTitle(candidate.anime_id.replace(/-/g, " "), response.title),
      );
      if (score >= 0.48) {
        const existing = candidates.find((item) => item.anime_id === candidate.anime_id);
        if (existing) {
          if (score > existing.score) {
            existing.score = score;
            existing.queryTitle = response.title;
          }
        } else {
          candidates.push({ ...candidate, score, queryTitle: response.title });
        }
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const topCandidates = candidates.slice(0, 3);

  for (const candidate of topCandidates) {
    const season = seasonFromTitle(candidate.title) || seasonFromTitle(candidate.anime_id) || Number(candidate.season) || 1;
    const seasonsToTry = [...new Set([season, ...(season > 1 ? [1] : [])])];
    for (const candidateSeason of seasonsToTry) {
      try {
        const body = await getHindiJson<any>("stream", {
          id: candidate.anime_id,
          season: candidateSeason,
          ep: Math.max(1, Math.floor(episode || 1)),
        });
        const embeds = parseEmbeds(body);
        if (!embeds.length) continue;
        return {
          matchedTitle: candidate.title,
          streams: embeds.map((stream) => {
            let host = "Third-party embed";
            try { host = new URL(stream.embed).hostname.replace(/^www\./, ""); } catch {}
            return {
              ...stream,
              host,
              seriesTitle: candidate.title,
              seriesId: candidate.anime_id,
              season: candidateSeason,
              episode: Math.max(1, Math.floor(episode || 1)),
            };
          }),
        };
      } catch {
        // One broken title/season/host should not stop the remaining community sources.
      }
    }
  }

  throw new Error(
    candidates.length
      ? "No Hindi dub embed was found for this episode."
      : "No close Hindi-catalogue title match was found.",
  );
}
