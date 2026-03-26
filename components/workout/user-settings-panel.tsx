"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Bell, HousePlus, KeyRound, Mail, MoonStar, Ruler, UserRoundCog, Waves } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { AdminUserManagementPanel } from "@/components/workout/admin-user-management-panel";
import { bodyMeasurementSchema, userSettingsSchema } from "@/components/workout/schemas";
import { roleLabel } from "@/components/workout/shared";
import { withMinimumDelay } from "@/lib/min-delay";
import { getDashboardViewsForRole, getDefaultDashboardView } from "@/lib/role-access";
import { PROGRAMS_DASHBOARD_VIEW, type DashboardHomeView, type Role, type ThemeMode } from "@/lib/types";
import { useAppState } from "@/providers/app-state-provider";

const dashboardViewLabel: Record<DashboardHomeView, string> = {
  overview: "Yleiskuva",
  athletes: "Treenaajat",
  users: "Käyttäjät",
  [PROGRAMS_DASHBOARD_VIEW]: "Ohjelmat",
  invites: "Kutsut",
  "athlete-log": "Treenit",
  conversation: "Keskustelu",
};

const themeModeLabel: Record<ThemeMode, string> = {
  light: "Vaalea",
  dark: "Tumma",
};

const loadIncrementLabel: Record<1 | 2.5 | 5, string> = {
  1: "1 kg",
  2.5: "2,5 kg",
  5: "5 kg",
};

const loadIncrementOptions: Array<{ value: 1 | 2.5 | 5; label: string }> = [
  { value: 1, label: "1 kg" },
  { value: 2.5, label: "2,5 kg" },
  { value: 5, label: "5 kg" },
];

function parseLoadIncrement(value: string) {
  const parsed = Number(value);
  return parsed === 1 || parsed === 2.5 || parsed === 5 ? parsed : 2.5;
}

const SETTINGS_SAVE_MIN_LOADING_MS = 350;

type DeferredInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function resolveDefaultView(role: Role, value: DashboardHomeView | undefined): DashboardHomeView {
  const allowed = getDashboardViewsForRole(role);
  if (value && allowed.includes(value)) {
    return value;
  }

  return getDefaultDashboardView(role);
}

