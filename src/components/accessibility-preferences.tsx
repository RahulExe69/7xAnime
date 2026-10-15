"use client";

import { useEffect } from "react";

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
    window.addEventListener("storage", syncReducedMotion);
    return () => window.removeEventListener("storage", syncReducedMotion);
  }, []);

  return null;
}
