"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Ellipsis, HousePlus, KeyRound, Ruler, Scale, Share, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { AdminUserManagementPanel } from "@/components/workout/admin-user-management-panel";
import { InlineFeedback } from "@/components/workout/inline-feedback";
import type { ProfileSheetSection } from "@/components/workout/profile-sheet";
import { bodyMeasurementSchema, userSettingsSchema } from "@/components/workout/schemas";
import { roleLabel } from "@/components/workout/shared";
import { getMeasurementsForUser } from "@/lib/body-metrics";
import { withMinimumDelay } from "@/lib/min-delay";
import { canTrackOwnTraining, getDashboardViewsForRole, getDefaultDashboardView, isAthleteRole } from "@/lib/role-access";
import { PROGRAMS_DASHBOARD_VIEW, type DashboardHomeView, type ProfileSex, type Role, type ThemeMode } from "@/lib/types";
import { useAppState } from "@/providers/app-state-provider";

const dashboardViewLabel: Record<DashboardHomeView, string> = {
  overview: "Tänään",
  nutrition: "Ravinto",
  measurements: "Keho",
  athletes: "Tiimi",
  users: "Hallinta",
  [PROGRAMS_DASHBOARD_VIEW]: "Ohjelma",
  invites: "Kutsut",
  "athlete-log": "Treeni",
  conversation: "Chat",
  ingredients: "Raaka-aineet",
};

