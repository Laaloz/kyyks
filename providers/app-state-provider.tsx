"use client";

import type { User as SupabaseAuthUser } from "@supabase/supabase-js";
import {
  canCoachManageAthlete,
  canCompleteSession,
  cancelSession as domainCancelSession,
  completeSession as domainCompleteSession,
  cloneDemoState,
  createProgram as domainCreateProgram,
  createInvite as domainCreateInvite,
  deleteScheduledWorkout as domainDeleteScheduledWorkout,
  getCoachAthletes as domainGetCoachAthletes,
  isInviteExpired,
  saveSessionNote as domainSaveSessionNote,
  startProgramWorkout as domainStartProgramWorkout,
  startSession as domainStartSession,
  updateProgram as domainUpdateProgram,
  updateSessionSet as domainUpdateSessionSet,
} from "@/lib/domain";
import {
  addDaysIso,
  addMinutesIso,
  createSecureToken,
  hashToken,
  INVITE_EXPIRY_DAYS,
  isTimestampExpired,
  RESET_TOKEN_EXPIRY_MINUTES,
} from "@/lib/auth-tokens";
import { defaultGlobalExercises } from "@/lib/demo-data";
import { getVisiblePendingInvites } from "@/lib/invite-status";
import { getProgramStatus, isProgramActive } from "@/lib/program-status";
import { canActAsCoach, canResendInvite, getDashboardViewsForRole, getDefaultDashboardView, isAdminRole } from "@/lib/role-access";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  AppState,
  ConversationEntry,
  ConversationEntryType,
  DashboardHomeView,
  Exercise,
  InviteInput,
  PasswordResetRequest,
  ProgramBuilderInput,
  ProgramUpdateInput,
  Role,
  UserProfile,
  WorkoutUpdateInput,
} from "@/lib/types";
import { makeId } from "@/lib/utils";
import { normalizeWorkoutHistoryTitle } from "@/lib/workout-history-title";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

const STATE_KEY = "rooki-fit-state-v1";
const SESSION_KEY = "rooki-fit-session-v1";
type PersistedSession = {
  authenticatedUserId: string | null;
  impersonatedUserId: string | null;
};

type SupabaseAuthSyncSource = "bootstrap" | "event";
type SupabaseAuthEvent =
  | "INITIAL_SESSION"
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "TOKEN_REFRESHED"
  | "USER_UPDATED"
  | "PASSWORD_RECOVERY";

function normalizeDefaultDashboardView(role: Role, value: DashboardHomeView | undefined): DashboardHomeView {
  if (value && getDashboardViewsForRole(role).includes(value)) {
    return value;
  }

  return getDefaultDashboardView(role);
}

function normalizeComparableEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? "";
}

function warnIfOptimisticServerIdLeak(kind: "workout" | "program" | "template", id: string | undefined) {
  if (process.env.NODE_ENV === "production" || !id) {
    return;
  }

  const optimisticPrefixes: Record<typeof kind, string> = {
    workout: "workout_",
    program: "plan_",
    template: "template_",
  };

  if (id.startsWith(optimisticPrefixes[kind])) {
    console.warn(`[optimistic-id-leak] ${kind}`, { id });
  }
}

export function preserveActiveWorkoutShells(previous: AppState, snapshot: SupabaseVisibleAppStateSnapshot) {
  const snapshotWorkoutIds = new Set(snapshot.scheduledWorkouts.map((workout) => workout.id));
  const snapshotSessionWorkoutIds = new Set(snapshot.sessions.map((session) => session.scheduledWorkoutId));

  const optimisticWorkouts = previous.scheduledWorkouts.filter(
    (workout) =>
      workout.id.startsWith("workout_") &&
      workout.status === "in_progress" &&
      !snapshotWorkoutIds.has(workout.id) &&
      !snapshot.scheduledWorkouts.some(
        (candidate) =>
          candidate.athleteId === workout.athleteId &&
          candidate.programWorkoutId === workout.programWorkoutId &&
          candidate.templateId === workout.templateId &&
          candidate.status === "in_progress",
      ),
  );

  const optimisticSessions = previous.sessions.filter(
    (session) =>
      session.id.startsWith("session_") &&
      !snapshotSessionWorkoutIds.has(session.scheduledWorkoutId) &&
      optimisticWorkouts.some((workout) => workout.id === session.scheduledWorkoutId),
  );

  return {
    scheduledWorkouts: [...snapshot.scheduledWorkouts, ...optimisticWorkouts],
    sessions: [...snapshot.sessions, ...optimisticSessions],
  };
}

export function rekeyOptimisticWorkoutArtifacts(
  state: AppState,
  optimisticScheduledWorkoutId: string,
  persistedScheduledWorkoutId: string,
): AppState {
  if (
    !optimisticScheduledWorkoutId ||
    !persistedScheduledWorkoutId ||
    optimisticScheduledWorkoutId === persistedScheduledWorkoutId
  ) {
    return state;
  }

  return {
    ...state,
    scheduledWorkouts: state.scheduledWorkouts.map((workout) =>
      workout.id === optimisticScheduledWorkoutId
        ? {
            ...workout,
            id: persistedScheduledWorkoutId,
          }
        : workout,
    ),
    sessions: state.sessions.map((session) =>
      session.scheduledWorkoutId === optimisticScheduledWorkoutId
        ? {
            ...session,
            scheduledWorkoutId: persistedScheduledWorkoutId,
            setLogs: session.setLogs.map((log) => ({
              ...log,
              scheduledWorkoutId: persistedScheduledWorkoutId,
            })),
          }
        : session,
    ),
    conversationEntries: state.conversationEntries.map((entry) =>
      entry.contextType === "workout" && entry.contextId === optimisticScheduledWorkoutId
        ? {
            ...entry,
            contextId: persistedScheduledWorkoutId,
          }
        : entry,
    ),
  };
}

function clearOptimisticWorkoutArtifacts(state: AppState, scheduledWorkoutId: string): AppState {
  const sessionIds = new Set(
    state.sessions
      .filter(
        (session) =>
          session.scheduledWorkoutId === scheduledWorkoutId ||
          (session.id.startsWith("session_") && session.scheduledWorkoutId.startsWith("workout_")),
      )
      .map((session) => session.id),
  );

  return {
    ...state,
    scheduledWorkouts: state.scheduledWorkouts.filter(
      (workout) => workout.id !== scheduledWorkoutId && !(workout.id.startsWith("workout_") && workout.status !== "completed"),
    ),
    sessions: state.sessions.filter(
      (session) => session.scheduledWorkoutId !== scheduledWorkoutId && !sessionIds.has(session.id),
    ),
    notes: state.notes.filter((note) => !sessionIds.has(note.sessionId)),
  };
}

function hasOpenActiveWorkout(state: AppState, athleteId: string | null | undefined) {
  if (!athleteId) {
    return false;
  }

  return state.scheduledWorkouts.some(
    (workout) => workout.athleteId === athleteId && workout.status === "in_progress",
  );
}

export function applyPartialUserMeasurementUpdate(
  previous: AppState,
  userId: string,
  input: UserMeasurementInput,
  timestamp: string,
) {
  const currentUser = previous.users.find((user) => user.id === userId);
  if (!currentUser) {
    return previous;
  }

  const hasHeightInput = Object.prototype.hasOwnProperty.call(input, "heightCm");
  const hasWeightInput = Object.prototype.hasOwnProperty.call(input, "weightKg");
  const hasWaistInput = Object.prototype.hasOwnProperty.call(input, "waistCm");
  const heightCm = hasHeightInput ? input.heightCm : currentUser.heightCm;
  const weightKg = hasWeightInput ? input.weightKg : currentUser.weightKg;
  const waistCm = hasWaistInput ? input.waistCm : currentUser.waistCm;
  const hasRecordedMetric = hasHeightInput || hasWeightInput || hasWaistInput;

  return {
    ...previous,
    bodyMeasurements: hasRecordedMetric
      ? [
          {
            id: makeId("measurement"),
            userId,
            heightCm: hasHeightInput ? heightCm : undefined,
            weightKg: hasWeightInput ? weightKg : undefined,
            waistCm: hasWaistInput ? waistCm : undefined,
            measuredAt: timestamp,
            createdAt: timestamp,
          },
          ...previous.bodyMeasurements,
        ]
      : previous.bodyMeasurements,
    users: previous.users.map((user) =>
      user.id === userId
        ? {
            ...user,
            heightCm,
            weightKg,
            waistCm,
            updatedAt: timestamp,
          }
        : user,
    ),
  };
}

function defaultUserSettings(role: Role) {
  return {
    defaultDashboardView: getDefaultDashboardView(role),
    emailNotifications: false,
    themeMode: "light" as const,
    loadIncrementKg: 2.5 as const,
  };
}

function normalizeUserSettings(role: Role, rawSettings: UserProfile["settings"] | undefined) {
  const defaults = defaultUserSettings(role);
  return {
    emailNotifications: rawSettings?.emailNotifications ?? defaults.emailNotifications,
    defaultDashboardView: normalizeDefaultDashboardView(role, rawSettings?.defaultDashboardView),
    themeMode: rawSettings?.themeMode ?? defaults.themeMode,
    loadIncrementKg:
      rawSettings?.loadIncrementKg === 1 || rawSettings?.loadIncrementKg === 2.5 || rawSettings?.loadIncrementKg === 5
        ? rawSettings.loadIncrementKg
        : defaults.loadIncrementKg,
  };
}

function canManageProgramTarget(state: AppState, actor: UserProfile, athleteId: string) {
  const resolvedAthlete =
    resolveSelectedUserFromState(state, athleteId) ??
    state.users.find((user) => user.id === athleteId) ??
    null;
  const resolvedAthleteId = resolvedAthlete?.id ?? athleteId;

  if (resolvedAthleteId === actor.id) {
    return true;
  }

  if (isAdminRole(actor.role)) {
    return state.users.some((user) => user.id === resolvedAthleteId && user.role === "athlete");
  }

  if (canActAsCoach(actor.role)) {
    return canCoachManageAthlete(state, actor.id, resolvedAthleteId);
  }

  return false;
}

export function canDeleteProgramFromState(state: AppState, programId: string) {
  return !state.scheduledWorkouts.some((workout) => workout.trainingPlanId === programId);
}

export function canRetargetProgramInState(state: AppState, programId: string) {
  return !state.scheduledWorkouts.some((workout) => workout.trainingPlanId === programId);
}

export function applyProgramStatusUpdate(
  state: AppState,
  programId: string,
  nextStatus: "active" | "archived",
) {
  const targetProgram = state.plans.find((plan) => plan.id === programId);
  if (!targetProgram) {
    return state;
  }

  return {
    ...state,
    plans: state.plans.map((plan) => {
      if (plan.id === programId) {
        return { ...plan, status: nextStatus };
      }

      if (nextStatus === "active" && plan.athleteId === targetProgram.athleteId) {
        return { ...plan, status: "archived" as const };
      }

      return plan;
    }),
  };
}

export function applyProgramDeletion(state: AppState, programId: string) {
  return {
    ...state,
    plans: state.plans.filter((plan) => plan.id !== programId),
  };
}

export function resolvePrimaryCoachIdForAthlete(state: AppState, athleteId: string) {
  return (
    state.assignments.find((assignment) => assignment.athleteId === athleteId && assignment.active)?.coachId ??
    state.scheduledWorkouts.find((workout) => workout.athleteId === athleteId)?.coachId ??
    state.plans.find((plan) => plan.athleteId === athleteId)?.coachId
  );
}

export function resolveBlockingWorkoutStart(
  state: AppState,
  athleteId: string,
  programWorkoutId?: string,
) {
  const scheduledWorkoutIdsWithSession = new Set(state.sessions.map((session) => session.scheduledWorkoutId));

  return (
    state.scheduledWorkouts.find(
      (workout) =>
        workout.athleteId === athleteId &&
        workout.programWorkoutId !== programWorkoutId &&
        (workout.status === "in_progress" ||
          (workout.status === "cancelled" && scheduledWorkoutIdsWithSession.has(workout.id))),
    ) ?? null
  );
}

function inferSplitTypeFromTitle(title: string) {
  const normalized = title.toLowerCase();
  if (normalized.includes("ylä")) return "upper" as const;
  if (normalized.includes("ala") || normalized.includes("voimapäivä")) return "lower" as const;
  if (normalized.includes("koko")) return "full_body" as const;
  return "custom" as const;
}

type LegacyWorkoutComment = {
  id: string;
  athleteId: string;
  coachId: string;
  authorUserId: string;
  authorRole: Role;
  body: string;
  scheduledWorkoutId?: string;
  createdAt: string;
};

function displayWorkoutTitle(title: string) {
  return normalizeWorkoutHistoryTitle(title);
}

function normalizeWorkoutConversationBody(body: string, title: string) {
  const normalizedTitle = displayWorkoutTitle(title);
  if (!body.includes('"')) {
    return body;
  }

  return body.replace(/"[^"]+"/, `"${normalizedTitle}"`);
}

function normalizeConversationEntries(raw: AppState & { workoutComments?: LegacyWorkoutComment[] }) {
  const legacyComments: ConversationEntry[] = (raw.workoutComments ?? []).map((comment) => ({
    id: comment.id,
    athleteId: comment.athleteId,
    coachId: comment.coachId,
    authorUserId: comment.authorUserId,
    authorRole: comment.authorRole,
    type: "comment",
    body: comment.body,
    contextType: comment.scheduledWorkoutId ? "workout" : "general",
    contextId: comment.scheduledWorkoutId,
    createdAt: comment.createdAt,
    readByUserIds: [comment.authorUserId],
  }));

  const mergedEntries = [...(raw.conversationEntries ?? []), ...legacyComments].filter(
    (entry): entry is ConversationEntry =>
      Boolean(entry.id) &&
      Boolean(entry.athleteId) &&
      Boolean(entry.coachId) &&
      Boolean(entry.authorUserId) &&
      Boolean(entry.authorRole) &&
      entry.type === "comment" &&
      Boolean(entry.body) &&
      Boolean(entry.contextType) &&
      Boolean(entry.createdAt) &&
      Array.isArray(entry.readByUserIds),
  );

  const dedupedEntries = new Map<string, (typeof mergedEntries)[number]>();
  mergedEntries.forEach((entry) => {
    if (!dedupedEntries.has(entry.id)) {
      dedupedEntries.set(entry.id, {
        ...entry,
        body:
          entry.contextType === "workout" && entry.contextLabel
            ? normalizeWorkoutConversationBody(entry.body, entry.contextLabel)
            : entry.body,
        contextLabel:
          entry.contextType === "workout" && entry.contextLabel
            ? displayWorkoutTitle(entry.contextLabel)
            : entry.contextLabel,
      });
    }
  });

  return Array.from(dedupedEntries.values());
}

function buildConversationEntry(input: {
  athleteId: string;
  coachId: string;
  authorUserId: string;
  authorRole: Role;
  type: ConversationEntryType;
  body: string;
  contextType: ConversationEntry["contextType"];
  contextId?: string;
  contextLabel?: string;
  createdAt?: string;
  readByUserIds?: string[];
}): ConversationEntry {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const entryId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : makeId("conversation");
  return {
    id: entryId,
    athleteId: input.athleteId,
    coachId: input.coachId,
    authorUserId: input.authorUserId,
    authorRole: input.authorRole,
    type: input.type,
    body: input.body,
    contextType: input.contextType,
    contextId: input.contextId,
    contextLabel: input.contextLabel,
    createdAt,
    readByUserIds: Array.from(new Set([...(input.readByUserIds ?? []), input.authorUserId])),
  };
}

