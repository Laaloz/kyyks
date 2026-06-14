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
  return z.preprocess((value) => {
    if (value === null || value === undefined) {
      return undefined;
    }

    if (typeof value === "string") {
      const trimmed = value.trim().replace(",", ".");
      if (trimmed === "") {
        return undefined;
      }

      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : value;
    }

    if (typeof value === "number" && Number.isNaN(value)) {
      return undefined;
    }

    return value;
  }, schema.optional());
}

export const loginSchema = z.object({
  email: z.string().email("Anna kelvollinen sähköposti."),
  password: z.string().min(4, "Salasana puuttuu."),
});

export const userSettingsSchema = z.object({
  fullName: z.string().trim().min(2, "Anna koko nimi."),
  profileImageUrl: z.union([z.string().trim().url("Anna kelvollinen kuvan URL-osoite."), z.literal("")]).transform((value) =>
    value === "" ? undefined : value,
  ),
  defaultDashboardView: z.enum(["overview", "nutrition", "measurements", "templates", "invites", "athlete-log", "conversation", "athletes", "ingredients", "users"]),
  emailNotifications: z.boolean(),
  weeklyMeasurementReminders: z.boolean(),
  themeMode: z.enum(["light", "dark", "mallu", "camel"]),
  loadIncrementKg: z.union([z.literal(1), z.literal(2.5), z.literal(5)]),
});

export const bodyMeasurementSchema = z.object({
  heightCm: optionalNumberField(z.number().min(80).max(250)),
  weightKg: optionalNumberField(z.number().min(20).max(350)),
  waistCm: optionalNumberField(z.number().min(30).max(250)),
});

export const nutritionProfileSchema = z.object({
  userId: z.string().min(1, "Valitse käyttäjä."),
  goal: z.enum(["maintain", "gain", "lose"]),
  activityLevel: z.enum(["low", "moderate", "high"]),
  mealsPerDay: z.coerce.number().min(3).max(6),
  calculationMode: z.enum(["auto", "manual_override"]),
  targetKcal: optionalNumberField(z.number().min(1200).max(6000)),
  proteinG: optionalNumberField(z.number().min(50).max(400)),
  carbsG: optionalNumberField(z.number().min(50).max(800)),
  fatG: optionalNumberField(z.number().min(20).max(250)),
  coachNotes: z.string().max(400).optional(),
  dietaryFlags: z.array(z.string()).default([]),
  allergies: z.array(z.string()).default([]),
});

export const ingredientSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Anna raaka-aineelle nimi."),
  displayName: z.string().trim().max(120).optional(),
  source: z.enum(["fineli", "open_food_facts", "manual", "ai"]),
  sourceExternalId: z.string().optional(),
  defaultPurchaseUnit: z.enum(["g", "kg", "ml", "l", "pcs", "pack"]).optional(),
  gramsPerUnit: optionalNumberField(z.number().min(1).max(100000)),
  kcalPer100: z.coerce.number().min(0).max(1000),
  proteinPer100: z.coerce.number().min(0).max(100),
  carbsPer100: z.coerce.number().min(0).max(100),
  fatPer100: z.coerce.number().min(0).max(100),
});

// Yksittäisen ruoan lisäys päivän aterioihin (haku/käsin/AI). Makrot per 100 g, annos
// grammoina. saveToMyFoods = tallennetaanko oma tuote katalogiin uudelleenkäyttöä varten.
export const addFoodFormSchema = z.object({
  name: z.string().trim().min(2, "Anna ruoalle nimi."),
  grams: z.coerce.number().min(1, "Annoskoon on oltava vähintään 1 g.").max(5000),
  kcalPer100: z.coerce.number().min(0).max(1000),
  proteinPer100: z.coerce.number().min(0).max(100),
  carbsPer100: z.coerce.number().min(0).max(100),
  fatPer100: z.coerce.number().min(0).max(100),
  saveToMyFoods: z.boolean().default(true),
});

export type AddFoodFormValues = z.infer<typeof addFoodFormSchema>;

/**
 * Karkea järkevyystarkistus: 4·P + 4·C + 9·F pitäisi olla lähellä ilmoitettua
 * kcal-arvoa. Palauttaa varoitustekstin jos ero on yli ~20 %, muuten null.
 * Tämä on varoitus (ei esto) — pyöristykset ja kuitu/polyolit aiheuttavat pientä eroa.
 */
export function macroEnergyWarning(kcalPer100: number, proteinPer100: number, carbsPer100: number, fatPer100: number): string | null {
  const computed = 4 * proteinPer100 + 4 * carbsPer100 + 9 * fatPer100;
  if (kcalPer100 <= 0 && computed <= 0) {
    return null;
  }
  const reference = Math.max(kcalPer100, computed, 1);
  const diffRatio = Math.abs(computed - kcalPer100) / reference;
  if (diffRatio > 0.2) {
    return `Makrot ja energia eivät täsmää (laskennallinen ${Math.round(computed)} kcal vs. ilmoitettu ${Math.round(kcalPer100)} kcal / 100 g). Tarkista arvot.`;
  }
  return null;
}

