"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import { useAppState } from "@/providers/app-state-provider";

import { inviteSchema } from "@/components/workout/schemas";

export function CoachInvitePanel() {
  const { currentUser, createInvite, getCoachAthletes, state } = useAppState();
  const formId = useId();
  const [inviteMessage, setInviteMessage] = useState<string>("");
  const athletes = currentUser ? getCoachAthletes(currentUser.id) : [];
  const form = useForm<z.infer<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: "",
      role: "athlete",
      coachId: currentUser?.id ?? "",
    },
  });

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
          <Button type="submit" className="w-full">
            Lähetä kutsu treenaajalle
          </Button>
        </form>
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
  );
}
