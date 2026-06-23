"use client";

import { ChevronRight } from "lucide-react";

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
 * day_meal_plans -datasta). Napauta päivää → avautuu sen päivän muokkaus
 * Päivä-välilehdellä (onSelectDay). Myös tyhjät päivät ovat napautettavissa,
 * jotta menneelle päivälle voi lisätä aterioita jälkikäteen.
 */
export function WeekOverview({
  days,
  targetKcal,
  avgKcal,
  onSelectDay,
}: {
  days: WeekDay[];
  targetKcal: number | null;
  avgKcal: number;
  onSelectDay: (date: string) => void;
}) {
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

      <div className="mt-3 divide-y divide-[var(--border)]">
        {days.map((day) => {
          const pct = maxKcal > 0 ? Math.min(100, Math.round((day.kcal / maxKcal) * 100)) : 0;
          const hasItems = day.items.length > 0;
          return (
            <button
              key={day.date}
              type="button"
              className="flex w-full items-center gap-3 py-2.5 text-left transition hover:opacity-80"
              aria-label={`Muokkaa päivää ${day.dateLabel}`}
              onClick={() => onSelectDay(day.date)}
            >
              <div className="w-11 shrink-0">
                <p className={`text-sm font-bold ${day.isToday ? "text-[var(--accent)]" : "text-[var(--text)]"}`}>
                  {day.weekdayLabel}
                </p>
                <p className="text-xs tabular-nums text-[var(--text-subtle)]">{day.dateLabel}</p>
              </div>
              <div className="min-w-0 flex-1">
                {hasItems ? (
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
                    <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
                  </div>
                ) : (
                  <span className="text-xs text-[var(--text-subtle)]">Ei kirjauksia</span>
                )}
              </div>
              <span className="shrink-0 font-[family-name:var(--font-display)] text-sm font-semibold tabular-nums text-[var(--text)]">
                {hasItems ? `${Math.round(day.kcal)} kcal` : ""}
              </span>
              <ChevronRight className="size-4 shrink-0 text-[var(--text-subtle)]" aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
