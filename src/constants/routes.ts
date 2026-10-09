export const ROUTES = {
  HOME: "/",
  ANIME_DETAILS: "/anime",
  PROFILE: "/profile",
  WATCH: "/anime/watch",
  SEARCH: "/search",

  animeDetails: (id: string | number) => `/anime?id=${encodeURIComponent(id)}`,
  watchAnime: (id: string | number, episode?: string | number) => {
    const params = new URLSearchParams({ anime: String(id) });
    if (episode !== undefined && episode !== null) params.set("ep", String(episode));
    return `/anime/watch?${params.toString()}`;
  },
  profile: (username: string) =>
    `/profile?username=${encodeURIComponent(username)}`,
};
