"use client";

import { Button } from "@/components/ui/button";

export function MeasurementReminderDialog({
  weightDue,
  waistDue,
  onClose,
  onOpenOverview,
}: {
  weightDue: boolean;
  waistDue: boolean;
  onClose: () => void;
  onOpenOverview: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-[color:color-mix(in_srgb,var(--background)_48%,transparent)] p-4 sm:items-center"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="measurement-reminder-title"
        aria-describedby="measurement-reminder-description"
        className="w-full max-w-lg rounded-3xl bg-[var(--surface)] p-5 shadow-[0_24px_60px_-24px_var(--shadow)]"
      >
        <h3
          id="measurement-reminder-title"
          className="font-[family-name:var(--font-display)] text-2xl font-semibold leading-tight text-[var(--text)]"
        >
          Päivitä kehon seuranta viikonlopun aikana
        </h3>
        <p id="measurement-reminder-description" className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
          Kirjaa paino ja vyötärö kerran viikossa. Kun tiedot ovat ajan tasalla,
          kehon seuranta, kehitysgraafit ja kaloriarvio pysyvät hyödyllisinä.
        </p>
        <div className="mt-4 grid gap-4 divide-y divide-[var(--border)] sm:grid-cols-2 sm:divide-y-0 sm:divide-x">
          <div className="sm:pr-4">
            <p className="text-sm font-semibold text-[var(--text)]">
              Paino — {weightDue ? "päivitä tänä viikonloppuna" : "tämän viikon merkintä kunnossa"}
            </p>
            <p className="mt-1.5 text-xs leading-5 text-[var(--text-muted)]">
              Mittaa aamulla vessassa käynnin jälkeen ennen syömistä tai juomista.
            </p>
          </div>
          <div className="pt-4 sm:pt-0 sm:pl-4">
            <p className="text-sm font-semibold text-[var(--text)]">
              Vyötärö — {waistDue ? "päivitä tänä viikonloppuna" : "tämän viikon merkintä kunnossa"}
            </p>
            <p className="mt-1.5 text-xs leading-5 text-[var(--text-muted)]">
              Ota mitta navan alapuolelta vyötärön kohdalta, puhalla ilmat pois, vedä mitta kevyesti napakaksi ja kirjaa lukema siitä.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>
            Sulje
          </Button>
          <Button type="button" onClick={onOpenOverview}>
            Avaa kehon seuranta
          </Button>
        </div>
      </div>
    </div>
  );
}
