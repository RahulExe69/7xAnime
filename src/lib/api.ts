import axios, { AxiosHeaders } from "axios";
import { Capacitor, registerPlugin } from "@capacitor/core";

type LocalBackendStartResult = {
  baseUrl: string;
  token: string;
};

type LocalAnimeBackendContract = {
  start(): Promise<LocalBackendStartResult>;
};

const LocalAnimeBackend = registerPlugin<LocalAnimeBackendContract>("LocalAnimeBackend");
const localBackendEnabled = process.env.NEXT_PUBLIC_LOCAL_BACKEND === "1";
const configuredBaseURL = process.env.NEXT_PUBLIC_API_URL?.trim();

let localBackendToken: string | null = null;
let localBackendStart: Promise<string> | null = null;
let localBackendBaseURL = "http://127.0.0.1:8000";

/** True only in APK builds which bundle and start the Python API on-device. */
export const isLocalBackendEnabled = (): boolean => localBackendEnabled;

/** Available after the first API request has started the native backend. */
export const getLocalBackendToken = (): string | null => localBackendToken;

const ensureLocalBackendStarted = async (): Promise<string> => {
  if (localBackendToken) return localBackendToken;

  if (typeof window === "undefined" || !Capacitor.isNativePlatform()) {
    throw new Error(
      "This build expects the on-device API and must be opened inside the 7xAnime Android app.",
    );
  }

  if (!localBackendStart) {
    localBackendStart = LocalAnimeBackend.start()
      .then(({ baseUrl, token }) => {
        if (!baseUrl || !token) {
          throw new Error("The on-device API returned incomplete startup details.");
        }
        localBackendBaseURL = baseUrl.replace(/\/+$/, "");
        localBackendToken = token;
        api.defaults.baseURL = localBackendBaseURL;
        return token;
      })
      .catch((error) => {
        localBackendStart = null;
        throw error;
      });
  }

  return localBackendStart;
};

export const api = axios.create({
  baseURL: localBackendEnabled
    ? localBackendBaseURL
    : configuredBaseURL || undefined,
  timeout: 45000,
});

api.interceptors.request.use(async (config) => {
  if (localBackendEnabled) {
    const token = await ensureLocalBackendStarted();
    const headers = AxiosHeaders.from(config.headers);
    headers.set("X-7xAnime-Token", token);
    config.headers = headers;
  }
  return config;
});
