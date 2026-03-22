"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Flame, LayoutDashboard, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import { isInviteExpired } from "@/lib/domain";
import { formatDate } from "@/lib/utils";
import { useAppState } from "@/providers/app-state-provider";

import { loginSchema } from "@/components/workout/schemas";
import { roleLabel } from "@/components/workout/shared";

export function LoginScreen() {
  const { login, loginAsDemoUser, state } = useAppState();
  const [error, setError] = useState<string | null>(null);
  const formId = useId();
  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "coach@rookiapp.fi",
      password: "demo123",
    },
  });

  const demoUsers = state.users.filter((user) => user.status === "active");
  const pendingInvites = state.invites.filter((invite) => invite.status === "pending");

  return (
    <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-6 px-4 py-10 lg:grid-cols-[1.15fr_0.85fr]">
      <section className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Badge className="border-[var(--accent-tertiary)] bg-[var(--surface-3)] text-[var(--accent-tertiary)]">
            white monster / powerlifting / anime progress
          </Badge>
          <Badge className="border-[var(--border)] bg-[var(--surface-3)] text-[var(--text)]">mobile-first</Badge>
          <Badge className="border-[var(--accent-secondary)] bg-[var(--surface-3)] text-[var(--accent-secondary)]">coach-first</Badge>
        </div>
        <div className="space-y-4">
          <h1 className="max-w-3xl font-[family-name:var(--font-display)] text-5xl font-semibold leading-tight text-[var(--text)] md:text-6xl">
            Valkoinen energia, rautainen progressio ja selkeä treeninhallinta samassa näkymässä.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-[var(--text-muted)]">
            Valmentaja rakentaa ohjelmat nopeasti, treenaaja kirjaa sarjat puhelimella ja koko
            valmennus pysyy selkeänä. Tyyli hakee White Monsterin kylmää energiaa, powerliftingin
            numerofokusta ja anime-arcin etenemisen tuntua.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: LayoutDashboard,
              title: "Program Arc",
              copy: "Rakentele ohjelmat blokkina ja toistuvana progression kaartena, ei irtonaisina treeneinä.",
            },
            {
              icon: Flame,
              title: "Lift Flow",
              copy: "Kuittaa sarjat, painot ja RPE yhdellä silmäyksellä ilman, että salin flow katkeaa.",
            },
            {
              icon: ShieldCheck,
              title: "Role Locked",
              copy: "Roolit, kutsut ja datamalli on tehty niin, että admin, coach ja treenaaja pysyvät selkeinä.",
            },
          ].map((item) => (
            <Card key={item.title} className="border-[var(--border-strong)] bg-[var(--surface)]">
              <item.icon className="mb-4 size-8 text-[var(--accent)]" />
              <CardTitle>{item.title}</CardTitle>
              <CardDescription className="mt-2 leading-6">{item.copy}</CardDescription>
            </Card>
          ))}
        </div>

        <Card className="border-[var(--border-strong)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Control panel</p>
              <CardTitle className="mt-2 text-2xl">Selkeä aloitus jokaiselle roolille</CardTitle>
              <CardDescription className="mt-2 max-w-2xl leading-6">
                Admin hallitsee kutsuja, coach rakentaa ohjelmat ja treenaaja seuraa päivän nostot.
                Jokaisessa näkymässä tärkein seuraava tehtävä on nostettu ensimmäiseksi.
              </CardDescription>
            </div>
            <div className="grid gap-3 text-sm text-[var(--text-muted)]">
              <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">1. Luo rosteri</div>
              <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">2. Rakenna ohjelma</div>
              <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">3. Seuraa progressia</div>
            </div>
          </div>
        </Card>
      </section>

      <section className="space-y-4">
        <Card className="border-[var(--border-strong)] bg-[var(--surface)]">
          <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Session Gate</p>
          <CardTitle>Kirjaudu sisään</CardTitle>
          <CardDescription className="mt-2">
            Demo-tilassa kaikki data tallentuu selaimen localStorageen. Oletussalasana demo-käyttäjille on `demo123`.
          </CardDescription>
          <form
            className="mt-6 space-y-4"
            onSubmit={form.handleSubmit((values) => {
              const result = login(values.email, values.password);
              if (!result.ok) {
                setError(result.message);
              } else {
                setError(null);
              }
            })}
          >
            <div>
              <Label htmlFor={`${formId}-email`}>Sähköposti</Label>
              <Input
                id={`${formId}-email`}
                type="email"
                autoComplete="email"
                aria-invalid={Boolean(form.formState.errors.email)}
                aria-describedby={form.formState.errors.email ? `${formId}-email-error` : undefined}
                {...form.register("email")}
              />
              {form.formState.errors.email ? (
                <p className="mt-2 text-sm text-[var(--danger)]" id={`${formId}-email-error`}>
                  {form.formState.errors.email.message}
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor={`${formId}-password`}>Salasana</Label>
              <Input
                id={`${formId}-password`}
                type="password"
                autoComplete="current-password"
                aria-invalid={Boolean(form.formState.errors.password)}
                aria-describedby={form.formState.errors.password ? `${formId}-password-error` : undefined}
                {...form.register("password")}
              />
              {form.formState.errors.password ? (
                <p className="mt-2 text-sm text-[var(--danger)]" id={`${formId}-password-error`}>
                  {form.formState.errors.password.message}
                </p>
              ) : null}
            </div>
            <p aria-live="polite" className="min-h-5 text-sm text-[var(--danger)]">
              {error ?? ""}
            </p>
            <Button className="w-full" type="submit">
              Siirry työtilaan
            </Button>
          </form>
        </Card>

        <Card>
          <CardTitle>Testikäyttäjät</CardTitle>
          <CardDescription className="mt-2">Avaa näkymä yhdellä painalluksella ja testaa eri roolit nopeasti.</CardDescription>
          <div className="mt-4 grid gap-3">
            {demoUsers.map((user) => (
              <button
                key={user.id}
                className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4 text-left transition hover:bg-[var(--surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
                onClick={() => loginAsDemoUser(user.id)}
                type="button"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-[var(--text)]">{user.fullName}</p>
                    <p className="text-sm text-[var(--text-muted)]">{user.email}</p>
                  </div>
                  <Badge>{roleLabel(user.role)}</Badge>
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle>Odottavat kutsut</CardTitle>
          <CardDescription className="mt-2">Kutsuvirta näkyy heti ilman erillistä hallintapaneelia.</CardDescription>
          <div className="mt-4 space-y-3">
            {pendingInvites.map((invite) => (
              <div key={invite.id} className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-[var(--text)]">{invite.email}</p>
                    <p className="text-sm text-[var(--text-muted)]">
                      {roleLabel(invite.role)} ·{" "}
                      {isInviteExpired(invite.expiresAt) ? "vanhentunut" : `vanhenee ${formatDate(invite.expiresAt)}`}
                    </p>
                  </div>
                  <Link
                    className="rounded-xl border-2 border-[var(--accent-strong)] bg-[var(--accent)] px-3 py-2 text-sm font-semibold tracking-[0.02em] text-white"
                    href={`/invite/${invite.token}`}
                  >
                    Avaa kutsu
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}
