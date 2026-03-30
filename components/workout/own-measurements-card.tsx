"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import { getLatestMeasurement, getMeasurementsForUser } from "@/lib/body-metrics";
import { withMinimumDelay } from "@/lib/min-delay";
import { canTrackOwnTraining } from "@/lib/role-access";
import { formatDate } from "@/lib/utils";
import { useAppState } from "@/providers/app-state-provider";

import { MetricTrendChart } from "@/components/workout/metric-trend-chart";
import { bodyMeasurementSchema } from "@/components/workout/schemas";

type MeasurementMessageTone = "info" | "success" | "error";

export function OwnMeasurementsCard() {
  const { currentUser, state, updateCurrentUserMeasurements } = useAppState();
  const [measurementDraft, setMeasurementDraft] = useState({
    weightKg: "",
    waistCm: "",
  });
  const [measurementMessage, setMeasurementMessage] = useState("");
  const [measurementMessageTone, setMeasurementMessageTone] = useState<MeasurementMessageTone>("info");
  const [isSavingMeasurements, setIsSavingMeasurements] = useState(false);

  useEffect(() => {
    setMeasurementDraft({
      weightKg: currentUser?.weightKg !== undefined ? String(currentUser.weightKg) : "",
      waistCm: currentUser?.waistCm !== undefined ? String(currentUser.waistCm) : "",
    });
  }, [currentUser?.id, currentUser?.weightKg, currentUser?.waistCm]);

  useEffect(() => {
    setMeasurementMessage("");
    setMeasurementMessageTone("info");
  }, [currentUser?.id]);

  const canTrackOwnMeasurements = canTrackOwnTraining(currentUser?.role);
  const latestBodyMeasurement = currentUser ? getLatestMeasurement(state, currentUser.id) : undefined;

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
    (currentUser.weightKg !== nextWeightKg || currentUser.waistCm !== nextWaistCm);

  const weightTrendPoints = useMemo(
    () =>
      currentUser
        ? getMeasurementsForUser(state, currentUser.id)
            .filter((entry) => entry.weightKg !== undefined)
            .slice(0, 12)
            .reverse()
            .map((entry) => ({
              date: entry.measuredAt,
              value: entry.weightKg as number,
            }))
        : [],
    [currentUser, state],
  );

  const waistTrendPoints = useMemo(
    () =>
      currentUser
        ? getMeasurementsForUser(state, currentUser.id)
            .filter((entry) => entry.waistCm !== undefined)
            .slice(0, 12)
            .reverse()
            .map((entry) => ({
              date: entry.measuredAt,
              value: entry.waistCm as number,
            }))
        : [],
    [currentUser, state],
  );

  if (!currentUser || !canTrackOwnMeasurements) {
    return null;
  }

  return (
    <Card className="border-[var(--border-strong)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Kehon seuranta</p>
          <CardTitle className="mt-2 text-2xl">Omat mitat ja kehitys</CardTitle>
          <CardDescription className="mt-2 max-w-3xl">
            Sama oma paino- ja vyötäröseuranta näkyy tässä myös coachille ja adminille. Kun kirjaat uuden mittauksen, seuranta päivittyy automaattisesti.
          </CardDescription>
        </div>
        <div className="grid w-full gap-3 sm:grid-cols-2 xl:w-auto xl:min-w-[38rem] xl:grid-cols-4">
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-2)_74%,var(--surface))] px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Pituus</p>
              <Badge className="border-[var(--border)] bg-[var(--surface)] text-[10px] text-[var(--text-subtle)]">
                Profiilissa
              </Badge>
            </div>
            <p className="mt-2 text-lg font-semibold text-[var(--text)]">
              {currentUser.heightCm !== undefined ? `${currentUser.heightCm} cm` : "Ei asetettu"}
            </p>
            <p className="mt-2 text-xs text-[var(--text-subtle)]">
              Päivitä pituus tilin profiilista. Paino ja vyötärö kirjataan alle omaan mittaseurantaan.
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
            <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Paino</p>
            <p className="mt-2 text-lg font-semibold text-[var(--text)]">
              {currentUser.weightKg !== undefined ? `${currentUser.weightKg} kg` : "Ei asetettu"}
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
            <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Vyötärö</p>
            <p className="mt-2 text-lg font-semibold text-[var(--text)]">
              {currentUser.waistCm !== undefined ? `${currentUser.waistCm} cm` : "Ei asetettu"}
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
            <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Viimeisin mittaus</p>
            <p className="mt-2 text-lg font-semibold text-[var(--text)]">
              {latestBodyMeasurement ? formatDate(latestBodyMeasurement.measuredAt) : "Ei vielä"}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
        <div className="flex flex-col gap-2">
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">Kirjaa uusi mittaus</p>
            <p className="text-sm text-[var(--text-muted)]">
              Lisää tähän uusin mittaus, kun haluat päivittää oman seurannan. Voit täyttää vain ne kentät, joihin tuli muutos.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
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
                ? "Tallennus päivittää viimeisimmän mittauksen ja trendit."
                : "Täytä yksi tai useampi kenttä, kun haluat tallentaa uuden mittauksen.")}
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
                const result = await withMinimumDelay(updateCurrentUserMeasurements(parsed.data));
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

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div>
          <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Painotrendi</p>
          <MetricTrendChart
            points={weightTrendPoints}
            ariaLabel="Painon kehitystrendi"
            emptyMessage="Lisää paino viimeisimpään mittaukseen, niin kehitystrendi alkaa piirtyä tähän."
            helperText="Alarivillä näkyy kuukausi ja vuosi, oikealla painon asteikko."
            valueLabel="Paino"
            unit="kg"
          />
        </div>
        <div>
          <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Vyötärötrendi</p>
          <MetricTrendChart
            points={waistTrendPoints}
            ariaLabel="Vyötärön kehitystrendi"
            emptyMessage="Lisää vyötärö viimeisimpään mittaukseen, niin kehitystrendi alkaa piirtyä tähän."
            helperText="Alarivillä näkyy kuukausi ja vuosi, oikealla vyötärön asteikko."
            valueLabel="Vyötärö"
            unit="cm"
          />
        </div>
      </div>
    </Card>
  );
}
