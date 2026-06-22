"use client";

import { useEffect, useState } from "react";

// Treeninäkymän "pidä näyttö päällä" -kytkin. Toisin kuin jaettu useWakeLock,
// tämä raportoi myös tuen ja virheen UI:lle (toggle disabloidaan jos ei tuettu,
// virheviesti näytetään). activeContext = ollaanko aktiivisessa treenissä.
export function useWorkoutWakeLock(activeContext: boolean) {
  const [keepScreenOn, setKeepScreenOn] = useState(false);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState("");
  const [sentinel, setSentinel] = useState<{ release: () => Promise<void> } | null>(null);

  useEffect(() => {
    setSupported(typeof navigator !== "undefined" && "wakeLock" in navigator);
  }, []);

  useEffect(() => {
    const shouldKeepAwake = keepScreenOn && activeContext;
    if (!supported || !shouldKeepAwake) {
      if (sentinel) {
        void sentinel.release().catch(() => undefined);
        setSentinel(null);
      }
      return;
    }
    if (sentinel) {
      return;
    }

    let cancelled = false;
    const requestWakeLock = async () => {
      try {
        const lock = await (navigator as Navigator & {
          wakeLock: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
        }).wakeLock.request("screen");
        if (cancelled) {
          await lock.release().catch(() => undefined);
          return;
        }
        setError("");
        setSentinel(lock);
      } catch {
        if (!cancelled) {
          setError("Näytön päälläpito ei onnistunut tällä laitteella.");
          setKeepScreenOn(false);
        }
      }
    };
    void requestWakeLock();

    return () => {
      cancelled = true;
    };
  }, [activeContext, keepScreenOn, sentinel, supported]);

  useEffect(() => {
    return () => {
      if (sentinel) {
        void sentinel.release().catch(() => undefined);
      }
    };
  }, [sentinel]);

  const clearError = () => setError("");

  return { keepScreenOn, setKeepScreenOn, supported, error, clearError };
}
