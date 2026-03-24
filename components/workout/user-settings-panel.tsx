"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Bell, KeyRound, Mail, MoonStar, ShieldAlert, UserRoundCog } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { userSettingsSchema } from "@/components/workout/schemas";
import { roleLabel } from "@/components/workout/shared";
import { getAssignableCoachUsers, getDashboardViewsForRole, getDefaultDashboardView } from "@/lib/role-access";
import type { DashboardHomeView, Role, ThemeMode } from "@/lib/types";
import { useAppState } from "@/providers/app-state-provider";

const dashboardViewLabel: Record<DashboardHomeView, string> = {
  overview: "Yleiskuva",
  templates: "Ohjelmat",
  invites: "Käyttäjäkutsut",
  "athlete-log": "Treeniloki",
  conversation: "Keskustelu",
};

const themeModeLabel: Record<ThemeMode, string> = {
  light: "Vaalea",
  dark: "Tumma",
};

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
    state,
    startAdminImpersonation,
    updateCurrentUserSettings,
    requestCurrentUserPasswordReset,
    adminDeleteUser,
    adminSendPasswordResetEmail,
    adminUpdateUserRole,
    adminAssignAthleteCoaches,
  } = useAppState();
  const [message, setMessage] = useState<string>("");
  const [passwordResetMessage, setPasswordResetMessage] = useState<string>("");
  const [adminMessage, setAdminMessage] = useState<string>("");
  const [previewResetUrl, setPreviewResetUrl] = useState<string>("");
  const [selectedManagedUserId, setSelectedManagedUserId] = useState<string>("");
  const [selectedManagedRole, setSelectedManagedRole] = useState<Role>("coach");
  const [selectedManagedCoachIds, setSelectedManagedCoachIds] = useState<string[]>([]);

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
      weightKg: currentUser?.weightKg,
      waistCm: currentUser?.waistCm,
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

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    form.reset({
      fullName: currentUser.fullName,
      defaultDashboardView: resolveDefaultView(currentUser.role, currentUser.settings?.defaultDashboardView),
      emailNotifications: currentUser.settings?.emailNotifications ?? false,
      themeMode: currentUser.settings?.themeMode ?? "light",
      weightKg: currentUser.weightKg,
      waistCm: currentUser.waistCm,
    });
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

  return (
    <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
      <Card className="border-[var(--border-strong)]">
        <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Tiliasetukset</p>
        <CardTitle className="text-2xl">Oma profiili</CardTitle>
        <CardDescription className="mt-2">
          Päivitä nimesi, valitse teema ja aloitussivu sekä säädä ilmoitukset omaan käyttöön sopiviksi.
        </CardDescription>

        <form
          className="mt-6 space-y-4"
          onSubmit={form.handleSubmit((values) => {
            if (!allowedViewOptions.includes(values.defaultDashboardView)) {
              setMessage("Valittu aloitussivu ei ole sallittu roolillesi.");
              return;
            }

            const result = updateCurrentUserSettings(values);
            setMessage(result.ok ? "Muutokset tallennettu." : result.message);
          })}
        >
          <div>
            <Label htmlFor="settings-full-name">Koko nimi</Label>
            <Input
              id="settings-full-name"
              aria-invalid={Boolean(form.formState.errors.fullName)}
              aria-describedby={form.formState.errors.fullName ? "settings-full-name-error" : undefined}
              {...form.register("fullName")}
            />
            {form.formState.errors.fullName ? (
              <p className="mt-2 text-sm text-[var(--danger)]" id="settings-full-name-error">
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
            <Label htmlFor="settings-default-view">Aloitussivu</Label>
            <Select id="settings-default-view" {...form.register("defaultDashboardView")}>
              {allowedViewOptions.map((view) => (
                <option key={view} value={view}>
                  {dashboardViewLabel[view]}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="settings-theme-mode">Teema</Label>
            <Select id="settings-theme-mode" {...form.register("themeMode")}>
              {Object.entries(themeModeLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <p className="mt-2 text-xs text-[var(--text-subtle)]">
              Tumma tila vaihtaa koko sovelluksen värimaailman miellyttävämmäksi hämärässä käytössä.
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
                {...form.register("emailNotifications")}
              />
              <span className="text-sm text-[var(--text-muted)]">
                Lähetä sähköposti uusista treeneistä ja ohjelmapäivityksistä
              </span>
            </label>
          </div>

          {currentUser.role === "athlete" ? (
            <div className="grid gap-4 rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4 md:grid-cols-2">
              <div>
                <Label htmlFor="settings-weight-kg">Paino (kg)</Label>
                <Input
                  id="settings-weight-kg"
                  type="number"
                  inputMode="decimal"
                  min={20}
                  max={350}
                  step="0.1"
                  placeholder="Esim. 72.4"
                  {...form.register("weightKg")}
                />
              </div>
              <div>
                <Label htmlFor="settings-waist-cm">Vyötärö (cm)</Label>
                <Input
                  id="settings-waist-cm"
                  type="number"
                  inputMode="decimal"
                  min={30}
                  max={250}
                  step="0.5"
                  placeholder="Esim. 81"
                  {...form.register("waistCm")}
                />
              </div>
              <p className="text-xs text-[var(--text-subtle)] md:col-span-2">
                Merkitse paino ja vyötärö kerran viikossa. Kun päivität arvot, profiiliin tallentuu viimeisin mittaus ja kehitystrendi päivittyy automaattisesti.
              </p>
            </div>
          ) : null}

          <p
            aria-live="polite"
            className={`min-h-5 text-sm ${
              !message
                ? "text-[var(--text-subtle)]"
                : message.includes("tallennettu")
                  ? "text-[var(--success)]"
                  : "text-[var(--danger)]"
            }`}
          >
            {message}
          </p>

          <Button type="submit" className="w-full sm:w-auto">
            Tallenna muutokset
          </Button>
        </form>

        <div className="mt-6 rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4">
          <p className="text-xs font-semibold tracking-[0.03em] text-[var(--text-subtle)]">Salasana</p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Lähetä turvallinen nollauslinkki omaan sähköpostiisi. Linkki on kertakäyttöinen ja vanhenee automaattisesti.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                const result = await requestCurrentUserPasswordReset();
                setPasswordResetMessage(result.message);
              }}
            >
              <KeyRound className="mr-2 size-4" />
              Lähetä nollauslinkki
            </Button>
            <p
              aria-live="polite"
              className={`text-sm ${
                !passwordResetMessage
                  ? "text-[var(--text-subtle)]"
                  : passwordResetMessage.includes("lähet")
                    ? "text-[var(--success)]"
                    : "text-[var(--danger)]"
              }`}
            >
              {passwordResetMessage || "Ei aktiivista pyyntöä."}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-6">
        <Card>
          <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Yhteenveto</p>
          <CardTitle className="text-2xl">Profiilin yhteenveto</CardTitle>
          <CardDescription className="mt-2">
            {currentUser.role === "athlete"
              ? "Näet tässä roolin, teeman, ilmoitustilan, aloitussivun sekä viimeisimmät kehon mittaustiedot."
              : "Näet tässä roolin, teeman, ilmoitustilan ja valitun aloitussivun."}
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
            {currentUser.role === "athlete" ? (
              <>
                <div className="flex items-center justify-between rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
                  <span className="text-sm text-[var(--text-muted)]">Paino</span>
                  <Badge>{currentUser.weightKg !== undefined ? `${currentUser.weightKg} kg` : "Ei asetettu"}</Badge>
                </div>
                <div className="flex items-center justify-between rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
                  <span className="text-sm text-[var(--text-muted)]">Vyötärö</span>
                  <Badge>{currentUser.waistCm !== undefined ? `${currentUser.waistCm} cm` : "Ei asetettu"}</Badge>
                </div>
              </>
            ) : null}
          </div>
        </Card>

        {currentUser.role === "admin" ? (
          <Card className="border-[var(--border-strong)]">
            <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Admin-oikeudet</p>
            <CardTitle className="text-2xl">Käyttäjien hallinta</CardTitle>
            <CardDescription className="mt-2">
              Hallitse käyttäjiä turvallisesti: vaihda rooli tarvittaessa, lähetä salasanan nollausviesti, esikatsele reset-linkki ja poista käyttäjä.
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

                    <div className="mt-2 grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 md:grid-cols-[1fr_auto] md:items-end">
                      <div>
                        <Label htmlFor="admin-managed-role">Rooli</Label>
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
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full md:w-auto"
                        disabled={selectedManagedRole === selectedManagedUser.role}
                        onClick={async () => {
                          const result = await adminUpdateUserRole(selectedManagedUser.id, selectedManagedRole);
                          setAdminMessage(
                            result.ok
                              ? `Rooli päivitettiin: ${selectedManagedUser.fullName} on nyt ${roleLabel(selectedManagedRole)}.`
                              : result.message,
                          );
                        }}
                      >
                        Tallenna rooli
                      </Button>
                    </div>

                    {selectedManagedUser.role === "athlete" ? (
                      <div className="mt-2 grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                        <div>
                          <Label htmlFor="admin-managed-coaches">Vastuuhenkilöt</Label>
                          <div
                            id="admin-managed-coaches"
                            className="grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3"
                          >
                            {assignableCoaches.map((user) => {
                              const checked = selectedManagedCoachIds.includes(user.id);
                              return (
                                <label
                                  key={user.id}
                                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
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
                            Voit valita treenaajalle useamman valmennuskelpoisen vastuuhenkilön. Myös admin voidaan liittää tähän listaan.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <Button
                            type="button"
                            variant="secondary"
                            className="w-full md:w-auto"
                            disabled={
                              selectedManagedCoachIds.length === 0 ||
                              (selectedManagedCoachIds.length === selectedManagedAthleteCoachIds.length &&
                                selectedManagedCoachIds.every((coachId) => selectedManagedAthleteCoachIds.includes(coachId)))
                            }
                            onClick={async () => {
                              const result = await adminAssignAthleteCoaches(
                                selectedManagedUser.id,
                                selectedManagedCoachIds,
                              );
                              setAdminMessage(
                                "message" in result ? result.message : "Vastuuhenkilöt tallennettiin.",
                              );
                            }}
                          >
                            Tallenna valmentajat
                          </Button>
                          <p className="text-xs text-[var(--text-subtle)]">
                            Valittuna {selectedManagedCoachIds.length} / {assignableCoaches.length}
                          </p>
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-2 flex flex-wrap gap-2">
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
                        onClick={async () => {
                          const result = await adminSendPasswordResetEmail(selectedManagedUser.id);
                          setAdminMessage(result.message);
                          setPreviewResetUrl(result.ok ? (result.previewUrl ?? "") : "");
                        }}
                      >
                        <Mail className="mr-2 size-4" />
                        Lähetä salasanan nollaus
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-[var(--danger)] hover:text-[var(--danger)]"
                        onClick={async () => {
                          const confirmed = window.confirm(
                            `Poistetaanko käyttäjä ${selectedManagedUser.fullName}? Tämä poistaa myös käyttäjään liittyvät kutsut, roolitukset ja treenidatan.`,
                          );
                          if (!confirmed) {
                            return;
                          }

                          const result = await adminDeleteUser(selectedManagedUser.id);
                          setAdminMessage(result.ok ? "Käyttäjä poistettiin turvallisesti." : result.message);
                          if (result.ok) {
                            setPreviewResetUrl("");
                          }
                        }}
                      >
                        <ShieldAlert className="mr-2 size-4" />
                        Poista käyttäjä
                      </Button>
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
                  {adminMessage || "Valitse käyttäjä aloittaaksesi hallinnan."}
                </p>

                {isImpersonating && authenticatedUser ? (
                  <p className="mt-2 text-xs text-[var(--text-subtle)]">
                    User-switch on aktiivinen. Olet kirjautuneena adminina ({authenticatedUser.fullName}) mutta toimit nyt valittuna käyttäjänä.
                  </p>
                ) : null}

                {previewResetUrl ? (
                  <div className="mt-3 grid gap-3 rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <p className="text-xs font-semibold tracking-[0.03em] text-[var(--text-subtle)]">Sähköpostin esikatselu</p>
                    <p className="text-sm text-[var(--text-muted)]">
                      Demo-ympäristössä voit avata tästä nollauslinkin esikatselun. Tuotannossa linkki lähetetään suoraan käyttäjän sähköpostiin.
                    </p>
                    <a
                      href={previewResetUrl}
                      aria-label={`Avaa salasanan nollauslinkin esikatselu käyttäjälle ${selectedManagedUser?.email ?? "valittu käyttäjä"}`}
                      className="inline-flex w-full items-center justify-center rounded-xl border-2 border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--text)] transition duration-150 hover:bg-[var(--surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] sm:w-fit"
                    >
                      Avaa reset-linkin esikatselu
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
