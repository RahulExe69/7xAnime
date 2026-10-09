import React from "react";
import styles from "./loading.module.css";

const FRAME_COUNT = 12;

export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading 7xAnime"
      className="flex min-h-[70svh] w-full items-center justify-center overflow-hidden bg-[#09090f] px-4 py-12 text-zinc-100"
    >
      <div className="flex w-full max-w-4xl flex-col items-center gap-12 sm:gap-16">
        <svg className={styles.aperture} viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="38" fill="none" stroke="#8b5cf6" strokeWidth="2" opacity=".48" />
          <path d="M49 15 68 27 61 46 40 43 34 24Z" fill="#8b5cf6" />
          <path d="m69 29 16 20-9 22-20-8 5-21Z" fill="#8b5cf6" opacity=".83" />
          <path d="m74 73-24 12-22-9 8-20 21 3Z" fill="#8b5cf6" opacity=".7" />
          <path d="m26 74-12-23 10-22 19 8-4 21Z" fill="#8b5cf6" opacity=".9" />
          <path d="m30 26 22-12 15 10-9 20-20-2Z" fill="#8b5cf6" opacity=".62" />
          <circle cx="50" cy="50" r="9" fill="#09090f" />
          <circle cx="50" cy="50" r="4" fill="#c4b5fd" />
        </svg>
        <div className="w-full">
          <div className={styles.filmStrip} aria-hidden="true">
            {Array.from({ length: FRAME_COUNT }).map((_, index) => (
              <i key={index} className={styles.frame} />
            ))}
          </div>
          <p className="mt-5 text-center text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
            Loading your next episode
          </p>
        </div>
      </div>
      <span className="sr-only">Loading 7xAnime</span>
    </div>
  );
}
