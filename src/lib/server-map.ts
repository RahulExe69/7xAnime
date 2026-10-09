export type ProviderInfo = { name: string; site: string };

export const KUHI_PROVIDER_ORDER = [
  "anineko", "anizone", "anikoto", "reanime", "aniwaves",
  "kaa", "anibd", "animegg", "mkissa", "animeonsen",
] as const;

/**
 * The pinned Kuhi provider ranking. A provider without episodes for an anime
 * is omitted. Server 1 is reserved for MegaPlay; upstream providers start at Server 2.
 */
export const PROVIDER_INFO: Record<string, ProviderInfo> = {
  anineko: { name: "AniNeko", site: "https://anineko.to" },
  anizone: { name: "AniZone", site: "https://anizone.to" },
  anikoto: { name: "AniKoto", site: "https://anikototv.to" },
  reanime: { name: "ReAnime", site: "https://reanime.to" },
  aniwaves: { name: "AniWaves", site: "https://aniwaves.ru" },
  kaa: { name: "KAA", site: "https://kaa.lt" },
  anibd: { name: "AniBD", site: "https://epeng.animeapps.top" },
  animegg: { name: "AnimeGG", site: "https://www.animegg.org" },
  mkissa: { name: "MKissa", site: "https://mkissa.to" },
  animeonsen: { name: "AnimeOnsen", site: "https://www.animeonsen.xyz" },
};

export const getServerLabel = (providerNames: string[], providerName: string): string => {
  const index = providerNames.indexOf(providerName);
  // If the episode list came from the API metadata fallback, the "auto" route
  // tries the provider race; it is the only visible route until provider data resolves.
  if (index >= 0) return `Server ${index + 2}`;
  return providerName.toLowerCase() === "auto" ? "Automatic server selection" : "Unnumbered provider";
};

export const getProviderDisplayName = (providerName: string): string => {
  const normalized = (providerName || "").toLowerCase();
  const provider = PROVIDER_INFO[normalized];
  if (provider) return provider.name;
  if (normalized === "auto") return "Auto";
  if (!normalized) return "Unknown provider";
  return normalized.replace(/(^|[-_])([a-z])/g, (_match, prefix: string, letter: string) =>
    `${prefix ? " " : ""}${letter.toUpperCase()}`,
  );
};

export const getServerProviderTitle = (providerNames: string[], providerName: string): string => {
  const label = getServerLabel(providerNames, providerName);
  const provider = PROVIDER_INFO[providerName.toLowerCase()];
  if (provider) return `${label} — ${provider.name} (${provider.site})`;
  if (providerName.toLowerCase() === "auto") return `${label} — automatic Kuhi provider routing`;
  return `${label} — ${providerName || "unidentified provider"}`;
};