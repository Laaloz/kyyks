"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription } from "@/components/ui/card";
import { ProgramEditorOverlay } from "@/components/workout/coach/program-editor-overlay";
import { getProgramStatus, isProgramActive } from "@/lib/program-status";
import type { Exercise, ProgramWorkoutInput, TrainingPlan, UserProfile } from "@/lib/types";
import { useAppState } from "@/providers/app-state-provider";

// Pieni paikallinen apuri (sama logiikka kuin CoachTeamView'ssa) — vältetään
// jättikomponentin sisäisen funktion exporttaaminen.
function programWeekLabel(plan: TrainingPlan, reference: Date = new Date()): string | null {
  if (!plan.weekCount || plan.weekCount < 1) {
    return null;
  }
  const start = new Date(plan.startDate);
  start.setHours(0, 0, 0, 0);
  const today = new Date(reference);
  today.setHours(0, 0, 0, 0);
  const elapsedWeeks = Math.floor((today.getTime() - start.getTime()) / (7 * 86_400_000)) + 1;
  const current = Math.min(Math.max(1, elapsedWeeks), plan.weekCount);
  return `viikko ${current}/${plan.weekCount}`;
}

/**
 * Jaettu ohjelmien hallintapaneeli (lista + ProgramEditorOverlay). Sama uusi
 * editori kuin valmentajalla/adminilla; `selfAssignOnly` piilottaa urheilija-
 * valinnan itsenäiselle treenaajalle (ohjelma kohdistuu aina häneen itseensä).
 */
