"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { InlineFeedback } from "@/components/workout/inline-feedback";
import { NutritionAthleteCard } from "@/components/workout/nutrition-athlete-card";
import { PersonalNutritionSummaryCard } from "@/components/workout/personal-nutrition-summary-card";
import { getMeasurementsForUser } from "@/lib/body-metrics";
import { calculateMacroTarget, calculateRecipeNutrition, getMacroGoalGuidance, getMealSlotKcalRange, getMissingMacroProfileFields, getRecipeCompatibilityAlerts, joinRecipeInstructionSteps, mealTagLabel, resolveRecipeNutritionPreview, splitRecipeInstructions } from "@/lib/nutrition";
import { canActAsCoach } from "@/lib/role-access";
import type {
  Ingredient,
  IngredientRole,
  IngredientScalingMode,
  MealTag,
  NutritionActivityLevel,
  NutritionGoal,
  NutritionProfile,
  PurchaseUnit,
} from "@/lib/types";
import { useAppState } from "@/providers/app-state-provider";

const mealTags: MealTag[] = ["breakfast", "lunch", "snack", "dinner", "evening_snack"];
const dietaryFlagOptions = [
  "laktoositon",
  "maidoton",
  "gluteeniton",
  "kasvis",
  "vegaaninen",
  "halal",
];
const allergyOptions = [
  "maito",
  "kananmuna",
  "kala",
  "äyriäiset",
  "pähkinä",
  "soija",
  "seesami",
];

type RecipeIngredientDraft = {
  ingredientId: string;
  ingredientName: string;
  groupLabel: string;
  alternatives: string;
  quantity: string;
  unit: "g" | "ml" | "pcs";
  displayQuantity: string;
  displayUnit: string;
  ingredientRole: IngredientRole;
  scalingMode: IngredientScalingMode;
};

function emptyRecipeIngredientDraft(): RecipeIngredientDraft {
  return {
    ingredientId: "",
    ingredientName: "",
    groupLabel: "",
    alternatives: "",
    quantity: "",
    unit: "g",
    displayQuantity: "",
    displayUnit: "",
    ingredientRole: "main",
    scalingMode: "linear",
  };
}

function emptyRecipeStepDraft() {
  return "";
}

function stringifyList(value: string[]) {
  return value.join(", ");
}

