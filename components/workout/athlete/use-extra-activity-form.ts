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
    // Estä tuplatallennus: ohita jos edellinen tallennus on yhä kesken.
    if (savingRef.current) {
      return;
    }
    savingRef.current = true;
    setIsSaving(true);
    void (async () => {
      const payload = {
        activityType,
        durationMinutes: Number(durationMinutes),
        manualKcal: isManualKcalEnabled ? Number(manualKcal) : undefined,
        occurredAt: new Date(`${date}T12:00:00`).toISOString(),
        notes,
      };
      try {
        const wasEditing = Boolean(editingId);
        const result = wasEditing
          ? await updateExtraActivity(editingId!, payload)
          : await addExtraActivity(payload);
        if (result.ok) {
          notify({
            tone: "success",
            message: wasEditing ? "Extra-treeni päivitetty." : "Extra-treeni lisätty historiaan.",
          });
          setDurationMinutes("30");
          setNotes("");
          setIsManualKcalEnabled(false);
          setManualKcal("");
          setIsDialogOpen(false);
          setEditingId(null);
          // Lisäys ohjaa Historiaan (toast lupaa "lisätty historiaan", ja
          // treenin lopetus toimii samoin). Muokkaus avataan jo Historiasta,
          // joten silloin pysytään paikallaan.
          if (!wasEditing) {
            onAdded();
          }
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