export const recipeIngredientSchema = z.object({
  ingredientId: z.string().optional(),
  ingredientName: z.string().optional(),
  groupLabel: z.string().optional(),
  alternatives: z.array(z.string().trim().min(1)).optional(),
  alternativeOptions: z
    .array(
      z.object({
        ingredientId: z.string().optional(),
        ingredientName: z.string().trim().min(1),
        grams: z.coerce.number().min(1).max(100000),
      }),
    )
    .optional(),
  quantity: optionalNumberField(z.number().min(0).max(100000)),
  unit: z.enum(["g", "ml", "pcs"]),
  displayQuantity: z.string().optional(),
  displayUnit: z.string().optional(),
  ingredientRole: z.enum(["main", "spice", "garnish"]),
  scalingMode: z.enum(["linear", "gentle", "fixed", "text_only"]),
}).refine(
  (value) => Boolean(value.ingredientId || value.ingredientName?.trim()),
  {
    message: "Valitse tai nimeä raaka-aine.",
    path: ["ingredientName"],
  },
);

export const recipeSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Anna reseptille nimi."),
  description: z.string().max(280).optional(),
  instructions: z.string().trim().min(8, "Kirjoita valmistusohje."),
  mealTag: z.enum(["breakfast", "lunch", "snack", "dinner", "evening_snack"]),
  dietaryFlags: z.array(z.string()).default([]),
  allergies: z.array(z.string()).default([]),
  defaultServings: z.coerce.number().min(1).max(20),
  minServings: z.coerce.number().min(1).max(20),
  maxServings: z.coerce.number().min(1).max(20),
  ingredients: z.array(recipeIngredientSchema).min(1, "Lisää vähintään yksi raaka-aine."),
}).refine(
  (value) => value.minServings <= value.defaultServings && value.defaultServings <= value.maxServings,
  {
    message: "Annosrajojen pitää sisältää oletusannosmäärä.",
    path: ["defaultServings"],
  },
);

export const mealPlanTemplateSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Anna ateriapohjalle nimi."),
  description: z.string().max(280).optional(),
  items: z.array(
    z.object({
      mealTag: z.enum(["breakfast", "lunch", "snack", "dinner", "evening_snack"]),
      recipeId: z.string().min(1, "Valitse resepti."),
      sortOrder: z.coerce.number().int().min(0).max(1000),
    }),
  ).min(1, "Lisää vähintään yksi ateria."),
});

export const assignedMealPlanSchema = z.object({
  athleteId: z.string().min(1, "Valitse treenaaja."),
  templateId: z.string().min(1, "Valitse ateriapohja."),
});

export const inviteSchema = z
  .object({
    email: z.string().email("Anna kelvollinen sähköposti."),
    role: z.enum(["coach", "athlete", "independent_athlete"]),
    coachId: z.string().optional(),
  })
  .refine((value) => (value.role === "athlete" || value.role === "independent_athlete" ? Boolean(value.coachId) : true), {
    message: "Treenaajalle pitää valita valmentaja.",
    path: ["coachId"],
  });

export const acceptInviteSchema = z.object({
  fullName: z.string().min(2, "Anna koko nimi."),
  password: z.string().min(6, "Salasanan pitää olla vähintään 6 merkkiä."),
  age: optionalNumberField(z.number().int().min(13).max(100)),
  sex: optionalEnumField(["female", "male", "other"]),
  heightCm: optionalNumberField(z.number().min(80).max(250)),
  weightKg: optionalNumberField(z.number().min(20).max(350)),
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
  guidance: z.string().max(280, "Lyhyt treeniohje voi olla enintään 280 merkkiä."),
  defaultRestSeconds: z.coerce.number().min(15).max(600),
  exercises: z.array(programWorkoutExerciseSchema).min(1, "Lisää vähintään yksi liike harjoitukseen."),
}).refine(
  (value) => value.splitType !== "custom" || Boolean(value.nameOverride?.trim()),
  {
    message: "Anna custom-treenille nimi.",
    path: ["nameOverride"],
  },
);

export const programComposerSchema = z.object({
  title: z.string().min(3, "Anna ohjelmalle nimi."),
  description: z.string().max(600, "Kuvaus voi olla enintään 600 merkkiä."),
  athleteId: z.string().min(1, "Valitse treenaaja."),
  workouts: z.array(programWorkoutSchema).min(1, "Lisää vähintään yksi harjoitus ohjelmaan."),
});

export function emptyProgramWorkoutExercise(defaultRestSeconds = 120) {
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
  defaultRestSeconds = 120,
) {
  return {
    splitType,
    nameOverride: "",
    guidance: "",
    defaultRestSeconds,
    exercises: [],
  };
}
