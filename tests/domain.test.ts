import { describe, expect, it } from "vitest";

import {
  calculateSessionDurationSeconds,
  cancelSession,
  canCoachManageAthlete,
  canCompleteSession,
  cloneDemoState,
  completeSession,
  createProgram,
  createInvite,
  createTemplate,
  deleteScheduledWorkout,
  duplicateTemplate,
  getCoachAthletes,
  getSessionProgress,
  isInviteExpired,
  saveSessionNote,
  startProgramWorkout,
  startSession,
  updateProgram,
  updateSessionSet,
} from "@/lib/domain";

describe("domain helpers", () => {
  it("creates template sets from builder input", () => {
    const template = createTemplate(
      {
        title: "Työntöpäivä",
        description: "Rakennetaan varma ylävartalon treeni.",
        goal: "Työntövoima",
        splitType: "upper",
        blockTitle: "Pääbloki",
        exercises: [
          {
            exerciseId: "ex_bench_press",
            instruction: "Pidä toisto puhtaana",
            setCount: 4,
            targetReps: 6,
            targetLoad: 50,
            restSeconds: 120,
          },
        ],
      },
      "user_coach_1",
    );

    expect(template.blocks).toHaveLength(1);
    expect(template.blocks[0]?.exercises[0]?.sets).toHaveLength(4);
    expect(template.blocks[0]?.exercises[0]?.sets[0]?.targetReps).toBe(6);
  });

  it("duplicates template with new identifiers", () => {
    const state = cloneDemoState();
    const original = state.templates[0];
    expect(original).toBeDefined();
    if (!original) {
      return;
    }

    const copy = duplicateTemplate(original, "user_coach_1");

    expect(copy.id).not.toBe(original.id);
    expect(copy.title).toContain("Copy");
    expect(copy.blocks[0]?.id).not.toBe(original.blocks[0]?.id);
  });

  it("allows completing a session without every set marked done", () => {
    const state = cloneDemoState();
    const session = state.sessions.find((item) => item.scheduledWorkoutId === "scheduled_2");
    expect(session).toBeDefined();
    if (!session) {
      return;
    }

    const logId = session.setLogs[0]?.id;
    expect(logId).toBeDefined();
    if (!logId) {
      return;
    }

    expect(canCompleteSession(state, "scheduled_2")).toBe(true);

    const updated = updateSessionSet(state, "scheduled_2", logId, {
      actualLoad: 47.5,
      actualReps: 8,
      done: true,
    });

    expect(updated.sessions.find((item) => item.id === session.id)?.setLogs[0]?.done).toBe(true);
    expect(canCompleteSession(updated, "scheduled_2")).toBe(true);

    const completed = completeSession(updated, "scheduled_2");
    expect(completed.scheduledWorkouts.find((item) => item.id === "scheduled_2")?.status).toBe("completed");
  });

  it("keeps completed status when correcting set data in history", () => {
    const state = cloneDemoState();
    const session = state.sessions.find((item) => item.scheduledWorkoutId === "scheduled_1");
    expect(session).toBeDefined();
    if (!session) {
      return;
    }

    const firstLog = session.setLogs[0];
    expect(firstLog).toBeDefined();
    if (!firstLog) {
      return;
    }

    const corrected = updateSessionSet(state, "scheduled_1", firstLog.id, {
      actualLoad: (firstLog.actualLoad ?? 0) + 2.5,
    });

    expect(corrected.scheduledWorkouts.find((item) => item.id === "scheduled_1")?.status).toBe("completed");
  });

  it("creates pending invites for onboarding", () => {
    const invite = createInvite(
      {
        email: "uusi@rooki.fit",
        role: "athlete",
        coachId: "user_coach_1",
      },
      "user_coach_1",
    );

    expect(invite.status).toBe("pending");
    expect(invite.coachId).toBe("user_coach_1");
  });

  it("creates a dynamic program with workout name overrides", () => {
    const program = createProgram(
      {
        title: "Coach custom ohjelma",
        athleteId: "user_athlete_1",
        workouts: [
          {
            splitType: "upper",
            nameOverride: "Upper Prime",
            defaultRestSeconds: 90,
            exercises: [
              {
                exerciseId: "ex_bench_press",
                exerciseName: "Penkkipunnerrus",
                exerciseNameOverride: "Penkki kisastopilla",
                instruction: "Pidä toisto puhtaana.",
                setCount: 3,
                targetReps: 8,
                targetLoad: 47.5,
                restSeconds: 120,
              },
            ],
          },
          {
            splitType: "custom",
            defaultRestSeconds: 80,
            exercises: [
              {
                exerciseId: "ex_row",
                exerciseName: "Kulmasoutu",
                instruction: "Vedä hallitusti.",
                setCount: 2,
                targetReps: 10,
                targetLoad: 20,
              },
            ],
          },
        ],
      },
      "user_coach_1",
    );

    expect(program.workouts).toHaveLength(2);
    expect(program.status).toBe("active");
    expect(program.workouts?.[0]?.name).toBe("Upper Prime");
    expect(program.workouts?.[0]?.exercises[0]?.exerciseName).toBe("Penkki kisastopilla");
    expect(program.workouts?.[1]?.name).toContain("Harjoitus");
    expect(program.weekCount).toBe(4);
  });

  it("stores and updates optional program description", () => {
    const createdProgram = createProgram(
      {
        title: "Arjen tuki ohjelma",
        description: "Pidä treenin lisäksi huoli, että saat viikossa keskimäärin 8000 askelta päivässä.",
        athleteId: "user_athlete_1",
        workouts: [
          {
            splitType: "full_body",
            nameOverride: "Koko kroppa",
            defaultRestSeconds: 90,
            exercises: [
              {
                exerciseId: "ex_split_squat",
                exerciseName: "Bulgarialainen askelkyykky",
                instruction: "Pidä liike rauhallisena.",
                setCount: 3,
                targetReps: 8,
                targetLoad: 20,
                restSeconds: 90,
              },
            ],
          },
        ],
      },
      "user_coach_1",
    );

    expect(createdProgram.description).toBe(
      "Pidä treenin lisäksi huoli, että saat viikossa keskimäärin 8000 askelta päivässä.",
    );

    const updatedProgram = updateProgram(createdProgram, {
      description: "Muista myös palautumista tukeva iltakävely 2-3 kertaa viikossa.",
    });

    expect(updatedProgram.description).toBe(
      "Muista myös palautumista tukeva iltakävely 2-3 kertaa viikossa.",
    );

    const clearedProgram = updateProgram(updatedProgram, {
      description: "   ",
    });

    expect(clearedProgram.description).toBeUndefined();
  });

  it("updates the program athlete before any workouts have started", () => {
    const createdProgram = createProgram(
      {
        title: "Siirrettava ohjelma",
        athleteId: "user_athlete_1",
        workouts: [
          {
            splitType: "full_body",
            nameOverride: "Koko kroppa",
            defaultRestSeconds: 90,
            exercises: [
              {
                exerciseId: "ex_split_squat",
                exerciseName: "Bulgarialainen askelkyykky",
                instruction: "Pidä liike hallittuna.",
                setCount: 3,
                targetReps: 8,
                targetLoad: 20,
                restSeconds: 90,
              },
            ],
          },
        ],
      },
      "user_coach_1",
    );

    const updatedProgram = updateProgram(createdProgram, {
      athleteId: "user_athlete_2",
    });

    expect(updatedProgram.athleteId).toBe("user_athlete_2");
  });

  it("updates program title and starts a program workout with session logs", () => {
    const baseState = cloneDemoState();
    const createdProgram = createProgram(
      {
        title: "Startattava ohjelma",
        athleteId: "user_athlete_1",
        workouts: [
          {
            splitType: "full_body",
            nameOverride: "Koko kroppa Start",
            defaultRestSeconds: 75,
            exercises: [
              {
                exerciseId: "ex_split_squat",
                exerciseName: "Bulgarialainen askelkyykky",
                supersetGroup: "A",
                instruction: "Kontrolli.",
                setCount: 2,
                targetReps: 8,
                targetLoad: 16,
                restSeconds: 60,
              },
              {
                exerciseId: "ex_plank",
                exerciseName: "Lankku",
                supersetGroup: "A",
                instruction: "Pidä core tiukkana.",
                setCount: 1,
                targetReps: 1,
                targetLoad: 0,
              },
            ],
          },
        ],
      },
      "user_coach_1",
    );

    const updatedProgram = updateProgram(createdProgram, { title: "Päivitetty ohjelma" });
    expect(updatedProgram.title).toBe("Päivitetty ohjelma");

    const state = {
      ...baseState,
      plans: [updatedProgram, ...baseState.plans],
    };

    const workoutId = updatedProgram.workouts?.[0]?.id;
    expect(workoutId).toBeDefined();
    if (!workoutId) {
      return;
    }

    const started = startProgramWorkout(state, updatedProgram.id, workoutId, "user_athlete_1");
    expect(started.scheduledWorkout.programWorkoutId).toBe(workoutId);
    expect(started.scheduledWorkout.status).toBe("cancelled");
    expect(started.session.setLogs.length).toBeGreaterThan(0);
    expect(started.session.setLogs[0]?.targetRestSeconds).toBe(60);
    expect(started.session.setLogs[0]?.supersetGroup).toBe("A");
    expect(started.session.setLogs[2]?.targetRestSeconds).toBe(75);
    expect(started.session.setLogs[2]?.supersetGroup).toBe("A");
    expect(
      started.state.scheduledWorkouts.find((item) => item.id === started.scheduledWorkout.id)?.status,
    ).toBe("in_progress");
  });

  it("preserves workout, exercise and set IDs when updating existing program workouts", () => {
    const createdProgram = createProgram(
      {
        title: "ID säilytys ohjelma",
        athleteId: "user_athlete_1",
        workouts: [
          {
            splitType: "upper",
            nameOverride: "Yläpäivä",
            defaultRestSeconds: 90,
            exercises: [
              {
                exerciseId: "ex_bench_press",
                exerciseName: "Penkki",
                instruction: "Pidä lapatuet.",
                setCount: 2,
                targetReps: 6,
                targetLoad: 60,
                restSeconds: 120,
              },
            ],
          },
        ],
      },
      "user_coach_1",
    );

    const originalWorkoutId = createdProgram.workouts?.[0]?.id;
    const originalExerciseId = createdProgram.workouts?.[0]?.exercises[0]?.id;
    const originalSetOneId = createdProgram.workouts?.[0]?.exercises[0]?.sets[0]?.id;
    const originalSetTwoId = createdProgram.workouts?.[0]?.exercises[0]?.sets[1]?.id;

    expect(originalWorkoutId).toBeDefined();
    expect(originalExerciseId).toBeDefined();
    expect(originalSetOneId).toBeDefined();
    expect(originalSetTwoId).toBeDefined();

    const updatedProgram = updateProgram(createdProgram, {
      workouts: [
        {
          splitType: "upper",
          nameOverride: "Yläpäivä päivitetty",
          defaultRestSeconds: 105,
          exercises: [
            {
              exerciseId: "ex_bench_press",
              exerciseName: "Penkki",
              instruction: "Pidä rinta ylhäällä.",
              setCount: 3,
              targetReps: 7,
              targetLoad: 62.5,
              restSeconds: 120,
            },
          ],
        },
      ],
    });

    const updatedWorkout = updatedProgram.workouts?.[0];
    const updatedExercise = updatedWorkout?.exercises[0];
    const updatedSets = updatedExercise?.sets ?? [];

    expect(updatedWorkout?.id).toBe(originalWorkoutId);
    expect(updatedExercise?.id).toBe(originalExerciseId);
    expect(updatedSets[0]?.id).toBe(originalSetOneId);
    expect(updatedSets[1]?.id).toBe(originalSetTwoId);
    expect(updatedSets[2]?.id).toBeDefined();
    expect(updatedSets[2]?.id).not.toBe(originalSetOneId);
    expect(updatedSets[2]?.id).not.toBe(originalSetTwoId);
  });

  it("stores rep ranges to session logs for range-based progression", () => {
    const baseState = cloneDemoState();
    const createdProgram = createProgram(
      {
        title: "Range progression ohjelma",
        athleteId: "user_athlete_1",
        workouts: [
          {
            splitType: "upper",
            nameOverride: "Yläpäivä 6-8",
            defaultRestSeconds: 90,
            exercises: [
              {
                exerciseId: "ex_bench_press",
                exerciseName: "Penkkipunnerrus",
                instruction: "Nosta kuormaa kun kaikki sarjat osuvat 8:aan.",
                repMode: "range",
                setCount: 3,
                targetReps: 6,
                targetRepsMin: 6,
                targetRepsMax: 8,
                targetLoad: 50,
                restSeconds: 120,
              },
            ],
          },
        ],
      },
      "user_coach_1",
    );

    const state = {
      ...baseState,
      plans: [createdProgram, ...baseState.plans],
    };

    const workoutId = createdProgram.workouts?.[0]?.id;
    expect(workoutId).toBeDefined();
    if (!workoutId) {
      return;
    }

    const started = startProgramWorkout(state, createdProgram.id, workoutId, "user_athlete_1");
    const firstLog = started.session.setLogs[0];
    expect(firstLog).toBeDefined();
    expect(firstLog?.targetReps).toBe(6);
    expect(firstLog?.targetRepsMin).toBe(6);
    expect(firstLog?.targetRepsMax).toBe(8);
  });

  it("reports workout progress for fully completed set logs", () => {
    const state = cloneDemoState();
    const started = startSession(state, "scheduled_3").state;
    const session = started.sessions.find((item) => item.scheduledWorkoutId === "scheduled_3");
    expect(session).toBeDefined();
    if (!session) {
      return;
    }

    const allDone = session.setLogs.reduce((current, log) => {
      return updateSessionSet(current, "scheduled_3", log.id, { done: true });
    }, started);

    const progress = getSessionProgress(allDone, "scheduled_3");
    expect(progress.allDone).toBe(true);
    expect(progress.completedSets).toBe(progress.totalSets);
    expect(canCompleteSession(allDone, "scheduled_3")).toBe(true);
  });

  it("syncs superset set completion across matching set labels in both directions", () => {
    const baseState = cloneDemoState();
    const program = createProgram(
      {
        title: "Superset sync testi",
        athleteId: "user_athlete_1",
        workouts: [
          {
            splitType: "upper",
            nameOverride: "Superset A",
            defaultRestSeconds: 90,
            exercises: [
              {
                exerciseId: "ex_bench_press",
                exerciseName: "Penkkipunnerrus",
                supersetGroup: "A",
                instruction: "Pidä kontrolli.",
                setCount: 2,
                targetReps: 8,
                targetLoad: 50,
                restSeconds: 90,
              },
              {
                exerciseId: "ex_row",
                exerciseName: "Kulmasoutu",
                supersetGroup: "A",
                instruction: "Vedä lapoihin.",
                setCount: 2,
                targetReps: 10,
                targetLoad: 35,
                restSeconds: 90,
              },
            ],
          },
        ],
      },
      "user_coach_1",
    );
    const workoutId = program.workouts?.[0]?.id;
    expect(workoutId).toBeDefined();
    if (!workoutId) {
      return;
    }

    const state = {
      ...baseState,
      plans: [program, ...baseState.plans],
    };
    const started = startProgramWorkout(state, program.id, workoutId, "user_athlete_1");
    const scheduledWorkoutId = started.scheduledWorkout.id;

    const setOneLogs = started.session.setLogs.filter(
      (log) => log.supersetGroup === "A" && log.setLabel === "1",
    );
    const setTwoLogs = started.session.setLogs.filter(
      (log) => log.supersetGroup === "A" && log.setLabel === "2",
    );
    expect(setOneLogs).toHaveLength(2);
    expect(setTwoLogs).toHaveLength(2);
    const firstSetOneLog = setOneLogs[0];
    const secondSetOneLog = setOneLogs[1];
    expect(firstSetOneLog).toBeDefined();
    expect(secondSetOneLog).toBeDefined();
    if (!firstSetOneLog || !secondSetOneLog) {
      return;
    }

    const afterCheck = updateSessionSet(started.state, scheduledWorkoutId, firstSetOneLog.id, { done: true });
    const checkedSession = afterCheck.sessions.find((session) => session.scheduledWorkoutId === scheduledWorkoutId);
    const checkedSetOne = checkedSession?.setLogs.filter(
      (log) => log.supersetGroup === "A" && log.setLabel === "1",
    );
    const checkedSetTwo = checkedSession?.setLogs.filter(
      (log) => log.supersetGroup === "A" && log.setLabel === "2",
    );
    expect(checkedSetOne?.every((log) => log.done)).toBe(true);
    expect(checkedSetTwo?.every((log) => !log.done)).toBe(true);

    const afterUncheck = updateSessionSet(afterCheck, scheduledWorkoutId, secondSetOneLog.id, { done: false });
    const uncheckedSession = afterUncheck.sessions.find((session) => session.scheduledWorkoutId === scheduledWorkoutId);
    const uncheckedSetOne = uncheckedSession?.setLogs.filter(
      (log) => log.supersetGroup === "A" && log.setLabel === "1",
    );
    expect(uncheckedSetOne?.every((log) => !log.done)).toBe(true);
  });

  it("keeps earlier rapid superset toggles checked when the next toggle happens immediately", () => {
    const baseState = cloneDemoState();
    const program = createProgram(
      {
        title: "Superset rapid toggle",
        athleteId: "user_athlete_1",
        workouts: [
          {
            splitType: "upper",
            nameOverride: "Superset B",
            defaultRestSeconds: 90,
            exercises: [
              {
                exerciseId: "ex_bench_press",
                exerciseName: "Penkkipunnerrus",
                supersetGroup: "A",
                instruction: "Pidä kontrolli.",
                setCount: 2,
                targetReps: 8,
                targetLoad: 50,
                restSeconds: 90,
              },
              {
                exerciseId: "ex_row",
                exerciseName: "Kulmasoutu",
                supersetGroup: "A",
                instruction: "Vedä lapoihin.",
                setCount: 2,
                targetReps: 10,
                targetLoad: 35,
                restSeconds: 90,
              },
            ],
          },
        ],
      },
      "user_coach_1",
    );
    const workoutId = program.workouts?.[0]?.id;
    expect(workoutId).toBeDefined();
    if (!workoutId) {
      return;
    }

    const started = startProgramWorkout(
      {
        ...baseState,
        plans: [program, ...baseState.plans],
      },
      program.id,
      workoutId,
      "user_athlete_1",
    );

    const scheduledWorkoutId = started.scheduledWorkout.id;
    const setOneLog = started.session.setLogs.find((log) => log.supersetGroup === "A" && log.setLabel === "1");
    const setTwoLog = started.session.setLogs.find((log) => log.supersetGroup === "A" && log.setLabel === "2");
    expect(setOneLog).toBeDefined();
    expect(setTwoLog).toBeDefined();
    if (!setOneLog || !setTwoLog) {
      return;
    }

    const afterFirstToggle = updateSessionSet(started.state, scheduledWorkoutId, setOneLog.id, { done: true });
    const afterSecondToggle = updateSessionSet(afterFirstToggle, scheduledWorkoutId, setTwoLog.id, { done: true });
    const finalSession = afterSecondToggle.sessions.find((session) => session.scheduledWorkoutId === scheduledWorkoutId);

    expect(
      finalSession?.setLogs
        .filter((log) => log.supersetGroup === "A")
        .every((log) => log.done),
    ).toBe(true);
  });

  it("cancels a started workout and keeps session data for resume", () => {
    const baseState = cloneDemoState();
    const withNote = saveSessionNote(baseState, "scheduled_2", "Testimuistiinpano");

    expect(withNote.sessions.some((session) => session.scheduledWorkoutId === "scheduled_2")).toBe(true);
    expect(withNote.notes.length).toBeGreaterThan(0);

    const cancelled = cancelSession(withNote, "scheduled_2");

    expect(cancelled.sessions.some((session) => session.scheduledWorkoutId === "scheduled_2")).toBe(true);
    expect(cancelled.notes.some((note) => note.body === "Testimuistiinpano")).toBe(true);
    expect(cancelled.scheduledWorkouts.find((item) => item.id === "scheduled_2")?.status).toBe("cancelled");
  });

  it("resumes a cancelled workout back to in progress", () => {
    const baseState = cloneDemoState();
    const cancelled = cancelSession(baseState, "scheduled_2");

    const resumed = startSession(cancelled, "scheduled_2");
    expect(resumed.state.scheduledWorkouts.find((item) => item.id === "scheduled_2")?.status).toBe(
      "in_progress",
    );
  });

  it("excludes paused time from session duration", () => {
    const pausedSession = {
      id: "session_test",
      scheduledWorkoutId: "scheduled_test",
      athleteId: "user_athlete_1",
      startedAt: "2026-03-24T10:00:00.000Z",
      pausedAt: "2026-03-24T10:10:00.000Z",
      pausedDurationSeconds: 300,
      updatedAt: "2026-03-24T10:10:00.000Z",
      setLogs: [],
    };

    expect(calculateSessionDurationSeconds(pausedSession)).toBe(300);
    expect(calculateSessionDurationSeconds(pausedSession, "2026-03-24T10:20:00.000Z")).toBe(900);
  });

  it("deletes a scheduled workout with linked session and notes", () => {
    const baseState = cloneDemoState();
    const createdProgram = createProgram(
      {
        title: "Poistettava ohjelmatreeni",
        athleteId: "user_athlete_1",
        workouts: [
          {
            splitType: "upper",
            nameOverride: "Poistettava workout",
            defaultRestSeconds: 90,
            exercises: [
              {
                exerciseId: "ex_bench_press",
                exerciseName: "Penkki",
                instruction: "Kontrolli.",
                setCount: 2,
                targetReps: 6,
                targetLoad: 50,
                restSeconds: 90,
              },
            ],
          },
        ],
      },
      "user_coach_1",
    );
    const workoutId = createdProgram.workouts?.[0]?.id;
    expect(workoutId).toBeDefined();
    if (!workoutId) {
      return;
    }

    const stateWithProgram = {
      ...baseState,
      plans: [createdProgram, ...baseState.plans],
    };
    const started = startProgramWorkout(
      stateWithProgram,
      createdProgram.id,
      workoutId,
      "user_athlete_1",
    );
    const withNote = saveSessionNote(
      started.state,
      started.scheduledWorkout.id,
      "Poistettava treeni",
    );

    const next = deleteScheduledWorkout(withNote, started.scheduledWorkout.id);

    expect(next.scheduledWorkouts.some((item) => item.id === started.scheduledWorkout.id)).toBe(false);
    expect(next.sessions.some((session) => session.scheduledWorkoutId === started.scheduledWorkout.id)).toBe(false);
    expect(next.notes.some((note) => note.body === "Poistettava treeni")).toBe(false);
  });

  it("prefills new session logs from previous completed exercise results", () => {
    const baseState = cloneDemoState();
    const createdProgram = createProgram(
      {
        title: "Autofill testiohjelma",
        athleteId: "user_athlete_1",
        workouts: [
          {
            splitType: "lower",
            nameOverride: "Kyykky päivitys",
            defaultRestSeconds: 120,
            exercises: [
              {
                exerciseId: "ex_back_squat",
                exerciseName: "Takakyykky",
                instruction: "Pidä keskivartalo tiukkana.",
                setCount: 2,
                targetReps: 5,
                targetLoad: 72.5,
                restSeconds: 120,
              },
              {
                exerciseId: "ex_split_squat",
                exerciseName: "Bulgarialainen askelkyykky",
                instruction: "Kontrolloi alasmeno.",
                setCount: 1,
                targetReps: 10,
                targetLoad: 16,
                restSeconds: 90,
              },
            ],
          },
        ],
      },
      "user_coach_1",
    );
    const workoutId = createdProgram.workouts?.[0]?.id;
    expect(workoutId).toBeDefined();
    if (!workoutId) {
      return;
    }

    const stateWithProgram = {
      ...baseState,
      plans: [createdProgram, ...baseState.plans],
    };

    const started = startProgramWorkout(
      stateWithProgram,
      createdProgram.id,
      workoutId,
      "user_athlete_1",
    );
    const squatLogs = started.session.setLogs.filter((log) => log.exerciseId === "ex_back_squat");
    expect(squatLogs).toHaveLength(2);
    expect(squatLogs[0]?.actualReps).toBe(5);
    expect(squatLogs[0]?.actualLoad).toBe(70);
    expect(squatLogs[0]?.rpe).toBe(7);
    expect(squatLogs[0]?.done).toBe(false);
    expect(squatLogs[1]?.actualReps).toBe(5);
    expect(squatLogs[1]?.actualLoad).toBe(70);
    expect(squatLogs[1]?.rpe).toBe(8);
    expect(squatLogs[1]?.done).toBe(false);

    const unknownExerciseLog = started.session.setLogs.find((log) => log.exerciseId === "ex_split_squat");
    expect(unknownExerciseLog?.actualReps).toBe(10);
    expect(unknownExerciseLog?.actualLoad).toBe(16);
    expect(unknownExerciseLog?.rpe).toBe(8);
  });

  it("checks coach ownership and invite expiry", () => {
    const state = cloneDemoState();

    expect(canCoachManageAthlete(state, "user_coach_1", "user_athlete_1")).toBe(true);
    expect(canCoachManageAthlete(state, "user_coach_1", "user_athlete_3")).toBe(false);
    expect(canCoachManageAthlete(state, "user_admin_1", "user_athlete_1")).toBe(true);
    expect(canCoachManageAthlete(state, "user_admin_1", "user_athlete_2")).toBe(true);
    expect(isInviteExpired("2000-01-01T00:00:00.000Z")).toBe(true);
    expect(isInviteExpired("2999-01-01T00:00:00.000Z")).toBe(false);
  });

  it("returns all athletes for admin coach lookups", () => {
    const state = cloneDemoState();

    expect(getCoachAthletes(state, "user_admin_1").map((user) => user.id)).toEqual([
      "user_athlete_1",
      "user_athlete_2",
      "user_athlete_3",
    ]);
  });

  it("prefers the active athlete profile over an invited placeholder with the same email", () => {
    const state = cloneDemoState();

    state.users = [
      {
        id: "user_placeholder_invite",
        role: "athlete",
        fullName: "laaloceesay+testaa",
        email: "laaloceesay+testaa@gmail.com",
        status: "invited",
        createdAt: "2026-03-25T08:00:00.000Z",
        updatedAt: "2026-03-25T08:00:00.000Z",
      },
      {
        id: "e3cedd3c-c34a-4748-95a0-56a43f028ff8",
        role: "athlete",
        fullName: "Laalo",
        email: "laaloceesay+testaa@gmail.com",
        status: "active",
        createdAt: "2026-03-25T08:05:00.000Z",
        updatedAt: "2026-03-25T08:05:00.000Z",
      },
      ...state.users.filter((user) => user.role !== "athlete"),
    ];

    const athletes = getCoachAthletes(state, "user_admin_1");

    expect(athletes).toHaveLength(1);
    expect(athletes[0]?.id).toBe("e3cedd3c-c34a-4748-95a0-56a43f028ff8");
    expect(athletes[0]?.fullName).toBe("Laalo");
  });
});
