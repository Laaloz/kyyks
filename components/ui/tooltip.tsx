"use client";

import { CircleHelp } from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";

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
  const [tooltipStyle, setTooltipStyle] = useState<CSSProperties | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) {
      setTooltipStyle(null);
      return;
    }

    const updateTooltipPosition = () => {
      if (!triggerRef.current || !tooltipRef.current) {
        return;
      }

      const viewportPadding = 8;
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const tooltipWidth = tooltipRect.width;
      const tooltipHeight = tooltipRect.height;
      const desiredLeft = triggerRect.left + triggerRect.width / 2 - tooltipWidth / 2;
      const maxLeft = window.innerWidth - tooltipWidth - viewportPadding;
      const left = Math.max(viewportPadding, Math.min(desiredLeft, maxLeft));
      const preferredTop =
        side === "top"
          ? triggerRect.top - tooltipHeight - 8
          : triggerRect.bottom + 8;
      const fallbackTop =
        side === "top"
          ? triggerRect.bottom + 8
          : triggerRect.top - tooltipHeight - 8;
      const fitsPreferred =
        side === "top"
          ? preferredTop >= viewportPadding
          : preferredTop + tooltipHeight <= window.innerHeight - viewportPadding;
      const unclampedTop = fitsPreferred ? preferredTop : fallbackTop;
      const maxTop = window.innerHeight - tooltipHeight - viewportPadding;
      const top = Math.max(viewportPadding, Math.min(unclampedTop, maxTop));

      setTooltipStyle({
        position: "fixed",
        top,
        left,
      });
    };

    const frame = window.requestAnimationFrame(updateTooltipPosition);
    window.addEventListener("resize", updateTooltipPosition);
    window.addEventListener("scroll", updateTooltipPosition, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateTooltipPosition);
      window.removeEventListener("scroll", updateTooltipPosition, true);
    };
  }, [open, side]);

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
          "pointer-events-none fixed z-50 w-64 max-w-[calc(100vw-16px)] rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-left text-xs font-normal normal-case tracking-normal leading-5 text-[var(--text-muted)] shadow-[0_10px_24px_-16px_var(--shadow)] transition",
          open ? "opacity-100" : "opacity-0",
        )}
        style={tooltipStyle ?? { position: "fixed", left: -9999, top: -9999 }}
      >
        {text}
      </span>
    </span>
  );
}