function normalizeState(raw: AppState): AppState {
  const normalizedBodyMeasurements = (raw.bodyMeasurements ?? []).filter(
    (entry) =>
      Boolean(entry.id) &&
      Boolean(entry.userId) &&
      Boolean(entry.measuredAt) &&
      Boolean(entry.createdAt) &&
      (typeof entry.heightCm === "number" ||
        typeof entry.weightKg === "number" ||
        typeof entry.waistCm === "number"),
  );
  const latestHeightByUserId = new Map<string, number>();
  const latestWeightByUserId = new Map<string, number>();
  const latestWaistByUserId = new Map<string, number>();
  normalizedBodyMeasurements
    .slice()
    .sort((a, b) => new Date(b.measuredAt).getTime() - new Date(a.measuredAt).getTime())
    .forEach((entry) => {
      if (typeof entry.heightCm === "number" && !latestHeightByUserId.has(entry.userId)) {
        latestHeightByUserId.set(entry.userId, entry.heightCm);
      }
      if (typeof entry.weightKg === "number" && !latestWeightByUserId.has(entry.userId)) {
        latestWeightByUserId.set(entry.userId, entry.weightKg);
      }
      if (typeof entry.waistCm === "number" && !latestWaistByUserId.has(entry.userId)) {
        latestWaistByUserId.set(entry.userId, entry.waistCm);
      }
    });
  const normalizedUsers = raw.users.map((user) => ({
    ...user,
    heightCm:
      typeof user.heightCm === "number"
        ? user.heightCm
        : latestHeightByUserId.get(user.id),
    weightKg:
      typeof user.weightKg === "number"
        ? user.weightKg
        : latestWeightByUserId.get(user.id),
    waistCm:
      typeof user.waistCm === "number"
        ? user.waistCm
        : latestWaistByUserId.get(user.id),
    settings: normalizeUserSettings(user.role, user.settings),
  }));
  const normalizedExercises = raw.exercises.map((exercise) => ({
    ...exercise,
    scope: exercise.scope ?? "global",
  }));
  const mergedExerciseById = new Map(defaultGlobalExercises.map((exercise) => [exercise.id, exercise]));
  normalizedExercises.forEach((exercise) => {
    mergedExerciseById.set(exercise.id, exercise);
  });

  return {
    ...raw,
    bodyMeasurements: normalizedBodyMeasurements,
    users: normalizedUsers,
    exercises: Array.from(mergedExerciseById.values()),
    passwordResetRequests: (raw.passwordResetRequests ?? []).filter(
      (request) =>
        Boolean(request.id) &&
        Boolean(request.userId) &&
        Boolean(request.email) &&
        Boolean(request.tokenHash) &&
        Boolean(request.createdAt) &&
        Boolean(request.expiresAt),
    ),
    scheduledWorkouts: raw.scheduledWorkouts.map((workout) => {
      const status = workout.status as unknown as string;
      if (!["in_progress", "completed", "cancelled"].includes(status)) {
        return { ...workout, status: "cancelled" as const };
      }

      return workout;
    }),
    plans: raw.plans.map((plan) => ({
      ...plan,
      status: getProgramStatus(plan),
      workouts: plan.workouts?.map((workout, workoutIndex) => ({
        ...workout,
        name: workout.name || `Harjoitus ${workoutIndex + 1}`,
        defaultRestSeconds: workout.defaultRestSeconds ?? 90,
        exercises: (workout.exercises ?? []).map((exercise, exerciseIndex) => ({
          ...exercise,
          exerciseName: exercise.exerciseName || `Liike ${exerciseIndex + 1}`,
        })),
      })),
    })),
    templates: raw.templates.map((template) => ({
      ...template,
      splitType: template.splitType ?? inferSplitTypeFromTitle(template.title),
    })),
    conversationEntries: normalizeConversationEntries(raw as AppState & { workoutComments?: LegacyWorkoutComment[] }),
  };
}

type LoginResult =
  | { ok: true; message?: string }
  | { ok: false; message: string };

type ActionResult =
  | { ok: true; scheduledWorkoutId?: string }
  | { ok: false; message: string };

type CreateProgramResult =
  | { ok: true; programId?: string }
  | { ok: false; message: string };

type WorkoutSetRequestState = {
  revision: number;
  patch: WorkoutUpdateInput;
};

type PasswordResetRequestResult =
  | { ok: true; message: string; previewUrl?: string }
  | { ok: false; message: string };

type PublicPasswordResetRequestInput = {
  email: string;
  captchaToken?: string;
};

const PUBLIC_PASSWORD_RESET_RESPONSE =
  "Jos sähköpostiosoite löytyy järjestelmästä, lähetämme salasanan nollauslinkin hetken kuluttua.";

type UserSettingsInput = {
  fullName: string;
  defaultDashboardView: DashboardHomeView;
  emailNotifications: boolean;
  themeMode: "light" | "dark";
  loadIncrementKg: 1 | 2.5 | 5;
};

type UserMeasurementInput = {
  heightCm?: number;
  weightKg?: number;
  waistCm?: number;
};

const CUSTOM_EXERCISE_VALUE = "__custom__";

function removeUserFromState(previous: AppState, targetUser: UserProfile): AppState {
  const deletedPlanIds = new Set(
    previous.plans
      .filter((plan) => plan.coachId === targetUser.id || plan.athleteId === targetUser.id)
      .map((plan) => plan.id),
  );
  const deletedWorkoutIds = new Set(
    previous.scheduledWorkouts
      .filter(
        (workout) =>
          workout.athleteId === targetUser.id ||
          workout.coachId === targetUser.id ||
          (workout.trainingPlanId ? deletedPlanIds.has(workout.trainingPlanId) : false),
      )
      .map((workout) => workout.id),
  );
  const deletedSessionIds = new Set(
    previous.sessions
      .filter(
        (session) =>
          session.athleteId === targetUser.id || deletedWorkoutIds.has(session.scheduledWorkoutId),
      )
      .map((session) => session.id),
  );

  return {
    ...previous,
    users: previous.users.filter((user) => user.id !== targetUser.id),
    assignments: previous.assignments.filter(
      (assignment) => assignment.coachId !== targetUser.id && assignment.athleteId !== targetUser.id,
    ),
    templates: previous.templates.filter((template) => template.coachId !== targetUser.id),
    plans: previous.plans.filter(
      (plan) => plan.coachId !== targetUser.id && plan.athleteId !== targetUser.id,
    ),
    scheduledWorkouts: previous.scheduledWorkouts.filter(
      (workout) => !deletedWorkoutIds.has(workout.id),
    ),
    sessions: previous.sessions.filter((session) => !deletedSessionIds.has(session.id)),
    notes: previous.notes.filter(
      (note) =>
        note.athleteId !== targetUser.id &&
        note.coachId !== targetUser.id &&
        !deletedSessionIds.has(note.sessionId),
    ),
    conversationEntries: previous.conversationEntries.filter(
      (entry) =>
        entry.athleteId !== targetUser.id &&
        entry.coachId !== targetUser.id &&
        entry.authorUserId !== targetUser.id,
    ),
    invites: previous.invites.filter(
      (invite) =>
        invite.invitedBy !== targetUser.id &&
        invite.coachId !== targetUser.id &&
        invite.email.toLowerCase() !== targetUser.email.toLowerCase(),
    ),
    passwordResetRequests: previous.passwordResetRequests.filter(
      (request) => request.userId !== targetUser.id && request.requestedByUserId !== targetUser.id,
    ),
  };
}

function parsePersistedSession(rawSession: string | null): PersistedSession {
  if (!rawSession) {
    return { authenticatedUserId: null, impersonatedUserId: null };
  }

  try {
    const parsed = JSON.parse(rawSession) as Partial<PersistedSession>;
    if (typeof parsed.authenticatedUserId === "string" || parsed.authenticatedUserId === null) {
      return {
        authenticatedUserId: parsed.authenticatedUserId ?? null,
        impersonatedUserId:
          typeof parsed.impersonatedUserId === "string" ? parsed.impersonatedUserId : null,
      };
    }
  } catch {
    // Backward compatibility for legacy payload where only user id was stored as a plain string.
  }

  return { authenticatedUserId: rawSession, impersonatedUserId: null };
}

export function shouldPreserveStoredSessionDuringSupabaseBootstrap(
  source: SupabaseAuthSyncSource,
  persistedAuthenticatedUserId: string | null,
  hasResolvedAuthUser = false,
) {
  return Boolean(persistedAuthenticatedUserId) && source === "event" && !hasResolvedAuthUser;
}

export function shouldSyncSupabaseAuthEvent(event: SupabaseAuthEvent) {
  return event !== "INITIAL_SESSION";
}

export function shouldRevalidateSupabaseSessionBeforeClearingAuth(
  source: SupabaseAuthSyncSource,
  persistedAuthenticatedUserId: string | null,
  hasResolvedAuthUser = false,
) {
  if (!persistedAuthenticatedUserId) {
    return false;
  }

  if (source === "bootstrap") {
    return true;
  }

  return source === "event" && hasResolvedAuthUser;
}

export function shouldPreserveStoredSessionOnTransientSupabaseNullEvent(
  source: SupabaseAuthSyncSource,
  persistedAuthenticatedUserId: string | null,
) {
  return source === "event" && Boolean(persistedAuthenticatedUserId);
}

export function shouldCreateFreshInviteOnResendFailure(message: string | undefined) {
  return message === "Kutsua ei löytynyt.";
}

export function shouldTreatInviteActivationLoginFailureAsPartialSuccess(message: string | undefined) {
  return Boolean(message && message.toLowerCase().includes("captcha"));
}

function resolveProgramWorkouts(
  workouts: ProgramBuilderInput["workouts"],
  exercises: Exercise[],
  coachId: string,
) {
  const nextExercises: Exercise[] = [];
  const normalized = workouts.map((workout) => ({
    ...workout,
    exercises: workout.exercises.map((exercise) => {
      if (exercise.exerciseId && exercise.exerciseId !== CUSTOM_EXERCISE_VALUE) {
        const source = exercises.find((item) => item.id === exercise.exerciseId);
        const nickname = exercise.exerciseNameOverride?.trim();
        return {
          ...exercise,
          exerciseNameOverride: nickname || undefined,
          customExerciseName: undefined,
          exerciseName: nickname || source?.name || exercise.exerciseName || "Liike",
        };
      }

      const customName = exercise.customExerciseName?.trim();
      const source = customName
        ? exercises.find(
            (item) =>
              item.scope === "coach_custom" &&
              item.coachId === coachId &&
              item.name.toLowerCase() === customName.toLowerCase(),
          ) ??
          nextExercises.find(
            (item) =>
              item.scope === "coach_custom" &&
              item.coachId === coachId &&
              item.name.toLowerCase() === customName.toLowerCase(),
          )
        : undefined;

      if (source) {
        return {
          ...exercise,
          exerciseNameOverride: undefined,
          exerciseId: source.id,
          exerciseName: source.name,
        };
      }

      const customExercise: Exercise = {
        id: makeId("ex_custom"),
        name: customName || exercise.exerciseName || "Custom-liike",
        category: "Custom",
        equipment: "Valmentajan määrittämä",
        cue: "Muokkaa liikkeen ohje valmennukseen sopivaksi.",
        scope: "coach_custom",
        coachId,
      };

      nextExercises.push(customExercise);

      return {
        ...exercise,
        exerciseNameOverride: undefined,
        exerciseId: customExercise.id,
        exerciseName: customExercise.name,
      };
    }),
  }));

  return { workouts: normalized, customExercises: nextExercises };
}

function appendConversationEntry(state: AppState, entry: ConversationEntry) {
  return {
    ...state,
    conversationEntries: [entry, ...state.conversationEntries],
  };
}

function removeConversationEntry(state: AppState, entryId: string) {
  return {
    ...state,
    conversationEntries: state.conversationEntries.filter((entry) => entry.id !== entryId),
  };
}

async function persistConversationEntry(
  supabase: NonNullable<ReturnType<typeof createSupabaseBrowserClient>>,
  entry: ConversationEntry,
) {
  const payload = {
    id: entry.id,
    athlete_id: entry.athleteId,
    coach_id: entry.coachId,
    author_user_id: entry.authorUserId,
    author_role: entry.authorRole,
    type: entry.type,
    body: entry.body,
    context_type: entry.contextType,
    context_id: entry.contextId ?? null,
    context_label: entry.contextLabel ?? null,
    read_by_user_ids: entry.readByUserIds,
    created_at: entry.createdAt,
  };

  const { error } = await supabase.from("conversation_entries").insert(payload);
  if (error) {
    throw error;
  }
}

type SupabaseProfileRecord = {
  id: string;
  role: Role;
  status: UserProfile["status"];
  full_name: string;
  email: string;
  default_dashboard_view: DashboardHomeView | null;
  email_notifications: boolean;
  theme_mode: "light" | "dark";
  load_increment_kg: 1 | 2.5 | 5 | null;
  height_cm: number | null;
  weight_kg: number | null;
  waist_cm: number | null;
  created_at: string;
  updated_at: string;
};

function isLocalDevelopmentHost() {
  if (typeof window === "undefined") {
    return false;
  }

  const hostname = window.location.hostname;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".local")
  );
}

function createEmptyAppState(): AppState {
  return {
    users: [],
    bodyMeasurements: [],
    assignments: [],
    exercises: defaultGlobalExercises,
    templates: [],
    plans: [],
    scheduledWorkouts: [],
    sessions: [],
    notes: [],
    conversationEntries: [],
    invites: [],
    passwordResetRequests: [],
  };
}

function createInitialAppState() {
  return normalizeState(isLocalDevelopmentHost() ? cloneDemoState() : createEmptyAppState());
}

function mapSupabaseProfileToUser(profile: SupabaseProfileRecord): UserProfile {
  return {
    id: profile.id,
    role: profile.role,
    fullName: profile.full_name,
    email: profile.email,
    status: profile.status,
    heightCm: profile.height_cm ?? undefined,
    weightKg: profile.weight_kg ?? undefined,
    waistCm: profile.waist_cm ?? undefined,
    settings: {
      defaultDashboardView: normalizeDefaultDashboardView(profile.role, profile.default_dashboard_view ?? undefined),
      emailNotifications: profile.email_notifications,
      themeMode: profile.theme_mode,
      loadIncrementKg: profile.load_increment_kg ?? 2.5,
    },
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
  };
}

function replaceUserIdReferences(previous: AppState, sourceUserId: string, targetUserId: string, nextUser: UserProfile) {
  if (sourceUserId === targetUserId) {
    return {
      ...previous,
      users: previous.users.map((user) =>
        user.id === sourceUserId
          ? {
              ...user,
              ...nextUser,
              settings: normalizeUserSettings(nextUser.role, nextUser.settings),
            }
          : user,
      ),
    };
  }

  return {
    ...previous,
    users: [
      ...previous.users
        .filter((user) => user.id !== sourceUserId && user.id !== targetUserId),
      {
        ...previous.users.find((user) => user.id === sourceUserId),
        ...nextUser,
        id: targetUserId,
        settings: normalizeUserSettings(nextUser.role, nextUser.settings),
      },
    ],
    bodyMeasurements: previous.bodyMeasurements.map((measurement) =>
      measurement.userId === sourceUserId ? { ...measurement, userId: targetUserId } : measurement,
    ),
    assignments: previous.assignments.map((assignment) => ({
      ...assignment,
      coachId: assignment.coachId === sourceUserId ? targetUserId : assignment.coachId,
      athleteId: assignment.athleteId === sourceUserId ? targetUserId : assignment.athleteId,
    })),
    exercises: previous.exercises.map((exercise) =>
      exercise.coachId === sourceUserId ? { ...exercise, coachId: targetUserId } : exercise,
    ),
    templates: previous.templates.map((template) => ({
      ...template,
      coachId: template.coachId === sourceUserId ? targetUserId : template.coachId,
      createdBy: template.createdBy === sourceUserId ? targetUserId : template.createdBy,
      updatedBy: template.updatedBy === sourceUserId ? targetUserId : template.updatedBy,
    })),
    plans: previous.plans.map((plan) => ({
      ...plan,
      coachId: plan.coachId === sourceUserId ? targetUserId : plan.coachId,
      athleteId: plan.athleteId === sourceUserId ? targetUserId : plan.athleteId,
    })),
    scheduledWorkouts: previous.scheduledWorkouts.map((workout) => ({
      ...workout,
      coachId: workout.coachId === sourceUserId ? targetUserId : workout.coachId,
      athleteId: workout.athleteId === sourceUserId ? targetUserId : workout.athleteId,
    })),
    sessions: previous.sessions.map((session) =>
      session.athleteId === sourceUserId ? { ...session, athleteId: targetUserId } : session,
    ),
    notes: previous.notes.map((note) => ({
      ...note,
      athleteId: note.athleteId === sourceUserId ? targetUserId : note.athleteId,
      coachId: note.coachId === sourceUserId ? targetUserId : note.coachId,
    })),
    conversationEntries: previous.conversationEntries.map((entry) => ({
      ...entry,
      athleteId: entry.athleteId === sourceUserId ? targetUserId : entry.athleteId,
      coachId: entry.coachId === sourceUserId ? targetUserId : entry.coachId,
      authorUserId: entry.authorUserId === sourceUserId ? targetUserId : entry.authorUserId,
      readByUserIds: entry.readByUserIds.map((userId) => (userId === sourceUserId ? targetUserId : userId)),
    })),
    invites: previous.invites.map((invite) => ({
      ...invite,
      invitedBy: invite.invitedBy === sourceUserId ? targetUserId : invite.invitedBy,
      coachId: invite.coachId === sourceUserId ? targetUserId : invite.coachId,
    })),
    passwordResetRequests: previous.passwordResetRequests.map((request) => ({
      ...request,
      userId: request.userId === sourceUserId ? targetUserId : request.userId,
      requestedByUserId:
        request.requestedByUserId === sourceUserId ? targetUserId : request.requestedByUserId,
    })),
  };
}

