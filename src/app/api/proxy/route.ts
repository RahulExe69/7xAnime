import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

class UnsafeProxyTargetError extends Error {}

const MAX_REDIRECTS = 5;

function isNonPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113)
    );
  }

  if (version === 6) {
    const normalized = address.toLowerCase().split("%")[0];
    // Reject IPv4-mapped IPv6 and any address outside the global-unicast 2000::/3 range.
    return normalized.startsWith("::ffff:") ||
      !/^[23]/.test(normalized) ||
      normalized.startsWith("2001:db8:");
  }

  return true;
}

async function validateRemoteTarget(value: string): Promise<URL> {
  let target: URL;
  try {
    target = new URL(value);
  } catch {
    throw new UnsafeProxyTargetError("The proxy target URL is invalid.");
  }

  if (
    !["http:", "https:"].includes(target.protocol) ||
    !target.hostname ||
    target.username ||
    target.password
  ) {
    throw new UnsafeProxyTargetError("Only credential-free HTTP(S) media URLs are supported.");
  }

  const host = target.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  if (
    host === "localhost" ||
    host === "localhost.localdomain" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".home.arpa")
  ) {
    throw new UnsafeProxyTargetError("Local network targets are not allowed.");
  }

  if (isIP(host)) {
    if (isNonPublicAddress(host)) {
      throw new UnsafeProxyTargetError("Local or reserved IP targets are not allowed.");
    }
    return target;
  }

  let addresses: Awaited<ReturnType<typeof lookup>>;
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new UnsafeProxyTargetError("The proxy target hostname could not be resolved.");
  }

  if (!addresses.length || addresses.some(({ address }) => isNonPublicAddress(address))) {
    throw new UnsafeProxyTargetError("The proxy target must resolve only to public IP addresses.");
  }

  return target;
}

async function fetchRemoteTarget(
  initialTarget: URL,
  headers: Record<string, string>,
): Promise<{ response: Response; finalUrl: string }> {
  let target = initialTarget;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    target = await validateRemoteTarget(target.toString());
    const response = await fetch(target.toString(), {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });

    const location = response.headers.get("location");
    const isRedirect = [301, 302, 303, 307, 308].includes(response.status);
    if (!isRedirect || !location) {
      return { response, finalUrl: target.toString() };
    }

    try {
      await response.body?.cancel();
    } catch {
      // Releasing the old body is best-effort; redirect validation remains mandatory.
    }

    if (redirects === MAX_REDIRECTS) {
      throw new Error("The proxy target exceeded the redirect limit.");
    }

    try {
      target = new URL(location, target);
    } catch {
      throw new UnsafeProxyTargetError("The proxy target returned an invalid redirect.");
    }
  }

  throw new Error("The proxy target exceeded the redirect limit.");
}

