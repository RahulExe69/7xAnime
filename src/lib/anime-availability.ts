import { api } from "@/lib/api";
import type { EpisodeResponse } from "@/types/miruro-api";

export type AnimeAudioAvailability = "any" | "sub" | "dub";
export type AnimeAvailabilityStatus = "available" | "unavailable" | "unknown";

type CachedAvailability = {
  status: "available" | "unavailable";
  expiresAt: number;
};

const POSITIVE_CACHE_MS = 10 * 60 * 1000;
const NEGATIVE_CACHE_MS = 2 * 60 * 1000;
const MAX_DISCOVERY_ATTEMPTS = 4;
const DISCOVERY_RETRY_DELAY_MS = 650;
const REQUEST_TIMEOUT_MS = 9000;
const availabilityCache = new Map<string, CachedAvailability>();
const availabilityRequests = new Map<string, Promise<AnimeAvailabilityStatus>>();
const MAX_CONCURRENT_PROVIDER_CHECKS = 3;
let activeProviderChecks = 0;
const providerCheckQueue: Array<() => void> = [];

async function withProviderCheckSlot<T>(work: () => Promise<T>): Promise<T> {
  if (activeProviderChecks >= MAX_CONCURRENT_PROVIDER_CHECKS) {
    await new Promise<void>((resolve) => providerCheckQueue.push(resolve));
  } else {
    activeProviderChecks += 1;
  }

  try {
    return await work();
  } finally {
    const next = providerCheckQueue.shift();
    if (next) next();
    else activeProviderChecks -= 1;
  }
}

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const hasEpisodesForAudio = (
  response: EpisodeResponse,
  audio: AnimeAudioAvailability,
): boolean => {
  const providers = response?.providers;
  if (!providers || typeof providers !== "object" || Array.isArray(providers)) {
    return false;
  }

  return Object.values(providers).some((provider) => {
    const episodes = provider?.episodes;
    const hasSub = Array.isArray(episodes?.sub) && episodes.sub.length > 0;
    const hasDub = Array.isArray(episodes?.dub) && episodes.dub.length > 0;

    if (audio === "sub") return hasSub;
    if (audio === "dub") return hasDub;
    return hasSub || hasDub;
  });
};

const inspectAvailability = (
  response: EpisodeResponse,
  audio: AnimeAudioAvailability,
): AnimeAvailabilityStatus => {
  if (hasEpisodesForAudio(response, audio)) return "available";

  // The on-device backend deliberately returns a partial provider catalogue
  // while the remaining providers finish. An empty partial response is not
  // evidence that the title is unavailable.
  if (response?.source === "native" && response.complete !== true) {
    return "unknown";
  }

  if (!response?.providers || typeof response.providers !== "object") {
    return "unknown";
  }

  return "unavailable";
};

/**
 * Checks provider episode catalogues, not merely AniList metadata.
 * "Unknown" is never cached as unavailable; provider timeouts must not hide titles.
 */
export async function checkAnimeAvailability(
  animeId: string | number,
  audio: AnimeAudioAvailability = "any",
): Promise<AnimeAvailabilityStatus> {
  const id = String(animeId).trim();
  if (!id) return "unknown";

  const key = `${id}:${audio}`;
  const now = Date.now();
  const cached = availabilityCache.get(key);
  if (cached && cached.expiresAt > now) return cached.status;
  if (cached) availabilityCache.delete(key);

  const existing = availabilityRequests.get(key);
  if (existing) return existing;

  const request = withProviderCheckSlot(async (): Promise<AnimeAvailabilityStatus> => {
    try {
      for (let attempt = 0; attempt < MAX_DISCOVERY_ATTEMPTS; attempt += 1) {
        const response = await api.get<EpisodeResponse>(
          `/episodes/${encodeURIComponent(id)}`,
          { timeout: REQUEST_TIMEOUT_MS },
        );
        const data = response.data;
        const status = inspectAvailability(data, audio);

        if (status !== "unknown") {
          availabilityCache.set(key, {
            status,
            expiresAt: Date.now() + (
              status === "available" ? POSITIVE_CACHE_MS : NEGATIVE_CACHE_MS
            ),
          });
          return status;
        }

        if (!(data?.source === "native" && data.complete !== true)) {
          return "unknown";
        }

        if (attempt < MAX_DISCOVERY_ATTEMPTS - 1) {
          await delay(DISCOVERY_RETRY_DELAY_MS);
        }
      }
    } catch {
      // A timeout/network error says nothing about whether the title exists.
      return "unknown";
    } finally {
      availabilityRequests.delete(key);
    }

    return "unknown";
  });

  availabilityRequests.set(key, request);
  return request;
}

export type AvailabilityBatchResult = {
  availableIds: string[];
  checkedCount: number;
  unavailableCount: number;
  unknownCount: number;
};

/** Limit fan-out so enabling the filter cannot spawn one request per card at once. */
export async function filterAnimeByAvailability<T extends { id: string | number }>(
  items: T[],
  audio: AnimeAudioAvailability = "any",
  isActive: () => boolean = () => true,
  concurrency = 3,
): Promise<AvailabilityBatchResult> {
  const availableIds: string[] = [];
  let nextIndex = 0;
  let checkedCount = 0;
  let unavailableCount = 0;
  let unknownCount = 0;

  const worker = async () => {
    while (isActive()) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;

      const item = items[index];
      const status = await checkAnimeAvailability(item.id, audio);
      if (!isActive()) return;

      checkedCount += 1;
      if (status === "available") availableIds.push(String(item.id));
      else if (status === "unavailable") unavailableCount += 1;
      else unknownCount += 1;
    }
  };

  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return { availableIds, checkedCount, unavailableCount, unknownCount };
}
