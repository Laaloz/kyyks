import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface-3)] px-3 py-1 text-xs font-semibold tracking-[0.03em] text-[var(--text-subtle)]",
        className,
      )}
      {...props}
    />
  );
}
