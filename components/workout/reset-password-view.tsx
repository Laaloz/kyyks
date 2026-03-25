"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import { resetPasswordSchema } from "@/components/workout/schemas";
import { useAppState } from "@/providers/app-state-provider";

export function ResetPasswordView({ token }: { token: string }) {
  const { completePasswordReset } = useAppState();
  const [message, setMessage] = useState<string>("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formId = useId();
  const form = useForm<z.infer<typeof resetPasswordSchema>>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  return (
    <div className="mx-auto flex min-h-screen max-w-xl items-center px-4 py-10">
      <Card className="w-full border-[var(--border-strong)]">
        <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Tietoturva</p>
        <CardTitle className="text-2xl">Aseta uusi salasana</CardTitle>
        <CardDescription className="mt-2">
          Linkki on kertakäyttöinen ja vanhenee automaattisesti. Käytä vähintään 8 merkin salasanaa.
        </CardDescription>

        <form
          className="mt-6 space-y-4"
          onSubmit={form.handleSubmit(async (values) => {
            setIsSubmitting(true);
            setMessage("");
            try {
              const result = await completePasswordReset(token, values.password);
              if (!result.ok) {
                setIsSuccess(false);
                setMessage(result.message);
                return;
              }

              setIsSuccess(true);
              setMessage("Salasana päivitettiin onnistuneesti. Voit nyt kirjautua sisään uudella salasanalla.");
              form.reset();
            } finally {
              setIsSubmitting(false);
            }
          })}
        >
          <fieldset className="space-y-4 rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4">
            <legend className="px-2 text-xs font-semibold tracking-[0.03em] text-[var(--text-subtle)]">
              Uusi salasana
            </legend>
            <div>
              <Label htmlFor={`${formId}-password`}>Salasana</Label>
              <Input
                id={`${formId}-password`}
                type="password"
                autoComplete="new-password"
                aria-invalid={Boolean(form.formState.errors.password)}
                aria-describedby={form.formState.errors.password ? `${formId}-password-error` : undefined}
                {...form.register("password")}
              />
              {form.formState.errors.password ? (
                <p id={`${formId}-password-error`} className="mt-2 text-sm text-[var(--danger)]">
                  {form.formState.errors.password.message}
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor={`${formId}-confirm-password`}>Vahvista salasana</Label>
              <Input
                id={`${formId}-confirm-password`}
                type="password"
                autoComplete="new-password"
                aria-invalid={Boolean(form.formState.errors.confirmPassword)}
                aria-describedby={form.formState.errors.confirmPassword ? `${formId}-confirm-password-error` : undefined}
                {...form.register("confirmPassword")}
              />
              {form.formState.errors.confirmPassword ? (
                <p id={`${formId}-confirm-password-error`} className="mt-2 text-sm text-[var(--danger)]">
                  {form.formState.errors.confirmPassword.message}
                </p>
              ) : null}
            </div>
          </fieldset>

          <p
            aria-live="polite"
            className={`min-h-5 text-sm ${
              isSubmitting
                ? "text-[var(--text-subtle)]"
                : !message
                  ? "text-[var(--text-subtle)]"
                  : isSuccess
                    ? "text-[var(--success)]"
                    : "text-[var(--danger)]"
            }`}
          >
            {isSubmitting ? "Päivitetään salasanaa..." : message || "Anna uusi salasana ja vahvista se."}
          </p>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={isSubmitting} loading={isSubmitting} loadingText="Päivitetään salasanaa...">
              Päivitä salasana
            </Button>
            <Link
              href="/"
              className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5 text-sm font-semibold text-[var(--text)]"
            >
              Takaisin kirjautumiseen
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
