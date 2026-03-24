import type { InviteStatus } from "@/lib/types";

export function getInviteLifecycleLabel(status: InviteStatus) {
  return status === "pending" ? "Kutsu lähetetty · odottaa rekisteröitymistä" : "Kutsu hyväksytty";
}
