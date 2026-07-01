"use client";

import {
  Carrot,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  Plus,
  RotateCcw,
  Search,
  Send,
  UserPlus,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { FullScreenOverlay, Sheet } from "@/components/ui/sheet";
import { ConversationPanel } from "@/components/workout/conversation-panel";
import { CoachInvitePanel } from "@/components/workout/coach/invite-panel";
import { ProgramEditorOverlay } from "@/components/workout/coach/program-editor-overlay";
import { ProgramsPanel } from "@/components/workout/coach/programs-panel";
import { AdminUserManagementPanel } from "@/components/workout/admin-user-management-panel";
import { isConversationEntryNotifiable } from "@/lib/conversation";
import { buildAthleteRosterSummary } from "@/lib/coach-roster";
import { getInviteLifecycleLabel, getVisiblePendingInvites } from "@/lib/invite-status";
import { withMinimumDelay } from "@/lib/min-delay";
import { getProgramStatus, isProgramActive } from "@/lib/program-status";
import { isAdminRole } from "@/lib/role-access";
import type { AppState, Exercise, ProgramWorkoutInput, Role, TrainingPlan, UserProfile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAppState } from "@/providers/app-state-provider";

import { PROGRAMS_WORKSPACE_VIEW, type WorkspaceView } from "@/components/workout/shared";

function SearchableAthleteConversationSelect({
  id,
  selectedAthleteId,
  athleteOptions,
  onSelect,
}: {
  id: string;
  selectedAthleteId: string;
  athleteOptions: Array<{ id: string; fullName: string; unreadCount: number }>;
  onSelect: (athleteId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedAthlete = athleteOptions.find((athlete) => athlete.id === selectedAthleteId);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen, rootRef]);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
    }
  }, [isOpen]);

  const filteredAthletes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return athleteOptions;
    }

    return athleteOptions.filter((athlete) => athlete.fullName.toLowerCase().includes(normalizedQuery));
  }, [athleteOptions, query]);

  const triggerLabel = selectedAthlete
    ? selectedAthlete.unreadCount > 0
      ? `${selectedAthlete.fullName} (${selectedAthlete.unreadCount})`
      : selectedAthlete.fullName
    : "Valitse treenaaja";

  return (
    <div ref={rootRef} className="relative">
      <button
        id={id}
        type="button"
        className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left text-base text-[var(--text)] outline-none transition focus:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className={cn("truncate", !selectedAthlete ? "text-[var(--text-subtle)]" : "")}>
          {triggerLabel}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-[var(--text-subtle)] transition", isOpen ? "rotate-180" : "")} />
      </button>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_18px_45px_-24px_var(--shadow)]">
          <div className="border-b border-[var(--border)] p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-subtle)]" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Hae treenaajaa"
                className="pl-10"
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto p-2">
            {filteredAthletes.length ? (
              filteredAthletes.map((athlete) => (
                <button
                  key={athlete.id}
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] hover:bg-[var(--surface-2)]"
                  onClick={() => {
                    onSelect(athlete.id);
                    setIsOpen(false);
                  }}
                >
                  <span className="block min-w-0">
                    <span className="block truncate text-sm font-semibold text-[var(--text)]">{athlete.fullName}</span>
                    <span className="mt-1 block text-xs text-[var(--text-subtle)]">
                      {athlete.unreadCount > 0
                        ? `${athlete.unreadCount} uutta viestiä`
                        : "Ei uusia viestejä"}
                    </span>
                  </span>
                  <span className="ml-3 flex items-center gap-2">
                    {athlete.unreadCount > 0 ? (
                      <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-[var(--accent)] px-2 py-1 text-xs font-semibold text-[var(--accent-contrast)]">
                        {athlete.unreadCount}
                      </span>
                    ) : null}
                    {selectedAthleteId === athlete.id ? (
                      <Check className="size-4 shrink-0 text-[var(--accent-strong)]" aria-hidden="true" />
                    ) : null}
                  </span>
                </button>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-3 py-4 text-sm text-[var(--text-muted)]">
                Hakusanalla ei löytynyt treenaajaa.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CoachDashboard({
  view,
  onOpenConversation,
  onOpenWorkoutLog,
  onOpenSettings,
  onOpenInvites,
  onOpenIngredients,
}: {
  view: WorkspaceView;
  onOpenConversation?: () => void;
  onOpenWorkoutLog?: () => void;
  onOpenSettings?: () => void;
  onOpenInvites?: () => void;
  onOpenIngredients?: () => void;
}) {
  const {
    currentUser,
    state,
    addConversationComment,
    getCoachAthletes,
    markConversationRead,
  } = useAppState();
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>("");

  const athletes = currentUser
    ? isAdminRole(currentUser.role)
      ? getCoachAthletes(currentUser.id)
      : getCoachAthletes(currentUser.id)
    : [];
  const coachPrograms = useMemo(
    () =>
      state.plans
        .filter(
          (plan) =>
            Boolean(plan.workouts?.length) &&
            getProgramStatus(plan) !== "removed" &&
            (isAdminRole(currentUser?.role) || plan.coachId === currentUser?.id),
        )
        .sort((left, right) => {
          const leftActive = isProgramActive(left) ? 1 : 0;
          const rightActive = isProgramActive(right) ? 1 : 0;
          if (leftActive !== rightActive) {
            return rightActive - leftActive;
          }

          return left.title.localeCompare(right.title, "fi");
        }),
    [currentUser?.id, currentUser?.role, state.plans],
  );

  useEffect(() => {
    if (!athletes.length) {
      setSelectedAthleteId("");
      return;
    }

    if (!athletes.some((athlete) => athlete.id === selectedAthleteId)) {
      setSelectedAthleteId(athletes[0]?.id ?? "");
    }
  }, [athletes, selectedAthleteId]);

  const exerciseOptions = useMemo(
    () =>
      state.exercises.filter(
        (exercise) => exercise.scope === "global" || isAdminRole(currentUser?.role) || exercise.coachId === currentUser?.id,
      ).sort((a, b) => a.name.localeCompare(b.name, "fi")),
    [state.exercises, currentUser],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (view !== PROGRAMS_WORKSPACE_VIEW) {
      return;
    }

    window.scrollTo({ top: 0, behavior: "auto" });
  }, [view]);

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      {view === "athletes" && currentUser ? (
        <CoachTeamView
          athletes={athletes}
          programs={coachPrograms}
          exercises={exerciseOptions}
          state={state}
          currentUser={currentUser}
          onOpenInvites={onOpenInvites}
          onOpenIngredients={onOpenIngredients}
        />
      ) : null}

      {view === "conversation" && currentUser ? (
        <CoachConversationView
          athletes={athletes}
          currentRole={currentUser.role}
          currentUserId={currentUser.id}
          entries={state.conversationEntries}
          markConversationRead={markConversationRead}
          onSend={addConversationComment}
          selectedAthleteId={selectedAthleteId}
          onSelectAthlete={setSelectedAthleteId}
          users={state.users}
        />
      ) : null}

      {view === PROGRAMS_WORKSPACE_VIEW && currentUser ? (
        // PROGRAMS-näkymään pääsee sovelluksessa vain itsenäinen treenaaja:
        // sama uusi ProgramEditorOverlay-pohjainen näkymä kuin valmentajalla/adminilla.
        <ProgramsPanel
          programs={coachPrograms}
          athletes={athletes}
          exercises={exerciseOptions}
          currentUser={currentUser}
          selfAssignOnly
        />
      ) : null}

      {view === "invites" ? <CoachInvitePanel /> : null}
    </div>
  );
}

function rosterInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function programWeekLabel(plan: TrainingPlan, reference: Date = new Date()): string | null {
  if (!plan.weekCount || plan.weekCount < 1) {
    return null;
  }
  const start = new Date(plan.startDate);
  start.setHours(0, 0, 0, 0);
  const today = new Date(reference);
  today.setHours(0, 0, 0, 0);
  const elapsedWeeks = Math.floor((today.getTime() - start.getTime()) / (7 * 86_400_000)) + 1;
  const current = Math.min(Math.max(1, elapsedWeeks), plan.weekCount);
  return `viikko ${current}/${plan.weekCount}`;
}

const ROSTER_PILL_TONE: Record<"good" | "warn" | "neutral", string> = {
  good: "border-[color:color-mix(in_oklab,var(--accent)_30%,var(--border))] bg-[var(--accent-soft)] text-[var(--accent)]",
  warn: "border-[color:color-mix(in_oklab,var(--accent-secondary)_40%,var(--border))] bg-[color:color-mix(in_oklab,var(--accent-secondary)_14%,var(--surface))] text-[var(--accent-secondary)]",
  neutral: "border-[var(--border)] bg-[var(--surface-3)] text-[var(--text-subtle)]",
};

const TEAM_CARD_HOVER =
  "hover:border-[color:color-mix(in_oklab,var(--accent)_34%,var(--border))] hover:shadow-[0_8px_22px_-18px_var(--accent)]";

function RosterMiniWeek({ cells }: { cells: ReturnType<typeof buildAthleteRosterSummary>["cells"] }) {
  return (
    <div className="mt-3 grid grid-cols-7 gap-1.5">
      {cells.map((cell) => (
        <div key={cell.key} className="flex min-w-0 flex-col items-center gap-1.5">
          <span
            className={cn(
              "flex w-full flex-col gap-1 rounded-lg",
              cell.isToday ? "outline outline-2 outline-offset-2 outline-[var(--text)]" : null,
            )}
          >
            <span
              className={cn(
                "block h-4 rounded-md",
                cell.training === "done"
                  ? "bg-[var(--accent)]"
                  : cell.training === "plan"
                    ? "bg-[color:color-mix(in_srgb,var(--accent)_14%,var(--surface))] shadow-[inset_0_0_0_1.5px_var(--accent)]"
                    : "bg-[var(--surface-2)]",
              )}
              aria-hidden="true"
            />
            <span
              className={cn(
                "block h-4 rounded-md",
                cell.nutrition === "ok"
                  ? "bg-[var(--accent-secondary)]"
                  : cell.nutrition === "part"
                    ? "bg-[color:color-mix(in_srgb,var(--accent-secondary)_35%,var(--surface-2))]"
                    : "bg-[var(--surface-2)]",
              )}
              aria-hidden="true"
            />
          </span>
          <span
            className={cn(
              "text-[11px] font-semibold",
              cell.isToday ? "text-[var(--accent)]" : "text-[var(--text-subtle)]",
            )}
          >
            {cell.weekdayLabel}
          </span>
        </div>
      ))}
    </div>
  );
}

function SectionLabel({ label, meta }: { label: string; meta?: string }) {
  return (
    <div className="mb-2 mt-6 flex items-baseline justify-between gap-3 px-1 first:mt-0">
      <span className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-subtle)]">{label}</span>
      {meta ? <span className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-subtle)]">{meta}</span> : null}
    </div>
  );
}

