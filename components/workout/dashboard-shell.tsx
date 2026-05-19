"use client";

import { BellRing, Dumbbell, Home, LogOut, MessageSquare, MoreHorizontal, ScrollText, UserPlus, UserRound, UserRoundCog, Users, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { AdminDashboard } from "@/components/workout/admin-dashboard";
import { MeasurementReminderDialog } from "@/components/workout/athlete/measurement-reminder-dialog";
import { AthleteDashboard } from "@/components/workout/athlete-dashboard";
import { CoachDashboard } from "@/components/workout/coach-dashboard";
import { NutritionAdminPanel } from "@/components/workout/nutrition-admin-panel";
import { UserSettingsPanel } from "@/components/workout/user-settings-panel";
import { Button } from "@/components/ui/button";
import { isConversationEntryNotifiable } from "@/lib/conversation";
import { getCoachConversationAthletes } from "@/lib/domain";
import { getMeasurementReminderState } from "@/lib/measurement-reminder";
import { canActAsCoach, getDashboardViewsForRole, getDefaultDashboardView, isAdminRole, isAthleteRole } from "@/lib/role-access";
import type { Role } from "@/lib/types";
import { useAppState } from "@/providers/app-state-provider";

import { PROGRAMS_WORKSPACE_VIEW, type WorkspaceView } from "@/components/workout/shared";

type PrimaryWorkspaceView = Exclude<WorkspaceView, "settings">;
type AthleteOverviewFocusTarget = "measurements";
const MEASUREMENT_REMINDER_STORAGE_VERSION = "v2";
const WORKSPACE_VIEW_STORAGE_VERSION = "v1";
const MEASUREMENTS_SECTION_ID = "overview-measurements";
const MOBILE_PRIMARY_NAV_MAX_ITEMS = 4;

function ensureWorkoutNavItemVisible(items: PrimaryWorkspaceView[]): PrimaryWorkspaceView[] {
  if (!items.includes("athlete-log")) {
    return items.slice(0, MOBILE_PRIMARY_NAV_MAX_ITEMS);
  }

  const limitedItems = items.slice(0, MOBILE_PRIMARY_NAV_MAX_ITEMS);
  const withoutWorkout: PrimaryWorkspaceView[] = limitedItems.filter((item) => item !== "athlete-log");
  const fallbackWithWorkout: PrimaryWorkspaceView[] = withoutWorkout
    .slice(0, Math.max(MOBILE_PRIMARY_NAV_MAX_ITEMS - 1, 0))
    .concat("athlete-log");

  if (!fallbackWithWorkout.includes("athlete-log")) {
    return limitedItems;
  }

  const workoutMiddleIndex = Math.floor(MOBILE_PRIMARY_NAV_MAX_ITEMS / 2);
  const clampedWorkoutIndex = Math.min(workoutMiddleIndex, Math.max(fallbackWithWorkout.length - 1, 0));
  const reorderedItems: PrimaryWorkspaceView[] = fallbackWithWorkout.filter((item) => item !== "athlete-log");
  reorderedItems.splice(clampedWorkoutIndex, 0, "athlete-log");
  return reorderedItems.slice(0, MOBILE_PRIMARY_NAV_MAX_ITEMS);
}

function mobilePrimaryNavItemsForRole(role: Role): PrimaryWorkspaceView[] {
  if (role === "athlete") {
    return ["overview", "nutrition", "athlete-log", "conversation"];
  }

  if (role === "independent_athlete") {
    return ["overview", "nutrition", "athlete-log", PROGRAMS_WORKSPACE_VIEW];
  }

  if (role === "admin") {
    return ["overview", "nutrition", "athlete-log", "users"];
  }

  return ["overview", "nutrition", "athlete-log", PROGRAMS_WORKSPACE_VIEW, "athletes"];
}

function navItemsForRole(role: Role): PrimaryWorkspaceView[] {
  return getDashboardViewsForRole(role);
}

function resolveInitialView(role: Role, preferredView: WorkspaceView | undefined) {
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
  role: Role,
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
  const [isMobileNavSheetOpen, setIsMobileNavSheetOpen] = useState(false);
  const [isMobileWorkoutDetailOpen, setIsMobileWorkoutDetailOpen] = useState(false);
  const [athleteOverviewFocusTarget, setAthleteOverviewFocusTarget] = useState<AthleteOverviewFocusTarget | null>(null);
  const previousUserIdRef = useRef<string | null>(null);
  const navButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const skipNextAutoTopScrollRef = useRef(false);
  const [profileImageFailed, setProfileImageFailed] = useState(false);

  if (!currentUser) {
    return null;
  }

  const navItems = navItemsForRole(currentUser.role);
  const navLabelByView: Record<WorkspaceView, string> = {
    overview: "Koti",
    nutrition: "Ravinto",
    athletes: "Tiimi",
    users: "Hallinta",
    [PROGRAMS_WORKSPACE_VIEW]: "Ohjelma",
    invites: "Kutsut",
    "athlete-log": "Treeni",
    conversation: "Chat",
    settings: "Tili",
  };
  const mobileNavLabelByView = navLabelByView;
  const navIconByView: Record<PrimaryWorkspaceView, LucideIcon> = {
    overview: Home,
    nutrition: UtensilsCrossed,
    athletes: Users,
    users: UserRoundCog,
    [PROGRAMS_WORKSPACE_VIEW]: ScrollText,
    invites: UserPlus,
    "athlete-log": Dumbbell,
    conversation: MessageSquare,
  };
  const preferredMobilePrimaryNavItems = mobilePrimaryNavItemsForRole(currentUser.role).filter((item) => navItems.includes(item));
  const mobilePrimaryNavItems = ensureWorkoutNavItemVisible(preferredMobilePrimaryNavItems);
  const mobileOverflowNavItems = navItems.filter((item) => !mobilePrimaryNavItems.includes(item));
  const mobileNavSlotCount = mobilePrimaryNavItems.length + 1;
  const activePrimaryView =
    view === "settings" ? resolveInitialView(currentUser.role, currentUser.settings?.defaultDashboardView) : view;
  const activeTabId = `workspace-tab-${activePrimaryView}`;
  const activePanelId = `workspace-panel-${activePrimaryView}`;
  const shouldHideMobileBottomNav = isMobileWorkoutDetailOpen;
  const measurementReminder = getMeasurementReminderState(state, currentUser);
  const weeklyMeasurementRemindersEnabled = currentUser.settings?.weeklyMeasurementReminders ?? true;
  const shouldShowMeasurementReminder =
    weeklyMeasurementRemindersEnabled &&
    (measurementReminder.isDue || isReminderPreviewMode);
  const weightReminderDue = measurementReminder.weightDue || isReminderPreviewMode;
  const waistReminderDue = measurementReminder.waistDue || isReminderPreviewMode;
  const now = new Date();
  const weekdayLabel = new Intl.DateTimeFormat("fi-FI", { weekday: "long" }).format(now);
  const capitalizedWeekday = weekdayLabel.charAt(0).toUpperCase() + weekdayLabel.slice(1);
  const dayMonthLabel = new Intl.DateTimeFormat("fi-FI", {
    day: "numeric",
    month: "numeric",
  }).format(now);
  const todayLabel = `${capitalizedWeekday} ${dayMonthLabel}`;
  const profileImageSrc = currentUser.profileImageUrl
    ? `${currentUser.profileImageUrl}${currentUser.profileImageUrl.includes("?") ? "&" : "?"}v=${encodeURIComponent(currentUser.updatedAt)}`
    : null;
  const adminConversationAthleteIds =
    currentUser.role === "admin"
      ? new Set(getCoachConversationAthletes(state, currentUser.id).map((athlete) => athlete.id))
      : null;
  const unreadConversationCount = state.conversationEntries.filter((entry) => {
    if (isAthleteRole(currentUser.role)) {
      if (entry.athleteId !== currentUser.id) {
        return false;
      }
    } else if (currentUser.role === "admin") {
      if (!adminConversationAthleteIds?.has(entry.athleteId)) {
        return false;
      }
    } else if (canActAsCoach(currentUser.role)) {
      if (
        !state.assignments.some(
          (assignment) =>
            assignment.coachId === currentUser.id &&
            assignment.athleteId === entry.athleteId &&
            assignment.active,
        )
      ) {
        return false;
      }
    } else {
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

  const openMeasurementsOverview = () => {
    const scrollToMeasurements = (attemptsLeft = 10) => {
      if (typeof window === "undefined") {
        return;
      }

      const node = window.document.getElementById(MEASUREMENTS_SECTION_ID);
      if (node) {
        node.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      if (attemptsLeft <= 0) {
        return;
      }

      window.setTimeout(() => scrollToMeasurements(attemptsLeft - 1), 50);
    };

    if (typeof window !== "undefined") {
      window.location.hash = MEASUREMENTS_SECTION_ID;
    }

    skipNextAutoTopScrollRef.current = true;
    setIsMeasurementReminderOpen(false);
    setAthleteOverviewFocusTarget("measurements");
    setView("overview");
    scrollToMeasurements();
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
    setProfileImageFailed(false);
  }, [currentUser.profileImageUrl]);

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
    if (view === "conversation" && isAthleteRole(currentUser.role)) {
      markConversationRead();
    }
  }, [currentUser.role, markConversationRead, view]);

  useEffect(() => {
    setIsMobileNavSheetOpen(false);
  }, [view]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (skipNextAutoTopScrollRef.current) {
      skipNextAutoTopScrollRef.current = false;
      return;
    }

    if (view === "overview" && athleteOverviewFocusTarget === "measurements") {
      return;
    }

    window.scrollTo({ top: 0, behavior: "auto" });
  }, [athleteOverviewFocusTarget, view]);

  useEffect(() => {
    if (view !== "athlete-log") {
      setIsMobileWorkoutDetailOpen(false);
    }
  }, [view]);

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

    if (!measurementReminder.isDue || !measurementReminder.cycleKey) {
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
  }, [currentUser.id, isReminderPreviewMode, measurementReminder.cycleKey, measurementReminder.isDue]);

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
    <div
      className={`mx-auto flex max-w-7xl flex-col overflow-x-hidden px-4 py-4 sm:px-6 lg:px-8 ${
        view === "conversation"
          ? "min-h-[100dvh] overflow-hidden gap-4 pb-28 lg:gap-4 lg:pb-4"
          : "min-h-[100dvh] gap-4 pb-28 lg:gap-6 lg:pb-4"
      }`}
    >
      {shouldShowMeasurementReminder && isMeasurementReminderOpen ? (
        <MeasurementReminderDialog
          weightDue={weightReminderDue}
          waistDue={waistReminderDue}
          onClose={() => setIsMeasurementReminderOpen(false)}
          onOpenOverview={openMeasurementsOverview}
        />
      ) : null}

      <header
        className="z-20 px-0 py-0 lg:rounded-3xl lg:border lg:border-[var(--border-strong)] lg:bg-[linear-gradient(180deg,var(--surface)_0%,var(--surface-2)_100%)] lg:px-4 lg:py-3.5 lg:shadow-[0_1px_0_0_var(--shadow-soft),0_14px_30px_-20px_var(--shadow)]"
      >
        <div className="flex flex-col gap-4">
          <section className="min-w-0">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="truncate font-[family-name:var(--font-display)] text-[1rem] font-semibold leading-tight text-[var(--text)] sm:pr-2 sm:text-[1.65rem] sm:leading-[1.02]">
                  {currentUser.fullName}
                </h1>
                <p className="mt-1 text-sm text-[var(--text-subtle)]">{todayLabel}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {shouldShowMeasurementReminder ? (
                  <Button
                    onClick={() => setIsMeasurementReminderOpen(true)}
                    type="button"
                    variant="secondary"
                    className="size-10 !rounded-full !border-[var(--accent)] !bg-[var(--accent)] !px-0 !py-0 !text-white shadow-[inset_0_0_0_1px_var(--accent-strong),0_10px_24px_-16px_var(--accent)] sm:size-11"
                    aria-label="Avaa kehon seurannan muistutus"
                    title="Avaa kehon seurannan muistutus"
                  >
                    <BellRing className="size-5" aria-hidden="true" />
                    <span className="sr-only">Avaa kehon seurannan muistutus</span>
                  </Button>
                ) : null}
                <Button
                  onClick={() => setView("settings")}
                  type="button"
                  variant="secondary"
                  className={`size-10 overflow-hidden !rounded-full !border-[var(--border-strong)] !bg-[var(--surface)] !px-0 !py-0 sm:size-11 ${
                    view === "settings" ? "!border-[var(--accent)] !text-[var(--accent)]" : "!text-[var(--text)]"
                  }`}
                  aria-label="Avaa tilin asetukset"
                  aria-pressed={view === "settings"}
                  title="Avaa tilin asetukset"
                >
                  {profileImageSrc && !profileImageFailed ? (
                    <img
                      src={profileImageSrc}
                      alt=""
                      className="size-full object-cover"
                      onError={() => setProfileImageFailed(true)}
                    />
                  ) : (
                    <UserRound className="size-5" aria-hidden="true" />
                  )}
                  <span className="sr-only">Avaa tilin asetukset</span>
                </Button>
                <Button
                  onClick={() => {
                    void handleLogout();
                  }}
                  type="button"
                  variant="secondary"
                  className="hidden size-10 !rounded-full !border-[var(--border-strong)] !bg-[var(--surface)] !px-0 !py-0 !text-[var(--text)] sm:size-11 lg:inline-flex"
                  aria-label="Kirjaudu ulos"
                  title="Kirjaudu ulos"
                >
                  <LogOut className="size-5" aria-hidden="true" />
                  <span className="sr-only">Kirjaudu ulos</span>
                </Button>
              </div>
            </div>
          </section>

          <div className="hidden lg:block">
            {view === "conversation" && unreadConversationCount > 0 ? (
              <div className="mb-2 flex justify-end px-1">
                <p className="text-sm font-medium text-[var(--accent)]">
                  Keskustelussa {unreadConversationCount} lukematonta viestiä
                </p>
              </div>
            ) : null}
            <nav aria-label="Työtilan navigaatio" className="min-w-0">
              <div
                role="tablist"
                aria-label="Työtilan näkymät"
                className="flex min-w-0 gap-1.5 overflow-x-auto rounded-[1.1rem] border border-[color-mix(in_srgb,var(--border)_88%,var(--surface))] bg-[color-mix(in_srgb,var(--surface)_78%,var(--surface-2))] p-1 shadow-[0_10px_20px_-24px_var(--shadow)]"
              >
                {navItems.map((item, index) => {
                  const Icon = navIconByView[item];
                  const isActive = view === item;
                  const tabLabel = navLabelByView[item];
                  const unreadLabel =
                    item === "conversation" && unreadConversationCount > 0
                      ? `, ${unreadConversationCount} lukematonta viestiä`
                      : "";

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
                      aria-label={`${tabLabel}${unreadLabel}`}
                      className={
                        isActive
                          ? "relative h-full min-h-10 shrink-0 self-stretch flex-row items-center justify-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--accent)_22%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] px-3 py-2 text-sm font-semibold text-[var(--accent)] shadow-[0_8px_18px_-20px_var(--accent)] hover:opacity-100 hover:brightness-100 sm:justify-start sm:px-3.5"
                          : "relative h-full min-h-10 shrink-0 self-stretch flex-row items-center justify-center gap-2 rounded-xl border border-transparent bg-transparent px-3 py-2 text-sm font-medium text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)] sm:justify-start sm:px-3.5"
                      }
                      onKeyDown={(event) => handleNavKeyDown(event, index)}
                      onClick={() => setView(item)}
                    >
                      <span
                        className={`flex size-7 shrink-0 items-center justify-center rounded-full border ${
                          isActive
                            ? "border-[color-mix(in_srgb,var(--accent)_18%,var(--surface))] bg-[var(--surface)] text-[var(--accent)]"
                            : "border-[color-mix(in_srgb,var(--border)_88%,var(--surface))] bg-[var(--surface-2)] text-[var(--text-muted)]"
                        }`}
                        aria-hidden="true"
                      >
                        <Icon className="size-[0.95rem]" aria-hidden="true" />
                      </span>
                      <span
                        className={`min-w-0 truncate whitespace-nowrap text-left leading-none ${
                          isActive ? "text-[var(--accent)]" : "text-[var(--text)]"
                        }`}
                      >
                        {tabLabel}
                      </span>
                      {item === "conversation" && unreadConversationCount > 0 ? (
                        <span
                          className={`absolute right-1.5 top-1.5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${
                            isActive
                              ? "bg-[var(--accent)] text-[var(--accent-contrast)]"
                              : "border border-[var(--accent)] bg-[var(--surface)] text-[var(--accent)]"
                          }`}
                          aria-hidden="true"
                        >
                          {unreadConversationCount}
                        </span>
                      ) : null}
                    </Button>
                  );
                })}
              </div>
            </nav>
          </div>

          {isImpersonating && authenticatedUser ? (
            <div className="flex flex-col gap-2 sm:gap-2.5">
              <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-[var(--text-muted)]">
                  Toimit käyttäjänä <span className="font-semibold text-[var(--text)]">{currentUser.fullName}</span>.
                  Alkuperäinen admin: <span className="font-semibold text-[var(--text)]">{authenticatedUser.fullName}</span>.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-10 shrink-0 rounded-xl px-4 text-sm"
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
            </div>
          ) : null}
        </div>
      </header>

      <main id="main-content" className={view === "conversation" ? "flex min-h-0 min-w-0 flex-1 overflow-x-hidden" : "min-w-0 overflow-x-hidden"}>
        {view === "settings" ? (
          <UserSettingsPanel />
        ) : (
          <div
            role="tabpanel"
            id={activePanelId}
            aria-labelledby={activeTabId}
            tabIndex={0}
            className={view === "conversation" ? "flex min-h-0 min-w-0 flex-1 overflow-x-hidden" : "min-w-0 overflow-x-hidden"}
          >
            {view === "athlete-log" ? (
              <AthleteDashboard
                view={view}
                onOpenWorkoutLog={() => setView("athlete-log")}
                onOpenSettings={() => setView("settings")}
                onWorkoutDetailModeChange={setIsMobileWorkoutDetailOpen}
                overviewFocusTarget={athleteOverviewFocusTarget}
                onOverviewFocusHandled={() => setAthleteOverviewFocusTarget(null)}
              />
            ) : view === "nutrition" && canActAsCoach(currentUser.role) ? (
              <NutritionAdminPanel />
            ) : view === PROGRAMS_WORKSPACE_VIEW ||
              currentUser.role === "coach" ||
              (currentUser.role === "admin" && (view === "athletes" || view === "conversation")) ? (
              <CoachDashboard
                view={view}
                onOpenConversation={() => setView("conversation")}
                onOpenWorkoutLog={() => setView("athlete-log")}
                onOpenSettings={() => setView("settings")}
              />
            ) : currentUser.role === "admin" && view === "users" ? (
              <UserSettingsPanel adminOnly />
            ) : currentUser.role === "admin" ? (
              <AdminDashboard
                view={view}
                onOpenWorkoutLog={() => setView("athlete-log")}
                onOpenSettings={() => setView("settings")}
              />
            ) : (
              <AthleteDashboard
                view={view}
                onOpenWorkoutLog={() => setView("athlete-log")}
                onOpenSettings={() => setView("settings")}
                onWorkoutDetailModeChange={setIsMobileWorkoutDetailOpen}
                overviewFocusTarget={athleteOverviewFocusTarget}
                onOverviewFocusHandled={() => setAthleteOverviewFocusTarget(null)}
              />
            )}
          </div>
        )}
      </main>

      <div className={`${shouldHideMobileBottomNav ? "hidden" : "fixed"} inset-x-0 bottom-0 z-30 border-t border-[color-mix(in_srgb,var(--border)_90%,var(--surface))] bg-[var(--surface)] px-1 py-1 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_18px_-24px_var(--shadow)] backdrop-blur lg:hidden`}>
        <nav aria-label="Mobiilinavigaatio">
          <div
            className="grid gap-1"
            style={{
              gridTemplateColumns: `repeat(${Math.max(mobileNavSlotCount, 1)}, minmax(0, 1fr))`,
            }}
          >
            <div className="grid min-w-0 grid-flow-col auto-cols-fr gap-1 rounded-[1.02rem] bg-transparent" style={{ gridColumn: `span ${Math.max(mobileNavSlotCount, 1)} / span ${Math.max(mobileNavSlotCount, 1)}` }}>
              {mobilePrimaryNavItems.map((item) => {
                const Icon = navIconByView[item];
                const isActive = view === item;
                const tabLabel = mobileNavLabelByView[item];
                const isWorkoutItem = item === "athlete-log";

                return (
                  <button
                    key={item}
                    type="button"
                    className={`relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-[1.02rem] px-1 py-1.5 text-[14px] font-normal leading-none transition ${
                      isActive
                        ? "bg-[var(--nav-active-bg)] text-[var(--accent)]"
                        : isWorkoutItem
                          ? "bg-[var(--nav-workout-bg)] text-[var(--text)]"
                          : "bg-transparent text-[var(--text-muted)]"
                    }`}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => setView(item)}
                  >
                    {isActive ? (
                      <span className="absolute bottom-0 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-[var(--accent)]" aria-hidden="true" />
                    ) : null}
                    <span
                      className={`relative flex size-6.5 items-center justify-center rounded-full ${
                        isActive
                          ? "bg-[var(--nav-group-icon-active-bg)] text-[var(--accent)]"
                          : isWorkoutItem
                            ? "bg-[var(--nav-workout-icon-bg)] text-[var(--text)]"
                            : "bg-[var(--nav-group-icon-bg)] text-[var(--text)]"
                      }`}
                      aria-hidden="true"
                    >
                      <Icon className="size-[0.95rem]" aria-hidden="true" />
                      {item === "conversation" && unreadConversationCount > 0 ? (
                        <span className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[8px] font-bold text-[var(--accent-contrast)]">
                          {unreadConversationCount}
                        </span>
                      ) : null}
                    </span>
                    <span className="max-w-full truncate text-[14px] font-normal">
                      {tabLabel}
                    </span>
                  </button>
                );
              })}

              <button
                type="button"
                className={`relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-[1.02rem] px-1 py-1.5 text-[14px] font-normal leading-none transition ${
                  isMobileNavSheetOpen || view === "settings" || mobileOverflowNavItems.includes(view as PrimaryWorkspaceView)
                    ? "bg-[var(--nav-active-bg)] text-[var(--accent)]"
                    : "bg-transparent text-[var(--text-muted)]"
                }`}
                aria-expanded={isMobileNavSheetOpen}
                aria-haspopup="dialog"
                onClick={() => setIsMobileNavSheetOpen((current) => !current)}
              >
                {isMobileNavSheetOpen || view === "settings" || mobileOverflowNavItems.includes(view as PrimaryWorkspaceView) ? (
                  <span className="absolute bottom-0 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-[var(--accent)]" aria-hidden="true" />
                ) : null}
                <span
                  className={`flex size-6.5 items-center justify-center rounded-full ${
                    isMobileNavSheetOpen || view === "settings" || mobileOverflowNavItems.includes(view as PrimaryWorkspaceView)
                      ? "bg-[var(--nav-group-icon-active-bg)] text-[var(--accent)]"
                      : "bg-[var(--nav-group-icon-bg)] text-[var(--text)]"
                  }`}
                  aria-hidden="true"
                >
                  <MoreHorizontal className="size-[0.95rem]" aria-hidden="true" />
                </span>
                <span className="max-w-full truncate text-[14px] font-normal">Lisää</span>
              </button>
            </div>
          </div>
        </nav>
      </div>

      {isMobileNavSheetOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" aria-hidden="true">
          <button
            type="button"
            className="absolute inset-0 bg-[rgba(8,17,31,0.36)]"
            onClick={() => setIsMobileNavSheetOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Lisää näkymiä"
            className="absolute inset-x-0 bottom-0 rounded-t-[2rem] border border-[var(--border-strong)] bg-[var(--surface)] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 shadow-[0_-24px_40px_-28px_var(--shadow)]"
          >
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[var(--border)]" />
            <div className="space-y-2">
              {mobileOverflowNavItems.map((item) => {
                const Icon = navIconByView[item];
                const isActive = view === item;

                return (
                  <button
                    key={item}
                    type="button"
                    className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                      isActive
                        ? "border-[var(--accent)] bg-[var(--surface-2)] text-[var(--accent)]"
                        : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
                    }`}
                    onClick={() => setView(item)}
                  >
                    <span className="flex items-center gap-3">
                      <span className="flex size-9 items-center justify-center rounded-full bg-[var(--surface-2)]" aria-hidden="true">
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <span className="font-medium">{navLabelByView[item]}</span>
                    </span>
                    {item === "conversation" && unreadConversationCount > 0 ? (
                      <span className="rounded-full bg-[var(--accent)] px-2 py-1 text-xs font-semibold text-[var(--accent-contrast)]">
                        {unreadConversationCount}
                      </span>
                    ) : null}
                  </button>
                );
              })}

              <button
                type="button"
                className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                  view === "settings"
                    ? "border-[var(--accent)] bg-[var(--surface-2)] text-[var(--accent)]"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
                }`}
                onClick={() => setView("settings")}
              >
                <span className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-full bg-[var(--surface-2)]" aria-hidden="true">
                    <UserRoundCog className="size-4" aria-hidden="true" />
                  </span>
                  <span className="font-medium">Tili</span>
                </span>
              </button>

              <button
                type="button"
                className="flex w-full items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left text-[var(--text)] transition"
                onClick={() => {
                  void handleLogout();
                }}
              >
                <span className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-full bg-[var(--surface-2)]" aria-hidden="true">
                    <LogOut className="size-4" aria-hidden="true" />
                  </span>
                  <span className="font-medium">Kirjaudu ulos</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
