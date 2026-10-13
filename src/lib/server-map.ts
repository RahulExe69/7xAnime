export type ProviderAudio = "sub" | "dub";

export type ProviderInfo = {
  name: string;
  site: string;
  audio: readonly ProviderAudio[];
  formats: readonly ("hls" | "mp4" | "embed" | "dash")[];
};

/** Explicitly selectable manual sources. AnimeParadise is a direct HLS
 * candidate awaiting device verification. Manual embed sources remain outside Auto.
 */
export const KUHI_PROVIDER_ORDER = ["anixo", "megavid", "animeparadise", "megaflix", "tryembed", "cinexstream", "nontongo"] as const;

/**
 * Explicitly supported manual player/embed routes. These are advertised audio/format
 * capabilities, not a guarantee that every title or episode plays. The four Yomi-derived
 * adapters construct iframe URLs and are not treated as direct stream extractors.
 */
export const PROVIDER_INFO: Record<string, ProviderInfo> = {
  anixo: { name: "AniXo", site: "https://anixo.buzz", audio: ["sub", "dub"], formats: ["embed"] },
  megavid: { name: "Megavid", site: "https://megavid.buzz", audio: ["sub", "dub"], formats: ["embed"] },
  animeparadise: { name: "AnimeParadise", site: "https://animeparadise.moe", audio: ["sub"], formats: ["hls"] },
  megaflix: { name: "MegaFlix", site: "https://www.megaflix.buzz", audio: ["sub", "dub"], formats: ["embed"] },
  tryembed: { name: "TryEmbed", site: "https://tryembed.us.cc", audio: ["sub", "dub"], formats: ["embed"] },
  cinexstream: { name: "CinexStream", site: "https://cinextream.cc", audio: ["sub", "dub"], formats: ["embed"] },
  nontongo: { name: "NontonGo", site: "https://nontongo.win", audio: ["sub"], formats: ["embed"] },
};

export const isProviderSelectable = (providerName: string, category: ProviderAudio): boolean => {
  const provider = PROVIDER_INFO[providerName.toLowerCase()];
  if (!provider) return true;
  return provider.audio.includes(category) && provider.formats.some((format) => format !== "dash");
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