export async function GET(request: NextRequest) {
  const requestUrl = request.url;
  const searchParams = request.nextUrl.searchParams;

  // Extract targetUrl preserving query string parameters
  let targetUrl = "";
  let referer = "";

  const urlMatch = requestUrl.match(/[?&]url=([^&]+(?:&(?!(?:referer)=)[^&]+)*)/);
  if (urlMatch && urlMatch[1]) {
    try {
      targetUrl = decodeURIComponent(urlMatch[1]);
    } catch {
      targetUrl = searchParams.get("url") || "";
    }
  } else {
    targetUrl = searchParams.get("url") || "";
  }

  const refererMatch = requestUrl.match(/[?&]referer=([^&]+)/);
  if (refererMatch && refererMatch[1]) {
    try {
      referer = decodeURIComponent(refererMatch[1]);
    } catch {
      referer = searchParams.get("referer") || searchParams.get("headers") || "";
    }
  } else {
    referer = searchParams.get("referer") || searchParams.get("headers") || "";
  }

  if (!targetUrl) {
    return new NextResponse("Missing url parameter", { status: 400 });
  }

  try {
    const targetUri = new URL(targetUrl);
    const origin = targetUri.origin;

    if (!referer || referer.includes("localhost") || referer.includes("127.0.0.1") || referer.includes("0.0.0.0")) {
      referer = `${origin}/`;
    }

    const baseHeaders: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
    };

    // Attempt 1: Fetch with provided Referer and Origin
    const fetchHeaders: Record<string, string> = {
      ...baseHeaders,
      Referer: referer,
      Origin: origin,
    };

    // Forward byte-range requests so media elements can seek without downloading the full file.
    const range = request.headers.get("range");
    const ifRange = request.headers.get("if-range");
    if (range) baseHeaders.Range = range;
    if (ifRange) baseHeaders["If-Range"] = ifRange;

    let fetched = await fetchRemoteTarget(targetUri, fetchHeaders);
    let response = fetched.response;
    let finalUrl = fetched.finalUrl;

    // Attempt 2: Some providers require the upstream request without Referer/Origin.
    if (!response.ok && (response.status === 404 || response.status === 403)) {
      try {
        await response.body?.cancel();
      } catch {
        // The fallback request can proceed even when the first body cannot be cancelled.
      }
      fetched = await fetchRemoteTarget(targetUri, baseHeaders);
      response = fetched.response;
      finalUrl = fetched.finalUrl;
    }

    if (!response.ok) {
      return new NextResponse(`Proxy target returned status: ${response.status} ${response.statusText}`, {
        status: response.status,
      });
    }

    const contentType = response.headers.get("content-type") || "";
    const finalTarget = new URL(finalUrl);
    const urlWithoutQuery = finalTarget.pathname;

    const isM3u8Candidate =
      urlWithoutQuery.toLowerCase().endsWith(".m3u8") ||
      contentType.toLowerCase().includes("mpegurl") ||
      contentType.toLowerCase().includes("x-mpegurl") ||
      contentType.toLowerCase().includes("vnd.apple.mpegurl");

    if (isM3u8Candidate) {
      const manifestText = await response.text();

      if (manifestText.includes("#EXTM3U") || isM3u8Candidate) {
        const baseUrl = new URL(".", finalTarget).toString();
        const finalOrigin = finalTarget.origin;

        // Rewrite relative and absolute URL lines in m3u8 playlist to route back through this proxy
        const rewrittenManifest = manifestText
          .split("\n")
          .map((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) {
              if (trimmed.startsWith("#EXT-X-KEY:") || trimmed.startsWith("#EXT-X-MAP:")) {
                return trimmed.replace(/URI="([^"]+)"/g, (match, uriStr) => {
                  const absoluteUri = new URL(uriStr, finalUrl).toString();
                  if (!/^https?:/i.test(absoluteUri)) return match;
                  const proxyUri = `/api/proxy?url=${encodeURIComponent(absoluteUri)}${
                    referer ? `&referer=${encodeURIComponent(referer)}` : ""
                  }`;
                  return `URI="${proxyUri}"`;
                });
              }
              return line;
            }

            let segmentUrl: string;
            try {
              segmentUrl = new URL(trimmed, finalUrl).toString();
            } catch {
              return line;
            }
            if (!/^https?:/i.test(segmentUrl)) return line;

            return `/api/proxy?url=${encodeURIComponent(segmentUrl)}${
              referer ? `&referer=${encodeURIComponent(referer)}` : ""
            }`;
          })
          .join("\n");

        return new NextResponse(rewrittenManifest, {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.apple.mpegurl",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Cache-Control": "no-cache",
          },
        });
      }
    }

    // Stream media bytes directly through the route. Buffering arrayBuffer() here
    // made every concurrent video consume memory proportional to the full file size.
    const proxyHeaders = new Headers({
      "Content-Type": contentType || "application/octet-stream",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Range, If-Range, Content-Type",
      "Cache-Control": "private, no-store",
    });
    for (const name of ["content-range", "accept-ranges", "etag", "last-modified", "content-disposition"]) {
      const value = response.headers.get(name);
      if (value) proxyHeaders.set(name, value);
    }

    return new NextResponse(response.body, {
      status: response.status,
      headers: proxyHeaders,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown proxy error";
    console.error("Proxy error:", message);
    return new NextResponse(
      error instanceof UnsafeProxyTargetError
        ? "Proxy target rejected: the URL must resolve to a public HTTP(S) host."
        : `Proxy server error: ${message}`,
      { status: error instanceof UnsafeProxyTargetError ? 400 : 502 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
