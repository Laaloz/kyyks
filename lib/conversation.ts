import type { ConversationEntry } from "@/lib/types";

export function isConversationEntryNotifiable(entry: ConversationEntry) {
  return entry.type === "comment";
}
