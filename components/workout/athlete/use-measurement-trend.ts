"use client";

import { useEffect, useMemo, useState } from "react";

import { getMeasurementsForUser } from "@/lib/body-metrics";

// Keho-mittausten trendinäyttö: paino/vyötärö-valinta, aikaväli (3 kk / 1 v /
// kaikki) ja niistä johdetut kaavio-/listadatat. Puhdasta johdettua tilaa
// bodyMeasurements-listasta — ei mittauslomakkeen tallennus-/esitäyttölogiikkaa.
export function useMeasurementTrend({
  bodyMeasurements,
  currentUserId,
  currentWeightKg,
  latestWaistCm,
}: {
  bodyMeasurements: ReturnType<typeof getMeasurementsForUser>;
  currentUserId: string | undefined;
  currentWeightKg: number | undefined;
  latestWaistCm: number | undefined;
}) {
  const [trend, setTrend] = useState<"weight" | "waist">("weight");
  const [range, setRange] = useState<"3m" | "1y" | "all">("3m");
  const [showAllEntries, setShowAllEntries] = useState(false);

  useEffect(() => {
    setTrend("weight");
  }, [currentUserId]);

  const unit = trend === "weight" ? "kg" : "cm";
  // Koko historia uusin ensin (lista) ja erikseen vanhin→uusin (kaavio).
  const entries = useMemo(
    () => bodyMeasurements.filter((entry) => (trend === "weight" ? entry.weightKg : entry.waistCm) !== undefined),
    [bodyMeasurements, trend],
  );
  const series = useMemo(
    () =>
      [...entries]
        .reverse()
        .map((entry) => ({
          date: entry.measuredAt,
          value: (trend === "weight" ? entry.weightKg : entry.waistCm) as number,
        })),
    [entries, trend],
  );
  const currentValue =
    series.length > 0
      ? series[series.length - 1]!.value
      : trend === "weight"
        ? currentWeightKg
        : latestWaistCm;
  // Aikavälivalitsin (3 kk / 1 v / kaikki) rajaa kaavion ja muutospillerin.
  const points = useMemo(() => {
    if (range === "all") {
      return series;
    }
    const days = range === "3m" ? 90 : 365;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const windowed = series.filter((point) => Date.parse(point.date) >= cutoff);
    return windowed.length >= 2 ? windowed : series.slice(-2);
  }, [series, range]);
  const delta =
    points.length >= 2 ? points[points.length - 1]!.value - points[0]!.value : null;
  const weeks =
    points.length >= 2
      ? Math.max(
          1,
          Math.round(
            (Date.parse(points[points.length - 1]!.date) - Date.parse(points[0]!.date)) /
              (7 * 24 * 60 * 60 * 1000),
          ),
        )
      : null;
  const visibleEntries = showAllEntries ? entries : entries.slice(0, 12);

  return {
    trend,
    setTrend,
    range,
    setRange,
    showAllEntries,
    setShowAllEntries,
    unit,
    entries,
    currentValue,
    points,
    delta,
    weeks,
    visibleEntries,
  };
}