export function ProgramsPanel({
  programs,
  athletes,
  exercises,
  currentUser,
  selfAssignOnly = false,
}: {
  programs: TrainingPlan[];
  athletes: Array<{ id: string; fullName: string }>;
  exercises: Exercise[];
  currentUser: UserProfile;
  selfAssignOnly?: boolean;
}) {
  const { state, createProgram, updateProgram, setProgramStatus, deleteProgram, notify } = useAppState();
  const [editorGroup, setEditorGroup] = useState<TrainingPlan[] | null>(null);

  // Editorin urheilijavalinnat: itse + valmennettavat.
  const programTargets = useMemo(
    () => [{ id: currentUser.id, fullName: currentUser.fullName }, ...athletes.filter((a) => a.id !== currentUser.id)],
    [athletes, currentUser.fullName, currentUser.id],
  );

  const userNameById = useMemo(() => new Map(state.users.map((user) => [user.id, user.fullName])), [state.users]);

  // Saman program_group_id:n rivit = yksi ohjelma (mahdollisesti monelle urheilijalle).
  const programRows = useMemo(() => {
    const activePlans = programs.filter((plan) => isProgramActive(plan));
    const groups = new Map<string, TrainingPlan[]>();
    activePlans.forEach((plan) => {
      const key = plan.programGroupId ?? plan.id;
      groups.set(key, [...(groups.get(key) ?? []), plan]);
    });

    return Array.from(groups.values()).map((groupPlans) => {
      const base = groupPlans[0];
      const assignedNames = groupPlans.map((plan) =>
        plan.athleteId === currentUser.id ? "Sinä" : (userNameById.get(plan.athleteId) ?? "?").split(/\s+/)[0],
      );
      return {
        key: base.programGroupId ?? base.id,
        groupPlans,
        title: base.title,
        weekLabel: programWeekLabel(base),
        workoutCount: base.workouts?.length ?? 0,
        assignedLabel: assignedNames.length ? assignedNames.join(", ") : "Ei urheilijoita",
      };
    });
  }, [currentUser.id, programs, userNameById]);

  const handleSaveProgram = async ({
    groupId,
    title,
    weekCount,
    workouts,
    assignedAthleteIds,
    groupPlans,
  }: {
    groupId: string;
    title: string;
    weekCount: number;
    workouts: ProgramWorkoutInput[];
    assignedAthleteIds: string[];
    groupPlans: TrainingPlan[];
  }): Promise<{ ok: boolean; message?: string }> => {
    const selected = new Set(assignedAthleteIds);
    const planByAthlete = new Map(groupPlans.map((plan) => [plan.athleteId, plan]));

    for (const athleteId of assignedAthleteIds) {
      const existing = planByAthlete.get(athleteId);
      const result = existing
        ? await updateProgram(existing.id, { title, workouts, programGroupId: groupId, weekCount })
        : await createProgram({ title, athleteId, workouts, programGroupId: groupId, weekCount });
      if (!result.ok) {
        return result;
      }
    }

    for (const plan of groupPlans) {
      if (!selected.has(plan.athleteId)) {
        const result = await setProgramStatus(plan.id, "removed");
        if (!result.ok) {
          return result;
        }
      }
    }

    notify({ tone: "success", message: `Ohjelma "${title}" tallennettiin.` });
    return { ok: true };
  };

  // Ohjelmaryhmä voi kattaa monta urheilijariviä → toiminto ajetaan jokaiselle.
  const handleArchiveEditorProgram = async (): Promise<{ ok: boolean; message?: string }> => {
    const target = editorGroup;
    if (!target?.length) {
      return { ok: false, message: "Ohjelmaa ei löytynyt." };
    }
    for (const plan of target) {
      const result = await setProgramStatus(plan.id, "archived");
      if (!result.ok) {
        return result;
      }
    }
    notify({ tone: "success", message: `Ohjelma "${target[0].title}" arkistoitiin aiempiin ohjelmiin.` });
    return { ok: true };
  };

  const handleDeleteEditorProgram = async (): Promise<{ ok: boolean; message?: string }> => {
    const target = editorGroup;
    if (!target?.length) {
      return { ok: false, message: "Ohjelmaa ei löytynyt." };
    }
    for (const plan of target) {
      const result = await deleteProgram(plan.id);
      if (!result.ok) {
        return result;
      }
    }
    notify({ tone: "success", message: `Ohjelma "${target[0].title}" poistettiin näkyvistä.` });
    return { ok: true };
  };

  // Vain arkistoituja varten näytetään pieni huomautus, jotta tila ei katoa kokonaan.
  const archivedCount = useMemo(
    () => programs.filter((plan) => getProgramStatus(plan) === "archived").length,
    [programs],
  );

  return (
    <div>
      <div className="mb-2 mt-0 flex items-baseline justify-between gap-3 px-1">
        <span className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-subtle)]">Aktiiviset ohjelmat</span>
      </div>
      {programRows.length ? (
        <Card className="divide-y divide-[var(--border)] p-0">
          {programRows.map(({ key, groupPlans, title, weekLabel, workoutCount, assignedLabel }) => (
            <button
              key={key}
              type="button"
              className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
              aria-label={`Muokkaa: ${title}`}
              onClick={() => setEditorGroup(groupPlans)}
            >
              <div className="min-w-0">
                <p className="truncate font-[family-name:var(--font-display)] text-[15.5px] font-bold text-[var(--text)]">
                  {title}
                  {weekLabel ? <span className="text-[var(--text-subtle)]"> · {weekLabel}</span> : null}
                </p>
                <p className="truncate text-[12.5px] text-[var(--text-subtle)]">
                  {workoutCount} treeniä/vko{selfAssignOnly ? "" : ` · ${assignedLabel}`}
                </p>
              </div>
              <Badge className="shrink-0">Muokkaa</Badge>
            </button>
          ))}
        </Card>
      ) : (
        <Card>
          <CardDescription>Ei vielä aktiivisia ohjelmia. Luo ensimmäinen ohjelma alta.</CardDescription>
        </Card>
      )}
      <Button type="button" variant="secondary" className="mt-3 w-full gap-2" onClick={() => setEditorGroup([])}>
        <Plus className="size-4" aria-hidden="true" />
        Uusi ohjelma
      </Button>
      <p className="mx-1 mt-3 text-[13px] text-pretty text-[var(--text-subtle)]">
        {selfAssignOnly
          ? "Rakenna oma ohjelmasi — muutokset näkyvät treeneissäsi heti."
          : "Ohjelmia voi luoda ja muokata suoraan mobiilissa — muutokset näkyvät urheilijoille heti."}
        {archivedCount > 0 ? ` Arkistoituja ohjelmia: ${archivedCount}.` : ""}
      </p>

      {editorGroup ? (
        <ProgramEditorOverlay
          groupPlans={editorGroup}
          athletes={programTargets}
          exercises={exercises}
          currentUserId={currentUser.id}
          selfAssignOnly={selfAssignOnly}
          onClose={() => setEditorGroup(null)}
          onSave={handleSaveProgram}
          onArchive={handleArchiveEditorProgram}
          onDelete={handleDeleteEditorProgram}
        />
      ) : null}
    </div>
  );
}
