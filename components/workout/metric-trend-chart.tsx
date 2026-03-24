"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type MetricTrendPoint = {
  date: string;
  value: number;
};

type MetricTrendChartProps = {
  points: MetricTrendPoint[];
  ariaLabel: string;
  emptyMessage: string;
  helperText?: string;
  valueLabel: string;
  unit: string;
  decimals?: number;
  useZeroBaseline?: boolean;
};

const monthYearFormatter = new Intl.DateTimeFormat("fi-FI", {
  month: "short",
  year: "2-digit",
});

const fullDateFormatter = new Intl.DateTimeFormat("fi-FI", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatMetricValue(value: number, decimals: number) {
  const normalizedDecimals = Number.isInteger(value) ? 0 : decimals;
  return new Intl.NumberFormat("fi-FI", {
    minimumFractionDigits: normalizedDecimals,
    maximumFractionDigits: normalizedDecimals,
  }).format(value);
}

export function MetricTrendChart({
  points,
  ariaLabel,
  emptyMessage,
  helperText,
  valueLabel,
  unit,
  decimals = 1,
  useZeroBaseline = false,
}: MetricTrendChartProps) {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const [chartSize, setChartSize] = useState({ width: 0, height: 0 });
  const chartData = useMemo(
    () =>
      points
        .map((point) => ({
          ...point,
          timestamp: new Date(point.date).getTime(),
        }))
        .filter((point) => Number.isFinite(point.timestamp))
        .sort((a, b) => a.timestamp - b.timestamp),
    [points],
  );

  const xDomain = useMemo<[number, number]>(() => {
    if (chartData.length === 0) {
      const now = Date.now();
      return [now - 86_400_000, now + 86_400_000];
    }

    if (chartData.length === 1) {
      const only = chartData[0]?.timestamp ?? Date.now();
      return [only - 86_400_000, only + 86_400_000];
    }

    return [chartData[0]!.timestamp, chartData[chartData.length - 1]!.timestamp];
  }, [chartData]);

  const yDomain = useMemo<[number, number]>(() => {
    if (chartData.length === 0) {
      return [0, 1];
    }

    const values = chartData.map((point) => point.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);

    if (useZeroBaseline) {
      const paddedMax = maxValue <= 0 ? 1 : maxValue * 1.1;
      return [0, paddedMax];
    }

    const range = maxValue - minValue;
    const padding = range === 0 ? Math.max(1, Math.abs(maxValue) * 0.04 || 1) : range * 0.14;
    return [Math.max(0, minValue - padding), maxValue + padding];
  }, [chartData, useZeroBaseline]);

  useEffect(() => {
    const node = chartContainerRef.current;
    if (!node) {
      return;
    }

    const updateSize = () => {
      setChartSize({
        width: Math.max(0, node.clientWidth),
        height: Math.max(0, node.clientHeight),
      });
    };

    updateSize();

    const resizeObserver = new ResizeObserver(() => {
      updateSize();
    });

    resizeObserver.observe(node);
    return () => resizeObserver.disconnect();
  }, []);

  if (chartData.length === 0) {
    return <p className="mt-3 text-sm text-[var(--text-muted)]">{emptyMessage}</p>;
  }

  return (
    <div className="mt-3 min-w-0" role="img" aria-label={ariaLabel}>
      <div className="h-60 min-h-[15rem] min-w-0 w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <div ref={chartContainerRef} className="h-full min-w-0 w-full">
          {chartSize.width > 0 && chartSize.height > 0 ? (
            <LineChart
              width={chartSize.width}
              height={chartSize.height}
              data={chartData}
              margin={{ top: 8, right: 8, bottom: 12, left: 4 }}
            >
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                type="number"
                dataKey="timestamp"
                domain={xDomain}
                scale="time"
                tickFormatter={(value) => monthYearFormatter.format(new Date(value))}
                tick={{ fill: "var(--text-subtle)", fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
                tickMargin={10}
                minTickGap={24}
              />
              <YAxis
                orientation="right"
                domain={yDomain}
                tickFormatter={(value) => formatMetricValue(value, decimals)}
                tick={{ fill: "var(--text-subtle)", fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={56}
              />
              <Tooltip
                cursor={{ stroke: "var(--border-strong)", strokeDasharray: "4 4" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) {
                    return null;
                  }

                  const current = payload[0]?.payload as
                    | { date: string; value: number }
                    | undefined;
                  if (!current) {
                    return null;
                  }

                  return (
                    <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 shadow-[0_10px_30px_-18px_var(--shadow)]">
                      <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">
                        {fullDateFormatter.format(new Date(current.date))}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-[var(--text)]">
                        {valueLabel} {formatMetricValue(current.value, decimals)} {unit}
                      </p>
                    </div>
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--accent)"
                strokeWidth={3}
                dot={{ r: 3, strokeWidth: 2, fill: "var(--surface)" }}
                activeDot={{ r: 5, strokeWidth: 2, fill: "var(--surface)" }}
              />
            </LineChart>
          ) : null}
        </div>
      </div>
      {helperText ? (
        <p className="mt-2 text-xs text-[var(--text-subtle)]">{helperText}</p>
      ) : null}
    </div>
  );
}
