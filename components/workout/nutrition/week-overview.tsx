"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import type { MealTag } from "@/lib/types";

export type WeekDayItem = {
  id: string;
  label: string;
  kcal: number;
  mealTag: MealTag;
  eaten: boolean;
};

export type WeekDay = {
  date: string;
  weekdayLabel: string;
  dateLabel: string;
  isToday: boolean;
  kcal: number;
  items: WeekDayItem[];
};

/**
 * Viikkokatsaus: 7 päivän kcal-yhteenveto (client-aggregaatio jo ladatusta
 * day_meal_plans -datasta). Napauta päivää → sen kirjatut ateriat. Pelkkä esitys.
 */
export function WeekOverview({
  days,
  targetKcal,
  avgKcal,
}: {
  days: WeekDay[];
  targetKcal: number | null;
  avgKcal: number;
}) {
  const [openDate, setOpenDate] = useState<string | null>(null);
  const anyItems = days.some((day) => day.items.length > 0);
  const maxKcal = Math.max(targetKcal ?? 0, ...days.map((day) => day.kcal), 1);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-[family-name:var(--font-display)] text-xs font-semibold uppercase tracking-[0.05em] text-[var(--text-subtle)]">
          Viikon keskiarvo
        </p>
        <p className="font-[family-name:var(--font-display)] text-sm font-semibold tabular-nums text-[var(--text-subtle)]">
          {Math.round(avgKcal)}
          {targetKcal ? ` / ${targetKcal}` : ""} kcal
        </p>
      </div>

      {anyItems ? (
        <div className="mt-3 divide-y divide-[var(--border)]">
          {days.map((day) => {
            const isOpen = openDate === day.date;
            const pct = maxKcal > 0 ? Math.min(100, Math.round((day.kcal / maxKcal) * 100)) : 0;
            const hasItems = day.items.length > 0;
            return (
              <div key={day.date} className="py-2.5">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 text-left disabled:cursor-default"
                  disabled={!hasItems}
                  aria-expanded={isOpen}
                  onClick={() => setOpenDate(isOpen ? null : day.date)}
                >
                  <div className="w-11 shrink-0">
                    <p className={`text-sm font-bold ${day.isToday ? "text-[var(--accent)]" : "text-[var(--text)]"}`}>
                      {day.weekdayLabel}
                    </p>
                    <p className="text-xs tabular-nums text-[var(--text-subtle)]">{day.dateLabel}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
                      <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <span className="shrink-0 font-[family-name:var(--font-display)] text-sm font-semibold tabular-nums text-[var(--text)]">
                    {Math.round(day.kcal)} kcal
                  </span>
                  {hasItems ? (
                    <ChevronDown
                      className={`size-4 shrink-0 text-[var(--text-subtle)] transition ${isOpen ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                  ) : (
                    <span className="size-4 shrink-0" aria-hidden="true" />
                  )}
                </button>

                {isOpen && hasItems ? (
                  <ul className="mt-2 space-y-1 pl-[3.5rem]">
                    {day.items.map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                        <span
                          className={`min-w-0 truncate ${item.eaten ? "text-[var(--text)]" : "text-[var(--text-subtle)]"}`}
                        >
                          {item.label}
                        </span>
                        <span className="shrink-0 tabular-nums text-[var(--text-subtle)]">
                          {Math.round(item.kcal)} kcal
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 text-sm text-[var(--text-subtle)]">Ei vielä kirjauksia tältä viikolta.</p>
      )}
    </div>
  );
}
