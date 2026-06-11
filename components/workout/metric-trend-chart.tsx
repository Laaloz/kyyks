"use client";

import dynamic from "next/dynamic";

import type { MetricTrendChartProps } from "@/components/workout/metric-trend-chart-view";

function MetricTrendChartSkeleton() {
  return (
    <div className="mt-3 min-w-0 max-w-full" aria-hidden="true">
      <div className="h-60 min-h-[15rem] w-full animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--surface-2)]" />
    </div>
  );
}

// Recharts is by far the heaviest client dependency; loading it on demand keeps
// it out of the initial bundle for views that never show a chart.
export const MetricTrendChart = dynamic<MetricTrendChartProps>(
  () =>
    import("@/components/workout/metric-trend-chart-view").then(
      (module) => module.MetricTrendChartView,
    ),
  {
    ssr: false,
    loading: () => <MetricTrendChartSkeleton />,
  },
);
