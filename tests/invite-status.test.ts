import { describe, expect, it } from "vitest";

import { getInviteLifecycleLabel, getVisiblePendingInvites } from "@/lib/invite-status";
import type { Invite, UserProfile } from "@/lib/types";

describe("getInviteLifecycleLabel", () => {
  it("describes pending invites as sent and waiting for registration", () => {
    expect(getInviteLifecycleLabel("pending")).toBe("Kutsu lähetetty · odottaa rekisteröitymistä");
  });

  it("describes accepted invites as completed", () => {
    expect(getInviteLifecycleLabel("accepted")).toBe("Kutsu hyväksytty");
  });
});

describe("getVisiblePendingInvites", () => {
  it("hides stale pending invites when the same email already has an active account", () => {
    const invites: Invite[] = [
      {
        id: "invite_stale",
        token: "token_stale",
        email: "athlete@example.com",
        role: "athlete",
        invitedBy: "coach_1",
        coachId: "coach_1",
        status: "pending",
        createdAt: "2026-03-24T08:00:00.000Z",
        expiresAt: "2026-05-31T08:00:00.000Z",
      },
      {
        id: "invite_real",
        token: "token_real",
        email: "new@example.com",
        role: "athlete",
        invitedBy: "coach_1",
        coachId: "coach_1",
        status: "pending",
        createdAt: "2026-03-24T08:00:00.000Z",
        expiresAt: "2026-05-31T08:00:00.000Z",
      },
    ];
    const users: UserProfile[] = [
      {
        id: "user_1",
        role: "athlete",
        fullName: "Activated Athlete",
        email: "ATHLETE@example.com",
        status: "active",
        createdAt: "2026-03-24T08:00:00.000Z",
        updatedAt: "2026-03-24T08:00:00.000Z",
      },
    ];

    expect(getVisiblePendingInvites(invites, users).map((invite) => invite.id)).toEqual(["invite_real"]);
  });
});
