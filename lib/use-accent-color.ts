"use client";

import { useCallback, useEffect, useState } from "react";

// Aksenttiväri on laitekohtainen preferenssi (kuten "Pidä näyttö päällä"):
// talletetaan localStorageen ja sovelletaan documentElementiin data-accentilla.
// CSS määrittelee aksentit vaalealle ja tummalle teemalle (globals.css):
//   green  → ei data-accentia (oletus)
//   blue   → data-accent="sini"
//   copper → data-accent="kupari"
export type AccentColor = "green" | "blue" | "copper";

const ACCENT_STORAGE_KEY = "accent-color";
const ACCENT_EVENT = "accent-color-change";

function dataAccentValue(accent: AccentColor): string | null {
  return accent === "blue" ? "sini" : accent === "copper" ? "kupari" : null;
}

export function applyAccentToDocument(accent: AccentColor) {
  if (typeof document === "undefined") {
    return;
  }
  const value = dataAccentValue(accent);
  if (value) {
    document.documentElement.dataset.accent = value;
  } else {
    delete document.documentElement.dataset.accent;
  }
}

function readAccentColor(): AccentColor {
  if (typeof window === "undefined") {
    return "green";
  }
  try {
    const stored = window.localStorage.getItem(ACCENT_STORAGE_KEY);
    return stored === "blue" || stored === "copper" ? stored : "green";
  } catch {
    return "green";
  }
}

export function useAccentColorPreference(): readonly [AccentColor, (next: AccentColor) => void] {
  const [value, setValue] = useState<AccentColor>(readAccentColor);

  useEffect(() => {
    // Sovella heti mountissa (varmistus layoutin inline-skriptin lisäksi) ja
    // pidä synkassa muiden välilehtien/komponenttien kanssa.
    applyAccentToDocument(readAccentColor());
    const sync = () => setValue(readAccentColor());
    window.addEventListener(ACCENT_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(ACCENT_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = useCallback((next: AccentColor) => {
    try {
      window.localStorage.setItem(ACCENT_STORAGE_KEY, next);
    } catch {
      // Ignore storage failures; keep the in-memory preference.
    }
    applyAccentToDocument(next);
    window.dispatchEvent(new Event(ACCENT_EVENT));
    setValue(next);
  }, []);

  return [value, update] as const;
}