export function resolveSupabaseUserForState(
  previous: AppState,
  authUser: SupabaseAuthUser,
  profile: SupabaseProfileRecord | null,
) {
  const authEmail = authUser.email?.toLowerCase();
  const existingUser = authEmail
    ? previous.users.find((candidate) => candidate.email.toLowerCase() === authEmail) ?? null
    : null;

  if (profile) {
    const mappedUser = mapSupabaseProfileToUser(profile);
    if (existingUser) {
      return {
        nextState: replaceUserIdReferences(previous, existingUser.id, mappedUser.id, mappedUser),
        resolvedUserId: mappedUser.id,
      };
    }

    return {
      nextState: {
        ...previous,
        users: [mappedUser, ...previous.users],
      },
      resolvedUserId: mappedUser.id,
    };
  }

  if (existingUser) {
    return {
      nextState: previous,
      resolvedUserId: existingUser.id,
    };
  }

  return {
    nextState: previous,
    resolvedUserId: null,
  };
}

export async function fetchSupabaseVisibleStateSnapshotWithClient(
  supabase: NonNullable<ReturnType<typeof createSupabaseBrowserClient>> | null,
  options?: { lite?: boolean; accessToken?: string; throwOnError?: boolean },
) {
  if (!supabase) {
    return null;
  }

  try {
    const accessToken = options?.accessToken ? options.accessToken : (await supabase.auth.getSession()).data.session?.access_token;
    const searchParams = new URLSearchParams();
    if (options?.lite) {
      searchParams.set("lite", "1");
    }
    const requestPath = searchParams.size > 0 ? `/api/app-state?${searchParams.toString()}` : "/api/app-state";
    const response = await withTimeout(
      fetch(requestPath, {
        headers: accessToken
          ? {
              Authorization: `Bearer ${accessToken}`,
            }
          : undefined,
      }),
      8000,
      null as Response | null,
    );
    if (!response) {
      return null;
    }
    const payload = (await response.json().catch(() => null)) as SupabaseVisibleAppStateSnapshot | { message?: string } | null;
    if (!response.ok || !payload || !("users" in payload)) {
      if (payload && "message" in payload && typeof payload.message === "string") {
        if (options?.throwOnError) {
          throw new Error(payload.message);
        }
        return null;
      }
      return null;
    }

    return payload;
  } catch (error) {
    if (options?.throwOnError) {
      throw error;
    }
    return null;
  }
}

type SupabaseInviteDirectorySnapshot = {
  invites: Array<{
    id: string;
    token: string;
    email: string;
    role: "coach" | "athlete";
    invitedBy: string;
    coachId?: string | null;
    status: "pending" | "accepted";
    createdAt: string;
    expiresAt: string;
  }>;
  activeEmails: string[];
  activeProfiles?: UserProfile[];
};

type SupabaseVisibleAppStateSnapshot = Pick<
  AppState,
  | "users"
  | "bodyMeasurements"
  | "assignments"
  | "exercises"
  | "templates"
  | "plans"
  | "scheduledWorkouts"
  | "sessions"
  | "notes"
  | "conversationEntries"
>;

export function reconcileSupabaseInviteDirectory(
  previous: AppState,
  snapshot: SupabaseInviteDirectorySnapshot,
) {
  const nextStateFromProfiles = (snapshot.activeProfiles ?? []).reduce((stateAcc, profile) => {
    const existingUser =
      stateAcc.users.find((user) => user.id === profile.id) ??
      stateAcc.users.find((user) => user.email.trim().toLowerCase() === profile.email.trim().toLowerCase());

    if (existingUser) {
      return replaceUserIdReferences(stateAcc, existingUser.id, profile.id, profile);
    }

    return {
      ...stateAcc,
      users: [profile, ...stateAcc.users.filter((user) => user.id !== profile.id)],
    };
  }, previous);

  const activeEmails = new Set(snapshot.activeEmails.map((email) => email.trim().toLowerCase()));
  const serverInvites = snapshot.invites
    .filter((invite) => !activeEmails.has(invite.email.trim().toLowerCase()))
    .map((invite) => ({
      ...invite,
      coachId: invite.coachId ?? undefined,
    }));
  const serverInviteIds = new Set(serverInvites.map((invite) => invite.id));
  const serverInviteEmails = new Set(serverInvites.map((invite) => invite.email.trim().toLowerCase()));

  return {
    ...nextStateFromProfiles,
    users: nextStateFromProfiles.users.map((user): UserProfile =>
      activeEmails.has(user.email.trim().toLowerCase()) && user.status !== "active"
        ? { ...user, status: "active" as const }
        : user,
    ),
    invites: [
      ...serverInvites,
      ...nextStateFromProfiles.invites.filter((invite) => {
        const normalizedEmail = invite.email.trim().toLowerCase();
        if (serverInviteIds.has(invite.id)) {
          return false;
        }
        if (invite.status === "pending" && (activeEmails.has(normalizedEmail) || serverInviteEmails.has(normalizedEmail))) {
          return false;
        }
        return true;
      }),
    ],
  };
}

export function reconcileSupabaseVisibleState(
  previous: AppState,
  snapshot: SupabaseVisibleAppStateSnapshot,
) {
  const withOptimisticWorkouts = preserveActiveWorkoutShells(previous, snapshot);
  const previousScheduledWorkoutsById = new Map(previous.scheduledWorkouts.map((workout) => [workout.id, workout]));
  const previousSessionsById = new Map(previous.sessions.map((session) => [session.id, session]));
  const activeServerEmails = new Set(
    snapshot.users
      .filter((user) => user.status === "active")
      .map((user) => normalizeComparableEmail(user.email)),
  );
  const preservedInvitedEmails = new Set<string>();
  const preservedInvitedUsers = previous.users.filter((user) => {
    if (user.status !== "invited") {
      return false;
    }

    const normalizedEmail = normalizeComparableEmail(user.email);
    if (activeServerEmails.has(normalizedEmail) || preservedInvitedEmails.has(normalizedEmail)) {
      return false;
    }

    const shouldPreserve = !snapshot.users.some(
      (serverUser) =>
        serverUser.id === user.id ||
        normalizeComparableEmail(serverUser.email) === normalizedEmail,
    );

    if (shouldPreserve) {
      preservedInvitedEmails.add(normalizedEmail);
    }

    return shouldPreserve;
  });

  return normalizeState({
    ...previous,
    users: [...snapshot.users, ...preservedInvitedUsers],
    bodyMeasurements: snapshot.bodyMeasurements,
    assignments: snapshot.assignments,
    exercises: snapshot.exercises,
    templates: snapshot.templates,
    plans: snapshot.plans,
    scheduledWorkouts: withOptimisticWorkouts.scheduledWorkouts.map((workout) => {
      const localWorkout = previousScheduledWorkoutsById.get(workout.id);
      if (!localWorkout) {
        return workout;
      }

      const localUpdatedAt = Date.parse(localWorkout.updatedAt);
      const serverUpdatedAt = Date.parse(workout.updatedAt);
      return Number.isFinite(localUpdatedAt) && Number.isFinite(serverUpdatedAt) && localUpdatedAt > serverUpdatedAt
        ? localWorkout
        : workout;
    }),
    sessions: withOptimisticWorkouts.sessions.map((session) => {
      const localSession = previousSessionsById.get(session.id);
      if (!localSession) {
        return session;
      }

      const localUpdatedAt = Date.parse(localSession.updatedAt);
      const serverUpdatedAt = Date.parse(session.updatedAt);
      return Number.isFinite(localUpdatedAt) && Number.isFinite(serverUpdatedAt) && localUpdatedAt > serverUpdatedAt
        ? localSession
        : session;
    }),
    notes: snapshot.notes,
    conversationEntries: snapshot.conversationEntries,
  });
}

function findUserByIdOrEmail(previous: AppState, userId: string, email?: string) {
  return (
    previous.users.find((user) => user.id === userId) ??
    (email ? previous.users.find((user) => normalizeComparableEmail(user.email) === normalizeComparableEmail(email)) : undefined) ??
    null
  );
}

export function resolveSelectedUserFromState(previous: AppState, userId: string | null) {
  if (!userId) {
    return null;
  }

  const exactUser = previous.users.find((user) => user.id === userId) ?? null;
  if (!exactUser) {
    return null;
  }

  const normalizedEmail = normalizeComparableEmail(exactUser.email);
  const activeUserWithSameEmail =
    normalizedEmail && exactUser.status !== "active"
      ? previous.users.find(
          (user) =>
            user.id !== exactUser.id &&
            user.status === "active" &&
            normalizeComparableEmail(user.email) === normalizedEmail,
        ) ?? null
      : null;

  return activeUserWithSameEmail ?? exactUser;
}

function resolveProgramTargetFromState(previous: AppState, athleteId: string) {
  return resolveSelectedUserFromState(previous, athleteId) ?? previous.users.find((user) => user.id === athleteId) ?? null;
}

function findResolvedSnapshotUserIdForLocalUser(
  previous: AppState,
  snapshot: SupabaseVisibleAppStateSnapshot,
  localUserId: string | null,
) {
  if (!localUserId) {
    return null;
  }

  const localUser = previous.users.find((user) => user.id === localUserId) ?? null;
  if (!localUser) {
    return snapshot.users.find((user) => user.id === localUserId)?.id ?? null;
  }

  const normalizedEmail = normalizeComparableEmail(localUser.email);
  return (
    snapshot.users.find((user) => user.id === localUserId)?.id ??
    snapshot.users.find((user) => normalizeComparableEmail(user.email) === normalizedEmail)?.id ??
    null
  );
}

function applyResolvedUserId(previous: AppState, userId: string, resolvedUserId: string, email?: string) {
  const targetUser = findUserByIdOrEmail(previous, userId, email);
  if (!targetUser) {
    return previous;
  }

  return replaceUserIdReferences(previous, targetUser.id, resolvedUserId, {
    ...targetUser,
    id: resolvedUserId,
    settings: normalizeUserSettings(targetUser.role, targetUser.settings),
  });
}

export function applyAdminRoleUpdate(
  previous: AppState,
  userId: string,
  resolvedUserId: string,
  email: string | undefined,
  role: Role,
  updatedAt: string,
) {
  const withResolvedId = applyResolvedUserId(previous, userId, resolvedUserId, email);
  const targetUser = findUserByIdOrEmail(withResolvedId, resolvedUserId, email);
  if (!targetUser) {
    return withResolvedId;
  }

  return {
    ...withResolvedId,
    users: withResolvedId.users.map((user) =>
      user.id === targetUser.id
        ? {
            ...user,
            role,
            updatedAt,
            settings: normalizeUserSettings(role, user.settings),
          }
        : user,
    ),
    assignments: withResolvedId.assignments.filter((assignment) => {
      if (role === "admin") {
        return assignment.coachId !== targetUser.id && assignment.athleteId !== targetUser.id;
      }

      if (role === "coach") {
        return assignment.athleteId !== targetUser.id;
      }

      return assignment.coachId !== targetUser.id;
    }),
  };
}

export function applyAdminCoachAssignmentUpdate(
  previous: AppState,
  athleteId: string,
  resolvedAthleteId: string,
  athleteEmail: string | undefined,
  coachIds: string[],
  createdAt: string,
  updatedInviteCoachId?: string,
) {
  const withResolvedId = applyResolvedUserId(previous, athleteId, resolvedAthleteId, athleteEmail);
  const athlete = findUserByIdOrEmail(withResolvedId, resolvedAthleteId, athleteEmail);
  if (!athlete) {
    return withResolvedId;
  }

  return {
    ...withResolvedId,
    assignments: [
      ...withResolvedId.assignments.filter(
        (assignment) => !(assignment.athleteId === athlete.id && assignment.active),
      ),
      ...coachIds.map((coachId) => ({
        id: makeId("assignment"),
        coachId,
        athleteId: athlete.id,
        active: true,
        createdAt,
      })),
    ],
    invites: withResolvedId.invites.map((invite) =>
      invite.role === "athlete" &&
      invite.email.toLowerCase() === athlete.email.toLowerCase() &&
      invite.status === "pending"
        ? { ...invite, coachId: updatedInviteCoachId ?? coachIds[0] }
        : invite,
    ),
  };
}

async function fetchSupabaseProfile(supabase: NonNullable<ReturnType<typeof createSupabaseBrowserClient>>, userId: string) {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, role, status, full_name, email, default_dashboard_view, email_notifications, theme_mode, load_increment_kg, height_cm, weight_kg, waist_cm, created_at, updated_at",
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data as SupabaseProfileRecord | null;
}

async function fetchSupabaseProfileWithRetry(
  supabase: NonNullable<ReturnType<typeof createSupabaseBrowserClient>>,
  userId: string,
  attempts = 3,
  delayMs = 250,
) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const profile = await fetchSupabaseProfile(supabase, userId);
    if (profile) {
      return profile;
    }

    if (attempt < attempts - 1) {
      await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    }
  }

  return null;
}

async function confirmCurrentSupabaseAuthUser(
  supabase: NonNullable<ReturnType<typeof createSupabaseBrowserClient>>,
) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.user) {
    return session.user;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ?? null;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return await new Promise<T>((resolve) => {
    const timeoutId = window.setTimeout(() => resolve(fallback), timeoutMs);
    promise
      .then((value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch(() => {
        window.clearTimeout(timeoutId);
        resolve(fallback);
      });
  });
}

async function waitForNextPaint(frameCount = 1) {
  if (typeof window === "undefined") {
    return;
  }

  for (let index = 0; index < frameCount; index += 1) {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  }
}

async function waitForDelay(delayMs: number) {
  await new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

export async function resolveSupabaseAuthUserAfterPasswordSignIn({
  initialUser,
  confirmUser,
  attempts = 4,
  waitForNextPaintFn = waitForNextPaint,
  waitForDelayFn = waitForDelay,
}: {
  initialUser: SupabaseAuthUser | null;
  confirmUser: () => Promise<SupabaseAuthUser | null>;
  attempts?: number;
  waitForNextPaintFn?: (frameCount?: number) => Promise<void>;
  waitForDelayFn?: (delayMs: number) => Promise<void>;
}) {
  let authUser = initialUser;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (authUser?.email) {
      return authUser;
    }

    authUser = await confirmUser();
    if (authUser?.email) {
      return authUser;
    }

    if (attempt < attempts - 1) {
      await waitForNextPaintFn(2);
      await waitForDelayFn(180 * (attempt + 1));
    }
  }

  return authUser?.email ? authUser : null;
}

function getSupabaseLoginErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) {
    return "Väärä sähköposti tai salasana.";
  }
  if (normalized.includes("email not confirmed")) {
    return "Sähköpostiosoite täytyy vahvistaa ennen kirjautumista.";
  }
  if (normalized.includes("captcha")) {
    if (normalized.includes("failed")) {
      return "Captcha-tarkistus epäonnistui. Tarkista hCaptcha-asetukset ja yritä uudelleen.";
    }
    if (normalized.includes("missing")) {
      return "Captcha-token puuttuu. Vahvista captcha uudelleen.";
    }
    return `Captcha esti kirjautumisen: ${message}`;
  }
  return `Kirjautuminen epäonnistui: ${message}`;
}

function isConversationVisibleToUser(state: AppState, entry: ConversationEntry, user: UserProfile) {
  if (isAdminRole(user.role)) {
    return true;
  }

  if (user.role === "athlete") {
    return entry.athleteId === user.id;
  }

  if (canActAsCoach(user.role)) {
    return canCoachManageAthlete(state, user.id, entry.athleteId);
  }

  return false;
}

