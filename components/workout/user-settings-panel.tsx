"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Bell, KeyRound, Mail, MoonStar, MoreHorizontal, Ruler, ShieldAlert, UserRoundCog, Waves } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { bodyMeasurementSchema, userSettingsSchema } from "@/components/workout/schemas";
import { roleLabel } from "@/components/workout/shared";
import { withMinimumDelay } from "@/lib/min-delay";
import { getAssignableCoachUsers, getDashboardViewsForRole, getDefaultDashboardView } from "@/lib/role-access";
import type { DashboardHomeView, Role, ThemeMode } from "@/lib/types";
import { useAppState } from "@/providers/app-state-provider";

const dashboardViewLabel: Record<DashboardHomeView, string> = {
  overview: "Yleiskuva",
  templates: "Ohjelmat",
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

function resolveDefaultView(role: Role, value: DashboardHomeView | undefined): DashboardHomeView {
  const allowed = getDashboardViewsForRole(role);
  if (value && allowed.includes(value)) {
    return value;
  }

  return getDefaultDashboardView(role);
}

export function UserSettingsPanel() {
  const {
    authenticatedUser,
    currentUser,
    isImpersonating,
    notify,
    state,
    startAdminImpersonation,
    updateCurrentUserSettings,
    updateCurrentUserMeasurements,
    requestCurrentUserPasswordReset,
    adminDeleteUser,
    adminSendPasswordResetEmail,
    adminUpdateUserRole,
    adminAssignAthleteCoaches,
  } = useAppState();
  const [message, setMessage] = useState<string>("");
  const [profileMessage, setProfileMessage] = useState<string>("");
  const [passwordResetMessage, setPasswordResetMessage] = useState<string>("");
  const [adminMessage, setAdminMessage] = useState<string>("");
  const [previewResetUrl, setPreviewResetUrl] = useState<string>("");
  const [selectedManagedUserId, setSelectedManagedUserId] = useState<string>("");
  const [selectedManagedRole, setSelectedManagedRole] = useState<Role>("coach");
  const [selectedManagedCoachIds, setSelectedManagedCoachIds] = useState<string[]>([]);
  const [isSavingRole, setIsSavingRole] = useState(false);
  const [isSavingCoaches, setIsSavingCoaches] = useState(false);
  const [isSendingOwnPasswordReset, setIsSendingOwnPasswordReset] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSendingManagedPasswordReset, setIsSendingManagedPasswordReset] = useState(false);
  const [isDeletingManagedUser, setIsDeletingManagedUser] = useState(false);
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
  const manageableUsers = useMemo(
    () =>
      currentUser?.role === "admin"
        ? state.users
            .filter((user) => user.id !== currentUser.id)
            .sort((a, b) => a.fullName.localeCompare(b.fullName, "fi-FI"))
        : [],
    [currentUser, state.users],
  );
  const selectedManagedUser = useMemo(
    () => manageableUsers.find((user) => user.id === selectedManagedUserId) ?? manageableUsers[0],
    [manageableUsers, selectedManagedUserId],
  );
  const assignableCoaches = useMemo(
    () => getAssignableCoachUsers(state.users).sort((a, b) => a.fullName.localeCompare(b.fullName, "fi-FI")),
    [state.users],
  );
  const selectedManagedAthleteCoachIds = useMemo(
    () =>
      selectedManagedUser?.role === "athlete"
        ? state.assignments
            .filter((assignment) => assignment.athleteId === selectedManagedUser.id && assignment.active)
            .map((assignment) => assignment.coachId)
        : [],
    [selectedManagedUser, state.assignments],
  );
  const isRoleDirty = Boolean(selectedManagedUser) && selectedManagedRole !== selectedManagedUser.role;
  const isCoachSelectionDirty =
    selectedManagedUser?.role === "athlete" &&
    (selectedManagedCoachIds.length !== selectedManagedAthleteCoachIds.length ||
      selectedManagedCoachIds.some((coachId) => !selectedManagedAthleteCoachIds.includes(coachId)));

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

  useEffect(() => {
    if (currentUser?.role !== "admin") {
      return;
    }

    if (selectedManagedUserId && manageableUsers.some((user) => user.id === selectedManagedUserId)) {
      return;
    }

    setSelectedManagedUserId(manageableUsers[0]?.id ?? "");
  }, [currentUser?.role, manageableUsers, selectedManagedUserId]);

  useEffect(() => {
    if (!selectedManagedUser) {
      return;
    }

    setSelectedManagedRole(selectedManagedUser.role);
  }, [selectedManagedUser]);

  useEffect(() => {
    setSelectedManagedCoachIds(selectedManagedAthleteCoachIds);
  }, [selectedManagedAthleteCoachIds]);

  if (!currentUser) {
    return null;
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
              Pituus on pysyva profiilitieto. Paivita paino ja vyotaro edelleen yleiskuvan mittaseurannasta.
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
            Muokkaa sita, miten sovellus kayttaytyy sinulle paivittaisessa kaytossa.
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
                Tumma tila vaihtaa koko sovelluksen varimaailman rauhallisemmaksi hamarassa kaytossa.
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
                Tätä askelta käytetään treenitaulukon kuorman + ja - painikkeissa.
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

        {currentUser.role === "admin" ? (
          <Card className="border-[var(--border-strong)]">
            <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Admin-oikeudet</p>
            <CardTitle className="text-2xl">Käyttäjien hallinta</CardTitle>
            <CardDescription className="mt-2">
              Hallitse käyttäjiä turvallisesti: vaihda rooli tarvittaessa, lähetä salasanan nollausviesti,
              esikatsele nollauslinkki ja poista käyttäjä.
            </CardDescription>

            {manageableUsers.length === 0 ? (
              <p className="mt-4 rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-muted)]">
                Ei hallittavia käyttäjiä.
              </p>
            ) : (
              <>
                <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                  <div>
                    <Label htmlFor="admin-managed-user">Käyttäjä</Label>
                    <Select
                      id="admin-managed-user"
                      value={selectedManagedUser?.id ?? ""}
                      onChange={(event) => {
                        setSelectedManagedUserId(event.target.value);
                        setAdminMessage("");
                        setPreviewResetUrl("");
                      }}
                    >
                      {manageableUsers.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.fullName} ({user.email})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Badge>{manageableUsers.length} käyttäjää</Badge>
                </div>

                {selectedManagedUser ? (
                  <div className="mt-4 grid gap-3 rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <p className="font-medium text-[var(--text)]">{selectedManagedUser.fullName}</p>
                    <p className="text-sm text-[var(--text-muted)]">{selectedManagedUser.email}</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge>{roleLabel(selectedManagedUser.role)}</Badge>
                      <Badge>{selectedManagedUser.status === "active" ? "Aktiivinen" : "Kutsu odottaa"}</Badge>
                      {selectedManagedUser.role === "athlete" && selectedManagedAthleteCoachIds.length > 0 ? (
                        <Badge>
                          Valmentajia: {selectedManagedAthleteCoachIds.length}
                        </Badge>
                      ) : null}
                    </div>

                    <div className="mt-2 grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <Label htmlFor="admin-managed-role" className="mb-0">
                          Rooli
                        </Label>
                        {isRoleDirty ? (
                          <Button
                            type="button"
                            variant="secondary"
                            className="w-full sm:w-auto"
                            loading={isSavingRole}
                            loadingText="Tallennetaan roolia..."
                            onClick={async () => {
                              setIsSavingRole(true);
                              try {
                                const result = await withMinimumDelay(
                                  adminUpdateUserRole(selectedManagedUser.id, selectedManagedRole),
                                );
                                setAdminMessage(
                                  result.ok
                                    ? `Rooli päivitettiin: ${selectedManagedUser.fullName} on nyt ${roleLabel(selectedManagedRole)}.`
                                    : result.message,
                                );
                              } finally {
                                setIsSavingRole(false);
                              }
                            }}
                          >
                            Tallenna rooli
                          </Button>
                        ) : (
                          <Badge>Ei muutoksia</Badge>
                        )}
                      </div>
                      <div>
                        <Select
                          id="admin-managed-role"
                          value={selectedManagedRole}
                          onChange={(event) => setSelectedManagedRole(event.target.value as Role)}
                        >
                          <option value="admin">Admin</option>
                          <option value="coach">Valmentaja</option>
                          <option value="athlete">Treenaaja</option>
                        </Select>
                        <p className="mt-2 text-xs text-[var(--text-subtle)]">
                          Roolin vaihto siivoaa vain ristiriitaiset valmentaja-treenaaja-suhteet. Muu käyttäjädata säilyy.
                        </p>
                      </div>
                    </div>

                    {selectedManagedUser.role === "athlete" ? (
                      <div className="mt-2 grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <Label htmlFor="admin-managed-coaches" className="mb-0">
                            Vastuuhenkilöt
                          </Label>
                          {isCoachSelectionDirty ? (
                            <Button
                              type="button"
                              variant="secondary"
                              className="w-full sm:w-auto"
                              disabled={selectedManagedCoachIds.length === 0}
                              loading={isSavingCoaches}
                              loadingText="Tallennetaan vastuuhenkilöitä..."
                              onClick={async () => {
                                setIsSavingCoaches(true);
                                try {
                                  const result = await withMinimumDelay(
                                    adminAssignAthleteCoaches(selectedManagedUser.id, selectedManagedCoachIds),
                                  );
                                  setAdminMessage(
                                    "message" in result ? result.message : "Vastuuhenkilöt tallennettiin.",
                                  );
                                } finally {
                                  setIsSavingCoaches(false);
                                }
                              }}
                            >
                              Tallenna vastuuhenkilöt
                            </Button>
                          ) : (
                            <Badge>Ei muutoksia</Badge>
                          )}
                        </div>
                        <div>
                          <div
                            id="admin-managed-coaches"
                            className="grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3"
                          >
                            {assignableCoaches.map((user) => {
                              const checked = selectedManagedCoachIds.includes(user.id);
                              return (
                                <label
                                  key={user.id}
                                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2 transition ${
                                    checked
                                      ? "border-[var(--accent-strong)] bg-[color:color-mix(in_oklab,var(--accent)_10%,var(--surface))]"
                                      : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]"
                                  }`}
                                >
                                  <span className="min-w-0">
                                    <span className="block text-sm font-medium text-[var(--text)]">{user.fullName}</span>
                                    <span className="block text-xs text-[var(--text-subtle)]">{roleLabel(user.role)} · {user.email}</span>
                                  </span>
                                  <input
                                    type="checkbox"
                                    className="size-4 shrink-0 accent-[var(--accent)]"
                                    checked={checked}
                                    onChange={() =>
                                      setSelectedManagedCoachIds((previous) =>
                                        checked
                                          ? previous.filter((coachId) => coachId !== user.id)
                                          : [...previous, user.id],
                                      )
                                    }
                                  />
                                </label>
                              );
                            })}
                          </div>
                          <p className="mt-2 text-xs text-[var(--text-subtle)]">
                            Voit valita treenaajalle useamman valmennuskelpoisen vastuuhenkilön. Myös admin
                            voidaan liittää tähän listaan.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="text-xs text-[var(--text-subtle)]">
                            Valittuna {selectedManagedCoachIds.length} / {assignableCoaches.length}
                          </p>
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="primary"
                        disabled={selectedManagedUser.status !== "active"}
                        onClick={() => {
                          const result = startAdminImpersonation(selectedManagedUser.id);
                          setAdminMessage(
                            result.ok
                              ? `Vaihdoit käyttäjäksi: ${selectedManagedUser.fullName}.`
                              : result.message,
                          );
                        }}
                      >
                        Vaihda käyttäjäksi
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={selectedManagedUser.status !== "active"}
                        loading={isSendingManagedPasswordReset}
                        loadingText="Lähetetään nollauslinkkiä..."
                        onClick={async () => {
                          setIsSendingManagedPasswordReset(true);
                          try {
                            const result = await withMinimumDelay(
                              adminSendPasswordResetEmail(selectedManagedUser.id),
                            );
                            setAdminMessage(result.message);
                            setPreviewResetUrl(result.ok ? (result.previewUrl ?? "") : "");
                          } finally {
                            setIsSendingManagedPasswordReset(false);
                          }
                        }}
                      >
                        <Mail className="mr-2 size-4" />
                        Lähetä salasanan nollaus
                      </Button>
                      <details className="relative">
                        <summary className="inline-flex list-none items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]">
                          <MoreHorizontal className="size-4" aria-hidden="true" />
                          <span className="sr-only">Avaa käyttäjän lisätoiminnot</span>
                        </summary>
                        <div className="absolute left-0 top-[calc(100%+0.5rem)] z-10 min-w-52 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[0_18px_45px_-24px_var(--shadow)]">
                          <button
                            type="button"
                            disabled={isDeletingManagedUser}
                            className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-[var(--danger)] transition hover:bg-[var(--surface-2)]"
                            onClick={async () => {
                              const confirmed = window.confirm(
                                `Poistetaanko käyttäjä ${selectedManagedUser.fullName}? Tämä poistaa myös käyttäjään liittyvät kutsut, roolitukset ja treenidatan.`,
                              );
                              if (!confirmed) {
                                return;
                              }

                              setIsDeletingManagedUser(true);
                              try {
                                const result = await adminDeleteUser(selectedManagedUser.id);
                                setAdminMessage(result.ok ? "Käyttäjä poistettiin turvallisesti." : result.message);
                                if (result.ok) {
                                  setPreviewResetUrl("");
                                }
                              } finally {
                                setIsDeletingManagedUser(false);
                              }
                            }}
                          >
                            {isDeletingManagedUser ? (
                              <>
                                <span
                                  aria-hidden="true"
                                  className="mr-2 size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
                                />
                                Poistetaan käyttäjää...
                              </>
                            ) : (
                              <>
                                <ShieldAlert className="mr-2 size-4" />
                                Poista käyttäjä
                              </>
                            )}
                          </button>
                        </div>
                      </details>
                    </div>
                  </div>
                ) : null}

                <p
                  aria-live="polite"
                  className={`mt-4 text-sm ${
                    !adminMessage
                      ? "text-[var(--text-subtle)]"
                      : adminMessage.includes("lähet") ||
                          adminMessage.includes("poistettiin") ||
                          adminMessage.includes("Vaihdoit") ||
                          adminMessage.includes("päivitettiin") ||
                          adminMessage.includes("asetettiin")
                        ? "text-[var(--success)]"
                        : "text-[var(--danger)]"
                  }`}
                >
                  {adminMessage ||
                    (selectedManagedUser
                      ? "Päivitä rooli, vastuuhenkilöt tai käytä alapuolen toimintoja."
                      : "Valitse käyttäjä aloittaaksesi hallinnan.")}
                </p>

                {isImpersonating && authenticatedUser ? (
                  <p className="mt-2 text-xs text-[var(--text-subtle)]">
                    Käyttäjän vaihto on aktiivinen. Olet kirjautuneena adminina ({authenticatedUser.fullName}),
                    mutta toimit nyt valittuna käyttäjänä.
                  </p>
                ) : null}

                {previewResetUrl ? (
                  <div className="mt-3 grid gap-3 rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <p className="text-xs font-semibold tracking-[0.03em] text-[var(--text-subtle)]">Sähköpostin esikatselu</p>
                    <p className="text-sm text-[var(--text-muted)]">
                      Demo-ympäristössä voit avata tästä nollauslinkin esikatselun. Tuotannossa linkki
                      lähetetään suoraan käyttäjän sähköpostiin.
                    </p>
                    <a
                      href={previewResetUrl}
                      aria-label={`Avaa salasanan nollauslinkin esikatselu käyttäjälle ${selectedManagedUser?.email ?? "valittu käyttäjä"}`}
                      className="inline-flex w-full items-center justify-center rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--text)] transition duration-150 hover:bg-[var(--surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] sm:w-fit"
                    >
                      Avaa nollauslinkin esikatselu
                    </a>
                  </div>
                ) : null}
              </>
            )}
          </Card>
        ) : null}
      </div>
    </div>
  );
}
