import { z } from "zod";

export const CUSTOM_EXERCISE_VALUE = "__custom__";
export const SUPERSET_GROUP_OPTIONS = ["A", "B", "C", "D"] as const;
export const CUSTOM_MUSCLE_GROUP_OPTIONS = [
  "shoulders",
  "arms",
  "chest",
  "abs",
  "back",
  "legs",
  "other",
] as const;

function optionalEnumField<const TValues extends readonly [string, ...string[]]>(values: TValues) {
  return z.union([z.enum(values), z.literal("")]).transform((value) => (value === "" ? undefined : value));
}

function optionalNumberField(schema: z.ZodNumber) {
  return z.union([z.literal(""), z.coerce.number().pipe(schema)]).transform((value) =>
    value === "" ? undefined : value,
  );
}

export const loginSchema = z.object({
  email: z.string().email("Anna kelvollinen sähköposti."),
  password: z.string().min(4, "Salasana puuttuu."),
});

export const userSettingsSchema = z.object({
  fullName: z.string().trim().min(2, "Anna koko nimi."),
  defaultDashboardView: z.enum(["overview", "templates", "invites", "athlete-log", "conversation"]),
  emailNotifications: z.boolean(),
  themeMode: z.enum(["light", "dark"]),
  loadIncrementKg: z.union([z.literal(1), z.literal(2.5), z.literal(5)]),
});

export const bodyMeasurementSchema = z.object({
  heightCm: optionalNumberField(z.number().min(80).max(250)),
  weightKg: optionalNumberField(z.number().min(20).max(350)),
  waistCm: optionalNumberField(z.number().min(30).max(250)),
});

export const inviteSchema = z
  .object({
    email: z.string().email("Anna kelvollinen sähköposti."),
    role: z.enum(["coach", "athlete"]),
    coachId: z.string().optional(),
  })
  .refine((value) => (value.role === "athlete" ? Boolean(value.coachId) : true), {
    message: "Treenaajalle pitää valita valmentaja.",
    path: ["coachId"],
  });

export const templateSchema = z.object({
  title: z.string().min(3, "Anna treenille nimi."),
  description: z.string().min(8, "Kuvaus auttaa valmennettavaa."),
  goal: z.string().min(3, "Anna treenin tavoite."),
  splitType: z.enum(["upper", "lower", "full_body", "custom"]),
  blockTitle: z.string().min(2, "Anna blokille nimi."),
  blockNote: z.string().optional(),
  exercises: z
    .array(
      z.object({
        exerciseId: z.string().min(1, "Valitse liike."),
        muscleGroup: optionalEnumField(CUSTOM_MUSCLE_GROUP_OPTIONS),
        instruction: z.string().min(2, "Anna lyhyt valmennusohje."),
        setCount: z.coerce.number().min(1).max(8),
        targetReps: z.coerce.number().min(1).max(30),
        targetLoad: z.coerce.number().min(0).optional(),
        restSeconds: z.coerce.number().min(15).max(600),
        notes: z.string().optional(),
      }),
    )
    .min(1, "Lisää vähintään yksi liike."),
});

export const acceptInviteSchema = z.object({
  fullName: z.string().min(2, "Anna koko nimi."),
  password: z.string().min(6, "Salasanan pitää olla vähintään 6 merkkiä."),
});

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Salasanan pitää olla vähintään 8 merkkiä."),
    confirmPassword: z.string().min(8, "Vahvista uusi salasana."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Salasanat eivät täsmää.",
    path: ["confirmPassword"],
  });

export const programSchema = z
  .object({
    title: z.string().min(3, "Anna ohjelmalle nimi."),
    athleteId: z.string().min(1, "Valitse treenaaja."),
    weekCount: z.coerce.number().min(1).max(16),
    startDate: z.string().min(8, "Valitse aloituspäivä."),
    upperTemplateId: z.string().min(1, "Valitse yläkropan treeni."),
    lowerTemplateId: z.string().min(1, "Valitse alakropan treeni."),
    fullBodyTemplateId: z.string().min(1, "Valitse koko kropan treeni."),
  })
  .refine(
    (value) =>
      new Set([value.upperTemplateId, value.lowerTemplateId, value.fullBodyTemplateId]).size === 3,
    {
      message: "Valitse kolme eri treeniä ohjelmaan.",
      path: ["fullBodyTemplateId"],
    },
  );

