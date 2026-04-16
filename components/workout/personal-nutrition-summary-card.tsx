"use client";

import { ChevronDown } from "lucide-react";

import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
}: {
  state: AppState;
  user: UserProfile;
  onOpenSettings?: () => void;
}) {
  const nutritionProfile = state.nutritionProfiles.find((profile) => profile.userId === user.id) ?? null;
  const comparison = buildPersonalNutritionGoalComparison(user, nutritionProfile);
  const missingFields = getMissingMacroProfileFields(user);

  return (
    <Card className="border-[var(--border-strong)]">
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Henkilökohtainen ravinto</p>
            <CardTitle className="mt-2 text-balance text-2xl leading-tight">Päivän energiasuositus</CardTitle>
            <CardDescription className="mt-2 max-w-3xl">
              Näet profiiliin tallennetun tavoitteen sekä vertailun pudotus-, ylläpito- ja kasvatusvaiheisiin omien tietojesi perusteella.
            </CardDescription>
          </div>
          {comparison ? (
            <Badge className="border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] text-[var(--accent)]">
              Profiilitavoite: {goalLabel[comparison.activeGoal]}
            </Badge>
          ) : null}
        </div>

        {comparison ? (
          <>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Profiilitavoite</p>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-lg font-semibold text-[var(--text)]">{goalLabel[comparison.activeGoal]}</p>
                  <p className="mt-1 font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--text)]">
                    {formatRoundedCalories(comparison.activeTarget.kcal)}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">kcal / päivä</p>
                </div>
              </div>
              <p className="mt-3 text-sm text-[var(--text-muted)]">
                {comparison.activeTargetSource === "profile"
                  ? "Tämä on nykyinen tallennettu ravintotavoitteesi."
                  : "Tämä on tällä hetkellä automaattisesti arvioitu ylläpitotavoite tietojesi perusteella."}
              </p>
              {comparison.isEstimate ? (
                <p className="mt-2 text-sm text-[var(--text-subtle)]">
                  Alla olevat vaihtoehdot ovat suuntaa-antavia arvioita, joita kannattaa tarkentaa seurannan ja omien tietojen perusteella.
                </p>
              ) : null}
            </div>

            <details className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 text-left">
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">Näytä tarkemmat suositukset</p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    Makrot, vaihevertailu ja lisätiedot löytyvät täältä tarvittaessa.
                  </p>
                </div>
                <span className="grid size-10 shrink-0 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-subtle)] transition group-open:rotate-180">
                  <ChevronDown className="size-4" aria-hidden="true" />
                </span>
              </summary>

              <div className="border-t border-[var(--border)] px-4 py-4">
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">Makrot nykyiselle tavoitteelle</p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-3">
                      <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">P</p>
                      <p className="mt-1 font-medium text-[var(--text)]">{formatMacroValue(comparison.activeTarget.proteinG)} g</p>
                    </div>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-3">
                      <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">H</p>
                      <p className="mt-1 font-medium text-[var(--text)]">{formatMacroValue(comparison.activeTarget.carbsG)} g</p>
                    </div>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-3">
                      <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">R</p>
                      <p className="mt-1 font-medium text-[var(--text)]">{formatMacroValue(comparison.activeTarget.fatG)} g</p>
                    </div>
                  </div>
                </div>

                {!comparison.hasCompleteProfile ? (
                  <div className="mt-4 rounded-2xl border border-[color-mix(in_srgb,var(--warning)_35%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_8%,var(--surface))] p-4">
                    <p className="text-sm font-semibold text-[var(--text)]">Täydennä tiedot tarkempia tuloksia varten</p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      Suositukset tarkentuvat, kun lisäät puuttuvat tiedot profiiliin.
                    </p>
                    <p className="mt-2 text-sm text-[var(--text-muted)]">
                      Puuttuu: {comparison.missingFields.map((field) => missingFieldLabel[field]).join(", ")}.
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
                  <div className="mt-4">
                    <p className="text-sm font-semibold text-[var(--text)]">Suositukset eri vaiheisiin</p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      Vertaa helposti miten päivän energia ja makrot muuttuvat eri tavoitteissa.
                    </p>
                    <div className="mt-4 grid gap-3">
                      {(["lose", "maintain", "gain"] as NutritionGoal[]).map((goal) => {
                        const target = comparison.comparisonTargets![goal];
                        const isActive = comparison.activeGoal === goal;

                        return (
                          <div
                            key={goal}
                            className={`rounded-2xl border p-4 ${
                              isActive
                                ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] shadow-[0_0_0_1px_var(--accent)]"
                                : "border-[var(--border)] bg-[var(--surface)]"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-[var(--text)]">{goalLabel[goal]}</p>
                                <p className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--text)]">
                                  {formatRoundedCalories(target.kcal)}
                                </p>
                                <p className="mt-1 text-sm text-[var(--text-muted)]">kcal / päivä</p>
                              </div>
                              {isActive ? (
                                <Badge className="border-[var(--accent)] bg-[var(--surface)] text-[var(--accent)]">Nykyinen</Badge>
                              ) : null}
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
                                <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">P</p>
                                <p className="mt-1 font-medium text-[var(--text)]">{formatMacroValue(target.proteinG)} g</p>
                              </div>
                              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
                                <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">H</p>
                                <p className="mt-1 font-medium text-[var(--text)]">{formatMacroValue(target.carbsG)} g</p>
                              </div>
                              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
                                <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">R</p>
                                <p className="mt-1 font-medium text-[var(--text)]">{formatMacroValue(target.fatG)} g</p>
                              </div>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
                              {comparison.guidanceByGoal[goal]}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] p-4">
                    <p className="text-sm font-semibold text-[var(--text)]">Vaihevertailu odottaa täydennyksiä</p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      Profiilitavoite näkyy jo, mutta pudotus-, ylläpito- ja kasvatusvertailu avautuu vasta kun perustiedot ovat täydet.
                    </p>
                  </div>
                )}
              </div>
            </details>
          </>
        ) : (
          <div className="rounded-2xl border border-[color-mix(in_srgb,var(--warning)_35%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_8%,var(--surface))] p-4">
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
      </div>
    </Card>
  );
}
