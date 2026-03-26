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
  const { login, loginAsDemoUser, requestPasswordResetForEmail, state, isAuthTransitionPending } = useAppState();
  const [error, setError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetMessageTone, setResetMessageTone] = useState<"success" | "error">("success");
  const [showLocalDemoUsers, setShowLocalDemoUsers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRequestingReset, setIsRequestingReset] = useState(false);
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
  const emailField = form.register("email");
  const passwordField = form.register("password");
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
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">rooki.fit</p>
          <h1 className="max-w-2xl font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight text-[var(--text)] md:text-5xl">
            Kirjaudu omaan treenityötilaasi
          </h1>
          <p className="max-w-xl text-lg leading-8 text-[var(--text-muted)]">
            Käytä samaa sähköpostia, jolla tilisi on aktivoitu. Kun kirjautuminen onnistuu, siirryt suoraan
            omaan työtilaasi.
          </p>
        </div>

        <Card className="border-[var(--border-strong)] bg-[var(--surface)]">
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Sisäänpääsy</p>
              <CardTitle className="mt-2 text-2xl">Selkeä eteneminen</CardTitle>
              <CardDescription className="mt-2 max-w-2xl leading-6">
                Tällä sivulla on kaksi toimintoa: kirjaudu sisään olemassa olevalla tunnuksella tai pyydä
                uusi salasanalinkki samalla sähköpostilla.
              </CardDescription>
            </div>
            <div className="grid gap-3 text-sm text-[var(--text-muted)]">
              <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">1. Syötä sähköposti ensin</p>
                <p className="mt-1 font-medium text-[var(--text)]">
                  Sama kenttä toimii sekä kirjautumiseen että salasanan nollaukseen.
                </p>
              </div>
              <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">2. Jos salasana on hukassa</p>
                <p className="mt-1 font-medium text-[var(--text)]">
                  Pyydä nollauslinkki suoraan lomakkeelta. Jos olet uusi käyttäjä, aktivoi tunnus ensin
                  kutsulinkistä.
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
            Aloita sähköpostiosoitteesta. Sen jälkeen voit joko kirjautua salasanalla tai pyytää uuden
            salasanalinkin.
          </CardDescription>
          <form
            className="mt-6 space-y-4"
            onSubmit={form.handleSubmit(async (values) => {
              if (requiresCaptcha && !captchaToken) {
                setError("Vahvista ensin captcha ennen kirjautumista.");
                return;
              }

              setIsSubmitting(true);
              setResetMessage(null);
              const result = await login(values.email, values.password, {
                captchaToken: captchaToken ?? undefined,
              });
              setIsSubmitting(false);
              if (requiresCaptcha && !result.ok) {
                captchaRef.current?.resetCaptcha();
                setCaptchaToken(null);
              }
              if (!result.ok) {
                setError(result.message);
                return;
              }

              setError(result.message ?? null);
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
                {...emailField}
                onChange={(event) => {
                  emailField.onChange(event);
                  setResetMessage(null);
                }}
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
                {...passwordField}
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
                {captchaError ? (
                  <p aria-live="polite" className="text-sm text-[var(--danger)]">
                    {captchaError}
                  </p>
                ) : null}
              </div>
            ) : null}
            {error && !isAuthTransitionPending ? (
              <p aria-live="polite" className="text-sm text-[var(--danger)]">
                {error}
              </p>
            ) : null}
            {isAuthTransitionPending ? (
              <p aria-live="polite" className="text-sm text-[var(--accent)]">
                Kirjautuminen onnistui. Avataan työtilaa...
              </p>
            ) : null}
            <Button
              className="w-full"
              type="submit"
              disabled={isSubmitting || isAuthTransitionPending || (requiresCaptcha && !captchaToken)}
              loading={isSubmitting}
              loadingText="Kirjaudutaan..."
            >
              Avaa työtila
            </Button>
            <div className="flex flex-col items-start gap-2">
              <Button
                type="button"
                variant="ghost"
                className="h-auto border-0 px-0 py-0 text-sm text-[var(--text-muted)] shadow-none hover:underline"
                disabled={isRequestingReset}
                loading={isRequestingReset}
                loadingText="Lähetetään nollauslinkkiä..."
                onClick={async () => {
                  const email = form.getValues("email").trim();
                  if (!email) {
                    form.setError("email", { message: "Anna sähköpostiosoite ensin." });
                    setResetMessage("Anna sähköpostiosoite ennen salasanan nollausta.");
                    setResetMessageTone("error");
                    return;
                  }

                  setError(null);
                  setIsRequestingReset(true);
                  try {
                    const result = await requestPasswordResetForEmail({
                      email,
                      captchaToken: captchaToken ?? undefined,
                    });
                    setResetMessage(result.message);
                    setResetMessageTone(result.ok ? "success" : "error");
                    if (requiresCaptcha) {
                      captchaRef.current?.resetCaptcha();
                      setCaptchaToken(null);
                    }
                  } finally {
                    setIsRequestingReset(false);
                  }
                }}
              >
                Unohditko salasanasi?
              </Button>
              <p className="text-xs text-[var(--text-subtle)]">Syötä sähköposti yllä ennen nollauslinkin tilaamista.</p>
              {resetMessage ? (
                <p
                  aria-live="polite"
                  className={`text-sm ${resetMessageTone === "success" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
                >
                  {resetMessage}
                </p>
              ) : null}
            </div>
            <p className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm leading-6 text-[var(--text-muted)]">
              Jos kirjautuminen ei onnistu, tarkista ensin sähköposti, salasana ja mahdollinen captcha.
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
