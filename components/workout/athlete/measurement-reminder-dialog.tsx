"use client";

import { Button } from "@/components/ui/button";

export function MeasurementReminderDialog({
  weightDue,
  waistDue,
  onClose,
  onOpenSettings,
}: {
  weightDue: boolean;
  waistDue: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
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
        className="w-full max-w-lg rounded-3xl border border-[var(--border-strong)] bg-[var(--surface)] p-5 shadow-[0_24px_60px_-24px_var(--shadow)]"
      >
        <p className="text-xs font-semibold tracking-[0.08em] text-[var(--accent)]">Perjantain muistutus</p>
        <h3
          id="measurement-reminder-title"
          className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--text)]"
        >
          Päivitä kehon seuranta tämän viikonlopun aikana
        </h3>
        <p id="measurement-reminder-description" className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
          Kirjaa paino ja vyötärö kerran viikossa. Kun tiedot ovat ajan tasalla,
          kehitysgraafit ja kaloriarvio pysyvät hyödyllisinä.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
            <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Paino</p>
            <p className="mt-1 text-sm font-semibold text-[var(--text)]">
              {weightDue ? "Päivitä tämän viikonlopun aikana" : "Tämän viikon merkintä on kunnossa"}
            </p>
            <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">
              Mittaa aamulla vessassa käynnin jälkeen ennen syömistä tai juomista.
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
            <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Vyötärö</p>
            <p className="mt-1 text-sm font-semibold text-[var(--text)]">
              {waistDue ? "Päivitä tämän viikonlopun aikana" : "Tämän viikon merkintä on kunnossa"}
            </p>
            <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">
              Ota mitta navan alapuolelta vyötärön kohdalta, puhalla ilmat pois, vedä mitta kevyesti napakaksi ja kirjaa lukema siitä.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>
            Sulje
          </Button>
          <Button type="button" onClick={onOpenSettings}>
            Avaa profiili
          </Button>
        </div>
      </div>
    </div>
  );
}
