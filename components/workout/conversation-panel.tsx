"use client";

import { MessageSquare } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Label, Select, Textarea } from "@/components/ui/field";
import { isConversationEntryNotifiable } from "@/lib/conversation";
import { withMinimumDelay } from "@/lib/min-delay";
import type { AppState, ConversationEntry, Role } from "@/lib/types";
import { formatDateWithWeekday } from "@/lib/utils";
import { normalizeWorkoutHistoryTitle } from "@/lib/workout-history-title";
import { useAppState } from "@/providers/app-state-provider";

type ConversationContextOption = {
  id: string;
  label: string;
  contextType: ConversationEntry["contextType"];
  contextId?: string;
  contextLabel?: string;
};

type ActionResult =
  | { ok: true; scheduledWorkoutId?: string }
  | { ok: false; message: string };

type SendResult = ActionResult | Promise<ActionResult>;

export function ConversationPanel({
  heading,
  description,
  entries,
  users,
  currentRole,
  currentUserId,
  emptyMessage,
  contextOptions,
  occurrenceLabelByWorkoutId,
  onSend,
  headerSlot,
}: {
  heading: string;
  description: string;
  entries: ConversationEntry[];
  users: AppState["users"];
  currentRole: Role;
  currentUserId: string;
  emptyMessage: string;
  contextOptions: ConversationContextOption[];
  occurrenceLabelByWorkoutId?: Map<string, string>;
  onSend: (body: string, option: ConversationContextOption) => SendResult;
  headerSlot?: ReactNode;
}) {
  const { notify } = useAppState();
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const [selectedContextId, setSelectedContextId] = useState<string>(contextOptions[0]?.id ?? "general");
  const [isSending, setIsSending] = useState(false);

  const selectedContext = useMemo(
    () => contextOptions.find((option) => option.id === selectedContextId) ?? contextOptions[0],
    [contextOptions, selectedContextId],
  );

  useEffect(() => {
    if (!contextOptions.some((option) => option.id === selectedContextId)) {
      setSelectedContextId(contextOptions[0]?.id ?? "general");
    }
  }, [contextOptions, selectedContextId]);

  const handleSend = async () => {
    if (!selectedContext) {
      setMessage("Valitse ensin keskustelun kohde.");
      return;
    }

    setIsSending(true);
    try {
      const result = await withMinimumDelay(Promise.resolve(onSend(draft, selectedContext)));
      if (!result.ok) {
        setMessage(result.message);
        notify({ tone: "danger", message: result.message });
        return;
      }

      setDraft("");
      setMessage("Viesti lisättiin keskusteluun.");
      notify({ tone: "success", message: "Viesti lisättiin keskusteluun." });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Card className="border-[var(--border-strong)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Keskustelu</p>
          <CardTitle className="text-2xl">{heading}</CardTitle>
          <CardDescription className="mt-2">{description}</CardDescription>
        </div>
        {headerSlot}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <div className="max-h-[min(68vh,42rem)] space-y-3 overflow-y-auto pr-1">
            {entries.length ? (
              entries.map((entry) => (
              <ConversationEntryCard
                key={entry.id}
                currentRole={currentRole}
                currentUserId={currentUserId}
                entry={entry}
                occurrenceLabelByWorkoutId={occurrenceLabelByWorkoutId}
                users={users}
              />
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 text-sm text-[var(--text-subtle)]">
                {emptyMessage}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <p className="text-sm font-semibold text-[var(--text)]">Uusi viesti</p>
          <p className="mt-1 text-xs text-[var(--text-subtle)]">
            Jätä yleinen kommentti tai kohdista viesti suoraan treenialueeseen tai ohjelmaan.
          </p>
          <div className="mt-4">
            <Label htmlFor="conversation-context">Kohde</Label>
            <Select
              id="conversation-context"
              value={selectedContextId}
              onChange={(event) => setSelectedContextId(event.target.value)}
            >
              {contextOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="mt-4">
            <Label htmlFor="conversation-draft">Viesti</Label>
            <Textarea
              id="conversation-draft"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                if (message) {
                  setMessage("");
                }
              }}
              placeholder="Kirjoita viesti valmennuksen etenemisestä, treenin kuormittavuudesta tai ohjelman muutostarpeesta."
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleSend()}
              disabled={isSending || !draft.trim()}
              loading={isSending}
              loadingText="Lähetetään viestiä..."
            >
              Lähetä viesti
            </Button>
            <p
              aria-live="polite"
              className={`text-sm ${
                message === "Viesti lisättiin keskusteluun."
                  ? "text-[var(--success)]"
                  : message
                    ? "text-[var(--danger)]"
                    : "text-[var(--text-subtle)]"
              }`}
            >
              {message || "Uudet viestit näkyvät tässä heti ilman erillistä sähköposti-ilmoitusta."}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ConversationEntryCard({
  entry,
  users,
  currentRole,
  currentUserId,
  occurrenceLabelByWorkoutId,
}: {
  entry: ConversationEntry;
  users: AppState["users"];
  currentRole: Role;
  currentUserId: string;
  occurrenceLabelByWorkoutId?: Map<string, string>;
}) {
  const author = users.find((user) => user.id === entry.authorUserId);
  const authorName =
    author?.fullName ??
    (entry.authorRole === "coach"
      ? "Valmentaja"
      : entry.authorRole === "athlete"
        ? "Treenaaja"
        : "Käyttäjä");
  const unread =
    isConversationEntryNotifiable(entry) &&
    !entry.readByUserIds.includes(currentUserId) &&
    currentRole !== entry.authorRole;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-[var(--text)]">{authorName}</p>
            <Badge className={conversationTone(entry.type)}>{conversationLabel(entry.type)}</Badge>
            {entry.contextLabel ? (
              <Badge className="border-[var(--border)] bg-[var(--surface)] text-[var(--text-subtle)]">
                {entry.contextType === "workout"
                  ? normalizeWorkoutHistoryTitle(entry.contextLabel)
                  : entry.contextLabel}
              </Badge>
            ) : null}
            {entry.contextType === "workout" && entry.contextId && occurrenceLabelByWorkoutId?.get(entry.contextId) ? (
              <Badge className="border-[var(--border)] bg-[var(--surface)] text-[var(--text-subtle)]">
                {occurrenceLabelByWorkoutId.get(entry.contextId)}
              </Badge>
            ) : null}
            {unread ? (
              <Badge className="border-[var(--accent)] bg-[var(--surface)] text-[var(--accent)]">
                Uusi
              </Badge>
            ) : null}
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{entry.body}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--text-subtle)]">
          {conversationIcon(entry.type)}
          <span>{formatDateWithWeekday(entry.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

function conversationLabel(type: ConversationEntry["type"]) {
  return type === "comment" ? "Kommentti" : type;
}

function conversationTone(type: ConversationEntry["type"]) {
  return type === "comment"
    ? "border-[var(--accent)] bg-[var(--surface)] text-[var(--accent)]"
    : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-subtle)]";
}

function conversationIcon(type: ConversationEntry["type"]) {
  return type === "comment" ? <MessageSquare className="size-4" aria-hidden="true" /> : null;
}
