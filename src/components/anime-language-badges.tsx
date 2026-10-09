"use client";

import React, { useEffect, useRef, useState } from "react";
import { useGetAllEpisodes } from "@/query/get-all-episodes";
import { cn } from "@/lib/utils";

type Props = {
  animeId: string;
  titles: string[];
  className?: string;
};

/** Loads metadata only as the poster approaches the viewport; no guessed badges. */
export default function AnimeLanguageBadges({ animeId, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(false);

  useEffect(() => {
    const element = hostRef.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: "64px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const { data: episodesData } = useGetAllEpisodes(nearViewport ? animeId : "");
  const providers = episodesData?.rawResponse?.providers;
  const hasSub = !!providers && Object.values(providers).some((provider: any) => (provider?.episodes?.sub || []).length > 0);
  const hasEnglish = !!providers && Object.values(providers).some((provider: any) => (provider?.episodes?.dub || []).length > 0);

  const languages = [
    hasSub ? "SUB" : null,
    hasEnglish ? "ENGLISH" : null,
  ].filter((language): language is string => !!language);

  return (
    <div ref={hostRef} aria-label={languages.length ? `Available languages: ${languages.join(", ")}` : undefined} className={cn("pointer-events-none absolute left-2 top-2 z-20 flex max-w-[calc(100%-3rem)] flex-wrap gap-1", className)}>
      {languages.map((language) => (
        <span key={language} className="rounded-md border border-white/15 bg-black/80 px-1.5 py-1 text-[8px] font-extrabold leading-none tracking-wide text-white shadow-sm backdrop-blur-sm sm:text-[9px]">
          {language}
        </span>
      ))}
    </div>
  );
}