export function UserSettingsPanel({ adminOnly = false }: { adminOnly?: boolean }) {
  const {
    currentUser,
    notify,
    updateCurrentUserSettings,
    updateCurrentUserMeasurements,
    requestCurrentUserPasswordReset,
  } = useAppState();
  const [message, setMessage] = useState<string>("");
  const [profileMessage, setProfileMessage] = useState<string>("");
  const [passwordResetMessage, setPasswordResetMessage] = useState<string>("");
  const [isSendingOwnPasswordReset, setIsSendingOwnPasswordReset] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<DeferredInstallPromptEvent | null>(null);
  const [isInstalledToHomeScreen, setIsInstalledToHomeScreen] = useState(false);
  const [isTriggeringInstallPrompt, setIsTriggeringInstallPrompt] = useState(false);
  const [heightCmDraft, setHeightCmDraft] = useState(currentUser?.heightCm !== undefined ? String(currentUser.heightCm) : "");

  const form = useForm<z.input<typeof userSettingsSchema>, unknown, z.output<typeof userSettingsSchema>>({
    resolver: zodResolver(userSettingsSchema),
    defaultValues: {
      fullName: currentUser?.fullName ?? "",
      defaultDashboardView: resolveDefaultView(
        currentUser?.role ?? "coach",
        currentUser?.settings?.defaultDashboardView,
      ),
      emailNotifications: currentUser?.settings?.emailNotifications ?? false,
      themeMode: currentUser?.settings?.themeMode ?? "light",
      loadIncrementKg: currentUser?.settings?.loadIncrementKg ?? 2.5,
    },
  });

  const allowedViewOptions = useMemo(
    () =>
      currentUser
        ? getDashboardViewsForRole(currentUser.role)
        : (["overview"] as DashboardHomeView[]),
    [currentUser],
  );
  useEffect(() => {
    if (!currentUser) {
      return;
    }

    form.reset({
      fullName: currentUser.fullName,
      defaultDashboardView: resolveDefaultView(currentUser.role, currentUser.settings?.defaultDashboardView),
      emailNotifications: currentUser.settings?.emailNotifications ?? false,
      themeMode: currentUser.settings?.themeMode ?? "light",
      loadIncrementKg: currentUser.settings?.loadIncrementKg ?? 2.5,
    });
    setHeightCmDraft(currentUser.heightCm !== undefined ? String(currentUser.heightCm) : "");
  }, [currentUser, form]);

  if (!currentUser) {
    return null;
  }

  if (adminOnly) {
    return <AdminUserManagementPanel />;
  }

  const submitSettings = form.handleSubmit(async (values) => {
    if (!allowedViewOptions.includes(values.defaultDashboardView)) {
      setMessage("Valittu aloitussivu ei ole sallittu roolillesi.");
      return;
    }

    const result = await withMinimumDelay(updateCurrentUserSettings(values));
    setMessage(result.ok ? "" : result.message);
    notify({ tone: result.ok ? "success" : "danger", message: result.ok ? "Asetukset tallennettiin." : result.message });
  });
  const isSavingSettings = form.formState.isSubmitting;
  const profileName = form.watch("fullName");
  const settingsDefaultView = form.watch("defaultDashboardView");
  const settingsThemeMode = form.watch("themeMode");
  const settingsEmailNotifications = form.watch("emailNotifications");
  const settingsLoadIncrementKg = form.watch("loadIncrementKg");
  const submitProfile = async () => {
    const trimmedFullName = profileName.trim();
    const parsedMeasurements = bodyMeasurementSchema.safeParse({ heightCm: heightCmDraft, weightKg: "", waistCm: "" });

    if (!trimmedFullName || trimmedFullName.length < 2) {
      setProfileMessage("Anna koko nimi ennen tallennusta.");
      notify({ tone: "danger", message: "Anna koko nimi ennen tallennusta." });
      return;
    }

    if (!parsedMeasurements.success) {
      const nextMessage = parsedMeasurements.error.issues[0]?.message ?? "Tarkista pituus ja yritä uudelleen.";
      setProfileMessage(nextMessage);
      notify({ tone: "danger", message: nextMessage });
      return;
    }

    setIsSavingProfile(true);
    try {
      const settingsResult = await withMinimumDelay(
        updateCurrentUserSettings({
          fullName: trimmedFullName,
          defaultDashboardView: settingsDefaultView,
          emailNotifications: settingsEmailNotifications,
          themeMode: settingsThemeMode,
          loadIncrementKg: settingsLoadIncrementKg,
        }),
      );

      if (!settingsResult.ok) {
        setProfileMessage(settingsResult.message);
        notify({ tone: "danger", message: settingsResult.message });
        return;
      }

      const measurementResult = await withMinimumDelay(
        updateCurrentUserMeasurements({ heightCm: parsedMeasurements.data.heightCm }),
      );

      if (!measurementResult.ok) {
        setProfileMessage(measurementResult.message);
        notify({ tone: "danger", message: measurementResult.message });
        return;
      }

      setProfileMessage("");
      notify({ tone: "success", message: "Profiili päivitettiin." });
    } finally {
      setIsSavingProfile(false);
    }
  };
  const isProfileDirty =
    Boolean(currentUser) &&
    (profileName.trim() !== currentUser.fullName ||
      (heightCmDraft.trim() ? Number(heightCmDraft.replace(",", ".")) : undefined) !== currentUser.heightCm);

  const installPlatform = useMemo(() => {
    if (typeof window === "undefined") {
      return "unknown" as const;
    }

    const userAgent = window.navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(userAgent)) {
      return "ios" as const;
    }
    if (/android/.test(userAgent)) {
      return "android" as const;
    }
    return "other" as const;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const updateInstalledState = () => {
      const iosStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
      setIsInstalledToHomeScreen(mediaQuery.matches || iosStandalone);
    };

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredInstallPrompt(event as DeferredInstallPromptEvent);
    };

    const handleInstalled = () => {
      setIsInstalledToHomeScreen(true);
      setDeferredInstallPrompt(null);
    };

    updateInstalledState();
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateInstalledState);
    } else if (typeof mediaQuery.addListener === "function") {
      mediaQuery.addListener(updateInstalledState);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);

      if (typeof mediaQuery.removeEventListener === "function") {
        mediaQuery.removeEventListener("change", updateInstalledState);
      } else if (typeof mediaQuery.removeListener === "function") {
        mediaQuery.removeListener(updateInstalledState);
      }
    };
  }, []);

  const installHelpText =
    installPlatform === "ios"
      ? "iPhone/iPad: avaa selaimen Jaa-valikko ja valitse Lisää kotivalikkoon."
      : installPlatform === "android"
        ? deferredInstallPrompt
          ? "Android: voit lisätä Rookiappin suoraan alla olevasta painikkeesta."
          : "Android: avaa selaimen valikko ja valitse Lisää kotivalikkoon tai Asenna."
        : deferredInstallPrompt
          ? "Voit lisätä Rookiappin suoraan alla olevasta painikkeesta."
          : "Lisää Rookiapp selaimen valikosta kotivalikkoon, jos selain tukee sitä.";

  const installStatusText = isInstalledToHomeScreen
    ? "Rookiapp on avattu kotivalikosta."
    : "Rookiapp on nyt auki selaimessa.";

  const installStatusBadge = isInstalledToHomeScreen ? "Kotivalikossa" : "Selaimessa";

  return (
    <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
      <Card className="border-[var(--border-strong)]">
        <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Tili</p>
        <CardTitle className="text-2xl">Profiili</CardTitle>
        <CardDescription className="mt-2">
          Hallitse pysyviä profiilitietojasi erillään sovelluksen asetuksista.
        </CardDescription>

        <div className="mt-6 space-y-4">
          <div>
            <Label htmlFor="account-full-name">Koko nimi</Label>
            <Input
              id="account-full-name"
              aria-invalid={Boolean(form.formState.errors.fullName)}
              aria-describedby={form.formState.errors.fullName ? "account-full-name-error" : undefined}
              disabled={isSavingProfile}
              {...form.register("fullName")}
            />
            {form.formState.errors.fullName ? (
              <p className="mt-2 text-sm text-[var(--danger)]" id="account-full-name-error">
                {form.formState.errors.fullName.message}
              </p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="settings-email">Sähköposti</Label>
            <Input id="settings-email" disabled value={currentUser.email} />
            <p className="mt-2 text-xs text-[var(--text-subtle)]">
              Sähköpostia hallitaan kutsu- ja käyttäjähallinnan kautta.
            </p>
          </div>

          <div>
            <Label htmlFor="account-height-cm">Pituus (cm)</Label>
            <Input
              id="account-height-cm"
              type="number"
              inputMode="decimal"
              min={80}
              max={250}
              step="0.5"
              placeholder="Esim. 178"
              value={heightCmDraft}
              disabled={isSavingProfile || currentUser.role !== "athlete"}
              onChange={(event) => {
                setHeightCmDraft(event.target.value);
                setProfileMessage("");
              }}
            />
            <p className="mt-2 text-xs text-[var(--text-subtle)]">
              Pituus on pysyvä profiilitieto. Päivitä paino ja vyötärö edelleen yleiskuvan mittaseurannasta.
            </p>
          </div>

          {isSavingProfile || profileMessage ? (
            <p
              aria-live="polite"
              className={`text-sm ${isSavingProfile ? "text-[var(--text-subtle)]" : "text-[var(--danger)]"}`}
            >
              {isSavingProfile ? "Tallennetaan profiilia..." : profileMessage}
            </p>
          ) : null}

          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={!isProfileDirty || isSavingProfile}
            loading={isSavingProfile}
            loadingText="Tallennetaan profiilia..."
            onClick={() => void submitProfile()}
          >
            Tallenna profiili
          </Button>
        </div>

        <div className="mt-6 rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4">
          <p className="text-xs font-semibold tracking-[0.03em] text-[var(--text-subtle)]">Turvallisuus</p>
          <p className="mt-2 text-lg font-semibold text-[var(--text)]">Salasanan nollaus</p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Lähetä turvallinen nollauslinkki omaan sähköpostiisi. Linkki on kertakäyttöinen ja vanhenee automaattisesti.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              loading={isSendingOwnPasswordReset}
              loadingText="Lähetetään nollauslinkkiä..."
              onClick={async () => {
                setIsSendingOwnPasswordReset(true);
                try {
                  const result = await withMinimumDelay(requestCurrentUserPasswordReset());
                  setPasswordResetMessage(result.message);
                  notify({ tone: result.ok ? "success" : "danger", message: result.message });
                } finally {
                  setIsSendingOwnPasswordReset(false);
                }
              }}
            >
              <KeyRound className="mr-2 size-4" />
              Lähetä nollauslinkki
            </Button>
            {passwordResetMessage ? (
              <p
                aria-live="polite"
                className={`text-sm ${passwordResetMessage.includes("lähet") ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
              >
                {passwordResetMessage}
              </p>
            ) : null}
          </div>
        </div>
      </Card>

      <div className="grid gap-6">
        <Card>
          <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Asetukset</p>
          <CardTitle className="text-2xl">Sovelluksen asetukset</CardTitle>
          <CardDescription className="mt-2">
            Muokkaa sitä, miten sovellus käyttäytyy sinulle päivittäisessä käytössä.
          </CardDescription>
          <form className="mt-6 space-y-4" noValidate onSubmit={submitSettings}>
            <div>
              <Label htmlFor="settings-default-view">Aloitussivu</Label>
              <Select id="settings-default-view" disabled={isSavingSettings} {...form.register("defaultDashboardView")}>
                {allowedViewOptions.map((view) => (
                  <option key={view} value={view}>
                    {dashboardViewLabel[view]}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="settings-theme-mode">Teema</Label>
              <Select id="settings-theme-mode" disabled={isSavingSettings} {...form.register("themeMode")}>
                {Object.entries(themeModeLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
              <p className="mt-2 text-xs text-[var(--text-subtle)]">
                Tumma tila vaihtaa koko sovelluksen värimaailman rauhallisemmaksi hämärässä käytössä.
              </p>
            </div>

            <div>
              <Label htmlFor="settings-load-increment">Kuorman säätöaskel</Label>
              <Select
                id="settings-load-increment"
                disabled={isSavingSettings}
                value={String(settingsLoadIncrementKg)}
                onChange={(event) => form.setValue("loadIncrementKg", parseLoadIncrement(event.target.value), { shouldDirty: true })}
              >
                {loadIncrementOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <p className="mt-2 text-xs text-[var(--text-subtle)]">
                Tätä askelta käytetään treenitaulukon kuorman vetosäädössä ja näppäimistöohjauksessa.
              </p>
            </div>

            <div
              role="group"
              aria-labelledby="settings-email-notifications-label"
              className="space-y-3 rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4"
            >
              <p
                id="settings-email-notifications-label"
                className="text-xs font-semibold tracking-[0.03em] text-[var(--text-subtle)]"
              >
                Sähköposti-ilmoitukset
              </p>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--accent)]"
                  disabled={isSavingSettings}
                  {...form.register("emailNotifications")}
                />
                <span className="text-sm text-[var(--text-muted)]">
                  Lähetä sähköposti uusista treeneistä ja ohjelmapäivityksistä
                </span>
              </label>
            </div>

            {isSavingSettings || message ? (
              <p
                aria-live="polite"
                className={`text-sm ${isSavingSettings ? "text-[var(--text-subtle)]" : "text-[var(--danger)]"}`}
              >
                {isSavingSettings ? "Tallennetaan asetuksia..." : message}
              </p>
            ) : null}

            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={isSavingSettings}
              loading={isSavingSettings}
              loadingText="Tallennetaan asetuksia..."
              onClick={() => void submitSettings()}
            >
              Tallenna asetukset
            </Button>
          </form>
        </Card>

        <Card>
          <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Kotivalikko</p>
          <CardTitle className="text-2xl">Lisää kotivalikkoon</CardTitle>
          <CardDescription className="mt-2">
            Lisää Rookiapp kotivalikkoon, niin saat sen auki yhdellä napautuksella.
          </CardDescription>

          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
              <span className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)]">
                <HousePlus className="size-4 text-[var(--accent)]" />
                Tila
              </span>
              <Badge>{installStatusBadge}</Badge>
            </div>

            <p className="text-sm text-[var(--text-muted)]">{installHelpText}</p>
            <p className="text-xs text-[var(--text-subtle)]">
              {installStatusText}
            </p>

            {deferredInstallPrompt && !isInstalledToHomeScreen ? (
              <Button
                type="button"
                className="w-full sm:w-auto"
                loading={isTriggeringInstallPrompt}
                loadingText="Avataan valintaa..."
                onClick={async () => {
                  setIsTriggeringInstallPrompt(true);
                  try {
                    await deferredInstallPrompt.prompt();
                    const choice = await deferredInstallPrompt.userChoice;
                    if (choice.outcome === "accepted") {
                      setIsInstalledToHomeScreen(true);
                      setDeferredInstallPrompt(null);
                    }
                  } finally {
                    setIsTriggeringInstallPrompt(false);
                  }
                }}
              >
                Lisää kotivalikkoon
              </Button>
            ) : installPlatform !== "ios" && !isInstalledToHomeScreen ? (
              <p className="text-xs text-[var(--text-subtle)]">
                Suora painike näkyy vain selaimissa, jotka tarjoavat asennuskehotteen automaattisesti.
              </p>
            ) : null}
          </div>
        </Card>

        {currentUser.role === "athlete" ? (
          <Card>
            <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Mitat</p>
            <CardTitle className="text-2xl">Kehon seuranta</CardTitle>
            <CardDescription className="mt-2">
              Paino ja vyötärö pysyvät erillään profiilitiedoista, jotta muuttuvia mittauksia on helpompi seurata.
            </CardDescription>
            <div className="mt-6 grid gap-3">
              <div className="flex items-center justify-between rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
                <span className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)]">
                  <Waves className="size-4 text-[var(--accent-secondary)]" />
                  Paino
                </span>
                <Badge>{currentUser.weightKg !== undefined ? `${currentUser.weightKg} kg` : "Ei asetettu"}</Badge>
              </div>
              <div className="flex items-center justify-between rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
                <span className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)]">
                  <Ruler className="size-4 text-[var(--accent-tertiary)]" />
                  Vyötärö
                </span>
                <Badge>{currentUser.waistCm !== undefined ? `${currentUser.waistCm} cm` : "Ei asetettu"}</Badge>
              </div>
            </div>
          </Card>
        ) : null}

        <Card>
          <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Yhteenveto</p>
          <CardTitle className="text-2xl">Tilin yhteenveto</CardTitle>
          <CardDescription className="mt-2">
            Näet tässä roolin, teeman, ilmoitustilan ja valitun aloitussivun yhdellä silmäyksellä.
          </CardDescription>
          <div className="mt-6 grid gap-3">
            <div className="flex items-center justify-between rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
              <span className="text-sm text-[var(--text-muted)]">Rooli</span>
              <Badge>{roleLabel(currentUser.role)}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
              <span className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)]">
                <MoonStar className="size-4 text-[var(--accent)]" />
                Teema
              </span>
              <Badge>{themeModeLabel[currentUser.settings?.themeMode ?? "light"]}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
              <span className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)]">
                <Waves className="size-4 text-[var(--accent)]" />
                Kuorman säätöaskel
              </span>
              <Badge>{loadIncrementLabel[currentUser.settings?.loadIncrementKg ?? 2.5]}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
              <span className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)]">
                <UserRoundCog className="size-4 text-[var(--accent)]" />
                Aloitussivu
              </span>
              <Badge>{dashboardViewLabel[resolveDefaultView(currentUser.role, currentUser.settings?.defaultDashboardView)]}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
              <span className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)]">
                <Bell className="size-4 text-[var(--accent-secondary)]" />
                Ilmoitukset
              </span>
              <Badge>{currentUser.settings?.emailNotifications ? "Päällä" : "Pois"}</Badge>
            </div>
          </div>
        </Card>

      </div>
    </div>
  );
}
