import { getLocalBackendToken, isLocalBackendEnabled } from "@/lib/api";

const configuredProxy = process.env.NEXT_PUBLIC_PROXY_URL?.trim().replace(/\/+$/, "");

const proxyEndpoint = configuredProxy
  ? configuredProxy.endsWith("/m3u8-proxy")
    ? configuredProxy
    : `${configuredProxy}/m3u8-proxy`
  : "/api/proxy";

export const getProxyUrl = (targetUrl: string, referer?: string): string => {
  const params = new URLSearchParams({ url: targetUrl });

  if (referer) {
    params.set("referer", referer);
  }

  if (isLocalBackendEnabled()) {
    const token = getLocalBackendToken();
    if (token) params.set("token", token);
    return `http://127.0.0.1:8000/api/proxy?${params.toString()}`;
  }

  return `${proxyEndpoint}?${params.toString()}`;
};
