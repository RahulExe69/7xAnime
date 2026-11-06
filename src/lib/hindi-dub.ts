import axios from "axios";
import { api, isLocalBackendEnabled } from "@/lib/api";

const HINDI_API_BASE = "https://anime-api-ashen-chi.vercel.app/api";
const HINDI_REQUEST_TIMEOUT_MS = 9000;

export type HindiDubStream = {
  server: string;
  /** Present for legacy iframe providers. */
  embed?: string;
  /** Present for direct HLS/MP4 streams from Aethoflix. */
  url?: string;
  kind?: "embed" | "direct";
  type?: "hls" | "mp4";
  quality?: string;
  headers?: Record<string, string>;
  subtitles?: Array<{ lang: string; url: string }>;
  host: string;
  seriesTitle: string;
  seriesId: string;
  season: number;
  episode: number;
  sourceId?: "community-hindi" | "aethoflix";
  sourceLabel?: string;
  languageEvidence?: "hindi-catalogue-contract" | "explicit-hindi-audio-metadata";
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
              kind: "embed" as const,
              sourceId: "community-hindi" as const,
              sourceLabel: "Hindi Catalogue",
              languageEvidence: "hindi-catalogue-contract" as const,
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


type AethoflixStreamInput = {
  tmdbId?: number;
  tmdbMediaType?: "tv" | "movie";
  season: number;
  episode: number;
  titles: string[];
};

const isHindiAudioLanguage = (value: unknown): boolean => {
  const language = String(value ?? "").trim().toLocaleLowerCase();
  return ["hi", "hin", "hindi", "हिंदी", "हिन्दी"].includes(language);
};

const isHttpsMediaUrl = (value: unknown): value is string => {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !!url.hostname && !url.username && !url.password;
  } catch {
    return false;
  }
};

const stringHeaders = (value: unknown): Record<string, string> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const headers: Record<string, string> = {};
  for (const [key, headerValue] of Object.entries(value as Record<string, unknown>)) {
    if (typeof headerValue === "string" && key.trim() && headerValue.trim()) {
      headers[key] = headerValue;
    }
  }
  return Object.keys(headers).length ? headers : undefined;
};

const parseAethoflixSubtitles = (value: unknown): Array<{ lang: string; url: string }> => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item: any) => ({
      lang: String(item.label || item.lang || item.language || "Subtitle"),
      url: String(item.file || item.url || item.src || ""),
    }))
    .filter((item) => isHttpsMediaUrl(item.url))
    .slice(0, 12);
};

/**
 * Resolve Aethoflix only when AniList supplied an explicit TMDB external link.
 * The provider is optional: every failure returns an empty list, leaving the
 * community Hindi catalogue untouched and immediately usable.
 */
export async function getAethoflixHindiStreams(
  input: AethoflixStreamInput,
): Promise<HindiDubStream[]> {
  const tmdbId = Number(input.tmdbId);
  if (!isLocalBackendEnabled() || !Number.isSafeInteger(tmdbId) || tmdbId < 1) return [];

  const episode = Math.max(1, Math.floor(Number(input.episode) || 1));
  const season = Math.max(1, Math.floor(Number(input.season) || 1));
  const isMovie = input.tmdbMediaType === "movie";
  const route = isMovie ? "/aethoflix/stream-movie" : "/aethoflix/stream-tv";

  try {
    const response = await api.get<any>(route, {
      params: isMovie
        ? { tmdbId }
        : { tmdbId, season, episode },
      timeout: 55000,
    });
    const body = response.data;
    if (body?.success !== true || !Array.isArray(body?.links)) return [];

    const seen = new Set<string>();
    const streams: HindiDubStream[] = [];
    for (const rawLink of body.links) {
      if (!rawLink || typeof rawLink !== "object") continue;
      const language = rawLink.audioLanguage ??
        rawLink.audio_language ??
        rawLink.hlsAudioLanguage ??
        rawLink.language ??
        rawLink.lang;
      // A generic "dub" value is deliberately insufficient evidence.
      if (!isHindiAudioLanguage(language)) continue;

      const url = rawLink.url;
      if (!isHttpsMediaUrl(url) || rawLink.isDASH === true) continue;
      const normalizedUrl = url.trim();
      if (seen.has(normalizedUrl)) continue;

      const parsedUrl = new URL(normalizedUrl);
      const path = parsedUrl.pathname.toLocaleLowerCase();
      const declaredType = String(rawLink.type || rawLink.format || "").toLocaleLowerCase();
      const type = rawLink.isM3U8 === true || /\.(m3u8)(?:$|\/)/.test(path) ||
        declaredType === "hls" || declaredType === "m3u8"
        ? "hls"
        : /\.mp4(?:$|\/)/.test(path) || declaredType === "mp4"
          ? "mp4"
          : null;
      // ArtPlayer supports HLS and MP4 in this app; don't surface DASH or
      // unknown formats as selectable streams.
      if (!type) continue;

      seen.add(normalizedUrl);
      const headers = stringHeaders(rawLink.headers);
      streams.push({
        server: "Aethoflix",
        kind: "direct",
        sourceId: "aethoflix",
        sourceLabel: "Aethoflix",
        languageEvidence: "explicit-hindi-audio-metadata",
        url: normalizedUrl,
        type,
        quality: String(rawLink.quality || "Auto"),
        headers,
        subtitles: parseAethoflixSubtitles(rawLink.subtitles),
        host: parsedUrl.hostname.replace(/^www\./, ""),
        seriesTitle: input.titles.find((title) => title.trim()) || "Anime",
        seriesId: String(tmdbId),
        season,
        episode,
      });
      if (streams.length >= 6) break;
    }
    return streams;
  } catch {
    // Aethoflix is optional and must never break or delay the community source.
    return [];
  }
}
