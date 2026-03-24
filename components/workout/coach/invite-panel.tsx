"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import { getInviteLifecycleLabel, getVisiblePendingInvites } from "@/lib/invite-status";
import { useAppState } from "@/providers/app-state-provider";

import { inviteSchema } from "@/components/workout/schemas";

export function CoachInvitePanel() {
  const { currentUser, createInvite, getCoachAthletes, resendInvite, state } = useAppState();
  const formId = useId();
  const [inviteMessage, setInviteMessage] = useState<string>("");
  const [resendMessage, setResendMessage] = useState<string>("");
  const [resendingInviteId, setResendingInviteId] = useState<string | null>(null);
  const athletes = currentUser ? getCoachAthletes(currentUser.id) : [];
  const pendingInvites = getVisiblePendingInvites(state.invites, state.users).filter(
    (invite) => invite.invitedBy === currentUser?.id,
  );
  const form = useForm<z.infer<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: "",
      role: "athlete",
      coachId: currentUser?.id ?? "",
    },
  });
  const isSendingInvite = form.formState.isSubmitting;

  return (
    <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
      <Card>
        <CardTitle>Kutsu uusi treenaaja</CardTitle>
        <CardDescription className="mt-2">
          Valmentaja voi lisätä oman asiakkaansa suoraan palveluun. Kutsu muodostaa samalla valmentaja-treenaaja-suhteen.
        </CardDescription>
        <form
          className="mt-6 space-y-4"
          onSubmit={form.handleSubmit(async (values) => {
            const result = await createInvite({
              email: values.email,
              role: "athlete",
              coachId: currentUser?.id,
            });
            setInviteMessage(result.ok ? `Kutsu lähetettiin osoitteeseen ${values.email}.` : result.message);
            setResendMessage("");
            if (result.ok) {
              form.reset({ email: "", role: "athlete", coachId: currentUser?.id });
            }
          })}
        >
          <div>
            <Label htmlFor={`${formId}-coach-athlete-email`}>Treenaajan sähköposti</Label>
            <Input
              id={`${formId}-coach-athlete-email`}
              autoComplete="email"
              {...form.register("email")}
              placeholder="asiakas@example.com"
            />
          </div>
          <p
            aria-live="polite"
            className={`min-h-5 text-sm ${inviteMessage.includes("lähetettiin") ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
          >
            {inviteMessage}
          </p>
          <Button
            type="submit"
            className="w-full"
            loading={isSendingInvite}
            loadingText="Lähetetään kutsua..."
          >
            Lähetä kutsu treenaajalle
          </Button>
        </form>
      </Card>

      <div className="grid gap-6">
        <Card>
          <CardTitle>Avoimet kutsut</CardTitle>
          <CardDescription className="mt-2">
            Jos kutsu luotiin jo aiemmin, voit lähettää sen tästä uudelleen samaan osoitteeseen.
          </CardDescription>
          <p
            aria-live="polite"
            className={`mt-4 min-h-5 text-sm ${resendMessage.includes("lähetettiin") ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
          >
            {resendMessage}
          </p>
          <div className="mt-4 grid gap-3">
            {pendingInvites.length === 0 ? (
              <p className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-muted)]">
                Avoimia kutsuja ei ole tällä hetkellä.
              </p>
            ) : (
              pendingInvites.map((invite) => (
                <div key={invite.id} className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-medium text-[var(--text)]">{invite.email}</p>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">Treenaajakutsu on avoinna.</p>
                      <p className="mt-1 text-xs font-medium text-[var(--text-subtle)]">
                        {getInviteLifecycleLabel(invite.status)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        className="inline-flex items-center rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-semibold text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
                        href={`/invite/${invite.token}`}
                      >
                        Avaa kutsu
                      </Link>
                      <Button
                        type="button"
                        variant="secondary"
                        className="text-sm"
                        loading={resendingInviteId === invite.id}
                        loadingText="Lähetetään..."
                        onClick={async () => {
                          setResendingInviteId(invite.id);
                          try {
                            const result = await resendInvite(invite.id);
                            setResendMessage(result.ok ? `Kutsu lähetettiin uudelleen osoitteeseen ${invite.email}.` : result.message);
                          } finally {
                            setResendingInviteId(null);
                          }
                        }}
                      >
                        Lähetä uudelleen
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <CardTitle>Oma rosteri</CardTitle>
          <div className="mt-5 grid gap-3">
            {athletes.map((athlete) => (
              <div key={athlete.id} className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-[var(--text)]">{athlete.fullName}</p>
                    <p className="text-sm text-[var(--text-muted)]">{athlete.email}</p>
                  </div>
                  <Badge>
                    {
                      state.scheduledWorkouts.filter(
                        (workout) =>
                          workout.coachId === currentUser?.id &&
                          workout.athleteId === athlete.id &&
                          workout.status !== "completed",
                      ).length
                    }{" "}
                    avointa
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
