"use client";

import HCaptcha from "@hcaptcha/react-hcaptcha";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import { InlineFeedback } from "@/components/workout/inline-feedback";
import { hCaptchaSiteKey, isHCaptchaConfigured, isSupabaseConfigured } from "@/lib/config";
import { useAppState } from "@/providers/app-state-provider";

import { loginSchema } from "@/components/workout/schemas";
import { roleLabel } from "@/components/workout/shared";

export function LoginScreen() {
  const { login, loginAsDemoUser, requestPasswordResetForEmail, state, currentUser, isAuthTransitionPending } = useAppState();
  const [error, setError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetMessageTone, setResetMessageTone] = useState<"success" | "error">("success");
  const [showLocalDemoUsers, setShowLocalDemoUsers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAwaitingWorkspace, setIsAwaitingWorkspace] = useState(false);
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

  useEffect(() => {
    if (currentUser) {
      setIsAwaitingWorkspace(false);
    }
  }, [currentUser]);

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-7 px-5 py-12">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">rooki.fit</p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold leading-tight text-[var(--text)]">
          Kirjaudu treenityötilaasi
        </h1>
        <p className="text-base leading-7 text-[var(--text-muted)]">
          Käytä samaa sähköpostia, jolla tilisi aktivoitiin. Uusi käyttäjä aktivoi tunnuksen kutsulinkistä.
        </p>
      </header>

      <Card className="space-y-5">
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit(async (values) => {
            if (requiresCaptcha && !captchaToken) {
              setError("Vahvista ensin captcha ennen kirjautumista.");
              return;
            }

            setIsSubmitting(true);
            setIsAwaitingWorkspace(false);
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
              setIsAwaitingWorkspace(false);
              setError(result.message);
              return;
            }

            setIsAwaitingWorkspace(true);
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
          {isAuthTransitionPending || isAwaitingWorkspace ? (
            <InlineFeedback tone="info" message="Kirjautuminen onnistui. Avataan työtilaa..." className="text-sm" />
          ) : null}
          <Button
            className="w-full"
            type="submit"
            disabled={isSubmitting || isAuthTransitionPending || isAwaitingWorkspace || (requiresCaptcha && !captchaToken)}
            loading={isSubmitting || isAuthTransitionPending || isAwaitingWorkspace}
            loadingText={isAuthTransitionPending || isAwaitingWorkspace ? "Avataan työtilaa..." : "Kirjaudutaan..."}
          >
            Avaa työtila
          </Button>
        </form>

        <div className="space-y-2 border-t border-[var(--border)] pt-4">
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
            <InlineFeedback message={resetMessage} tone={resetMessageTone === "success" ? "success" : "danger"} className="text-sm" />
          ) : null}
        </div>
      </Card>

      {showLocalDemoUsers ? (
        <Card className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-[family-name:var(--font-display)] text-base font-bold text-[var(--text)]">Demotunnukset</p>
              <p className="mt-0.5 text-sm text-[var(--text-subtle)]">Näkyy vain localhostissa nopeaan roolitestaukseen.</p>
            </div>
            <Badge className="shrink-0 border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]">vain lokaalissa</Badge>
          </div>

          <div className="flex flex-col gap-2">
            {demoUsers.map((user) => (
              <button
                key={user.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-2)] p-3.5 text-left transition hover:bg-[var(--surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
                onClick={() => loginAsDemoUser(user.id)}
                type="button"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-[var(--text)]">{user.fullName}</p>
                  <p className="truncate text-sm text-[var(--text-muted)]">{user.email}</p>
                </div>
                <Badge className="shrink-0">{roleLabel(user.role)}</Badge>
              </button>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
