export type ProviderAudio = "sub" | "dub";

export type ProviderInfo = {
  name: string;
  site: string;
  audio: readonly ProviderAudio[];
  formats: readonly ("hls" | "mp4" | "embed" | "dash")[];
};

/**
 * Supported manual embed providers. MegaPlay is implemented as the dedicated
 * Server 1 iframe in VideoPlayerSection and has no Python provider module.
 *
 * Keep this list aligned with ACTIVE_PROVIDER_ORDER in android-local-backend/local_api.py
 * and the four adapters copied by .github/scripts/configure-local-anime-backend.py.
 * Retired provider names intentionally do not appear here; see docs/SERVERS.md.
 */
export const ACTIVE_EMBED_PROVIDER_ORDER = ["anixo", "megavid", "tryembed", "cinexstream"] as const;

export const PROVIDER_INFO: Record<string, ProviderInfo> = {
  anixo: { name: "AniXo", site: "https://anixo.buzz", audio: ["sub", "dub"], formats: ["embed"] },
  megavid: { name: "Megavid", site: "https://megavid.buzz", audio: ["sub", "dub"], formats: ["embed"] },
  tryembed: { name: "TryEmbed", site: "https://tryembed.us.cc", audio: ["sub", "dub"], formats: ["embed"] },
  cinexstream: { name: "CinexStream", site: "https://cinextream.cc", audio: ["sub", "dub"], formats: ["embed"] },
};

export const isProviderSelectable = (providerName: string, category: ProviderAudio): boolean => {
  const provider = PROVIDER_INFO[providerName.toLowerCase()];
  if (!provider) return providerName.toLowerCase() === "auto";
  return provider.audio.includes(category) && provider.formats.some((format) => format !== "dash");
};

export const getServerLabel = (providerNames: string[], providerName: string): string => {
  const index = providerNames.indexOf(providerName);
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
  if (providerName.toLowerCase() === "auto") return `${label} — automatic stream selection`;
  return `${label} — ${providerName || "unidentified provider"}`;
};
