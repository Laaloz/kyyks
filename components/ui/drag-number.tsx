"use client";

import { GripVertical } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { cn } from "@/lib/utils";

const PIXELS_PER_STEP = 14;

// Numerokenttä, jota voi säätää vetämällä grip-kahvasta (14 px/askel, suhteellinen)
// tai napauttamalla ja kirjoittamalla. Sama vuorovaikutus kuin kirjauksen sarjariveillä.
export function DragNumber({
  value,
  onChange,
  step = 1,
  min = 0,
  ariaLabel,
  tone,
  disabled = false,
}: {
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  ariaLabel: string;
  tone?: "warn";
  disabled?: boolean;
}) {
  const dragRef = useRef<{ pointerId: number; startY: number; lastStep: number; value: number } | null>(null);
  const [active, setActive] = useState(false);

  const roundToStep = (next: number) => Math.round(next / step) * step;

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled) {
      return;
    }
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Ignore pointer capture failures (e.g. synthetic pointers).
    }
    dragRef.current = { pointerId: event.pointerId, startY: event.clientY, lastStep: 0, value };
    setActive(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    const offset = Math.trunc((drag.startY - event.clientY) / PIXELS_PER_STEP);
    if (offset === drag.lastStep) {
      return;
    }
    const delta = offset - drag.lastStep;
    const next = Math.max(min, roundToStep(drag.value + delta * step));
    drag.value = next;
    drag.lastStep = offset;
    onChange(Math.round(next * 100) / 100);
  };

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Ignore release failures.
    }
    dragRef.current = null;
    setActive(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      onChange(Math.round((value + step) * 100) / 100);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      onChange(Math.max(min, Math.round((value - step) * 100) / 100));
    }
  };

  return (
    <span
      className={cn(
        "relative flex h-11 items-center rounded-xl pr-7 transition",
        tone === "warn" ? "bg-[color:color-mix(in_srgb,var(--warning)_16%,var(--surface-2))]" : "bg-[var(--surface-2)]",
        active ? "shadow-[inset_0_0_0_1.5px_var(--accent)]" : null,
      )}
    >
      <input
        type="text"
        inputMode="decimal"
        value={value}
        aria-label={ariaLabel}
        disabled={disabled}
        className={cn(
          "w-full min-w-0 bg-transparent px-2 text-center font-[family-name:var(--font-display)] text-base font-semibold tabular-nums outline-none",
          tone === "warn" ? "text-[var(--warning)]" : "text-[var(--text)]",
        )}
        onChange={(event) => {
          const raw = event.target.value.trim().replace(",", ".");
          if (raw === "") {
            onChange(min);
            return;
          }
          const parsed = Number(raw);
          if (Number.isFinite(parsed)) {
            onChange(Math.max(min, parsed));
          }
        }}
        onKeyDown={handleKeyDown}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
        className={cn(
          "absolute right-1 grid h-9 w-6 place-items-center rounded-lg",
          active ? "text-[var(--accent)]" : tone === "warn" ? "text-[var(--warning)]" : "text-[var(--text-subtle)]",
        )}
        style={{ touchAction: "none", cursor: "ns-resize" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <GripVertical className="size-3.5" aria-hidden="true" />
      </button>
    </span>
  );
}
