"use client";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";

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
    <Sheet
      onClose={onClose}
      ariaLabelledby="measurement-reminder-title"
      ariaDescribedby="measurement-reminder-description"
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
        <div className="mt-4 grid divide-y divide-[var(--border)] sm:grid-cols-2 sm:divide-y-0 sm:divide-x">
          <div className="sm:pr-4 pb-4">
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
        <div className="mt-5 flex justify-end">
          <Button type="button" onClick={onOpenOverview}>
            Avaa kehon seuranta
          </Button>
        </div>
    </Sheet>
  );
}
