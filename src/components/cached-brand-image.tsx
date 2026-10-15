"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { loadBrandAssetObjectUrl } from "@/lib/brand-assets";

type CachedBrandImageProps = {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  fallbackSrc?: string;
  fallbackLabel?: string;
};

export default function CachedBrandImage({
  src,
  alt,
  width,
  height,
  className = "",
  fallbackSrc,
  fallbackLabel = "7x",
}: CachedBrandImageProps) {
  const [loaded, setLoaded] = useState<{ source: string; objectUrl: string } | null>(null);
  const [failedSource, setFailedSource] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setFailedSource(null);

    void loadBrandAssetObjectUrl(src)
      .then((nextUrl) => {
        objectUrl = nextUrl;
        if (active) {
          setLoaded({ source: src, objectUrl: nextUrl });
        } else {
          URL.revokeObjectURL(nextUrl);
        }
      })
      .catch(() => {
        if (active) setFailedSource(src);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  const loadedUrl = loaded?.source === src && failedSource !== src ? loaded.objectUrl : null;
  const effectiveFallback = fallbackSrc;

  return (
    <div className={`grid place-items-center overflow-hidden ${className}`}>
      {loadedUrl ? (
        <Image
          src={loadedUrl}
          alt={alt}
          width={width}
          height={height}
          unoptimized
          className="h-full w-full object-contain"
          onError={() => setFailedSource(src)}
        />
      ) : effectiveFallback ? (
        <Image
          src={effectiveFallback}
          alt={alt}
          width={width}
          height={height}
          unoptimized
          className="h-full w-full object-contain"
        />
      ) : (
        <span aria-label={alt} className="select-none text-center text-xs font-black tracking-tight text-[#ff9fbe]">
          {fallbackLabel}
        </span>
      )}
    </div>
  );
}
