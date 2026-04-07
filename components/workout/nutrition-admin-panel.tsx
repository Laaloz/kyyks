"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { InlineFeedback } from "@/components/workout/inline-feedback";
import { getMissingMacroProfileFields, joinRecipeInstructionSteps, mealTagLabel } from "@/lib/nutrition";
import { isAthleteRole } from "@/lib/role-access";
import type {
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

function splitKnownAndCustom(values: string[], knownOptions: readonly string[]) {
  const known = values.filter((value) => knownOptions.includes(value));
  const custom = values.filter((value) => !knownOptions.includes(value));
  return {
    known,
    custom: custom.join(", "),
  };
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
  defaultPurchaseUnit: PurchaseUnit;
  gramsPerUnit: string;
  kcalPer100: string;
  proteinPer100: string;
  carbsPer100: string;
  fatPer100: string;
};

type NutritionAdminSection = "overview" | "profiles" | "recipes" | "plans";
type RecipeWorkspace = "recipe" | "ingredients";

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
    description: "Säädä päivän tavoitekcal, makrot ja ruokavalioliput yhdelle treenaajalle kerrallaan.",
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
    description: "Kokoa päivän ateriat valmiista resepteistä ja jaa pohja treenaajalle.",
  },
];

export function NutritionAdminPanel() {
  const {
    currentUser,
    state,
    notify,
    saveNutritionProfile,
    saveIngredient,
    saveRecipe,
    saveMealPlanTemplate,
    assignMealPlanTemplate,
  } = useAppState();

  const athleteUsers = useMemo(
    () => state.users.filter((user) => isAthleteRole(user.role) && user.status === "active"),
    [state.users],
  );
  const [selectedAthleteId, setSelectedAthleteId] = useState(athleteUsers[0]?.id ?? "");
  const selectedProfile = useMemo(
    () => state.nutritionProfiles.find((profile) => profile.userId === selectedAthleteId) ?? null,
    [selectedAthleteId, state.nutritionProfiles],
  );
  const [profileForm, setProfileForm] = useState<NutritionProfileFormState>(() => ({
    goal: selectedProfile?.goal ?? "maintain",
    activityLevel: selectedProfile?.activityLevel ?? "moderate",
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
    defaultServings: "4",
    minServings: "2",
    maxServings: "8",
  });
  const [recipeSteps, setRecipeSteps] = useState<string[]>([emptyRecipeStepDraft()]);
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredientDraft[]>([
    emptyRecipeIngredientDraft(),
  ]);
  const [templateForm, setTemplateForm] = useState({
    name: "",
    description: "",
    breakfast: "",
    lunch: "",
    snack: "",
    dinner: "",
    evening_snack: "",
  });
  const [assignmentForm, setAssignmentForm] = useState({
    athleteId: athleteUsers[0]?.id ?? "",
    templateId: state.mealPlanTemplates[0]?.id ?? "",
  });
  const [activeSection, setActiveSection] = useState<NutritionAdminSection>("overview");
  const [recipeWorkspace, setRecipeWorkspace] = useState<RecipeWorkspace>("recipe");
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  if (!currentUser || currentUser.role !== "admin") {
    return null;
  }

  const handleSaveNutritionProfile = async () => {
    if (!selectedAthleteId) {
      setMessage({ tone: "danger", text: "Valitse treenaaja ravintoprofiilille." });
      return;
    }

    const result = await saveNutritionProfile({
      userId: selectedAthleteId,
      goal: profileForm.goal as NutritionProfile["goal"],
      activityLevel: profileForm.activityLevel as NutritionProfile["activityLevel"],
      mealsPerDay: Number(profileForm.mealsPerDay),
      calculationMode: profileForm.calculationMode as NutritionProfile["calculationMode"],
      targetKcal: profileForm.targetKcal ? Number(profileForm.targetKcal) : undefined,
      proteinG: profileForm.proteinG ? Number(profileForm.proteinG) : undefined,
      carbsG: profileForm.carbsG ? Number(profileForm.carbsG) : undefined,
      fatG: profileForm.fatG ? Number(profileForm.fatG) : undefined,
      coachNotes: profileForm.coachNotes,
      dietaryFlags: [...profileForm.dietaryFlags, ...parseList(profileForm.customDietaryFlags)],
      allergies: [...profileForm.allergies, ...parseList(profileForm.customAllergies)],
    });

    setMessage({ tone: result.ok ? "success" : "danger", text: result.ok ? "Ravintoprofiili tallennettiin." : result.message });
    notify({ tone: result.ok ? "success" : "danger", message: result.ok ? "Ravintoprofiili tallennettiin." : result.message });
  };

  const handleSaveIngredient = async () => {
    const result = await saveIngredient({
      name: ingredientForm.name,
      source: "manual",
      defaultPurchaseUnit: ingredientForm.defaultPurchaseUnit,
      gramsPerUnit: ingredientForm.gramsPerUnit ? Number(ingredientForm.gramsPerUnit) : undefined,
      kcalPer100: Number(ingredientForm.kcalPer100),
      proteinPer100: Number(ingredientForm.proteinPer100),
      carbsPer100: Number(ingredientForm.carbsPer100),
      fatPer100: Number(ingredientForm.fatPer100),
    });

    setMessage({ tone: result.ok ? "success" : "danger", text: result.ok ? "Raaka-aine tallennettiin." : result.message });
    if (result.ok) {
      setIngredientForm({
        name: "",
        defaultPurchaseUnit: "g",
        gramsPerUnit: "",
        kcalPer100: "",
        proteinPer100: "",
        carbsPer100: "",
        fatPer100: "",
      });
    }
  };

  const handleSaveRecipe = async () => {
    const result = await saveRecipe({
      name: recipeForm.name,
      description: recipeForm.description,
      instructions: joinRecipeInstructionSteps(recipeSteps),
      mealTag: recipeForm.mealTag,
      defaultServings: Number(recipeForm.defaultServings),
      minServings: Number(recipeForm.minServings),
      maxServings: Number(recipeForm.maxServings),
      ingredients: recipeIngredients.map((ingredient) => ({
        ingredientId: ingredient.ingredientId || undefined,
        ingredientName: ingredient.ingredientName,
        quantity: ingredient.quantity ? Number(ingredient.quantity) : undefined,
        unit: ingredient.unit,
        displayQuantity: ingredient.displayQuantity || undefined,
        displayUnit: ingredient.displayUnit || undefined,
        ingredientRole: ingredient.ingredientRole,
        scalingMode: ingredient.scalingMode,
      })),
    });

    setMessage({ tone: result.ok ? "success" : "danger", text: result.ok ? "Resepti tallennettiin." : result.message });
    if (result.ok) {
      setRecipeForm({
        name: "",
        description: "",
        mealTag: "lunch",
        defaultServings: "4",
        minServings: "2",
        maxServings: "8",
      });
      setRecipeSteps([emptyRecipeStepDraft()]);
      setRecipeIngredients([emptyRecipeIngredientDraft()]);
    }
  };

  const handleSaveTemplate = async () => {
    const items = mealTags
      .flatMap((mealTag, index) => {
        const recipeId = templateForm[mealTag];
        return recipeId ? [{ mealTag, recipeId, sortOrder: index }] : [];
      });

    const result = await saveMealPlanTemplate({
      name: templateForm.name,
      description: templateForm.description,
      items,
    });

    setMessage({ tone: result.ok ? "success" : "danger", text: result.ok ? "Ateriapohja tallennettiin." : result.message });
    if (result.ok) {
      setTemplateForm({
        name: "",
        description: "",
        breakfast: "",
        lunch: "",
        snack: "",
        dinner: "",
        evening_snack: "",
      });
    }
  };

  const handleAssignTemplate = async () => {
    const result = await assignMealPlanTemplate({
      athleteId: assignmentForm.athleteId,
      templateId: assignmentForm.templateId,
    });

    setMessage({ tone: result.ok ? "success" : "danger", text: result.ok ? "Ateriapohja jaettiin treenaajalle." : result.message });
  };

  const activeSectionMeta = sectionMeta.find((section) => section.id === activeSection) ?? sectionMeta[0];
  const selectedAthleteName = athleteUsers.find((user) => user.id === selectedAthleteId)?.fullName ?? "Ei valittu";
  const selectedAthlete = state.users.find((user) => user.id === selectedAthleteId) ?? null;
  const missingAutoFields = selectedAthlete ? getMissingMacroProfileFields(selectedAthlete) : [];
  const athleteWithPlanCount = new Set(state.assignedMealPlans.filter((plan) => plan.active).map((plan) => plan.athleteId)).size;
  const ingredientCatalogPreview = state.ingredientsCatalog.slice(0, 8);
  const recipePreview = state.recipes.slice(0, 4);
  const templatePreview = state.mealPlanTemplates.slice(0, 4);

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
          <CardTitle className="mt-2 text-2xl">Adminin ateriapohjat ja reseptit</CardTitle>
          <CardDescription className="mt-2">
            V1:ssä vain admin rakentaa ravintosisällön. Reseptit perustuvat oikeisiin raaka-ainemääriin, annossäätimeen ja mausteiden hybridiskaalaukseen.
          </CardDescription>
        </div>

        {message ? <InlineFeedback tone={message.tone} message={message.text} /> : null}

        <div
          role="tablist"
          aria-label="Ravinnon admin-osiot"
          className="grid gap-2 rounded-[1.4rem] border border-[color-mix(in_srgb,var(--border)_88%,var(--surface))] bg-[color-mix(in_srgb,var(--surface)_80%,var(--surface-2))] p-2 md:grid-cols-4"
        >
          {sectionMeta.map((section) => {
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
                  <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Treenaajat</p>
                  <p className="mt-2 text-3xl font-semibold text-[var(--text)]">{athleteUsers.length}</p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">aktiivista treenaajaa ravinnon piirissä</p>
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
                  <p className="mt-1 text-sm text-[var(--text-muted)]">treenaajaa aktiivisen pohjan kanssa</p>
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
                      <p className="text-sm font-semibold text-[var(--text)]">1. Aseta treenaajan tavoite</p>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">Valitse treenaaja ja tallenna päivän kcal- ja makrotavoite.</p>
                    </button>
                    <button type="button" className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]" onClick={() => setActiveSection("recipes")}>
                      <p className="text-sm font-semibold text-[var(--text)]">2. Rakenna resepti valmiista aineksista</p>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">Pidä pääraaka-aineet lineaarisina ja mausteet kiinteinä tai tekstinä.</p>
                    </button>
                    <button type="button" className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]" onClick={() => setActiveSection("plans")}>
                      <p className="text-sm font-semibold text-[var(--text)]">3. Kokoa päivä ja jaa</p>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">Valitse reseptit päivän slotteihin ja aktivoi pohja treenaajalle.</p>
                    </button>
                  </div>
                </section>

                <section className="grid gap-6 lg:grid-cols-2">
                  <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <p className="text-sm font-semibold text-[var(--text)]">Valittu treenaaja</p>
                    <p className="mt-2 text-xl font-semibold text-[var(--text)]">{selectedAthleteName}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge>{profileForm.goal === "maintain" ? "Pidä paino" : profileForm.goal === "gain" ? "Kasvata" : "Pudota"}</Badge>
                      <Badge>{profileForm.calculationMode === "auto" ? "Auto" : "Manuaalinen"}</Badge>
                      <Badge>{profileForm.mealsPerDay || "5"} ateriaa</Badge>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
                        <p className="text-[var(--text-muted)]">Tavoite</p>
                        <p className="mt-1 font-semibold text-[var(--text)]">{profileForm.targetKcal || "Auto"} kcal</p>
                      </div>
                      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
                        <p className="text-[var(--text-muted)]">Makrot</p>
                        <p className="mt-1 font-semibold text-[var(--text)]">
                          {profileForm.proteinG || "-"} / {profileForm.carbsG || "-"} / {profileForm.fatG || "-"}
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
                            <Badge key={ingredient.id}>{ingredient.name}</Badge>
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
                  <p className="text-sm font-semibold text-[var(--text)]">Treenaajan ravintoprofiili</p>
                  <p className="text-sm text-[var(--text-muted)]">Laske tavoitekcal ja makrot tai lukitse ne käsin yhdelle treenaajalle kerrallaan.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <Label htmlFor="nutrition-athlete">Treenaaja</Label>
                    <Select
                      id="nutrition-athlete"
                      value={selectedAthleteId}
                      onChange={(event) => {
                        const nextUserId = event.target.value;
                        setSelectedAthleteId(nextUserId);
                        const profile = state.nutritionProfiles.find((item) => item.userId === nextUserId) ?? null;
                        setProfileForm({
                          goal: profile?.goal ?? "maintain",
                          activityLevel: profile?.activityLevel ?? "moderate",
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
                      {athleteUsers.map((user) => (
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
                <Button type="button" onClick={() => void handleSaveNutritionProfile()}>Tallenna ravintoprofiili</Button>
              </div>

              <div className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">Pikayhteenveto</p>
                  <p className="text-sm text-[var(--text-muted)]">Valitun treenaajan tilanne yhdellä silmäyksellä ennen tallennusta.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Treenaaja</p>
                    <p className="mt-2 text-lg font-semibold text-[var(--text)]">{selectedAthleteName}</p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">{selectedProfile ? "Profiili löytyy jo" : "Uusi profiili tallennetaan ensimmäistä kertaa"}</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Tila</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge>{profileForm.calculationMode === "auto" ? "Auto" : "Manuaalinen"}</Badge>
                      <Badge>{profileForm.activityLevel === "low" ? "Matala aktiivisuus" : profileForm.activityLevel === "moderate" ? "Kohtalainen aktiivisuus" : "Korkea aktiivisuus"}</Badge>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Energia</p>
                    <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{profileForm.targetKcal || "Auto"}</p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">kcal / päivä</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <p className="text-xs font-semibold tracking-[0.04em] text-[var(--text-subtle)]">Makrot</p>
                    <p className="mt-2 text-lg font-semibold text-[var(--text)]">
                      P {profileForm.proteinG || "-"} / H {profileForm.carbsG || "-"} / R {profileForm.fatG || "-"}
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
                className="grid gap-2 rounded-[1.2rem] border border-[var(--border)] bg-[var(--surface-2)] p-2 md:grid-cols-2"
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
              </div>

              {recipeWorkspace === "recipe" ? (
                <section id="nutrition-recipe-workspace" role="tabpanel" aria-labelledby="nutrition-recipe-tab" className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                  <div className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">Reseptieditori</p>
                      <p className="text-sm text-[var(--text-muted)]">Rakenna resepti niin, että ostettavat määrät ja annosskaalaus pysyvät realistisina.</p>
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
                      <div>
                        <Label htmlFor="recipe-servings">Oletusannokset</Label>
                        <Input id="recipe-servings" value={recipeForm.defaultServings} onChange={(event) => setRecipeForm((current) => ({ ...current, defaultServings: event.target.value }))} />
                      </div>
                      <div>
                        <Label htmlFor="recipe-min">Min annokset</Label>
                        <Input id="recipe-min" value={recipeForm.minServings} onChange={(event) => setRecipeForm((current) => ({ ...current, minServings: event.target.value }))} />
                      </div>
                      <div>
                        <Label htmlFor="recipe-max">Max annokset</Label>
                        <Input id="recipe-max" value={recipeForm.maxServings} onChange={(event) => setRecipeForm((current) => ({ ...current, maxServings: event.target.value }))} />
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
                              placeholder="Esim. Kypsenna riisi pakkauksen ohjeen mukaan."
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
                              <p className="text-xs text-[var(--text-muted)]">Anna laskentamäärä ja tarvittaessa näyttömuoto erikseen.</p>
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
                                const selected = state.ingredientsCatalog.find((item) => item.id === event.target.value);
                                setRecipeIngredients((current) =>
                                  current.map((row, rowIndex) =>
                                    rowIndex === index
                                      ? {
                                          ...row,
                                          ingredientId: event.target.value,
                                          ingredientName: selected?.name ?? row.ingredientName,
                                        }
                                      : row,
                                  ),
                                );
                              }}
                            >
                              <option value="">Kirjoita oma nimi alle</option>
                              {state.ingredientsCatalog.map((item) => (
                                <option key={item.id} value={item.id}>{item.name}</option>
                              ))}
                            </Select>
                          </div>
                          <div className="md:col-span-2">
                            <Label htmlFor={`recipe-ingredient-name-${index}`}>Rivin nimi</Label>
                            <Input id={`recipe-ingredient-name-${index}`} value={ingredient.ingredientName} onChange={(event) => setRecipeIngredients((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ingredientName: event.target.value } : row))} />
                          </div>
                          <div>
                            <Label htmlFor={`recipe-ingredient-quantity-${index}`}>Laskentamäärä</Label>
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
                              <option value="fixed">Kiinteä</option>
                              <option value="text_only">Vain ohjeeseen</option>
                            </Select>
                          </div>
                          <div>
                            <Label htmlFor={`recipe-ingredient-display-quantity-${index}`}>Näyttömäärä</Label>
                            <Input id={`recipe-ingredient-display-quantity-${index}`} placeholder="1" value={ingredient.displayQuantity} onChange={(event) => setRecipeIngredients((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, displayQuantity: event.target.value } : row))} />
                          </div>
                          <div>
                            <Label htmlFor={`recipe-ingredient-display-unit-${index}`}>Näyttöyksikkö</Label>
                            <Input id={`recipe-ingredient-display-unit-${index}`} placeholder="tl / maun mukaan" value={ingredient.displayUnit} onChange={(event) => setRecipeIngredients((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, displayUnit: event.target.value } : row))} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button type="button" onClick={() => void handleSaveRecipe()}>Tallenna resepti</Button>
                  </div>

                  <div className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
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
                        <p className="mt-1">Käytä `fixed`, jos määrä ei kasva suoraviivaisesti, tai `text_only`, jos ohjeeseen riittää esimerkiksi “maun mukaan”.</p>
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
                          <Badge key={ingredient.id}>{ingredient.name}</Badge>
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
                      <p className="text-sm text-[var(--text-muted)]">Lisää vain puuttuvat raaka-aineet käsin. Pidemmällä tähtäimellä päävirta tulee Fineli-haun kautta.</p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <Label htmlFor="ingredient-name">Nimi</Label>
                        <Input id="ingredient-name" value={ingredientForm.name} onChange={(event) => setIngredientForm((current) => ({ ...current, name: event.target.value }))} />
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
                    <Button type="button" onClick={() => void handleSaveIngredient()}>Tallenna raaka-aine</Button>
                  </div>

                  <div className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">Nykyinen kirjasto</p>
                      <p className="text-sm text-[var(--text-muted)]">Pikakatsaus jo lisättyihin raaka-aineisiin. Tämä pitää myöhemmin korvata haulla.</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                      <div className="flex flex-wrap gap-2">
                        {state.ingredientsCatalog.length > 0 ? state.ingredientsCatalog.slice(0, 24).map((ingredient) => (
                          <Badge key={ingredient.id}>{ingredient.name}</Badge>
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
                  <div>
                    <Label htmlFor="template-name">Ateriapohjan nimi</Label>
                    <Input id="template-name" value={templateForm.name} onChange={(event) => setTemplateForm((current) => ({ ...current, name: event.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="template-description">Kuvaus</Label>
                    <Input id="template-description" value={templateForm.description} onChange={(event) => setTemplateForm((current) => ({ ...current, description: event.target.value }))} />
                  </div>
                  {mealTags.map((mealTag) => (
                    <div key={mealTag}>
                      <Label htmlFor={`template-${mealTag}`}>{mealTagLabel(mealTag)}</Label>
                      <Select id={`template-${mealTag}`} value={templateForm[mealTag]} onChange={(event) => setTemplateForm((current) => ({ ...current, [mealTag]: event.target.value }))}>
                        <option value="">Ei valittu</option>
                        {state.recipes.map((recipe) => (
                          <option key={recipe.id} value={recipe.id}>{recipe.name}</option>
                        ))}
                      </Select>
                    </div>
                  ))}
                  <Button type="button" onClick={() => void handleSaveTemplate()}>Tallenna ateriapohja</Button>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <p className="text-sm font-semibold text-[var(--text)]">Jaa treenaajalle</p>
                  <div className="mt-3 grid gap-3">
                    <div>
                      <Label htmlFor="assign-athlete">Treenaaja</Label>
                      <Select id="assign-athlete" value={assignmentForm.athleteId} onChange={(event) => setAssignmentForm((current) => ({ ...current, athleteId: event.target.value }))}>
                        {athleteUsers.map((user) => (
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
                    <Button type="button" onClick={() => void handleAssignTemplate()}>Jaa aktiiviseksi pohjaksi</Button>
                  </div>
                </div>

                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <p className="text-sm font-semibold text-[var(--text)]">Valmiit pohjat</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {templatePreview.length > 0 ? templatePreview.map((template) => (
                      <Badge key={template.id}>{template.name}</Badge>
                    )) : <p className="text-sm text-[var(--text-muted)]">Ei vielä tallennettuja ateriapohjia.</p>}
                  </div>
                </div>
              </div>
            </section>
          ) : null}
        </section>
      </div>
    </Card>
  );
}
