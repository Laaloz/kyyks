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
          Kutsu on lähetetty osoitteeseen {invite.email}. Valitse nimi ja salasana, niin pääset heti omaan
          työtilaasi.
        </CardDescription>
        {expired ? (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-[var(--danger)]">Tämä kutsu on vanhentunut. Pyydä uusi kutsu ylläpidolta tai valmentajaltasi.</p>
            <Link className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5 text-sm font-semibold text-[var(--text)]" href="/">
              Takaisin etusivulle
            </Link>
          </div>
        ) : (
          <form
            className="mt-6 space-y-4"
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
            <fieldset className="space-y-4 rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4">
              <legend className="px-2 text-sm font-semibold tracking-[0.03em] text-[var(--text-subtle)]">Perustiedot</legend>
              <div>
                <Label htmlFor={`${formId}-full-name`}>Koko nimi</Label>
                <Input id={`${formId}-full-name`} autoComplete="name" {...form.register("fullName")} />
              </div>
              <div>
                <Label htmlFor={`${formId}-new-password`}>Salasana</Label>
                <Input id={`${formId}-new-password`} type="password" autoComplete="new-password" {...form.register("password")} />
              </div>
            </fieldset>
            <fieldset className="space-y-4 rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4">
              <legend className="px-2 text-sm font-semibold tracking-[0.03em] text-[var(--text-subtle)]">Valinnaiset profiilitiedot</legend>
              <p className="text-sm text-[var(--text-muted)]">
                Voit täydentää nämä nyt, niin ravintoprofiilin autolaskenta toimii myöhemmin paremmin. Kentät eivät ole pakollisia.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
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
            <p
              aria-live="polite"
              className={`min-h-5 text-sm ${messageTone === "success" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
            >
              {message ?? ""}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                type="submit"
                disabled={isSubmitting || (requiresCaptcha && !captchaToken)}
                loading={isSubmitting}
                loadingText="Aktivoidaan..."
              >
                Aktivoi tunnus
              </Button>
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
