"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

/**
 * Jaettu dialogi-/sheet-kuori. Leipoo sisään yhtenäisen käytöksen, jota
 * yksittäiset dialogit aiemmin toistivat käsin (ja ajautuivat erilleen):
 * - createPortal document.bodyyn (irti vanhempien stacking-konteksteista)
 * - role="dialog" + aria-modal + aria-label(ledby)
 * - Escape sulkee, taustaklikki sulkee (molemmat opt-out)
 * - taustan vierityslukko (nesting-turvallinen previousOverflow-talletuksella)
 *
 * `Sheet` = bottom-sheet mobiilissa, keskitetty modaali työpöydällä.
 * `FullScreenOverlay` = koko ruudun overlay omalla takaisin-headerillä.
 */
function useDialogChrome(onClose: () => void, closeOnEscape: boolean) {
  useEffect(() => {
    // Robusti taustalukko: estää sekä body- että html-tason vierityksen ja
    // overscroll-rubber-bandin (iOS Safari). Nesting-turvallinen — talletetut
    // edelliset arvot palautetaan, joten sisäkkäinen sheet palauttaa "hidden".
    const { body, documentElement } = document;
    const previous = {
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
      htmlOverflow: documentElement.style.overflow,
      htmlOverscroll: documentElement.style.overscrollBehavior,
    };
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    documentElement.style.overflow = "hidden";
    documentElement.style.overscrollBehavior = "none";

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (closeOnEscape && event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      body.style.overflow = previous.bodyOverflow;
      body.style.overscrollBehavior = previous.bodyOverscroll;
      documentElement.style.overflow = previous.htmlOverflow;
      documentElement.style.overscrollBehavior = previous.htmlOverscroll;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, closeOnEscape]);
}

type SharedDialogProps = {
  onClose: () => void;
  /** Joko ariaLabel tai ariaLabelledby — toinen vaaditaan saavutettavuuden vuoksi. */
  ariaLabel?: string;
  ariaLabelledby?: string;
  ariaDescribedby?: string;
  /** Panelin lisä-/ylikirjoitusluokat (twMerge). Esim. leveys tai overflow. */
  className?: string;
  closeOnEscape?: boolean;
  children: ReactNode;
};

export function Sheet({
  onClose,
  ariaLabel,
  ariaLabelledby,
  ariaDescribedby,
  className,
  closeOnEscape = true,
  closeOnBackdrop = true,
  showHandle = true,
  children,
}: SharedDialogProps & {
  closeOnBackdrop?: boolean;
  /** Mobiilin vetokahva panelin yläreunassa (piilossa sm-koossa). */
  showHandle?: boolean;
}) {
  useDialogChrome(onClose, closeOnEscape);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[color:color-mix(in_srgb,var(--background)_54%,transparent)] p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        aria-describedby={ariaDescribedby}
        className={cn(
          "flex max-h-[88svh] w-full max-w-lg flex-col rounded-t-3xl bg-[var(--surface)] p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] shadow-[0_24px_60px_-24px_var(--shadow)] sm:max-h-[88vh] sm:rounded-3xl",
          className,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {showHandle ? (
          <span
            className="mx-auto mb-3 block h-1 w-10 shrink-0 rounded-full bg-[var(--border-strong)] sm:hidden"
            aria-hidden="true"
          />
        ) : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function FullScreenOverlay({
  onClose,
  ariaLabel,
  ariaLabelledby,
  className,
  closeOnEscape = true,
  scroll = true,
  children,
}: SharedDialogProps & {
  /**
   * true (oletus): scrollaava sivu, jolla on safe-area-padding (esim. drill-down).
   * false: pelkkä chrome-säiliö (flex-col), kun sisältö hoitaa oman scrollinsa
   * (esim. ohjelmaeditori, jolla on kiinteä header + scrollaava runko + footer).
   */
  scroll?: boolean;
}) {
  useDialogChrome(onClose, closeOnEscape);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      // overscroll-contain estää scroll-ketjutuksen taustaan rubber-band-reunoilla.
      className={cn(
        "fixed inset-0 z-50 flex flex-col bg-[var(--background)]",
        scroll &&
          "overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+0.75rem)]",
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}
