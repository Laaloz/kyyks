import type { Invite, InviteStatus, UserProfile } from "@/lib/types";

export function getInviteLifecycleLabel(status: InviteStatus) {
  return status === "pending" ? "Kutsu lähetetty · odottaa rekisteröitymistä" : "Kutsu hyväksytty";
}

export function getVisiblePendingInvites(invites: Invite[], users: UserProfile[]) {
  const activeEmails = new Set(
    users
      .filter((user) => user.status === "active")
      .map((user) => user.email.trim().toLowerCase()),
  );

  return invites.filter(
    (invite) => invite.status === "pending" && !activeEmails.has(invite.email.trim().toLowerCase()),
  );
}
