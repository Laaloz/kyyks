"use client";

import HCaptcha from "@hcaptcha/react-hcaptcha";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { hCaptchaSiteKey, isHCaptchaConfigured, isSupabaseConfigured } from "@/lib/config";
import { isInviteExpired } from "@/lib/domain";
import { useAppState } from "@/providers/app-state-provider";

import { acceptInviteSchema } from "@/components/workout/schemas";
import { roleLabel } from "@/components/workout/shared";

type InviteLookup = {
  email: string;
  role: "coach" | "athlete" | "independent_athlete";
  coachId?: string | null;
  expiresAt: string;
  status: "pending" | "accepted";
};

export function InviteAcceptView({ token, initialInvite }: { token: string; initialInvite?: InviteLookup | null }) {
  const { state, acceptInvite } = useAppState();
  const router = useRouter();
  const invite =
    (initialInvite
      ? {
          token,
          email: initialInvite.email,
          role: initialInvite.role,
          coachId: initialInvite.coachId,
          expiresAt: initialInvite.expiresAt,
          status: initialInvite.status,
        }
      : state.invites.find((item) => item.token === token)) ??
    null;
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "danger">("success");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const captchaRef = useRef<HCaptcha | null>(null);
  const formId = useId();
  const requiresCaptcha = isSupabaseConfigured && isHCaptchaConfigured;
  const form = useForm<z.input<typeof acceptInviteSchema>, unknown, z.output<typeof acceptInviteSchema>>({
    resolver: zodResolver(acceptInviteSchema),
    defaultValues: {
      fullName: "",
      password: "",
      age: undefined,
      sex: undefined,
      heightCm: undefined,
      weightKg: undefined,
    },
  });

  if (!invite) {
    return (
      <div className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-6 px-5 py-12">
        <Card className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-subtle)]">Kutsun tila</p>
          <CardTitle>Kutsua ei löytynyt</CardTitle>
          <CardDescription className="leading-6">
            Tarkista linkki tai pyydä uusi kutsu valmentajalta tai ylläpidolta.
          </CardDescription>
          <Link className="inline-block pt-1 text-sm font-semibold text-[var(--accent)] hover:underline" href="/">
            Palaa etusivulle
          </Link>
        </Card>
      </div>
    );
  }

  const expired = invite.status !== "pending" || isInviteExpired(invite.expiresAt);

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-7 px-5 py-12">
      <header className="space-y-3">
        <Badge>{roleLabel(invite.role)}</Badge>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold leading-tight text-[var(--text)]">
          Viimeistele tunnus
        </h1>
        <p className="text-base leading-7 text-[var(--text-muted)]">
          Kutsu on lähetetty osoitteeseen <span className="font-semibold text-[var(--text)]">{invite.email}</span>. Valitse
          nimi ja salasana, niin pääset heti omaan työtilaasi.
        </p>
      </header>

      {expired ? (
        <Card className="space-y-4">
          <p className="text-sm leading-6 text-[var(--danger)]">
            Tämä kutsu on vanhentunut. Pyydä uusi kutsu ylläpidolta tai valmentajaltasi.
          </p>
          <Link className="inline-block text-sm font-semibold text-[var(--accent)] hover:underline" href="/">
            Takaisin etusivulle
          </Link>
        </Card>
      ) : (
        <Card>
          <form
            className="space-y-5"
            onSubmit={form.handleSubmit(async (values) => {
              if (requiresCaptcha && !captchaToken) {
                setMessageTone("danger");
                setMessage("Vahvista ensin captcha ennen tunnuksen aktivointia.");
                return;
              }

              setIsSubmitting(true);
              const result = await acceptInvite(token, values.fullName, values.password, {
                captchaToken: captchaToken ?? undefined,
                age: values.age,
                sex: values.sex,
                heightCm: values.heightCm,
                weightKg: values.weightKg,
              });
              setIsSubmitting(false);

              if (requiresCaptcha && !result.ok) {
                captchaRef.current?.resetCaptcha();
                setCaptchaToken(null);
              }

              setMessageTone(result.ok ? "success" : "danger");
              setMessage(
                result.ok
                  ? `${result.message ?? "Tunnus aktivoitiin onnistuneesti."} Siirrytään kirjautumiseen...`
                  : result.message,
              );

              if (result.ok) {
                window.setTimeout(() => {
                  router.push("/");
                }, 900);
              }
            })}
          >
            <fieldset className="space-y-4">
              <div>
                <Label htmlFor={`${formId}-email`} required>Sähköposti</Label>
                {/* Kutsuun sidottu sähköposti. Näytetään readonly-kenttänä, jotta selaimen/iOS:n
                    salasananhallinta tallentaa tunnuksen sähköpostiin (ei nimikenttään). */}
                <Input
                  id={`${formId}-email`}
                  type="email"
                  autoComplete="username"
                  inputMode="email"
                  value={invite.email}
                  readOnly
                  className="bg-[var(--surface-2)] text-[var(--text-muted)]"
                />
              </div>
              <div>
                <Label htmlFor={`${formId}-full-name`} required>Koko nimi</Label>
                <Input id={`${formId}-full-name`} autoComplete="name" {...form.register("fullName")} />
              </div>
              <div>
                <Label htmlFor={`${formId}-new-password`} required>Salasana</Label>
                <Input id={`${formId}-new-password`} type="password" autoComplete="new-password" {...form.register("password")} />
              </div>
            </fieldset>

            <fieldset className="border-t border-[var(--border)] pt-5">
              <legend className="font-[family-name:var(--font-display)] text-base font-bold text-[var(--text)]">
                Valinnaiset profiilitiedot
              </legend>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Voit täydentää nämä nyt, niin ravintoprofiilin autolaskenta toimii myöhemmin paremmin.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor={`${formId}-age`}>Ikä</Label>
                  <Input id={`${formId}-age`} type="number" inputMode="numeric" min={13} max={100} step="1" {...form.register("age")} />
                </div>
                <div>
                  <Label htmlFor={`${formId}-sex`}>Sukupuoli</Label>
                  <Select id={`${formId}-sex`} {...form.register("sex")}>
                    <option value="">Valitse</option>
                    <option value="female">Nainen</option>
                    <option value="male">Mies</option>
                    <option value="other">Muu</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor={`${formId}-height`}>Pituus (cm)</Label>
                  <Input id={`${formId}-height`} type="number" inputMode="decimal" min={80} max={250} step="0.5" {...form.register("heightCm")} />
                </div>
                <div>
                  <Label htmlFor={`${formId}-weight`}>Paino (kg)</Label>
                  <Input id={`${formId}-weight`} type="number" inputMode="decimal" min={20} max={350} step="0.1" {...form.register("weightKg")} />
                </div>
              </div>
            </fieldset>

            {requiresCaptcha ? (
              <div className="space-y-2">
                <HCaptcha
                  ref={captchaRef}
                  sitekey={hCaptchaSiteKey}
                  theme="light"
                  onVerify={(nextToken) => {
                    setCaptchaToken(nextToken);
                    setCaptchaError(null);
                    setMessage(null);
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

            {message ? (
              <p
                aria-live="polite"
                className={`text-sm leading-6 ${messageTone === "success" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
              >
                {message}
              </p>
            ) : null}

            <div className="space-y-3 border-t border-[var(--border)] pt-4">
              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting || (requiresCaptcha && !captchaToken)}
                loading={isSubmitting}
                loadingText="Aktivoidaan..."
              >
                Aktivoi tunnus
              </Button>
              <Link className="block text-center text-sm font-semibold text-[var(--text-muted)] hover:underline" href="/">
                Takaisin etusivulle
              </Link>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
