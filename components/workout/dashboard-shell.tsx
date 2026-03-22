"use client";

import { Dumbbell } from "lucide-react";
import { useState } from "react";

import { AdminDashboard } from "@/components/workout/admin-dashboard";
import { AthleteDashboard } from "@/components/workout/athlete-dashboard";
import { CoachDashboard } from "@/components/workout/coach-dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/config";
import { useAppState } from "@/providers/app-state-provider";

import { metricTone, roleHeadline, roleLabel, type WorkspaceView } from "@/components/workout/shared";

export function DashboardShell() {
  const { currentUser, logout, state } = useAppState();
  const [view, setView] = useState<WorkspaceView>("overview");

  if (!currentUser) {
    return null;
  }

  const navItems: WorkspaceView[] =
    currentUser.role === "admin"
      ? ["overview", "invites"]
      : currentUser.role === "coach"
        ? ["overview", "templates", "invites"]
        : ["overview", "athlete-log"];
  const scopedWorkouts =
    currentUser.role === "athlete"
      ? state.scheduledWorkouts.filter((workout) => workout.athleteId === currentUser.id)
      : currentUser.role === "coach"
        ? state.scheduledWorkouts.filter((workout) => workout.coachId === currentUser.id)
        : state.scheduledWorkouts;
  const activeWorkouts = scopedWorkouts.filter((workout) => workout.status !== "completed").length;
  const completedWorkouts = scopedWorkouts.filter((workout) => workout.status === "completed").length;
  const navLabelByView: Record<WorkspaceView, string> = {
    overview: "Yleiskuva",
    templates: "Ohjelmat",
    invites: "Kutsut",
    "athlete-log": "Treeniloki",
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8">
      <header
        className="z-20 rounded-3xl border border-[var(--border-strong)] bg-[var(--surface)] px-5 py-4 shadow-[0_1px_0_0_var(--shadow-soft),0_14px_30px_-20px_var(--shadow)]"
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex size-14 items-center justify-center rounded-2xl border border-[var(--accent-strong)] bg-[var(--accent)] shadow-[0_1px_0_0_var(--accent-strong),0_14px_24px_-18px_var(--accent)]">
                <Dumbbell className="size-6 text-white" />
              </div>
              <div>
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Rookiapp training log</p>
                <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--text)] md:text-[1.75rem]">
                  {currentUser.fullName}
                </h2>
                <p className="text-sm leading-6 text-[var(--text-muted)]">{roleHeadline(currentUser.role)}</p>
              </div>
            </div>

            <Button onClick={logout} type="button" variant="secondary" className="min-w-32">
              Kirjaudu ulos
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge className={`bg-[var(--surface-3)] ${metricTone(currentUser.role)}`}>
              {roleLabel(currentUser.role)}
            </Badge>
            <Badge className="border-[var(--border-strong)] bg-[var(--surface-3)] text-[var(--text-subtle)]">
              Aktiiviset {activeWorkouts}
            </Badge>
            <Badge className="border-[var(--border-strong)] bg-[var(--surface-3)] text-[var(--text-subtle)]">
              Valmiit {completedWorkouts}
            </Badge>
            {!isSupabaseConfigured ? (
              <Badge className="border-[var(--accent-secondary)] bg-[var(--surface-3)] text-[var(--accent-secondary)]">Demo mode</Badge>
            ) : (
              <Badge className="border-[var(--accent-tertiary)] bg-[var(--surface-3)] text-[var(--accent-tertiary)]">Supabase ready</Badge>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">
              Työtila: {navLabelByView[view]}
            </p>
            <nav aria-label="Työtilan navigaatio" className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-1.5">
              {navItems.map((item) => (
                <Button
                  key={item}
                  type="button"
                  variant={view === item ? "primary" : "ghost"}
                  aria-pressed={view === item}
                  className="min-w-28"
                  onClick={() => setView(item)}
                >
                  {navLabelByView[item]}
                </Button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main id="main-content">
        {currentUser.role === "admin" ? (
          <AdminDashboard view={view} />
        ) : currentUser.role === "coach" ? (
          <CoachDashboard view={view} />
        ) : (
          <AthleteDashboard
            view={view}
            onOpenWorkoutLog={() => setView("athlete-log")}
          />
        )}
      </main>
    </div>
  );
}
