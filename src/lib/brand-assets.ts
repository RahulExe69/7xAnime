export const BRAND_ASSET_URLS = {
  masterIcon:
    "https://cdn.jsdelivr.net/gh/RahulExe69/7x@main/brand/assets/icon.png",
  animeIcon:
    "https://cdn.jsdelivr.net/gh/RahulExe69/7x@main/products/7xanime/assets/icon.png",
  tuneIcon:
    "https://cdn.jsdelivr.net/gh/RahulExe69/7x@main/products/7xtune/assets/icon.png",
} as const;

const CACHE_NAME = "7x-brand-assets-v1";
const REFRESHED_AT_PREFIX = "7x:brand-assets:refreshed:";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const inFlightRefreshes = new Map<string, Promise<void>>();

const assetUrls = Object.values(BRAND_ASSET_URLS);

function refreshedAt(url: string): number {
  try {
    return Number(window.localStorage.getItem(REFRESHED_AT_PREFIX + url) || 0);
  } catch {
    return 0;
  }
}

function markRefreshed(url: string): void {
  try {
    window.localStorage.setItem(REFRESHED_AT_PREFIX + url, String(Date.now()));
  } catch {
    // Cache Storage remains useful when localStorage is unavailable.
  }
}

function isStale(url: string): boolean {
  const timestamp = refreshedAt(url);
  return !timestamp || Date.now() - timestamp >= CACHE_TTL_MS;
}

async function openBrandCache(): Promise<Cache | null> {
  if (typeof window === "undefined" || !("caches" in window)) return null;

  try {
    return await window.caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

async function refreshAsset(url: string, cache: Cache | null): Promise<void> {
  const inFlight = inFlightRefreshes.get(url);
  if (inFlight) return inFlight;

  const refresh = (async () => {
    const response = await fetch(url, {
      mode: "cors",
      credentials: "omit",
      cache: "no-cache",
    });
    if (!response.ok) {
      throw new Error(`Brand asset request failed (${response.status}).`);
    }

    if (cache) await cache.put(url, response.clone());
    markRefreshed(url);
  })();

  inFlightRefreshes.set(url, refresh);
  try {
    await refresh;
  } finally {
    if (inFlightRefreshes.get(url) === refresh) inFlightRefreshes.delete(url);
  }
}

/**
 * Preloads the small 7x asset set on app startup without blocking the UI.
 * Cache Storage keeps the responses across launches; stale entries are refreshed
 * in the background after seven days.
 */
export async function preloadBrandAssets(): Promise<void> {
  if (typeof window === "undefined") return;
  const cache = await openBrandCache();

  await Promise.allSettled(
    assetUrls.map(async (url) => {
      const cached = cache ? await cache.match(url) : undefined;
      if (cached && !isStale(url)) return;

      if (!cache && !isStale(url)) return;
      await refreshAsset(url, cache);
    }),
  );
}

/**
 * Returns a temporary object URL backed by the persistent cache. Existing
 * cached images display immediately while expired entries refresh quietly.
 */
export async function loadBrandAssetObjectUrl(url: string): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("Brand assets can only be loaded in the browser.");
  }

  const cache = await openBrandCache();
  if (cache) {
    const cached = await cache.match(url);
    if (cached) {
      if (isStale(url)) void refreshAsset(url, cache).catch(() => undefined);
      return URL.createObjectURL(await cached.blob());
    }

    await refreshAsset(url, cache);
    const refreshed = await cache.match(url);
    if (!refreshed) throw new Error("Brand asset was not saved to Cache Storage.");
    return URL.createObjectURL(await refreshed.blob());
  }

  // Older WebViews without Cache Storage still get the CDN asset; normal
  // browser HTTP caching may retain it, and the UI has a local/text fallback.
  const response = await fetch(url, { mode: "cors", credentials: "omit" });
  if (!response.ok) throw new Error(`Brand asset request failed (${response.status}).`);
  markRefreshed(url);
  return URL.createObjectURL(await response.blob());
}
