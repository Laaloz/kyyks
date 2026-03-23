"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays, ClipboardPenLine, ShieldCheck, UserRoundPlus } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { formatDate } from "@/lib/utils";
import { useAppState } from "@/providers/app-state-provider";

import { inviteSchema } from "@/components/workout/schemas";
import { MetricGrid, roleLabel, type WorkspaceView } from "@/components/workout/shared";

export function AdminDashboard({ view }: { view: WorkspaceView }) {
  const { currentUser, state, createInvite } = useAppState();
  const formId = useId();
  const [inviteMessage, setInviteMessage] = useState<string>("");
  const coaches = state.users.filter((user) => user.role === "coach");
  const athletes = state.users.filter((user) => user.role === "athlete");
  const pendingInvites = state.invites.filter((invite) => invite.status === "pending");
  const form = useForm<z.infer<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: "",
      role: "coach",
      coachId: coaches[0]?.id ?? "",
    },
  });

  const selectedRole = form.watch("role");

  return (
    <div className="grid gap-6">
      {view === "overview" ? (
        <>
          <MetricGrid
            metrics={[
              { label: "Valmentajat", value: coaches.length, icon: ShieldCheck },
              { label: "Treenaajat", value: athletes.length, icon: UserRoundPlus },
              { label: "Aktiiviset treenit", value: state.scheduledWorkouts.length, icon: CalendarDays },
              { label: "Avoimet kutsut", value: pendingInvites.length, icon: ClipboardPenLine },
            ]}
            role={currentUser?.role ?? null}
          />

          <Card className="border-[var(--border-strong)]">
            <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr] xl:items-end">
              <div className="space-y-3">
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Hallintanäkymä</p>
                <CardTitle className="text-2xl">Pidä valmennusverkko hallinnassa yhdestä paikasta</CardTitle>
                <CardDescription className="max-w-3xl leading-6">
                  Yleiskuva näyttää nopeasti verkoston tilan ja valmennuskuormituksen ilman erillistä raportointia.
                </CardDescription>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
                <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
                  <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">1. Tarkista</p>
                  <p className="mt-2 text-sm font-medium text-[var(--text)]">Kuormitus</p>
                </div>
                <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
                  <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">2. Tunnista</p>
                  <p className="mt-2 text-sm font-medium text-[var(--text)]">Pullonkaulat</p>
                </div>
                <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
                  <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">3. Siirry</p>
                  <p className="mt-2 text-sm font-medium text-[var(--text)]">Kutsuihin</p>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Rosteri</p>
            <CardTitle className="text-2xl">Valmentajien rosterit</CardTitle>
            <CardDescription className="mt-2">
              Näet nopeasti kunkin valmentajan aktiivisen rosterin koon ja pystyt tunnistamaan kuormituksen.
            </CardDescription>
            <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {coaches.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">Valmentajia ei ole vielä lisätty.</p>
              ) : (
                coaches.map((coach) => {
                  const athleteCount = state.assignments.filter(
                    (assignment) => assignment.coachId === coach.id && assignment.active,
                  ).length;
                  return (
                    <div key={coach.id} className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-5">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="font-medium text-[var(--text)]">{coach.fullName}</p>
                          <p className="text-sm text-[var(--text-muted)]">{coach.email}</p>
                        </div>
                        <Badge>{athleteCount} treenaajaa</Badge>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </>
      ) : null}

      {view === "invites" ? (
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="border-[var(--border-strong)]">
            <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Käyttäjähallinta</p>
            <CardTitle className="text-2xl">Lähetä uusi kutsu</CardTitle>
            <CardDescription className="mt-2">
              Ylläpitäjä voi kutsua uuden valmentajan tai treenaajan. Treenaajalle voi samalla valita vastuuvalmentajan.
            </CardDescription>
            <form
              className="mt-6 space-y-4"
              onSubmit={form.handleSubmit((values) => {
                const result = createInvite(values);
                setInviteMessage(result.ok ? `Kutsu lähetetty osoitteeseen ${values.email}.` : result.message);
                if (result.ok) {
                  form.reset({ email: "", role: values.role, coachId: values.coachId });
                }
              })}
            >
              <div>
                <Label htmlFor={`${formId}-invite-email`}>Sähköposti</Label>
                <Input
                  id={`${formId}-invite-email`}
                  autoComplete="email"
                  aria-invalid={Boolean(form.formState.errors.email)}
                  aria-describedby={form.formState.errors.email ? `${formId}-invite-email-error` : undefined}
                  {...form.register("email")}
                  placeholder="etunimi@sähköposti.fi"
                />
                {form.formState.errors.email ? (
                  <p className="mt-2 text-sm text-[var(--danger)]" id={`${formId}-invite-email-error`}>
                    {form.formState.errors.email.message}
                  </p>
                ) : null}
              </div>
              <fieldset className="grid gap-4 rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4 md:grid-cols-2">
                <legend className="px-2 text-xs font-semibold tracking-[0.03em] text-[var(--text-subtle)]">Rooliasetukset</legend>
                <div>
                  <Label htmlFor={`${formId}-invite-role`}>Rooli</Label>
                  <Select id={`${formId}-invite-role`} {...form.register("role")}>
                    <option value="coach">Valmentaja</option>
                    <option value="athlete">Treenaaja</option>
                  </Select>
                </div>
                {selectedRole === "athlete" ? (
                  <div>
                    <Label htmlFor={`${formId}-invite-coach`}>Vastuuvalmentaja</Label>
                    <Select
                      id={`${formId}-invite-coach`}
                      aria-invalid={Boolean(form.formState.errors.coachId)}
                      aria-describedby={form.formState.errors.coachId ? `${formId}-invite-coach-error` : undefined}
                      {...form.register("coachId")}
                    >
                      <option value="">Valitse valmentaja</option>
                      {coaches.map((coach) => (
                        <option key={coach.id} value={coach.id}>
                          {coach.fullName}
                        </option>
                      ))}
                    </Select>
                    {form.formState.errors.coachId ? (
                      <p className="mt-2 text-sm text-[var(--danger)]" id={`${formId}-invite-coach-error`}>
                        {form.formState.errors.coachId.message}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </fieldset>
              <p
                aria-live="polite"
                className={`min-h-5 text-sm ${inviteMessage.includes("lähetetty") ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
              >
                {inviteMessage}
              </p>
              <Button type="submit" className="w-full">
                Lähetä kutsu
              </Button>
            </form>
          </Card>

          <Card>
            <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Kutsutilanne</p>
            <CardTitle className="text-2xl">Avoimet kutsut</CardTitle>
            <CardDescription className="mt-2">
              Seuraa, mikä kutsu on avoinna, ja avaa liittymislinkki tarvittaessa uudelleen.
            </CardDescription>
            <div className="mt-4 grid gap-3">
              {pendingInvites.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">Avoimia kutsuja ei ole tällä hetkellä.</p>
              ) : (
                pendingInvites.map((invite) => (
                  <div key={invite.id} className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-[var(--text)]">{invite.email}</p>
                        <p className="mt-1 text-sm text-[var(--text-muted)]">
                          {roleLabel(invite.role)} · vanhenee {formatDate(invite.expiresAt)}
                        </p>
                      </div>
                      <Link className="text-sm font-semibold text-[var(--accent)]" href={`/invite/${invite.token}`}>
                        Avaa kutsu
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
