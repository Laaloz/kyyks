import { describe, expect, it } from "vitest";

import { isConversationEntryNotifiable } from "@/lib/conversation";
import type { ConversationEntry } from "@/lib/types";

function createEntry(type: ConversationEntry["type"]): ConversationEntry {
  return {
    id: "conversation_1",
    athleteId: "user_athlete_1",
    coachId: "user_admin",
    authorUserId: "user_athlete_1",
    authorRole: "athlete",
    type,
    body: "Testiviesti",
    contextType: "general",
    createdAt: "2026-03-30T08:00:00.000Z",
    readByUserIds: ["user_athlete_1"],
  };
}

describe("isConversationEntryNotifiable", () => {
  it("treats both coaching comments and admin messages as notifiable", () => {
    expect(isConversationEntryNotifiable(createEntry("comment"))).toBe(true);
    expect(isConversationEntryNotifiable(createEntry("admin_message"))).toBe(true);
  });
});
