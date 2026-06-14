import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_1px_2px_var(--shadow-soft)] sm:p-5",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("font-[family-name:var(--font-display)] text-xl font-semibold leading-tight tracking-[0.01em] text-[var(--text)] sm:text-2xl", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-[var(--text-muted)]", className)} {...props} />;
}