export const programWorkoutExerciseSchema = z
  .object({
    exerciseId: z.string().min(1, "Valitse liike tai lisää custom-liike."),
    exerciseNameOverride: z.string().optional(),
    customExerciseName: z.string().optional(),
    customMuscleGroup: optionalEnumField(CUSTOM_MUSCLE_GROUP_OPTIONS),
    supersetGroup: optionalEnumField(SUPERSET_GROUP_OPTIONS),
    instruction: z.string().min(2, "Anna lyhyt valmennusohje."),
    repMode: z.enum(["exact", "range"]).default("range"),
    setCount: z.coerce.number().min(1).max(10),
    targetReps: z.coerce.number().min(1).max(50),
    targetRepsMin: optionalNumberField(z.number().min(1).max(50)),
    targetRepsMax: optionalNumberField(z.number().min(1).max(50)),
    targetLoad: optionalNumberField(z.number().min(0)),
    restSeconds: z.coerce.number().min(15).max(600),
    notes: z.string().optional(),
  })
  .refine(
    (value) =>
      value.exerciseId !== CUSTOM_EXERCISE_VALUE ||
      Boolean(value.customExerciseName && value.customExerciseName.trim().length > 1),
    {
      message: "Kirjoita custom-liikkeelle nimi.",
      path: ["customExerciseName"],
    },
  )
  .refine(
    (value) =>
      value.exerciseId !== CUSTOM_EXERCISE_VALUE ||
      Boolean(value.customMuscleGroup),
    {
      message: "Valitse custom-liikkeelle lihasryhmä.",
      path: ["customMuscleGroup"],
    },
  )
  .refine(
    (value) => (value.repMode === "exact" ? true : value.targetRepsMin !== undefined),
    {
      message: "Anna min toistot toistoalueelle.",
      path: ["targetRepsMin"],
    },
  )
  .refine(
    (value) => (value.repMode === "exact" ? true : value.targetRepsMax !== undefined),
    {
      message: "Anna max toistot toistoalueelle.",
      path: ["targetRepsMax"],
    },
  )
  .refine(
    (value) =>
      value.repMode === "exact"
        ? true
        : (value.targetRepsMin ?? 0) <= (value.targetRepsMax ?? 0),
    {
      message: "Min toistot ei voi olla suurempi kuin max toistot.",
      path: ["targetRepsMax"],
    },
  );

export const programWorkoutSchema = z.object({
  splitType: z.enum(["upper", "lower", "full_body", "custom"]),
  nameOverride: z.string().optional(),
  defaultRestSeconds: z.coerce.number().min(15).max(600),
  exercises: z.array(programWorkoutExerciseSchema).min(1, "Lisää vähintään yksi liike harjoitukseen."),
});

export const programComposerSchema = z.object({
  title: z.string().min(3, "Anna ohjelmalle nimi."),
  description: z.string().max(600, "Kuvaus voi olla enintään 600 merkkiä."),
  athleteId: z.string().min(1, "Valitse treenaaja."),
  workouts: z.array(programWorkoutSchema).min(1, "Lisää vähintään yksi harjoitus ohjelmaan."),
});

export function emptyTemplateExercise() {
  return {
    exerciseId: "",
    muscleGroup: "" as "" | (typeof CUSTOM_MUSCLE_GROUP_OPTIONS)[number],
    instruction: "",
    setCount: 3,
    targetReps: 8,
    targetLoad: 0,
    restSeconds: 180,
    notes: "",
  };
}

export function emptyProgramWorkoutExercise(defaultRestSeconds = 180) {
  return {
    exerciseId: "",
    exerciseNameOverride: "",
    customExerciseName: "",
    customMuscleGroup: "" as "" | (typeof CUSTOM_MUSCLE_GROUP_OPTIONS)[number],
    supersetGroup: "" as "" | (typeof SUPERSET_GROUP_OPTIONS)[number],
    instruction: "",
    repMode: "range" as const,
    setCount: 3,
    targetReps: 8,
    targetRepsMin: 6,
    targetRepsMax: 8,
    targetLoad: 0,
    restSeconds: defaultRestSeconds,
    notes: "",
  };
}

export function emptyProgramWorkout(
  splitType: "upper" | "lower" | "full_body" | "custom" = "custom",
  defaultRestSeconds = 180,
) {
  return {
    splitType,
    nameOverride: "",
    defaultRestSeconds,
    exercises: [emptyProgramWorkoutExercise(defaultRestSeconds)],
  };
}

export function numberOrUndefined(value: string) {
  const normalized = value.trim().replace(",", ".");
  return normalized === "" ? undefined : Number(normalized);
}
