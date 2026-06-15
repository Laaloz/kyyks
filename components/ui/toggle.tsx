"use client";

import { cn } from "@/lib/utils";

/**
 * Yhtenäinen toggle-kytkin (sama tyyli kuin asetusten / profiilin "Pidä näyttö päällä").
 * Anna joko `ariaLabel` tai `labelledBy` saavutettavuutta varten.
 */
export function Toggle({
  checked,
  onChange,
  disabled,
  ariaLabel,
  labelledBy,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
  labelledBy?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition disabled:opacity-60",
        checked ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--border)] bg-[var(--surface-3)]",
        className,
      )}
      onClick={() => onChange(!checked)}
    >
      <span
        className={cn(
          "pointer-events-none inline-block size-5 rounded-full bg-[var(--surface)] shadow-[0_1px_4px_-2px_var(--shadow)] transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
