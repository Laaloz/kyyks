"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import { getMeasurementsForUser } from "@/lib/body-metrics";
import { withMinimumDelay } from "@/lib/min-delay";
import { canTrackOwnTraining } from "@/lib/role-access";
import { formatDate } from "@/lib/utils";
import { useAppState } from "@/providers/app-state-provider";

import { MetricTrendChart } from "@/components/workout/metric-trend-chart";
import { bodyMeasurementSchema } from "@/components/workout/schemas";

type MeasurementMessageTone = "info" | "success" | "error";

function getCompletedVolumeFromWorkout(
  workout: { id: string; status: string; completedAt?: string | null; updatedAt: string },
  session?: { completedAt?: string | null; setLogs: Array<{ done: boolean; actualReps?: number; actualLoad?: number }> },
) {
  if (workout.status !== "completed") {
    return 0;
  }

  if (!session) {
    return 0;
  }

  return session.setLogs.reduce((sum, log) => {
    if (!log.done) {
      return sum;
    }

    const reps = Math.max(0, log.actualReps ?? 0);
    const load = Math.max(0, log.actualLoad ?? 0);
    return sum + reps * load;
  }, 0);
}

export function OwnMeasurementsCard({ sectionId = "overview-measurements" }: { sectionId?: string }) {
  const { currentUser, state, updateCurrentUserMeasurements } = useAppState();
  const [measurementDraft, setMeasurementDraft] = useState({
    weightKg: "",
    waistCm: "",
  });
  const [measurementMessage, setMeasurementMessage] = useState("");
  const [measurementMessageTone, setMeasurementMessageTone] = useState<MeasurementMessageTone>("info");
  const [isSavingMeasurements, setIsSavingMeasurements] = useState(false);
  const [isMeasurementFormExpanded, setIsMeasurementFormExpanded] = useState(false);
  const [activeMeasurementTrend, setActiveMeasurementTrend] = useState<"weight" | "waist">("weight");

  useEffect(() => {
    const latestWaistValue =
      currentUser
        ? getMeasurementsForUser(state, currentUser.id).find((entry) => entry.waistCm !== undefined)?.waistCm
        : undefined;

    setMeasurementDraft({
      weightKg: currentUser?.weightKg !== undefined ? String(currentUser.weightKg) : "",
      waistCm: latestWaistValue !== undefined ? String(latestWaistValue) : "",
    });
  }, [currentUser?.id, currentUser?.weightKg, state.bodyMeasurements]);

  useEffect(() => {
    setMeasurementMessage("");
    setMeasurementMessageTone("info");
  }, [currentUser?.id]);
  useEffect(() => {
    setIsMeasurementFormExpanded(false);
    setActiveMeasurementTrend("weight");
  }, [currentUser?.id]);

  const canTrackOwnMeasurements = canTrackOwnTraining(currentUser?.role);
  const bodyMeasurements = useMemo(
    () => (currentUser ? getMeasurementsForUser(state, currentUser.id) : []),
    [currentUser, state],
  );
  const latestBodyMeasurement = bodyMeasurements[0];
  const latestWaistMeasurement = bodyMeasurements.find((entry) => entry.waistCm !== undefined);
  const latestWaistCm = latestWaistMeasurement?.waistCm;

  const parseMeasurementField = (value: string) => {
    if (!value.trim()) {
      return undefined;
    }

    const nextValue = Number(value.replace(",", "."));
    return Number.isFinite(nextValue) ? nextValue : undefined;
  };

  const nextWeightKg = parseMeasurementField(measurementDraft.weightKg);
  const nextWaistCm = parseMeasurementField(measurementDraft.waistCm);
  const isMeasurementDirty =
    Boolean(currentUser) &&
    canTrackOwnMeasurements &&
    (currentUser.weightKg !== nextWeightKg || latestWaistCm !== nextWaistCm);
  const measurementDisclosureButtonId = `${sectionId}-disclosure`;
  const measurementDisclosurePanelId = `${sectionId}-panel`;
  const sessionByWorkoutId = useMemo(
    () => new Map(state.sessions.map((session) => [session.scheduledWorkoutId, session])),
    [state.sessions],
  );
  const weightTrendPoints = useMemo(
    () =>
      currentUser
        ? bodyMeasurements
            .filter((entry) => entry.weightKg !== undefined)
            .slice(0, 12)
            .reverse()
            .map((entry) => ({
              date: entry.measuredAt,
              value: entry.weightKg as number,
            }))
        : [],
    [bodyMeasurements, currentUser],
  );

  const waistTrendPoints = useMemo(
    () =>
      currentUser
        ? bodyMeasurements
            .filter((entry) => entry.waistCm !== undefined)
            .slice(0, 12)
            .reverse()
            .map((entry) => ({
              date: entry.measuredAt,
              value: entry.waistCm as number,
            }))
        : [],
    [bodyMeasurements, currentUser],
  );
  const volumeTrendPoints = useMemo(
    () =>
      currentUser
        ? state.scheduledWorkouts
            .filter((workout) => workout.athleteId === currentUser.id && workout.status === "completed")
            .map((workout) => {
              const completedAt = workout.completedAt ?? sessionByWorkoutId.get(workout.id)?.completedAt ?? workout.updatedAt;
              return {
                date: completedAt,
                value: getCompletedVolumeFromWorkout(workout, sessionByWorkoutId.get(workout.id)),
              };
            })
            .sort((left, right) => left.date.localeCompare(right.date))
            .slice(-12)
        : [],
    [currentUser, sessionByWorkoutId, state.scheduledWorkouts],
  );

  if (!currentUser || !canTrackOwnMeasurements) {
    return null;
  }

  return (
    <Card id={sectionId} className="scroll-mt-24">
      <CardTitle>Omat mitat ja kehitys</CardTitle>
      <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 lg:grid-cols-4">
        <div>
          <p className="font-[family-name:var(--font-display)] text-xl font-semibold tabular-nums text-[var(--text)]">
            {currentUser.heightCm !== undefined ? `${currentUser.heightCm} cm` : "—"}
          </p>
          <p className="mt-0.5 text-xs font-medium text-[var(--text-subtle)]">Pituus · profiilista</p>
        </div>
        <div>
          <p className="font-[family-name:var(--font-display)] text-xl font-semibold tabular-nums text-[var(--text)]">
            {currentUser.weightKg !== undefined ? `${currentUser.weightKg} kg` : "—"}
          </p>
          <p className="mt-0.5 text-xs font-medium text-[var(--text-subtle)]">Paino</p>
        </div>
        <div>
          <p className="font-[family-name:var(--font-display)] text-xl font-semibold tabular-nums text-[var(--text)]">
            {latestWaistCm !== undefined ? `${latestWaistCm} cm` : "—"}
          </p>
          <p className="mt-0.5 text-xs font-medium text-[var(--text-subtle)]">Vyötärö</p>
        </div>
        <div>
          <p className="font-[family-name:var(--font-display)] text-xl font-semibold tabular-nums text-[var(--text)]">
            {latestBodyMeasurement ? formatDate(latestBodyMeasurement.measuredAt) : "Ei vielä"}
          </p>
          <p className="mt-0.5 text-xs font-medium text-[var(--text-subtle)]">Viimeisin mittaus</p>
        </div>
      </div>

      <div className="mt-5 border-t border-[var(--border)] pt-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            id={measurementDisclosureButtonId}
            aria-expanded={isMeasurementFormExpanded}
            aria-controls={measurementDisclosurePanelId}
            className="group min-w-0 flex-1 rounded-lg py-0 text-left text-inherit transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
            onClick={() => setIsMeasurementFormExpanded((current) => !current)}
          >
            <span className="block text-sm font-semibold text-[var(--text)]">Kirjaa uusi mittaus</span>
          </button>
          <button
            type="button"
            className="grid size-8.5 shrink-0 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--text-subtle)] transition hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
            aria-label={isMeasurementFormExpanded ? "Sulje uusi mittaus" : "Avaa uusi mittaus"}
            aria-expanded={isMeasurementFormExpanded}
            aria-controls={measurementDisclosurePanelId}
            onClick={() => setIsMeasurementFormExpanded((current) => !current)}
          >
            {isMeasurementFormExpanded ? (
              <ChevronUp className="size-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>
        {isMeasurementFormExpanded ? (
          <div
            id={measurementDisclosurePanelId}
            role="region"
            aria-labelledby={measurementDisclosureButtonId}
            className="pt-4"
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label htmlFor="overview-weight-kg">Paino (kg, valinnainen)</Label>
                <Input
                  id="overview-weight-kg"
                  type="number"
                  inputMode="decimal"
                  min={20}
                  max={350}
                  step="0.1"
                  placeholder="Esim. 72.4"
                  value={measurementDraft.weightKg}
                  onChange={(event) => {
                    setMeasurementDraft((previous) => ({ ...previous, weightKg: event.target.value }));
                    setMeasurementMessage("");
                    setMeasurementMessageTone("info");
                  }}
                />
              </div>
              <div>
                <Label htmlFor="overview-waist-cm">Vyötärö (cm, valinnainen)</Label>
                <Input
                  id="overview-waist-cm"
                  type="number"
                  inputMode="decimal"
                  min={30}
                  max={250}
                  step="0.5"
                  placeholder="Esim. 81"
                  value={measurementDraft.waistCm}
                  onChange={(event) => {
                    setMeasurementDraft((previous) => ({ ...previous, waistCm: event.target.value }));
                    setMeasurementMessage("");
                    setMeasurementMessageTone("info");
                  }}
                />
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p
                aria-live="polite"
                className={`min-h-5 text-sm ${
                  !measurementMessage
                    ? "text-[var(--text-subtle)]"
                    : measurementMessageTone === "success"
                      ? "text-[var(--success)]"
                      : measurementMessageTone === "error"
                        ? "text-[var(--danger)]"
                        : "text-[var(--text-subtle)]"
                }`}
              >
                {measurementMessage ||
                  (isMeasurementDirty
                    ? "Tallennus päivittää mittauksen ja trendin."
                    : "Täytä paino tai vyötärö tallentaaksesi uuden mittauksen.")}
              </p>
              <Button
                type="button"
                variant={isMeasurementDirty ? "primary" : "secondary"}
                disabled={!isMeasurementDirty}
                loading={isSavingMeasurements}
                loadingText="Tallennetaan mittatietoja..."
                className="w-full sm:w-auto"
                onClick={async () => {
                  const parsed = bodyMeasurementSchema.safeParse({
                    heightCm: "",
                    weightKg: measurementDraft.weightKg,
                    waistCm: measurementDraft.waistCm,
                  });

                  if (!parsed.success) {
                    setMeasurementMessage(parsed.error.issues[0]?.message ?? "Tarkista mittatiedot ja yritä uudelleen.");
                    setMeasurementMessageTone("error");
                    return;
                  }

                  setIsSavingMeasurements(true);
                  try {
                    const measurementInput: { heightCm?: number; weightKg?: number; waistCm?: number } = {};
                    if (parsed.data.heightCm !== undefined) {
                      measurementInput.heightCm = parsed.data.heightCm;
                    }
                    if (parsed.data.weightKg !== undefined) {
                      measurementInput.weightKg = parsed.data.weightKg;
                    }
                    if (parsed.data.waistCm !== undefined) {
                      measurementInput.waistCm = parsed.data.waistCm;
                    }

                    const result = await withMinimumDelay(updateCurrentUserMeasurements(measurementInput));
                    setMeasurementMessage(result.ok ? "Mittatiedot tallennettu." : result.message);
                    setMeasurementMessageTone(result.ok ? "success" : "error");
                  } finally {
                    setIsSavingMeasurements(false);
                  }
                }}
              >
                Tallenna mittatiedot
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-5 border-t border-[var(--border)] pt-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-[var(--text)]">Kehitystrendi</p>
          <div className="grid w-full grid-cols-2 rounded-xl bg-[var(--surface-2)] p-1 sm:w-auto">
            <button
              type="button"
              className={`w-full rounded-lg px-3 py-2 text-sm font-semibold transition ${
                activeMeasurementTrend === "weight"
                  ? "bg-[var(--surface)] text-[var(--text)] shadow-[0_1px_3px_var(--shadow-soft)]"
                  : "text-[var(--text-muted)]"
              }`}
              aria-pressed={activeMeasurementTrend === "weight"}
              onClick={() => setActiveMeasurementTrend("weight")}
            >
              Paino
            </button>
            <button
              type="button"
              className={`w-full rounded-lg px-3 py-2 text-sm font-semibold transition ${
                activeMeasurementTrend === "waist"
                  ? "bg-[var(--surface)] text-[var(--text)] shadow-[0_1px_3px_var(--shadow-soft)]"
                  : "text-[var(--text-muted)]"
              }`}
              aria-pressed={activeMeasurementTrend === "waist"}
              onClick={() => setActiveMeasurementTrend("waist")}
            >
              Vyötärö
            </button>
          </div>
        </div>
        <div className="mt-4">
          {activeMeasurementTrend === "weight" ? (
            <MetricTrendChart
              points={weightTrendPoints}
              ariaLabel="Painon kehitystrendi"
              emptyMessage="Lisää paino viimeisimpään mittaukseen, niin kehitystrendi alkaa piirtyä tähän."
              helperText="Alarivillä näkyy kuukausi ja vuosi, oikealla painon asteikko."
              compactHelperText="Alarivillä näkyy kuukausi ja vuosi. Tarkka arvo näkyy pisteen kohdalla."
              valueLabel="Paino"
              unit="kg"
            />
          ) : (
            <MetricTrendChart
              points={waistTrendPoints}
              ariaLabel="Vyötärön kehitystrendi"
              emptyMessage="Lisää vyötärö viimeisimpään mittaukseen, niin kehitystrendi alkaa piirtyä tähän."
              helperText="Alarivillä näkyy kuukausi ja vuosi, oikealla vyötärön asteikko."
              compactHelperText="Alarivillä näkyy kuukausi ja vuosi. Tarkka arvo näkyy pisteen kohdalla."
              valueLabel="Vyötärö"
              unit="cm"
            />
          )}
        </div>
      </div>
      <div className="mt-5 border-t border-[var(--border)] pt-4">
        <p className="text-sm font-semibold text-[var(--text)]">Treenivolyymi</p>
        <div className="mt-4">
          <MetricTrendChart
            points={volumeTrendPoints}
            ariaLabel="Volyymin kehitystrendi"
            emptyMessage="Kun saat treenejä valmiiksi, volyymitrendi näkyy tässä."
            helperText="Alarivillä näkyy kuukausi ja vuosi, oikealla volyymin asteikko."
            compactHelperText="Alarivillä näkyy kuukausi ja vuosi. Tarkka arvo näkyy pisteen kohdalla."
            valueLabel="Volyymi"
            unit="kg"
            decimals={0}
            useZeroBaseline
          />
        </div>
      </div>
    </Card>
  );
}
