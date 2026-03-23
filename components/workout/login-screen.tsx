"use client";

import HCaptcha from "@hcaptcha/react-hcaptcha";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import { hCaptchaSiteKey, isHCaptchaConfigured, isSupabaseConfigured } from "@/lib/config";
import { useAppState } from "@/providers/app-state-provider";

import { loginSchema } from "@/components/workout/schemas";
import { roleLabel } from "@/components/workout/shared";

export function LoginScreen() {
  const { login, loginAsDemoUser, state } = useAppState();
  const [error, setError] = useState<string | null>(null);
  const [showLocalDemoUsers, setShowLocalDemoUsers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const captchaRef = useRef<HCaptcha | null>(null);
  const formId = useId();
  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });
  const demoUsers = state.users.filter((user) => user.status === "active");
  const requiresCaptcha = isSupabaseConfigured && isHCaptchaConfigured && !showLocalDemoUsers;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const hostname = window.location.hostname;
    setShowLocalDemoUsers(
      hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1" ||
        hostname.endsWith(".local"),
    );
  }, []);

  return (
    <div className="mx-auto grid min-h-screen max-w-5xl gap-6 px-4 py-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
      <section className="space-y-6">
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">Rookiapp</p>
          <h1 className="max-w-2xl font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight text-[var(--text)] md:text-5xl">
            Kirjaudu omaan treenityötilaasi.
          </h1>
          <p className="max-w-xl text-lg leading-8 text-[var(--text-muted)]">
            Tämä näkymä on tarkoitettu jo hyväksytyille käyttäjille. Kun tilisi on luotu tai kutsu on aktivoitu,
            pääset tästä suoraan omaan näkymääsi.
          </p>
        </div>

        <Card className="border-[var(--border-strong)] bg-[var(--surface)]">
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Sisäänpääsy</p>
              <CardTitle className="mt-2 text-2xl">Näin pääset sisään</CardTitle>
              <CardDescription className="mt-2 max-w-2xl leading-6">
                Tämä sivu on kirjautumisportti olemassa oleville käyttäjille. Näytämme tässä vain sen tiedon, jota
                tarvitset päästäksesi omaan työtilaasi ilman ylimääräistä sisältöä.
              </CardDescription>
            </div>
            <div className="grid gap-3 text-sm text-[var(--text-muted)]">
              <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">1. Käyttöoikeus</p>
                <p className="mt-1 font-medium text-[var(--text)]">
                  Ylläpito lisää käyttäjän palveluun ja määrittää oikean roolin ennen ensimmäistä kirjautumista.
                </p>
              </div>
              <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">2. Kutsu tai tunnus</p>
                <p className="mt-1 font-medium text-[var(--text)]">
                  Uusi käyttäjä aktivoi tilin kutsulinkistä. Sen jälkeen sisään kirjaudutaan omalla sähköpostilla ja
                  salasanalla.
                </p>
              </div>
              <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">3. Jos et pääse sisään</p>
                <p className="mt-1 font-medium text-[var(--text)]">
                  Tarkista ensin sähköposti ja salasana. Jos ongelma jatkuu, pyydä ylläpidolta uusi kutsu tai
                  salasanan nollauslinkki.
                </p>
              </div>
            </div>
          </div>
        </Card>
      </section>

      <section className="space-y-4">
        <Card className="border-[var(--border-strong)] bg-[var(--surface)]">
          <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Kirjautuminen</p>
          <CardTitle>Kirjaudu sisään</CardTitle>
          <CardDescription className="mt-2">
            Käytä sähköpostia ja salasanaa, jotka on liitetty käyttäjätiliisi. Jos tiliäsi ei ole vielä aktivoitu,
            aloita saamastasi kutsulinkistä.
          </CardDescription>
          <form
            className="mt-6 space-y-4"
            onSubmit={form.handleSubmit(async (values) => {
              if (requiresCaptcha && !captchaToken) {
                setError("Vahvista ensin captcha ennen kirjautumista.");
                return;
              }

              setIsSubmitting(true);
              const result = await login(values.email, values.password, {
                captchaToken: captchaToken ?? undefined,
              });
              setIsSubmitting(false);
              if (requiresCaptcha) {
                captchaRef.current?.resetCaptcha();
                setCaptchaToken(null);
              }
              if (!result.ok) {
                setError(result.message);
                return;
              }

              setError(null);
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
            {requiresCaptcha ? (
              <div className="space-y-2">
                <HCaptcha
                  ref={captchaRef}
                  sitekey={hCaptchaSiteKey}
                  theme="light"
                  onVerify={(token) => {
                    setCaptchaToken(token);
                    setCaptchaError(null);
                    setError(null);
                  }}
                  onExpire={() => {
                    setCaptchaToken(null);
                    setCaptchaError("Captcha vanheni. Vahvista se uudelleen.");
                  }}
                  onError={() => {
                    setCaptchaToken(null);
                    setCaptchaError("Captcha ei latautunut oikein. Kokeile päivittää sivu.");
                  }}
                />
                <p aria-live="polite" className="min-h-5 text-sm text-[var(--danger)]">
                  {captchaError ?? ""}
                </p>
              </div>
            ) : null}
            <p aria-live="polite" className="min-h-5 text-sm text-[var(--danger)]">
              {error ?? ""}
            </p>
            <Button className="w-full" type="submit" disabled={isSubmitting || (requiresCaptcha && !captchaToken)}>
              {isSubmitting ? "Kirjaudutaan..." : "Avaa työtila"}
            </Button>
            <p className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm leading-6 text-[var(--text-muted)]">
              Etkö pääse sisään? Tarkista ensin, että käytät oikeaa sähköpostiosoitetta. Jos ongelma jatkuu, pyydä
              ylläpidolta uusi kutsu tai salasanan nollaus.
            </p>
          </form>
        </Card>

        {showLocalDemoUsers ? (
          <Card className="border-[var(--border-strong)] bg-[var(--surface)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Lokaali kehitys</p>
                <CardTitle className="mt-2">Demotunnukset</CardTitle>
                <CardDescription className="mt-2">
                  Tämä lista näkyy vain localhostissa, jotta eri roolit saa nopeasti auki testauksen aikana.
                </CardDescription>
              </div>
              <Badge className="border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]">vain lokaalissa</Badge>
            </div>

            <div className="mt-4 grid gap-3">
              {demoUsers.map((user) => (
                <button
                  key={user.id}
                  className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4 text-left transition hover:bg-[var(--surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
                  onClick={() => loginAsDemoUser(user.id)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
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
        ) : null}
      </section>
    </div>
  );
}
