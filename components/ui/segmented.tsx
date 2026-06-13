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
  controlsPrefix,
  scrollable = false,
}: {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
  /** Jos annettu, jokainen nappi saa id:n `${idPrefix}-${value}` (esim. tabpanelin aria-labelledby). */
  idPrefix?: string;
  /** Jos annettu, jokainen nappi saa aria-controls=`${controlsPrefix}-${value}` (tabpanelin id). */
  controlsPrefix?: string;
  /**
   * Monelle/pitkälle välilehdelle: vaakascrollaava rivi tasaleveiden sarakkeiden
   * sijaan (ettei pitkä otsikko katkea). Muuten tasaleveä grid.
   */
  scrollable?: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "gap-1 rounded-xl bg-[var(--surface-2)] p-1",
        scrollable
          ? "flex overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          : "grid w-full",
        className,
      )}
      style={scrollable ? undefined : ({ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } as CSSProperties)}
    >
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            id={idPrefix ? `${idPrefix}-${option.value}` : undefined}
            aria-controls={controlsPrefix ? `${controlsPrefix}-${option.value}` : undefined}
            aria-selected={isActive}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-semibold transition",
              scrollable ? "shrink-0" : "min-w-0 truncate",
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
