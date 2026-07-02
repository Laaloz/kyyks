export type Macros = { kcal: number; p: number; c: number; f: number };

/**
 * Energiajakauman palkki + P/H/R-legenda. Jaettu reseptiesikatselun ja ruoan muokkauskortin
 * kesken. `legend: false` piilottaa legendan, kun ympäröivä näkymä esittää makrot itse
 * (esim. muokkauskortin sarakkeet).
 */
export function EnergySplit({ macros, legend = true }: { macros: Macros; legend?: boolean }) {
  const pe = macros.p * 4;
  const ce = macros.c * 4;
  const fe = macros.f * 9;
  const tot = pe + ce + fe || 1;
  const seg = (v: number) => `${Math.max(2, Math.round((v / tot) * 100))}%`;
  return (
    <div>
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
        <span style={{ width: seg(pe) }} className="rounded-full bg-[var(--accent)]" />
        <span style={{ width: seg(ce) }} className="rounded-full bg-[var(--accent-secondary)]" />
        <span style={{ width: seg(fe) }} className="rounded-full bg-[var(--border-strong)]" />
      </div>
      {legend ? (
        <div className="mt-2 flex gap-4 text-xs font-semibold text-[var(--text-muted)]">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[var(--accent)]" aria-hidden="true" />P {macros.p} g
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[var(--accent-secondary)]" aria-hidden="true" />H {macros.c} g
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[var(--border-strong)]" aria-hidden="true" />R {macros.f} g
          </span>
        </div>
      ) : null}
    </div>
  );
}
