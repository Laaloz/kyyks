"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Ellipsis, HousePlus, KeyRound, Share, Trash2, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Toggle } from "@/components/ui/toggle";
import { InlineFeedback } from "@/components/workout/inline-feedback";
import type { ProfileSheetSection } from "@/components/workout/profile-sheet";
import { bodyMeasurementSchema, userSettingsSchema } from "@/components/workout/schemas";
import { roleLabel } from "@/components/workout/shared";
import { useAccentColorPreference, type AccentColor } from "@/lib/use-accent-color";
import { setThemePreference } from "@/lib/theme-chrome";
import { getMeasurementsForUser } from "@/lib/body-metrics";
import { withMinimumDelay } from "@/lib/min-delay";
import { calculateMacroTarget, getMissingMacroProfileFields } from "@/lib/nutrition";
import { canTrackOwnTraining, getDashboardViewsForRole, getDefaultDashboardView, isAthleteRole } from "@/lib/role-access";
import { type DashboardHomeView, type NutritionGoal, type ProfileSex, type Role, type ThemeMode } from "@/lib/types";
import { useAppState } from "@/providers/app-state-provider";

const themeModeLabel: Record<ThemeMode, string> = {
  light: "Vaalea",
  dark: "Tumma",
  mallu: "Mallu",
  camel: "Camel",
};

// Aloitusnäkymän valinnan nimet. Samat termit kuin navigaatiopalkissa, jotta
// käyttäjä tunnistaa mihin välilehteen valinta viittaa. Kattaa kaikki näkymät,
// joita getDashboardViewsForRole voi palauttaa (roolikohtainen alijoukko).
const dashboardViewLabel: Partial<Record<DashboardHomeView, string>> = {
  overview: "Tänään",
  nutrition: "Ravinto",
  "athlete-log": "Treeni",
  measurements: "Keho",
  athletes: "Tiimi",
};

function dashboardViewLabelFor(view: DashboardHomeView): string {
  return dashboardViewLabel[view] ?? view;
}

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
  { section: "units", label: "Yksiköt" },
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

// Toggle-kytkin (jaettu ui/Toggle; mt-0.5 säilyttää aiemman asettelun).
function SettingToggle({
  checked,
  disabled,
  labelledBy,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  labelledBy: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <Toggle checked={checked} disabled={disabled} labelledBy={labelledBy} onChange={onChange} className="mt-0.5" />
  );
}