const inviteRoleLabels: Record<Exclude<Role, "admin">, string> = {
  athlete: "Urheilija",
  independent_athlete: "Itsenäinen treenaaja",
  coach: "Valmentaja",
};

function inviteAgeLabel(createdAt: string) {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) {
    return getInviteLifecycleLabel("pending");
  }

  const days = Math.max(0, Math.floor((Date.now() - created) / 86_400_000));
  if (days === 0) {
    return "lähetetty tänään";
  }
  if (days === 1) {
    return "lähetetty eilen";
  }
  return `lähetetty ${days} pv sitten`;
}

/**
 * Valmentajan/adminin Tiimi-näkymä prototyypin mukaisena: [Tiimi | Ohjelmat]
 * -segmentti. Tiimi = urheilijakortit (viikkorytmi + tila-pilleri, napautus →
 * read-only-esikatselu) + adminille Valmentajat. Ohjelmat = aktiiviset ohjelmat
 * + Uusi ohjelma.
 */
function CoachTeamView({
  athletes,
  programs,
  exercises,
  state,
  currentUser,
  onOpenInvites,
  onOpenIngredients,
}: {
  athletes: Array<{ id: string; fullName: string }>;
  programs: TrainingPlan[];
  exercises: Exercise[];
  state: AppState;
  currentUser: UserProfile;
  onOpenInvites?: () => void;
  onOpenIngredients?: () => void;
}) {
  const { startAthletePreview, notify, createProgram, updateProgram, setProgramStatus, deleteProgram, createInvite } =
    useAppState();
  const [segment, setSegment] = useState<"tiimi" | "ohjelmat">("tiimi");
  const [editorGroup, setEditorGroup] = useState<TrainingPlan[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [restoringKey, setRestoringKey] = useState<string | null>(null);
  const [manageUserId, setManageUserId] = useState<string | null>(null);
  const [isInviteSheetOpen, setIsInviteSheetOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Exclude<Role, "admin">>("athlete");
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string>("");
  const [manageMounted, setManageMounted] = useState(false);
  useEffect(() => setManageMounted(true), []);
  const isAdmin = isAdminRole(currentUser.role);
  const manageUser = manageUserId ? state.users.find((user) => user.id === manageUserId) ?? null : null;

  // Editorin urheilijavalinnat: itse + valmennettavat.
  const programTargets = useMemo(
    () => [{ id: currentUser.id, fullName: currentUser.fullName }, ...athletes.filter((a) => a.id !== currentUser.id)],
    [athletes, currentUser.fullName, currentUser.id],
  );

  const handleSaveProgram = async ({
    groupId,
    title,
    weekCount,
    workouts,
    assignedAthleteIds,
    groupPlans,
  }: {
    groupId: string;
    title: string;
    weekCount: number;
    workouts: ProgramWorkoutInput[];
    assignedAthleteIds: string[];
    groupPlans: TrainingPlan[];
  }): Promise<{ ok: boolean; message?: string }> => {
    const selected = new Set(assignedAthleteIds);
    const planByAthlete = new Map(groupPlans.map((plan) => [plan.athleteId, plan]));

    for (const athleteId of assignedAthleteIds) {
      const existing = planByAthlete.get(athleteId);
      const result = existing
        ? await updateProgram(existing.id, { title, workouts, programGroupId: groupId, weekCount })
        : await createProgram({ title, athleteId, workouts, programGroupId: groupId, weekCount });
      if (!result.ok) {
        return result;
      }
    }

    for (const plan of groupPlans) {
      if (!selected.has(plan.athleteId)) {
        const result = await setProgramStatus(plan.id, "removed");
        if (!result.ok) {
          return result;
        }
      }
    }

    notify({ tone: "success", message: `Ohjelma "${title}" tallennettiin.` });
    return { ok: true };
  };

  // Muokkausnäkymän ohjelman hallinta: arkistointi (palautettava) ja poisto (piilotus).
  // Ohjelmaryhmä voi kattaa monta urheilijariviä → toiminto ajetaan jokaiselle.
  const handleArchiveEditorProgram = async (): Promise<{ ok: boolean; message?: string }> => {
    const target = editorGroup;
    if (!target?.length) {
      return { ok: false, message: "Ohjelmaa ei löytynyt." };
    }
    for (const plan of target) {
      const result = await setProgramStatus(plan.id, "archived");
      if (!result.ok) {
        return result;
      }
    }
    notify({ tone: "success", message: `Ohjelma "${target[0].title}" arkistoitiin aiempiin ohjelmiin.` });
    return { ok: true };
  };

  const handleDeleteEditorProgram = async (): Promise<{ ok: boolean; message?: string }> => {
    const target = editorGroup;
    if (!target?.length) {
      return { ok: false, message: "Ohjelmaa ei löytynyt." };
    }
    for (const plan of target) {
      const result = await deleteProgram(plan.id);
      if (!result.ok) {
        return result;
      }
    }
    notify({ tone: "success", message: `Ohjelma "${target[0].title}" poistettiin näkyvistä.` });
    return { ok: true };
  };

  const statusById = useMemo(
    () => new Map(state.users.map((user) => [user.id, user.status])),
    [state.users],
  );
  const rosterAthletes = useMemo(
    () =>
      athletes.filter(
        (athlete) => athlete.id !== currentUser.id && statusById.get(athlete.id) === "active",
      ),
    [athletes, currentUser.id, statusById],
  );
  const rosterEntries = useMemo(
    () => rosterAthletes.map((athlete) => ({ athlete, summary: buildAthleteRosterSummary(state, athlete.id) })),
    [rosterAthletes, state],
  );

  const otherCoaches = useMemo(() => {
    if (!isAdmin) {
      return [];
    }
    return state.users
      .filter((user) => (user.role === "coach" || user.role === "admin") && user.id !== currentUser.id && user.status === "active")
      .map((coach) => {
        const coachPlans = state.plans.filter((plan) => plan.coachId === coach.id && getProgramStatus(plan) !== "removed");
        const athleteIds = new Set(coachPlans.map((plan) => plan.athleteId));
        const activePrograms = coachPlans.filter((plan) => isProgramActive(plan)).length;
        return { coach, athleteCount: athleteIds.size, activePrograms };
      });
  }, [currentUser.id, isAdmin, state.plans, state.users]);
  const pendingInvites = useMemo(
    () => (isAdmin ? getVisiblePendingInvites(state.invites, state.users) : []),
    [isAdmin, state.invites, state.users],
  );

  const userNameById = useMemo(() => new Map(state.users.map((user) => [user.id, user.fullName])), [state.users]);
  // Saman program_group_id:n rivit = yksi ohjelma monelle urheilijalle.
  const buildRows = useMemo(() => {
    return (plans: TrainingPlan[]) => {
      const groups = new Map<string, TrainingPlan[]>();
      plans.forEach((plan) => {
        const key = plan.programGroupId ?? plan.id;
        groups.set(key, [...(groups.get(key) ?? []), plan]);
      });

      return Array.from(groups.values()).map((groupPlans) => {
        const base = groupPlans[0];
        const assignedNames = groupPlans.map((plan) =>
          plan.athleteId === currentUser.id ? "Sinä" : (userNameById.get(plan.athleteId) ?? "?").split(/\s+/)[0],
        );
        return {
          key: base.programGroupId ?? base.id,
          groupPlans,
          title: base.title,
          weekLabel: programWeekLabel(base),
          workoutCount: base.workouts?.length ?? 0,
          assignedLabel: assignedNames.length ? assignedNames.join(", ") : "Ei urheilijoita",
        };
      });
    };
  }, [currentUser.id, userNameById]);

  const programRows = useMemo(
    () => buildRows(programs.filter((plan) => isProgramActive(plan))),
    [buildRows, programs],
  );

  // Arkistoidut ("Aiemmat ohjelmat") — palautettavissa takaisin aktiiviseksi.
  const archivedRows = useMemo(
    () => buildRows(programs.filter((plan) => getProgramStatus(plan) === "archived")),
    [buildRows, programs],
  );

  // Palauta arkistoitu ohjelma aktiiviseksi. setProgramStatus arkistoi
  // automaattisesti urheilijan aiemman aktiivisen ohjelman → ei tarvitse
  // poistaa mitään käsin ensin.
  const handleRestore = async (row: (typeof archivedRows)[number]) => {
    setRestoringKey(row.key);
    try {
      for (const plan of row.groupPlans) {
        const result = await setProgramStatus(plan.id, "active");
        if (!result.ok) {
          notify({ tone: "danger", message: result.message ?? "Ohjelman palautus epäonnistui." });
          return;
        }
      }
      notify({ tone: "success", message: `Ohjelma "${row.title}" otettiin takaisin käyttöön.` });
    } finally {
      setRestoringKey(null);
    }
  };

  const handlePreview = (athleteId: string) => {
    const result = startAthletePreview(athleteId);
    if (!result.ok) {
      notify({ tone: "danger", message: result.message });
    }
  };

  const handleSendInvite = async () => {
    const email = inviteEmail.trim();
    if (!email) {
      setInviteMessage("Anna kutsuttavan sähköpostiosoite.");
      return;
    }

    setIsSendingInvite(true);
    try {
      const result = await withMinimumDelay(
        createInvite({
          email,
          role: inviteRole,
          coachId: inviteRole === "coach" ? undefined : currentUser.id,
        }),
      );
      notify({
        tone: result.ok ? "success" : "danger",
        message: result.ok ? `Kutsu lähetettiin osoitteeseen ${email}.` : result.message,
      });
      setInviteMessage(result.ok ? "" : result.message);
      if (result.ok) {
        setInviteEmail("");
      }
    } finally {
      setIsSendingInvite(false);
    }
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <Segmented
        ariaLabel="Tiimi tai ohjelmat"
        value={segment}
        onChange={setSegment}
        options={[
          { value: "tiimi", label: "Tiimi" },
          { value: "ohjelmat", label: "Ohjelmat" },
        ]}
      />

      {segment === "tiimi" ? (
        <div>
          <SectionLabel label="Urheilijat" meta={`${rosterEntries.length} aktiivista`} />
          {rosterEntries.length ? (
            <div className="flex flex-col gap-3">
              {rosterEntries.map(({ athlete, summary }) => (
                <button
                  key={athlete.id}
                  type="button"
                  className={cn(
                    "w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left shadow-[0_1px_2px_var(--shadow-soft)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
                    TEAM_CARD_HOVER,
                  )}
                  aria-label={`${isAdmin ? "Hallitse" : "Esikatsele"}: ${athlete.fullName}`}
                  onClick={() => (isAdmin ? setManageUserId(athlete.id) : handlePreview(athlete.id))}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] font-[family-name:var(--font-display)] text-sm font-bold text-[var(--accent)]">
                        {rosterInitials(athlete.fullName)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-[family-name:var(--font-display)] text-[15.5px] font-bold text-[var(--text)]">
                          {athlete.fullName}
                        </p>
                        <p className="text-[12.5px] text-[var(--text-subtle)]">
                          {summary.weeklyTarget > 0
                            ? `Viikko ${summary.doneThisWeek}/${summary.weeklyTarget}`
                            : "Ei ohjelmaa"}
                          {summary.lastSeenLabel !== "—" ? ` · ${summary.lastSeenLabel}` : ""}
                        </p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-xs font-semibold",
                        ROSTER_PILL_TONE[summary.statusTone],
                      )}
                    >
                      {summary.statusLabel}
                    </span>
                  </div>
                  <RosterMiniWeek cells={summary.cells} />
                </button>
              ))}
            </div>
          ) : (
            <Card>
              <CardDescription>
                Lisää ensin treenaajia, niin näet heidän viikkorytminsä ja voit esikatsella heidän näkymäänsä.
              </CardDescription>
            </Card>
          )}

          {rosterEntries.length ? (
            <p className="mx-1 mt-3 text-[13px] text-pretty text-[var(--text-subtle)]">
              Napauta urheilijaa — esikatselet hänen omaa näkymäänsä vain luku -tilassa.
            </p>
          ) : null}

          {isAdmin ? (
            <>
              <SectionLabel label="Valmentajat" meta={`${otherCoaches.length} aktiivinen`} />
              {otherCoaches.length ? (
                <div className="flex flex-col gap-3">
                  {otherCoaches.map(({ coach, athleteCount, activePrograms }) => (
                    <button
                      key={coach.id}
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left shadow-[0_1px_2px_var(--shadow-soft)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
                        TEAM_CARD_HOVER,
                      )}
                      aria-label={`Hallitse: ${coach.fullName}`}
                      onClick={() => setManageUserId(coach.id)}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] font-[family-name:var(--font-display)] text-sm font-bold text-[var(--accent)]">
                          {rosterInitials(coach.fullName)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-[family-name:var(--font-display)] text-[15.5px] font-bold text-[var(--text)]">
                            {coach.fullName}
                          </p>
                          <p className="text-[12.5px] text-[var(--text-subtle)]">
                            {athleteCount} {athleteCount === 1 ? "urheilija" : "urheilijaa"} · {activePrograms}{" "}
                            {activePrograms === 1 ? "ohjelma" : "ohjelmaa"}
                          </p>
                        </div>
                      </div>
                      <Badge className="shrink-0">{coach.role === "admin" ? "Admin" : "Valmentaja"}</Badge>
                    </button>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardDescription>Aktiivisia valmentajia ei ole vielä.</CardDescription>
                </Card>
              )}
            </>
          ) : null}

          {isAdmin && (onOpenInvites || onOpenIngredients) ? (
            <>
              <SectionLabel label="Hallinta" />
              <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_1px_2px_var(--shadow-soft)]">
                {onOpenInvites ? (
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
                    onClick={() => setIsInviteSheetOpen(true)}
                  >
                    <UserPlus className="size-5 shrink-0 text-[var(--text)]" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="font-[family-name:var(--font-display)] text-[15.5px] font-bold text-[var(--text)]">Kutsut</p>
                      <p className="mt-1 truncate text-[12.5px] text-[var(--text-muted)]">Kutsu uusia urheilijoita ja valmentajia</p>
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-[var(--text)]" aria-hidden="true" />
                  </button>
                ) : null}
                {onOpenIngredients ? (
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 border-t border-[var(--border)] p-4 text-left transition hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
                    onClick={onOpenIngredients}
                  >
                    <Carrot className="size-5 shrink-0 text-[var(--text)]" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="font-[family-name:var(--font-display)] text-[15.5px] font-bold text-[var(--text)]">
                        Raaka-ainekatalogi
                      </p>
                      <p className="mt-1 truncate text-[12.5px] text-[var(--text-muted)]">Reseptien raaka-aineet ja ravintoarvot</p>
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-[var(--text)]" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </>
          ) : null}

          {isInviteSheetOpen ? (
            <Sheet
              onClose={() => setIsInviteSheetOpen(false)}
              ariaLabelledby="admin-invite-sheet-title"
              className="overflow-y-auto sm:max-w-3xl"
            >
                <h2 id="admin-invite-sheet-title" className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--text)]">
                  Kutsut
                </h2>
                <div className="mt-6 grid gap-3">
                  <Label htmlFor="admin-team-invite-email" className="sr-only">
                    Sähköposti
                  </Label>
                  <Input
                    id="admin-team-invite-email"
                    type="email"
                    autoComplete="email"
                    value={inviteEmail}
                    onChange={(event) => {
                      setInviteEmail(event.target.value);
                      setInviteMessage("");
                    }}
                    placeholder="sähköposti@osoite.fi"
                    className="h-12 rounded-xl border-0 bg-[var(--surface-2)] text-base"
                  />
                  <Label htmlFor="admin-team-invite-role" className="sr-only">
                    Rooli
                  </Label>
                  <select
                    id="admin-team-invite-role"
                    value={inviteRole}
                    onChange={(event) => setInviteRole(event.target.value as Exclude<Role, "admin">)}
                    className="h-12 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-base font-semibold text-[var(--text)]"
                  >
                    <option value="athlete">Urheilija</option>
                    <option value="independent_athlete">Itsenäinen treenaaja</option>
                    <option value="coach">Valmentaja</option>
                  </select>
                  <Button
                    type="button"
                    className="h-12 rounded-xl text-base"
                    loading={isSendingInvite}
                    loadingText="Lähetetään..."
                    onClick={handleSendInvite}
                  >
                    <Send className="mr-2 size-4" aria-hidden="true" />
                    Lähetä kutsu
                  </Button>
                  {inviteMessage ? (
                    <p className="text-sm font-semibold text-[var(--danger)]" aria-live="polite">
                      {inviteMessage}
                    </p>
                  ) : null}
                </div>

                <div className="mb-2 mt-6 flex items-baseline justify-between gap-3 px-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-subtle)]">Avoimet kutsut</span>
                  <span className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-subtle)]">
                    {pendingInvites.length}
                  </span>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-0 shadow-[0_1px_2px_var(--shadow-soft)]">
                  {pendingInvites.length ? (
                    pendingInvites.map((invite) => (
                      <div key={invite.id} className="flex items-center justify-between gap-3 px-4 py-4">
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-bold text-[var(--text)]">{invite.email}</p>
                          <p className="mt-1 truncate text-[12.5px] text-[var(--text-muted)]">
                            {inviteRoleLabels[invite.role]} · {inviteAgeLabel(invite.createdAt)}
                          </p>
                        </div>
                        <Badge className="shrink-0">Odottaa</Badge>
                      </div>
                    ))
                  ) : (
                    <p className="px-4 py-6 text-sm text-[var(--text-muted)]">Avoimia kutsuja ei ole.</p>
                  )}
                </div>
            </Sheet>
          ) : null}
        </div>
      ) : (
        <div>
          <SectionLabel label="Aktiiviset ohjelmat" />
          {programRows.length ? (
            <Card className="divide-y divide-[var(--border)] p-0">
              {programRows.map(({ key, groupPlans, title, weekLabel, workoutCount, assignedLabel }) => (
                <button
                  key={key}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
                  aria-label={`Muokkaa: ${title}`}
                  onClick={() => setEditorGroup(groupPlans)}
                >
                  <div className="min-w-0">
                    <p className="truncate font-[family-name:var(--font-display)] text-[15.5px] font-bold text-[var(--text)]">
                      {title}
                      {weekLabel ? <span className="text-[var(--text-subtle)]"> · {weekLabel}</span> : null}
                    </p>
                    <p className="truncate text-[12.5px] text-[var(--text-subtle)]">
                      {workoutCount} treeniä/vko · {assignedLabel}
                    </p>
                  </div>
                  <Badge className="shrink-0">Muokkaa</Badge>
                </button>
              ))}
            </Card>
          ) : (
            <Card>
              <CardDescription>Ei vielä aktiivisia ohjelmia. Luo ensimmäinen ohjelma alta.</CardDescription>
            </Card>
          )}
          <Button type="button" variant="secondary" className="mt-3 w-full gap-2" onClick={() => setEditorGroup([])}>
            <Plus className="size-4" aria-hidden="true" />
            Uusi ohjelma
          </Button>
          <p className="mx-1 mt-3 text-[13px] text-pretty text-[var(--text-subtle)]">
            Ohjelmia voi luoda ja muokata suoraan mobiilissa — muutokset näkyvät urheilijoille heti.
          </p>

          {archivedRows.length ? (
            <div className="mt-5">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-1 text-left focus-visible:outline-none"
                aria-expanded={showArchived}
                onClick={() => setShowArchived((value) => !value)}
              >
                <span className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-subtle)]">
                  Aiemmat ohjelmat · {archivedRows.length}
                </span>
                <ChevronDown
                  className={`size-4 shrink-0 text-[var(--text-subtle)] transition-transform ${showArchived ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>
              {showArchived ? (
                <Card className="mt-2 divide-y divide-[var(--border)] p-0">
                  {archivedRows.map((row) => (
                    <div key={row.key} className="flex items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="truncate font-[family-name:var(--font-display)] text-[15.5px] font-bold text-[var(--text)]">
                          {row.title}
                        </p>
                        <p className="truncate text-[12.5px] text-[var(--text-subtle)]">
                          {row.workoutCount} treeniä/vko · {row.assignedLabel}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        className="shrink-0 gap-2 px-3 py-2 text-sm"
                        loading={restoringKey === row.key}
                        loadingText="Palautetaan…"
                        disabled={restoringKey !== null && restoringKey !== row.key}
                        onClick={() => handleRestore(row)}
                      >
                        <RotateCcw className="size-4" aria-hidden="true" />
                        Palauta
                      </Button>
                    </div>
                  ))}
                </Card>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {editorGroup ? (
        <ProgramEditorOverlay
          groupPlans={editorGroup}
          athletes={programTargets}
          exercises={exercises}
          currentUserId={currentUser.id}
          onClose={() => setEditorGroup(null)}
          onSave={handleSaveProgram}
          onArchive={handleArchiveEditorProgram}
          onDelete={handleDeleteEditorProgram}
        />
      ) : null}

      {manageMounted && manageUser ? (
            <FullScreenOverlay onClose={() => setManageUserId(null)} ariaLabel="Käyttäjän hallinta">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--surface)] text-[var(--text)] shadow-[0_1px_2px_var(--shadow-soft)] transition hover:bg-[var(--surface-2)]"
                  aria-label="Takaisin"
                  onClick={() => setManageUserId(null)}
                >
                  <ChevronLeft className="size-5" aria-hidden="true" />
                </button>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.05em] text-[var(--text-subtle)]">Käyttäjän hallinta</p>
                  <h2 className="truncate font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--text)]">
                    {manageUser.fullName}
                  </h2>
                </div>
              </div>

              {(manageUser.role === "athlete" || manageUser.role === "independent_athlete") && manageUser.status === "active" ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-4 w-full gap-2"
                  onClick={() => {
                    const target = manageUser.id;
                    setManageUserId(null);
                    handlePreview(target);
                  }}
                >
                  <Eye className="size-4" aria-hidden="true" />
                  Esikatsele urheilijan näkymä
                </Button>
              ) : null}

              <div className="mt-4">
                <AdminUserManagementPanel focusUserId={manageUser.id} />
              </div>
            </FullScreenOverlay>
          ) : null}
    </div>
  );
}

function CoachConversationView({
  athletes,
  currentRole,
  currentUserId,
  entries,
  markConversationRead,
  onSend,
  selectedAthleteId,
  onSelectAthlete,
  users,
}: {
  athletes: Array<{ id: string; fullName: string; email: string }>;
  currentRole: Role;
  currentUserId: string;
  entries: AppState["conversationEntries"];
  markConversationRead: (options?: { athleteId?: string }) => void;
  onSend: (
    body: string,
    options?: { scheduledWorkoutId?: string; trainingPlanId?: string; athleteId?: string; contextLabel?: string },
  ) => Promise<{ ok: true; scheduledWorkoutId?: string } | { ok: false; message: string }>;
  selectedAthleteId: string;
  onSelectAthlete: (athleteId: string) => void;
  users: AppState["users"];
}) {
  const athleteSelectOptions = useMemo(() => {
    const summaries = new Map<
      string,
      {
        unreadCount: number;
      }
    >();

    entries.forEach((entry) => {
      const existing = summaries.get(entry.athleteId);
      const unread =
        isConversationEntryNotifiable(entry) &&
        !entry.readByUserIds.includes(currentUserId) &&
        currentRole !== entry.authorRole;

      if (!existing) {
        summaries.set(entry.athleteId, {
          unreadCount: unread ? 1 : 0,
        });
        return;
      }

      if (unread) {
        existing.unreadCount += 1;
      }

    });

    return athletes.map((athlete) => {
      const summary = summaries.get(athlete.id);
      return {
        ...athlete,
        unreadCount: summary?.unreadCount ?? 0,
      };
    }).sort((left, right) => {
      if (left.unreadCount !== right.unreadCount) {
        return right.unreadCount - left.unreadCount;
      }

      return left.fullName.localeCompare(right.fullName, "fi");
    });
  }, [athletes, currentRole, currentUserId, entries]);
  const totalUnreadCount = useMemo(
    () => athleteSelectOptions.reduce((sum, athlete) => sum + athlete.unreadCount, 0),
    [athleteSelectOptions],
  );

  const filteredEntries = useMemo(
    () =>
      entries
        .filter(
          (entry) => !selectedAthleteId || entry.athleteId === selectedAthleteId,
        )
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [entries, selectedAthleteId],
  );
  useEffect(() => {
    if (!selectedAthleteId) {
      return;
    }

    markConversationRead({ athleteId: selectedAthleteId });
  }, [markConversationRead, selectedAthleteId]);

  if (!athletes.length) {
    return (
      <Card>
        <CardTitle className="text-2xl">Keskustelu</CardTitle>
        <CardDescription className="mt-2">
          Lisää ensin treenaaja rosteriin, niin yhteinen keskustelu alkaa kertyä tähän.
        </CardDescription>
      </Card>
    );
  }

  return (
    <ConversationPanel
      className="w-full max-w-none"
      heading=""
      description=""
      entries={filteredEntries}
      users={users}
      currentRole={currentRole}
      currentUserId={currentUserId}
      emptyMessage="Ei viestejä vielä."
      onSend={(body) =>
        onSend(body, {
          athleteId: selectedAthleteId,
        })
      }
      headerSlot={
        <div className="w-full lg:w-72">
          <div className="mb-2 flex items-center justify-between gap-3">
            <Label className="mb-0" htmlFor="coach-conversation-athlete-select">Viestit treenaajittain</Label>
            {totalUnreadCount > 0 ? (
              <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-[var(--accent)] px-2 py-1 text-xs font-semibold text-[var(--accent-contrast)]">
                {totalUnreadCount}
              </span>
            ) : null}
          </div>
          <SearchableAthleteConversationSelect
            id="coach-conversation-athlete-select"
            selectedAthleteId={selectedAthleteId}
            athleteOptions={athleteSelectOptions}
            onSelect={onSelectAthlete}
          />
        </div>
      }
    />
  );
}
