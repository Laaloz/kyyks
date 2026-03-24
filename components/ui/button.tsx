"use client";

import { cn } from "@/lib/utils";
import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variantStyles: Record<Variant, string> = {
  primary:
    "border border-[var(--accent-strong)] bg-[var(--accent-strong)] text-[var(--accent-contrast)] shadow-[0_1px_0_0_var(--accent-strong),0_12px_24px_-16px_var(--accent)] hover:-translate-y-[1px] hover:brightness-105",
  secondary:
    "border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] shadow-[0_1px_0_0_var(--shadow-soft),0_8px_20px_-16px_var(--shadow)] hover:-translate-y-[1px] hover:bg-[var(--surface-2)]",
  ghost:
    "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
  danger: "border border-[#9c2217] bg-[var(--danger)] text-white shadow-[0_1px_0_0_#861e14,0_10px_22px_-14px_#b42318] hover:-translate-y-[1px] hover:brightness-105",
};

const loadingStyles: Record<Variant, string> = {
  primary:
    "cursor-progress opacity-100 border-[var(--accent-strong)] bg-[var(--accent-strong)] text-[var(--accent-contrast)] shadow-[0_1px_0_0_var(--accent-strong),0_12px_24px_-16px_var(--accent)] hover:translate-y-0 hover:brightness-100",
  secondary:
    "cursor-progress opacity-100 border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] shadow-[0_1px_0_0_var(--shadow-soft),0_8px_20px_-16px_var(--shadow)] hover:translate-y-0 hover:bg-[var(--surface)]",
  ghost:
    "cursor-progress opacity-100 border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-none hover:translate-y-0 hover:bg-[var(--surface)]",
  danger:
    "cursor-progress opacity-100 border-[#9c2217] bg-[var(--danger)] text-white shadow-[0_1px_0_0_#861e14,0_10px_22px_-14px_#b42318] hover:translate-y-0 hover:brightness-100",
};

const disabledStyles =
  "cursor-not-allowed opacity-45 shadow-none hover:translate-y-0 hover:brightness-100 hover:bg-[var(--surface-3)]";

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
        "inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-base font-semibold tracking-[0.01em] transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
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
          <span>{loadingText ?? children}</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
});