export function UserSettingsPanel({
  initialSection,
}: {
  initialSection?: SettingsSection;
}) {
  const {
    currentUser,
    state,
    notify,
    saveNutritionProfile,
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
  const [accentColor, setAccentColor] = useAccentColorPreference();
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
  // Tavoite (pudota/ylläpidä/kasvata): treenaaja säätää itse → laskee ja
  // ylikirjoittaa ravinnon kcal/makrot (calculateMacroTarget, Mifflin–St Jeor).
  const ownNutritionProfile = useMemo(
    () => (currentUser ? state.nutritionProfiles.find((profile) => profile.userId === currentUser.id) ?? null : null),
    [currentUser, state.nutritionProfiles],
  );
  const [goalDraft, setGoalDraft] = useState<NutritionGoal>(ownNutritionProfile?.goal ?? "maintain");
  const [isSavingGoal, setIsSavingGoal] = useState(false);
  const [goalMessage, setGoalMessage] = useState("");
  const [goalMessageTone, setGoalMessageTone] = useState<"success" | "danger" | null>(null);
  useEffect(() => {
    if (ownNutritionProfile?.goal) {
      setGoalDraft(ownNutritionProfile.goal);
    }
  }, [ownNutritionProfile?.goal]);
  const goalProfileBasis = currentUser
    ? {
        age: currentUser.age,
        sex: currentUser.sex,
        heightCm: currentUser.heightCm,
        weightKg: currentUser.weightKg ?? latestOwnWeightKg,
      }
    : { age: undefined, sex: undefined, heightCm: undefined, weightKg: undefined };
  const missingGoalFields = getMissingMacroProfileFields(goalProfileBasis);
  const goalActivityLevel = ownNutritionProfile?.activityLevel ?? "moderate";
  const computedGoalTarget = calculateMacroTarget({ ...goalProfileBasis, goal: goalDraft, activityLevel: goalActivityLevel });
  const handleGoalChange = async (nextGoal: NutritionGoal) => {
    setGoalDraft(nextGoal);
    setGoalMessage("");
    setGoalMessageTone(null);
    if (!currentUser) {
      return;
    }
    const target = calculateMacroTarget({ ...goalProfileBasis, goal: nextGoal, activityLevel: goalActivityLevel });
    if (!target) {
      setGoalMessage("Täytä ikä, sukupuoli, pituus ja paino, niin lasketaan kcal-tavoite.");
      setGoalMessageTone("danger");
      return;
    }

    setIsSavingGoal(true);
    try {
      const result = await withMinimumDelay(
        saveNutritionProfile({
          userId: currentUser.id,
          goal: nextGoal,
          activityLevel: goalActivityLevel,
          mealsPerDay: ownNutritionProfile?.mealsPerDay ?? 4,
          calculationMode: "auto",
          targetKcal: target.kcal,
          proteinG: target.proteinG,
          carbsG: target.carbsG,
          fatG: target.fatG,
          coachNotes: ownNutritionProfile?.coachNotes,
          dietaryFlags: ownNutritionProfile?.dietaryFlags,
          allergies: ownNutritionProfile?.allergies,
        }),
      );
      setGoalMessage(result.ok ? "Tavoite päivitetty." : result.message);
      setGoalMessageTone(result.ok ? "success" : "danger");
      notify({ tone: result.ok ? "success" : "danger", message: result.ok ? "Tavoite päivitetty." : result.message });
    } finally {
      setIsSavingGoal(false);
    }
  };
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

  const submitSettings = form.handleSubmit(async (values) => {
    if (!allowedViewOptions.includes(values.defaultDashboardView)) {
      setMessage("Valittu aloitussivu ei ole sallittu roolillesi.");
      setMessageTone("danger");
      return;
    }

    // Ei withMinimumDelaytä: nämä asetukset tallentuvat automaattisesti ja
    // kontrolli päivittyy heti (form.watch) ilman spinneriä, joten keinotekoinen
    // minimiviive pitäisi kontrollit turhaan disabloituina. Lukko (disabled=
    // isSavingSettings) serialisoi yhä tallennukset, joten rinnakkaisuusrace ei synny.
    const result = await updateCurrentUserSettings(values);
    setMessage(result.ok ? "Tallennettu." : result.message);
    setMessageTone(result.ok ? "success" : "danger");
    if (!result.ok) {
      notify({ tone: "danger", message: result.message });
      // Teema sovelletaan optimistisesti heti valinnasta, joten epäonnistuneen
      // tallennuksen jälkeen palautetaan DOM ja valinta vastaamaan tallennettua tilaa.
      const savedTheme = currentUser.settings?.themeMode ?? "light";
      setThemePreference(savedTheme);
      if (values.themeMode !== savedTheme) {
        form.setValue("themeMode", savedTheme, { shouldDirty: false });
      }
    }
  });
  const isSavingSettings = form.formState.isSubmitting;
  // Asetukset tallentuvat heti muutoksesta (handoff: instant-toggle/-valinta).
  const autoSaveSettings = (apply: () => void) => {
    apply();
    void submitSettings();
  };
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
      <Segmented
        scrollable
        ariaLabel="Tilin asetusten osiot"
        idPrefix="settings-section-tab"
        controlsPrefix="settings-section-panel"
        value={activeSection}
        onChange={setActiveSection}
        options={settingsSectionTabs.map((tab) => ({ value: tab.section, label: tab.label }))}
      />

      {activeSection === "account" ? (
      <div role="tabpanel" id="settings-section-panel-account" aria-labelledby="settings-section-tab-account">
      <Card className="border-[var(--border-strong)]">
        <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Tili</p>
        <CardTitle className="text-xl sm:text-2xl">Profiili</CardTitle>

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
            <div className="mt-1 flex flex-wrap items-center gap-2.5">
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
                className={`size-10 shrink-0 p-0 ${
                  currentUser.profileImageUrl && !isUploadingProfileImage ? "text-[var(--danger)]" : ""
                }`}
                aria-label="Poista kuva"
                title="Poista kuva"
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
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </div>
            <p className="mt-2 text-xs text-[var(--text-subtle)]">
              {PROFILE_IMAGE_HELPER_TEXT}
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--text-subtle)]">Keho</p>
            <div className="mt-2 grid grid-cols-2 gap-3">
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
              <div className="col-span-2">
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
              </div>
            </div>
            <p className="mt-2 text-xs text-[var(--text-subtle)]">
              Paino ja vyötärö päivittyvät Keho-näkymästä.
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

        {canTrackOwnTraining(currentUser.role) ? (
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--text-subtle)]">Tavoite</p>
            <p className="mb-2 mt-0.5 text-xs text-[var(--text-muted)]">Säätää ravinnon kcal- ja makrotavoitteet.</p>
            <Select
              id="account-goal"
              aria-label="Tavoite"
              value={goalDraft}
              disabled={isSavingGoal}
              onChange={(event) => void handleGoalChange(event.target.value as NutritionGoal)}
            >
              <option value="lose">Pudota painoa</option>
              <option value="maintain">Ylläpidä</option>
              <option value="gain">Kasvata</option>
            </Select>
            {missingGoalFields.length > 0 ? (
              <p className="mt-2 text-xs text-[var(--warning)]">
                Täytä ikä, sukupuoli, pituus ja paino, niin laskemme kcal-tavoitteen automaattisesti.
              </p>
            ) : computedGoalTarget ? (
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                Laskettu tavoite:{" "}
                <span className="font-semibold text-[var(--text)]">{computedGoalTarget.kcal} kcal</span>
                {" · "}P {computedGoalTarget.proteinG} / H {computedGoalTarget.carbsG} / R {computedGoalTarget.fatG} g.
              </p>
            ) : null}
            {goalMessage ? <InlineFeedback message={goalMessage} tone={goalMessageTone} className="mt-2 text-sm" /> : null}
          </div>
        ) : null}

        <div className="mt-4 border-t border-[var(--border)] pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--text-subtle)]">Turvallisuus</p>
          <div className="mt-2 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
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
          <CardTitle className="text-xl sm:text-2xl">Teema ja ulkoasu</CardTitle>
          <div className="mt-4 space-y-3.5">
            <div>
              <Label htmlFor="settings-theme-mode">Teema</Label>
              <Select
                id="settings-theme-mode"
                disabled={isSavingSettings}
                value={settingsThemeMode}
                onChange={(event) => {
                  const nextTheme = event.target.value as ThemeMode;
                  // Talleta laitekohtaiseen cacheen ja sovella heti DOMiin (kuten
                  // aksenttiväri), jotta vaihto näkyy välittömästi eikä taustasynkka
                  // revertoi sitä. Tallennus palvelimelle jatkuu autoSaveSettingsin kautta.
                  setThemePreference(nextTheme);
                  autoSaveSettings(() => form.setValue("themeMode", nextTheme, { shouldDirty: true }));
                }}
              >
                {Object.entries(themeModeLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>

            {settingsThemeMode === "light" || settingsThemeMode === "dark" ? (
              <div>
                <Label htmlFor="settings-accent">Aksenttiväri</Label>
                <Select
                  id="settings-accent"
                  value={accentColor}
                  onChange={(event) => setAccentColor(event.target.value as AccentColor)}
                >
                  <option value="green">Vihreä</option>
                  <option value="blue">Sininen</option>
                  <option value="copper">Kupari</option>
                </Select>
              </div>
            ) : null}

            <div>
              <Label htmlFor="settings-default-view">Aloitusnäkymä</Label>
              <Select
                id="settings-default-view"
                disabled={isSavingSettings}
                value={settingsDefaultView}
                onChange={(event) =>
                  autoSaveSettings(() =>
                    form.setValue("defaultDashboardView", event.target.value as DashboardHomeView, { shouldDirty: true }),
                  )
                }
              >
                {allowedViewOptions.map((view) => (
                  <option key={view} value={view}>
                    {dashboardViewLabelFor(view)}
                  </option>
                ))}
              </Select>
              <p className="mt-1.5 text-xs text-[var(--text-subtle)]">Näkymä, joka avautuu kun käynnistät sovelluksen.</p>
            </div>

            {message ? <InlineFeedback message={message} tone={messageTone} className="text-sm" /> : null}
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
          <CardTitle className="text-xl sm:text-2xl">Muistutukset</CardTitle>
          <div className="mt-4 space-y-3.5">
            <div className="divide-y divide-[var(--border)] rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-2.5">
              <div className="flex items-start justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span id="settings-weekly-measurements-label" className="block text-sm font-semibold text-[var(--text)]">
                    Viikkomuistutus
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-[var(--text-subtle)]">
                    Näytä perjantain muistutus painon ja vyötärön päivittämiseen.
                  </span>
                </span>
                <SettingToggle
                  labelledBy="settings-weekly-measurements-label"
                  checked={settingsWeeklyMeasurementReminders}
                  disabled={isSavingSettings}
                  onChange={(next) =>
                    autoSaveSettings(() => form.setValue("weeklyMeasurementReminders", next, { shouldDirty: true }))
                  }
                />
              </div>

              <div className="flex items-start justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span id="settings-email-notifications-label" className="block text-sm font-semibold text-[var(--text)]">
                    Sähköposti-ilmoitukset
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-[var(--text-subtle)]">
                    Lähetä sähköposti uusista treeneistä ja ohjelmapäivityksistä.
                  </span>
                </span>
                <SettingToggle
                  labelledBy="settings-email-notifications-label"
                  checked={settingsEmailNotifications}
                  disabled={isSavingSettings}
                  onChange={(next) =>
                    autoSaveSettings(() => form.setValue("emailNotifications", next, { shouldDirty: true }))
                  }
                />
              </div>
            </div>

            {message ? <InlineFeedback message={message} tone={messageTone} className="text-sm" /> : null}
          </div>
        </Card>
      </div>
      ) : null}

      {activeSection === "units" ? (
      <div role="tabpanel" id="settings-section-panel-units" aria-labelledby="settings-section-tab-units" className="grid gap-4">
        <Card>
          <CardTitle className="text-xl sm:text-2xl">Yksiköt</CardTitle>
          <div className="mt-4 space-y-3.5">
            <div>
              <Label htmlFor="settings-load-increment">Kuorman säätöaskel</Label>
              <Select
                id="settings-load-increment"
                disabled={isSavingSettings}
                value={String(settingsLoadIncrementKg)}
                onChange={(event) =>
                  autoSaveSettings(() => form.setValue("loadIncrementKg", parseLoadIncrement(event.target.value), { shouldDirty: true }))
                }
              >
                {loadIncrementOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>

            {message ? <InlineFeedback message={message} tone={messageTone} className="text-sm" /> : null}
          </div>
        </Card>
      </div>
      ) : null}
    </div>
  );
}
