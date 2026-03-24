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
import { isInviteExpired } from "@/lib/domain";
import { useAppState } from "@/providers/app-state-provider";

import { acceptInviteSchema } from "@/components/workout/schemas";
import { roleLabel } from "@/components/workout/shared";

type InviteLookup = {
  email: string;
  role: "coach" | "athlete";
  coachId?: string | null;
  expiresAt: string;
  status: "pending" | "accepted";
};

export function InviteAcceptView({ token, initialInvite }: { token: string; initialInvite?: InviteLookup | null }) {
  const { state, acceptInvite } = useAppState();
  const invite =
    state.invites.find((item) => item.token === token) ??
    (initialInvite
      ? {
          token,
          email: initialInvite.email,
          role: initialInvite.role,
          coachId: initialInvite.coachId,
          expiresAt: initialInvite.expiresAt,
          status: initialInvite.status,
        }
      : null);
  const [message, setMessage] = useState<string | null>(null);
  const formId = useId();
  const form = useForm<z.infer<typeof acceptInviteSchema>>({
    resolver: zodResolver(acceptInviteSchema),
    defaultValues: {
      fullName: "",
      password: "",
    },
  });

  if (!invite) {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl items-center px-4">
        <Card className="w-full border-[var(--border-strong)]">
          <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Kutsun tila</p>
          <CardTitle>Kutsua ei löytynyt</CardTitle>
          <CardDescription className="mt-3">
            Tarkista linkki tai luo uusi kutsu admin- tai coach-näkymästä.
          </CardDescription>
          <Link className="mt-5 inline-block text-sm font-semibold text-[var(--accent)]" href="/">
            Palaa etusivulle
          </Link>
        </Card>
      </div>
    );
  }

  const expired = invite.status !== "pending" || isInviteExpired(invite.expiresAt);

  return (
    <div className="mx-auto flex min-h-screen max-w-xl items-center px-4 py-10">
      <Card className="w-full border-[var(--border-strong)]">
        <Badge>{roleLabel(invite.role)}</Badge>
        <p className="mt-4 text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Käyttöönotto</p>
        <CardTitle className="text-2xl">Viimeistele tunnus</CardTitle>
        <CardDescription className="mt-2">
          Kutsu osoitteeseen {invite.email}. Luo nimi ja salasana, niin pääset heti treenialustalle.
        </CardDescription>
        {expired ? (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-[var(--danger)]">Tämä kutsu on vanhentunut. Pyydä uusi kutsu adminilta tai valmentajalta.</p>
            <Link className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5 text-sm font-semibold text-[var(--text)]" href="/">
              Takaisin etusivulle
            </Link>
          </div>
        ) : (
          <form
            className="mt-6 space-y-4"
            onSubmit={form.handleSubmit(async (values) => {
              const result = await acceptInvite(token, values.fullName, values.password);
              setMessage(result.ok ? "Tunnus aktivoitiin. Voit nyt siirtyä työtilaan." : result.message);
            })}
          >
            <fieldset className="space-y-4 rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4">
              <legend className="px-2 text-xs font-semibold tracking-[0.03em] text-[var(--text-subtle)]">Perustiedot</legend>
              <div>
                <Label htmlFor={`${formId}-full-name`}>Koko nimi</Label>
                <Input id={`${formId}-full-name`} autoComplete="name" {...form.register("fullName")} />
              </div>
              <div>
                <Label htmlFor={`${formId}-new-password`}>Salasana</Label>
                <Input id={`${formId}-new-password`} type="password" autoComplete="new-password" {...form.register("password")} />
              </div>
            </fieldset>
            <p aria-live="polite" className="min-h-5 text-sm text-[var(--text-muted)]">
              {message ?? ""}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button type="submit">Aktivoi tunnus</Button>
              <Link className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5 text-sm font-semibold text-[var(--text)]" href="/">
                Takaisin etusivulle
              </Link>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