interface AppStateContextValue {
  state: AppState;
  authenticatedUser: UserProfile | null;
  currentUser: UserProfile | null;
  hasAuthenticatedSession: boolean;
  currentRole: Role | null;
  isImpersonating: boolean;
  isHydrated: boolean;
  notify: (input: { tone: "success" | "danger" | "info"; message: string }) => void;
  login: (email: string, password: string, options?: { captchaToken?: string }) => Promise<LoginResult>;
  logout: () => Promise<void>;
  loginAsDemoUser: (userId: string) => void;
  startAdminImpersonation: (userId: string) => ActionResult;
  stopAdminImpersonation: () => ActionResult;
  updateCurrentUserSettings: (input: UserSettingsInput) => Promise<ActionResult>;
  updateCurrentUserMeasurements: (input: UserMeasurementInput) => Promise<ActionResult>;
  requestCurrentUserPasswordReset: () => Promise<PasswordResetRequestResult>;
  requestPasswordResetForEmail: (input: PublicPasswordResetRequestInput) => Promise<PasswordResetRequestResult>;
  adminSendPasswordResetEmail: (userId: string) => Promise<PasswordResetRequestResult>;
  adminUpdateUserRole: (userId: string, role: Role) => Promise<ActionResult>;
  adminAssignAthleteCoaches: (athleteId: string, coachIds: string[]) => Promise<ActionResult>;
  completePasswordReset: (token: string, nextPassword: string) => Promise<ActionResult>;
  adminDeleteUser: (userId: string) => Promise<ActionResult>;
  createInvite: (input: InviteInput) => Promise<ActionResult>;
  resendInvite: (inviteId: string) => Promise<ActionResult>;
  acceptInvite: (token: string, fullName: string, password: string, options?: { captchaToken?: string }) => Promise<LoginResult>;
  createProgram: (input: ProgramBuilderInput) => Promise<CreateProgramResult>;
  updateProgram: (programId: string, patch: ProgramUpdateInput) => Promise<ActionResult>;
  setProgramStatus: (programId: string, status: "active" | "archived") => Promise<ActionResult>;
  deleteProgram: (programId: string) => Promise<ActionResult>;
  startProgramWorkout: (programId: string, programWorkoutId: string) => Promise<ActionResult>;
  addConversationComment: (
    body: string,
    options?: { scheduledWorkoutId?: string; trainingPlanId?: string; athleteId?: string; contextLabel?: string },
  ) => Promise<ActionResult>;
  markConversationRead: () => void;
  startWorkout: (scheduledWorkoutId: string) => Promise<ActionResult>;
  updateWorkoutDuration: (scheduledWorkoutId: string, durationSeconds: number) => Promise<ActionResult>;
  updateWorkoutSet: (scheduledWorkoutId: string, logId: string, patch: WorkoutUpdateInput) => Promise<void>;
  saveWorkoutNote: (scheduledWorkoutId: string, body: string) => void;
  completeWorkout: (scheduledWorkoutId: string) => Promise<ActionResult>;
  cancelWorkout: (scheduledWorkoutId: string) => Promise<ActionResult>;
  deleteWorkout: (scheduledWorkoutId: string) => Promise<ActionResult>;
  getCoachAthletes: (coachId: string) => UserProfile[];
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AppState>(() => createInitialAppState());
  const [authenticatedUserId, setAuthenticatedUserId] = useState<string | null>(null);
  const [impersonatedUserId, setImpersonatedUserId] = useState<string | null>(null);
  const [isStorageHydrated, setIsStorageHydrated] = useState(false);
  const [isSupabaseAuthResolved, setIsSupabaseAuthResolved] = useState(false);
  const [didAttemptBootstrapRevalidation, setDidAttemptBootstrapRevalidation] = useState(false);
  const [didBootstrapTimeout, setDidBootstrapTimeout] = useState(false);
  const [toast, setToast] = useState<{ id: number; tone: "success" | "danger" | "info"; message: string } | null>(null);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const refreshSupabaseVisibleStatePromiseRef = useRef<Promise<boolean> | null>(null);
  const workoutSetRequestStateRef = useRef<Map<string, WorkoutSetRequestState>>(new Map());
  const isHydrated =
    isStorageHydrated && (supabase ? (isSupabaseAuthResolved && didAttemptBootstrapRevalidation) || didBootstrapTimeout : true);
  const notify = useCallback((input: { tone: "success" | "danger" | "info"; message: string }) => {
    setToast({
      id: Date.now(),
      tone: input.tone,
      message: input.message,
    });
  }, []);

  useEffect(() => {
    const rawState = window.localStorage.getItem(STATE_KEY);
    const rawSession = window.localStorage.getItem(SESSION_KEY);

    if (rawState) {
      try {
        setState(normalizeState(JSON.parse(rawState) as AppState));
      } catch {
        setState(createInitialAppState());
      }
    }

    const session = parsePersistedSession(rawSession);
    setAuthenticatedUserId(session.authenticatedUserId);
    setImpersonatedUserId(session.impersonatedUserId);

    setIsStorageHydrated(true);
  }, []);

  useEffect(() => {
    if (!isStorageHydrated) {
      return;
    }

    window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }, [isStorageHydrated, state]);

  useEffect(() => {
    if (!isStorageHydrated) {
      return;
    }

    if (authenticatedUserId) {
      const session: PersistedSession = {
        authenticatedUserId,
        impersonatedUserId,
      };
      window.localStorage.setItem(
        SESSION_KEY,
        JSON.stringify(session),
      );
    } else {
      window.localStorage.removeItem(SESSION_KEY);
    }
  }, [authenticatedUserId, impersonatedUserId, isStorageHydrated]);

  useEffect(() => {
    if (!isStorageHydrated) {
      return;
    }

    const syncFromStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) {
        return;
      }

      if (event.key === STATE_KEY) {
        if (!event.newValue) {
          setState(createInitialAppState());
          return;
        }

        try {
          setState(normalizeState(JSON.parse(event.newValue) as AppState));
        } catch {
          // Ignore malformed payloads and keep current in-memory state.
        }
      }

      if (event.key === SESSION_KEY) {
        const session = parsePersistedSession(event.newValue);
        setAuthenticatedUserId(session.authenticatedUserId);
        setImpersonatedUserId(session.impersonatedUserId);
      }
    };

    window.addEventListener("storage", syncFromStorage);
    return () => {
      window.removeEventListener("storage", syncFromStorage);
    };
  }, [isStorageHydrated]);

  useEffect(() => {
    if (!isStorageHydrated) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDidBootstrapTimeout(true);
      setIsSupabaseAuthResolved(true);
      setDidAttemptBootstrapRevalidation(true);
      console.warn("[auth-bootstrap] forcing hydration fallback after timeout");
    }, 9000);

    return () => window.clearTimeout(timeoutId);
  }, [isStorageHydrated, supabase]);

  useEffect(() => {
    if (isSupabaseAuthResolved && didAttemptBootstrapRevalidation) {
      setDidBootstrapTimeout(false);
    }
  }, [didAttemptBootstrapRevalidation, isSupabaseAuthResolved]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current));
    }, 2800);

    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    if (!isStorageHydrated) {
      return;
    }

    if (!supabase) {
      setDidAttemptBootstrapRevalidation(true);
      setIsSupabaseAuthResolved(true);
      return;
    }

    let active = true;
    let hasResolvedAuthUser = false;

    const syncFromAuthUser = async (authUser: SupabaseAuthUser | null, source: SupabaseAuthSyncSource) => {
      if (!active) {
        return;
      }

      const persistedSession = parsePersistedSession(window.localStorage.getItem(SESSION_KEY));

      if (!authUser?.email) {
        if (
          shouldPreserveStoredSessionOnTransientSupabaseNullEvent(
            source,
            persistedSession.authenticatedUserId,
          )
        ) {
          setIsSupabaseAuthResolved(true);
          return;
        }

        if (
          shouldPreserveStoredSessionDuringSupabaseBootstrap(
            source,
            persistedSession.authenticatedUserId,
            hasResolvedAuthUser,
          )
        ) {
          setIsSupabaseAuthResolved(true);
          return;
        }

        if (
          shouldRevalidateSupabaseSessionBeforeClearingAuth(
            source,
            persistedSession.authenticatedUserId,
            hasResolvedAuthUser,
          )
        ) {
          setDidAttemptBootstrapRevalidation(true);
          const confirmedAuthUser = await withTimeout(confirmCurrentSupabaseAuthUser(supabase), 4000, null);
          if (!active) {
            return;
          }

          if (confirmedAuthUser?.email) {
            void syncFromAuthUser(confirmedAuthUser, "bootstrap");
            return;
          }
        }

        setAuthenticatedUserId(null);
        setImpersonatedUserId(null);
        setIsSupabaseAuthResolved(true);
        return;
      }

      const profile = await fetchSupabaseProfileWithRetry(supabase, authUser.id);
      if (!active) {
        return;
      }

      let resolvedUserId: string | null = null;
      if (!profile) {
        const snapshot = await fetchSupabaseVisibleStateSnapshot({ lite: source === "bootstrap" });
        if (!active) {
          return;
        }

        if (snapshot) {
          setState((previous) => reconcileSupabaseVisibleState(previous, snapshot));
          resolvedUserId = findResolvedUserIdInSnapshot(snapshot, authUser);
        }
      }

      if (resolvedUserId) {
        hasResolvedAuthUser = true;
        setAuthenticatedUserId(resolvedUserId);
        setImpersonatedUserId(null);
        setIsSupabaseAuthResolved(true);
        return;
      }

      setState((previous) => {
        const resolution = resolveSupabaseUserForState(previous, authUser, profile);
        resolvedUserId = resolution.resolvedUserId;
        return resolution.nextState;
      });

      if (!resolvedUserId) {
        if (
          shouldPreserveStoredSessionOnTransientSupabaseNullEvent(
            source,
            persistedSession.authenticatedUserId,
          )
        ) {
          setIsSupabaseAuthResolved(true);
          return;
        }

        if (
          shouldRevalidateSupabaseSessionBeforeClearingAuth(
            source,
            persistedSession.authenticatedUserId,
            hasResolvedAuthUser,
          )
        ) {
          const confirmedAuthUser = await withTimeout(confirmCurrentSupabaseAuthUser(supabase), 4000, null);
          if (!active) {
            return;
          }

          if (confirmedAuthUser?.email) {
            void syncFromAuthUser(confirmedAuthUser, "bootstrap");
            return;
          }
        }

        setAuthenticatedUserId(null);
        setImpersonatedUserId(null);
        setIsSupabaseAuthResolved(true);
        return;
      }

      hasResolvedAuthUser = true;
      setAuthenticatedUserId(resolvedUserId);
      setImpersonatedUserId(null);
      setIsSupabaseAuthResolved(true);
    };

      setIsSupabaseAuthResolved(false);
      setDidAttemptBootstrapRevalidation(false);
      setDidBootstrapTimeout(false);

    void withTimeout(confirmCurrentSupabaseAuthUser(supabase), 5000, null).then((user) => {
      setDidAttemptBootstrapRevalidation(true);
      return syncFromAuthUser(user, "bootstrap");
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!shouldSyncSupabaseAuthEvent(event as SupabaseAuthEvent)) {
        return;
      }
      void syncFromAuthUser(session?.user ?? null, "event");
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [isStorageHydrated, supabase]);

  const authenticatedUser = useMemo(
    () => resolveSelectedUserFromState(state, authenticatedUserId),
    [authenticatedUserId, state],
  );
  const currentUser = useMemo(
    () => resolveSelectedUserFromState(state, impersonatedUserId ?? authenticatedUserId),
    [authenticatedUserId, impersonatedUserId, state],
  );
  const hasActiveWorkoutOpen = useMemo(
    () => hasOpenActiveWorkout(state, currentUser?.id),
    [currentUser?.id, state],
  );
  const isImpersonating = Boolean(impersonatedUserId);
  const hasStoredSession = Boolean(authenticatedUserId);

  const fetchSupabaseVisibleStateSnapshot = (options?: { lite?: boolean; accessToken?: string; throwOnError?: boolean }) =>
    fetchSupabaseVisibleStateSnapshotWithClient(supabase, options);

