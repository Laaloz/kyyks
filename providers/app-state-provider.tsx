"use client";

import {
  canCoachManageAthlete,
  canCompleteSession,
  cancelSession as domainCancelSession,
  completeSession as domainCompleteSession,
  cloneDemoState,
  createProgram as domainCreateProgram,
  createTrainingPlan as domainCreateTrainingPlan,
  createInvite as domainCreateInvite,
  createTemplate as domainCreateTemplate,
  duplicateTemplate as domainDuplicateTemplate,
  deleteScheduledWorkout as domainDeleteScheduledWorkout,
  getCoachAthletes as domainGetCoachAthletes,
  isInviteExpired,
  saveSessionNote as domainSaveSessionNote,
  scheduleWorkout as domainScheduleWorkout,
  startProgramWorkout as domainStartProgramWorkout,
  startSession as domainStartSession,
  updateProgram as domainUpdateProgram,
  updateSessionSet as domainUpdateSessionSet,
} from "@/lib/domain";
import { defaultGlobalExercises } from "@/lib/demo-data";
import type {
  AppState,
  Exercise,
  InviteInput,
  ProgramBuilderInput,
  ProgramUpdateInput,
  Role,
  UserProfile,
  TemplateBuilderInput,
  WorkoutUpdateInput,
} from "@/lib/types";
import { makeId } from "@/lib/utils";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

const STATE_KEY = "rookiapp-state-v2";
const SESSION_KEY = "rookiapp-session-v1";

function inferSplitTypeFromTitle(title: string) {
  const normalized = title.toLowerCase();
  if (normalized.includes("ylä")) return "upper" as const;
  if (normalized.includes("ala") || normalized.includes("voimapäivä")) return "lower" as const;
  if (normalized.includes("koko")) return "full_body" as const;
  return "custom" as const;
}

