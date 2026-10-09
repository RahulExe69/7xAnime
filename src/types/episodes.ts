export interface IEpisodes {
  totalEpisodes: number;
  episodes: Episode[];
}

export interface Episode {
  title: string;
  episodeId: string;
  number: number;
  isFiller: boolean;
  hasSub?: boolean;
  hasDub?: boolean;
}

export interface IEpisodeSource {
  headers: {
    Referer: string;
  };
  subtitles: Track[];
  intro: Intro;
  outro: Outro;
  sources: Source[];
  anilistID: number;
  malID: number;
  /** The actual embedded provider that supplied these streams, when known. */
  provider?: string;
  requestedProvider?: string;
  defaultProvider?: string;
  providerStatus?: "ok" | "no_stream" | "provider_unavailable" | "unsupported_provider" | "timeout" | "error";
  providerError?: string | null;
  /** Extraction outcomes for providers attempted by the automatic route. */
  timings?: Record<string, { seconds: number; ok: boolean }>;
}

export interface IEpisodeServers {
  episodeId: string;
  episodeNo: string;
  sub: {
    serverId: number;
    serverName: string;
  }[];
  dub: {
    serverId: number;
    serverName: string;
  }[];
  raw: {
    serverId: number;
    serverName: string;
  }[];
}

export interface Track {
  lang: string;
  url: string;
}

export interface Intro {
  start: number;
  end: number;
}

export interface Outro {
  start: number;
  end: number;
}

export interface Source {
  url: string;
  type: string;
  referer?: string;
  headers?: Record<string, string>;
  server?: string;
}
