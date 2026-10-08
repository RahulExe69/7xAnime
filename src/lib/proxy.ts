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

  return `${proxyEndpoint}?${params.toString()}`;
};
