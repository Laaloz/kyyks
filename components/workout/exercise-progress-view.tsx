"use client";

import { ChevronLeft, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { Card } from "@/components/ui/card";
import { MetricTrendChart } from "@/components/workout/metric-trend-chart";
import type { ExerciseProgressCatalog, ExerciseProgressSummary } from "@/lib/exercise-progress";
import { formatDate } from "@/lib/utils";

function formatLoad(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

// Pieni rivinsisäinen sparkline e1RM-trendistä (lista).
function MiniSparkline({ values }: { values: number[] }) {
  if (values.length < 2) {
    return <span className="block h-6 w-16" aria-hidden="true" />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 64;
  const h = 26;
  const px = (i: number) => 3 + (i / (values.length - 1)) * (w - 6);
  const py = (v: number) => 4 + (1 - (v - min) / span) * (h - 8);
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)} ${py(v).toFixed(1)}`).join(" ");
  const lastX = px(values.length - 1);
  const lastY = py(values[values.length - 1]);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block shrink-0" aria-hidden="true">
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="3.5" fill="var(--accent)" />
    </svg>
  );
}

function deltaPercent(summary: ExerciseProgressSummary): number | null {
  const pts = summary.trendPoints;
  if (pts.length < 2 || pts[0].value <= 0) {
    return null;
  }
  return ((pts[pts.length - 1].value - pts[0].value) / pts[0].value) * 100;
}

export function ExerciseProgressView({ catalog }: { catalog: ExerciseProgressCatalog }) {
  const [query, setQuery] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);

  const tracked = useMemo(
    () =>
      catalog.exercises
        .filter((option) => option.hasWeightedData)
        .filter((option) => !query.trim() || option.exerciseName.toLowerCase().includes(query.trim().toLowerCase())),
    [catalog.exercises, query],
  );

  const openSummary = openKey ? catalog.summaries.get(openKey) ?? null : null;
  if (openSummary) {
    return <ExerciseDetail summary={openSummary} onClose={() => setOpenKey(null)} />;
  }

  return (
    <div>
      <div className="flex items-center gap-2 rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
        <Search className="size-4 shrink-0 text-[var(--text-subtle)]" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Hae liikettä..."
          className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-subtle)]"
        />
      </div>

      <div className="mt-4 flex items-baseline justify-between px-1">
        <p className="font-[family-name:var(--font-display)] text-xs font-semibold uppercase tracking-[0.05em] text-[var(--text-subtle)]">
          Kehitys liikkeittäin
        </p>
        <p className="font-[family-name:var(--font-display)] text-xs font-semibold uppercase tracking-[0.05em] text-[var(--text-subtle)]">
          e1RM
        </p>
      </div>

      <Card className="mt-2">
        {tracked.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--text-subtle)]">Ei liikkeitä tällä haulla.</p>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {tracked.map((option) => {
              const summary = catalog.summaries.get(option.key);
              if (!summary) {
                return null;
              }
              const delta = deltaPercent(summary);
              const current = summary.currentEstimatedOneRepMax ?? 0;
              const latest = summary.latestSet;
              return (
                <button
                  key={option.key}
                  type="button"
                  className="flex w-full items-center gap-3 py-3 text-left"
                  onClick={() => setOpenKey(option.key)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[var(--text)]">{option.exerciseName}</span>
                    {latest ? (
                      <span className="block text-xs text-[var(--text-subtle)]">
                        {formatLoad(latest.actualLoad)} kg × {latest.actualReps}
                      </span>
                    ) : null}
                  </span>
                  <MiniSparkline values={summary.trendPoints.map((point) => point.value)} />
                  <span className="shrink-0 text-right">
                    <span className="block font-[family-name:var(--font-display)] text-base font-semibold tabular-nums text-[var(--text)]">
                      {Math.round(current)} kg
                    </span>
                    {delta !== null ? (
                      <span className={`block text-xs font-semibold tabular-nums ${delta >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
                        {delta >= 0 ? "+" : "−"}
                        {Math.abs(delta).toFixed(1)} %
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function ExerciseDetail({ summary, onClose }: { summary: ExerciseProgressSummary; onClose: () => void }) {
  const current = Math.round(summary.currentEstimatedOneRepMax ?? 0);
  const delta = deltaPercent(summary);
  const bestE1rm = summary.trendPoints.reduce((best, point) => Math.max(best, point.value), 0);
  const recent = [...summary.trendPoints].reverse().slice(0, 6);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return null;
  }

  // Drill-down = kokonäytön overlay (oma takaisin-header, peittää ala/yläpalkin).
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[var(--background)] px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+0.75rem)]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--surface)] text-[var(--text)] shadow-[0_1px_2px_var(--shadow-soft)]"
          aria-label="Takaisin liikkeisiin"
          onClick={onClose}
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
        <div className="min-w-0">
          <p className="font-[family-name:var(--font-display)] text-xs font-semibold uppercase tracking-[0.05em] text-[var(--text-subtle)]">
            Liikkeen kehitys
          </p>
          <h2 className="truncate font-[family-name:var(--font-display)] text-2xl font-bold leading-tight text-[var(--text)]">
            {summary.exerciseName}
          </h2>
        </div>
      </div>

      <Card className="mt-4">
        <div className="flex items-baseline gap-2">
          <span className="font-[family-name:var(--font-display)] text-5xl font-bold leading-none tabular-nums text-[var(--text)]">{current}</span>
          <span className="text-sm font-semibold text-[var(--text-subtle)]">kg e1RM</span>
          {delta !== null ? (
            <span className="ml-auto rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-semibold tabular-nums text-[var(--accent)]">
              {delta >= 0 ? "+" : "−"}
              {Math.abs(delta).toFixed(1)} % / 8 vko
            </span>
          ) : null}
        </div>
        <div className="mt-4">
          <MetricTrendChart
            points={summary.trendPoints.map((point) => ({ date: point.date, value: point.value }))}
            ariaLabel={`${summary.exerciseName} e1RM kehitystrendi`}
            emptyMessage="Ei vielä kuormallista toteumaa, josta e1RM voitaisiin arvioida."
            helperText="Kaavio näyttää kunkin treenikerran korkeimman e1RM-arvion."
            compactHelperText="Paina pistettä nähdäksesi treenikerran e1RM-arvion."
            valueLabel="e1RM"
            unit="kg"
          />
        </div>
        <p className="mt-3 text-xs text-[var(--text-subtle)]">
          e1RM = arvioitu yhden toiston maksimi sarjojen painosta ja toistoista — vertailukelpoinen, vaikka toistomäärät vaihtelevat.
        </p>
      </Card>

      <p className="mt-5 px-1 font-[family-name:var(--font-display)] text-xs font-semibold uppercase tracking-[0.05em] text-[var(--text-subtle)]">
        Ennätykset
      </p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <Card>
          <p className="font-[family-name:var(--font-display)] text-xl font-bold tabular-nums text-[var(--text)]">
            {summary.bestSet ? `${formatLoad(summary.bestSet.actualLoad)} kg` : "—"}
          </p>
          <p className="mt-0.5 text-xs font-semibold text-[var(--text-subtle)]">Raskain sarja</p>
        </Card>
        <Card>
          <p className="font-[family-name:var(--font-display)] text-xl font-bold tabular-nums text-[var(--text)]">{Math.round(bestE1rm)} kg</p>
          <p className="mt-0.5 text-xs font-semibold text-[var(--text-subtle)]">Paras e1RM</p>
        </Card>
      </div>

      {summary.repRecords.length > 0 ? (
        <>
          <div className="mt-5 flex items-baseline justify-between px-1">
            <p className="font-[family-name:var(--font-display)] text-xs font-semibold uppercase tracking-[0.05em] text-[var(--text-subtle)]">Toistoennätykset</p>
            <p className="font-[family-name:var(--font-display)] text-xs font-semibold uppercase tracking-[0.05em] text-[var(--text-subtle)]">Paras paino</p>
          </div>
          <Card className="mt-2">
            <div className="divide-y divide-[var(--border)]">
              {summary.repRecords.slice(0, 6).map((record) => (
                <div key={`rep-${record.reps}`} className="flex items-center gap-3 py-2.5">
                  <span className="flex-1 font-[family-name:var(--font-display)] text-sm font-semibold tabular-nums text-[var(--text)]">
                    {record.reps} {record.reps === 1 ? "toisto" : "toistoa"}
                  </span>
                  <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-xs font-semibold tabular-nums text-[var(--accent)]">
                    {formatLoad(record.weight)} kg
                  </span>
                  <span className="w-16 text-right text-xs text-[var(--text-subtle)]">{formatDate(record.completedAt)}</span>
                </div>
              ))}
            </div>
          </Card>

          <div className="mt-5 flex items-baseline justify-between px-1">
            <p className="font-[family-name:var(--font-display)] text-xs font-semibold uppercase tracking-[0.05em] text-[var(--text-subtle)]">Painoennätykset</p>
            <p className="font-[family-name:var(--font-display)] text-xs font-semibold uppercase tracking-[0.05em] text-[var(--text-subtle)]">Eniten toistoja</p>
          </div>
          <Card className="mt-2">
            <div className="divide-y divide-[var(--border)]">
              {summary.weightRecords.slice(0, 6).map((record) => (
                <div key={`weight-${record.weight}`} className="flex items-center gap-3 py-2.5">
                  <span className="flex-1 font-[family-name:var(--font-display)] text-sm font-semibold tabular-nums text-[var(--text)]">
                    {formatLoad(record.weight)} kg
                  </span>
                  <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-xs font-semibold tabular-nums text-[var(--accent)]">
                    {record.reps} {record.reps === 1 ? "toisto" : "toistoa"}
                  </span>
                  <span className="w-16 text-right text-xs text-[var(--text-subtle)]">{formatDate(record.completedAt)}</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      ) : null}

      <p className="mt-5 px-1 font-[family-name:var(--font-display)] text-xs font-semibold uppercase tracking-[0.05em] text-[var(--text-subtle)]">
        Viimeisimmät toteutukset
      </p>
      <Card className="mt-2">
        <div className="divide-y divide-[var(--border)]">
          {recent.map((point) => (
            <div key={`${point.scheduledWorkoutId}-${point.completedAt}`} className="flex items-center gap-3 py-2.5">
              <span className="flex-1">
                <span className="block font-[family-name:var(--font-display)] text-sm font-semibold tabular-nums text-[var(--text)]">
                  {formatLoad(point.actualLoad)} kg × {point.actualReps}
                </span>
                <span className="block text-xs text-[var(--text-subtle)]">{formatDate(point.completedAt)}</span>
              </span>
              <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-0.5 text-xs font-semibold tabular-nums text-[var(--text-muted)]">
                e1RM {Math.round(point.value)} kg
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>,
    document.body,
  );
}
