export const ROUTES = {
  HOME: "/",
  ANIME_DETAILS: "/anime",
  PROFILE: "/profile",
  WATCH: "/anime/watch",
  SEARCH: "/search",

  animeDetails: (id: string | number) => `/anime?id=${encodeURIComponent(id)}`,
  profile: (username: string) =>
    `/profile?username=${encodeURIComponent(username)}`,
};
