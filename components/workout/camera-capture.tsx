"use client";

import { Camera, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";

/**
 * Sovelluksen sisäinen kamera (getUserMedia). Toimii myös asennetussa Android-PWA:ssa,
 * jossa <input capture> ei avaa kameraa. Ottaa ruudun talteen canvasilla → skaalattu JPEG
 * base64. Jos kameraa ei voi avata (ei tukea / lupa evätty), tarjoaa tiedosto-fallbackin.
 */
export function CameraCapture({
  onCapture,
  onPickFile,
  onClose,
}: {
  onCapture: (input: { base64: string; mimeType: string }) => void;
  onPickFile: (file: File) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [status, setStatus] = useState<"starting" | "ready" | "unsupported" | "denied">("starting");

  useEffect(() => {
    let cancelled = false;
    const media = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;

    const start = async () => {
      setStatus("starting");
      if (!media?.getUserMedia) {
        setStatus("unsupported");
        return;
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
      } catch {
        if (!cancelled) setStatus("denied");
      }
    };

    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [facing]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      return;
    }
    const maxSide = 1024;
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
      onCapture({ base64, mimeType: "image/jpeg" });
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col bg-black" role="dialog" aria-label="Kamera">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="absolute inset-0 size-full object-cover" />

        {status === "starting" ? (
          <p className="absolute inset-0 grid place-items-center text-sm text-white/80">Avataan kameraa…</p>
        ) : null}

        {status === "unsupported" || status === "denied" ? (
          <div className="absolute inset-0 grid place-items-center px-8 text-center">
            <div>
              <p className="text-sm text-white/90">
                {status === "unsupported"
                  ? "Kameraa ei tueta tässä selaimessa."
                  : "Kameran käyttöoikeus puuttuu — salli kamera tai valitse kuva."}
              </p>
              <Button type="button" variant="secondary" className="mt-4" onClick={() => fileRef.current?.click()}>
                Valitse kuva
              </Button>
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

      <div className="flex items-center justify-center bg-black p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <button
          type="button"
          aria-label="Ota kuva"
          disabled={status !== "ready"}
          onClick={capture}
          className="grid size-16 place-items-center rounded-full border-4 border-white/80 bg-white/20 transition active:scale-95 disabled:opacity-40"
        >
          <Camera className="size-7 text-white" aria-hidden="true" />
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            onPickFile(file);
          }
          event.target.value = "";
        }}
      />
    </div>,
    document.body,
  );
}
