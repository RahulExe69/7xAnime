import React from "react";

/** Lightweight watch-route fallback: keep the user near the player while it mounts. */
export default function WatchLoading() {
  return (
    <main role="status" aria-live="polite" aria-label="Preparing episode" className="min-h-[55svh] bg-[#0c0b12] px-3 pb-6 pt-4 text-white sm:px-5">
      <div className="mx-auto grid w-full max-w-screen-2xl grid-cols-1 gap-4 lg:grid-cols-4">
        <section className="space-y-3 lg:col-span-3">
          <div className="aspect-video w-full animate-pulse rounded-2xl border border-white/[0.06] bg-[#111018]" />
          <div className="h-14 w-full animate-pulse rounded-2xl border border-white/[0.06] bg-[#111018]" />
          <div className="h-20 w-full animate-pulse rounded-2xl border border-white/[0.06] bg-[#111018]" />
        </section>
        <aside className="space-y-2 rounded-2xl border border-white/[0.06] bg-[#101018] p-3">
          <div className="h-5 w-24 animate-pulse rounded bg-white/[0.06]" />
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} className="h-11 animate-pulse rounded-xl bg-white/[0.04]" />
          ))}
        </aside>
      </div>
    </main>
  );
}
