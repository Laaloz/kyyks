"use client";

import { Camera, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FoodImageMode } from "@/lib/types";

// "denied" = käyttäjä on estänyt kameraluvan (selaimen/laitteen asetukset), "no-camera" = laitteessa
// ei kameraa, "error" = muu virhe. Eroteltu, koska denied vaatii erilaisen ohjeen kuin tekninen vika.
type CaptureStatus = "starting" | "ready" | "unsupported" | "denied" | "no-camera" | "error";

// Kuvaustilat: käyttäjä kertoo mitä kuvaa → AI saa kohdistetun promptin. "photo" (annos) on
// oletus, koska ateriakuva on yleisin käyttötapaus.
const CAPTURE_MODES: { mode: FoodImageMode; label: string; hint: string }[] = [
  { mode: "barcode", label: "Viivakoodi", hint: "Kuvaa tuotteen viivakoodi — arvot haetaan tuotetietokannasta." },
  { mode: "label", label: "Etiketti", hint: "Kuvaa ravintosisältötaulukko — arvot luetaan suoraan etiketistä." },
  { mode: "photo", label: "Annos", hint: "Kuvaa ruoka tai juoma — AI arvioi sisällön ja määrän." },
];

/**
 * Sovelluksen sisäinen kamera (getUserMedia). Toimii myös asennetussa Android-PWA:ssa,
 * jossa <input capture> ei avaa kameraa. Ottaa ruudun talteen canvasilla → skaalattu JPEG
 * base64. Jos kameraa ei voi avata (ei tukea / lupa evätty), tarjoaa tiedosto-fallbackin.
 *
 * Huom: live-stream sytyttää iOS:n vihreän kamerapisteen — siksi tracket pysäytetään aina
 * näkymää suljettaessa, jotta indikaattori sammuu.
 */
export function CameraCapture({
  onCapture,
  onPickFile,
  onClose,
}: {
  onCapture: (input: { base64: string; mimeType: string; mode: FoodImageMode }) => void;
  onPickFile: (file: File, mode: FoodImageMode) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [mode, setMode] = useState<FoodImageMode>("photo");
  const [status, setStatus] = useState<CaptureStatus>("starting");
  // Kasvatetaan "Yritä uudelleen" -napista → effect ajaa getUserMedian uudelleen (esim. kun
  // käyttäjä on juuri sallinut luvan asetuksista). Pysyvästi estetty lupa ei silti palaudu ilman tätä.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const media = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;

    const start = async () => {
      setStatus("starting");
      if (!media?.getUserMedia) {
        setStatus("unsupported");
        return;
      }

      // Paras saatavilla oleva ennakkotarkistus: jos lupa on jo pysyvästi estetty, näytä ohje
      // heti ilman getUserMedia-välähdystä. Permissions-API ei ole kaikkialla (mm. osa iOS-Safarista),
      // joten tämä on vain best-effort — varsinainen totuus tulee getUserMedian tuloksesta.
      try {
        const permission = await navigator.permissions?.query({ name: "camera" as PermissionName });
        if (cancelled) return;
        if (permission?.state === "denied") {
          setStatus("denied");
          return;
        }
      } catch {
        // Permissions-APIn puuttuminen ei ole virhe — jatketaan suoraan getUserMediaan.
      }

      try {
        const stream = await media.getUserMedia({ video: { facingMode: facing }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        setStatus("ready");
      } catch (caught) {
        if (cancelled) return;
        const name = caught instanceof DOMException ? caught.name : "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setStatus("denied");
        } else if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") {
          setStatus("no-camera");
        } else {
          setStatus("error");
        }
      }
    };

    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [facing, attempt]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      return;
    }
    // 1536 px (ei 1024) jotta etiketin/ravintosisältötaulukon pieni teksti pysyy luettavana.
    const maxSide = 1536;
    const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1] ?? "";
    if (base64) {
      onCapture({ base64, mimeType: "image/jpeg", mode });
    }
  };

  const activeMode = CAPTURE_MODES.find((entry) => entry.mode === mode) ?? CAPTURE_MODES[2]!;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col bg-black" role="dialog" aria-label="Kamera">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="absolute inset-0 size-full object-cover" />

        {status === "starting" ? (
          <p className="absolute inset-0 grid place-items-center text-sm text-white/80">Avataan kameraa…</p>
        ) : null}

        {status === "unsupported" || status === "denied" || status === "no-camera" || status === "error" ? (
          <div className="absolute inset-0 grid place-items-center px-8 text-center">
            <div className="max-w-xs">
              <p className="text-sm font-semibold text-white/90">
                {status === "unsupported"
                  ? "Kameraa ei tueta tässä selaimessa."
                  : status === "no-camera"
                    ? "Kameraa ei löytynyt tästä laitteesta."
                    : status === "error"
                      ? "Kameran avaaminen ei onnistunut."
                      : "Kameran käyttöoikeus on estetty."}
              </p>
              {status === "denied" ? (
                <p className="mt-2 text-xs leading-relaxed text-white/70">
                  Salli kamera osoitepalkin kamerakuvakkeesta tai laitteen asetuksista
                  (esim. Asetukset → selain/sovellus → Kamera) ja yritä uudelleen. Voit myös valita valmiin kuvan.
                </p>
              ) : null}
              <div className="mt-4 flex flex-col items-center gap-2">
                {status === "denied" || status === "error" ? (
                  <Button type="button" variant="secondary" onClick={() => setAttempt((value) => value + 1)}>
                    Yritä uudelleen
                  </Button>
                ) : null}
                <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
                  Valitse kuva
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
          <button
            type="button"
            aria-label="Sulje kamera"
            onClick={onClose}
            className="grid size-11 place-items-center rounded-full bg-black/40 text-white"
          >
            <X className="size-6" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Vaihda kamera"
            onClick={() => setFacing((current) => (current === "environment" ? "user" : "environment"))}
            className="grid size-11 place-items-center rounded-full bg-black/40 text-white"
          >
            <RefreshCw className="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 bg-black p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <button
          type="button"
          aria-label="Ota kuva"
          disabled={status !== "ready"}
          onClick={capture}
          className="grid size-16 place-items-center rounded-full border-4 border-white/80 bg-white/20 transition active:scale-95 disabled:opacity-40"
        >
          <Camera className="size-7 text-white" aria-hidden="true" />
        </button>

        <div className="flex rounded-full bg-white/10 p-1" role="radiogroup" aria-label="Kuvaustila">
          {CAPTURE_MODES.map((entry) => (
            <button
              key={entry.mode}
              type="button"
              role="radio"
              aria-checked={mode === entry.mode}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-semibold transition",
                mode === entry.mode ? "bg-white/25 text-white" : "text-white/60",
              )}
              onClick={() => setMode(entry.mode)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-white/60" aria-live="polite">
          {activeMode.hint}
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            onPickFile(file, mode);
          }
          event.target.value = "";
        }}
      />
    </div>,
    document.body,
  );
}
