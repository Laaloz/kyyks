import { describe, expect, it } from "vitest";

import { getInviteLifecycleLabel } from "@/lib/invite-status";

describe("getInviteLifecycleLabel", () => {
  it("describes pending invites as sent and waiting for registration", () => {
    expect(getInviteLifecycleLabel("pending")).toBe("Kutsu lähetetty · odottaa rekisteröitymistä");
  });

  it("describes accepted invites as completed", () => {
    expect(getInviteLifecycleLabel("accepted")).toBe("Kutsu hyväksytty");
  });
});
