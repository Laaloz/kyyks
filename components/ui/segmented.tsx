"use client";

import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Yhtenäinen segmenttikontrolli (prototyypin .seg). Aktiivinen = vaalea pinta +
 * kevyt varjo harmaalla radalla, ei aksenttiväriä eikä selaimen sinistä outlinea.
 * Käytä kaikkialla samannäköisenä (Ravinto, Tiimi/Ohjelmat, Treeni, editori).
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  ariaLabel,
  idPrefix,
}: {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
  /** Jos annettu, jokainen nappi saa id:n `${idPrefix}-${value}` (esim. tabpanelin aria-labelledby). */
  idPrefix?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("grid w-full gap-1 rounded-xl bg-[var(--surface-2)] p-1", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } as CSSProperties}
    >
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            id={idPrefix ? `${idPrefix}-${option.value}` : undefined}
            aria-selected={isActive}
            className={cn(
              "min-w-0 truncate rounded-lg px-3 py-2 text-sm font-semibold transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--surface-2)]",
              isActive
                ? "bg-[var(--surface)] text-[var(--text)] shadow-[0_1px_3px_var(--shadow-soft)]"
                : "text-[var(--text-muted)] hover:text-[var(--text)]",
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
