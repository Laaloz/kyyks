"use client";

import { Mail, MoreHorizontal, Search, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label, Select } from "@/components/ui/field";
import { roleLabel } from "@/components/workout/shared";
import { withMinimumDelay } from "@/lib/min-delay";
import { getAssignableCoachUsers } from "@/lib/role-access";
import type { Role } from "@/lib/types";
import { useAppState } from "@/providers/app-state-provider";

export function AdminUserManagementPanel({ focusUserId }: { focusUserId?: string } = {}) {
  const {
    currentUser,
    notify,
    state,
    adminDeleteUser,
    adminSendPasswordResetEmail,
    adminUpdateUserRole,
    adminAssignAthleteCoaches,
  } = useAppState();
  const [adminMessage, setAdminMessage] = useState<string>("");
  const [adminMessageTone, setAdminMessageTone] = useState<"success" | "danger" | null>(null);
  const [previewResetUrl, setPreviewResetUrl] = useState<string>("");
  const [selectedManagedUserId, setSelectedManagedUserId] = useState<string>("");
  const [selectedManagedRole, setSelectedManagedRole] = useState<Role>("coach");
  const [selectedManagedCoachIds, setSelectedManagedCoachIds] = useState<string[]>([]);
  const [isSavingRole, setIsSavingRole] = useState(false);
  const [isSavingCoaches, setIsSavingCoaches] = useState(false);
  const [isSendingManagedPasswordReset, setIsSendingManagedPasswordReset] = useState(false);
  const [isDeletingManagedUser, setIsDeletingManagedUser] = useState(false);
  const [query, setQuery] = useState("");

  const manageableUsers = useMemo(
    () =>
      currentUser?.role === "admin"
        ? state.users
            .filter((user) => user.id !== currentUser.id)
            .sort((a, b) => a.fullName.localeCompare(b.fullName, "fi-FI"))
        : [],
    [currentUser?.id, currentUser?.role, state.users],
  );
  const activeManagedUserId = focusUserId ?? selectedManagedUserId;
  const selectedManagedUser = useMemo(
    () =>
      manageableUsers.find((user) => user.id === activeManagedUserId) ??
      (focusUserId ? null : (manageableUsers[0] ?? null)),
    [activeManagedUserId, focusUserId, manageableUsers],
  );
  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return normalizedQuery
      ? manageableUsers.filter(
          (user) =>
            user.fullName.toLowerCase().includes(normalizedQuery) ||
            user.email.toLowerCase().includes(normalizedQuery),
        )
      : manageableUsers;
  }, [manageableUsers, query]);
  const assignableCoaches = useMemo(
    () => getAssignableCoachUsers(state.users).sort((a, b) => a.fullName.localeCompare(b.fullName, "fi-FI")),
    [state.users],
  );
  const selectedManagedAthleteCoachIds = useMemo(
    () =>
      (selectedManagedUser?.role === "athlete" || selectedManagedUser?.role === "independent_athlete")
        ? state.assignments
            .filter((assignment) => assignment.athleteId === selectedManagedUser.id && assignment.active)
            .map((assignment) => assignment.coachId)
        : [],
    [selectedManagedUser, state.assignments],
  );
  const isRoleDirty = selectedManagedUser !== null && selectedManagedRole !== selectedManagedUser.role;
  const isCoachSelectionDirty =
    (selectedManagedUser?.role === "athlete" || selectedManagedUser?.role === "independent_athlete") &&
    (selectedManagedCoachIds.length !== selectedManagedAthleteCoachIds.length ||
      selectedManagedCoachIds.some((coachId) => !selectedManagedAthleteCoachIds.includes(coachId)));

  useEffect(() => {
    if (focusUserId) {
      setSelectedManagedUserId(focusUserId);
    }
  }, [focusUserId]);

  useEffect(() => {
    if (currentUser?.role !== "admin" || focusUserId) {
      return;
    }

    if (selectedManagedUserId && manageableUsers.some((user) => user.id === selectedManagedUserId)) {
      return;
    }

    setSelectedManagedUserId(manageableUsers[0]?.id ?? "");
  }, [currentUser?.role, focusUserId, manageableUsers, selectedManagedUserId]);

  useEffect(() => {
    if (!selectedManagedUser) {
      return;
    }

    setSelectedManagedRole(selectedManagedUser.role);
  }, [selectedManagedUser]);

  useEffect(() => {
    setSelectedManagedCoachIds(selectedManagedAthleteCoachIds);
  }, [selectedManagedAthleteCoachIds]);

  if (currentUser?.role !== "admin") {
    return null;
  }

  return (
    <div className="grid gap-6">
      <Card className="border-[var(--border-strong)]">
        {/* Fokustilassa (avattu Tiimin kortista) näytetään vain valitun käyttäjän hallinta. */}
        {!focusUserId ? (
        <>
        {/* Osio-otsikko "Käyttäjät" tulee yläpalkista. */}
        <div className="flex items-center gap-2 rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
          <Search className="size-4 shrink-0 text-[var(--text-subtle)]" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Hae käyttäjää…"
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-subtle)]"
          />
        </div>

        {filteredUsers.length === 0 ? (
          <p className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-muted)]">
            {manageableUsers.length === 0 ? "Ei hallittavia käyttäjiä." : "Ei käyttäjiä tällä haulla."}
          </p>
        ) : (
          <div className="mt-4 divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)]">
            {filteredUsers.map((user) => {
              const isSelected = user.id === selectedManagedUser?.id;
              return (
                <button
                  key={user.id}
                  type="button"
                  className={`flex w-full items-center justify-between gap-3 p-3.5 text-left transition ${
                    isSelected
                      ? "bg-[color:color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                      : "bg-[var(--surface)] hover:bg-[var(--surface-2)]"
                  }`}
                  aria-pressed={isSelected}
                  onClick={() => {
                    setSelectedManagedUserId(user.id);
                    setAdminMessage("");
                    setPreviewResetUrl("");
                  }}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[var(--text)]">{user.fullName}</p>
                    <p className="truncate text-[12.5px] text-[var(--text-subtle)]">{user.email}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge>{roleLabel(user.role)}</Badge>
                    {user.status !== "active" ? <Badge>Kutsu</Badge> : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        </>
        ) : null}

        {selectedManagedUser ? (
              <div className="mt-4 space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--text)]">
                      {selectedManagedUser.fullName}
                    </p>
                    <p className="truncate text-sm text-[var(--text-muted)]">{selectedManagedUser.email}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge>{roleLabel(selectedManagedUser.role)}</Badge>
                      {selectedManagedUser.status !== "active" ? <Badge>Kutsu odottaa</Badge> : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <details className="relative">
                      <summary className="inline-flex size-10 list-none items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] p-0 text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]">
                        <MoreHorizontal className="size-4" aria-hidden="true" />
                        <span className="sr-only">Avaa käyttäjän lisätoiminnot</span>
                      </summary>
                      <div className="absolute right-0 top-[calc(100%+0.5rem)] z-10 min-w-60 max-w-[calc(100vw-1rem)] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[0_18px_45px_-24px_var(--shadow)]">
                        <button
                          type="button"
                          disabled={selectedManagedUser.status !== "active" || isSendingManagedPasswordReset}
                          className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:text-[var(--text-subtle)] disabled:hover:bg-transparent"
                          onClick={async () => {
                            setIsSendingManagedPasswordReset(true);
                            try {
                              const result = await withMinimumDelay(adminSendPasswordResetEmail(selectedManagedUser.id));
                              setAdminMessage(result.message);
                              setAdminMessageTone(result.ok ? "success" : "danger");
                              setPreviewResetUrl(result.ok ? (result.previewUrl ?? "") : "");
                              notify({ tone: result.ok ? "success" : "danger", message: result.message });
                            } finally {
                              setIsSendingManagedPasswordReset(false);
                            }
                          }}
                        >
                          {isSendingManagedPasswordReset ? (
                            <>
                              <span
                                aria-hidden="true"
                                className="mr-2 size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
                              />
                              Lähetetään nollauslinkkiä...
                            </>
                          ) : (
                            <>
                              <Mail className="mr-2 size-4" />
                              Lähetä salasanan nollaus
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          disabled={isDeletingManagedUser}
                          className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-[var(--danger)] transition hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:text-[var(--text-subtle)] disabled:hover:bg-transparent"
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
                              setAdminMessageTone(result.ok ? "success" : "danger");
                              if (result.ok) {
                                setPreviewResetUrl("");
                              }
                              notify({
                                tone: result.ok ? "success" : "danger",
                                message: result.ok ? "Käyttäjä poistettiin." : result.message,
                              });
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

                <div>
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="admin-managed-role" className="mb-0">Rooli</Label>
                    {isRoleDirty ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="!h-9 !px-3 text-sm"
                        loading={isSavingRole}
                        loadingText="Tallennetaan…"
                        onClick={async () => {
                          setIsSavingRole(true);
                          try {
                            const result = await withMinimumDelay(adminUpdateUserRole(selectedManagedUser.id, selectedManagedRole));
                            setAdminMessage(
                              result.ok
                                ? `Rooli päivitettiin: ${selectedManagedUser.fullName} on nyt ${roleLabel(selectedManagedRole)}.`
                                : result.message,
                            );
                            setAdminMessageTone(result.ok ? "success" : "danger");
                            notify({ tone: result.ok ? "success" : "danger", message: result.ok ? "Rooli päivitettiin." : result.message });
                          } finally {
                            setIsSavingRole(false);
                          }
                        }}
                      >
                        Tallenna
                      </Button>
                    ) : null}
                  </div>
                  <Select
                    className="mt-2"
                    id="admin-managed-role"
                    value={selectedManagedRole}
                    onChange={(event) => setSelectedManagedRole(event.target.value as Role)}
                  >
                    <option value="admin">Admin</option>
                    <option value="coach">Valmentaja</option>
                    <option value="athlete">Treenaaja</option>
                    <option value="independent_athlete">Itsenäinen treenaaja</option>
                  </Select>
                </div>

                {selectedManagedUser.role === "athlete" || selectedManagedUser.role === "independent_athlete" ? (
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="admin-managed-coaches" className="mb-0">Vastuuhenkilöt</Label>
                      {isCoachSelectionDirty ? (
                        <Button
                          type="button"
                          variant="secondary"
                          className="!h-9 !px-3 text-sm"
                          disabled={selectedManagedCoachIds.length === 0}
                          loading={isSavingCoaches}
                          loadingText="Tallennetaan…"
                          onClick={async () => {
                            setIsSavingCoaches(true);
                            try {
                              const result = await withMinimumDelay(
                                adminAssignAthleteCoaches(selectedManagedUser.id, selectedManagedCoachIds),
                              );
                              const message = "message" in result ? result.message : "Vastuuhenkilöt tallennettiin.";
                              setAdminMessage(message);
                              const tone = "ok" in result && result.ok ? "success" : "danger";
                              setAdminMessageTone(tone);
                              notify({ tone, message });
                            } finally {
                              setIsSavingCoaches(false);
                            }
                          }}
                        >
                          Tallenna
                        </Button>
                      ) : null}
                    </div>
                    <div id="admin-managed-coaches" className="mt-2 grid gap-2">
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
                                <span className="block text-xs text-[var(--text-subtle)]">
                                  {roleLabel(user.role)} · {user.email}
                                </span>
                              </span>
                              <input
                                type="checkbox"
                                className="size-4 shrink-0 accent-[var(--accent)]"
                                checked={checked}
                                onChange={() =>
                                  setSelectedManagedCoachIds((previous) =>
                                    checked ? previous.filter((coachId) => coachId !== user.id) : [...previous, user.id],
                                  )
                                }
                              />
                            </label>
                          );
                        })}
                    </div>
                  </div>
                ) : null}
          {adminMessage ? (
            <p
              aria-live="polite"
              className={`text-sm ${adminMessageTone === "success" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
            >
              {adminMessage}
            </p>
          ) : null}

          {previewResetUrl ? (
            <div className="grid gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <p className="text-xs font-semibold tracking-[0.03em] text-[var(--text-subtle)]">Sähköpostin nollauslinkki</p>
              <a
                href={previewResetUrl}
                aria-label={`Avaa salasanan nollauslinkin esikatselu käyttäjälle ${selectedManagedUser?.email ?? "valittu käyttäjä"}`}
                className="inline-flex w-full items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--surface-3)]"
              >
                Avaa nollauslinkki
              </a>
            </div>
          ) : null}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
