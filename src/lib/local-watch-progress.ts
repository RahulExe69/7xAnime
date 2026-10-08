export type LocalWatchProgress = {
  animeId: string;
  episodeId: string;
  episodeNumber: number;
  animeTitle?: string;
  poster?: string;
  current: number;
  duration: number;
  updatedAt: number;
};

const STORAGE_KEY = "7xanime:watch-progress:v1";
const MAX_PROGRESS_ENTRIES = 500;

const readAll = (): LocalWatchProgress[] => {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is LocalWatchProgress =>
      !!entry &&
      typeof entry.animeId === "string" &&
      typeof entry.episodeId === "string" &&
      typeof entry.episodeNumber === "number" &&
      typeof entry.current === "number" &&
      typeof entry.duration === "number" &&
      typeof entry.updatedAt === "number"
    );
  } catch {
    return [];
  }
};

export const getLocalWatchProgress = (
  animeId: string,
  episodeId: string,
  episodeNumber: number,
): LocalWatchProgress | null => {
  const entries = readAll();
  return (
    entries.find((entry) => entry.episodeId === episodeId) ??
    entries.find(
      (entry) =>
        entry.animeId === animeId && entry.episodeNumber === episodeNumber,
    ) ??
    null
  );
};

export const getLocalWatchProgressForAnime = (
  animeId: string,
): LocalWatchProgress[] =>
  readAll()
    .filter((entry) => entry.animeId === animeId)
    .sort((a, b) => b.updatedAt - a.updatedAt);

export const getRecentLocalWatchProgress = (
  limit = 14,
): LocalWatchProgress[] => {
  const latestByAnime = new Map<string, LocalWatchProgress>();
  for (const entry of readAll().sort((a, b) => b.updatedAt - a.updatedAt)) {
    if (!latestByAnime.has(entry.animeId)) {
      latestByAnime.set(entry.animeId, entry);
    }
  }
  return Array.from(latestByAnime.values()).slice(0, Math.max(0, limit));
};

export const saveLocalWatchProgress = (
  progress: Omit<LocalWatchProgress, "updatedAt">,
): void => {
  if (typeof window === "undefined") return;
  if (
    !progress.animeId ||
    !progress.episodeId ||
    !Number.isFinite(progress.current) ||
    !Number.isFinite(progress.duration) ||
    progress.duration <= 0 ||
    progress.current < 0
  ) {
    return;
  }

  const entry: LocalWatchProgress = {
    ...progress,
    current: Math.max(0, Math.min(progress.current, progress.duration)),
    updatedAt: Date.now(),
  };
  const remaining = readAll().filter(
    (item) =>
      item.episodeId !== entry.episodeId &&
      !(item.animeId === entry.animeId && item.episodeNumber === entry.episodeNumber),
  );
  remaining.push(entry);
  remaining.sort((a, b) => b.updatedAt - a.updatedAt);
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(remaining.slice(0, MAX_PROGRESS_ENTRIES)),
    );
  } catch (error) {
    console.warn("Could not save local watch progress:", error);
  }
};