function findResolvedUserIdInSnapshot(
  snapshot: SupabaseVisibleAppStateSnapshot,
  authUser: SupabaseAuthUser,
) {
    const authEmail = authUser.email?.trim().toLowerCase();
    return (
      snapshot.users.find((user) => user.id === authUser.id)?.id ??
      snapshot.users.find((user) => authEmail && user.email.trim().toLowerCase() === authEmail)?.id ??
      null
    );
  }

  function resolveSessionIdsFromSnapshot(
    previous: AppState,
    snapshot: SupabaseVisibleAppStateSnapshot,
    authUser: SupabaseAuthUser | null,
    previousAuthenticatedUserId: string | null,
    previousImpersonatedUserId: string | null,
  ) {
    const resolvedAuthenticatedUserId = authUser
      ? findResolvedUserIdInSnapshot(snapshot, authUser) ??
        findResolvedSnapshotUserIdForLocalUser(previous, snapshot, previousAuthenticatedUserId) ??
        previousAuthenticatedUserId
      : findResolvedSnapshotUserIdForLocalUser(previous, snapshot, previousAuthenticatedUserId) ??
        previousAuthenticatedUserId;
    const resolvedImpersonatedUserId = findResolvedSnapshotUserIdForLocalUser(
      previous,
      snapshot,
      previousImpersonatedUserId,
    );

    return {
      authenticatedUserId: resolvedAuthenticatedUserId,
      impersonatedUserId: resolvedImpersonatedUserId,
    };
  }

  async function refreshSupabaseVisibleState() {
    if (!supabase) {
      return false;
    }

    if (refreshSupabaseVisibleStatePromiseRef.current) {
      return refreshSupabaseVisibleStatePromiseRef.current;
    }

    const refreshPromise = (async () => {
      const payload = await fetchSupabaseVisibleStateSnapshot({ lite: !authenticatedUserId });
      if (!payload) {
        return false;
      }

      try {
        setState((previous) => reconcileSupabaseVisibleState(previous, payload));
        const authUser = await withTimeout(confirmCurrentSupabaseAuthUser(supabase), 4000, null);
        const resolvedSession = resolveSessionIdsFromSnapshot(
          state,
          payload,
          authUser,
          authenticatedUserId,
          impersonatedUserId,
        );
        if (resolvedSession.authenticatedUserId !== authenticatedUserId) {
          setAuthenticatedUserId(resolvedSession.authenticatedUserId);
        }
        if (resolvedSession.impersonatedUserId !== impersonatedUserId) {
          setImpersonatedUserId(resolvedSession.impersonatedUserId);
        }
        return true;
      } catch {
        return false;
      }
    })();

    refreshSupabaseVisibleStatePromiseRef.current = refreshPromise;

    try {
      return await refreshPromise;
    } finally {
      if (refreshSupabaseVisibleStatePromiseRef.current === refreshPromise) {
        refreshSupabaseVisibleStatePromiseRef.current = null;
      }
    }
  }

  useEffect(() => {
    if (!isHydrated || !supabase || !authenticatedUserId) {
      return;
    }

    void refreshSupabaseVisibleState();
  }, [authenticatedUserId, isHydrated, supabase]);

  useEffect(() => {
    if (!isHydrated || !supabase || !authenticatedUserId) {
      return;
    }

    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible" || hasActiveWorkoutOpen) {
        return;
      }

      void refreshSupabaseVisibleState();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && !hasActiveWorkoutOpen) {
        void refreshSupabaseVisibleState();
      }
    };

    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [authenticatedUserId, hasActiveWorkoutOpen, isHydrated, supabase]);

  useEffect(() => {
    if (!isHydrated || !supabase || !authenticatedUserId || hasActiveWorkoutOpen) {
      return;
    }

    void refreshSupabaseVisibleState();
  }, [authenticatedUserId, hasActiveWorkoutOpen, isHydrated, supabase]);

  useEffect(() => {
    if (!isHydrated || !supabase || !authenticatedUser || !canActAsCoach(authenticatedUser.role)) {
      return;
    }

    let active = true;

    void fetch("/api/invites")
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as SupabaseInviteDirectorySnapshot | { message?: string } | null;
        if (!response.ok || !payload || !("invites" in payload) || !("activeEmails" in payload)) {
          return;
        }

        if (!active) {
          return;
        }

        setState((previous) => reconcileSupabaseInviteDirectory(previous, payload));
      })
      .catch(() => {
        // Keep local state as-is if invite sync fails.
      });

    return () => {
      active = false;
    };
  }, [authenticatedUser, isHydrated, supabase]);

  useEffect(() => {
    if (impersonatedUserId && !state.users.some((user) => user.id === impersonatedUserId)) {
      setImpersonatedUserId(null);
    }
  }, [impersonatedUserId, state.users]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const themeMode = currentUser?.settings?.themeMode === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.style.colorScheme = themeMode;
  }, [currentUser?.settings?.themeMode, isHydrated]);

  const value = useMemo<AppStateContextValue>(() => {
      const signInWithSupabasePassword = async (
        email: string,
        password: string,
        options?: { captchaToken?: string },
      ): Promise<LoginResult> => {
      if (!supabase) {
        return { ok: false, message: "Supabase-kirjautuminen ei ole käytettävissä." };
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: options?.captchaToken
          ? {
              captchaToken: options.captchaToken,
            }
          : undefined,
      });

      if (error) {
        return { ok: false, message: getSupabaseLoginErrorMessage(error.message) };
      }

        const authUser = await resolveSupabaseAuthUserAfterPasswordSignIn({
          initialUser: data.user,
          confirmUser: () => withTimeout(confirmCurrentSupabaseAuthUser(supabase), 4000, null),
        });

        if (!authUser?.email) {
          return { ok: false, message: "Käyttäjätiliä ei voitu tunnistaa kirjautumisen jälkeen." };
        }

      let profile: SupabaseProfileRecord | null = null;
      let resolvedSnapshotUserId: string | null = null;
      let latestSnapshot: SupabaseVisibleAppStateSnapshot | null = null;

      for (let attempt = 0; attempt < 4; attempt += 1) {
        profile = await fetchSupabaseProfileWithRetry(supabase, authUser.id, 2, 180);
        if (profile) {
          break;
        }

        try {
          latestSnapshot = await fetchSupabaseVisibleStateSnapshot({
            accessToken: data.session?.access_token,
            throwOnError: true,
          });
        } catch (error) {
          return {
            ok: false,
            message:
              error instanceof Error && error.message
                ? error.message
                : "Käyttäjälle ei löytynyt profiilia tai käyttöoikeutta tähän sovellukseen.",
          };
        }
        resolvedSnapshotUserId = latestSnapshot ? findResolvedUserIdInSnapshot(latestSnapshot, authUser) : null;

        if (latestSnapshot) {
          setState((previous) => reconcileSupabaseVisibleState(previous, latestSnapshot as SupabaseVisibleAppStateSnapshot));
        }

        if (resolvedSnapshotUserId) {
          setAuthenticatedUserId(resolvedSnapshotUserId);
          setImpersonatedUserId(null);
          return { ok: true };
        }

        if (attempt < 3) {
          await waitForNextPaint(2);
          await waitForDelay(220 * (attempt + 1));
        }
      }

      let resolvedUserId: string | null = null;
      setState((previous) => {
        const resolution = resolveSupabaseUserForState(previous, authUser, profile);
        resolvedUserId = resolution.resolvedUserId;
        return resolution.nextState;
      });

        if (!resolvedUserId) {
          return {
            ok: false,
            message: "Käyttäjälle ei löytynyt profiilia tai käyttöoikeutta tähän sovellukseen.",
          };
        }

      setAuthenticatedUserId(resolvedUserId);
      setImpersonatedUserId(null);
      return { ok: true };
    };

    return {
      state,
      authenticatedUser,
      currentUser,
      hasAuthenticatedSession: hasStoredSession,
      currentRole: currentUser?.role ?? null,
      isImpersonating,
      isHydrated,
      notify,
      async login(email, password, options) {
        const localUser = state.users.find((candidate) => candidate.email.toLowerCase() === email.toLowerCase());

        if (
          isLocalDevelopmentHost() &&
          localUser &&
          localUser.status === "active" &&
          localUser.demoPassword === password
        ) {
          setAuthenticatedUserId(localUser.id);
          setImpersonatedUserId(null);
          return { ok: true };
        }

        if (supabase) {
          return signInWithSupabasePassword(email, password, options);
        }

        if (!localUser) {
          return { ok: false, message: "Käyttäjää ei löytynyt." };
        }

        if (localUser.status !== "active") {
          return { ok: false, message: "Kutsu on vielä hyväksymättä." };
        }

        if (localUser.demoPassword !== password) {
          return { ok: false, message: "Väärä salasana." };
        }

        setAuthenticatedUserId(localUser.id);
        setImpersonatedUserId(null);
        return { ok: true };
      },
      async logout() {
        try {
          window.localStorage.removeItem(SESSION_KEY);
        } catch {
          // Ignore storage failures and still continue logging out.
        }
        if (supabase) {
          await supabase.auth.signOut();
        }
        setAuthenticatedUserId(null);
        setImpersonatedUserId(null);
      },
      loginAsDemoUser(userId) {
        setAuthenticatedUserId(userId);
        setImpersonatedUserId(null);
      },
      startAdminImpersonation(userId) {
        if (!authenticatedUser || authenticatedUser.role !== "admin") {
          return { ok: false, message: "Vain admin voi vaihtaa käyttäjänäkymään." };
        }

        const targetUser = state.users.find((user) => user.id === userId);
        if (!targetUser) {
          return { ok: false, message: "Käyttäjää ei löytynyt." };
        }
        if (targetUser.status !== "active") {
          return { ok: false, message: "Vain aktiiviseen käyttäjään voi vaihtaa." };
        }
        if (targetUser.id === authenticatedUser.id) {
          setImpersonatedUserId(null);
          return { ok: true };
        }

        setImpersonatedUserId(targetUser.id);
        return { ok: true };
      },
      stopAdminImpersonation() {
        if (!authenticatedUser || authenticatedUser.role !== "admin") {
          return { ok: false, message: "Vain admin voi lopettaa käyttäjävaihdon." };
        }

        setImpersonatedUserId(null);
        return { ok: true };
      },
      async updateCurrentUserSettings(input) {
        if (!currentUser) {
          return { ok: false, message: "Kirjaudu sisään ennen asetusten muokkausta." };
        }

        const fullName = input.fullName.trim();
        if (fullName.length < 2) {
          return { ok: false, message: "Nimen pitää olla vähintään 2 merkkiä." };
        }

        const timestamp = new Date().toISOString();
        const currentSettings = normalizeUserSettings(currentUser.role, currentUser.settings);
        const nextSettings = {
          defaultDashboardView: input.defaultDashboardView,
          emailNotifications: input.emailNotifications,
          themeMode: input.themeMode,
          loadIncrementKg: input.loadIncrementKg,
        };

        const hasChanges =
          currentUser.fullName !== fullName ||
          currentSettings.defaultDashboardView !== nextSettings.defaultDashboardView ||
          currentSettings.emailNotifications !== nextSettings.emailNotifications ||
          currentSettings.themeMode !== nextSettings.themeMode;

        if (!hasChanges) {
          return { ok: true, message: "Ei tallennettavia muutoksia." };
        }

        const applySettingsUpdate = () => setState((previous) => ({
          ...previous,
          users: previous.users.map((user) =>
            user.id === currentUser.id
              ? {
                  ...user,
                  fullName,
                  updatedAt: timestamp,
                  settings: normalizeUserSettings(user.role, {
                    ...user.settings,
                    ...nextSettings,
                  }),
                }
              : user,
          ),
        }));

        if (supabase) {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          const response = await fetch("/api/settings", {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              ...(session?.access_token
                ? {
                    Authorization: `Bearer ${session.access_token}`,
                  }
                : {}),
            },
              body: JSON.stringify({
                fullName,
                defaultDashboardView: input.defaultDashboardView,
                emailNotifications: input.emailNotifications,
                themeMode: input.themeMode,
                loadIncrementKg: input.loadIncrementKg,
              }),
            });

          if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as { message?: string } | null;
            await refreshSupabaseVisibleState();
            return { ok: false, message: payload?.message ?? "Asetusten tallennus epäonnistui." };
          }

          applySettingsUpdate();
          await waitForNextPaint(2);
          return { ok: true };
        }

        applySettingsUpdate();
        await waitForNextPaint(2);
        return { ok: true };
      },
      async updateCurrentUserMeasurements(input) {
        if (!currentUser || currentUser.role !== "athlete") {
          return { ok: false, message: "Mittatietoja voi päivittää vain treenaajan profiilille." };
        }

        const timestamp = new Date().toISOString();
        const hasHeightInput = Object.prototype.hasOwnProperty.call(input, "heightCm");
        const hasWeightInput = Object.prototype.hasOwnProperty.call(input, "weightKg");
        const hasWaistInput = Object.prototype.hasOwnProperty.call(input, "waistCm");
        const heightCm = hasHeightInput ? input.heightCm : currentUser.heightCm;
        const weightKg = hasWeightInput ? input.weightKg : currentUser.weightKg;
        const waistCm = hasWaistInput ? input.waistCm : currentUser.waistCm;
        const hasRecordedMetric = hasHeightInput || hasWeightInput || hasWaistInput;
        const hasMeasurementChange =
          currentUser.heightCm !== heightCm ||
          currentUser.weightKg !== weightKg ||
          currentUser.waistCm !== waistCm;

        if (!hasMeasurementChange) {
          return { ok: true };
        }

        if (supabase) {
          const { error: profileError } = await supabase
            .from("profiles")
            .update({
              height_cm: heightCm ?? null,
              weight_kg: weightKg ?? null,
              waist_cm: waistCm ?? null,
              updated_at: timestamp,
            })
            .eq("id", currentUser.id);

          if (profileError) {
            return { ok: false, message: "Mittatietojen tallennus epäonnistui." };
          }

          if (hasRecordedMetric) {
            const { error: measurementError } = await supabase
              .from("body_measurements")
              .insert({
                user_id: currentUser.id,
                height_cm: hasHeightInput ? (heightCm ?? null) : null,
                weight_kg: hasWeightInput ? (weightKg ?? null) : null,
                waist_cm: hasWaistInput ? (waistCm ?? null) : null,
                measured_at: timestamp,
                created_at: timestamp,
              });

            if (measurementError) {
              return { ok: false, message: "Mittatiedot tallentuivat profiiliin, mutta mittahistoriaa ei voitu päivittää." };
            }
          }
        }

        setState((previous) => applyPartialUserMeasurementUpdate(previous, currentUser.id, input, timestamp));

        return { ok: true };
      },
      async requestCurrentUserPasswordReset() {
        if (!currentUser) {
          return { ok: false, message: "Kirjaudu sisään ennen salasanan nollausta." };
        }

        if (supabase) {
          const response = await fetch("/api/password-reset", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({}),
          });
          const payload = (await response.json().catch(() => null)) as { message?: string; previewUrl?: string } | null;
          if (!response.ok) {
            return { ok: false, message: payload?.message ?? "Salasanan nollauspyynnön lähetys epäonnistui." };
          }

          return {
            ok: true,
            message: payload?.message ?? "Salasanan nollauspyyntö lähetettiin.",
            previewUrl: payload?.previewUrl,
          };
        }

        if (typeof crypto === "undefined" || !("subtle" in crypto)) {
          return { ok: false, message: "Turvallinen salasanan nollaus ei ole käytettävissä tässä ympäristössä." };
        }

        const createdAt = new Date().toISOString();
        const token = createSecureToken();
        const tokenHash = await hashToken(token);
        const resetRequest: PasswordResetRequest = {
          id: makeId("pw_reset"),
          userId: currentUser.id,
          email: currentUser.email,
          tokenHash,
          createdAt,
          expiresAt: addMinutesIso(createdAt, RESET_TOKEN_EXPIRY_MINUTES),
          requestedByUserId: currentUser.id,
          requestedByRole: "self_service",
        };

        setState((previous) => ({
          ...previous,
          passwordResetRequests: [
            resetRequest,
            ...previous.passwordResetRequests.map((request) =>
              request.userId === currentUser.id && !request.consumedAt && !isTimestampExpired(request.expiresAt)
                ? { ...request, consumedAt: createdAt }
                : request,
            ),
          ],
        }));

        return {
          ok: true,
          message:
            "Salasanan nollauspyyntö lähetettiin. Demo-ympäristössä ylläpitäjä voi avata reset-linkin asetuksista.",
        };
      },
      async requestPasswordResetForEmail(input) {
        const normalizedEmail = input.email.trim().toLowerCase();
        if (!normalizedEmail) {
          return { ok: false, message: "Anna sähköpostiosoite." };
        }

        if (supabase) {
          const response = await fetch("/api/password-reset", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email: normalizedEmail,
              captchaToken: input.captchaToken,
            }),
          });
          const payload = (await response.json().catch(() => null)) as { message?: string; previewUrl?: string } | null;
          if (!response.ok) {
            return { ok: false, message: payload?.message ?? "Nollausviestin lähetys epäonnistui." };
          }

          return {
            ok: true,
            message: payload?.message ?? "Nollausviesti lähetettiin.",
            previewUrl: payload?.previewUrl,
          };
        }

        const targetUser = state.users.find((user) => user.email.toLowerCase() === normalizedEmail);
        if (!targetUser) {
          return { ok: true, message: PUBLIC_PASSWORD_RESET_RESPONSE };
        }

        if (targetUser.status !== "active") {
          return { ok: true, message: PUBLIC_PASSWORD_RESET_RESPONSE };
        }

        if (typeof crypto === "undefined" || !("subtle" in crypto)) {
          return { ok: false, message: "Turvallinen salasanan nollaus ei ole käytettävissä tässä ympäristössä." };
        }

        const createdAt = new Date().toISOString();
        const token = createSecureToken();
        const tokenHash = await hashToken(token);
        const resetRequest: PasswordResetRequest = {
          id: makeId("pw_reset"),
          userId: targetUser.id,
          email: targetUser.email,
          tokenHash,
          createdAt,
          expiresAt: addMinutesIso(createdAt, RESET_TOKEN_EXPIRY_MINUTES),
          requestedByRole: "self_service",
        };

        setState((previous) => ({
          ...previous,
          passwordResetRequests: [
            resetRequest,
            ...previous.passwordResetRequests.map((request) =>
              request.userId === targetUser.id && !request.consumedAt && !isTimestampExpired(request.expiresAt)
                ? { ...request, consumedAt: createdAt }
                : request,
            ),
          ],
        }));

        return {
          ok: true,
          message: PUBLIC_PASSWORD_RESET_RESPONSE,
        };
      },
      async adminSendPasswordResetEmail(userId) {
        if (!currentUser || currentUser.role !== "admin") {
          return { ok: false, message: "Vain admin voi lähettää salasanan nollausviestejä." };
        }

        const targetUser = state.users.find((user) => user.id === userId);

        if (supabase) {
          const response = await fetch("/api/password-reset", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ userId, email: targetUser?.email }),
          });
          const payload = (await response.json().catch(() => null)) as { message?: string; previewUrl?: string } | null;
          if (!response.ok) {
            return { ok: false, message: payload?.message ?? "Nollausviestin lähetys epäonnistui." };
          }

          return {
            ok: true,
            message: payload?.message ?? "Nollausviesti lähetettiin.",
            previewUrl: payload?.previewUrl,
          };
        }

        if (!targetUser) {
          return { ok: false, message: "Käyttäjää ei löytynyt." };
        }

        if (targetUser.status !== "active") {
          return { ok: false, message: "Käyttäjä ei ole vielä aktivoinut tiliään." };
        }

        if (typeof crypto === "undefined" || !("subtle" in crypto)) {
          return { ok: false, message: "Turvallinen salasanan nollaus ei ole käytettävissä tässä ympäristössä." };
        }

        const createdAt = new Date().toISOString();
        const token = createSecureToken();
        const tokenHash = await hashToken(token);
        const resetRequest: PasswordResetRequest = {
          id: makeId("pw_reset"),
          userId: targetUser.id,
          email: targetUser.email,
          tokenHash,
          createdAt,
          expiresAt: addMinutesIso(createdAt, RESET_TOKEN_EXPIRY_MINUTES),
          requestedByUserId: currentUser.id,
          requestedByRole: "admin",
        };

        setState((previous) => ({
          ...previous,
          passwordResetRequests: [
            resetRequest,
            ...previous.passwordResetRequests.map((request) =>
              request.userId === targetUser.id && !request.consumedAt && !isTimestampExpired(request.expiresAt)
                ? { ...request, consumedAt: createdAt }
                : request,
            ),
          ],
        }));

        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const previewUrl = `${origin}/reset-password/${token}`;

        return {
          ok: true,
          message: `Nollausviesti lähetettiin osoitteeseen ${targetUser.email}.`,
          previewUrl,
        };
      },
      async adminUpdateUserRole(userId, role) {
        if (!currentUser || currentUser.role !== "admin") {
          return { ok: false, message: "Vain admin voi vaihtaa käyttäjän roolia." };
        }

        const targetUser = state.users.find((user) => user.id === userId);
        if (!targetUser) {
          return { ok: false, message: "Käyttäjää ei löytynyt." };
        }

        if (targetUser.id === currentUser.id) {
          return { ok: false, message: "Et voi vaihtaa omaa admin-rooliasi." };
        }

        if (targetUser.role === role) {
          return { ok: true, message: "Rooli oli jo valittuna." };
        }

        if (supabase) {
          const response = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email: targetUser.email,
              role,
            }),
          });
          const payload = (await response.json().catch(() => null)) as {
            message?: string;
            resolvedUserId?: string;
            updatedAt?: string;
          } | null;
          if (!response.ok) {
            return { ok: false, message: payload?.message ?? "Roolin päivitys epäonnistui." };
          }

          const updatedAt = payload?.updatedAt ?? new Date().toISOString();
          const resolvedUserId = payload?.resolvedUserId ?? userId;
          setState((previous) =>
            applyAdminRoleUpdate(previous, userId, resolvedUserId, targetUser.email, role, updatedAt),
          );

          return {
            ok: true,
            message:
              payload?.message ??
              `Rooli päivitettiin: ${targetUser.fullName} on nyt ${role === "admin" ? "admin" : role === "coach" ? "valmentaja" : "treenaaja"}.`,
          };
        }

        if (targetUser.role === "admin" && role !== "admin") {
          const adminCount = state.users.filter((user) => user.role === "admin").length;
          if (adminCount <= 1) {
            return { ok: false, message: "Viimeisen admin-käyttäjän roolia ei voi vaihtaa." };
          }
        }

        if (targetUser.role === "coach" && role !== "coach") {
          const activeAthleteCount = state.assignments.filter(
            (assignment) => assignment.coachId === targetUser.id && assignment.active,
          ).length;
          if (activeAthleteCount > 0) {
            return {
              ok: false,
              message: "Siirrä ensin valmennettavat toiselle valmentajalle ennen roolin vaihtoa.",
            };
          }

          const coachedProgramCount = state.plans.filter((plan) => plan.coachId === targetUser.id).length;
          if (coachedProgramCount > 0) {
            return {
              ok: false,
              message: "Siirrä tai päätä ensin käyttäjän valmennusohjelmat ennen roolin vaihtoa.",
            };
          }
        }

        const updatedAt = new Date().toISOString();
        setState((previous) => ({
          ...previous,
          users: previous.users.map((user) =>
            user.id === targetUser.id
              ? {
                  ...user,
                  role,
                  updatedAt,
                  settings: normalizeUserSettings(role, user.settings),
                }
              : user,
          ),
          assignments: previous.assignments.filter((assignment) => {
            if (role === "admin") {
              return assignment.coachId !== targetUser.id && assignment.athleteId !== targetUser.id;
            }

            if (role === "coach") {
              return assignment.athleteId !== targetUser.id;
            }

            return assignment.coachId !== targetUser.id;
          }),
        }));

        return {
          ok: true,
          message: `Rooli päivitettiin: ${targetUser.fullName} on nyt ${role === "admin" ? "admin" : role === "coach" ? "valmentaja" : "treenaaja"}.`,
        };
      },
      async adminAssignAthleteCoaches(athleteId, coachIds) {
        if (!currentUser || !isAdminRole(currentUser.role)) {
          return { ok: false, message: "Vain admin voi vaihtaa treenaajan valmentajat." };
        }

        const athlete = state.users.find((user) => user.id === athleteId);
        if (!athlete || athlete.role !== "athlete") {
          return { ok: false, message: "Treenaajaa ei löytynyt." };
        }

        const uniqueCoachIds = Array.from(new Set(coachIds.filter(Boolean)));
        if (!uniqueCoachIds.length) {
          return { ok: false, message: "Valitse vähintään yksi valmentaja." };
        }

        const selectedCoaches = uniqueCoachIds.map((coachId) =>
          state.users.find((user) => user.id === coachId && canActAsCoach(user.role)),
        );
        if (selectedCoaches.some((coach) => !coach)) {
          return { ok: false, message: "Yksi tai useampi valituista valmentajista ei ole kelvollinen." };
        }

        if (supabase) {
          const response = await fetch(`/api/users/${encodeURIComponent(athleteId)}/coaches`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email: athlete.email,
              coachIds: uniqueCoachIds,
            }),
          });
          const payload = (await response.json().catch(() => null)) as {
            message?: string;
            resolvedAthleteId?: string;
            coachIds?: string[];
            updatedInviteCoachId?: string;
            createdAt?: string;
          } | null;
          if (!response.ok) {
            return { ok: false, message: payload?.message ?? "Vastuuhenkilöiden päivitys epäonnistui." };
          }

          const createdAt = payload?.createdAt ?? new Date().toISOString();
          const resolvedAthleteId = payload?.resolvedAthleteId ?? athleteId;
          const nextCoachIds = payload?.coachIds ?? uniqueCoachIds;
          setState((previous) =>
            applyAdminCoachAssignmentUpdate(
              previous,
              athleteId,
              resolvedAthleteId,
              athlete.email,
              nextCoachIds,
              createdAt,
              payload?.updatedInviteCoachId,
            ),
          );

          const coachNames = selectedCoaches
            .filter((coach): coach is UserProfile => Boolean(coach))
            .map((coach) => coach.fullName)
            .join(", ");
          return { ok: true, message: payload?.message ?? `Valmentajat päivitettiin: ${coachNames}.` };
        }

        const activeAssignments = state.assignments.filter(
          (assignment) => assignment.athleteId === athleteId && assignment.active,
        );
        const activeCoachIds = activeAssignments.map((assignment) => assignment.coachId).sort();
        const normalizedSelectedCoachIds = [...uniqueCoachIds].sort();
        if (
          activeCoachIds.length === normalizedSelectedCoachIds.length &&
          activeCoachIds.every((coachId, index) => coachId === normalizedSelectedCoachIds[index])
        ) {
          return { ok: true, message: "Valmentajat olivat jo valittuna." };
        }

        const primaryCoachId = uniqueCoachIds[0] ?? "";
        const createdAt = new Date().toISOString();
        setState((previous) => ({
          ...previous,
          assignments: [
            ...previous.assignments.filter(
              (assignment) => !(assignment.athleteId === athleteId && assignment.active),
            ),
            ...uniqueCoachIds.map((coachId) => {
              const existingAssignment = previous.assignments.find(
                (assignment) =>
                  assignment.athleteId === athleteId &&
                  assignment.coachId === coachId &&
                  assignment.active,
              );

              return existingAssignment ?? {
                id: makeId("assignment"),
                coachId,
                athleteId,
                active: true,
                createdAt,
              };
            }),
          ],
          invites: previous.invites.map((invite) =>
            invite.role === "athlete" &&
            invite.email.toLowerCase() === athlete.email.toLowerCase() &&
            invite.status === "pending"
              ? { ...invite, coachId: primaryCoachId }
              : invite,
          ),
        }));

        const coachNames = selectedCoaches
          .filter((coach): coach is UserProfile => Boolean(coach))
          .map((coach) => coach.fullName)
          .join(", ");
        return { ok: true, message: `Valmentajat päivitettiin: ${coachNames}.` };
      },
      async completePasswordReset(token, nextPassword) {
        if (supabase) {
          const response = await fetch(`/api/password-reset/${encodeURIComponent(token)}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ password: nextPassword }),
          });
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          if (!response.ok) {
            return { ok: false, message: payload?.message ?? "Salasanan nollaus epäonnistui." };
          }

          return { ok: true };
        }

        const normalizedToken = token.trim();
        if (!normalizedToken) {
          return { ok: false, message: "Nollauslinkki on virheellinen." };
        }

        if (nextPassword.trim().length < 8) {
          return { ok: false, message: "Salasanan tulee olla vähintään 8 merkkiä." };
        }

        if (typeof crypto === "undefined" || !("subtle" in crypto)) {
          return { ok: false, message: "Turvallinen salasanan nollaus ei ole käytettävissä tässä ympäristössä." };
        }

        const tokenHash = await hashToken(normalizedToken);
        const request = state.passwordResetRequests.find(
          (item) => item.tokenHash === tokenHash && !item.consumedAt && !isTimestampExpired(item.expiresAt),
        );
        if (!request) {
          return { ok: false, message: "Nollauslinkki on vanhentunut tai jo käytetty." };
        }

        const targetUser = state.users.find((user) => user.id === request.userId && user.email === request.email);
        if (!targetUser || targetUser.status !== "active") {
          return { ok: false, message: "Nollaus epäonnistui. Pyydä uusi linkki." };
        }

        const updatedAt = new Date().toISOString();
        setState((previous) => ({
          ...previous,
          users: previous.users.map((user) =>
            user.id === targetUser.id
              ? {
                  ...user,
                  demoPassword: nextPassword,
                  updatedAt,
                }
              : user,
          ),
          passwordResetRequests: previous.passwordResetRequests.map((item) =>
            item.id === request.id ? { ...item, consumedAt: updatedAt } : item,
          ),
        }));

        return { ok: true };
      },
      async adminDeleteUser(userId) {
        if (!currentUser || currentUser.role !== "admin") {
          return { ok: false, message: "Vain admin voi poistaa käyttäjiä." };
        }

        const targetUser = state.users.find((user) => user.id === userId);
        if (!targetUser) {
          return { ok: false, message: "Käyttäjää ei löytynyt." };
        }

        if (targetUser.id === currentUser.id) {
          return { ok: false, message: "Et voi poistaa omaa admin-tiliäsi." };
        }

        if (targetUser.role === "admin") {
          const adminCount = state.users.filter((user) => user.role === "admin").length;
          if (adminCount <= 1) {
            return { ok: false, message: "Viimeistä admin-käyttäjää ei voi poistaa." };
          }
        }

        if (supabase) {
          const response = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email: targetUser.email,
              status: targetUser.status,
            }),
          });
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          if (!response.ok) {
            return { ok: false, message: payload?.message ?? "Käyttäjän poisto epäonnistui." };
          }
        }

        setState((previous) => removeUserFromState(previous, targetUser));

        return { ok: true };
      },
      async createInvite(input) {
        if (!currentUser) {
          return { ok: false, message: "Kirjaudu sisään ennen kutsun luontia." };
        }

        if (currentUser.role !== "admin" && currentUser.role !== "coach") {
          return { ok: false, message: "Vain admin tai valmentaja voi luoda kutsuja." };
        }

        if (currentUser.role === "coach") {
          if (input.role !== "athlete") {
            return { ok: false, message: "Valmentaja voi kutsua vain treenaajia." };
          }
          if (input.coachId !== currentUser.id) {
            return { ok: false, message: "Valmentaja voi kutsua treenaajan vain omalle rosterilleen." };
          }
        }

        if (input.role === "athlete" && !input.coachId) {
          return { ok: false, message: "Treenaajalle pitää valita vastuullinen valmentaja." };
        }

        if (input.role === "athlete" && input.coachId) {
          const assignedCoach = state.users.find((user) => user.id === input.coachId);
          if (!assignedCoach || !canActAsCoach(assignedCoach.role)) {
            return { ok: false, message: "Treenaajalle pitää valita valmennuskelpoinen vastuuhenkilö." };
          }
        }

        const duplicatePendingInvite = getVisiblePendingInvites(state.invites, state.users).find(
          (invite) => invite.email.toLowerCase() === input.email.toLowerCase(),
        );

        if (duplicatePendingInvite) {
          return { ok: false, message: "Tälle sähköpostille on jo avoin kutsu." };
        }

        if (supabase) {
          const response = await fetch("/api/invites", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(input),
          });
          const payload = (await response.json().catch(() => null)) as {
            message?: string;
            invite?: {
              id: string;
              token: string;
              email: string;
              role: "coach" | "athlete";
              invitedBy: string;
              coachId?: string | null;
              status: "pending" | "accepted";
              createdAt: string;
              expiresAt: string;
            };
          } | null;

          if (!response.ok || !payload?.invite) {
            return { ok: false, message: payload?.message ?? "Kutsun lähetys epäonnistui." };
          }

          const invite = {
            ...payload.invite,
            coachId: payload.invite.coachId ?? undefined,
          };
          const nextUserId = makeId("user");

          setState((previous) => {
            const users: UserProfile[] = previous.users.some(
              (user) => user.email.toLowerCase() === invite.email.toLowerCase(),
            )
              ? previous.users
              : [
                  ...previous.users,
                  {
                    id: nextUserId,
                    role: invite.role,
                    fullName: invite.email.split("@")[0] ?? invite.email,
                    email: invite.email,
                    status: "invited",
                    settings: defaultUserSettings(invite.role),
                    createdAt: invite.createdAt,
                    updatedAt: invite.createdAt,
                  },
                ];

            const assignments =
              invite.role === "athlete" && invite.coachId
                ? previous.assignments.some(
                    (assignment) =>
                      assignment.coachId === invite.coachId &&
                      assignment.athleteId ===
                        (users.find((user) => user.email.toLowerCase() === invite.email.toLowerCase())?.id ?? nextUserId) &&
                      assignment.active,
                  )
                  ? previous.assignments
                  : [
                      ...previous.assignments,
                      {
                        id: makeId("assignment"),
                        coachId: invite.coachId,
                        athleteId:
                          users.find((user) => user.email.toLowerCase() === invite.email.toLowerCase())?.id ?? nextUserId,
                        active: true,
                        createdAt: invite.createdAt,
                      },
                    ]
                : previous.assignments;

            return {
              ...previous,
              users,
              assignments,
              invites: [invite, ...previous.invites],
            };
          });

          return { ok: true };
        }

        const invite = domainCreateInvite(input, currentUser.id);
        const timestamp = new Date().toISOString();
        const nextUserId = makeId("user");

        setState((previous) => {
          const users: UserProfile[] = previous.users.some((user) => user.email === input.email)
            ? previous.users
            : [
                ...previous.users,
                {
                  id: nextUserId,
                  role: input.role,
                  fullName: input.email.split("@")[0] ?? input.email,
                  email: input.email,
                  status: "invited",
                  settings: defaultUserSettings(input.role),
                  createdAt: timestamp,
                  updatedAt: timestamp,
                },
              ];

          const assignments =
            input.role === "athlete" && input.coachId
              ? previous.assignments.some(
                  (assignment) =>
                    assignment.coachId === input.coachId &&
                    assignment.athleteId ===
                      (users.find((user) => user.email === input.email)?.id ?? nextUserId) &&
                    assignment.active,
                )
                ? previous.assignments
                : [
                    ...previous.assignments,
                    {
                      id: makeId("assignment"),
                      coachId: input.coachId,
                      athleteId:
                        users.find((user) => user.email === input.email)?.id ?? nextUserId,
                      active: true,
                      createdAt: timestamp,
                    },
                  ]
              : previous.assignments;

          return {
            ...previous,
            users,
            assignments,
            invites: [invite, ...previous.invites],
          };
        });

        return { ok: true };
      },
      async resendInvite(inviteId) {
        if (!currentUser) {
          return { ok: false, message: "Kirjaudu sisään ennen kutsun uudelleenlähetystä." };
        }

        const invite = state.invites.find((item) => item.id === inviteId);
        if (!invite) {
          return { ok: false, message: "Kutsua ei löytynyt." };
        }

        if (!canResendInvite(currentUser, invite)) {
          return { ok: false, message: "Sinulla ei ole oikeutta lähettää tätä kutsua uudelleen." };
        }

        if (supabase) {
          const response = await fetch(`/api/invites/${encodeURIComponent(inviteId)}/resend`, {
            method: "POST",
          });
          const payload = (await response.json().catch(() => null)) as {
            message?: string;
            invite?: {
              id: string;
              token: string;
              email: string;
              role: "coach" | "athlete";
              invitedBy: string;
              coachId?: string | null;
              status: "pending" | "accepted";
              createdAt: string;
              expiresAt: string;
            };
          } | null;

          if ((!response.ok || !payload?.invite) && shouldCreateFreshInviteOnResendFailure(payload?.message)) {
            const recreateResponse = await fetch("/api/invites", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                email: invite.email,
                role: invite.role,
                coachId: invite.coachId,
              }),
            });
            const recreatePayload = (await recreateResponse.json().catch(() => null)) as {
              message?: string;
              invite?: {
                id: string;
                token: string;
                email: string;
                role: "coach" | "athlete";
                invitedBy: string;
                coachId?: string | null;
                status: "pending" | "accepted";
                createdAt: string;
                expiresAt: string;
              };
            } | null;

            if (!recreateResponse.ok || !recreatePayload?.invite) {
              return { ok: false, message: recreatePayload?.message ?? "Kutsun uudelleenlähetys epäonnistui." };
            }

            const recreatedInvite = {
              ...recreatePayload.invite,
              coachId: recreatePayload.invite.coachId ?? undefined,
            };

            setState((previous) => ({
              ...previous,
              invites: [recreatedInvite, ...previous.invites.filter((item) => item.id !== inviteId)],
            }));

            return { ok: true };
          }

          if (!response.ok || !payload?.invite) {
            return { ok: false, message: payload?.message ?? "Kutsun uudelleenlähetys epäonnistui." };
          }

          const refreshedInvite = {
            ...payload.invite,
            coachId: payload.invite.coachId ?? undefined,
          };

          setState((previous) => ({
            ...previous,
            invites: previous.invites.map((item) => (item.id === refreshedInvite.id ? refreshedInvite : item)),
          }));

          return { ok: true };
        }

        const now = new Date().toISOString();
        const nextToken = createSecureToken();
        const nextExpiresAt = addDaysIso(now, INVITE_EXPIRY_DAYS);

        setState((previous) => ({
          ...previous,
          invites: previous.invites.map((item) =>
            item.id === inviteId
              ? {
                  ...item,
                  token: nextToken,
                  expiresAt: nextExpiresAt,
                }
              : item,
          ),
        }));

        return { ok: true };
      },
      async acceptInvite(token, fullName, password, options) {
        if (supabase) {
          const response = await fetch(`/api/invites/${encodeURIComponent(token)}/accept`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ fullName, password, captchaToken: options?.captchaToken }),
          });
          const payload = (await response.json().catch(() => null)) as { message?: string; email?: string } | null;

          if (!response.ok || !payload?.email) {
            return { ok: false, message: payload?.message ?? "Kutsun aktivointi epäonnistui." };
          }

          const acceptedEmail = payload.email;

          setState((previous) => ({
            ...previous,
            invites: previous.invites.map((item) =>
              item.token === token || item.email.toLowerCase() === acceptedEmail.toLowerCase()
                ? { ...item, status: "accepted" }
                : item,
            ),
          }));

          const loginResult = await signInWithSupabasePassword(acceptedEmail, password, options);
          if (loginResult.ok) {
            return {
              ok: true,
              message: payload?.message ?? loginResult.message,
            };
          }

          if (shouldTreatInviteActivationLoginFailureAsPartialSuccess(loginResult.message)) {
            return {
              ok: true,
              message:
                payload?.message ??
                "Tunnus aktivoitiin, mutta automaattinen kirjautuminen pysähtyi captcha-tarkistukseen. Kirjaudu etusivulla sisään samalla sähköpostilla ja salasanalla.",
            };
          }

          if (loginResult.message === "Käyttäjälle ei löytynyt profiilia tai käyttöoikeutta tähän sovellukseen.") {
            return {
              ok: true,
              message:
                payload?.message ??
                "Tili aktivoitiin, mutta työtila ei auennut heti. Kirjaudu etusivulla sisään samalla sähköpostilla ja salasanalla.",
            };
          }

          return loginResult;
        }

        const invite = state.invites.find((item) => item.token === token && item.status === "pending");
        if (!invite) {
          return { ok: false, message: "Kutsua ei löytynyt tai se on jo käytetty." };
        }

        if (isInviteExpired(invite.expiresAt)) {
          return { ok: false, message: "Kutsu on vanhentunut. Pyydä uusi kutsu." };
        }

        const timestamp = new Date().toISOString();
        const existingUser = state.users.find((user) => user.email === invite.email);
        const userId = existingUser?.id ?? makeId("user");

        setState((previous) => ({
          ...previous,
          users: existingUser
            ? previous.users.map((user) =>
                user.email === invite.email
                  ? {
                      ...user,
                      id: userId,
                      fullName,
                      status: "active",
                      demoPassword: password,
                      settings: normalizeUserSettings(user.role, user.settings),
                      updatedAt: timestamp,
                    }
                  : user,
              )
            : [
                ...previous.users,
                {
                  id: userId,
                  role: invite.role,
                  fullName,
                  email: invite.email,
                  status: "active",
                  demoPassword: password,
                  settings: defaultUserSettings(invite.role),
                  createdAt: timestamp,
                  updatedAt: timestamp,
                },
              ],
          invites: previous.invites.map((item) =>
            item.id === invite.id ? { ...item, status: "accepted" } : item,
          ),
          assignments:
            invite.role === "athlete" && invite.coachId
              ? previous.assignments.some((assignment) => assignment.athleteId === userId)
                ? previous.assignments
                : [
                    ...previous.assignments,
                    {
                      id: makeId("assignment"),
                      coachId: invite.coachId,
                      athleteId: userId,
                      active: true,
                      createdAt: timestamp,
                    },
                  ]
              : previous.assignments,
        }));

        setAuthenticatedUserId(userId);
        setImpersonatedUserId(null);
        return { ok: true };
      },
      async createProgram(input) {
        if (!currentUser || !canActAsCoach(currentUser.role)) {
          return { ok: false, message: "Vain admin tai valmentaja voi luoda treeniohjelman." };
        }

        const resolvedTargetUser = resolveProgramTargetFromState(state, input.athleteId);
        const nextAthleteId = resolvedTargetUser?.id ?? input.athleteId;

        if (!canManageProgramTarget(state, currentUser, nextAthleteId)) {
          return { ok: false, message: "Voit luoda ohjelman vain itsellesi tai omalle valmennettavallesi." };
        }

        const resolved = resolveProgramWorkouts(input.workouts, state.exercises, currentUser.id);
        const createdProgram = domainCreateProgram(
          { ...input, athleteId: nextAthleteId, athleteEmail: resolvedTargetUser?.email, workouts: resolved.workouts },
          currentUser.id,
        );

        if (supabase) {
          const previousState = state;
          setState((previous) =>
            applyProgramStatusUpdate(
              {
                ...previous,
                exercises: [...resolved.customExercises, ...previous.exercises],
                plans: [createdProgram, ...previous.plans],
              },
              createdProgram.id,
              "active",
            ),
          );
          const response = await fetch("/api/programs", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ...input,
              athleteId: nextAthleteId,
              athleteEmail: resolvedTargetUser?.email,
              workouts: resolved.workouts,
              customExercises: resolved.customExercises,
            }),
          });
          const payload = (await response.json().catch(() => null)) as { message?: string; programId?: string } | null;
          if (!response.ok) {
            setState(previousState);
            await refreshSupabaseVisibleState();
            return { ok: false, message: payload?.message ?? "Treeniohjelman luonti epäonnistui." };
          }

          void refreshSupabaseVisibleState();
          const programId = payload?.programId ?? createdProgram.id;
          warnIfOptimisticServerIdLeak("program", programId);
          return { ok: true, programId };
        }

        setState((previous) =>
          applyProgramStatusUpdate(
            {
              ...previous,
              exercises: [...resolved.customExercises, ...previous.exercises],
              plans: [createdProgram, ...previous.plans],
            },
            createdProgram.id,
            "active",
          ),
        );

        warnIfOptimisticServerIdLeak("program", createdProgram.id);
        return { ok: true, programId: createdProgram.id };
      },
      async updateProgram(programId, patch) {
        if (!currentUser || !canActAsCoach(currentUser.role)) {
          return { ok: false, message: "Vain admin tai valmentaja voi muokata treeniohjelmaa." };
        }

        const program = state.plans.find((item) => item.id === programId);
        if (!program) {
          return { ok: false, message: "Treeniohjelmaa ei löytynyt." };
        }

        if (!isAdminRole(currentUser.role) && program.coachId !== currentUser.id) {
          return { ok: false, message: "Voit muokata vain omia ohjelmiasi." };
        }

        const resolvedTargetUser = patch.athleteId ? resolveProgramTargetFromState(state, patch.athleteId) : null;
        const nextAthleteId = resolvedTargetUser?.id ?? patch.athleteId ?? program.athleteId;
        if (nextAthleteId !== program.athleteId) {
          if (!canManageProgramTarget(state, currentUser, nextAthleteId)) {
            return {
              ok: false,
              message: "Voit siirtää ohjelman vain itsellesi tai omalle valmennettavallesi.",
            };
          }

          if (!canRetargetProgramInState(state, programId)) {
            return {
              ok: false,
              message: "Käyttäjää ei voi vaihtaa, koska ohjelmasta on jo käynnistetty treenejä tai historiaa.",
            };
          }
        }

        const resolvedWorkouts = patch.workouts
          ? resolveProgramWorkouts(patch.workouts, state.exercises, currentUser.id)
          : null;
        const updatedProgram = domainUpdateProgram(program, {
          ...patch,
          athleteId: patch.athleteId ? nextAthleteId : undefined,
          athleteEmail: resolvedTargetUser?.email,
          workouts: resolvedWorkouts?.workouts,
        });

        if (supabase) {
          const previousState = state;
          setState((previous) => ({
            ...previous,
            exercises: resolvedWorkouts
              ? [...resolvedWorkouts.customExercises, ...previous.exercises]
              : previous.exercises,
            plans: previous.plans.map((item) => (item.id === updatedProgram.id ? updatedProgram : item)),
          }));
          const response = await fetch(`/api/programs/${encodeURIComponent(programId)}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ...patch,
              athleteId: patch.athleteId ? nextAthleteId : undefined,
              athleteEmail: resolvedTargetUser?.email,
              workouts: resolvedWorkouts?.workouts,
              customExercises: resolvedWorkouts?.customExercises,
            }),
          });
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          if (!response.ok) {
            setState(previousState);
            await refreshSupabaseVisibleState();
            return { ok: false, message: payload?.message ?? "Treeniohjelman päivitys epäonnistui." };
          }

          void refreshSupabaseVisibleState();
          return { ok: true };
        }

        setState((previous) => ({
          ...previous,
          exercises: resolvedWorkouts
            ? [...resolvedWorkouts.customExercises, ...previous.exercises]
            : previous.exercises,
          plans: previous.plans.map((item) => (item.id === updatedProgram.id ? updatedProgram : item)),
        }));

        return { ok: true };
      },
      async setProgramStatus(programId, status) {
        if (!currentUser || !canActAsCoach(currentUser.role)) {
          return { ok: false, message: "Vain admin tai valmentaja voi muuttaa ohjelman tilaa." };
        }

        const program = state.plans.find((item) => item.id === programId);
        if (!program) {
          return { ok: false, message: "Treeniohjelmaa ei löytynyt." };
        }

        if (!isAdminRole(currentUser.role) && program.coachId !== currentUser.id) {
          return { ok: false, message: "Voit hallita vain omia ohjelmiasi." };
        }

        if (getProgramStatus(program) === status) {
          return { ok: true };
        }

        if (supabase) {
          const previousState = state;
          setState((previous) => applyProgramStatusUpdate(previous, programId, status));
          const response = await fetch(`/api/programs/${encodeURIComponent(programId)}/status`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ status }),
          });
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          if (!response.ok) {
            setState(previousState);
            await refreshSupabaseVisibleState();
            return { ok: false, message: payload?.message ?? "Ohjelman tilan päivitys epäonnistui." };
          }

          void refreshSupabaseVisibleState();
          return { ok: true };
        }

        setState((previous) => applyProgramStatusUpdate(previous, programId, status));
        return { ok: true };
      },
      async deleteProgram(programId) {
        if (!currentUser || !canActAsCoach(currentUser.role)) {
          return { ok: false, message: "Vain admin tai valmentaja voi poistaa treeniohjelman." };
        }

        const program = state.plans.find((item) => item.id === programId);
        if (!program) {
          return { ok: false, message: "Treeniohjelmaa ei löytynyt." };
        }

        if (!isAdminRole(currentUser.role) && program.coachId !== currentUser.id) {
          return { ok: false, message: "Voit poistaa vain omia ohjelmiasi." };
        }

        if (!canDeleteProgramFromState(state, programId)) {
          return {
            ok: false,
            message: "Ohjelmaa ei voi poistaa, koska siitä on jo käynnistetty treenejä tai historiaa.",
          };
        }

        if (supabase) {
          const previousState = state;
          setState((previous) => applyProgramDeletion(previous, programId));
          const response = await fetch(`/api/programs/${encodeURIComponent(programId)}`, {
            method: "DELETE",
          });
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          if (!response.ok) {
            setState(previousState);
            await refreshSupabaseVisibleState();
            return { ok: false, message: payload?.message ?? "Treeniohjelman poisto epäonnistui." };
          }

          void refreshSupabaseVisibleState();
          return { ok: true };
        }

        setState((previous) => applyProgramDeletion(previous, programId));
        return { ok: true };
      },
      async startProgramWorkout(programId, programWorkoutId) {
        if (!currentUser) {
          return { ok: false, message: "Kirjaudu sisään ennen harjoituksen käynnistystä." };
        }

        const program = state.plans.find((item) => item.id === programId && item.athleteId === currentUser.id);
        if (!program) {
          return { ok: false, message: "Ohjelmaa ei löytynyt tai se ei kuulu sinulle." };
        }

        if (!isProgramActive(program)) {
          return { ok: false, message: "Ohjelma on arkistoitu eikä siitä voi käynnistää uutta treeniä." };
        }

        const existingActive = state.scheduledWorkouts.find(
          (item) =>
            item.athleteId === currentUser.id &&
            item.programWorkoutId === programWorkoutId &&
            (item.status === "in_progress" || item.status === "cancelled"),
        );
        const existingActiveIsOptimistic = Boolean(existingActive?.id.startsWith("workout_"));
        if (existingActive && (!supabase || !existingActiveIsOptimistic)) {
          return { ok: true, scheduledWorkoutId: existingActive.id };
        }

        const blockingWorkout = resolveBlockingWorkoutStart(state, currentUser.id, programWorkoutId);
        if (blockingWorkout) {
          return {
            ok: false,
            message: `Sinulla on kesken oleva treeni "${displayWorkoutTitle(blockingWorkout.title)}". Jatka se ensin.`,
          };
        }

        if (supabase) {
          try {
            const started = existingActiveIsOptimistic
              ? null
              : domainStartProgramWorkout(state, programId, programWorkoutId, currentUser.id);
            const optimisticWorkoutId = existingActiveIsOptimistic
              ? existingActive?.id ?? null
              : started?.scheduledWorkout.id ?? null;
            const previousState = state;
            if (started) {
              setState(started.state);
            }

            const response = await fetch("/api/workouts/start", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ programId, programWorkoutId }),
            });
            const payload = (await response.json().catch(() => null)) as { message?: string; scheduledWorkoutId?: string } | null;
            if (!response.ok) {
              setState(previousState);
              await refreshSupabaseVisibleState();
              return { ok: false, message: payload?.message ?? "Harjoituksen käynnistys epäonnistui." };
            }

            const scheduledWorkoutId = payload?.scheduledWorkoutId ?? optimisticWorkoutId ?? undefined;
            if (optimisticWorkoutId && scheduledWorkoutId && scheduledWorkoutId !== optimisticWorkoutId) {
              setState((current) => rekeyOptimisticWorkoutArtifacts(current, optimisticWorkoutId, scheduledWorkoutId));
              await refreshSupabaseVisibleState();
            } else {
              void refreshSupabaseVisibleState();
            }
            warnIfOptimisticServerIdLeak("workout", scheduledWorkoutId);
            return { ok: true, scheduledWorkoutId };
          } catch {
            const response = await fetch("/api/workouts/start", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ programId, programWorkoutId }),
            });
            const payload = (await response.json().catch(() => null)) as { message?: string; scheduledWorkoutId?: string } | null;
            if (!response.ok) {
              return { ok: false, message: payload?.message ?? "Harjoituksen käynnistys epäonnistui." };
            }

            void refreshSupabaseVisibleState();
            warnIfOptimisticServerIdLeak("workout", payload?.scheduledWorkoutId);
            return { ok: true, scheduledWorkoutId: payload?.scheduledWorkoutId };
          }
        }

        try {
          const started = domainStartProgramWorkout(state, programId, programWorkoutId, currentUser.id);
          setState(started.state);
          warnIfOptimisticServerIdLeak("workout", started.scheduledWorkout.id);
          return { ok: true, scheduledWorkoutId: started.scheduledWorkout.id };
        } catch {
          return { ok: false, message: "Harjoituksen käynnistys epäonnistui." };
        }
      },
      async addConversationComment(body, options) {
        if (!currentUser) {
          return { ok: false, message: "Kirjaudu sisään ennen kommentointia." };
        }

        const trimmedBody = body.trim();
        if (!trimmedBody) {
          return { ok: false, message: "Kirjoita kommentti ennen lähettämistä." };
        }

        if (options?.scheduledWorkoutId) {
          const workout = state.scheduledWorkouts.find((item) => item.id === options.scheduledWorkoutId);
          if (!workout) {
            return { ok: false, message: "Treeniä ei löytynyt." };
          }

          const canCommentAsAthlete =
            currentUser.role === "athlete" && workout.athleteId === currentUser.id;
          const canCommentAsCoach =
            isAdminRole(currentUser.role) ||
            (canActAsCoach(currentUser.role) && canCoachManageAthlete(state, currentUser.id, workout.athleteId));

          if (!canCommentAsAthlete && !canCommentAsCoach) {
            return { ok: false, message: "Sinulla ei ole oikeutta kommentoida tätä treeniä." };
          }

          const entry = buildConversationEntry({
            athleteId: workout.athleteId,
            coachId: workout.coachId,
            authorUserId: currentUser.id,
            authorRole: currentUser.role,
            type: "comment",
            body: trimmedBody,
            contextType: "workout",
            contextId: workout.id,
            contextLabel: options.contextLabel ?? displayWorkoutTitle(workout.title),
          });

          setState((previous) => appendConversationEntry(previous, entry));

          if (supabase) {
            try {
              await persistConversationEntry(supabase, entry);
              await refreshSupabaseVisibleState();
            } catch (error) {
              setState((previous) => removeConversationEntry(previous, entry.id));
              await refreshSupabaseVisibleState();
              return {
                ok: false,
                message:
                  error instanceof Error && error.message
                    ? error.message
                    : "Viestin tallennus epäonnistui. Yritä uudelleen.",
              };
            }
          }

          return { ok: true };
        }

        if (options?.trainingPlanId) {
          const plan = state.plans.find((item) => item.id === options.trainingPlanId);
          if (!plan) {
            return { ok: false, message: "Ohjelmaa ei löytynyt." };
          }

          const canCommentAsAthlete =
            currentUser.role === "athlete" && plan.athleteId === currentUser.id;
          const canCommentAsCoach =
            isAdminRole(currentUser.role) ||
            (canActAsCoach(currentUser.role) && canCoachManageAthlete(state, currentUser.id, plan.athleteId));

          if (!canCommentAsAthlete && !canCommentAsCoach) {
            return { ok: false, message: "Sinulla ei ole oikeutta kommentoida tätä ohjelmaa." };
          }

          const entry = buildConversationEntry({
            athleteId: plan.athleteId,
            coachId: plan.coachId,
            authorUserId: currentUser.id,
            authorRole: currentUser.role,
            type: "comment",
            body: trimmedBody,
            contextType: "program",
            contextId: plan.id,
            contextLabel: options.contextLabel ?? plan.title,
          });

          setState((previous) => appendConversationEntry(previous, entry));

          if (supabase) {
            try {
              await persistConversationEntry(supabase, entry);
              await refreshSupabaseVisibleState();
            } catch (error) {
              setState((previous) => removeConversationEntry(previous, entry.id));
              await refreshSupabaseVisibleState();
              return {
                ok: false,
                message:
                  error instanceof Error && error.message
                    ? error.message
                    : "Viestin tallennus epäonnistui. Yritä uudelleen.",
              };
            }
          }

          return { ok: true };
        }

        if (currentUser.role === "athlete") {
          const latestCoachId = resolvePrimaryCoachIdForAthlete(state, currentUser.id);
          if (!latestCoachId) {
            return { ok: false, message: "Keskustelu tarvitsee ensin aktiivisen valmentajasuhteen." };
          }

          const entry = buildConversationEntry({
            athleteId: currentUser.id,
            coachId: latestCoachId,
            authorUserId: currentUser.id,
            authorRole: currentUser.role,
            type: "comment",
            body: trimmedBody,
            contextType: "general",
          });

          setState((previous) => appendConversationEntry(previous, entry));

          if (supabase) {
            try {
              await persistConversationEntry(supabase, entry);
              await refreshSupabaseVisibleState();
            } catch (error) {
              setState((previous) => removeConversationEntry(previous, entry.id));
              await refreshSupabaseVisibleState();
              return {
                ok: false,
                message:
                  error instanceof Error && error.message
                    ? error.message
                    : "Viestin tallennus epäonnistui. Yritä uudelleen.",
              };
            }
          }

          return { ok: true };
        }

        if (canActAsCoach(currentUser.role) && options?.athleteId) {
          const athleteId = options.athleteId;
          if (!isAdminRole(currentUser.role) && !canCoachManageAthlete(state, currentUser.id, athleteId)) {
            return { ok: false, message: "Voit keskustella vain omien valmennettaviesi kanssa." };
          }

          const resolvedCoachId = isAdminRole(currentUser.role)
            ? resolvePrimaryCoachIdForAthlete(state, athleteId) ?? currentUser.id
            : currentUser.id;

          const entry = buildConversationEntry({
            athleteId,
            coachId: resolvedCoachId,
            authorUserId: currentUser.id,
            authorRole: currentUser.role,
            type: "comment",
            body: trimmedBody,
            contextType: "general",
          });

          setState((previous) => appendConversationEntry(previous, entry));

          if (supabase) {
            try {
              await persistConversationEntry(supabase, entry);
              await refreshSupabaseVisibleState();
            } catch (error) {
              setState((previous) => removeConversationEntry(previous, entry.id));
              await refreshSupabaseVisibleState();
              return {
                ok: false,
                message:
                  error instanceof Error && error.message
                    ? error.message
                    : "Viestin tallennus epäonnistui. Yritä uudelleen.",
              };
            }
          }

          return { ok: true };
        }

        return { ok: false, message: "Yleinen keskustelu tarvitsee valitun treenaajan tai ohjelman." };
      },
      markConversationRead() {
        if (!currentUser) {
          return;
        }

        let changedEntryIds: string[] = [];

        setState((previous) => {
          const hasUnread = previous.conversationEntries.some(
            (entry) =>
              isConversationVisibleToUser(previous, entry, currentUser) &&
              !entry.readByUserIds.includes(currentUser.id),
          );

          if (!hasUnread) {
            return previous;
          }

          changedEntryIds = previous.conversationEntries
            .filter(
              (entry) =>
                isConversationVisibleToUser(previous, entry, currentUser) && !entry.readByUserIds.includes(currentUser.id),
            )
            .map((entry) => entry.id);

          return {
            ...previous,
            conversationEntries: previous.conversationEntries.map((entry) =>
              isConversationVisibleToUser(previous, entry, currentUser) && !entry.readByUserIds.includes(currentUser.id)
                ? { ...entry, readByUserIds: [...entry.readByUserIds, currentUser.id] }
                : entry,
            ),
          };
        });

        if (supabase && changedEntryIds.length > 0) {
          const conversationEntriesSnapshot = state.conversationEntries;
          void Promise.all(
            changedEntryIds.map(async (entryId) => {
              const entry = conversationEntriesSnapshot.find((item) => item.id === entryId);
              if (!entry) {
                return;
              }

              const nextReadByUserIds = Array.from(new Set([...entry.readByUserIds, currentUser.id]));
              await supabase
                .from("conversation_entries")
                .update({ read_by_user_ids: nextReadByUserIds })
                .eq("id", entryId);
            }),
          ).then(() => refreshSupabaseVisibleState()).catch(() => refreshSupabaseVisibleState());
        }
      },
      async startWorkout(scheduledWorkoutId) {
        if (!currentUser) {
          return { ok: false, message: "Kirjaudu sisään ennen treenin käynnistystä." };
        }

        const workout = state.scheduledWorkouts.find((item) => item.id === scheduledWorkoutId);
        if (!workout || (!isAdminRole(currentUser.role) && workout.athleteId !== currentUser.id)) {
          return { ok: false, message: "Treeniä ei löytynyt." };
        }

        const previousState = state;
        setState((previous) => domainStartSession(previous, scheduledWorkoutId).state);

        if (supabase) {
          const response = await fetch(`/api/workouts/${encodeURIComponent(scheduledWorkoutId)}/start`, {
            method: "POST",
          });
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          if (!response.ok) {
            setState(previousState);
            await refreshSupabaseVisibleState();
            return { ok: false, message: payload?.message ?? "Treeniä ei voitu käynnistää." };
          }

          void refreshSupabaseVisibleState();
        }

        return { ok: true };
      },
      async updateWorkoutDuration(scheduledWorkoutId, durationSeconds) {
        if (!currentUser) {
          return { ok: false, message: "Kirjaudu sisään ennen treeniajan muokkausta." };
        }

        if (durationSeconds < 60) {
          return { ok: false, message: "Anna treeniajalle vähintään 1 minuutti." };
        }

        const workout = state.scheduledWorkouts.find((item) => item.id === scheduledWorkoutId);
        if (!workout || (!isAdminRole(currentUser.role) && workout.athleteId !== currentUser.id)) {
          return { ok: false, message: "Treeniä ei löytynyt." };
        }

        if (workout.status !== "completed") {
          return { ok: false, message: "Treeniaikaa voi muokata vain valmiilta treeniltä." };
        }

        const session = state.sessions.find((item) => item.scheduledWorkoutId === scheduledWorkoutId);
        if (!session || !session.completedAt) {
          return { ok: false, message: "Valmiin treenin aikaa ei löytynyt muokattavaksi." };
        }

        const completedAtMs = new Date(session.completedAt).getTime();
        if (!Number.isFinite(completedAtMs)) {
          return { ok: false, message: "Treeniaikaa ei voitu päivittää." };
        }

        const nextStartedAt = new Date(
          completedAtMs - (durationSeconds + (session.pausedDurationSeconds ?? 0)) * 1000,
        ).toISOString();

        const previousState = state;

        setState((previous) => ({
          ...previous,
          sessions: previous.sessions.map((item) =>
            item.scheduledWorkoutId === scheduledWorkoutId
              ? {
                  ...item,
                  startedAt: nextStartedAt,
                }
              : item,
          ),
        }));

        if (supabase) {
          const response = await fetch(`/api/workouts/${encodeURIComponent(scheduledWorkoutId)}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ durationSeconds }),
          });
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          if (!response.ok) {
            setState(previousState);
            await refreshSupabaseVisibleState();
            return { ok: false, message: payload?.message ?? "Treeniajan päivitys epäonnistui." };
          }

          void refreshSupabaseVisibleState();
          return { ok: true };
        }

        return { ok: true };
      },
      async updateWorkoutSet(scheduledWorkoutId, logId, patch) {
        if (!currentUser) {
          return;
        }

        const workout = state.scheduledWorkouts.find((item) => item.id === scheduledWorkoutId);
        if (!workout || workout.athleteId !== currentUser.id) {
          return;
        }

        if (workout.status !== "in_progress") {
          return;
        }

        const requestKey = `${scheduledWorkoutId}:${logId}`;
        const previousRequest = workoutSetRequestStateRef.current.get(requestKey);
        const nextRevision = (previousRequest?.revision ?? 0) + 1;
        const mergedPatch = {
          ...previousRequest?.patch,
          ...patch,
        } satisfies WorkoutUpdateInput;

        workoutSetRequestStateRef.current.set(requestKey, {
          revision: nextRevision,
          patch: mergedPatch,
        });

        setState((previous) => domainUpdateSessionSet(previous, scheduledWorkoutId, logId, mergedPatch));

        if (supabase) {
          const response = await fetch(`/api/workouts/${encodeURIComponent(scheduledWorkoutId)}/sets/${encodeURIComponent(logId)}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(mergedPatch),
          }).catch(() => null);

          const latestRequest = workoutSetRequestStateRef.current.get(requestKey);
          if (!latestRequest || latestRequest.revision !== nextRevision) {
            return;
          }

          workoutSetRequestStateRef.current.delete(requestKey);

          if (!response?.ok) {
            await refreshSupabaseVisibleState();
          }
          return;
        }

        workoutSetRequestStateRef.current.delete(requestKey);
      },
      saveWorkoutNote(scheduledWorkoutId, body) {
        if (!currentUser) {
          return;
        }

        const workout = state.scheduledWorkouts.find((item) => item.id === scheduledWorkoutId);
        if (!workout || workout.athleteId !== currentUser.id) {
          return;
        }

        const trimmedBody = body.trim();
        const existingNote = state.notes.find((note) => {
          const session = state.sessions.find((item) => item.id === note.sessionId);
          return session?.scheduledWorkoutId === scheduledWorkoutId;
        });

        if (existingNote?.body.trim() === trimmedBody) {
          return;
        }

        setState((previous) => domainSaveSessionNote(previous, scheduledWorkoutId, body));

        if (supabase) {
          void fetch(`/api/workouts/${encodeURIComponent(scheduledWorkoutId)}/note`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ body }),
          })
            .then((response) => {
              if (!response.ok) {
                return refreshSupabaseVisibleState();
              }
              return undefined;
            })
            .catch(() => refreshSupabaseVisibleState());
        }
      },
      async completeWorkout(scheduledWorkoutId) {
        if (!currentUser) {
          return { ok: false, message: "Kirjaudu sisään ennen treenin merkintää valmiiksi." };
        }

        const workout = state.scheduledWorkouts.find((item) => item.id === scheduledWorkoutId);
        if (!workout || workout.athleteId !== currentUser.id) {
          return { ok: false, message: "Treeniä ei löytynyt." };
        }

        const session = state.sessions.find((item) => item.scheduledWorkoutId === scheduledWorkoutId);
        if (!session) {
          return { ok: false, message: "Aloita treeni ennen kuin merkitset sen valmiiksi." };
        }

        if (!canCompleteSession(state, scheduledWorkoutId)) {
          return { ok: false, message: "Treeniä ei voitu merkitä valmiiksi." };
        }

        if (supabase) {
          const previousState = state;
          setState((current) => domainCompleteSession(current, scheduledWorkoutId));
          const response = await fetch(`/api/workouts/${encodeURIComponent(scheduledWorkoutId)}/complete`, {
            method: "POST",
          });
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          if (!response.ok) {
            setState(previousState);
            await refreshSupabaseVisibleState();
            return { ok: false, message: payload?.message ?? "Treeniä ei voitu merkitä valmiiksi." };
          }

          void refreshSupabaseVisibleState();
          return { ok: true };
        }

        setState((previous) => domainCompleteSession(previous, scheduledWorkoutId));
        return { ok: true };
      },
      async cancelWorkout(scheduledWorkoutId) {
        if (!currentUser) {
          return { ok: false, message: "Kirjaudu sisään ennen treenin keskeytystä." };
        }

        const workout = state.scheduledWorkouts.find((item) => item.id === scheduledWorkoutId);
        if (!workout || workout.athleteId !== currentUser.id) {
          return { ok: false, message: "Treeniä ei löytynyt." };
        }

        if (workout.status === "completed") {
          return { ok: false, message: "Valmista treeniä ei voi keskeyttää." };
        }

        if (supabase) {
          const previousState = state;
          setState((current) => domainCancelSession(current, scheduledWorkoutId));
          const response = await fetch(`/api/workouts/${encodeURIComponent(scheduledWorkoutId)}/cancel`, {
            method: "POST",
          });
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          if (!response.ok) {
            setState(previousState);
            await refreshSupabaseVisibleState();
            return { ok: false, message: payload?.message ?? "Treenin keskeytys epäonnistui." };
          }

          void refreshSupabaseVisibleState();
          return { ok: true };
        }

        setState((previous) => domainCancelSession(previous, scheduledWorkoutId));
        return { ok: true };
      },
      async deleteWorkout(scheduledWorkoutId) {
        if (!currentUser) {
          return { ok: false, message: "Kirjaudu sisään ennen treenin poistamista." };
        }

        const workout = state.scheduledWorkouts.find((item) => item.id === scheduledWorkoutId);
        if (!workout || workout.athleteId !== currentUser.id) {
          return { ok: false, message: "Treeniä ei löytynyt." };
        }

        if (!workout.programWorkoutId) {
          return { ok: false, message: "Vain ohjelmasta käynnistetyn treenin voi poistaa." };
        }

        if (supabase) {
          const previousState = state;
          setState((current) => domainDeleteScheduledWorkout(current, scheduledWorkoutId));
          const response = await fetch(`/api/workouts/${encodeURIComponent(scheduledWorkoutId)}`, {
            method: "DELETE",
          });
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          if (!response.ok) {
            setState(previousState);
            await refreshSupabaseVisibleState();
            return { ok: false, message: payload?.message ?? "Treenin poisto epäonnistui." };
          }

          setState((current) => clearOptimisticWorkoutArtifacts(current, scheduledWorkoutId));
          void refreshSupabaseVisibleState();
          return { ok: true };
        }

        setState((previous) => domainDeleteScheduledWorkout(previous, scheduledWorkoutId));
        return { ok: true };
      },
      getCoachAthletes(coachId) {
        return domainGetCoachAthletes(state, coachId);
      },
    };
  }, [state, authenticatedUser, currentUser, hasStoredSession, isHydrated, isImpersonating, supabase]);

  return (
    <AppStateContext.Provider value={value}>
      {children}
      {toast ? (
        <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-center sm:bottom-6">
          <div
            role="status"
            aria-live="polite"
            className={`pointer-events-auto w-full max-w-md rounded-2xl border px-4 py-3 text-sm font-medium shadow-[0_20px_40px_-24px_var(--shadow)] ${
              toast.tone === "success"
                ? "border-[color-mix(in_srgb,var(--success)_45%,var(--border))] bg-[color:color-mix(in_srgb,var(--success)_14%,var(--surface))] text-[var(--text)]"
                : toast.tone === "danger"
                  ? "border-[color-mix(in_srgb,var(--danger)_45%,var(--border))] bg-[color:color-mix(in_srgb,var(--danger)_12%,var(--surface))] text-[var(--text)]"
                  : "border-[color-mix(in_srgb,var(--accent)_45%,var(--border))] bg-[color:color-mix(in_srgb,var(--accent)_12%,var(--surface))] text-[var(--text)]"
            }`}
          >
            {toast.message}
          </div>
        </div>
      ) : null}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("useAppState must be used within AppStateProvider");
  }

  return context;
}
