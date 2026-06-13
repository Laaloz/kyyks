"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { buildPersonalNutritionGoalComparison, getMissingMacroProfileFields } from "@/lib/nutrition";
import type { AppState, NutritionGoal, UserProfile } from "@/lib/types";

const goalLabel: Record<NutritionGoal, string> = {
  lose: "Pudotus",
  maintain: "Ylläpito",
  gain: "Kasvatus",
};

const missingFieldLabel: Record<"age" | "sex" | "heightCm" | "weightKg", string> = {
  age: "ikä",
  sex: "sukupuoli",
  heightCm: "pituus",
  weightKg: "paino",
};

function formatMacroValue(value: number) {
  return new Intl.NumberFormat("fi-FI", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatRoundedCalories(value: number) {
  return new Intl.NumberFormat("fi-FI", {
    maximumFractionDigits: 0,
  }).format(Math.round(value / 50) * 50);
}

export function PersonalNutritionSummaryCard({
  state,
  user,
  onOpenSettings,
  onSelectGoal,
}: {
  state: AppState;
  user: UserProfile;
  onOpenSettings?: () => void;
  onSelectGoal?: (goal: NutritionGoal) => Promise<boolean> | boolean;
}) {
  const nutritionProfile = state.nutritionProfiles.find((profile) => profile.userId === user.id) ?? null;
  const comparison = buildPersonalNutritionGoalComparison(user, nutritionProfile);
  const missingFields = getMissingMacroProfileFields(user);
  const [isUpdatingGoal, setIsUpdatingGoal] = useState(false);

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <CardTitle>Päivän energiasuositus</CardTitle>
        {comparison ? (
          <span className="shrink-0 text-sm font-semibold text-[var(--accent)]">{goalLabel[comparison.activeGoal]}</span>
        ) : null}
      </div>

      {comparison ? (
        <>
          <div className="mt-4">
            <p className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-none tabular-nums text-[var(--text)]">
              {formatRoundedCalories(comparison.activeTarget.kcal)}
            </p>
            <p className="mt-1.5 text-sm text-[var(--text-muted)]">
              kcal / päivä ·{" "}
              {comparison.activeTargetSource === "profile"
                ? "tallennettu tavoitteesi"
                : "arvio profiilitiedoista"}
            </p>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div>
              <p className="font-[family-name:var(--font-display)] text-lg font-semibold tabular-nums text-[var(--text)]">
                {formatMacroValue(comparison.activeTarget.proteinG)} g
              </p>
              <p className="mt-0.5 text-xs font-medium text-[var(--text-subtle)]">Proteiini</p>
            </div>
            <div>
              <p className="font-[family-name:var(--font-display)] text-lg font-semibold tabular-nums text-[var(--text)]">
                {formatMacroValue(comparison.activeTarget.carbsG)} g
              </p>
              <p className="mt-0.5 text-xs font-medium text-[var(--text-subtle)]">Hiilihydraatti</p>
            </div>
            <div>
              <p className="font-[family-name:var(--font-display)] text-lg font-semibold tabular-nums text-[var(--text)]">
                {formatMacroValue(comparison.activeTarget.fatG)} g
              </p>
              <p className="mt-0.5 text-xs font-medium text-[var(--text-subtle)]">Rasva</p>
            </div>
          </div>

          {!comparison.hasCompleteProfile ? (
            <div className="mt-4 rounded-2xl bg-[color-mix(in_srgb,var(--warning)_10%,var(--surface))] p-4">
              <p className="text-sm font-semibold text-[var(--text)]">Täydennä tiedot tarkempia tuloksia varten</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Suositukset tarkentuvat, kun lisäät puuttuvat tiedot: {comparison.missingFields.map((field) => missingFieldLabel[field]).join(", ")}.
              </p>
              {onOpenSettings ? (
                <div className="mt-3">
                  <Button type="button" variant="secondary" onClick={onOpenSettings}>
                    Täydennä tiedot profiiliin
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {comparison.comparisonTargets ? (
            <details className="group mt-4 border-t border-[var(--border)] pt-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-left">
                <p className="text-sm font-semibold text-[var(--text)]">Vertaile tavoitteita</p>
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--text-subtle)] transition group-open:rotate-180">
                  <ChevronDown className="size-4" aria-hidden="true" />
                </span>
              </summary>

              <div className="mt-3 divide-y divide-[var(--border)]">
                {(["lose", "maintain", "gain"] as NutritionGoal[]).map((goal) => {
                  const target = comparison.comparisonTargets![goal];
                  const isActive = comparison.activeGoal === goal;

                  return (
                    <div key={goal} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-[var(--text)]">{goalLabel[goal]}</p>
                          {isActive ? (
                            <span className="text-xs font-semibold text-[var(--accent)]">Nykyinen</span>
                          ) : null}
                        </div>
                        <p className="mt-1 font-[family-name:var(--font-display)] text-xl font-semibold leading-none tabular-nums text-[var(--text)]">
                          {formatRoundedCalories(target.kcal)}
                          <span className="ml-1.5 text-xs font-medium text-[var(--text-muted)]">kcal</span>
                        </p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          P {formatMacroValue(target.proteinG)} · H {formatMacroValue(target.carbsG)} · R {formatMacroValue(target.fatG)} g
                        </p>
                      </div>
                      {!isActive && onSelectGoal ? (
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-8 shrink-0 px-3 text-xs"
                          disabled={isUpdatingGoal}
                          onClick={async () => {
                            setIsUpdatingGoal(true);
                            try {
                              await onSelectGoal(goal);
                            } finally {
                              setIsUpdatingGoal(false);
                            }
                          }}
                        >
                          Aseta
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </details>
          ) : null}
        </>
      ) : (
        <div className="mt-4 rounded-2xl bg-[color-mix(in_srgb,var(--warning)_10%,var(--surface))] p-4">
          <p className="text-sm font-semibold text-[var(--text)]">Täydennä tiedot tarkempia tuloksia varten</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Lisää profiiliin ikä, sukupuoli, pituus ja paino, jotta järjestelmä voi laskea henkilökohtaiset kalorisuositukset.
          </p>
          {missingFields.length > 0 ? (
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Puuttuu: {missingFields.map((field) => missingFieldLabel[field]).join(", ")}.
            </p>
          ) : null}
          {onOpenSettings ? (
            <div className="mt-3">
              <Button type="button" variant="secondary" onClick={onOpenSettings}>
                Täydennä tiedot profiiliin
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}
