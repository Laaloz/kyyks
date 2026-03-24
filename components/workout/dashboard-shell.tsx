"use client";

import { Bell, BellRing, Dumbbell, Home, LogOut, MoreHorizontal, NotebookPen, Settings, Sparkles, Users, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { AdminDashboard } from "@/components/workout/admin-dashboard";
import { MeasurementReminderDialog } from "@/components/workout/athlete/measurement-reminder-dialog";
import { AthleteDashboard } from "@/components/workout/athlete-dashboard";
import { CoachDashboard } from "@/components/workout/coach-dashboard";
import { UserSettingsPanel } from "@/components/workout/user-settings-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isConversationEntryNotifiable } from "@/lib/conversation";
import { getMeasurementReminderState } from "@/lib/measurement-reminder";
import { canActAsCoach, getDashboardViewsForRole, getDefaultDashboardView, isAdminRole } from "@/lib/role-access";
import { useAppState } from "@/providers/app-state-provider";

import { roleLabel, type WorkspaceView } from "@/components/workout/shared";

type PrimaryWorkspaceView = Exclude<WorkspaceView, "settings">;
type AthleteOverviewFocusTarget = "measurements";
const MEASUREMENT_REMINDER_STORAGE_VERSION = "v2";
const WORKSPACE_VIEW_STORAGE_VERSION = "v1";

function navItemsForRole(role: "admin" | "coach" | "athlete"): PrimaryWorkspaceView[] {
  return getDashboardViewsForRole(role);
}

function resolveInitialView(role: "admin" | "coach" | "athlete", preferredView: WorkspaceView | undefined) {
  const roleNavItems = navItemsForRole(role);
  if (preferredView && preferredView !== "settings" && roleNavItems.includes(preferredView)) {
    return preferredView;
  }

  return getDefaultDashboardView(role);
}

function getWorkspaceViewStorageKey(userId: string) {
  return `workspace-view:${WORKSPACE_VIEW_STORAGE_VERSION}:${userId}`;
}

function resolvePersistedWorkspaceView(
  userId: string,
  role: "admin" | "coach" | "athlete",
  preferredView: WorkspaceView | undefined,
) {
  const fallbackView = resolveInitialView(role, preferredView);
  if (typeof window === "undefined") {
    return fallbackView;
  }

  try {
    const persistedView = window.sessionStorage.getItem(getWorkspaceViewStorageKey(userId)) as WorkspaceView | null;
    if (persistedView === "settings") {
      return persistedView;
    }

    const roleNavItems = navItemsForRole(role);
    if (persistedView && roleNavItems.includes(persistedView as PrimaryWorkspaceView)) {
      return persistedView;
    }
  } catch {
    // Ignore storage failures and fall back to the user's default view.
  }

  return fallbackView;
}

export function DashboardShell() {
  const {
    authenticatedUser,
    currentUser,
    isImpersonating,
    logout,
    state,
    stopAdminImpersonation,
    markConversationRead,
  } = useAppState();
  const [view, setView] = useState<WorkspaceView>(() =>
    currentUser
      ? resolveInitialView(currentUser.role, currentUser.settings?.defaultDashboardView)
      : "overview",
  );
  const [isMeasurementReminderOpen, setIsMeasurementReminderOpen] = useState(false);
  const [isReminderPreviewMode, setIsReminderPreviewMode] = useState(false);
  const [isMobileActionsOpen, setIsMobileActionsOpen] = useState(false);
  const [athleteOverviewFocusTarget, setAthleteOverviewFocusTarget] = useState<AthleteOverviewFocusTarget | null>(null);
  const didAutoOpenAthleteLog = useRef(false);
  const previousUserIdRef = useRef<string | null>(null);
  const navButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const mobileActionsRef = useRef<HTMLDivElement | null>(null);

  if (!currentUser) {
    return null;
  }

  const navItems = navItemsForRole(currentUser.role);
  const navLabelByView: Record<WorkspaceView, string> = {
    overview: "Yleiskuva",
    templates: "Ohjelmat",
    invites: "Kutsut",
    "athlete-log": "Treenit",
    conversation: "Keskustelu",
    settings: "Asetukset",
  };
  const navMobileLabelByView: Record<WorkspaceView, string> = {
    overview: "Yleiskuva",
    templates: "Ohjelmat",
    invites: "Kutsut",
    "athlete-log": "Treenit",
    conversation: "Viestit",
    settings: "Asetukset",
  };
  const navIconByView: Record<PrimaryWorkspaceView, LucideIcon> = {
    overview: Home,
    templates: Sparkles,
    invites: Users,
    "athlete-log": NotebookPen,
    conversation: Bell,
  };
  const mobileNavGridClass = navItems.length > 3 ? "grid-cols-2" : "grid-cols-3";
  const activePrimaryView = view === "settings" ? resolveInitialView(currentUser.role, currentUser.settings?.defaultDashboardView) : view;
  const activeTabId = `workspace-tab-${activePrimaryView}`;
  const activePanelId = `workspace-panel-${activePrimaryView}`;
  const measurementReminder = getMeasurementReminderState(state, currentUser);
  const shouldShowMeasurementReminder = currentUser.role === "athlete" && (measurementReminder.isDue || isReminderPreviewMode);
  const weightReminderDue = measurementReminder.weightDue || isReminderPreviewMode;
  const waistReminderDue = measurementReminder.waistDue || isReminderPreviewMode;
  const unreadConversationCount = state.conversationEntries.filter((entry) => {
    if (currentUser.role === "athlete" && entry.athleteId !== currentUser.id) {
      return false;
    }
    if (
      !isAdminRole(currentUser.role) &&
      canActAsCoach(currentUser.role) &&
      !state.assignments.some(
        (assignment) =>
          assignment.coachId === currentUser.id &&
          assignment.athleteId === entry.athleteId &&
          assignment.active,
      )
    ) {
      return false;
    }
    if (!canActAsCoach(currentUser.role) && currentUser.role !== "athlete") {
      return false;
    }
    return isConversationEntryNotifiable(entry) && !entry.readByUserIds.includes(currentUser.id);
  }).length;

  const handleLogout = async () => {
    try {
      window.sessionStorage.removeItem(getWorkspaceViewStorageKey(currentUser.id));
    } catch {
      // Ignore storage failures and continue logging out.
    }

    await logout();
  };

  useEffect(() => {
    const nextView = resolvePersistedWorkspaceView(
      currentUser.id,
      currentUser.role,
      currentUser.settings?.defaultDashboardView,
    );

    setView((current) => {
      if (previousUserIdRef.current !== currentUser.id) {
        return nextView;
      }

      if (current === "settings") {
        return current;
      }

      const roleNavItems = navItemsForRole(currentUser.role);
      if (roleNavItems.includes(current as PrimaryWorkspaceView)) {
        return current;
      }

      return nextView;
    });

    previousUserIdRef.current = currentUser.id;
  }, [currentUser.id, currentUser.role, currentUser.settings?.defaultDashboardView]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(getWorkspaceViewStorageKey(currentUser.id), view);
    } catch {
      // Ignore storage failures and keep the in-memory view state.
    }
  }, [currentUser.id, view]);

  useEffect(() => {
    if (didAutoOpenAthleteLog.current || !navItemsForRole(currentUser.role).includes("athlete-log")) {
      return;
    }

    const hasInProgressWorkout = state.scheduledWorkouts.some(
      (workout) => workout.athleteId === currentUser.id && workout.status === "in_progress",
    );

    if (!hasInProgressWorkout) {
      return;
    }

    setView("athlete-log");
    didAutoOpenAthleteLog.current = true;
  }, [currentUser, state.scheduledWorkouts]);

  useEffect(() => {
    if (view === "settings") {
      return;
    }

    const roleNavItems = navItemsForRole(currentUser.role);
    if (!roleNavItems.includes(view as PrimaryWorkspaceView)) {
      setView(resolveInitialView(currentUser.role, currentUser.settings?.defaultDashboardView));
    }
  }, [currentUser, view]);

  useEffect(() => {
    if (view === "conversation") {
      markConversationRead();
    }
  }, [markConversationRead, view]);

  useEffect(() => {
    if (!isMobileActionsOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (mobileActionsRef.current?.contains(target)) {
        return;
      }

      setIsMobileActionsOpen(false);
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [isMobileActionsOpen]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const hostname = window.location.hostname;
    setIsReminderPreviewMode(
      hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1" ||
        hostname.endsWith(".local"),
    );
  }, []);

  useEffect(() => {
    if (isReminderPreviewMode) {
      const storageKey = `measurement-reminder-preview-opened:${currentUser.id}`;
      try {
        if (window.sessionStorage.getItem(storageKey) === "shown") {
          return;
        }
        window.sessionStorage.setItem(storageKey, "shown");
      } catch {
        // Ignore storage failures and still open the preview.
      }

      setIsMeasurementReminderOpen(true);
      return;
    }

    if (!measurementReminder.isDue || !measurementReminder.cycleKey || currentUser.role !== "athlete") {
      setIsMeasurementReminderOpen(false);
      return;
    }

    const storageKey = `measurement-reminder-shown:${MEASUREMENT_REMINDER_STORAGE_VERSION}:${currentUser.id}:${measurementReminder.cycleKey}`;
    try {
      if (window.localStorage.getItem(storageKey) === "shown") {
        return;
      }
      window.localStorage.setItem(storageKey, "shown");
    } catch {
      // Ignore storage failures and still open the reminder.
    }

    setIsMeasurementReminderOpen(true);
  }, [currentUser.id, currentUser.role, isReminderPreviewMode, measurementReminder.cycleKey, measurementReminder.isDue]);

  const handleNavKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") {
      return;
    }

    event.preventDefault();

    const itemCount = navItems.length;
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? itemCount - 1
          : event.key === "ArrowRight"
            ? (index + 1) % itemCount
            : (index - 1 + itemCount) % itemCount;
    const nextItem = navItems[nextIndex];
    const nextButton = navButtonRefs.current[nextItem];

    if (nextButton) {
      nextButton.focus();
      setView(nextItem);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8">
      {shouldShowMeasurementReminder && isMeasurementReminderOpen ? (
        <MeasurementReminderDialog
          weightDue={weightReminderDue}
          waistDue={waistReminderDue}
          onClose={() => setIsMeasurementReminderOpen(false)}
          onOpenOverview={() => {
            setIsMeasurementReminderOpen(false);
            setAthleteOverviewFocusTarget("measurements");
            setView("overview");
          }}
        />
      ) : null}

      <header
        className="z-20 rounded-3xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-4 shadow-[0_1px_0_0_var(--shadow-soft),0_14px_30px_-20px_var(--shadow)] sm:px-5"
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--accent-strong)] bg-[var(--accent)] shadow-[0_1px_0_0_var(--accent-strong),0_14px_24px_-18px_var(--accent)] sm:size-12">
                <Dumbbell className="size-5 text-white" />
              </div>
              <div className="min-w-0 space-y-1">
                <p className="hidden text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[var(--text-subtle)] sm:block">
                  Treenihallinta
                </p>
                <h2 className="pr-2 font-[family-name:var(--font-display)] text-[1.2rem] font-semibold leading-[1.08] text-[var(--text)] sm:truncate sm:text-2xl">
                  {currentUser.fullName}
                </h2>
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <Badge className="border-[var(--border-strong)] bg-[var(--surface-3)] text-[var(--text-subtle)]">
                    {roleLabel(currentUser.role)}
                  </Badge>
                  {isImpersonating ? (
                    <Badge className="border-[var(--accent)] bg-[var(--surface-3)] text-[var(--accent)]">
                      Admin-vaihto aktiivinen
                    </Badge>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="hidden shrink-0 items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-2 py-2 sm:flex">
              {shouldShowMeasurementReminder ? (
                <Button
                  onClick={() => setIsMeasurementReminderOpen(true)}
                  type="button"
                  variant="secondary"
                  className="size-10 !rounded-xl !px-0 !py-0 !border-[var(--accent)] !bg-[var(--surface)] !text-[var(--accent)] shadow-[0_0_0_1px_var(--accent)]"
                  aria-label="Avaa kehon seurannan muistutus"
                  title="Päivitä kehon seuranta"
                >
                  <BellRing className="size-5 text-[var(--accent)]" aria-hidden="true" />
                  <span className="sr-only">Avaa kehon seurannan muistutus</span>
                </Button>
              ) : null}
              <Button
                onClick={() => setView("settings")}
                type="button"
                variant="secondary"
                className={`relative size-10 !rounded-xl !px-0 !py-0 ${
                  view === "settings"
                    ? "!border-[var(--accent)] !bg-[var(--surface)] !text-[var(--accent)] shadow-[0_0_0_1px_var(--accent)]"
                    : ""
                }`}
                aria-label="Asetukset"
                title="Asetukset"
                aria-pressed={view === "settings"}
              >
                <Settings
                  className={`size-5 ${view === "settings" ? "text-[var(--accent)]" : ""}`}
                  aria-hidden="true"
                />
                <span className="sr-only">Asetukset</span>
              </Button>
              <Button
                onClick={() => {
                  void handleLogout();
                }}
                type="button"
                variant="secondary"
                className="size-10 !rounded-xl !px-0 !py-0 !bg-[var(--surface)]"
                aria-label="Kirjaudu ulos"
                title="Kirjaudu ulos"
              >
                <LogOut className="size-5" aria-hidden="true" />
                <span className="sr-only">Kirjaudu ulos</span>
              </Button>
            </div>

            <div className="relative flex shrink-0 items-center gap-2 sm:hidden" ref={mobileActionsRef}>
              {shouldShowMeasurementReminder ? (
                <Button
                  onClick={() => {
                    setIsMobileActionsOpen(false);
                    setIsMeasurementReminderOpen(true);
                  }}
                  type="button"
                  variant="secondary"
                  className="size-10 !rounded-xl !px-0 !py-0 !border-[var(--accent)] !bg-[var(--surface)] !text-[var(--accent)] shadow-[0_0_0_1px_var(--accent)]"
                  aria-label="Avaa kehon seurannan muistutus"
                  title="Päivitä kehon seuranta"
                >
                  <BellRing className="size-5 text-[var(--accent)]" aria-hidden="true" />
                  <span className="sr-only">Avaa kehon seurannan muistutus</span>
                </Button>
              ) : null}
              <Button
                onClick={() => setIsMobileActionsOpen((value) => !value)}
                type="button"
                variant="secondary"
                className="size-10 !rounded-xl !px-0 !py-0 !bg-[var(--surface)]"
                aria-label="Avaa lisätoiminnot"
                aria-haspopup="menu"
                aria-expanded={isMobileActionsOpen}
              >
                <MoreHorizontal className="size-5" aria-hidden="true" />
                <span className="sr-only">Avaa lisätoiminnot</span>
              </Button>
              {isMobileActionsOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 top-[calc(100%+0.5rem)] z-30 min-w-44 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] p-1.5 shadow-[0_16px_30px_-18px_var(--shadow)]"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-2)]"
                    onClick={() => {
                      setIsMobileActionsOpen(false);
                      setView("settings");
                    }}
                  >
                    <Settings className="size-4" aria-hidden="true" />
                    Asetukset
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-2)]"
                    onClick={() => {
                      setIsMobileActionsOpen(false);
                      void handleLogout();
                    }}
                  >
                    <LogOut className="size-4" aria-hidden="true" />
                    Kirjaudu ulos
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {isImpersonating && authenticatedUser ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2 text-sm">
              <p className="text-[var(--text-muted)]">
                Toimit käyttäjänä <span className="font-semibold text-[var(--text)]">{currentUser.fullName}</span>.
                Alkuperäinen admin: <span className="font-semibold text-[var(--text)]">{authenticatedUser.fullName}</span>.
              </p>
              <Button
                type="button"
                variant="secondary"
                className="h-8 px-3 py-1.5 text-xs"
                onClick={() => {
                  const result = stopAdminImpersonation();
                  if (result.ok) {
                    setView("overview");
                  }
                }}
              >
                Palaa admin-tilaan
              </Button>
            </div>
          ) : null}

          <nav aria-label="Työtilan navigaatio" className="w-full max-w-3xl min-w-0">
            <div
              role="tablist"
              aria-label="Työtilan näkymät"
              className={`grid w-full min-w-0 ${mobileNavGridClass} gap-1.5 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-1.5 sm:grid-cols-3 sm:gap-1 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0`}
            >
            {navItems.map((item, index) => {
              const Icon = navIconByView[item];
              const isActive = view === item;
              return (
                <Button
                  key={item}
                  ref={(node) => {
                    navButtonRefs.current[item] = node;
                  }}
                  type="button"
                  variant={isActive ? "primary" : "ghost"}
                  role="tab"
                  id={`workspace-tab-${item}`}
                  aria-selected={isActive}
                  aria-controls={`workspace-panel-${item}`}
                  tabIndex={isActive ? 0 : -1}
                  aria-label={navLabelByView[item]}
                  className={
                    isActive
                      ? "min-h-10 w-full min-w-0 rounded-xl px-2 py-2 text-center text-[0.82rem] leading-tight whitespace-nowrap hover:translate-y-0 hover:brightness-100 sm:min-h-10 sm:flex-row sm:gap-1.5 sm:px-3 sm:text-sm"
                      : "min-h-10 w-full min-w-0 rounded-xl px-2 py-2 text-center text-[0.82rem] leading-tight whitespace-nowrap sm:min-h-10 sm:flex-row sm:gap-1.5 sm:px-3 sm:text-sm"
                  }
                  onKeyDown={(event) => handleNavKeyDown(event, index)}
                  onClick={() => setView(item)}
                >
                  <Icon className="hidden size-4 sm:block" aria-hidden="true" />
                  <span className="sm:hidden">{navMobileLabelByView[item]}</span>
                  <span className="hidden sm:inline">{navLabelByView[item]}</span>
                  {item === "conversation" && unreadConversationCount > 0 ? (
                    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--surface)] px-1.5 text-[10px] font-semibold text-[var(--accent)]">
                      {unreadConversationCount}
                    </span>
                  ) : null}
                </Button>
              );
            })}
            </div>
          </nav>
        </div>
      </header>

      <main id="main-content">
        {view === "settings" ? (
          <UserSettingsPanel />
        ) : (
          <div role="tabpanel" id={activePanelId} aria-labelledby={activeTabId} tabIndex={0}>
            {view === "athlete-log" ? (
              <AthleteDashboard
                view={view}
                onOpenWorkoutLog={() => setView("athlete-log")}
                overviewFocusTarget={athleteOverviewFocusTarget}
                onOverviewFocusHandled={() => setAthleteOverviewFocusTarget(null)}
              />
            ) : view === "templates" || currentUser.role === "coach" || (view === "conversation" && canActAsCoach(currentUser.role)) ? (
              <CoachDashboard view={view} onOpenConversation={() => setView("conversation")} />
            ) : currentUser.role === "admin" ? (
              <AdminDashboard view={view} />
            ) : (
              <AthleteDashboard
                view={view}
                onOpenWorkoutLog={() => setView("athlete-log")}
                overviewFocusTarget={athleteOverviewFocusTarget}
                onOverviewFocusHandled={() => setAthleteOverviewFocusTarget(null)}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
