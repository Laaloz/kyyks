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

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  loadingText?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { children, className, disabled, loading = false, loadingText, variant = "primary", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-base font-semibold tracking-[0.01em] transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:hover:translate-y-0 disabled:hover:brightness-100 disabled:hover:bg-[var(--surface-3)]",
        variantStyles[variant],
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
