"use client";

import { useEffect } from "react";
import { preloadBrandAssets } from "@/lib/brand-assets";

export default function AccessibilityPreferences() {
  useEffect(() => {
    const syncReducedMotion = () => {
      try {
        document.documentElement.dataset.reducedMotion =
          String(localStorage.getItem("7xAnime:reduceMotion") === "true");
      } catch {
        document.documentElement.dataset.reducedMotion = "false";
      }
    };

    syncReducedMotion();
    // Fetch the shared 7x icons on app startup and keep them in persistent Cache Storage.
    // This never blocks the first render; cached art is available on later launches.
    void preloadBrandAssets();
    window.addEventListener("storage", syncReducedMotion);
    return () => window.removeEventListener("storage", syncReducedMotion);
  }, []);

  return null;
}
