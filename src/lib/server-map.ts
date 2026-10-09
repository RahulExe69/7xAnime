export type ProviderAudio = "sub" | "dub";

export type ProviderInfo = {
  name: string;
  site: string;
  audio: readonly ProviderAudio[];
  formats: readonly ("hls" | "mp4" | "embed" | "dash")[];
};

/** Only independently verified manual embed servers remain enabled in the app.
 * Kuhi and the other researched candidates are parked, not queried or exposed.
 */
export const KUHI_PROVIDER_ORDER = ["anixo", "megavid"] as const;

/**
 * Embedded Kuhi provider capabilities from the pinned adapters/documentation.
 * These are general capabilities, not a promise that every title/episode has a stream.
 * DASH-only results are deliberately excluded until a DASH player is bundled.
 */
export const PROVIDER_INFO: Record<string, ProviderInfo> = {
  anixo: { name: "AniXo", site: "https://anixo.buzz", audio: ["sub", "dub"], formats: ["embed"] },
  megavid: { name: "Megavid", site: "https://megavid.buzz", audio: ["sub", "dub"], formats: ["embed"] },
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