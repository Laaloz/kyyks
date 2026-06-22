"use client";

import { useEffect, useRef, useState } from "react";

import { toLocalDateKey } from "@/components/workout/athlete/dashboard-format";
import { estimateExtraActivityKcal } from "@/lib/extra-activities";
import type { ExtraActivityType } from "@/lib/types";
import { useAppState } from "@/providers/app-state-provider";

// Extra-treenin lisäysdialogin lomaketila + tallennus. Navigointi (lisäyksen
// jälkeen Historiaan) annetaan onAdded-takaisinkutsuna, koska se koskee
// athlete-dashboardin omaa välilehtitilaa. Historian inline-muokkaus
// (extraEditDraft) on erillinen mekanismi, EI tämä.
export function useExtraActivityForm({
  currentUserId,
  weightKg,
  onAdded,
}: {
  currentUserId: string | undefined;
  weightKg: number | undefined;
  onAdded: () => void;
}) {
  const { addExtraActivity, updateExtraActivity, notify } = useAppState();

  const [activityType, setActivityType] = useState<ExtraActivityType>("run");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [date, setDate] = useState(() => toLocalDateKey(new Date()));
  const [notes, setNotes] = useState("");
  const [isManualKcalEnabled, setIsManualKcalEnabled] = useState(false);
  const [manualKcal, setManualKcal] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    setActivityType("run");
    setDurationMinutes("30");
    setDate(toLocalDateKey(new Date()));
    setNotes("");
    setIsManualKcalEnabled(false);
    setManualKcal("");
  }, [currentUserId]);

  const durationValue = Number(durationMinutes);
  const estimatedKcalPreview =
    Number.isFinite(durationValue) && durationValue > 0
      ? estimateExtraActivityKcal({ activityType, durationMinutes: durationValue, weightKg })
      : 0;

  const open = () => {
    setEditingId(null);
    setIsDialogOpen(true);
  };

  const close = () => {
    setIsDialogOpen(false);
    setEditingId(null);
  };

  const submit = () => {
    const payload = {
      activityType,
      durationMinutes: Number(durationMinutes),
      manualKcal: isManualKcalEnabled ? Number(manualKcal) : undefined,
      occurredAt: new Date(`${date}T12:00:00`).toISOString(),
      notes,
    };

    if (!editingId) {
      // Välitön lisäys: sulje dialogi + ohjaa Historiaan heti (addExtraActivity
      // tekee optimistisen insertin, joka näkyy saman tien) ja aja POST taustalla.
      // Epäonnistuessa provider rollbackaa rivin ja näytetään virhetoast.
      setDurationMinutes("30");
      setNotes("");
      setIsManualKcalEnabled(false);
      setManualKcal("");
      setIsDialogOpen(false);
      onAdded();
      void (async () => {
        const result = await addExtraActivity(payload);
        notify(
          result.ok
            ? { tone: "success", message: "Extra-treeni lisätty historiaan." }
            : { tone: "danger", message: result.message },
        );
      })();
      return;
    }

    // Muokkaus avataan Historiasta: odota palvelinvahvistus, jotta dialogi jää
    // virhetilanteessa auki uudelleenyritystä varten. Estä myös tuplatallennus.
    if (savingRef.current) {
      return;
    }
    savingRef.current = true;
    setIsSaving(true);
    void (async () => {
      try {
        const result = await updateExtraActivity(editingId, payload);
        if (result.ok) {
          notify({ tone: "success", message: "Extra-treeni päivitetty." });
          setDurationMinutes("30");
          setNotes("");
          setIsManualKcalEnabled(false);
          setManualKcal("");
          setIsDialogOpen(false);
          setEditingId(null);
        } else {
          notify({ tone: "danger", message: result.message });
        }
      } finally {
        savingRef.current = false;
        setIsSaving(false);
      }
    })();
  };

  return {
    activityType,
    setActivityType,
    durationMinutes,
    setDurationMinutes,
    date,
    setDate,
    notes,
    setNotes,
    isManualKcalEnabled,
    setIsManualKcalEnabled,
    manualKcal,
    setManualKcal,
    isSaving,
    isDialogOpen,
    open,
    close,
    estimatedKcalPreview,
    submit,
  };
}
