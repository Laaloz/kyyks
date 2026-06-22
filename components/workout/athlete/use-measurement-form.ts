"use client";

import { useEffect, useRef, useState } from "react";

import { bodyMeasurementSchema } from "@/components/workout/schemas";
import { getMeasurementsForUser } from "@/lib/body-metrics";
import { withMinimumDelay } from "@/lib/min-delay";
import type { AppState } from "@/lib/types";
import { useAppState } from "@/providers/app-state-provider";

type MeasurementMessageTone = "info" | "success" | "error";

// Keho-mittausten kirjaussheet: luonnos, esitäyttö, validointi ja tallennus.
// Esitäyttö EI saa riippua bodyMeasurementsista/painosta (ks. efektin kommentti),
// jotta taustasynkka ei pyyhi kesken kirjoitettuja arvoja. Trendinäyttö on eri
// hook ([[use-measurement-trend]]).
export function useMeasurementForm({
  state,
  currentUserId,
  currentWeightKg,
}: {
  state: AppState;
  currentUserId: string | undefined;
  currentWeightKg: number | undefined;
}) {
  const { updateCurrentUserMeasurements, notify } = useAppState();

  const [draft, setDraft] = useState({ weightKg: "", waistCm: "" });
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<MeasurementMessageTone>("info");
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const isDirtyRef = useRef(false);
  const initializedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Esitäytä lomake vain kun mittaus-sheet avataan. EI saa riippua
    // state.bodyMeasurements/weightKg:sta — muuten taustasynkka uudelleen-
    // initialisoisi kentät kesken kirjoittamisen ja pyyhkisi syötetyt arvot.
    if (!isSheetOpen) {
      initializedUserIdRef.current = null;
      isDirtyRef.current = false;
      return;
    }
    if (!currentUserId || initializedUserIdRef.current === currentUserId || isDirtyRef.current) {
      return;
    }

    const latestWaistValue = getMeasurementsForUser(state, currentUserId).find(
      (entry) => entry.waistCm !== undefined,
    )?.waistCm;

    setDraft({
      weightKg: currentWeightKg !== undefined ? String(currentWeightKg) : "",
      waistCm: latestWaistValue !== undefined ? String(latestWaistValue) : "",
    });
    initializedUserIdRef.current = currentUserId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSheetOpen, currentUserId]);

  useEffect(() => {
    setMessage("");
    setMessageTone("info");
  }, [currentUserId]);

  useEffect(() => {
    setIsSheetOpen(false);
  }, [currentUserId]);

  const clearMessage = () => {
    setMessage("");
    setMessageTone("info");
  };

  const openSheet = () => {
    setIsSheetOpen(true);
  };

  const closeSheet = () => {
    isDirtyRef.current = false;
    initializedUserIdRef.current = null;
    setIsSheetOpen(false);
  };

  const changeWeight = (value: string) => {
    isDirtyRef.current = true;
    setDraft((previous) => ({ ...previous, weightKg: value }));
    setMessage("");
    setMessageTone("info");
  };

  const changeWaist = (value: string) => {
    isDirtyRef.current = true;
    setDraft((previous) => ({ ...previous, waistCm: value }));
    setMessage("");
    setMessageTone("info");
  };

  const save = async () => {
    // Estä tuplatallennus (sama-tick-klikkaus ennen kuin nappi ehtii disabloitua).
    if (savingRef.current) {
      return;
    }
    const parsed = bodyMeasurementSchema.safeParse({
      heightCm: "",
      weightKg: draft.weightKg,
      waistCm: draft.waistCm,
    });
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? "Tarkista mittatiedot ja yritä uudelleen.");
      setMessageTone("error");
      return;
    }

    savingRef.current = true;
    setIsSaving(true);
    try {
      const measurementInput: { heightCm?: number; weightKg?: number; waistCm?: number } = {};
      if (parsed.data.weightKg !== undefined) {
        measurementInput.weightKg = parsed.data.weightKg;
      }
      if (parsed.data.waistCm !== undefined) {
        measurementInput.waistCm = parsed.data.waistCm;
      }

      const result = await withMinimumDelay(updateCurrentUserMeasurements(measurementInput));
      setMessage(result.ok ? "Mittatiedot tallennettu." : result.message);
      setMessageTone(result.ok ? "success" : "error");
      if (result.ok) {
        isDirtyRef.current = false;
        initializedUserIdRef.current = null;
        setDraft((previous) => ({ ...previous, weightKg: "", waistCm: "" }));
        setIsSheetOpen(false);
        notify({ tone: "success", message: "Mittaus tallennettu." });
      } else {
        notify({ tone: "danger", message: result.message });
      }
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  return {
    draft,
    message,
    messageTone,
    isSaving,
    isSheetOpen,
    clearMessage,
    openSheet,
    closeSheet,
    changeWeight,
    changeWaist,
    save,
  };
}
