"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Activity, AlertTriangle, ShieldCheck, UserRoundPlus, UsersRound } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { OwnMeasurementsCard } from "@/components/workout/own-measurements-card";
import { getAdminCoachingCoverage, getAdminOverviewAthleteGroups } from "@/lib/admin-overview";
import { getInviteLifecycleLabel, getVisiblePendingInvites } from "@/lib/invite-status";
import { withMinimumDelay } from "@/lib/min-delay";
import { isProgramActive } from "@/lib/program-status";
import { canResendInvite, getAssignableCoachUsers } from "@/lib/role-access";
import { formatDate } from "@/lib/utils";
import { useAppState } from "@/providers/app-state-provider";

import { inviteSchema } from "@/components/workout/schemas";
import { MetricGrid, OwnTrainingOverviewCard, roleLabel, type WorkspaceView } from "@/components/workout/shared";

type AdminOverviewTab = "snapshot" | "attention" | "onboarding" | "load";

const adminOverviewTabs: Array<{ id: AdminOverviewTab; label: string }> = [
  { id: "snapshot", label: "Tilannekuva" },
  { id: "attention", label: "Huomiot" },
  { id: "onboarding", label: "Kutsut" },
  { id: "load", label: "Kuormitus" },
];

export function AdminDashboard({
  view,
  onOpenWorkoutLog,
}: {
  view: WorkspaceView;
  onOpenWorkoutLog?: () => void;
}) {
  const { currentUser, state, notify, createInvite, resendInvite } = useAppState();
  const formId = useId();
  const [inviteMessage, setInviteMessage] = useState<string>("");
  const [inviteMessageTone, setInviteMessageTone] = useState<"success" | "danger" | null>(null);
  const [resendMessage, setResendMessage] = useState<string>("");
  const [resendMessageTone, setResendMessageTone] = useState<"success" | "danger" | null>(null);
  const [resendingInviteId, setResendingInviteId] = useState<string | null>(null);
  const [overviewTab, setOverviewTab] = useState<AdminOverviewTab>("snapshot");
  const coaches = getAssignableCoachUsers(state.users);
  const { activeAthletes, invitedAthletes } = getAdminOverviewAthleteGroups(state.users);
  const pendingInvites = getVisiblePendingInvites(state.invites, state.users);
  const overview = useMemo(() => {
    const dayMs = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const activeAthleteIds = new Set(activeAthletes.map((athlete) => athlete.id));
    const coachingCoverage = getAdminCoachingCoverage(state);
    const planCountByAthlete = new Map<string, number>();
    const athleteLatestActivity = new Map<string, number>();

    state.plans.forEach((plan) => {
      if (!activeAthleteIds.has(plan.athleteId) || !isProgramActive(plan)) {
        return;
      }

      planCountByAthlete.set(plan.athleteId, (planCountByAthlete.get(plan.athleteId) ?? 0) + 1);
    });

    state.sessions.forEach((session) => {
      if (!activeAthleteIds.has(session.athleteId)) {
        return;
      }

      const activityMoment = Date.parse(session.completedAt ?? session.updatedAt);
      if (!Number.isFinite(activityMoment)) {
        return;
      }

      athleteLatestActivity.set(
        session.athleteId,
        Math.max(activityMoment, athleteLatestActivity.get(session.athleteId) ?? 0),
      );
    });

    state.scheduledWorkouts.forEach((workout) => {
      if (!activeAthleteIds.has(workout.athleteId)) {
        return;
      }

      const activityMoment = Date.parse(workout.completedAt ?? workout.updatedAt);
      if (!Number.isFinite(activityMoment)) {
        return;
      }

      athleteLatestActivity.set(
        workout.athleteId,
        Math.max(activityMoment, athleteLatestActivity.get(workout.athleteId) ?? 0),
      );
    });

    const athletesWithoutCoach = activeAthletes
      .filter((athlete) => !coachingCoverage.athleteCoachCount.has(athlete.id))
      .sort((left, right) => left.fullName.localeCompare(right.fullName, "fi"));
    const athletesWithMultipleCoaches = activeAthletes
      .filter((athlete) => (coachingCoverage.athleteCoachCount.get(athlete.id) ?? 0) > 1)
      .sort(
        (left, right) =>
          (coachingCoverage.athleteCoachCount.get(right.id) ?? 0) -
            (coachingCoverage.athleteCoachCount.get(left.id) ?? 0) ||
          left.fullName.localeCompare(right.fullName, "fi"),
      );
    const athletesWithoutProgram = activeAthletes
      .filter((athlete) => !planCountByAthlete.has(athlete.id))
      .sort((left, right) => left.fullName.localeCompare(right.fullName, "fi"));
    const coachesWithoutAthletes = coaches
      .filter((coach) => !coachingCoverage.coachAthleteCount.has(coach.id))
      .sort((left, right) => left.fullName.localeCompare(right.fullName, "fi"));
    const staleAthletes = activeAthletes
      .filter((athlete) => {
        const latestActivity = athleteLatestActivity.get(athlete.id);
        return !latestActivity || now - latestActivity > 14 * dayMs;
      })
      .sort((left, right) => left.fullName.localeCompare(right.fullName, "fi"));
    const activePrograms = state.plans.filter(
      (plan) => activeAthleteIds.has(plan.athleteId) && Boolean(plan.workouts?.length) && isProgramActive(plan),
    );
    const workoutsInProgress = state.scheduledWorkouts.filter((workout) => workout.status === "in_progress");
    const completedWorkoutsLastWeek = state.scheduledWorkouts.filter((workout) => {
      if (workout.status !== "completed") {
        return false;
      }

      const completedMoment = Date.parse(workout.completedAt ?? workout.updatedAt);
      return Number.isFinite(completedMoment) && now - completedMoment <= 7 * dayMs;
    });
    const pendingInvitesExpiringSoon = pendingInvites
      .filter((invite) => {
        const expiresAt = Date.parse(invite.expiresAt);
        return Number.isFinite(expiresAt) && expiresAt >= now && expiresAt - now <= 3 * dayMs;
      })
      .sort((left, right) => Date.parse(left.expiresAt) - Date.parse(right.expiresAt));
    const coachLoad = coaches
      .map((coach) => ({
        coach,
        athleteCount: coachingCoverage.coachAthleteCount.get(coach.id) ?? 0,
        programCount: state.plans.filter(
          (plan) => plan.coachId === coach.id && activeAthleteIds.has(plan.athleteId) && isProgramActive(plan),
        ).length,
        pendingInviteCount: pendingInvites.filter((invite) => invite.coachId === coach.id).length,
      }))
      .sort(
        (left, right) =>
          right.athleteCount - left.athleteCount ||
          right.programCount - left.programCount ||
          left.coach.fullName.localeCompare(right.coach.fullName, "fi"),
      );
    const attentionCount =
      athletesWithoutCoach.length +
      athletesWithoutProgram.length +
      pendingInvitesExpiringSoon.length +
      staleAthletes.length;

    return {
      relationshipCount: coachingCoverage.relationshipCount,
      athleteCoachCount: coachingCoverage.athleteCoachCount,
      activePrograms,
      athletesWithoutCoach,
      athletesWithMultipleCoaches,
      athletesWithoutProgram,
      coachesWithoutAthletes,
      workoutsInProgress,
      completedWorkoutsLastWeek,
      pendingInvitesExpiringSoon,
      invitedUsers: invitedAthletes,
      staleAthletes,
      coachLoad,
      attentionCount,
    };
  }, [activeAthletes, coaches, invitedAthletes, pendingInvites, state.assignments, state.plans, state.scheduledWorkouts, state.sessions, state.users]);
  const form = useForm<z.infer<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: "",
      role: "coach",
      coachId: coaches[0]?.id ?? "",
    },
  });
  const isSendingInvite = form.formState.isSubmitting;

  const selectedRole = form.watch("role");
  const overviewTabPanelId = `admin-overview-panel-${overviewTab}`;

  return (
    <div className="grid gap-6">
      {view === "overview" ? (
        <>
          {currentUser ? (
            <OwnTrainingOverviewCard
              currentUser={currentUser}
              state={state}
              onOpenWorkoutLog={onOpenWorkoutLog}
            />
          ) : null}

          <OwnMeasurementsCard sectionId="overview-measurements" />

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2">
            <div
              role="tablist"
              aria-label="Adminin kotiosion välilehdet"
              className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
            >
              {adminOverviewTabs.map((tab) => {
                const isActive = overviewTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    id={`admin-overview-tab-${tab.id}`}
                    aria-selected={isActive}
                    aria-controls={`admin-overview-panel-${tab.id}`}
                    tabIndex={isActive ? 0 : -1}
                    className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${
                      isActive
                        ? "border-[color:color-mix(in_srgb,var(--accent)_18%,var(--border))] bg-[color:color-mix(in_srgb,var(--accent)_10%,var(--surface))] text-[var(--accent)] shadow-[0_8px_18px_-20px_var(--accent)]"
                        : "border-transparent text-[var(--text-muted)] hover:border-[var(--border)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                    }`}
                    onClick={() => setOverviewTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <MetricGrid
            metrics={[
              { label: "Vastuuhenkilöt", value: coaches.length, icon: ShieldCheck },
              { label: "Treenaajat", value: activeAthletes.length, icon: UserRoundPlus },
              { label: "Valmennussuhteet", value: overview.relationshipCount, icon: UsersRound },
              { label: "Vaatii huomiota", value: overview.attentionCount, icon: AlertTriangle },
            ]}
            role={currentUser?.role ?? null}
          />

          <div
            role="tabpanel"
            id={overviewTabPanelId}
            aria-labelledby={`admin-overview-tab-${overviewTab}`}
            tabIndex={0}
            className="grid gap-6"
          >
            {overviewTab === "snapshot" ? (
              <>
                <Card className="border-[var(--border-strong)]">
                  <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr] xl:items-end">
                    <div className="space-y-3">
                      <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Hallintanäkymä</p>
                      <CardTitle className="text-2xl">Admin näkee nyt yhdellä silmäyksellä mitä verkossa tapahtuu</CardTitle>
                      <CardDescription className="max-w-3xl leading-6">
                        Yleiskuva nostaa esiin poikkeamat, valmennussuhteet, aktiivisuuden ja käyttöönoton. Mukana
                        näkyvät kaikki valmennuskelpoiset vastuuhenkilöt, myös adminit.
                      </CardDescription>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
                      <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
                        <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Huomiot nyt</p>
                        <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{overview.attentionCount}</p>
                        <p className="mt-1 text-sm text-[var(--text-muted)]">yhteensä avointa poikkeamaa</p>
                      </div>
                      <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
                        <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Monivalmentajat</p>
                        <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{overview.athletesWithMultipleCoaches.length}</p>
                        <p className="mt-1 text-sm text-[var(--text-muted)]">treenaajalla on useampi valmentaja</p>
                      </div>
                      <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-4">
                        <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Vanhenee pian</p>
                        <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{overview.pendingInvitesExpiringSoon.length}</p>
                        <p className="mt-1 text-sm text-[var(--text-muted)]">kutsua 72 tunnin sisällä</p>
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="border-[var(--border-strong)]">
                  <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Toiminnan tila</p>
                  <CardTitle className="text-2xl">Miltä verkon arki näyttää juuri nyt</CardTitle>
                  <CardDescription className="mt-2">
                    Tämä näkymä kertoo nopeasti paljonko valmennusta on käynnissä, paljonko valmistuu ja missä aktiivisuus alkaa hiipua.
                  </CardDescription>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4">
                      <p className="text-xs font-semibold tracking-[0.03em] text-[var(--text-subtle)]">Aktiiviset ohjelmat</p>
                      <p className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--text)]">
                        {overview.activePrograms.length}
                      </p>
                    </div>
                    <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4">
                      <p className="text-xs font-semibold tracking-[0.03em] text-[var(--text-subtle)]">Treenit käynnissä</p>
                      <p className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--text)]">
                        {overview.workoutsInProgress.length}
                      </p>
                    </div>
                    <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4">
                      <p className="text-xs font-semibold tracking-[0.03em] text-[var(--text-subtle)]">Valmiit 7 päivässä</p>
                      <p className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--text)]">
                        {overview.completedWorkoutsLastWeek.length}
                      </p>
                    </div>
                    <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4">
                      <p className="text-xs font-semibold tracking-[0.03em] text-[var(--text-subtle)]">Aktiivisuus hiipunut</p>
                      <p className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--text)]">
                        {overview.staleAthletes.length}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <div className="flex items-center gap-3">
                      <Activity className="size-5 text-[var(--accent)]" />
                      <div>
                        <p className="text-sm font-semibold text-[var(--text)]">Tulkinta</p>
                        <p className="text-sm text-[var(--text-muted)]">
                          {overview.staleAthletes.length > 0
                            ? `${overview.staleAthletes.length} treenaajalla ei näy treeni- tai sessioaktiivisuutta 14 päivään.`
                            : "Aktiivisuudessa ei näy tällä hetkellä selkeää hiljenemistä."}
                        </p>
                      </div>
                    </div>
                  </div>
                </Card>
              </>
            ) : null}

            {overviewTab === "attention" ? (
              <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                <Card className="border-[var(--border-strong)]">
                  <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Vaatii huomiota</p>
                  <CardTitle className="text-2xl">Poikkeamat joihin kannattaa tarttua ensin</CardTitle>
                  <CardDescription className="mt-2">
                    Nosta kuntoon valmentamattomat treenaajat, ohjelmattomat käyttäjät ja vanhenevat kutsut ennen kuin ne jäävät jumiin.
                  </CardDescription>
                  <div className="mt-6 grid gap-3">
                    <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-[var(--text)]">Treenaajat ilman valmentajaa</p>
                          <p className="text-sm text-[var(--text-muted)]">Näille käyttäjille pitää lisätä vähintään yksi valmentaja hallinnasta.</p>
                        </div>
                        <Badge>{overview.athletesWithoutCoach.length}</Badge>
                      </div>
                      {overview.athletesWithoutCoach.length > 0 ? (
                        <ul className="mt-3 grid gap-2 text-sm text-[var(--text-muted)]">
                          {overview.athletesWithoutCoach.slice(0, 4).map((athlete) => (
                            <li key={athlete.id} className="rounded-lg border border-[var(--border)] px-3 py-2">
                              {athlete.fullName}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-3 text-sm text-[var(--success)]">Kaikilla treenaajilla on ainakin yksi valmentaja.</p>
                      )}
                    </div>

                    <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-[var(--text)]">Treenaajat ilman ohjelmaa</p>
                          <p className="text-sm text-[var(--text-muted)]">Ohjelmaton treenaaja jää helposti ilman seuraavaa selkeää askelta.</p>
                        </div>
                        <Badge>{overview.athletesWithoutProgram.length}</Badge>
                      </div>
                      {overview.athletesWithoutProgram.length > 0 ? (
                        <ul className="mt-3 grid gap-2 text-sm text-[var(--text-muted)]">
                          {overview.athletesWithoutProgram.slice(0, 4).map((athlete) => (
                            <li key={athlete.id} className="rounded-lg border border-[var(--border)] px-3 py-2">
                              {athlete.fullName}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-3 text-sm text-[var(--success)]">Jokaisella treenaajalla on vähintään yksi ohjelma.</p>
                      )}
                    </div>

                    <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-[var(--text)]">Kutsut vanhenevat pian</p>
                          <p className="text-sm text-[var(--text-muted)]">Tarkista 72 tunnin sisällä vanhenevat kutsut ennen kuin käyttöönotto pysähtyy.</p>
                        </div>
                        <Badge>{overview.pendingInvitesExpiringSoon.length}</Badge>
                      </div>
                      {overview.pendingInvitesExpiringSoon.length > 0 ? (
                        <ul className="mt-3 grid gap-2 text-sm text-[var(--text-muted)]">
                          {overview.pendingInvitesExpiringSoon.slice(0, 4).map((invite) => (
                            <li key={invite.id} className="rounded-lg border border-[var(--border)] px-3 py-2">
                              <span className="font-medium text-[var(--text)]">{invite.email}</span>
                              <span className="block text-xs text-[var(--text-subtle)]">
                                {roleLabel(invite.role)} · vanhenee {formatDate(invite.expiresAt)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-3 text-sm text-[var(--success)]">Yksikään avoin kutsu ei ole vanhenemassa lähiaikoina.</p>
                      )}
                    </div>
                  </div>
                </Card>

                <Card>
                  <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Valmennussuhteet</p>
                  <CardTitle className="text-2xl">Näe missä vastuujako kaipaa tasapainoa</CardTitle>
                  <CardDescription className="mt-2">
                    Tästä näet, miten valmennuskelpoiset vastuuhenkilöt on jaettu treenaajille.
                  </CardDescription>
                  <div className="mt-6 grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4">
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-sm font-semibold text-[var(--text)]">Treenaajilla useampi vastuuhenkilö</p>
                        <Badge>{overview.athletesWithMultipleCoaches.length}</Badge>
                      </div>
                      {overview.athletesWithMultipleCoaches.length > 0 ? (
                        <ul className="mt-3 grid gap-2 text-sm text-[var(--text-muted)]">
                          {overview.athletesWithMultipleCoaches.slice(0, 4).map((athlete) => (
                            <li key={athlete.id} className="rounded-lg border border-[var(--border)] px-3 py-2">
                              {athlete.fullName}
                              <span className="block text-xs text-[var(--text-subtle)]">
                                {overview.athleteCoachCount.get(athlete.id) ?? 0} aktiivista vastuuhenkilöä
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-3 text-sm text-[var(--text-muted)]">Usean vastuuhenkilön suhteita ei ole vielä käytössä.</p>
                      )}
                    </div>

                    <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4">
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-sm font-semibold text-[var(--text)]">Vastuuhenkilöt ilman treenaajia</p>
                        <Badge>{overview.coachesWithoutAthletes.length}</Badge>
                      </div>
                      {overview.coachesWithoutAthletes.length > 0 ? (
                        <ul className="mt-3 grid gap-2 text-sm text-[var(--text-muted)]">
                          {overview.coachesWithoutAthletes.slice(0, 4).map((coach) => (
                            <li key={coach.id} className="rounded-lg border border-[var(--border)] px-3 py-2">
                              {coach.fullName}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-3 text-sm text-[var(--text-muted)]">Kaikilla vastuuhenkilöillä on ainakin yksi treenaaja.</p>
                      )}
                    </div>
                  </div>
                </Card>
              </div>
            ) : null}

            {overviewTab === "onboarding" ? (
              <Card>
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Kutsut ja käyttöönotto</p>
                <CardTitle className="text-2xl">Seuraa kuka on tulossa sisään järjestelmään</CardTitle>
                <CardDescription className="mt-2">
                  Täältä näet paljonko kutsuja on auki, kuinka moni käyttäjä odottaa vielä aktivointia ja ketkä
                  tarvitsevat seuraavan vaiheen.
                </CardDescription>
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <p className="text-xs font-semibold tracking-[0.03em] text-[var(--text-subtle)]">Avoimet kutsut</p>
                    <p className="mt-3 text-3xl font-semibold text-[var(--text)]">{pendingInvites.length}</p>
                  </div>
                  <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <p className="text-xs font-semibold tracking-[0.03em] text-[var(--text-subtle)]">Odottaa aktivointia</p>
                    <p className="mt-3 text-3xl font-semibold text-[var(--text)]">{overview.invitedUsers.length}</p>
                  </div>
                  <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <p className="text-xs font-semibold tracking-[0.03em] text-[var(--text-subtle)]">Uudelleen tarkistettavat</p>
                    <p className="mt-3 text-3xl font-semibold text-[var(--text)]">{overview.pendingInvitesExpiringSoon.length}</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3">
                  <p
                    aria-live="polite"
                    className={`min-h-5 text-sm ${
                      !resendMessage
                        ? "text-[var(--text-subtle)]"
                        : resendMessageTone === "success"
                          ? "text-[var(--success)]"
                          : "text-[var(--danger)]"
                    }`}
                  >
                    {resendMessage}
                  </p>
                  {pendingInvites.length === 0 ? (
                    <p className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-muted)]">
                      Käyttöönottolista on tällä hetkellä tyhjä.
                    </p>
                  ) : (
                    pendingInvites.slice(0, 4).map((invite) => {
                      const assignedCoach = invite.coachId
                        ? coaches.find((coach) => coach.id === invite.coachId)
                        : null;

                      return (
                        <div key={invite.id} className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="font-medium text-[var(--text)]">{invite.email}</p>
                              <p className="mt-1 text-sm text-[var(--text-muted)]">
                                {roleLabel(invite.role)} · vanhenee {formatDate(invite.expiresAt)}
                              </p>
                              <p className="mt-1 text-xs font-medium text-[var(--text-subtle)]">
                                {getInviteLifecycleLabel(invite.status)}
                              </p>
                              {assignedCoach ? (
                                <p className="mt-1 text-xs text-[var(--text-subtle)]">
                                  Vastuuhenkilö: {assignedCoach.fullName}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <Badge>{Date.parse(invite.expiresAt) - Date.now() <= 3 * 24 * 60 * 60 * 1000 ? "Seuraa" : "Auki"}</Badge>
                              {canResendInvite(currentUser, invite) ? (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  className="px-3 py-2 text-sm"
                                  loading={resendingInviteId === invite.id}
                                  loadingText="Lähetetään..."
                                  onClick={async () => {
                                    setResendingInviteId(invite.id);
                                    try {
                                      const result = await resendInvite(invite.id);
                                      setResendMessage(result.ok ? `Kutsu lähetettiin uudelleen osoitteeseen ${invite.email}.` : result.message);
                                    } finally {
                                      setResendingInviteId(null);
                                    }
                                  }}
                                >
                                  Lähetä uudelleen
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </Card>
            ) : null}

            {overviewTab === "load" ? (
              <Card>
                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Valmentajien kuormitus</p>
                <CardTitle className="text-2xl">Vastuuhenkilöiden rosterit ja ohjelmakuorma</CardTitle>
                <CardDescription className="mt-2">
                  Näet nopeasti kunkin valmennuskelpoisen vastuuhenkilön rosterin, ohjelmien määrän ja avoimet
                  käyttöönotot.
                </CardDescription>
                <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                  {overview.coachLoad.length === 0 ? (
                    <p className="text-sm text-[var(--text-muted)]">Vastuuhenkilöitä ei ole vielä lisätty.</p>
                  ) : (
                    overview.coachLoad.map(({ coach, athleteCount, programCount, pendingInviteCount }) => {
                      return (
                        <div key={coach.id} className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <p className="font-medium text-[var(--text)]">{coach.fullName}</p>
                              <p className="text-sm text-[var(--text-muted)]">{coach.email}</p>
                            </div>
                            <Badge>{roleLabel(coach.role)}</Badge>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <Badge>{athleteCount} treenaajaa</Badge>
                            <Badge>{programCount} ohjelmaa</Badge>
                            <Badge>{pendingInviteCount} avointa kutsua</Badge>
                          </div>
                          <p className="mt-4 text-sm text-[var(--text-muted)]">
                            {athleteCount === 0
                              ? "Tällä vastuuhenkilöllä ei ole vielä aktiivisia treenaajia."
                              : athleteCount === 1
                                ? "Kuormitus on tällä hetkellä kevyt."
                                : "Vastuuhenkilö on aktiivisesti kiinni rosterissa."}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>
              </Card>
            ) : null}
          </div>
        </>
      ) : null}

      {view === "invites" ? (
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="border-[var(--border-strong)]">
            <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Käyttäjähallinta</p>
            <CardTitle className="text-2xl">Lähetä uusi kutsu</CardTitle>
            <CardDescription className="mt-2">
              Lähetä kutsu uudelle valmentajalle tai treenaajalle. Treenaajalle voit samalla valita vastuullisen
              valmentajan.
            </CardDescription>
            <form
              className="mt-6 space-y-4"
              onSubmit={form.handleSubmit(async (values) => {
                const result = await withMinimumDelay(createInvite(values));
                setInviteMessage(result.ok ? `Kutsu lähetettiin osoitteeseen ${values.email}.` : result.message);
                setInviteMessageTone(result.ok ? "success" : "danger");
                notify({
                  tone: result.ok ? "success" : "danger",
                  message: result.ok ? `Kutsu lähetettiin osoitteeseen ${values.email}.` : result.message,
                });
                setResendMessage("");
                setResendMessageTone(null);
                if (result.ok) {
                  form.reset({ email: "", role: values.role, coachId: values.coachId });
                }
              })}
            >
              <div>
                <Label htmlFor={`${formId}-invite-email`}>Sähköposti</Label>
                <Input
                  id={`${formId}-invite-email`}
                  autoComplete="email"
                  aria-invalid={Boolean(form.formState.errors.email)}
                  aria-describedby={form.formState.errors.email ? `${formId}-invite-email-error` : undefined}
                  {...form.register("email")}
                  placeholder="etunimi@sähköposti.fi"
                />
                {form.formState.errors.email ? (
                  <p className="mt-2 text-sm text-[var(--danger)]" id={`${formId}-invite-email-error`}>
                    {form.formState.errors.email.message}
                  </p>
                ) : null}
              </div>
              <fieldset className="grid gap-4 rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4 md:grid-cols-2">
                <legend className="px-2 text-sm font-semibold tracking-[0.03em] text-[var(--text-subtle)]">Rooliasetukset</legend>
                <div>
                  <Label htmlFor={`${formId}-invite-role`}>Rooli</Label>
                  <Select id={`${formId}-invite-role`} {...form.register("role")}>
                    <option value="coach">Valmentaja</option>
                    <option value="athlete">Treenaaja</option>
                    <option value="independent_athlete">Itsenäinen treenaaja</option>
                  </Select>
                </div>
                {selectedRole === "athlete" || selectedRole === "independent_athlete" ? (
                  <div>
                    <Label htmlFor={`${formId}-invite-coach`}>Vastuuhenkilö</Label>
                    <Select
                      id={`${formId}-invite-coach`}
                      aria-invalid={Boolean(form.formState.errors.coachId)}
                      aria-describedby={form.formState.errors.coachId ? `${formId}-invite-coach-error` : undefined}
                      {...form.register("coachId")}
                    >
                      <option value="">Valitse vastuuhenkilö</option>
                      {coaches.map((coach) => (
                        <option key={coach.id} value={coach.id}>
                          {coach.fullName} ({roleLabel(coach.role)})
                        </option>
                      ))}
                    </Select>
                    {form.formState.errors.coachId ? (
                      <p className="mt-2 text-sm text-[var(--danger)]" id={`${formId}-invite-coach-error`}>
                        {form.formState.errors.coachId.message}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </fieldset>
              <p
                aria-live="polite"
                className={`min-h-5 text-sm ${
                  !inviteMessage
                    ? "text-[var(--text-subtle)]"
                    : inviteMessageTone === "success"
                      ? "text-[var(--success)]"
                      : "text-[var(--danger)]"
                }`}
              >
                {inviteMessage}
              </p>
              <Button
                type="submit"
                className="w-full"
                loading={isSendingInvite}
                loadingText="Lähetetään kutsua..."
              >
                Lähetä kutsu
              </Button>
            </form>
          </Card>

          <Card>
            <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Kutsutilanne</p>
            <CardTitle className="text-2xl">Avoimet kutsut</CardTitle>
            <CardDescription className="mt-2">
              Täältä näet avoimet kutsut ja voit avata tai lähettää liittymislinkin uudelleen tarvittaessa.
            </CardDescription>
            <p
              aria-live="polite"
              className={`mt-4 min-h-5 text-sm ${
                !resendMessage
                  ? "text-[var(--text-subtle)]"
                  : resendMessageTone === "success"
                    ? "text-[var(--success)]"
                    : "text-[var(--danger)]"
              }`}
            >
              {resendMessage}
            </p>
            <div className="mt-4 grid gap-3">
              {pendingInvites.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">Avoimia kutsuja ei ole tällä hetkellä.</p>
              ) : (
                pendingInvites.map((invite) => {
                  const assignedCoach = invite.coachId
                    ? coaches.find((coach) => coach.id === invite.coachId)
                    : null;

                  return (
                    <div key={invite.id} className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-2)] p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-medium text-[var(--text)]">{invite.email}</p>
                          <p className="mt-1 text-sm text-[var(--text-muted)]">
                            {roleLabel(invite.role)} · vanhenee {formatDate(invite.expiresAt)}
                          </p>
                          <p className="mt-1 text-xs font-medium text-[var(--text-subtle)]">
                            {getInviteLifecycleLabel(invite.status)}
                          </p>
                          {assignedCoach ? (
                            <p className="mt-1 text-xs text-[var(--text-subtle)]">
                              Vastuuhenkilö: {assignedCoach.fullName}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Link className="text-sm font-semibold text-[var(--accent)]" href={`/invite/${invite.token}`}>
                            Avaa kutsu
                          </Link>
                          {canResendInvite(currentUser, invite) ? (
                            <Button
                              type="button"
                              variant="secondary"
                              className="px-3 py-2 text-sm"
                              loading={resendingInviteId === invite.id}
                              loadingText="Lähetetään..."
                              onClick={async () => {
                                setResendingInviteId(invite.id);
                                try {
                                  const result = await withMinimumDelay(resendInvite(invite.id));
                                  setResendMessage(result.ok ? `Kutsu lähetettiin uudelleen osoitteeseen ${invite.email}.` : result.message);
                                  setResendMessageTone(result.ok ? "success" : "danger");
                                  notify({
                                    tone: result.ok ? "success" : "danger",
                                    message: result.ok ? `Kutsu lähetettiin uudelleen osoitteeseen ${invite.email}.` : result.message,
                                  });
                                } finally {
                                  setResendingInviteId(null);
                                }
                              }}
                            >
                              Lähetä uudelleen
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
