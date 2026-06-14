"use client";

import { cn } from "@/lib/utils";
import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variantStyles: Record<Variant, string> = {
  primary:
    "border border-[var(--accent-strong)] bg-[var(--accent-strong)] text-[var(--accent-contrast)] shadow-[0_1px_0_0_var(--accent-strong),0_12px_24px_-16px_var(--accent)] hover:opacity-95 hover:brightness-105",
  secondary:
    "border border-[var(--button-secondary-border)] bg-[var(--button-secondary-bg)] text-[var(--button-secondary-text)] shadow-[0_1px_0_0_var(--shadow-soft),0_8px_20px_-16px_var(--shadow)] hover:bg-[var(--button-secondary-hover-bg)] hover:opacity-95",
  ghost:
    "border border-[var(--button-ghost-border)] bg-[var(--button-ghost-bg)] text-[var(--button-ghost-text)] hover:border-[var(--button-ghost-hover-border)] hover:bg-[var(--button-ghost-hover-bg)] hover:text-[var(--button-ghost-hover-text)]",
  danger: "border border-[#9c2217] bg-[var(--danger)] text-white shadow-[0_1px_0_0_#861e14,0_10px_22px_-14px_#b42318] hover:opacity-95 hover:brightness-105",
};

const loadingStyles: Record<Variant, string> = {
  primary:
    "cursor-progress opacity-100 border-[var(--accent-strong)] bg-[var(--accent-strong)] text-[var(--accent-contrast)] shadow-[0_1px_0_0_var(--accent-strong),0_12px_24px_-16px_var(--accent)] hover:opacity-100 hover:brightness-100",
  secondary:
    "cursor-progress opacity-100 border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] shadow-[0_1px_0_0_var(--shadow-soft),0_8px_20px_-16px_var(--shadow)] hover:opacity-100 hover:bg-[var(--surface)]",
  ghost:
    "cursor-progress opacity-100 border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-none hover:opacity-100 hover:bg-[var(--surface)]",
  danger:
    "cursor-progress opacity-100 border-[#9c2217] bg-[var(--danger)] text-white shadow-[0_1px_0_0_#861e14,0_10px_22px_-14px_#b42318] hover:opacity-100 hover:brightness-100",
};

const disabledStyles =
  "cursor-not-allowed border-[var(--button-disabled-border)] bg-[var(--button-disabled-bg)] text-[var(--button-disabled-text)] opacity-100 shadow-none hover:border-[var(--button-disabled-border)] hover:bg-[var(--button-disabled-bg)] hover:text-[var(--button-disabled-text)] hover:opacity-100 hover:brightness-100";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  loadingText?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { children, className, disabled, loading = false, loadingText, variant = "primary", ...props },
  ref,
) {
  const isDisabled = Boolean(disabled) && !loading;

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex select-none items-center justify-center rounded-xl px-4 py-2.5 text-base font-semibold tracking-[0.01em] transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] active:enabled:translate-y-px",
        variantStyles[variant],
        loading ? loadingStyles[variant] : null,
        isDisabled ? disabledStyles : null,
        className,
      )}
      {...props}
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
          />
          {/* Vain loadingText näytetään latauksessa — ei childrenin ikonia+tekstiä, ettei
              nappi mene rikki (kahdelle riville). Ilman loadingTextiä pelkkä spinneri. */}
          {loadingText ? <span className="truncate">{loadingText}</span> : null}
        </span>
      ) : (
        children
      )}
    </button>
  );
});
