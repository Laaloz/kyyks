import type { ReactNode } from "react";

type InlineFeedbackTone = "success" | "danger" | "info";

export function InlineFeedback({
  message,
  tone,
  idleMessage,
  pendingMessage,
  isPending = false,
  className = "",
}: {
  message?: ReactNode;
  tone?: InlineFeedbackTone | null;
  idleMessage?: ReactNode;
  pendingMessage?: ReactNode;
  isPending?: boolean;
  className?: string;
}) {
  const colorClass = isPending
    ? "text-[var(--text-subtle)]"
    : tone === "success"
      ? "text-[var(--success)]"
      : tone === "danger"
        ? "text-[var(--danger)]"
        : tone === "info"
          ? "text-[var(--accent)]"
          : "text-[var(--text-subtle)]";

  return (
    <p aria-live="polite" className={`${colorClass} ${className}`.trim()}>
      {isPending ? pendingMessage : message || idleMessage || null}
    </p>
  );
}