const themeModeLabel: Record<ThemeMode, string> = {
  light: "Vaalea",
  dark: "Tumma",
  mallu: "Mallu",
  camel: "Camel",
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

const PROFILE_IMAGE_HELPER_TEXT = "JPG, PNG, WebP tai AVIF. Maksimikoko 5 Mt.";
type SettingsSection = ProfileSheetSection;

const settingsSectionTabs: Array<{ section: SettingsSection; label: string }> = [
  { section: "account", label: "Tili ja tiedot" },
  { section: "appearance", label: "Teema ja ulkoasu" },
  { section: "reminders", label: "Muistutukset" },
  { section: "units", label: "Yksiköt ja kieli" },
];

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

export function UserSettingsPanel({
  adminOnly = false,
  initialSection,
}: {
  adminOnly?: boolean;
  initialSection?: SettingsSection;
}) {
  const {
    currentUser,
    state,
    notify,
    updateCurrentUserSettings,
    uploadCurrentUserProfileImage,
    removeCurrentUserProfileImage,
    updateCurrentUserMeasurements,
    requestCurrentUserPasswordReset,
  } = useAppState();
  const [message, setMessage] = useState<string>("");
  const [messageTone, setMessageTone] = useState<"success" | "danger" | null>(null);
  const [profileMessage, setProfileMessage] = useState<string>("");
  const [profileMessageTone, setProfileMessageTone] = useState<"success" | "danger" | null>(null);
  const [passwordResetMessage, setPasswordResetMessage] = useState<string>("");
  const [passwordResetMessageTone, setPasswordResetMessageTone] = useState<"success" | "danger" | null>(null);
  const [isSendingOwnPasswordReset, setIsSendingOwnPasswordReset] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingProfileImage, setIsUploadingProfileImage] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection ?? "account");
  useEffect(() => {
    if (initialSection) {
      setActiveSection(initialSection);
    }
  }, [initialSection]);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<DeferredInstallPromptEvent | null>(null);
  const [isInstalledToHomeScreen, setIsInstalledToHomeScreen] = useState(false);
  const latestOwnWeightKg = useMemo(
    () =>
      currentUser
        ? getMeasurementsForUser(state, currentUser.id).find((entry) => entry.weightKg !== undefined)?.weightKg ?? currentUser.weightKg
        : undefined,
    [currentUser, state],
  );
  const latestOwnWaistCm = useMemo(
    () =>
      currentUser
        ? getMeasurementsForUser(state, currentUser.id).find((entry) => entry.waistCm !== undefined)?.waistCm ?? currentUser.waistCm
        : undefined,
    [currentUser, state],
  );
  const [isTriggeringInstallPrompt, setIsTriggeringInstallPrompt] = useState(false);
  const [ageDraft, setAgeDraft] = useState(currentUser?.age !== undefined ? String(currentUser.age) : "");
  const [sexDraft, setSexDraft] = useState<ProfileSex | "">(currentUser?.sex ?? "");
  const [heightCmDraft, setHeightCmDraft] = useState(currentUser?.heightCm !== undefined ? String(currentUser.heightCm) : "");
  const profileImageInputRef = useRef<HTMLInputElement | null>(null);

  const form = useForm<z.input<typeof userSettingsSchema>, unknown, z.output<typeof userSettingsSchema>>({
    resolver: zodResolver(userSettingsSchema),
    defaultValues: {
      fullName: currentUser?.fullName ?? "",
      profileImageUrl: currentUser?.profileImageUrl ?? "",
      defaultDashboardView: resolveDefaultView(
        currentUser?.role ?? "coach",
        currentUser?.settings?.defaultDashboardView,
      ),
      emailNotifications: currentUser?.settings?.emailNotifications ?? false,
      weeklyMeasurementReminders: currentUser?.settings?.weeklyMeasurementReminders ?? true,
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
      profileImageUrl: currentUser.profileImageUrl ?? "",
      defaultDashboardView: resolveDefaultView(currentUser.role, currentUser.settings?.defaultDashboardView),
      emailNotifications: currentUser.settings?.emailNotifications ?? false,
      weeklyMeasurementReminders: currentUser.settings?.weeklyMeasurementReminders ?? true,
      themeMode: currentUser.settings?.themeMode ?? "light",
      loadIncrementKg: currentUser.settings?.loadIncrementKg ?? 2.5,
    });
    setAgeDraft(currentUser.age !== undefined ? String(currentUser.age) : "");
    setSexDraft(currentUser.sex ?? "");
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
      setMessageTone("danger");
      return;
    }

    const result = await withMinimumDelay(updateCurrentUserSettings(values));
    setMessage(result.ok ? "Asetukset tallennettiin." : result.message);
    setMessageTone(result.ok ? "success" : "danger");
    notify({ tone: result.ok ? "success" : "danger", message: result.ok ? "Asetukset tallennettiin." : result.message });
  });
  const isSavingSettings = form.formState.isSubmitting;
  const profileName = form.watch("fullName");
  const settingsDefaultView = form.watch("defaultDashboardView");
  const settingsThemeMode = form.watch("themeMode");
  const settingsEmailNotifications = form.watch("emailNotifications");
  const settingsWeeklyMeasurementReminders = form.watch("weeklyMeasurementReminders");
  const settingsLoadIncrementKg = form.watch("loadIncrementKg");
  const submitProfile = async () => {
    const isProfileFormValid = await form.trigger(["fullName"]);
    const trimmedFullName = profileName.trim();
    const parsedMeasurements = bodyMeasurementSchema.safeParse({ heightCm: heightCmDraft, weightKg: "", waistCm: "" });
    const parsedAge = ageDraft.trim() ? Number(ageDraft) : undefined;
    const parsedSex = sexDraft || undefined;

    if (!isProfileFormValid) {
      setProfileMessage("Tarkista profiilin tiedot ja yritä uudelleen.");
      setProfileMessageTone("danger");
      return;
    }

    if (!trimmedFullName || trimmedFullName.length < 2) {
      setProfileMessage("Anna koko nimi ennen tallennusta.");
      setProfileMessageTone("danger");
      notify({ tone: "danger", message: "Anna koko nimi ennen tallennusta." });
      return;
    }

    if (!parsedMeasurements.success) {
      const nextMessage = parsedMeasurements.error.issues[0]?.message ?? "Tarkista pituus ja yritä uudelleen.";
      setProfileMessage(nextMessage);
      setProfileMessageTone("danger");
      notify({ tone: "danger", message: nextMessage });
      return;
    }

    if (parsedAge !== undefined && (!Number.isInteger(parsedAge) || parsedAge < 13 || parsedAge > 100)) {
      const nextMessage = "Anna ikä väliltä 13-100.";
      setProfileMessage(nextMessage);
      setProfileMessageTone("danger");
      notify({ tone: "danger", message: nextMessage });
      return;
    }

    setIsSavingProfile(true);
    try {
      const settingsResult = await withMinimumDelay(
        updateCurrentUserSettings({
          fullName: trimmedFullName,
          profileImageUrl: currentUser.profileImageUrl,
          defaultDashboardView: settingsDefaultView,
          emailNotifications: settingsEmailNotifications,
          weeklyMeasurementReminders: settingsWeeklyMeasurementReminders,
          themeMode: settingsThemeMode,
          loadIncrementKg: settingsLoadIncrementKg,
          age: parsedAge ?? null,
          sex: parsedSex ?? null,
        }),
      );

      if (!settingsResult.ok) {
        setProfileMessage(settingsResult.message);
        setProfileMessageTone("danger");
        notify({ tone: "danger", message: settingsResult.message });
        return;
      }

      const measurementInput: { heightCm?: number } = {};
      if (parsedMeasurements.data.heightCm !== undefined) {
        measurementInput.heightCm = parsedMeasurements.data.heightCm;
      }

      const measurementResult = await withMinimumDelay(
        updateCurrentUserMeasurements(measurementInput),
      );

      if (!measurementResult.ok) {
        setProfileMessage(measurementResult.message);
        setProfileMessageTone("danger");
        notify({ tone: "danger", message: measurementResult.message });
        return;
      }

      setProfileMessage("Profiili päivitettiin.");
      setProfileMessageTone("success");
      notify({ tone: "success", message: "Profiili päivitettiin." });
    } finally {
      setIsSavingProfile(false);
    }
  };
  const isProfileDirty =
    Boolean(currentUser) &&
    (profileName.trim() !== currentUser.fullName ||
      (ageDraft.trim() ? Number(ageDraft) : undefined) !== currentUser.age ||
      (sexDraft || undefined) !== currentUser.sex ||
      (heightCmDraft.trim() ? Number(heightCmDraft.replace(",", ".")) : undefined) !== currentUser.heightCm);
  const profileImageSrc = currentUser.profileImageUrl
    ? `${currentUser.profileImageUrl}${currentUser.profileImageUrl.includes("?") ? "&" : "?"}v=${encodeURIComponent(currentUser.updatedAt)}`
    : null;

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

  const installHelp =
    installPlatform === "ios"
      ? {
          text: "iPhone/iPad: paina Safarissa Jaa ja valitse Lisää kotivalikkoon.",
          icon: Share,
          iconLabel: "Jaa",
          showBadge: false,
        }
      : installPlatform === "android"
        ? deferredInstallPrompt
          ? {
              text: "Android: voit lisätä Rookiappin suoraan alla olevasta painikkeesta.",
              icon: HousePlus,
              iconLabel: "Lisää",
              showBadge: true,
            }
          : {
              text: "Android: avaa selaimen valikko ja valitse Lisää kotivalikkoon tai Asenna.",
              icon: Ellipsis,
              iconLabel: "Valikko",
              showBadge: true,
            }
        : deferredInstallPrompt
          ? {
              text: "Voit lisätä Rookiappin suoraan alla olevasta painikkeesta.",
              icon: HousePlus,
              iconLabel: "Lisää",
              showBadge: true,
            }
          : {
              text: "Avaa selaimen valikko ja etsi kohta Lisää kotivalikkoon tai Asenna, jos selaimesi tukee sitä.",
              icon: Ellipsis,
              iconLabel: "Valikko",
              showBadge: true,
            };

  const installStatusText = isInstalledToHomeScreen
    ? "Rookiapp on avattu kotivalikosta."
    : "Rookiapp on nyt auki selaimessa.";

  const installStatusBadge = isInstalledToHomeScreen ? "Kotivalikossa" : "Selaimessa";

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Tilin asetusten osiot"
        className="flex gap-1 overflow-x-auto rounded-[1.1rem] border border-[color-mix(in_srgb,var(--border)_88%,var(--surface))] bg-[color-mix(in_srgb,var(--surface)_78%,var(--surface-2))] p-1 [scrollbar-width:none]"
      >
        {settingsSectionTabs.map((tab) => (
          <button
            key={tab.section}
            type="button"
            role="tab"
            id={`settings-section-tab-${tab.section}`}
            aria-selected={activeSection === tab.section}
            aria-controls={`settings-section-panel-${tab.section}`}
            className={`inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] ${
              activeSection === tab.section
                ? "border border-[color-mix(in_srgb,var(--accent)_22%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] text-[var(--accent)] shadow-[0_8px_18px_-20px_var(--accent)]"
                : "border border-transparent bg-transparent text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
            }`}
            onClick={() => setActiveSection(tab.section)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeSection === "account" ? (
      <div role="tabpanel" id="settings-section-panel-account" aria-labelledby="settings-section-tab-account">
      <Card className="border-[var(--border-strong)]">
        <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Tili</p>
        <CardTitle className="text-xl sm:text-2xl">Profiili</CardTitle>
        <CardDescription className="mt-1.5">
          Hallitse pysyviä profiilitietojasi erillään sovelluksen asetuksista.
        </CardDescription>

        <div className="mt-4 space-y-3.5">
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
            <Label htmlFor="account-profile-image-upload">Profiilikuva</Label>
            <input
              id="account-profile-image-upload"
              ref={profileImageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="sr-only"
              onChange={(event) => {
                const nextFile = event.target.files?.[0];
                event.target.value = "";
                if (!nextFile) {
                  return;
                }

                setIsUploadingProfileImage(true);
                setProfileMessage("");
                void uploadCurrentUserProfileImage(nextFile)
                  .then((result) => {
                    setProfileMessage(result.ok ? "Profiilikuva päivitettiin." : result.message);
                    setProfileMessageTone(result.ok ? "success" : "danger");
                    notify({
                      tone: result.ok ? "success" : "danger",
                      message: result.ok ? "Profiilikuva päivitettiin." : result.message,
                    });
                  })
                  .finally(() => {
                    setIsUploadingProfileImage(false);
                  });
              }}
            />
            <div className="flex flex-wrap items-center gap-2.5 rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-2.5">
              <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border-strong)] bg-[var(--surface)]">
                {profileImageSrc ? (
                  <img
                    src={profileImageSrc}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <UserRound className="size-6 text-[var(--text-subtle)]" aria-hidden="true" />
                )}
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={isUploadingProfileImage}
                loading={isUploadingProfileImage}
                loadingText="Ladataan kuvaa..."
                onClick={() => profileImageInputRef.current?.click()}
              >
                Valitse kuva
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!currentUser.profileImageUrl || isUploadingProfileImage}
                onClick={() => {
                  setIsUploadingProfileImage(true);
                  setProfileMessage("");
                  void removeCurrentUserProfileImage()
                    .then((result) => {
                      setProfileMessage(result.ok ? "Profiilikuva poistettiin." : result.message);
                      setProfileMessageTone(result.ok ? "success" : "danger");
                      notify({
                        tone: result.ok ? "success" : "danger",
                        message: result.ok ? "Profiilikuva poistettiin." : result.message,
                      });
                    })
                    .finally(() => {
                      setIsUploadingProfileImage(false);
                    });
                }}
              >
                Poista kuva
              </Button>
            </div>
            <p className="mt-2 text-xs text-[var(--text-subtle)]">
              Lataa kuva suoraan laitteelta. Jos kuvaa ei ole asetettu, näytämme profiili-ikonin. {PROFILE_IMAGE_HELPER_TEXT}
            </p>
          </div>

          <div>
            <Label htmlFor="settings-email">Sähköposti</Label>
            <Input id="settings-email" disabled value={currentUser.email} />
            <p className="mt-2 text-xs text-[var(--text-subtle)]">
              Sähköpostia hallitaan kutsu- ja käyttäjähallinnan kautta.
            </p>
          </div>

          <div>
            <Label htmlFor="account-age">Ikä</Label>
            <Input
              id="account-age"
              type="number"
              inputMode="numeric"
              min={13}
              max={100}
              step="1"
              placeholder="Esim. 29"
              value={ageDraft}
              disabled={isSavingProfile || !canTrackOwnTraining(currentUser.role)}
              onChange={(event) => {
                setAgeDraft(event.target.value);
                setProfileMessage("");
              }}
            />
          </div>

          <div>
            <Label htmlFor="account-sex">Sukupuoli</Label>
            <Select
              id="account-sex"
              value={sexDraft}
              disabled={isSavingProfile || !canTrackOwnTraining(currentUser.role)}
              onChange={(event) => {
                setSexDraft(event.target.value as ProfileSex | "");
                setProfileMessage("");
              }}
            >
              <option value="">Valitse</option>
              <option value="female">Nainen</option>
              <option value="male">Mies</option>
              <option value="other">Muu</option>
            </Select>
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
              disabled={isSavingProfile || !canTrackOwnTraining(currentUser.role)}
              onChange={(event) => {
                setHeightCmDraft(event.target.value);
                setProfileMessage("");
              }}
            />
            <p className="mt-2 text-xs text-[var(--text-subtle)]">
              Pituus on pysyvä profiilitieto. Päivitä paino ja vyötärö edelleen yleiskuvan omasta mittaseurannasta.
            </p>
          </div>

            <div className="sm:col-span-2">
              <Label>Nykyiset mittatiedot</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent)]">
                  <Scale className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Paino</p>
                  <p className="mt-0.5 text-base font-semibold text-[var(--text)]">
                    {latestOwnWeightKg ?? "-"} <span className="text-sm font-medium text-[var(--text-muted)]">kg</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent)]">
                  <Ruler className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Vyötärö</p>
                  <p className="mt-0.5 text-base font-semibold text-[var(--text)]">
                    {latestOwnWaistCm ?? "-"} <span className="text-sm font-medium text-[var(--text-muted)]">cm</span>
                  </p>
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs text-[var(--text-subtle)]">
              Paino ja vyötärö päivittyvät mittaseurannan kautta, eivät tästä profiilin perustieto-osiosta.
            </p>
          </div>

          {isSavingProfile || profileMessage ? (
            <InlineFeedback
              message={profileMessage}
              tone={profileMessageTone}
              pendingMessage="Tallennetaan profiilia..."
              isPending={isSavingProfile || isUploadingProfileImage}
              className="text-sm"
            />
          ) : null}

          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={!isProfileDirty || isSavingProfile || isUploadingProfileImage}
            loading={isSavingProfile}
            loadingText="Tallennetaan profiilia..."
            onClick={() => void submitProfile()}
          >
            Tallenna profiili
          </Button>
        </div>

        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
          <p className="text-[11px] font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Turvallisuus</p>
          <div className="mt-1.5 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--text)]">Salasanan nollaus</p>
              <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                Lähetä kertakäyttöinen nollauslinkki omaan sähköpostiisi.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              loading={isSendingOwnPasswordReset}
              loadingText="Lähetetään nollauslinkkiä..."
              onClick={async () => {
                setIsSendingOwnPasswordReset(true);
                try {
                  const result = await withMinimumDelay(requestCurrentUserPasswordReset());
                  setPasswordResetMessage(result.message);
                  setPasswordResetMessageTone(result.ok ? "success" : "danger");
                  notify({ tone: result.ok ? "success" : "danger", message: result.message });
                } finally {
                  setIsSendingOwnPasswordReset(false);
                }
              }}
            >
              <KeyRound className="mr-2 size-4" />
              Lähetä nollauslinkki
            </Button>
          </div>
          {passwordResetMessage ? (
            <InlineFeedback message={passwordResetMessage} tone={passwordResetMessageTone} className="mt-3 text-sm" />
          ) : null}
        </div>
      </Card>
      </div>
      ) : null}

      {activeSection === "appearance" ? (
      <div role="tabpanel" id="settings-section-panel-appearance" aria-labelledby="settings-section-tab-appearance" className="grid gap-4">
        <Card>
          <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Asetukset</p>
          <CardTitle className="text-xl sm:text-2xl">Teema ja ulkoasu</CardTitle>
          <CardDescription className="mt-1.5">
            Valitse aloitussivu ja sovelluksen värimaailma.
          </CardDescription>
          <div className="mt-4 space-y-3.5">
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

            {isSavingSettings || message ? (
              <InlineFeedback message={message} tone={messageTone} pendingMessage="Tallennetaan asetuksia..." isPending={isSavingSettings} className="text-sm" />
            ) : null}

            <Button type="button" className="w-full sm:w-auto" disabled={isSavingSettings} loading={isSavingSettings} loadingText="Tallennetaan asetuksia..." onClick={() => void submitSettings()}>
              Tallenna asetukset
            </Button>
          </div>
        </Card>

        <Card className="lg:hidden">
          <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Kotivalikko</p>
          <CardTitle className="text-xl sm:text-2xl">Lisää kotivalikkoon</CardTitle>
          <CardDescription className="mt-1.5">
            Lisää Rookiapp kotivalikkoon, niin saat sen auki yhdellä napautuksella.
          </CardDescription>

          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
              <span className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)]">
                <HousePlus className="size-4 text-[var(--accent)]" />
                Tila
              </span>
              <Badge>{installStatusBadge}</Badge>
            </div>

            {!isInstalledToHomeScreen ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-sm text-[var(--text-muted)]">
                {installHelp.showBadge ? (
                  <div className="flex items-start gap-3">
                    <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[var(--text)]">
                      <installHelp.icon className="size-4 text-[var(--accent)]" />
                      {installHelp.iconLabel}
                    </span>
                    <p>{installHelp.text}</p>
                  </div>
                ) : (
                  <p className="leading-6">
                    iPhone/iPad: paina Safarissa{" "}
                    <span className="inline-flex items-baseline gap-1 font-medium text-[var(--text)]">
                      <Share className="relative top-[1px] size-[0.9rem] shrink-0 text-[var(--accent)]" />
                      <span>Jaa</span>
                    </span>{" "}
                    ja valitse Lisää kotivalikkoon.
                  </p>
                )}
              </div>
            ) : null}
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
      </div>
      ) : null}

      {activeSection === "reminders" ? (
      <div role="tabpanel" id="settings-section-panel-reminders" aria-labelledby="settings-section-tab-reminders" className="grid gap-4">
        <Card>
          <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Asetukset</p>
          <CardTitle className="text-xl sm:text-2xl">Muistutukset</CardTitle>
          <CardDescription className="mt-1.5">
            Valitse mistä sovellus muistuttaa sinua.
          </CardDescription>
          <div className="mt-4 space-y-3.5">
            <div className="space-y-1.5 rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-2.5">
              <label className="flex items-start justify-between gap-3 rounded-lg px-1 py-1">
                <span className="min-w-0">
                  <span id="settings-weekly-measurements-label" className="block text-sm font-semibold text-[var(--text)]">
                    Viikkomuistutus
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-[var(--text-subtle)]">
                    Näytä perjantain muistutus painon ja vyötärön päivittämiseen.
                  </span>
                </span>
                <input
                  type="checkbox"
                  aria-labelledby="settings-weekly-measurements-label"
                  className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
                  disabled={isSavingSettings}
                  {...form.register("weeklyMeasurementReminders")}
                />
              </label>

              <div className="border-t border-[var(--border)]" />

              <label className="flex items-start justify-between gap-3 rounded-lg px-1 py-1">
                <span className="min-w-0">
                  <span id="settings-email-notifications-label" className="block text-sm font-semibold text-[var(--text)]">
                    Sähköposti-ilmoitukset
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-[var(--text-subtle)]">
                    Lähetä sähköposti uusista treeneistä ja ohjelmapäivityksistä.
                  </span>
                </span>
                <input
                  type="checkbox"
                  aria-labelledby="settings-email-notifications-label"
                  className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
                  disabled={isSavingSettings}
                  {...form.register("emailNotifications")}
                />
              </label>
            </div>

            {isSavingSettings || message ? (
              <InlineFeedback message={message} tone={messageTone} pendingMessage="Tallennetaan asetuksia..." isPending={isSavingSettings} className="text-sm" />
            ) : null}

            <Button type="button" className="w-full sm:w-auto" disabled={isSavingSettings} loading={isSavingSettings} loadingText="Tallennetaan asetuksia..." onClick={() => void submitSettings()}>
              Tallenna asetukset
            </Button>
          </div>
        </Card>
      </div>
      ) : null}

      {activeSection === "units" ? (
      <div role="tabpanel" id="settings-section-panel-units" aria-labelledby="settings-section-tab-units" className="grid gap-4">
        <Card>
          <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Asetukset</p>
          <CardTitle className="text-xl sm:text-2xl">Yksiköt ja kieli</CardTitle>
          <CardDescription className="mt-1.5">
            Mittayksiköt ja sovelluksen kieli.
          </CardDescription>
          <div className="mt-4 space-y-3.5">
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

            <div>
              <Label htmlFor="settings-language">Kieli</Label>
              <Select id="settings-language" disabled value="fi">
                <option value="fi">Suomi</option>
              </Select>
              <p className="mt-2 text-xs text-[var(--text-subtle)]">Sovellus on toistaiseksi vain suomeksi.</p>
            </div>

            {isSavingSettings || message ? (
              <InlineFeedback message={message} tone={messageTone} pendingMessage="Tallennetaan asetuksia..." isPending={isSavingSettings} className="text-sm" />
            ) : null}

            <Button type="button" className="w-full sm:w-auto" disabled={isSavingSettings} loading={isSavingSettings} loadingText="Tallennetaan asetuksia..." onClick={() => void submitSettings()}>
              Tallenna asetukset
            </Button>
          </div>
        </Card>
      </div>
      ) : null}
    </div>
  );
}
