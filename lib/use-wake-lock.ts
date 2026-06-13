"use client";

import { useCallback, useEffect, useState } from "react";

// Screen Wake Lock: pitää näytön päällä kun active = true. Vapautetaan unmountissa
// ja hankitaan uudelleen kun välilehti palaa näkyviin (lock vapautuu automaattisesti
// kun sivu menee taustalle). Ref: handoff/redesign/ui.jsx → useWakeLock.
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) {
      return;
    }

    let sentinel: { release: () => Promise<void> } | null = null;
    let released = false;

    const request = () => {
      (navigator as Navigator & {
        wakeLock: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
      }).wakeLock
        .request("screen")
        .then((lock) => {
          sentinel = lock;
          if (released) {
            void lock.release().catch(() => undefined);
          }
        })
        .catch(() => undefined);
    };

    request();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        request();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      released = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (sentinel) {
        void sentinel.release().catch(() => undefined);
      }
    };
  }, [active]);
}

// "Pidä näyttö päällä" on laitekohtainen preferenssi (ei DB-profiiliasetus), joten
// se talletetaan localStorageen. Oletus: päällä.
const KEEP_SCREEN_ON_STORAGE_KEY = "keep-screen-on";
const KEEP_SCREEN_ON_EVENT = "keep-screen-on-change";

function readKeepScreenOn(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    const stored = window.localStorage.getItem(KEEP_SCREEN_ON_STORAGE_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

export function useKeepScreenOnPreference(): readonly [boolean, (next: boolean) => void] {
  const [value, setValue] = useState<boolean>(readKeepScreenOn);

  useEffect(() => {
    const sync = () => setValue(readKeepScreenOn());
    window.addEventListener(KEEP_SCREEN_ON_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(KEEP_SCREEN_ON_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = useCallback((next: boolean) => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(KEEP_SCREEN_ON_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage failures; keep the in-memory preference.
      }
      window.dispatchEvent(new Event(KEEP_SCREEN_ON_EVENT));
    }
    setValue(next);
  }, []);

  return [value, update] as const;
}
