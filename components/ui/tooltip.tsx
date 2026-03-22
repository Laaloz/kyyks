"use client";

import { CircleHelp } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export function InfoTooltip({
  text,
  className,
  side = "bottom",
}: {
  text: string;
  className?: string;
  side?: "top" | "bottom";
}) {
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const [shiftX, setShiftX] = useState(0);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) {
      setShiftX(0);
      return;
    }

    const updateHorizontalClamp = () => {
      if (!triggerRef.current || !tooltipRef.current) {
        return;
      }

      const viewportPadding = 8;
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipWidth = tooltipRef.current.offsetWidth;
      const desiredCenter = triggerRect.left + triggerRect.width / 2;
      const minCenter = viewportPadding + tooltipWidth / 2;
      const maxCenter = window.innerWidth - viewportPadding - tooltipWidth / 2;
      const clampedCenter = Math.min(maxCenter, Math.max(minCenter, desiredCenter));

      setShiftX(clampedCenter - desiredCenter);
    };

    const frame = window.requestAnimationFrame(updateHorizontalClamp);
    window.addEventListener("resize", updateHorizontalClamp);
    window.addEventListener("scroll", updateHorizontalClamp, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateHorizontalClamp);
      window.removeEventListener("scroll", updateHorizontalClamp, true);
    };
  }, [open]);

  return (
    <span className={cn("relative inline-flex items-center", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-describedby={tooltipId}
        aria-controls={tooltipId}
        aria-expanded={open}
        aria-label="Lisätieto"
        className="peer inline-flex size-5 items-center justify-center rounded-full text-[var(--text-subtle)] transition hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
        onClick={() => setOpen((value) => !value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      >
        <CircleHelp className="size-4" />
      </button>
      <span
        ref={tooltipRef}
        id={tooltipId}
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-40 w-64 max-w-[calc(100vw-16px)] rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-xs leading-5 text-[var(--text-muted)] shadow-[0_10px_24px_-16px_var(--shadow)] transition",
          side === "top" ? "bottom-full mb-2" : "top-full mt-2",
          open ? "opacity-100" : "opacity-0",
        )}
        style={{ transform: `translateX(calc(-50% + ${shiftX}px))` }}
      >
        {text}
      </span>
    </span>
  );
}
