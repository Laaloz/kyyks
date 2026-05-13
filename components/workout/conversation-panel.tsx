"use client";

import { ArrowUp, Clock3, Shield } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/field";
import { InlineFeedback } from "@/components/workout/inline-feedback";
import { isConversationEntryNotifiable } from "@/lib/conversation";
import { withMinimumDelay } from "@/lib/min-delay";
import type { AppState, ConversationEntry, Role } from "@/lib/types";
import { formatDateWithWeekday, formatRelativeDate } from "@/lib/utils";
import { useAppState } from "@/providers/app-state-provider";

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
  onSend: (body: string) => SendResult;
  headerSlot?: ReactNode;
}) {
  const { notify } = useAppState();
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "danger" | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isExpandedDraft, setIsExpandedDraft] = useState(false);
  const messagesViewportRef = useRef<HTMLDivElement | null>(null);
  const draftInputRef = useRef<HTMLTextAreaElement | null>(null);
  const orderedEntries = useMemo(
    () =>
      [...entries].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()),
    [entries],
  );
  const groupedEntries = useMemo(() => {
    const groups: Array<{ key: string; label: string; entries: ConversationEntry[] }> = [];

    orderedEntries.forEach((entry) => {
      const date = new Date(entry.createdAt);
      const key = Number.isNaN(date.getTime()) ? entry.createdAt : date.toISOString().slice(0, 10);
      const currentGroup = groups[groups.length - 1];

      if (currentGroup?.key === key) {
        currentGroup.entries.push(entry);
        return;
      }

      groups.push({
        key,
        label:
          formatRelativeDate(entry.createdAt) === formatDateWithWeekday(entry.createdAt)
            ? formatDateWithWeekday(entry.createdAt)
            : formatRelativeDate(entry.createdAt),
        entries: [entry],
      });
    });

    return groups;
  }, [orderedEntries]);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) {
      return;
    }

    viewport.scrollTop = viewport.scrollHeight;
  }, [orderedEntries.length]);

  useLayoutEffect(() => {
    resizeDraftInput();
  }, [draft]);

  const resizeDraftInput = () => {
    const field = draftInputRef.current;
    if (!field) {
      return;
    }

    field.style.height = "auto";
    const nextHeight = Math.min(field.scrollHeight, 112);
    field.style.height = `${nextHeight}px`;
    setIsExpandedDraft(nextHeight > 34);
  };

  const handleSend = async () => {
    setIsSending(true);
    try {
      const result = await withMinimumDelay(Promise.resolve(onSend(draft)));
      if (!result.ok) {
        setMessage(result.message);
        setMessageTone("danger");
        notify({ tone: "danger", message: result.message });
        return;
      }

      setDraft("");
      setIsExpandedDraft(false);
      notify({ tone: "success", message: "Viesti lisättiin keskusteluun." });
    } finally {
      setIsSending(false);
    }
  };

  const placeholder = getConversationComposerPlaceholder(currentRole);
  const hasHeader = Boolean(heading || description || headerSlot);

  return (
    <Card className="flex h-full min-h-0 w-full flex-col overflow-hidden border-[var(--border-strong)]">
      {hasHeader ? (
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {heading || description ? (
            <div>
              {heading ? <CardTitle className="text-2xl">{heading}</CardTitle> : null}
              {description ? <CardDescription className="mt-2 max-w-2xl">{description}</CardDescription> : null}
            </div>
          ) : null}
          {headerSlot}
        </div>
      ) : null}

      <div className="flex flex-1 flex-col overflow-hidden bg-[color:color-mix(in_srgb,var(--surface)_94%,var(--surface-2))]">
        <div
          ref={messagesViewportRef}
          className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3 sm:px-4"
        >
          {groupedEntries.length ? (
            groupedEntries.map((group) => (
              <div key={group.key} className="space-y-2.5">
                <div className="flex justify-center">
                  <div className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-[11px] font-medium text-[var(--text-subtle)]">
                    {group.label}
                  </div>
                </div>
                {group.entries.map((entry) => (
                  <ConversationEntryCard
                    key={entry.id}
                    currentRole={currentRole}
                    currentUserId={currentUserId}
                    entry={entry}
                    users={users}
                  />
                ))}
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-4 py-6 text-center text-sm text-[var(--text-subtle)]">
              {emptyMessage}
            </div>
          )}
        </div>

        <div className="border-t border-[var(--border)] bg-[var(--surface)] pt-3">
          <div className="flex items-end gap-2">
            <div
              className={`flex min-w-0 flex-1 items-center border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 transition-all duration-200 ease-out ${
                isExpandedDraft ? "rounded-[1.4rem]" : "rounded-full"
              }`}
            >
              <div className="min-w-0 flex-1">
                <Label htmlFor="conversation-draft" className="sr-only">Viesti</Label>
                <textarea
                  ref={draftInputRef}
                  id="conversation-draft"
                  value={draft}
                  rows={1}
                  className="block max-h-28 min-h-0 w-full resize-none overflow-y-auto border-0 bg-transparent px-1 py-[5px] text-[15px] leading-5 text-[var(--text)] outline-none placeholder:text-[var(--text-subtle)] shadow-none focus:border-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                  onChange={(event) => {
                    setDraft(event.target.value);
                    if (message) {
                      setMessage("");
                      setMessageTone(null);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      if (!isSending && draft.trim()) {
                        void handleSend();
                      }
                    }
                  }}
                  placeholder={placeholder}
                />
              </div>
            </div>
            {draft.trim() || isSending ? (
              <Button
                type="button"
                variant="secondary"
                className="size-10 shrink-0 rounded-full !border-[var(--accent-strong)] !bg-[var(--accent-strong)] !px-0 !py-0 !text-[var(--accent-contrast)] shadow-[0_10px_24px_-18px_var(--accent)]"
                onClick={() => void handleSend()}
                disabled={isSending || !draft.trim()}
                aria-label={isSending ? "Lähetetään viestiä" : "Lähetä viesti"}
                title={isSending ? "Lähetetään..." : "Lähetä viesti"}
              >
                <ArrowUp className="size-4.5" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
          {message ? (
            <div className="mt-2">
              <InlineFeedback message={message} tone={messageTone} className="text-sm" />
            </div>
          ) : null}
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
}: {
  entry: ConversationEntry;
  users: AppState["users"];
  currentRole: Role;
  currentUserId: string;
}) {
  const author = users.find((user) => user.id === entry.authorUserId);
  const authorName =
    author?.fullName ??
    (entry.authorRole === "coach"
      ? "Valmentaja"
      : entry.authorRole === "athlete" || entry.authorRole === "independent_athlete"
        ? "Treenaaja"
        : "Käyttäjä");
  const unread =
    isConversationEntryNotifiable(entry) &&
    !entry.readByUserIds.includes(currentUserId) &&
    currentRole !== entry.authorRole;
  const isOwnMessage = entry.authorUserId === currentUserId;
  const avatarLabel = (isOwnMessage ? "Sinä" : authorName)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  const avatarSrc = author?.profileImageUrl
    ? `${author.profileImageUrl}${author.profileImageUrl.includes("?") ? "&" : "?"}v=${encodeURIComponent(author.updatedAt)}`
    : null;

  return (
    <div className={`flex items-end gap-2 ${isOwnMessage ? "justify-end" : "justify-start"}`}>
      {!isOwnMessage ? (
        <ConversationAvatar src={avatarSrc} label={avatarLabel} alt={authorName} />
      ) : null}
      <div
        className={`max-w-[min(34rem,80%)] rounded-[1.1rem] px-3 py-2 shadow-[0_8px_24px_-18px_var(--shadow)] ${
          isOwnMessage
            ? "border border-[color-mix(in_srgb,var(--accent)_24%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_14%,var(--surface))]"
            : "border border-[var(--border)] bg-[var(--surface)]"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          {!isOwnMessage ? <p className="text-[13px] font-semibold text-[var(--text)]">{authorName}</p> : null}
          {entry.type === "admin_message" ? (
            <Badge className={conversationTone(entry.type)}>{conversationLabel(entry.type)}</Badge>
          ) : null}
          {unread ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--accent)]">
              <span className="size-2 rounded-full bg-[var(--accent)]" aria-hidden="true" />
              Uusi
            </span>
          ) : null}
        </div>
        <p className="mt-1 whitespace-pre-line text-[15px] leading-6 text-[var(--text)]">{entry.body}</p>
        <div className="mt-1 flex items-center justify-end gap-1.5 text-[11px] text-[var(--text-subtle)]">
          {conversationIcon(entry.type)}
          <span>{formatConversationTime(entry.createdAt)}</span>
        </div>
      </div>
      {isOwnMessage ? (
        <ConversationAvatar src={avatarSrc} label={avatarLabel} alt="Sinä" />
      ) : null}
    </div>
  );
}

function ConversationAvatar({
  src,
  label,
  alt,
}: {
  src: string | null;
  label: string;
  alt: string;
}) {
  return (
    <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border-strong)] bg-[var(--surface)] text-[10px] font-semibold text-[var(--text-subtle)] shadow-[0_8px_18px_-20px_var(--shadow)]">
      {src ? (
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        <span aria-label={alt}>{label}</span>
      )}
    </div>
  );
}

function conversationLabel(type: ConversationEntry["type"]) {
  return type === "admin_message" ? "Admin" : "Kommentti";
}

function conversationTone(type: ConversationEntry["type"]) {
  return type === "admin_message"
    ? "border-[var(--accent-secondary)] bg-[var(--surface)] text-[var(--accent-secondary)]"
    : "border-[var(--accent)] bg-[var(--surface)] text-[var(--accent)]";
}

function conversationIcon(type: ConversationEntry["type"]) {
  return type === "admin_message"
    ? <Shield className="size-3.5" aria-hidden="true" />
    : <Clock3 className="size-3.5" aria-hidden="true" />;
}

function formatConversationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || "-";
  }

  return new Intl.DateTimeFormat("fi-FI", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getConversationComposerPlaceholder(currentRole: Role) {
  if (currentRole === "coach" || currentRole === "admin") {
    return "Kirjoita viesti...";
  }

  return "Kirjoita viesti...";
}
