import axios from "axios";
import { api, isLocalBackendEnabled } from "@/lib/api";

const HINDI_API_BASE = "https://anime-api-ashen-chi.vercel.app/api";

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
    const response = await api.get<T>(`/hindi/${route}`, { params, timeout: 15000 });
    return response.data;
  }
  const response = await axios.get<T>(`${HINDI_API_BASE}/${route}`, {
    params: route === "search"
      ? { s: params.s, page: params.page || 1 }
      : { id: params.id, season: params.season || 1, ep: params.ep || 1 },
    timeout: 12000,
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

const parseEmbeds = (body: any) => {
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

export async function getHindiDubStreams(
  titles: string[],
  episode: number,
): Promise<{ streams: HindiDubStream[]; matchedTitle: string }> {
  const titleQueries = [...new Set(titles.map((title) => title.trim()).filter(Boolean))].slice(0, 3);
  const candidates: Array<SearchCandidate & { score: number; queryTitle: string }> = [];

  for (const title of titleQueries) {
    try {
      const body = await getHindiJson<any>("search", { s: title, page: 1 });
      for (const candidate of parseCandidates(body)) {
        const score = Math.max(
          scoreTitle(candidate.title, title),
          scoreTitle(candidate.anime_id.replace(/-/g, " "), title),
        );
        if (score >= 0.48 && !candidates.some((item) => item.anime_id === candidate.anime_id)) {
          candidates.push({ ...candidate, score, queryTitle: title });
        }
      }
      if (candidates.some((candidate) => candidate.score >= 0.95)) break;
    } catch {
      // Try the next AniList title alias before reporting that the catalogue is unavailable.
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const topCandidates = candidates.slice(0, 4);

  for (const candidate of topCandidates) {
    const season = Number(candidate.season) || seasonFromTitle(candidate.title) || seasonFromTitle(candidate.anime_id) || 1;
    const seasonsToTry = [...new Set([season, 1, 2, 3, 4].filter((value) => value >= 1))];
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