function normalizeState(raw: AppState): AppState {
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
    exercises: Array.from(mergedExerciseById.values()),
    plans: raw.plans.map((plan) => ({
      ...plan,
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
  };
}

type LoginResult =
  | { ok: true }
  | { ok: false; message: string };

type ActionResult =
  | { ok: true; scheduledWorkoutId?: string }
  | { ok: false; message: string };

type LegacyTrainingPlanInput = {
  title: string;
  athleteId: string;
  startDate: string;
  weekCount: number;
  templateIds: string[];
};

const CUSTOM_EXERCISE_VALUE = "__custom__";

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

interface AppStateContextValue {
  state: AppState;
  currentUser: UserProfile | null;
  currentRole: Role | null;
  isHydrated: boolean;
  login: (email: string, password: string) => LoginResult;
  logout: () => void;
  loginAsDemoUser: (userId: string) => void;
  createInvite: (input: InviteInput) => ActionResult;
  acceptInvite: (token: string, fullName: string, password: string) => LoginResult;
  createTemplate: (input: TemplateBuilderInput) => ActionResult;
  createTrainingPlan: (input: LegacyTrainingPlanInput) => ActionResult;
  createProgram: (input: ProgramBuilderInput) => ActionResult;
  updateProgram: (programId: string, patch: ProgramUpdateInput) => ActionResult;
  startProgramWorkout: (programId: string, programWorkoutId: string) => ActionResult;
  duplicateTemplate: (templateId: string) => ActionResult;
  scheduleTemplate: (templateId: string, athleteId: string, scheduledDate: string) => ActionResult;
  startWorkout: (scheduledWorkoutId: string) => void;
  updateWorkoutSet: (scheduledWorkoutId: string, logId: string, patch: WorkoutUpdateInput) => void;
  saveWorkoutNote: (scheduledWorkoutId: string, body: string) => void;
  completeWorkout: (scheduledWorkoutId: string) => ActionResult;
  cancelWorkout: (scheduledWorkoutId: string) => ActionResult;
  deleteWorkout: (scheduledWorkoutId: string) => ActionResult;
  getCoachAthletes: (coachId: string) => UserProfile[];
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AppState>(cloneDemoState);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const rawState = window.localStorage.getItem(STATE_KEY);
    const rawSession = window.localStorage.getItem(SESSION_KEY);

    if (rawState) {
      try {
        setState(normalizeState(JSON.parse(rawState) as AppState));
      } catch {
        setState(cloneDemoState());
      }
    }

    if (rawSession) {
      setCurrentUserId(rawSession);
    }

    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }, [isHydrated, state]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (currentUserId) {
      window.localStorage.setItem(SESSION_KEY, currentUserId);
    } else {
      window.localStorage.removeItem(SESSION_KEY);
    }
  }, [isHydrated, currentUserId]);

  const currentUser = useMemo(
    () => state.users.find((user) => user.id === currentUserId) ?? null,
    [state.users, currentUserId],
  );

  const value = useMemo<AppStateContextValue>(() => {
    return {
      state,
      currentUser,
      currentRole: currentUser?.role ?? null,
      isHydrated,
      login(email, password) {
        const user = state.users.find((candidate) => candidate.email.toLowerCase() === email.toLowerCase());

        if (!user) {
          return { ok: false, message: "Käyttäjää ei löytynyt." };
        }

        if (user.status !== "active") {
          return { ok: false, message: "Kutsu on vielä hyväksymättä." };
        }

        if (user.demoPassword !== password) {
          return { ok: false, message: "Väärä salasana." };
        }

        setCurrentUserId(user.id);
        return { ok: true };
      },
      logout() {
        setCurrentUserId(null);
      },
      loginAsDemoUser(userId) {
        setCurrentUserId(userId);
      },
      createInvite(input) {
        if (!currentUser) {
          return { ok: false, message: "Kirjaudu sisään ennen kutsun luontia." };
        }

        const duplicatePendingInvite = state.invites.find(
          (invite) => invite.email.toLowerCase() === input.email.toLowerCase() && invite.status === "pending",
        );

        if (duplicatePendingInvite) {
          return { ok: false, message: "Tälle sähköpostille on jo avoin kutsu." };
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
      acceptInvite(token, fullName, password) {
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

        setCurrentUserId(userId);
        return { ok: true };
      },
      createTemplate(input) {
        if (!currentUser || currentUser.role !== "coach") {
          return { ok: false, message: "Vain valmentaja voi luoda treenipohjan." };
        }

        const template = domainCreateTemplate(input, currentUser.id);
        setState((previous) => ({
          ...previous,
          templates: [template, ...previous.templates],
        }));
        return { ok: true };
      },
      createTrainingPlan(input) {
        if (!currentUser || currentUser.role !== "coach") {
          return { ok: false, message: "Vain valmentaja voi luoda treeniohjelman." };
        }

        if (!canCoachManageAthlete(state, currentUser.id, input.athleteId)) {
          return { ok: false, message: "Voit luoda ohjelman vain omalle valmennettavallesi." };
        }

        const templates = input.templateIds.map((templateId) =>
          state.templates.find((template) => template.id === templateId),
        );

        if (templates.some((template) => !template)) {
          return { ok: false, message: "Valittuja treenejä ei löytynyt." };
        }

        const resolvedTemplates = templates.filter(
          (template): template is AppState["templates"][number] => Boolean(template),
        );

        if (resolvedTemplates.some((template) => template.coachId !== currentUser.id)) {
          return { ok: false, message: "Voit käyttää ohjelmassa vain omia treenipohjiasi." };
        }

        const created = domainCreateTrainingPlan(input, currentUser.id);
        const templateTitleById = new Map(resolvedTemplates.map((template) => [template.id, template.title]));

        setState((previous) => ({
          ...previous,
          plans: [created.plan, ...previous.plans],
          scheduledWorkouts: [
            ...created.scheduledWorkouts.map((workout) => ({
              ...workout,
              title: workout.templateId
                ? templateTitleById.get(workout.templateId) ?? workout.title
                : workout.title,
            })),
            ...previous.scheduledWorkouts,
          ],
        }));

        return { ok: true };
      },
      createProgram(input) {
        if (!currentUser || currentUser.role !== "coach") {
          return { ok: false, message: "Vain valmentaja voi luoda treeniohjelman." };
        }

        if (!canCoachManageAthlete(state, currentUser.id, input.athleteId)) {
          return { ok: false, message: "Voit luoda ohjelman vain omalle valmennettavallesi." };
        }

        const resolved = resolveProgramWorkouts(input.workouts, state.exercises, currentUser.id);
        const createdProgram = domainCreateProgram({ ...input, workouts: resolved.workouts }, currentUser.id);

        setState((previous) => ({
          ...previous,
          exercises: [...resolved.customExercises, ...previous.exercises],
          plans: [createdProgram, ...previous.plans],
        }));

        return { ok: true };
      },
      updateProgram(programId, patch) {
        if (!currentUser || currentUser.role !== "coach") {
          return { ok: false, message: "Vain valmentaja voi muokata treeniohjelmaa." };
        }

        const program = state.plans.find((item) => item.id === programId);
        if (!program) {
          return { ok: false, message: "Treeniohjelmaa ei löytynyt." };
        }

        if (program.coachId !== currentUser.id) {
          return { ok: false, message: "Voit muokata vain omia ohjelmiasi." };
        }

        const resolvedWorkouts = patch.workouts
          ? resolveProgramWorkouts(patch.workouts, state.exercises, currentUser.id)
          : null;

        const updatedProgram = domainUpdateProgram(program, {
          ...patch,
          workouts: resolvedWorkouts?.workouts,
        });

        setState((previous) => ({
          ...previous,
          exercises: resolvedWorkouts
            ? [...resolvedWorkouts.customExercises, ...previous.exercises]
            : previous.exercises,
          plans: previous.plans.map((item) => (item.id === updatedProgram.id ? updatedProgram : item)),
        }));

        return { ok: true };
      },
      startProgramWorkout(programId, programWorkoutId) {
        if (!currentUser || currentUser.role !== "athlete") {
          return { ok: false, message: "Vain treenaaja voi aloittaa ohjelman harjoituksen." };
        }

        const program = state.plans.find((item) => item.id === programId && item.athleteId === currentUser.id);
        if (!program) {
          return { ok: false, message: "Ohjelmaa ei löytynyt tai se ei kuulu sinulle." };
        }

        const existingActive = state.scheduledWorkouts.find(
          (item) =>
            item.athleteId === currentUser.id &&
            item.programWorkoutId === programWorkoutId &&
            (item.status === "scheduled" || item.status === "in_progress"),
        );
        if (existingActive) {
          return { ok: true, scheduledWorkoutId: existingActive.id };
        }

        try {
          const started = domainStartProgramWorkout(state, programId, programWorkoutId, currentUser.id);
          setState(started.state);
          return { ok: true, scheduledWorkoutId: started.scheduledWorkout.id };
        } catch {
          return { ok: false, message: "Harjoituksen käynnistys epäonnistui." };
        }
      },
      duplicateTemplate(templateId) {
        if (!currentUser) {
          return { ok: false, message: "Kirjaudu sisään ennen duplikointia." };
        }

        const template = state.templates.find((item) => item.id === templateId);
        if (!template) {
          return { ok: false, message: "Treenipohjaa ei löytynyt." };
        }

        setState((previous) => ({
          ...previous,
          templates: [domainDuplicateTemplate(template, currentUser.id), ...previous.templates],
        }));
        return { ok: true };
      },
      scheduleTemplate(templateId, athleteId, scheduledDate) {
        if (!currentUser) {
          return { ok: false, message: "Kirjaudu sisään ennen ajastusta." };
        }

        const template = state.templates.find((item) => item.id === templateId);
        if (!template) {
          return { ok: false, message: "Treenipohjaa ei löytynyt." };
        }

        if (currentUser.role === "coach" && !canCoachManageAthlete(state, currentUser.id, athleteId)) {
          return { ok: false, message: "Voit ajastaa treenejä vain omille valmennettavillesi." };
        }

        setState((previous) => ({
          ...previous,
          scheduledWorkouts: [
            domainScheduleWorkout(template, athleteId, currentUser.id, scheduledDate),
            ...previous.scheduledWorkouts,
          ],
        }));
        return { ok: true };
      },
      startWorkout(scheduledWorkoutId) {
        setState((previous) => domainStartSession(previous, scheduledWorkoutId).state);
      },
      updateWorkoutSet(scheduledWorkoutId, logId, patch) {
        setState((previous) => domainUpdateSessionSet(previous, scheduledWorkoutId, logId, patch));
      },
      saveWorkoutNote(scheduledWorkoutId, body) {
        setState((previous) => domainSaveSessionNote(previous, scheduledWorkoutId, body));
      },
      completeWorkout(scheduledWorkoutId) {
        if (!canCompleteSession(state, scheduledWorkoutId)) {
          return { ok: false, message: "Merkitse kaikki sarjat tehdyiksi ennen treenin valmistumista." };
        }

        setState((previous) => domainCompleteSession(previous, scheduledWorkoutId));
        return { ok: true };
      },
      cancelWorkout(scheduledWorkoutId) {
        if (!currentUser || currentUser.role !== "athlete") {
          return { ok: false, message: "Vain treenaaja voi keskeyttää treenin." };
        }

        const workout = state.scheduledWorkouts.find((item) => item.id === scheduledWorkoutId);
        if (!workout || workout.athleteId !== currentUser.id) {
          return { ok: false, message: "Treeniä ei löytynyt." };
        }

        if (workout.status === "completed") {
          return { ok: false, message: "Valmista treeniä ei voi keskeyttää." };
        }

        setState((previous) => domainCancelSession(previous, scheduledWorkoutId));
        return { ok: true };
      },
      deleteWorkout(scheduledWorkoutId) {
        if (!currentUser || currentUser.role !== "athlete") {
          return { ok: false, message: "Vain treenaaja voi poistaa treenin." };
        }

        const workout = state.scheduledWorkouts.find((item) => item.id === scheduledWorkoutId);
        if (!workout || workout.athleteId !== currentUser.id) {
          return { ok: false, message: "Treeniä ei löytynyt." };
        }

        if (workout.status === "completed") {
          return { ok: false, message: "Valmista treeniä ei voi poistaa." };
        }

        if (!workout.programWorkoutId) {
          return { ok: false, message: "Vain ohjelmasta käynnistetyn treenin voi poistaa." };
        }

        setState((previous) => domainDeleteScheduledWorkout(previous, scheduledWorkoutId));
        return { ok: true };
      },
      getCoachAthletes(coachId) {
        return domainGetCoachAthletes(state, coachId);
      },
    };
  }, [state, currentUser, isHydrated]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("useAppState must be used within AppStateProvider");
  }

  return context;
}