function parseList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseOptionalNumberInput(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) {
    return undefined;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function ingredientLabel(ingredient: Pick<Ingredient, "name" | "displayName">) {
  return ingredient.displayName?.trim() || ingredient.name;
}

function splitKnownAndCustom(values: string[], knownOptions: readonly string[]) {
  const known = values.filter((value) => knownOptions.includes(value));
  const custom = values.filter((value) => !knownOptions.includes(value));
  return {
    known,
    custom: custom.join(", "),
  };
}

function mealSlotKcalGuidance(mealTag: MealTag, targetKcal?: number) {
  const range = getMealSlotKcalRange(mealTag, targetKcal);
  if (!range) {
    return null;
  }

  const [minKcal, maxKcal] = range;
  return `${minKcal}-${maxKcal} kcal`;
}

function formatRecipeMacroValue(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return String(Math.round(value));
}

function formatMacroRange(min: number, max: number, suffix = "") {
  const roundedMin = Math.round(min);
  const roundedMax = Math.round(max);
  const value = roundedMin === roundedMax ? `${roundedMin}` : `${roundedMin}-${roundedMax}`;
  return suffix ? `${value} ${suffix}` : value;
}

type NutritionProfileFormState = {
  goal: NutritionGoal;
  activityLevel: NutritionActivityLevel;
  mealsPerDay: string;
  calculationMode: "auto" | "manual_override";
  targetKcal: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  coachNotes: string;
  dietaryFlags: string[];
  allergies: string[];
  customDietaryFlags: string;
  customAllergies: string;
};

type IngredientFormState = {
  name: string;
  displayName: string;
  defaultPurchaseUnit: PurchaseUnit;
  gramsPerUnit: string;
  kcalPer100: string;
  proteinPer100: string;
  carbsPer100: string;
  fatPer100: string;
};

type NutritionAdminSection = "overview" | "profiles" | "recipes" | "plans";
type RecipeWorkspace = "recipe" | "ingredients";
type NutritionWorkspace = "editor" | "own";

const sectionMeta: Array<{
  id: NutritionAdminSection;
  label: string;
  title: string;
  description: string;
}> = [
  {
    id: "overview",
    label: "Yhteenveto",
    title: "Tilannekuva",
    description: "Avaa oikea työvaihe nopeasti ilman että koko admin-näkymä kaatuu kerralla silmille.",
  },
  {
    id: "profiles",
    label: "Profiilit",
    title: "Treenaajien tavoitteet",
    description: "Säädä päivän tavoitekcal, makrot ja ruokavalioliput yhdelle käyttäjälle kerrallaan.",
  },
  {
    id: "recipes",
    label: "Reseptit",
    title: "Reseptit ja raaka-aineet",
    description: "Rakenna resepti valmiista raaka-aineista ja pidä mausteiden skaalaus hallittuna.",
  },
  {
    id: "plans",
    label: "Ateriapohjat",
    title: "Päivän runko ja jako",
    description: "Kokoa päivän ateriat valmiista resepteistä ja ota pohja käyttöön yhdelle käyttäjälle.",
  },
];

export function NutritionAdminPanel() {
  const {
    currentUser,
    state,
    notify,
    getCoachAthletes,
    saveNutritionProfile,
    saveIngredient,
    saveRecipe,
    deleteRecipe,
    saveMealPlanTemplate,
    assignMealPlanTemplate,
  } = useAppState();

  const canManageNutrition = canActAsCoach(currentUser?.role);
  const isAdmin = currentUser?.role === "admin";
  const managedAthleteUsers = useMemo(
    () =>
      currentUser
        ? getCoachAthletes(currentUser.id).filter((user) => user.status === "active")
        : [],
    [currentUser, getCoachAthletes],
  );
  const nutritionTargetUsers = useMemo(() => {
    if (!currentUser) {
      return [];
    }

    const seenUserIds = new Set<string>();
    return [currentUser, ...managedAthleteUsers]
      .filter((user) => {
        if (seenUserIds.has(user.id)) {
          return false;
        }
        seenUserIds.add(user.id);
        return true;
      });
  }, [currentUser, managedAthleteUsers]);
  const [selectedAthleteId, setSelectedAthleteId] = useState(nutritionTargetUsers[0]?.id ?? "");
  const selectedProfile = useMemo(
    () => state.nutritionProfiles.find((profile) => profile.userId === selectedAthleteId) ?? null,
    [selectedAthleteId, state.nutritionProfiles],
  );
  const [profileForm, setProfileForm] = useState<NutritionProfileFormState>(() => ({
    goal: selectedProfile?.goal ?? "maintain",
    activityLevel: selectedProfile?.activityLevel ?? "high",
    mealsPerDay: String(selectedProfile?.mealsPerDay ?? 5),
    calculationMode: selectedProfile?.calculationMode ?? "auto",
    targetKcal: selectedProfile ? String(selectedProfile.targetKcal) : "",
    proteinG: selectedProfile ? String(selectedProfile.proteinG) : "",
    carbsG: selectedProfile ? String(selectedProfile.carbsG) : "",
    fatG: selectedProfile ? String(selectedProfile.fatG) : "",
    coachNotes: selectedProfile?.coachNotes ?? "",
    dietaryFlags: splitKnownAndCustom(selectedProfile?.dietaryFlags ?? [], dietaryFlagOptions).known,
    allergies: splitKnownAndCustom(selectedProfile?.allergies ?? [], allergyOptions).known,
    customDietaryFlags: splitKnownAndCustom(selectedProfile?.dietaryFlags ?? [], dietaryFlagOptions).custom,
    customAllergies: splitKnownAndCustom(selectedProfile?.allergies ?? [], allergyOptions).custom,
  }));
  const [ingredientForm, setIngredientForm] = useState<IngredientFormState>({
    name: "",
    displayName: "",
    defaultPurchaseUnit: "g" as const,
    gramsPerUnit: "",
    kcalPer100: "",
    proteinPer100: "",
    carbsPer100: "",
    fatPer100: "",
  });
  const [recipeForm, setRecipeForm] = useState({
    name: "",
    description: "",
    mealTag: "lunch" as MealTag,
    dietaryFlags: [] as string[],
    allergies: [] as string[],
    customDietaryFlags: "",
    customAllergies: "",
    defaultServings: "4",
  });
  const [recipeSteps, setRecipeSteps] = useState<string[]>([emptyRecipeStepDraft()]);
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredientDraft[]>([
    emptyRecipeIngredientDraft(),
  ]);
  const [selectedRecipeId, setSelectedRecipeId] = useState("");
  const [selectedIngredientId, setSelectedIngredientId] = useState("");
  const [recipeSearchQuery, setRecipeSearchQuery] = useState("");
  const [recipeFilterMealTag, setRecipeFilterMealTag] = useState<MealTag | "all">("all");
  const [templateForm, setTemplateForm] = useState({
    name: "",
    description: "",
    breakfast: [] as string[],
    lunch: [] as string[],
    snack: [] as string[],
    dinner: [] as string[],
    evening_snack: [] as string[],
  });
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [assignmentForm, setAssignmentForm] = useState({
    athleteId: nutritionTargetUsers[0]?.id ?? "",
    templateId: state.mealPlanTemplates[0]?.id ?? "",
  });
  const [activeSection, setActiveSection] = useState<NutritionAdminSection>("overview");
  const [recipeWorkspace, setRecipeWorkspace] = useState<RecipeWorkspace>("recipe");
  const [workspaceTab, setWorkspaceTab] = useState<NutritionWorkspace>("editor");
  const [isSavingNutritionProfile, setIsSavingNutritionProfile] = useState(false);
  const [isSavingIngredient, setIsSavingIngredient] = useState(false);
  const [isSavingRecipe, setIsSavingRecipe] = useState(false);
  const [isDeletingRecipe, setIsDeletingRecipe] = useState(false);
  const [isSavingMealPlanTemplate, setIsSavingMealPlanTemplate] = useState(false);
  const [isAssigningMealPlanTemplate, setIsAssigningMealPlanTemplate] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const visibleSections = isAdmin ? sectionMeta : sectionMeta.filter((section) => section.id !== "overview");
  const activeSectionMeta = visibleSections.find((section) => section.id === activeSection) ?? visibleSections[0];
  const canManageIngredients = isAdmin;
  const canAssignMealPlans = canManageNutrition;

  useEffect(() => {
    if (!isAdmin && activeSection === "overview") {
      setActiveSection("profiles");
    }
  }, [activeSection, isAdmin]);

  useEffect(() => {
    if (!canManageIngredients && recipeWorkspace === "ingredients") {
      setRecipeWorkspace("recipe");
    }
  }, [canManageIngredients, recipeWorkspace]);

  useEffect(() => {
    if (nutritionTargetUsers.length === 0) {
      if (selectedAthleteId) {
        setSelectedAthleteId("");
      }
      if (assignmentForm.athleteId) {
        setAssignmentForm((current) => ({ ...current, athleteId: "" }));
      }
      return;
    }

    if (!nutritionTargetUsers.some((user) => user.id === selectedAthleteId)) {
      setSelectedAthleteId(nutritionTargetUsers[0].id);
    }

    if (!nutritionTargetUsers.some((user) => user.id === assignmentForm.athleteId)) {
      setAssignmentForm((current) => ({ ...current, athleteId: nutritionTargetUsers[0].id }));
    }
  }, [assignmentForm.athleteId, nutritionTargetUsers, selectedAthleteId]);

  if (!currentUser || !canManageNutrition) {
    return null;
  }

  const resetRecipeEditor = () => {
    setSelectedRecipeId("");
    setRecipeForm({
      name: "",
      description: "",
      mealTag: "lunch",
      dietaryFlags: [],
      allergies: [],
      customDietaryFlags: "",
      customAllergies: "",
      defaultServings: "4",
    });
    setRecipeSteps([emptyRecipeStepDraft()]);
    setRecipeIngredients([emptyRecipeIngredientDraft()]);
  };

  const resetIngredientEditor = () => {
    setSelectedIngredientId("");
    setIngredientForm({
      name: "",
      displayName: "",
      defaultPurchaseUnit: "g",
      gramsPerUnit: "",
      kcalPer100: "",
      proteinPer100: "",
      carbsPer100: "",
      fatPer100: "",
    });
  };

  const loadIngredientToEditor = (ingredientId: string) => {
    const ingredient = state.ingredientsCatalog.find((item) => item.id === ingredientId);
    if (!ingredient) {
      return;
    }

    setSelectedIngredientId(ingredient.id);
    setIngredientForm({
      name: ingredient.name,
      displayName: ingredient.displayName ?? "",
      defaultPurchaseUnit: ingredient.defaultPurchaseUnit ?? "g",
      gramsPerUnit: ingredient.gramsPerUnit !== undefined ? String(ingredient.gramsPerUnit) : "",
      kcalPer100: String(ingredient.kcalPer100),
      proteinPer100: String(ingredient.proteinPer100),
      carbsPer100: String(ingredient.carbsPer100),
      fatPer100: String(ingredient.fatPer100),
    });
  };

  const loadRecipeToEditor = (recipeId: string) => {
    const recipe = state.recipes.find((item) => item.id === recipeId);
    if (!recipe) {
      return;
    }

    setSelectedRecipeId(recipe.id);
    setRecipeForm({
      name: recipe.name,
      description: recipe.description ?? "",
      mealTag: recipe.mealTag,
      dietaryFlags: splitKnownAndCustom(recipe.dietaryFlags ?? [], dietaryFlagOptions).known,
      allergies: splitKnownAndCustom(recipe.allergies ?? [], allergyOptions).known,
      customDietaryFlags: splitKnownAndCustom(recipe.dietaryFlags ?? [], dietaryFlagOptions).custom,
      customAllergies: splitKnownAndCustom(recipe.allergies ?? [], allergyOptions).custom,
      defaultServings: String(recipe.defaultServings),
    });
    setRecipeSteps(splitRecipeInstructions(recipe.instructions).filter(Boolean).length > 0
      ? splitRecipeInstructions(recipe.instructions)
      : [emptyRecipeStepDraft()]);
    setRecipeIngredients(
      recipe.ingredients.length > 0
        ? recipe.ingredients.map((ingredient) => ({
            ingredientId: ingredient.ingredientId ?? "",
            ingredientName: ingredient.ingredientName,
            groupLabel: ingredient.groupLabel ?? "",
            alternatives: (ingredient.alternatives ?? []).join(", "),
            quantity: ingredient.quantity !== undefined ? String(ingredient.quantity) : "",
            unit: ingredient.unit,
            displayQuantity: ingredient.displayQuantity ?? "",
            displayUnit: ingredient.displayUnit ?? "",
            ingredientRole: ingredient.ingredientRole,
            scalingMode: ingredient.scalingMode,
          }))
        : [emptyRecipeIngredientDraft()],
    );
  };

  const duplicateRecipeToEditor = (recipeId: string) => {
    const recipe = state.recipes.find((item) => item.id === recipeId);
    if (!recipe) {
      return;
    }

    setSelectedRecipeId("");
    setRecipeForm({
      name: `${recipe.name} kopio`,
      description: recipe.description ?? "",
      mealTag: recipe.mealTag,
      dietaryFlags: splitKnownAndCustom(recipe.dietaryFlags ?? [], dietaryFlagOptions).known,
      allergies: splitKnownAndCustom(recipe.allergies ?? [], allergyOptions).known,
      customDietaryFlags: splitKnownAndCustom(recipe.dietaryFlags ?? [], dietaryFlagOptions).custom,
      customAllergies: splitKnownAndCustom(recipe.allergies ?? [], allergyOptions).custom,
      defaultServings: String(recipe.defaultServings),
    });
    setRecipeSteps(splitRecipeInstructions(recipe.instructions).filter(Boolean).length > 0
      ? splitRecipeInstructions(recipe.instructions)
      : [emptyRecipeStepDraft()]);
    setRecipeIngredients(
      recipe.ingredients.length > 0
        ? recipe.ingredients.map((ingredient) => ({
            ingredientId: ingredient.ingredientId ?? "",
            ingredientName: ingredient.ingredientName,
            groupLabel: ingredient.groupLabel ?? "",
            alternatives: (ingredient.alternatives ?? []).join(", "),
            quantity: ingredient.quantity !== undefined ? String(ingredient.quantity) : "",
            unit: ingredient.unit,
            displayQuantity: ingredient.displayQuantity ?? "",
            displayUnit: ingredient.displayUnit ?? "",
            ingredientRole: ingredient.ingredientRole,
            scalingMode: ingredient.scalingMode,
          }))
        : [emptyRecipeIngredientDraft()],
    );
    setMessage({ tone: "success", text: `Resepti "${recipe.name}" kopioitiin editoriin uutena pohjana.` });
  };

  const handleSaveNutritionProfile = async () => {
    if (!selectedAthleteId) {
      setMessage({ tone: "danger", text: "Valitse käyttäjä ravintoprofiilille." });
      return;
    }

    setIsSavingNutritionProfile(true);
    const result = await saveNutritionProfile({
      userId: selectedAthleteId,
      goal: profileForm.goal as NutritionProfile["goal"],
      activityLevel: profileForm.activityLevel as NutritionProfile["activityLevel"],
      mealsPerDay: Number(profileForm.mealsPerDay),
      calculationMode: profileForm.calculationMode as NutritionProfile["calculationMode"],
      targetKcal: parseOptionalNumberInput(profileForm.targetKcal),
      proteinG: parseOptionalNumberInput(profileForm.proteinG),
      carbsG: parseOptionalNumberInput(profileForm.carbsG),
      fatG: parseOptionalNumberInput(profileForm.fatG),
      coachNotes: profileForm.coachNotes,
      dietaryFlags: [...profileForm.dietaryFlags, ...parseList(profileForm.customDietaryFlags)],
      allergies: [...profileForm.allergies, ...parseList(profileForm.customAllergies)],
    }).finally(() => setIsSavingNutritionProfile(false));

    setMessage({ tone: result.ok ? "success" : "danger", text: result.ok ? "Ravintoprofiili tallennettiin." : result.message });
    notify({ tone: result.ok ? "success" : "danger", message: result.ok ? "Ravintoprofiili tallennettiin." : result.message });
  };

  const handleSaveIngredient = async () => {
    setIsSavingIngredient(true);
    const result = await saveIngredient({
      id: selectedIngredientId || undefined,
      name: ingredientForm.name,
      displayName: ingredientForm.displayName || undefined,
      source: "manual",
      defaultPurchaseUnit: ingredientForm.defaultPurchaseUnit,
      gramsPerUnit: ingredientForm.gramsPerUnit ? Number(ingredientForm.gramsPerUnit) : undefined,
      kcalPer100: Number(ingredientForm.kcalPer100),
      proteinPer100: Number(ingredientForm.proteinPer100),
      carbsPer100: Number(ingredientForm.carbsPer100),
      fatPer100: Number(ingredientForm.fatPer100),
    }).finally(() => setIsSavingIngredient(false));

    setMessage({ tone: result.ok ? "success" : "danger", text: result.ok ? "Raaka-aine tallennettiin." : result.message });
    if (result.ok && !selectedIngredientId) {
      resetIngredientEditor();
    }
  };

  const handleSaveRecipe = async () => {
    setIsSavingRecipe(true);
    const normalizedDefaultServings = Number(recipeForm.defaultServings) || 1;
    const result = await saveRecipe({
      id: selectedRecipeId || undefined,
      name: recipeForm.name,
      description: recipeForm.description,
      instructions: joinRecipeInstructionSteps(recipeSteps),
      mealTag: recipeForm.mealTag,
      dietaryFlags: [...recipeForm.dietaryFlags, ...parseList(recipeForm.customDietaryFlags)],
      allergies: [...recipeForm.allergies, ...parseList(recipeForm.customAllergies)],
      defaultServings: normalizedDefaultServings,
      minServings: normalizedDefaultServings,
      maxServings: normalizedDefaultServings,
      ingredients: recipeIngredients.map((ingredient) => ({
        ingredientId: ingredient.ingredientId || undefined,
        ingredientName: ingredient.ingredientName,
        groupLabel: ingredient.groupLabel || undefined,
        alternatives: parseList(ingredient.alternatives),
        quantity: ingredient.quantity ? Number(ingredient.quantity) : undefined,
        unit: ingredient.unit,
        displayQuantity: ingredient.displayQuantity || undefined,
        displayUnit: ingredient.displayUnit || undefined,
        ingredientRole: ingredient.ingredientRole,
        scalingMode: ingredient.scalingMode,
      })),
    }).finally(() => setIsSavingRecipe(false));

    setMessage({ tone: result.ok ? "success" : "danger", text: result.ok ? "Resepti tallennettiin." : result.message });
    if (result.ok) {
      resetRecipeEditor();
    }
  };

  const handleDeleteRecipe = async () => {
    if (!selectedRecipeId) {
      setMessage({ tone: "danger", text: "Valitse ensin poistettava resepti." });
      return;
    }

    const recipeName = state.recipes.find((recipe) => recipe.id === selectedRecipeId)?.name ?? "Resepti";
    const confirmed = window.confirm(`Poistetaanko resepti "${recipeName}"?`);
    if (!confirmed) {
      return;
    }

    setIsDeletingRecipe(true);
    const result = await deleteRecipe(selectedRecipeId).finally(() => setIsDeletingRecipe(false));
    setMessage({ tone: result.ok ? "success" : "danger", text: result.ok ? "Resepti poistettiin." : result.message });
    if (result.ok) {
      resetRecipeEditor();
    }
  };

  const resetTemplateEditor = () => {
    setSelectedTemplateId("");
    setTemplateForm({
      name: "",
      description: "",
      breakfast: [],
      lunch: [],
      snack: [],
      dinner: [],
      evening_snack: [],
    });
  };

  const loadTemplateToEditor = (templateId: string) => {
    const template = state.mealPlanTemplates.find((item) => item.id === templateId);
    if (!template) {
      return;
    }

    const nextForm = {
      name: template.name,
      description: template.description ?? "",
      breakfast: [] as string[],
      lunch: [] as string[],
      snack: [] as string[],
      dinner: [] as string[],
      evening_snack: [] as string[],
    };

    const sortedItems = [...template.items].sort((left, right) => left.sortOrder - right.sortOrder);
    for (const item of sortedItems) {
      nextForm[item.mealTag] = [...nextForm[item.mealTag], item.recipeId];
    }

    setSelectedTemplateId(template.id);
    setTemplateForm(nextForm);
  };

  const duplicateTemplateToEditor = (templateId: string) => {
    const template = state.mealPlanTemplates.find((item) => item.id === templateId);
    if (!template) {
      return;
    }

    const nextForm = {
      name: `${template.name} kopio`,
      description: template.description ?? "",
      breakfast: [] as string[],
      lunch: [] as string[],
      snack: [] as string[],
      dinner: [] as string[],
      evening_snack: [] as string[],
    };

    const sortedItems = [...template.items].sort((left, right) => left.sortOrder - right.sortOrder);
    for (const item of sortedItems) {
      nextForm[item.mealTag] = [...nextForm[item.mealTag], item.recipeId];
    }

    setSelectedTemplateId("");
    setTemplateForm(nextForm);
    setMessage({ tone: "success", text: `Ateriapohja "${template.name}" kopioitiin editoriin uutena pohjana.` });
  };

  const handleSaveTemplate = async () => {
    const items = mealTags
      .flatMap((mealTag, mealTagIndex) => {
        const recipeIds = templateForm[mealTag];
        return recipeIds.map((recipeId, recipeIndex) => ({
          mealTag,
          recipeId,
          sortOrder: mealTagIndex * 100 + recipeIndex,
        }));
      });

    setIsSavingMealPlanTemplate(true);
    const result = await saveMealPlanTemplate({
      id: selectedTemplateId || undefined,
      name: templateForm.name,
      description: templateForm.description,
      items,
    }).finally(() => setIsSavingMealPlanTemplate(false));

    setMessage({
      tone: result.ok ? "success" : "danger",
      text: result.ok
        ? selectedTemplateId
          ? "Ateriapohja päivitettiin."
          : "Ateriapohja tallennettiin."
        : result.message,
    });
    if (result.ok) {
      if (!selectedTemplateId) {
        resetTemplateEditor();
      }
    }
  };

  const handleAssignTemplate = async () => {
    setIsAssigningMealPlanTemplate(true);
    const result = await assignMealPlanTemplate({
      athleteId: assignmentForm.athleteId,
      templateId: assignmentForm.templateId,
    }).finally(() => setIsAssigningMealPlanTemplate(false));

    setMessage({ tone: result.ok ? "success" : "danger", text: result.ok ? "Ateriapohja aktivoitiin käyttäjälle." : result.message });
  };

  const selectedAthleteName = nutritionTargetUsers.find((user) => user.id === selectedAthleteId)?.fullName ?? "Ei valittu";
  const selectedAthlete = state.users.find((user) => user.id === selectedAthleteId) ?? null;
  const selectedAthleteMeasurements = selectedAthlete ? getMeasurementsForUser(state, selectedAthlete.id) : [];
  const latestWeightKg = selectedAthleteMeasurements.find((entry) => entry.weightKg !== undefined)?.weightKg ?? selectedAthlete?.weightKg;
  const latestWaistCm = selectedAthleteMeasurements.find((entry) => entry.waistCm !== undefined)?.waistCm ?? selectedAthlete?.waistCm;
  const missingAutoFields = selectedAthlete ? getMissingMacroProfileFields(selectedAthlete) : [];
  const autoPreviewTarget = selectedAthlete
    ? calculateMacroTarget({
        age: selectedAthlete.age,
        sex: selectedAthlete.sex,
        heightCm: selectedAthlete.heightCm,
        weightKg: selectedAthlete.weightKg,
        goal: profileForm.goal,
        activityLevel: profileForm.activityLevel,
      })
    : null;
  const displayedTargetKcal =
    profileForm.calculationMode === "auto"
      ? autoPreviewTarget?.kcal ?? selectedProfile?.targetKcal ?? (profileForm.targetKcal ? Number(profileForm.targetKcal) : undefined)
      : (profileForm.targetKcal ? Number(profileForm.targetKcal) : undefined);
  const displayedProtein =
    profileForm.calculationMode === "auto"
      ? autoPreviewTarget?.proteinG ?? selectedProfile?.proteinG ?? (profileForm.proteinG ? Number(profileForm.proteinG) : undefined)
      : (profileForm.proteinG ? Number(profileForm.proteinG) : undefined);
  const displayedCarbs =
    profileForm.calculationMode === "auto"
      ? autoPreviewTarget?.carbsG ?? selectedProfile?.carbsG ?? (profileForm.carbsG ? Number(profileForm.carbsG) : undefined)
      : (profileForm.carbsG ? Number(profileForm.carbsG) : undefined);
  const displayedFat =
    profileForm.calculationMode === "auto"
      ? autoPreviewTarget?.fatG ?? selectedProfile?.fatG ?? (profileForm.fatG ? Number(profileForm.fatG) : undefined)
      : (profileForm.fatG ? Number(profileForm.fatG) : undefined);
  const assignmentAthleteProfile = state.nutritionProfiles.find((profile) => profile.userId === assignmentForm.athleteId) ?? null;
  const previewCompatibilityProfile =
    assignmentForm.athleteId === selectedAthleteId
      ? {
          dietaryFlags: [...profileForm.dietaryFlags, ...parseList(profileForm.customDietaryFlags)],
          allergies: [...profileForm.allergies, ...parseList(profileForm.customAllergies)],
        }
      : assignmentAthleteProfile;
  const athleteWithPlanCount = new Set(state.assignedMealPlans.filter((plan) => plan.active).map((plan) => plan.athleteId)).size;
  const sortedIngredientsCatalog = useMemo(
    () =>
      [...state.ingredientsCatalog].sort((left, right) =>
        ingredientLabel(left).localeCompare(ingredientLabel(right), "fi", { sensitivity: "base" }),
      ),
    [state.ingredientsCatalog],
  );
  const ingredientCatalogPreview = sortedIngredientsCatalog.slice(0, 8);
  const recipePreview = state.recipes.slice(0, 4);
  const templatePreview = state.mealPlanTemplates.slice(0, 4);
  const selectedTemplatePreview = useMemo(
    () =>
      mealTags.reduce<Array<{ mealTag: MealTag; recipe: (typeof state.recipes)[number] }>>((items, mealTag) => {
        const recipes = templateForm[mealTag]
          .map((recipeId) => state.recipes.find((recipe) => recipe.id === recipeId))
          .filter((recipe): recipe is (typeof state.recipes)[number] => Boolean(recipe));

        return [
          ...items,
          ...recipes.map((recipe) => ({
            mealTag,
            recipe,
          })),
        ];
      }, []),
    [state.recipes, templateForm],
  );
  const groupedTemplatePreview = useMemo(
    () =>
      selectedTemplatePreview.reduce<Partial<Record<MealTag, typeof selectedTemplatePreview>>>((groups, item) => {
        const existing = groups[item.mealTag] ?? [];
        return {
          ...groups,
          [item.mealTag]: [...existing, item],
        };
      }, {}),
    [selectedTemplatePreview],
  );
  const templateDailyMacroPreview = useMemo(() => {
    const mealGroups = mealTags.flatMap((mealTag) => {
      const items = groupedTemplatePreview[mealTag] ?? [];
      if (items.length === 0) {
        return [];
      }

      const entries = items.map((item) => ({
        recipe: item.recipe,
        nutrition: resolveRecipeNutritionPreview(item.recipe, state.ingredientsCatalog).nutritionPerServing,
      }));
      const totals = entries.reduce((sum, entry) => ({
        kcal: sum.kcal + entry.nutrition.kcal,
        proteinG: sum.proteinG + entry.nutrition.proteinG,
        carbsG: sum.carbsG + entry.nutrition.carbsG,
        fatG: sum.fatG + entry.nutrition.fatG,
      }), { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
      const min = entries.reduce((current, entry) => ({
        kcal: Math.min(current.kcal, entry.nutrition.kcal),
        proteinG: Math.min(current.proteinG, entry.nutrition.proteinG),
        carbsG: Math.min(current.carbsG, entry.nutrition.carbsG),
        fatG: Math.min(current.fatG, entry.nutrition.fatG),
      }), { kcal: Number.POSITIVE_INFINITY, proteinG: Number.POSITIVE_INFINITY, carbsG: Number.POSITIVE_INFINITY, fatG: Number.POSITIVE_INFINITY });
      const max = entries.reduce((current, entry) => ({
        kcal: Math.max(current.kcal, entry.nutrition.kcal),
        proteinG: Math.max(current.proteinG, entry.nutrition.proteinG),
        carbsG: Math.max(current.carbsG, entry.nutrition.carbsG),
        fatG: Math.max(current.fatG, entry.nutrition.fatG),
      }), { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
      const avg = {
        kcal: totals.kcal / entries.length,
        proteinG: totals.proteinG / entries.length,
        carbsG: totals.carbsG / entries.length,
        fatG: totals.fatG / entries.length,
      };
      const targetRange = getMealSlotKcalRange(mealTag, displayedTargetKcal);
      const targetMidpoint = targetRange ? (targetRange[0] + targetRange[1]) / 2 : null;
      const recommended = entries.reduce((best, entry) => {
        if (!best) {
          return entry;
        }

        if (targetMidpoint === null) {
          const bestGap = Math.abs(best.nutrition.kcal - avg.kcal);
          const nextGap = Math.abs(entry.nutrition.kcal - avg.kcal);
          return nextGap < bestGap ? entry : best;
        }

        const bestGap = Math.abs(best.nutrition.kcal - targetMidpoint);
        const nextGap = Math.abs(entry.nutrition.kcal - targetMidpoint);
        return nextGap < bestGap ? entry : best;
      }, null as (typeof entries)[number] | null);

      return [{
        mealTag,
        itemCount: entries.length,
        targetRange,
        min,
        max,
        avg,
        recommended,
      }];
    });

    if (mealGroups.length === 0) {
      return null;
    }

    const combine = (
      source: Array<{ kcal: number; proteinG: number; carbsG: number; fatG: number }>,
      strategy: "sum" | "min" | "max",
    ) => {
      if (source.length === 0) {
        return { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
      }

      if (strategy === "sum") {
        return source.reduce((sum, item) => ({
          kcal: sum.kcal + item.kcal,
          proteinG: sum.proteinG + item.proteinG,
          carbsG: sum.carbsG + item.carbsG,
          fatG: sum.fatG + item.fatG,
        }), { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
      }

      return source.reduce((acc, item) => ({
        kcal: strategy === "min" ? Math.min(acc.kcal, item.kcal) : Math.max(acc.kcal, item.kcal),
        proteinG: strategy === "min" ? Math.min(acc.proteinG, item.proteinG) : Math.max(acc.proteinG, item.proteinG),
        carbsG: strategy === "min" ? Math.min(acc.carbsG, item.carbsG) : Math.max(acc.carbsG, item.carbsG),
        fatG: strategy === "min" ? Math.min(acc.fatG, item.fatG) : Math.max(acc.fatG, item.fatG),
      }), source[0]);
    };

    const recommendedItems = mealGroups
      .map((group) => group.recommended?.nutrition)
      .filter((item): item is NonNullable<(typeof mealGroups)[number]["recommended"]>["nutrition"] => Boolean(item));

    const recommendedTotals = combine(recommendedItems, "sum");
    const minTotals = combine(mealGroups.map((group) => group.min), "sum");
    const maxTotals = combine(mealGroups.map((group) => group.max), "sum");
    const avgTotals = combine(mealGroups.map((group) => group.avg), "sum");
    const targetGap = displayedTargetKcal ? recommendedTotals.kcal - displayedTargetKcal : null;

    return {
      mealGroups,
      recommendedTotals,
      minTotals,
      maxTotals,
      avgTotals,
      targetGap,
    };
  }, [displayedTargetKcal, groupedTemplatePreview, state.ingredientsCatalog]);
  const filledMealTags = mealTags.filter((mealTag) => templateForm[mealTag].length > 0);
  const missingMealTags = mealTags.filter((mealTag) => templateForm[mealTag].length === 0);
  const templatePreviewRecipeCount = selectedTemplatePreview.length;
  const recipesByMealTag = useMemo(
    () => ({
      breakfast: state.recipes.filter((recipe) => recipe.mealTag === "breakfast"),
      lunch: state.recipes.filter((recipe) => recipe.mealTag === "lunch"),
      snack: state.recipes.filter((recipe) => recipe.mealTag === "snack"),
      dinner: state.recipes.filter((recipe) => recipe.mealTag === "dinner"),
      evening_snack: state.recipes.filter((recipe) => recipe.mealTag === "evening_snack"),
    }),
    [state.recipes],
  );
  const recentRecipes = useMemo(
    () => [...state.recipes]
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
      .slice(0, 6),
    [state.recipes],
  );
  const filteredRecipes = useMemo(() => {
    const normalizedQuery = recipeSearchQuery.trim().toLowerCase();
    return state.recipes.filter((recipe) => {
      const matchesMealTag = recipeFilterMealTag === "all" || recipe.mealTag === recipeFilterMealTag;
      const matchesQuery = normalizedQuery.length === 0
        || recipe.name.toLowerCase().includes(normalizedQuery)
        || (recipe.description ?? "").toLowerCase().includes(normalizedQuery);
      return matchesMealTag && matchesQuery;
    });
  }, [recipeFilterMealTag, recipeSearchQuery, state.recipes]);
  const recipeNutritionPreview = useMemo(() => {
    const draftIngredients = recipeIngredients
      .map((ingredient, index) => {
        const parsedQuantity = ingredient.quantity ? Number(ingredient.quantity) : undefined;
        return {
          id: `draft-ingredient-${index}`,
          ingredientId: ingredient.ingredientId || undefined,
          ingredientName: ingredient.ingredientName.trim(),
          groupLabel: ingredient.groupLabel.trim() || undefined,
          alternatives: parseList(ingredient.alternatives),
          quantity: parsedQuantity,
          unit: ingredient.unit,
          displayQuantity: ingredient.displayQuantity.trim() || undefined,
          displayUnit: ingredient.displayUnit.trim() || undefined,
          normalizedQuantity: parsedQuantity,
          ingredientRole: ingredient.ingredientRole,
          scalingMode: ingredient.scalingMode,
        };
      })
      .filter((ingredient) => ingredient.ingredientId || ingredient.ingredientName);

    const linkedIngredientCount = draftIngredients.filter((ingredient) => ingredient.ingredientId).length;
    const unlinkedIngredientNames = draftIngredients
      .filter((ingredient) => !ingredient.ingredientId && ingredient.ingredientRole !== "spice" && ingredient.scalingMode !== "text_only")
      .map((ingredient) => ingredient.ingredientName)
      .filter(Boolean);

    if (draftIngredients.length === 0) {
      return {
        hasIngredients: false,
        linkedIngredientCount,
        totalIngredientCount: 0,
        unlinkedIngredientNames,
        nutritionPerServing: null,
        nutritionPerRecipe: null,
      };
    }

    const nutrition = calculateRecipeNutrition({
      defaultServings: Number(recipeForm.defaultServings) || 1,
      ingredients: draftIngredients,
    }, state.ingredientsCatalog);

    return {
      hasIngredients: true,
      linkedIngredientCount,
      totalIngredientCount: draftIngredients.length,
      unlinkedIngredientNames,
      nutritionPerServing: nutrition.nutritionPerServing,
      nutritionPerRecipe: nutrition.nutritionPerRecipe,
    };
  }, [recipeForm.defaultServings, recipeIngredients, state.ingredientsCatalog]);

  const toggleSelection = (
    field: "dietaryFlags" | "allergies",
    value: string,
  ) => {
    setProfileForm((current) => ({
      ...current,
      [field]: current[field].includes(value)
        ? current[field].filter((item) => item !== value)
        : [...current[field], value],
    }));
  };

  return (
    <Card className="border-[var(--border-strong)]">
      <div className="space-y-6">
        <div>
          <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Ravinto</p>
          <CardTitle className="mt-2 text-2xl">Ateriapohjat ja reseptit</CardTitle>
          <CardDescription className="mt-2">
            Rakenna reseptit ja ateriapohjat oikeista raaka-ainemääristä niin, että annossäätö, makrot ja rajoitteet pysyvät mukana. Oma ravinto löytyy tästä samasta näkymästä ilman, että kotisivu kuormittuu turhaan.
          </CardDescription>
        </div>

        {message ? <InlineFeedback tone={message.tone} message={message.text} /> : null}

        <div
          role="tablist"
          aria-label="Ravinnon työtila"
          className="grid gap-2 rounded-[1.4rem] border border-[color-mix(in_srgb,var(--border)_88%,var(--surface))] bg-[color-mix(in_srgb,var(--surface)_80%,var(--surface-2))] p-2 md:grid-cols-2"
        >
          <button
            type="button"
            role="tab"
            aria-selected={workspaceTab === "editor"}
            aria-controls="nutrition-workspace-editor"
            id="nutrition-workspace-tab-editor"
            tabIndex={workspaceTab === "editor" ? 0 : -1}
            className={`rounded-2xl px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] ${
              workspaceTab === "editor"
                ? "border border-[color-mix(in_srgb,var(--accent)_24%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] text-[var(--text)] shadow-[0_10px_24px_-20px_var(--accent)]"
                : "border border-transparent bg-transparent text-[var(--text-muted)] hover:border-[var(--border)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
            }`}
            onClick={() => setWorkspaceTab("editor")}
          >
            <p className="text-sm font-semibold">Editori</p>
            <p className="mt-1 text-xs text-[var(--text-subtle)]">Muokkaa profiileja, reseptejä ja ateriapohjia itselle tai käyttäjille.</p>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={workspaceTab === "own"}
            aria-controls="nutrition-workspace-own"
            id="nutrition-workspace-tab-own"
            tabIndex={workspaceTab === "own" ? 0 : -1}
            className={`rounded-2xl px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] ${
              workspaceTab === "own"
                ? "border border-[color-mix(in_srgb,var(--accent)_24%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] text-[var(--text)] shadow-[0_10px_24px_-20px_var(--accent)]"
                : "border border-transparent bg-transparent text-[var(--text-muted)] hover:border-[var(--border)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
            }`}
            onClick={() => setWorkspaceTab("own")}
          >
            <p className="text-sm font-semibold">Oma ravinto</p>
            <p className="mt-1 text-xs text-[var(--text-subtle)]">Näe oma energiasuositus ja käytössä oleva ateriapohja ilman editorin raskautta.</p>
          </button>
        </div>

        {workspaceTab === "own" ? (
          <section
            id="nutrition-workspace-own"
            role="tabpanel"
            aria-labelledby="nutrition-workspace-tab-own"
            className="space-y-6"
          >
            <PersonalNutritionSummaryCard
              state={state}
              user={currentUser}
              onOpenSettings={() => {
                setWorkspaceTab("editor");
                setActiveSection("profiles");
                setSelectedAthleteId(currentUser.id);
              }}
            />
            <NutritionAthleteCard state={state} user={currentUser} />
          </section>
        ) : null}

        {workspaceTab === "editor" ? (
          <div
            role="tablist"
            aria-label="Ravinnon admin-osiot"
            className={`grid gap-2 rounded-[1.4rem] border border-[color-mix(in_srgb,var(--border)_88%,var(--surface))] bg-[color-mix(in_srgb,var(--surface)_80%,var(--surface-2))] p-2 ${visibleSections.length >= 4 ? "md:grid-cols-4" : "md:grid-cols-3"}`}
          >
            {visibleSections.map((section) => {
              const selected = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`nutrition-panel-${section.id}`}
                  id={`nutrition-tab-${section.id}`}
                  tabIndex={selected ? 0 : -1}
                  className={`rounded-2xl px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] ${
                    selected
                      ? "border border-[color-mix(in_srgb,var(--accent)_24%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] text-[var(--text)] shadow-[0_10px_24px_-20px_var(--accent)]"
                      : "border border-transparent bg-transparent text-[var(--text-muted)] hover:border-[var(--border)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
                  }`}
                  onClick={() => setActiveSection(section.id)}
                >
                  <p className="text-sm font-semibold">{section.label}</p>
                  <p className="mt-1 text-xs text-[var(--text-subtle)]">{section.description}</p>
                </button>
              );
            })}
          </div>
        ) : null}

        {workspaceTab === "editor" ? (
          <section
            id={`nutrition-panel-${activeSectionMeta.id}`}
            role="tabpanel"
            aria-labelledby={`nutrition-tab-${activeSectionMeta.id}`}
            className="space-y-6"
          >
          {activeSection === "overview" ? (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Käyttäjät</p>
                  <p className="mt-2 text-3xl font-semibold text-[var(--text)]">{nutritionTargetUsers.length}</p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">käyttäjää ravinnon piirissä</p>
                </div>
                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Profiilit</p>
                  <p className="mt-2 text-3xl font-semibold text-[var(--text)]">{state.nutritionProfiles.length}</p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">ravintoprofiilia tallennettu</p>
                </div>
                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Reseptit</p>
                  <p className="mt-2 text-3xl font-semibold text-[var(--text)]">{state.recipes.length}</p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">valmista reseptiä kirjastossa</p>
                </div>
                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Jaetut pohjat</p>
                  <p className="mt-2 text-3xl font-semibold text-[var(--text)]">{athleteWithPlanCount}</p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">käyttäjää aktiivisen pohjan kanssa</p>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                <section className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text)]">Nopein eteneminen</p>
                    <p className="text-sm text-[var(--text-muted)]">Rakenne on nyt jaettu kolmeen selkeään työvaiheeseen.</p>
                  </div>
                  <div className="space-y-3">
                    <button type="button" className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]" onClick={() => setActiveSection("profiles")}>
                      <p className="text-sm font-semibold text-[var(--text)]">1. Aseta käyttäjän tavoite</p>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">Valitse käyttäjä ja tallenna päivän kcal- ja makrotavoite.</p>
                    </button>
                    <button type="button" className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]" onClick={() => setActiveSection("recipes")}>
                      <p className="text-sm font-semibold text-[var(--text)]">2. Rakenna resepti valmiista aineksista</p>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">Pidä pääraaka-aineet lineaarisina ja mausteet kiinteinä tai tekstinä.</p>
                    </button>
                    <button type="button" className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]" onClick={() => setActiveSection("plans")}>
                      <p className="text-sm font-semibold text-[var(--text)]">3. Kokoa päivä ja jaa</p>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">Valitse reseptit päivän slotteihin ja aktivoi pohja käyttäjälle tai itsellesi.</p>
                    </button>
                  </div>
                </section>

                <section className="grid gap-6 lg:grid-cols-2">
                  <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <p className="text-sm font-semibold text-[var(--text)]">Valittu käyttäjä</p>
                    <p className="mt-2 text-xl font-semibold text-[var(--text)]">{selectedAthleteName}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge>{profileForm.goal === "maintain" ? "Pidä paino" : profileForm.goal === "gain" ? "Kasvata" : "Pudota"}</Badge>
                      <Badge>{profileForm.calculationMode === "auto" ? "Auto" : "Manuaalinen"}</Badge>
                      <Badge>{profileForm.mealsPerDay || "5"} ateriaa</Badge>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
                        <p className="text-[var(--text-muted)]">Tavoite</p>
                        <p className="mt-1 font-semibold text-[var(--text)]">{displayedTargetKcal ?? "Auto"} kcal</p>
                      </div>
                      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
                        <p className="text-[var(--text-muted)]">Makrot</p>
                        <p className="mt-1 font-semibold text-[var(--text)]">
                          {displayedProtein ?? "-"} / {displayedCarbs ?? "-"} / {displayedFat ?? "-"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <p className="text-sm font-semibold text-[var(--text)]">Kirjaston tila</p>
                    <div className="mt-4 space-y-4">
                      <div>
                        <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Raaka-aineet</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {ingredientCatalogPreview.length > 0 ? ingredientCatalogPreview.map((ingredient) => (
                            <Badge key={ingredient.id}>{ingredientLabel(ingredient)}</Badge>
                          )) : <p className="text-sm text-[var(--text-muted)]">Ei vielä raaka-aineita.</p>}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Reseptit</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {recipePreview.length > 0 ? recipePreview.map((recipe) => (
                            <Badge key={recipe.id}>{recipe.name}</Badge>
                          )) : <p className="text-sm text-[var(--text-muted)]">Ei vielä reseptejä.</p>}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Ateriapohjat</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {templatePreview.length > 0 ? templatePreview.map((template) => (
                            <Badge key={template.id}>{template.name}</Badge>
                          )) : <p className="text-sm text-[var(--text-muted)]">Ei vielä ateriapohjia.</p>}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </>
          ) : null}

          {activeSection === "profiles" ? (
            <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">Käyttäjän ravintoprofiili</p>
                  <p className="text-sm text-[var(--text-muted)]">Laske tavoitekcal ja makrot tai lukitse ne käsin yhdelle käyttäjälle kerrallaan.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <Label htmlFor="nutrition-athlete">Käyttäjä</Label>
                    <Select
                      id="nutrition-athlete"
                      value={selectedAthleteId}
                      onChange={(event) => {
                        const nextUserId = event.target.value;
                        setSelectedAthleteId(nextUserId);
                        const profile = state.nutritionProfiles.find((item) => item.userId === nextUserId) ?? null;
                        setProfileForm({
                          goal: profile?.goal ?? "maintain",
                          activityLevel: profile?.activityLevel ?? "high",
                          mealsPerDay: String(profile?.mealsPerDay ?? 5),
                          calculationMode: profile?.calculationMode ?? "auto",
                          targetKcal: profile ? String(profile.targetKcal) : "",
                          proteinG: profile ? String(profile.proteinG) : "",
                          carbsG: profile ? String(profile.carbsG) : "",
                          fatG: profile ? String(profile.fatG) : "",
                          coachNotes: profile?.coachNotes ?? "",
                          dietaryFlags: splitKnownAndCustom(profile?.dietaryFlags ?? [], dietaryFlagOptions).known,
                          allergies: splitKnownAndCustom(profile?.allergies ?? [], allergyOptions).known,
                          customDietaryFlags: splitKnownAndCustom(profile?.dietaryFlags ?? [], dietaryFlagOptions).custom,
                          customAllergies: splitKnownAndCustom(profile?.allergies ?? [], allergyOptions).custom,
                        });
                      }}
                    >
                      {nutritionTargetUsers.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.fullName}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="nutrition-goal">Tavoite</Label>
                    <Select id="nutrition-goal" value={profileForm.goal} onChange={(event) => setProfileForm((current) => ({ ...current, goal: event.target.value as NutritionGoal }))}>
                      <option value="maintain">Pidä paino</option>
                      <option value="gain">Kasvata</option>
                      <option value="lose">Pudota</option>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="nutrition-activity">Aktiivisuus</Label>
                    <Select id="nutrition-activity" value={profileForm.activityLevel} onChange={(event) => setProfileForm((current) => ({ ...current, activityLevel: event.target.value as NutritionActivityLevel }))}>
                      <option value="low">Matala</option>
                      <option value="moderate">Kohtalainen</option>
                      <option value="high">Korkea</option>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="nutrition-meals">Ateriat / päivä</Label>
                    <Input id="nutrition-meals" value={profileForm.mealsPerDay} onChange={(event) => setProfileForm((current) => ({ ...current, mealsPerDay: event.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="nutrition-mode">Laskentatapa</Label>
                    <Select id="nutrition-mode" value={profileForm.calculationMode} onChange={(event) => setProfileForm((current) => ({ ...current, calculationMode: event.target.value as "auto" | "manual_override" }))}>
                      <option value="auto">Auto</option>
                      <option value="manual_override">Manuaalinen</option>
                    </Select>
                  </div>
                  {profileForm.calculationMode === "auto" ? (
                    <div className="md:col-span-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                      <p className="text-sm font-semibold text-[var(--text)]">Autolaskenta käytössä</p>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        kcal ja makrot lasketaan käyttäjän iän, sukupuolen, pituuden, painon, tavoitteen ja aktiivisuustason perusteella.
                      </p>
                      <p className="mt-2 text-sm text-[var(--text-muted)]">
                        Tämä on suuntaa-antava aloitussuositus, jota tarkennetaan painotrendin, kylläisyyden, jaksamisen ja treenitehon perusteella.
                      </p>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
                          <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Nykyinen paino</p>
                          <p className="mt-1 text-lg font-semibold text-[var(--text)]">{latestWeightKg ?? "-"}</p>
                          <p className="text-sm text-[var(--text-muted)]">kg</p>
                        </div>
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
                          <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Nykyinen vyötärö</p>
                          <p className="mt-1 text-lg font-semibold text-[var(--text)]">{latestWaistCm ?? "-"}</p>
                          <p className="text-sm text-[var(--text-muted)]">cm</p>
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-[var(--text-muted)]">
                        Paino ja vyötärö päivitetään käyttäjän omasta profiilista ja mittaseurannasta.
                      </p>
                      <p className="mt-2 text-sm text-[var(--text-muted)]">
                        {getMacroGoalGuidance(profileForm.goal)}
                      </p>
                      <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
                        <p className="text-sm font-semibold text-[var(--text)]">Miten auto laskee?</p>
                        <div className="mt-2 space-y-2 text-sm text-[var(--text-muted)]">
                          <p>Energia arvioidaan perusaineenvaihdunnan ja aktiivisuuskertoimen kautta, jonka jälkeen tavoite säätää kokonaiskaloreita ylös tai alas.</p>
                          <p>Proteiini asetetaan ensin tavoitteen mukaan, rasvalle asetetaan riittävä minimitaso ja hiilarit täyttävät loput kalorit treenin tueksi.</p>
                          <p>Arvo on aloituspiste, jota säädetään myöhemmin seurannan perusteella.</p>
                        </div>
                      </div>
                      {missingAutoFields.length > 0 ? (
                        <div className="mt-3 rounded-2xl border border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] p-3">
                          <p className="text-sm font-semibold text-[var(--text)]">Puuttuvat tiedot autolaskennasta</p>
                          <p className="mt-1 text-sm text-[var(--text-muted)]">
                            Täydennä käyttäjän profiiliin: {missingAutoFields.map((field) => {
                              switch (field) {
                                case "age":
                                  return "ikä";
                                case "sex":
                                  return "sukupuoli";
                                case "heightCm":
                                  return "pituus";
                                case "weightKg":
                                  return "paino";
                              }
                            }).join(", ")}.
                          </p>
                          <p className="mt-2 text-sm text-[var(--text-muted)]">
                            Kun tiedot puuttuvat, järjestelmä käyttää aiempia arvoja tai oletuksia eikä auto ole täysin luotettava.
                          </p>
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-[var(--text-muted)]">
                          Kaikki autolaskennan perustiedot löytyvät valitulta käyttäjältä.
                        </p>
                      )}
                    </div>
                  ) : (
                    <>
                      <div>
                        <Label htmlFor="nutrition-kcal">Tavoite kcal</Label>
                        <Input id="nutrition-kcal" value={profileForm.targetKcal} onChange={(event) => setProfileForm((current) => ({ ...current, targetKcal: event.target.value }))} />
                      </div>
                      <div>
                        <Label htmlFor="nutrition-protein">Proteiini (g)</Label>
                        <Input id="nutrition-protein" value={profileForm.proteinG} onChange={(event) => setProfileForm((current) => ({ ...current, proteinG: event.target.value }))} />
                      </div>
                      <div>
                        <Label htmlFor="nutrition-carbs">Hiilarit (g)</Label>
                        <Input id="nutrition-carbs" value={profileForm.carbsG} onChange={(event) => setProfileForm((current) => ({ ...current, carbsG: event.target.value }))} />
                      </div>
                      <div>
                        <Label htmlFor="nutrition-fat">Rasva (g)</Label>
                        <Input id="nutrition-fat" value={profileForm.fatG} onChange={(event) => setProfileForm((current) => ({ ...current, fatG: event.target.value }))} />
                      </div>
                    </>
                  )}
                  <div className="md:col-span-2">
                    <Label>Ruokavalio</Label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {dietaryFlagOptions.map((option) => (
                        <label
                          key={option}
                          className="flex min-h-11 items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)]"
                        >
                          <Input
                            type="checkbox"
                            className="size-4 w-4 rounded border-[var(--border-strong)] px-0 py-0"
                            checked={profileForm.dietaryFlags.includes(option)}
                            onChange={() => toggleSelection("dietaryFlags", option)}
                          />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-3">
                      <Label htmlFor="nutrition-custom-flags">Muut ruokavaliorajoitteet</Label>
                      <Input
                        id="nutrition-custom-flags"
                        placeholder="esim. fodmap, vähähiilihydraattinen"
                        value={profileForm.customDietaryFlags}
                        onChange={(event) => setProfileForm((current) => ({ ...current, customDietaryFlags: event.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <Label>Allergiat</Label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {allergyOptions.map((option) => (
                        <label
                          key={option}
                          className="flex min-h-11 items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)]"
                        >
                          <Input
                            type="checkbox"
                            className="size-4 w-4 rounded border-[var(--border-strong)] px-0 py-0"
                            checked={profileForm.allergies.includes(option)}
                            onChange={() => toggleSelection("allergies", option)}
                          />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-3">
                      <Label htmlFor="nutrition-custom-allergies">Muut allergiat tai vältettävät</Label>
                      <Input
                        id="nutrition-custom-allergies"
                        placeholder="esim. sinappi, paprika"
                        value={profileForm.customAllergies}
                        onChange={(event) => setProfileForm((current) => ({ ...current, customAllergies: event.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="nutrition-notes">Coach-notes</Label>
                    <Textarea id="nutrition-notes" value={profileForm.coachNotes} onChange={(event) => setProfileForm((current) => ({ ...current, coachNotes: event.target.value }))} />
                  </div>
                </div>
                <Button type="button" disabled={isSavingNutritionProfile} onClick={() => void handleSaveNutritionProfile()}>
                  {isSavingNutritionProfile ? "Tallennetaan..." : "Tallenna ravintoprofiili"}
                </Button>
              </div>

              <div className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">Pikayhteenveto</p>
                  <p className="text-sm text-[var(--text-muted)]">Valitun käyttäjän tilanne yhdellä silmäyksellä ennen tallennusta.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Käyttäjä</p>
                    <p className="mt-2 text-lg font-semibold text-[var(--text)]">{selectedAthleteName}</p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">{selectedProfile ? "Profiili löytyy jo" : "Uusi profiili tallennetaan ensimmäistä kertaa"}</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Tila</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge>{profileForm.calculationMode === "auto" ? "Auto" : "Manuaalinen"}</Badge>
                      <Badge>{profileForm.activityLevel === "low" ? "Matala aktiivisuus" : profileForm.activityLevel === "moderate" ? "Kohtalainen aktiivisuus" : "Korkea aktiivisuus"}</Badge>
                    </div>
                    {profileForm.calculationMode === "auto" ? (
                      <p className="mt-2 text-sm text-[var(--text-muted)]">Aloitussuositus, tarkennetaan seurannalla.</p>
                    ) : null}
                  </div>
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Energia</p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{displayedTargetKcal ?? "Auto"}</p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">kcal / päivä</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Makrot</p>
                    <p className="mt-2 text-lg font-semibold text-[var(--text)]">
                      P {displayedProtein ?? "-"} / H {displayedCarbs ?? "-"} / R {displayedFat ?? "-"}
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">grammaa per päivä</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                  <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Rajoitteet</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[...profileForm.dietaryFlags, ...parseList(profileForm.customDietaryFlags)].map((flag) => (
                      <Badge key={flag}>{flag}</Badge>
                    ))}
                    {[...profileForm.allergies, ...parseList(profileForm.customAllergies)].map((allergy) => (
                      <Badge key={allergy}>{allergy}</Badge>
                    ))}
                    {[...profileForm.dietaryFlags, ...parseList(profileForm.customDietaryFlags)].length === 0 &&
                    [...profileForm.allergies, ...parseList(profileForm.customAllergies)].length === 0 ? (
                      <p className="text-sm text-[var(--text-muted)]">Ei lisättyjä ruokavalioita tai allergioita.</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {activeSection === "recipes" ? (
            <div className="space-y-6">
              <div
                role="tablist"
                aria-label="Reseptityötila"
                className={`grid gap-2 rounded-[1.2rem] border border-[var(--border)] bg-[var(--surface-2)] p-2 ${canManageIngredients ? "md:grid-cols-2" : "md:grid-cols-1"}`}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={recipeWorkspace === "recipe"}
                  aria-controls="nutrition-recipe-workspace"
                  id="nutrition-recipe-tab"
                  tabIndex={recipeWorkspace === "recipe" ? 0 : -1}
                  className={`rounded-2xl px-4 py-3 text-left transition ${recipeWorkspace === "recipe" ? "border border-[color-mix(in_srgb,var(--accent)_24%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] text-[var(--text)]" : "border border-transparent bg-transparent text-[var(--text-muted)] hover:border-[var(--border)] hover:bg-[var(--surface)] hover:text-[var(--text)]"}`}
                  onClick={() => setRecipeWorkspace("recipe")}
                >
                  <p className="text-sm font-semibold">Reseptieditori</p>
                  <p className="mt-1 text-xs text-[var(--text-subtle)]">Pääraaka-aineet, annokset ja skaalaus yhteen reseptiin.</p>
                </button>
                {canManageIngredients ? (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={recipeWorkspace === "ingredients"}
                    aria-controls="nutrition-ingredient-workspace"
                    id="nutrition-ingredient-tab"
                    tabIndex={recipeWorkspace === "ingredients" ? 0 : -1}
                    className={`rounded-2xl px-4 py-3 text-left transition ${recipeWorkspace === "ingredients" ? "border border-[color-mix(in_srgb,var(--accent)_24%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface))] text-[var(--text)]" : "border border-transparent bg-transparent text-[var(--text-muted)] hover:border-[var(--border)] hover:bg-[var(--surface)] hover:text-[var(--text)]"}`}
                    onClick={() => setRecipeWorkspace("ingredients")}
                  >
                    <p className="text-sm font-semibold">Raaka-ainekatalogi</p>
                    <p className="mt-1 text-xs text-[var(--text-subtle)]">Lisää puuttuva aine käsin ja tarkista mitä kirjastosta jo löytyy.</p>
                  </button>
                ) : null}
              </div>

              {recipeWorkspace === "recipe" ? (
                <section id="nutrition-recipe-workspace" role="tabpanel" aria-labelledby="nutrition-recipe-tab" className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                  <div className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">Reseptieditori</p>
                      <p className="text-sm text-[var(--text-muted)]">Rakenna resepti niin, että ostettavat määrät ja annosskaalaus pysyvät realistisina.</p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                      <div>
                        <Label htmlFor="recipe-existing">Muokkaa olemassa olevaa reseptia</Label>
                        <Select
                          id="recipe-existing"
                          value={selectedRecipeId}
                          onChange={(event) => {
                            const nextRecipeId = event.target.value;
                            if (!nextRecipeId) {
                              resetRecipeEditor();
                              return;
                            }
                            loadRecipeToEditor(nextRecipeId);
                          }}
                        >
                          <option value="">Uusi resepti</option>
                          {filteredRecipes.map((recipe) => (
                            <option key={recipe.id} value={recipe.id}>{recipe.name}</option>
                          ))}
                        </Select>
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" variant="secondary" onClick={resetRecipeEditor}>Tyhjenna editori</Button>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={!selectedRecipeId || isSavingRecipe || isDeletingRecipe}
                          onClick={() => {
                            if (selectedRecipeId) {
                              duplicateRecipeToEditor(selectedRecipeId);
                            }
                          }}
                        >
                          Duplikoi
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={!selectedRecipeId || isSavingRecipe || isDeletingRecipe}
                          onClick={() => void handleDeleteRecipe()}
                        >
                          {isDeletingRecipe ? "Poistetaan..." : "Poista"}
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <Label htmlFor="recipe-search">Hae reseptia</Label>
                        <Input
                          id="recipe-search"
                          placeholder="Kirjoita nimi tai kuvaus"
                          value={recipeSearchQuery}
                          onChange={(event) => setRecipeSearchQuery(event.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="recipe-filter-meal-tag">Suodata aterian mukaan</Label>
                        <Select
                          id="recipe-filter-meal-tag"
                          value={recipeFilterMealTag}
                          onChange={(event) => setRecipeFilterMealTag(event.target.value as MealTag | "all")}
                        >
                          <option value="all">Kaikki ateriat</option>
                          {mealTags.map((mealTag) => (
                            <option key={mealTag} value={mealTag}>{mealTagLabel(mealTag)}</option>
                          ))}
                        </Select>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                      <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Viimeksi paivitetyt</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {recentRecipes.length > 0 ? recentRecipes.map((recipe) => (
                          <div key={recipe.id} className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-1">
                            <button
                              type="button"
                              className={`rounded-full px-2 py-1 text-sm transition ${selectedRecipeId === recipe.id ? "text-[var(--text)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
                              onClick={() => loadRecipeToEditor(recipe.id)}
                            >
                              {recipe.name}
                            </button>
                            <button
                              type="button"
                              className="rounded-full px-2 py-1 text-xs text-[var(--text-muted)] transition hover:text-[var(--text)]"
                              onClick={() => duplicateRecipeToEditor(recipe.id)}
                            >
                              Kopioi
                            </button>
                          </div>
                        )) : <p className="text-sm text-[var(--text-muted)]">Ei vielä reseptejä.</p>}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text-muted)]">
                      Loytyi {filteredRecipes.length} reseptia nykyisilla suodattimilla.
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <Label htmlFor="recipe-name">Reseptin nimi</Label>
                        <Input id="recipe-name" value={recipeForm.name} onChange={(event) => setRecipeForm((current) => ({ ...current, name: event.target.value }))} />
                      </div>
                      <div className="md:col-span-2">
                        <Label htmlFor="recipe-description">Kuvaus</Label>
                        <Input id="recipe-description" value={recipeForm.description} onChange={(event) => setRecipeForm((current) => ({ ...current, description: event.target.value }))} />
                      </div>
                      <div>
                        <Label htmlFor="recipe-mealtag">Ateria</Label>
                        <Select id="recipe-mealtag" value={recipeForm.mealTag} onChange={(event) => setRecipeForm((current) => ({ ...current, mealTag: event.target.value as MealTag }))}>
                          {mealTags.map((mealTag) => (
                            <option key={mealTag} value={mealTag}>{mealTagLabel(mealTag)}</option>
                          ))}
                        </Select>
                      </div>
                      <div className="md:col-span-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                        <p className="text-sm font-semibold text-[var(--text)]">Reseptin rajoitteet ja allergeenit</p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">Nämä tagit tekevät varoituksista tarkempia kuin pelkkä ainesosanimien tulkinta.</p>
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <div className="space-y-3">
                            <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Ruokavaliot</p>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {dietaryFlagOptions.map((option) => (
                                <label key={`recipe-dietary-${option}`} className="flex items-center gap-2 text-sm text-[var(--text)]">
                                  <input
                                    type="checkbox"
                                    checked={recipeForm.dietaryFlags.includes(option)}
                                    onChange={() => setRecipeForm((current) => ({
                                      ...current,
                                      dietaryFlags: current.dietaryFlags.includes(option)
                                        ? current.dietaryFlags.filter((item) => item !== option)
                                        : [...current.dietaryFlags, option],
                                    }))}
                                  />
                                  <span>{option}</span>
                                </label>
                              ))}
                            </div>
                            <div>
                              <Label htmlFor="recipe-custom-dietary-flags">Muut ruokavaliot tai rajoitteet</Label>
                              <Input
                                id="recipe-custom-dietary-flags"
                                placeholder="Esim. ei sianlihaa, low FODMAP"
                                value={recipeForm.customDietaryFlags}
                                onChange={(event) => setRecipeForm((current) => ({ ...current, customDietaryFlags: event.target.value }))}
                              />
                            </div>
                          </div>
                          <div className="space-y-3">
                            <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Allergeenit</p>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {allergyOptions.map((option) => (
                                <label key={`recipe-allergy-${option}`} className="flex items-center gap-2 text-sm text-[var(--text)]">
                                  <input
                                    type="checkbox"
                                    checked={recipeForm.allergies.includes(option)}
                                    onChange={() => setRecipeForm((current) => ({
                                      ...current,
                                      allergies: current.allergies.includes(option)
                                        ? current.allergies.filter((item) => item !== option)
                                        : [...current.allergies, option],
                                    }))}
                                  />
                                  <span>{option}</span>
                                </label>
                              ))}
                            </div>
                            <div>
                              <Label htmlFor="recipe-custom-allergies">Muut allergeenit</Label>
                              <Input
                                id="recipe-custom-allergies"
                                placeholder="Esim. selleri"
                                value={recipeForm.customAllergies}
                                onChange={(event) => setRecipeForm((current) => ({ ...current, customAllergies: event.target.value }))}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="md:col-span-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                        <div className="grid gap-4 md:grid-cols-[minmax(0,220px)_1fr] md:items-start">
                          <div>
                            <Label htmlFor="recipe-servings">Oletusannosmäärä</Label>
                            <Input
                              id="recipe-servings"
                              value={recipeForm.defaultServings}
                              onChange={(event) => setRecipeForm((current) => ({ ...current, defaultServings: event.target.value }))}
                            />
                          </div>
                          <div className="text-sm text-[var(--text-muted)]">
                            <p className="font-medium text-[var(--text)]">Mitä tämä tarkoittaa?</p>
                            <p className="mt-1">
                              Tämä on reseptin perusmäärä, johon makrot lasketaan ja jolla resepti avautuu käyttäjälle oletuksena.
                            </p>
                            <p className="mt-2">
                              Käyttäjä voi sen jälkeen lisätä tai vähentää annoksia <span className="font-medium text-[var(--text)]">+ / -</span> -painikkeilla ilman erillisiä reseptikohtaisia rajoituksia.
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="md:col-span-2 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <Label>Ohjeet steppeinä</Label>
                            <p className="text-xs text-[var(--text-muted)]">Kirjoita valmistus vaiheittain. Järjestys tallennetaan automaattisesti.</p>
                          </div>
                          <Button type="button" variant="secondary" onClick={() => setRecipeSteps((current) => [...current, emptyRecipeStepDraft()])}>Lisää step</Button>
                        </div>
                        {recipeSteps.map((step, index) => (
                          <div key={`recipe-step-${index}`} className="space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-[var(--text)]">Vaihe {index + 1}</p>
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  className="px-3 py-2 text-sm"
                                  disabled={index === 0}
                                  onClick={() => setRecipeSteps((current) => {
                                    if (index === 0) {
                                      return current;
                                    }
                                    const next = [...current];
                                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                                    return next;
                                  })}
                                >
                                  Ylos
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  className="px-3 py-2 text-sm"
                                  disabled={index === recipeSteps.length - 1}
                                  onClick={() => setRecipeSteps((current) => {
                                    if (index === current.length - 1) {
                                      return current;
                                    }
                                    const next = [...current];
                                    [next[index], next[index + 1]] = [next[index + 1], next[index]];
                                    return next;
                                  })}
                                >
                                  Alas
                                </Button>
                                {recipeSteps.length > 1 ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className="px-3 py-2 text-sm"
                                    onClick={() => setRecipeSteps((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                                  >
                                    Poista
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                            <Textarea
                              id={`recipe-step-${index}`}
                              value={step}
                              onChange={(event) => setRecipeSteps((current) => current.map((row, rowIndex) => rowIndex === index ? event.target.value : row))}
                              placeholder="Esim. Kypsennä riisi pakkauksen ohjeen mukaan."
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[var(--text)]">Raaka-aineet</p>
                          <p className="text-xs text-[var(--text-muted)]">Pääraaka-aineet lineaarisesti, mausteet kiinteästi tai vain ohjeeseen.</p>
                        </div>
                        <Button type="button" variant="secondary" onClick={() => setRecipeIngredients((current) => [...current, emptyRecipeIngredientDraft()])}>Lisää rivi</Button>
                      </div>
                      {recipeIngredients.map((ingredient, index) => (
                        <div key={`${index}-${ingredient.ingredientId}`} className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 md:grid-cols-2">
                          <div className="md:col-span-2 flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-[var(--text)]">Rivi {index + 1}</p>
                              <p className="text-xs text-[var(--text-muted)]">Anna makroihin käytettävä määrä ja halutessasi käyttäjälle näkyvä määrä erikseen.</p>
                            </div>
                            {recipeIngredients.length > 1 ? (
                              <Button
                                type="button"
                                variant="ghost"
                                className="px-3 py-2 text-sm"
                                onClick={() => setRecipeIngredients((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                              >
                                Poista
                              </Button>
                            ) : null}
                          </div>
                          <div className="md:col-span-2">
                            <Label htmlFor={`recipe-ingredient-${index}`}>Raaka-aine kirjastosta</Label>
                            <Select
                              id={`recipe-ingredient-${index}`}
                              value={ingredient.ingredientId}
                              onChange={(event) => {
                                const selected = sortedIngredientsCatalog.find((item) => item.id === event.target.value);
                                setRecipeIngredients((current) =>
                                  current.map((row, rowIndex) =>
                                    rowIndex === index
                                      ? {
                                          ...row,
                                          ingredientId: event.target.value,
                                          ingredientName: selected ? ingredientLabel(selected) : row.ingredientName,
                                        }
                                      : row,
                                  ),
                                );
                              }}
                            >
                              <option value="">Kirjoita oma nimi alle</option>
                              {sortedIngredientsCatalog.map((item) => (
                                <option key={item.id} value={item.id}>{ingredientLabel(item)}</option>
                              ))}
                            </Select>
                          </div>
                          <div className="md:col-span-2">
                            <Label htmlFor={`recipe-ingredient-name-${index}`}>Rivin nimi</Label>
                            <Input id={`recipe-ingredient-name-${index}`} value={ingredient.ingredientName} onChange={(event) => setRecipeIngredients((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ingredientName: event.target.value } : row))} />
                          </div>
                          <div className="md:col-span-2">
                            <Label htmlFor={`recipe-ingredient-group-${index}`}>Ainesosaryhmä</Label>
                            <Input id={`recipe-ingredient-group-${index}`} placeholder="Esim. Kastike, lisuke tai päälle" value={ingredient.groupLabel} onChange={(event) => setRecipeIngredients((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, groupLabel: event.target.value } : row))} />
                          </div>
                          <div className="md:col-span-2">
                            <Label htmlFor={`recipe-ingredient-alternatives-${index}`}>Vaihtoehdot</Label>
                            <Input
                              id={`recipe-ingredient-alternatives-${index}`}
                              placeholder="Esim. kevyt margariini, tuorejuusto 11%"
                              value={ingredient.alternatives}
                              onChange={(event) => setRecipeIngredients((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, alternatives: event.target.value } : row))}
                            />
                            <p className="mt-1 text-xs text-[var(--text-muted)]">Erottele vaihtoehdot pilkulla. Ne näkyvät reseptissä tämän ainesosan alla.</p>
                          </div>
                          <div>
                            <Label htmlFor={`recipe-ingredient-quantity-${index}`}>Makroihin käytettävä määrä</Label>
                            <Input id={`recipe-ingredient-quantity-${index}`} value={ingredient.quantity} onChange={(event) => setRecipeIngredients((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: event.target.value } : row))} />
                          </div>
                          <div>
                            <Label htmlFor={`recipe-ingredient-unit-${index}`}>Yksikkö</Label>
                            <Select id={`recipe-ingredient-unit-${index}`} value={ingredient.unit} onChange={(event) => setRecipeIngredients((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, unit: event.target.value as "g" | "ml" | "pcs" } : row))}>
                              <option value="g">g</option>
                              <option value="ml">ml</option>
                              <option value="pcs">kpl</option>
                            </Select>
                          </div>
                          <div>
                            <Label htmlFor={`recipe-ingredient-role-${index}`}>Rooli</Label>
                            <Select id={`recipe-ingredient-role-${index}`} value={ingredient.ingredientRole} onChange={(event) => setRecipeIngredients((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ingredientRole: event.target.value as IngredientRole, scalingMode: event.target.value === "main" ? "linear" : row.scalingMode } : row))}>
                              <option value="main">Pääraaka-aine</option>
                              <option value="spice">Mauste</option>
                              <option value="garnish">Viimeistely</option>
                            </Select>
                          </div>
                          <div>
                            <Label htmlFor={`recipe-ingredient-scaling-${index}`}>Skaalaus</Label>
                            <Select id={`recipe-ingredient-scaling-${index}`} value={ingredient.scalingMode} onChange={(event) => setRecipeIngredients((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, scalingMode: event.target.value as IngredientScalingMode } : row))}>
                              <option value="linear">Lineaarinen</option>
                              <option value="gentle">Hillitty</option>
                              <option value="fixed">Kiinteä</option>
                              <option value="text_only">Vain ohjeeseen</option>
                            </Select>
                          </div>
                          <div>
                            <Label htmlFor={`recipe-ingredient-display-quantity-${index}`}>Käyttäjälle näkyvä määrä</Label>
                            <Input id={`recipe-ingredient-display-quantity-${index}`} placeholder="1" value={ingredient.displayQuantity} onChange={(event) => setRecipeIngredients((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, displayQuantity: event.target.value } : row))} />
                          </div>
                          <div>
                            <Label htmlFor={`recipe-ingredient-display-unit-${index}`}>Käyttäjälle näkyvä yksikkö</Label>
                            <Input id={`recipe-ingredient-display-unit-${index}`} placeholder="tl / maun mukaan" value={ingredient.displayUnit} onChange={(event) => setRecipeIngredients((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, displayUnit: event.target.value } : row))} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button type="button" disabled={isSavingRecipe || isDeletingRecipe} onClick={() => void handleSaveRecipe()}>
                      {isSavingRecipe ? "Tallennetaan..." : selectedRecipeId ? "Päivitä resepti" : "Tallenna resepti"}
                    </Button>
                  </div>

                  <div className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                      <p className="text-sm font-semibold text-[var(--text)]">Makroesikatselu</p>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">Lasketaan editorin nykyisistä riveistä. Linkitä pääraaka-aineet kirjastoon, jotta makrot osuvat oikein.</p>
                      {recipeNutritionPreview.hasIngredients && recipeNutritionPreview.nutritionPerServing ? (
                        <div className="mt-4 space-y-4">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
                              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Per annos</p>
                              <p className="mt-2 text-lg font-semibold text-[var(--text)]">{recipeNutritionPreview.nutritionPerServing.kcal} kcal</p>
                              <p className="mt-1 text-sm text-[var(--text-muted)]">
                                P {Math.round(recipeNutritionPreview.nutritionPerServing.proteinG)} g · H {Math.round(recipeNutritionPreview.nutritionPerServing.carbsG)} g · R {Math.round(recipeNutritionPreview.nutritionPerServing.fatG)} g
                              </p>
                            </div>
                            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
                              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Koko resepti</p>
                              <p className="mt-2 text-lg font-semibold text-[var(--text)]">{recipeNutritionPreview.nutritionPerRecipe?.kcal ?? 0} kcal</p>
                              <p className="mt-1 text-sm text-[var(--text-muted)]">
                                P {Math.round(recipeNutritionPreview.nutritionPerRecipe?.proteinG ?? 0)} g · H {Math.round(recipeNutritionPreview.nutritionPerRecipe?.carbsG ?? 0)} g · R {Math.round(recipeNutritionPreview.nutritionPerRecipe?.fatG ?? 0)} g
                              </p>
                            </div>
                          </div>
                          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm text-[var(--text-muted)]">
                            <p>Linkitetyt rivit: {recipeNutritionPreview.linkedIngredientCount} / {recipeNutritionPreview.totalIngredientCount}</p>
                            {recipeNutritionPreview.unlinkedIngredientNames.length > 0 ? (
                              <p className="mt-2">Ei vielä linkitetty kirjastoon: {recipeNutritionPreview.unlinkedIngredientNames.join(", ")}</p>
                            ) : (
                              <p className="mt-2">Kaikki laskentaan vaikuttavat rivit ovat linkitetty kirjastoon.</p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-[var(--text-muted)]">Lisää reseptille raaka-aineita, niin makroesikatselu tulee tähän automaattisesti.</p>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">Editorin muistilista</p>
                      <p className="text-sm text-[var(--text-muted)]">Näillä valinnoilla reseptit pysyvät helpompina hallita ja ostaa.</p>
                    </div>
                    <div className="space-y-3 text-sm text-[var(--text-muted)]">
                      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                        <p className="font-semibold text-[var(--text)]">Pääraaka-aine</p>
                        <p className="mt-1">Käytä tavallisesti `linear`, jotta annosmäärän kasvu nostaa myös ostettavaa määrää loogisesti.</p>
                      </div>
                      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                        <p className="font-semibold text-[var(--text)]">Mauste</p>
                        <p className="mt-1">Käytä tavallisesti `gentle`, jos mausteen pitää kasvaa annosmäärän mukana hillitysti. Käytä `fixed`, jos määrä pysyy käytännössä samana, tai `text_only`, jos ohjeeseen riittää esimerkiksi “maun mukaan”.</p>
                      </div>
                      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                        <p className="font-semibold text-[var(--text)]">Näyttömuoto</p>
                        <p className="mt-1">Laskenta voi olla grammoissa, mutta käyttäjälle voit näyttää esimerkiksi `1 tl` tai `maun mukaan`.</p>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                      <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Kirjastosta valmiina</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {ingredientCatalogPreview.length > 0 ? ingredientCatalogPreview.map((ingredient) => (
                          <Badge key={ingredient.id}>{ingredientLabel(ingredient)}</Badge>
                        )) : <p className="text-sm text-[var(--text-muted)]">Ei vielä raaka-aineita.</p>}
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}

              {recipeWorkspace === "ingredients" ? (
                <section id="nutrition-ingredient-workspace" role="tabpanel" aria-labelledby="nutrition-ingredient-tab" className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                  <div className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">Raaka-ainekatalogi</p>
                      <p className="text-sm text-[var(--text-muted)]">Pidä tekninen nimi vakaana ja siivoa käyttäjälle näkyvä nimi erikseen. Näin makrolaskenta pysyy ehjänä, vaikka kirjaston otsikot paranevat.</p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                      <div>
                        <Label htmlFor="ingredient-editor-select">Muokkaa olemassa olevaa raaka-ainetta</Label>
                        <Select
                          id="ingredient-editor-select"
                          value={selectedIngredientId}
                          onChange={(event) => {
                            const nextIngredientId = event.target.value;
                            if (!nextIngredientId) {
                              resetIngredientEditor();
                              return;
                            }
                            loadIngredientToEditor(nextIngredientId);
                          }}
                        >
                          <option value="">Luo uusi raaka-aine</option>
                          {sortedIngredientsCatalog.map((ingredient) => (
                            <option key={ingredient.id} value={ingredient.id}>
                              {ingredientLabel(ingredient)}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="flex items-end">
                        <Button type="button" variant="secondary" onClick={resetIngredientEditor}>
                          Uusi raaka-aine
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <Label htmlFor="ingredient-name">Tekninen nimi</Label>
                        <Input id="ingredient-name" value={ingredientForm.name} onChange={(event) => setIngredientForm((current) => ({ ...current, name: event.target.value }))} />
                        <p className="mt-1 text-xs text-[var(--text-muted)]">Tämä voi jäädä lähdejärjestelmän nimeksi. Makrolaskenta käyttää linkitystä, ei tätä kenttää.</p>
                      </div>
                      <div className="md:col-span-2">
                        <Label htmlFor="ingredient-display-name">Käyttäjälle näkyvä nimi</Label>
                        <Input
                          id="ingredient-display-name"
                          placeholder="Esim. Täysjyväleipä"
                          value={ingredientForm.displayName}
                          onChange={(event) => setIngredientForm((current) => ({ ...current, displayName: event.target.value }))}
                        />
                        <p className="mt-1 text-xs text-[var(--text-muted)]">Näytetään resepteissä ja raaka-ainekirjastossa. Jos jätät tyhjäksi, käytetään teknistä nimeä.</p>
                      </div>
                      <div>
                        <Label htmlFor="ingredient-unit">Ostoyksikkö</Label>
                        <Select id="ingredient-unit" value={ingredientForm.defaultPurchaseUnit} onChange={(event) => setIngredientForm((current) => ({ ...current, defaultPurchaseUnit: event.target.value as PurchaseUnit }))}>
                          <option value="g">g</option>
                          <option value="kg">kg</option>
                          <option value="ml">ml</option>
                          <option value="l">l</option>
                          <option value="pcs">kpl</option>
                          <option value="pack">pakkaus</option>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="ingredient-kcal">kcal / 100</Label>
                        <Input id="ingredient-kcal" value={ingredientForm.kcalPer100} onChange={(event) => setIngredientForm((current) => ({ ...current, kcalPer100: event.target.value }))} />
                      </div>
                      <div>
                        <Label htmlFor="ingredient-protein">Proteiini / 100</Label>
                        <Input id="ingredient-protein" value={ingredientForm.proteinPer100} onChange={(event) => setIngredientForm((current) => ({ ...current, proteinPer100: event.target.value }))} />
                      </div>
                      <div>
                        <Label htmlFor="ingredient-carbs">Hiilarit / 100</Label>
                        <Input id="ingredient-carbs" value={ingredientForm.carbsPer100} onChange={(event) => setIngredientForm((current) => ({ ...current, carbsPer100: event.target.value }))} />
                      </div>
                      <div>
                        <Label htmlFor="ingredient-fat">Rasva / 100</Label>
                        <Input id="ingredient-fat" value={ingredientForm.fatPer100} onChange={(event) => setIngredientForm((current) => ({ ...current, fatPer100: event.target.value }))} />
                      </div>
                    </div>
                    <Button type="button" disabled={isSavingIngredient} onClick={() => void handleSaveIngredient()}>
                      {isSavingIngredient ? "Tallennetaan..." : selectedIngredientId ? "Päivitä raaka-aine" : "Tallenna raaka-aine"}
                    </Button>
                  </div>

                  <div className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">Nykyinen kirjasto</p>
                      <p className="text-sm text-[var(--text-muted)]">Pikakatsaus jo lisättyihin raaka-aineisiin. Tämä pitää myöhemmin korvata haulla.</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                      <div className="flex flex-wrap gap-2">
                        {sortedIngredientsCatalog.length > 0 ? sortedIngredientsCatalog.slice(0, 24).map((ingredient) => (
                          <Badge key={ingredient.id}>{ingredientLabel(ingredient)}</Badge>
                        )) : <p className="text-sm text-[var(--text-muted)]">Ei vielä raaka-aineita.</p>}
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}

          {activeSection === "plans" ? (
            <section className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
              <div className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">Ateriapohja</p>
                  <p className="text-sm text-[var(--text-muted)]">Rakenna päivän runko valmiista resepteistä ilman että kaikki ateriat ovat yhtä aikaa pakollisia.</p>
                </div>
                <div className="space-y-3">
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="min-w-[240px] flex-1">
                        <Label htmlFor="template-picker">Muokkaa olemassa olevaa pohjaa</Label>
                        <Select
                          id="template-picker"
                          value={selectedTemplateId}
                          onChange={(event) => {
                            const nextTemplateId = event.target.value;
                            if (!nextTemplateId) {
                              resetTemplateEditor();
                              return;
                            }
                            loadTemplateToEditor(nextTemplateId);
                          }}
                        >
                          <option value="">Uusi ateriapohja</option>
                          {state.mealPlanTemplates.map((template) => (
                            <option key={template.id} value={template.id}>{template.name}</option>
                          ))}
                        </Select>
                      </div>
                      <Button type="button" variant="secondary" onClick={resetTemplateEditor}>
                        Uusi pohja
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={!selectedTemplateId || isSavingMealPlanTemplate}
                        onClick={() => {
                          if (selectedTemplateId) {
                            duplicateTemplateToEditor(selectedTemplateId);
                          }
                        }}
                      >
                        Kopioi pohja
                      </Button>
                    </div>
                    <p className="mt-3 text-xs text-[var(--text-muted)]">
                      {selectedTemplateId
                        ? "Muokkaat nyt tallennettua ateriapohjaa. Tallennus päivittää nykyisen pohjan."
                        : "Rakenna uusi ateriapohja tai lataa valmis pohja takaisin editoriin."}
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="template-name">Ateriapohjan nimi</Label>
                    <Input id="template-name" value={templateForm.name} onChange={(event) => setTemplateForm((current) => ({ ...current, name: event.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="template-description">Kuvaus</Label>
                    <Input id="template-description" value={templateForm.description} onChange={(event) => setTemplateForm((current) => ({ ...current, description: event.target.value }))} />
                  </div>
                  {mealTags.map((mealTag) => (
                    <div key={mealTag} className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                      <div>
                        <Label>{mealTagLabel(mealTag)}</Label>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">Valitse useita vaihtoehtoja saman ateriaryhmän sisälle. Käyttäjä voi syödä niitä ristiin sen mukaan, mikä arjessa toimii parhaiten.</p>
                        <p className="mt-1 text-xs font-medium text-[var(--text-subtle)]">
                          {mealSlotKcalGuidance(mealTag, displayedTargetKcal)
                            ? `Tyypillinen haarukka noin ${mealSlotKcalGuidance(mealTag, displayedTargetKcal)}`
                            : "Lisää tai valitse käyttäjälle kcal-tavoite, niin näkymään tulee suuntaa-antava haarukka."}
                        </p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {recipesByMealTag[mealTag].length > 0 ? recipesByMealTag[mealTag].map((recipe) => {
                          const isSelected = templateForm[mealTag].includes(recipe.id);
                          const nutrition = resolveRecipeNutritionPreview(recipe, state.ingredientsCatalog).nutritionPerServing;
                          return (
                            <button
                              key={recipe.id}
                              type="button"
                              className={`rounded-2xl border p-3 text-left transition ${isSelected ? "border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text)] shadow-[0_0_0_1px_var(--border-strong)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"}`}
                              onClick={() => setTemplateForm((current) => ({
                                ...current,
                                [mealTag]: current[mealTag].includes(recipe.id)
                                  ? current[mealTag].filter((item) => item !== recipe.id)
                                  : [...current[mealTag], recipe.id],
                              }))}
                              aria-pressed={isSelected}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-medium text-[var(--text)]">{recipe.name}</p>
                                  {recipe.description ? (
                                    <p className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">{recipe.description}</p>
                                  ) : null}
                                </div>
                                <Badge className={isSelected ? "border-[var(--border-strong)] bg-[var(--surface-3)] text-[var(--text)]" : undefined}>
                                  {isSelected ? "Valittu" : "Valitse"}
                                </Badge>
                              </div>
                              <div className="mt-3 grid grid-cols-4 gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 text-center">
                                <div>
                                  <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-subtle)]">kcal</p>
                                  <p className="mt-1 text-sm font-semibold text-[var(--text)]">{formatRecipeMacroValue(nutrition?.kcal)}</p>
                                </div>
                                <div>
                                  <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-subtle)]">P</p>
                                  <p className="mt-1 text-sm font-semibold text-[var(--text)]">{formatRecipeMacroValue(nutrition?.proteinG)} g</p>
                                </div>
                                <div>
                                  <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-subtle)]">H</p>
                                  <p className="mt-1 text-sm font-semibold text-[var(--text)]">{formatRecipeMacroValue(nutrition?.carbsG)} g</p>
                                </div>
                                <div>
                                  <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-subtle)]">R</p>
                                  <p className="mt-1 text-sm font-semibold text-[var(--text)]">{formatRecipeMacroValue(nutrition?.fatG)} g</p>
                                </div>
                              </div>
                            </button>
                          );
                        }) : <p className="text-sm text-[var(--text-muted)]">Tässä kategoriassa ei ole vielä reseptejä.</p>}
                      </div>
                      <p className="text-xs text-[var(--text-muted)]">Valittuna {templateForm[mealTag].length} vaihtoehtoa.</p>
                    </div>
                  ))}
                  <div className="space-y-2">
                    {missingMealTags.length > 0 ? (
                      <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--warning)_35%,var(--border))] bg-[color:color-mix(in_srgb,var(--warning)_12%,var(--surface))] px-4 py-3 text-sm text-[var(--warning)]">
                        Ateriapohjasta puuttuu vielä: {missingMealTags.map((mealTag) => mealTagLabel(mealTag)).join(", ")}. Voit silti tallentaa luonnoksen jo nyt.
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--success)_35%,var(--border))] bg-[color:color-mix(in_srgb,var(--success)_12%,var(--surface))] px-4 py-3 text-sm text-[var(--success)]">
                        Kaikki ateriaryhmät on täytetty. Pohja on valmis tallennettavaksi.
                      </div>
                    )}
                    <Button type="button" disabled={isSavingMealPlanTemplate} onClick={() => void handleSaveTemplate()}>
                      {isSavingMealPlanTemplate ? "Tallennetaan..." : selectedTemplateId ? "Päivitä ateriapohja" : "Tallenna ateriapohja"}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <p className="text-sm font-semibold text-[var(--text)]">Aktivoi käyttäjälle</p>
                  <div className="mt-3 grid gap-3">
                    <div>
                      <Label htmlFor="assign-athlete">Käyttäjä</Label>
                      <Select id="assign-athlete" value={assignmentForm.athleteId} onChange={(event) => setAssignmentForm((current) => ({ ...current, athleteId: event.target.value }))}>
                        {nutritionTargetUsers.map((user) => (
                          <option key={user.id} value={user.id}>{user.fullName}</option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="assign-template">Ateriapohja</Label>
                      <Select id="assign-template" value={assignmentForm.templateId} onChange={(event) => setAssignmentForm((current) => ({ ...current, templateId: event.target.value }))}>
                        {state.mealPlanTemplates.map((template) => (
                          <option key={template.id} value={template.id}>{template.name}</option>
                        ))}
                      </Select>
                    </div>
                    <Button type="button" disabled={isAssigningMealPlanTemplate} onClick={() => void handleAssignTemplate()}>
                      {isAssigningMealPlanTemplate ? "Jaetaan..." : "Jaa aktiiviseksi pohjaksi"}
                    </Button>
                  </div>
                </div>

                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <p className="text-sm font-semibold text-[var(--text)]">Valmiit pohjat</p>
                  <div className="mt-3 space-y-2">
                    {templatePreview.length > 0 ? templatePreview.map((template) => (
                      <div key={template.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
                        <div>
                          <p className="text-sm font-semibold text-[var(--text)]">{template.name}</p>
                          {template.description ? (
                            <p className="mt-1 text-xs text-[var(--text-muted)]">{template.description}</p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="secondary" className="px-3 py-2 text-sm" onClick={() => loadTemplateToEditor(template.id)}>
                            Muokkaa
                          </Button>
                          <Button type="button" variant="ghost" className="px-3 py-2 text-sm" onClick={() => duplicateTemplateToEditor(template.id)}>
                            Kopioi
                          </Button>
                        </div>
                      </div>
                    )) : <p className="text-sm text-[var(--text-muted)]">Ei vielä tallennettuja ateriapohjia.</p>}
                  </div>
                </div>

                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <p className="text-sm font-semibold text-[var(--text)]">Käyttäjän esikatselu</p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    Näin nykyinen luonnos näkyisi käyttäjälle ateriaryhmittäin vaihtoehtoina.
                  </p>

                  {selectedTemplatePreview.length > 0 ? (
                    <div className="mt-4 space-y-4">
                      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                        <p className="text-sm font-semibold text-[var(--text)]">
                          {templateForm.name.trim() || "Luonnos ilman nimeä"}
                        </p>
                        <p className="mt-1 text-sm text-[var(--text-muted)]">
                          {templateForm.description.trim() || "Ateriapohja näyttää vaihtoehdot per ateriaryhmä. Käyttäjä voi valita arkeen sopivat vaihtoehdot ilman että kaikki listatut annokset kuuluvat samaan päivään."}
                        </p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                          <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Vaihtoehtoja yhteensä</p>
                          <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{templatePreviewRecipeCount}</p>
                          <p className="mt-1 text-sm text-[var(--text-muted)]">reseptiä luonnoksessa</p>
                        </div>
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                          <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Täytetyt ateriaryhmät</p>
                          <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{filledMealTags.length} / {mealTags.length}</p>
                          <p className="mt-1 text-sm text-[var(--text-muted)]">ryhmää mukana luonnoksessa</p>
                        </div>
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                          <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Puuttuu vielä</p>
                          <p className="mt-2 text-sm font-semibold text-[var(--text)]">
                            {missingMealTags.length > 0 ? missingMealTags.map((mealTag) => mealTagLabel(mealTag)).join(", ") : "Ei puuttuvia ryhmiä"}
                          </p>
                        </div>
                      </div>

                      {templateDailyMacroPreview ? (
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-[var(--text)]">Päivän makroarvio</p>
                              <p className="mt-1 text-sm text-[var(--text-muted)]">
                                Yhteenveto näyttää yhden suositellun päivän sekä vaihteluvälin, kun käyttäjä valitsee kustakin ateriaryhmästä yhden vaihtoehdon.
                              </p>
                            </div>
                            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-muted)]">
                              <p className="font-semibold text-[var(--text)]">
                                {templateDailyMacroPreview.targetGap === null
                                  ? "Ei tavoitekaloria valittuna"
                                  : templateDailyMacroPreview.targetGap === 0
                                    ? "Osuu tavoitekaloriin"
                                    : templateDailyMacroPreview.targetGap > 0
                                      ? `${Math.round(templateDailyMacroPreview.targetGap)} kcal yli`
                                      : `${Math.abs(Math.round(templateDailyMacroPreview.targetGap))} kcal alle`}
                              </p>
                              <p className="mt-1">Suositellun päivän vertailu käyttäjän tavoitteeseen</p>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 lg:grid-cols-2">
                            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Suositeltu päivä</p>
                              <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{Math.round(templateDailyMacroPreview.recommendedTotals.kcal)} kcal</p>
                              <p className="mt-1 text-sm text-[var(--text-muted)]">
                                P {Math.round(templateDailyMacroPreview.recommendedTotals.proteinG)} g · H {Math.round(templateDailyMacroPreview.recommendedTotals.carbsG)} g · R {Math.round(templateDailyMacroPreview.recommendedTotals.fatG)} g
                              </p>
                              <p className="mt-2 text-sm text-[var(--text-muted)]">
                                Valitsee kustakin ateriaryhmästä vaihtoehdon, joka osuu parhaiten kyseisen slotin tavoiteikkunaan.
                              </p>
                            </div>
                            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                              <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Vaihteluväli päivälle</p>
                              <p className="mt-2 text-2xl font-semibold text-[var(--text)]">
                                {formatMacroRange(templateDailyMacroPreview.minTotals.kcal, templateDailyMacroPreview.maxTotals.kcal, "kcal")}
                              </p>
                              <div className="mt-1 space-y-1 text-sm text-[var(--text-muted)]">
                                <p>P {formatMacroRange(templateDailyMacroPreview.minTotals.proteinG, templateDailyMacroPreview.maxTotals.proteinG, "g")}</p>
                                <p>H {formatMacroRange(templateDailyMacroPreview.minTotals.carbsG, templateDailyMacroPreview.maxTotals.carbsG, "g")}</p>
                                <p>R {formatMacroRange(templateDailyMacroPreview.minTotals.fatG, templateDailyMacroPreview.maxTotals.fatG, "g")}</p>
                              </div>
                              <p className="mt-2 text-sm text-[var(--text-muted)]">
                                Näyttää minimi- ja maksimitason, jos käyttäjä valitsee jokaisesta ryhmästä kevyimmän tai raskaimman vaihtoehdon.
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                            {templateDailyMacroPreview.mealGroups.map((group) => (
                              <div key={`daily-summary-${group.mealTag}`} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">{mealTagLabel(group.mealTag)}</p>
                                <p className="mt-2 text-sm font-semibold text-[var(--text)]">
                                  {group.recommended?.recipe.name ?? "Ei suositusta"}
                                </p>
                                <p className="mt-1 text-sm text-[var(--text-muted)]">
                                  {Math.round(group.recommended?.nutrition.kcal ?? group.avg.kcal)} kcal · P {Math.round(group.recommended?.nutrition.proteinG ?? group.avg.proteinG)} g
                                </p>
                                <p className="mt-2 text-xs text-[var(--text-subtle)]">
                                  Haarukka: {formatMacroRange(group.min.kcal, group.max.kcal, "kcal")}
                                </p>
                                <p className="mt-1 text-xs text-[var(--text-subtle)]">
                                  {group.targetRange
                                    ? `Tavoite: ${group.targetRange[0]}-${group.targetRange[1]} kcal`
                                    : `${group.itemCount} vaihtoehtoa tässä ryhmässä`}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {mealTags.map((mealTag) => {
                        const items = groupedTemplatePreview[mealTag] ?? [];
                        if (items.length === 0) {
                          return null;
                        }

                        const slotGuidance = mealSlotKcalGuidance(mealTag, displayedTargetKcal);
                        return (
                          <div key={`preview-${mealTag}`} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">{mealTagLabel(mealTag)}</p>
                                <p className="mt-1 text-sm text-[var(--text-muted)]">
                                  {slotGuidance ? `Tyypillinen haarukka: ${slotGuidance}` : "Valitse tilanteeseen sopiva vaihtoehto."}
                                </p>
                              </div>
                              <div className="text-right text-sm text-[var(--text-muted)]">
                                <p>{items.length} vaihtoehtoa</p>
                              </div>
                            </div>

                            <div className="mt-4 grid gap-3">
                              {items.map((item) => {
                                const nutrition = resolveRecipeNutritionPreview(item.recipe, state.ingredientsCatalog).nutritionPerServing;
                                const compatibilityAlerts = getRecipeCompatibilityAlerts(item.recipe, previewCompatibilityProfile);
                                return (
                                  <div key={`preview-${mealTag}-${item.recipe.id}`} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                                    <div className="flex items-start justify-between gap-4">
                                      <div>
                                        <p className="text-lg font-semibold text-[var(--text)]">{item.recipe.name}</p>
                                        <p className="mt-1 text-sm text-[var(--text-muted)]">
                                          {item.recipe.description ?? "Valmis ateriasuositus tämän ateriaryhmän sisälle."}
                                        </p>
                                      </div>
                                      <div className="text-right text-sm text-[var(--text-muted)]">
                                        <p>{formatRecipeMacroValue(nutrition?.kcal)} kcal</p>
                                        <p>P {formatRecipeMacroValue(nutrition?.proteinG)} g</p>
                                        <p>H {formatRecipeMacroValue(nutrition?.carbsG)} g</p>
                                        <p>R {formatRecipeMacroValue(nutrition?.fatG)} g</p>
                                      </div>
                                    </div>
                                    {compatibilityAlerts.length > 0 ? (
                                      <div className="mt-3 rounded-2xl border border-[color:color-mix(in_srgb,var(--warning)_35%,var(--border))] bg-[color:color-mix(in_srgb,var(--warning)_12%,var(--surface))] p-3 text-sm text-[var(--warning)]">
                                        {compatibilityAlerts.map((alert) => (
                                          <p key={`preview-${item.recipe.id}-${alert.key}`}>
                                            {alert.label}: {alert.matchedIngredients.join(", ")}
                                          </p>
                                        ))}
                                      </div>
                                    ) : null}
                                    <div className="mt-3 border-t border-[var(--border)] pt-3">
                                      <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Ohjeet</p>
                                      <ol className="mt-1 list-decimal space-y-1 pl-4 text-sm text-[var(--text-muted)]">
                                        {splitRecipeInstructions(item.recipe.instructions).map((step, index) => (
                                          <li key={`preview-${item.recipe.id}-step-${index}`}>{step}</li>
                                        ))}
                                      </ol>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-4 py-5 text-sm text-[var(--text-muted)]">
                      Valitse reseptejä ateriaryhmiin, niin esikatselu näyttää heti miltä pohja näkyy käyttäjälle.
                    </div>
                  )}
                </div>
              </div>
            </section>
          ) : null}
          </section>
        ) : null}
      </div>
    </Card>
  );
}
