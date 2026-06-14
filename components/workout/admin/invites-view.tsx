"use client";

import Link from "next/link";
import { Send, UserPlus, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { useHeaderAction } from "@/components/workout/header-action";
import { getInviteLifecycleLabel, getVisiblePendingInvites } from "@/lib/invite-status";
import { withMinimumDelay } from "@/lib/min-delay";
import type { Role } from "@/lib/types";
import { isAdminRole } from "@/lib/role-access";
import { useAppState } from "@/providers/app-state-provider";

const roleLabels: Record<"athlete" | "independent_athlete" | "coach", string> = {
  athlete: "Valmennettava",
  independent_athlete: "Itsenäinen treenaaja",
  coach: "Valmentaja",
};

export function AdminInvitesView() {
  const { currentUser, state, createInvite, resendInvite, notify } = useAppState();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"athlete" | "independent_athlete" | "coach">("athlete");
  const [coachId, setCoachId] = useState<string>(currentUser?.id ?? "");
  const [isSending, setIsSending] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);

  useHeaderAction(
    "invites",
    {
      label: "Kutsu käyttäjä",
      icon: UserPlus,
      onClick: () => setIsFormOpen((open) => !open),
    },
  );

  const pendingInvites = useMemo(
    () => getVisiblePendingInvites(state.invites, state.users),
    [state.invites, state.users],
  );
  const coaches = useMemo(
    () => state.users.filter((user) => (user.role === "coach" || isAdminRole(user.role)) && user.status === "active"),
    [state.users],
  );
  const userNameById = useMemo(() => new Map(state.users.map((user) => [user.id, user.fullName])), [state.users]);
  const needsCoach = role === "athlete" || role === "independent_athlete";

  const handleSend = async () => {
    if (!email.trim()) {
      return;
    }
    setIsSending(true);
    const result = await withMinimumDelay(
      createInvite({ email: email.trim(), role: role as Exclude<Role, "admin">, coachId: needsCoach ? coachId : undefined }),
    );
    setIsSending(false);
    notify({
      tone: result.ok ? "success" : "danger",
      message: result.ok ? `Kutsu lähetettiin osoitteeseen ${email.trim()}.` : result.message,
    });
    if (result.ok) {
      setEmail("");
      setIsFormOpen(false);
    }
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      {isFormOpen ? (
        <Card className="border-[var(--border-strong)]">
          <div className="flex items-start justify-between gap-3">
            <p className="font-[family-name:var(--font-display)] text-base font-bold text-[var(--text)]">Kutsu käyttäjä</p>
            <button
              type="button"
              className="grid size-8 shrink-0 place-items-center rounded-full text-[var(--text-subtle)] transition hover:bg-[var(--surface-2)]"
              aria-label="Sulje"
              onClick={() => setIsFormOpen(false)}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
          <div className="mt-3 space-y-3">
            <div>
              <Label htmlFor="admin-invite-email">Sähköposti</Label>
              <Input
                id="admin-invite-email"
                type="email"
                autoComplete="email"
                placeholder="kayttaja@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="admin-invite-role">Rooli</Label>
                <Select
                  id="admin-invite-role"
                  value={role}
                  onChange={(event) => setRole(event.target.value as typeof role)}
                >
                  <option value="athlete">{roleLabels.athlete}</option>
                  <option value="independent_athlete">{roleLabels.independent_athlete}</option>
                  <option value="coach">{roleLabels.coach}</option>
                </Select>
              </div>
              {needsCoach ? (
                <div>
                  <Label htmlFor="admin-invite-coach">Valmentaja</Label>
                  <Select
                    id="admin-invite-coach"
                    value={coachId}
                    onChange={(event) => setCoachId(event.target.value)}
                  >
                    {coaches.map((coach) => (
                      <option key={coach.id} value={coach.id}>
                        {coach.id === currentUser?.id ? `${coach.fullName} (sinä)` : coach.fullName}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
            </div>
            <Button type="button" className="w-full gap-2" loading={isSending} loadingText="Lähetetään…" onClick={handleSend}>
              <Send className="size-4" aria-hidden="true" />
              Lähetä kutsu
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="mb-2 mt-4 px-1 first:mt-0">
        <span className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-subtle)]">
          Avoimet kutsut
        </span>
      </div>
      {pendingInvites.length ? (
        <Card className="divide-y divide-[var(--border)] p-0">
          {pendingInvites.map((invite) => (
            <div key={invite.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-[family-name:var(--font-display)] text-[15px] font-bold text-[var(--text)]">
                  {invite.email}
                </p>
                <p className="truncate text-[12.5px] text-[var(--text-subtle)]">
                  {roleLabels[invite.role] ?? invite.role}
                  {invite.coachId ? ` · ${(userNameById.get(invite.coachId) ?? "").split(/\s+/)[0]}` : ""} ·{" "}
                  {getInviteLifecycleLabel(invite.status)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Link
                  href={`/invite/${invite.token}`}
                  className="rounded-full border border-[var(--border)] bg-[var(--surface-3)] px-3 py-1 text-xs font-semibold text-[var(--text-subtle)] transition hover:text-[var(--text)]"
                >
                  Avaa
                </Link>
                <Button
                  type="button"
                  variant="secondary"
                  className="!h-8 !px-3 text-xs"
                  loading={resendingId === invite.id}
                  loadingText="…"
                  onClick={async () => {
                    setResendingId(invite.id);
                    try {
                      const result = await withMinimumDelay(resendInvite(invite.id));
                      notify({
                        tone: result.ok ? "success" : "danger",
                        message: result.ok ? `Kutsu lähetettiin uudelleen osoitteeseen ${invite.email}.` : result.message,
                      });
                    } finally {
                      setResendingId(null);
                    }
                  }}
                >
                  Lähetä uudelleen
                </Button>
              </div>
            </div>
          ))}
        </Card>
      ) : (
        <Card>
          <CardDescription>Avoimia kutsuja ei ole. Kutsu uusi käyttäjä yläpalkin painikkeesta.</CardDescription>
        </Card>
      )}
    </div>
  );
}
