import "server-only";

import { resolveRecipeIngredientNormalizedQuantity } from "@/lib/nutrition";
import { canActAsCoach } from "@/lib/role-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  AssignedMealPlanInput,
  IngredientInput,
  MealPlanTemplateInput,
  NutritionProfileInput,
  RecipeInput,
  Role,
} from "@/lib/types";

type Requester = {
  id: string;
  role: Role;
};

export async function getNutritionRequester() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      error: Response.json({ message: "Supabase ei ole käytössä tässä ympäristössä." }, { status: 503 }),
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: Response.json({ message: "Kirjaudu sisään ennen ravintodatan käsittelyä." }, { status: 401 }),
    };
  }

  const { data: requester } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle<Requester>();

  if (!requester) {
    return {
      error: Response.json({ message: "Käyttäjäprofiilia ei löytynyt." }, { status: 403 }),
    };
  }

  return { supabase, requester };
}

export function ensureAdminRequester(requester: Requester) {
  if (requester.role !== "admin") {
    return Response.json({ message: "Vain admin voi muokata ravintosisältöä." }, { status: 403 });
  }

  return null;
}

export function ensureNutritionManagerRequester(requester: Requester) {
  if (!canActAsCoach(requester.role)) {
    return Response.json({ message: "Vain admin tai valmentaja voi muokata ravintosisältöä." }, { status: 403 });
  }

  return null;
}

async function canRequesterManageAthlete(requester: Requester, athleteId: string) {
  if (requester.role === "admin") {
    return true;
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return false;
  }

  const { count, error } = await supabase
    .from("coach_athlete_assignments")
    .select("id", { count: "exact", head: true })
    .eq("coach_id", requester.id)
    .eq("athlete_id", athleteId)
    .eq("active", true);

  if (error) {
    return false;
  }

  return (count ?? 0) > 0;
}

export async function saveNutritionProfileOnServer(requester: Requester, input: NutritionProfileInput) {
  if (!(await canRequesterManageAthlete(requester, input.userId))) {
    return { ok: false as const, message: "Voit hallita vain omien valmennettaviesi ravintoprofiileja." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false as const, message: "Supabase ei ole käytössä tässä ympäristössä." };
  }

  const { data: existing } = await supabase
    .from("nutrition_profiles")
    .select("id, created_at, created_by")
    .eq("user_id", input.userId)
    .maybeSingle<{ id: string; created_at: string; created_by: string }>();

  const basePayload = {
    user_id: input.userId,
    goal: input.goal,
    activity_level: input.activityLevel,
    meals_per_day: input.mealsPerDay,
    target_kcal: input.targetKcal ?? 2000,
    protein_g: input.proteinG ?? 140,
    carbs_g: input.carbsG ?? 220,
    fat_g: input.fatG ?? 70,
    calculation_mode: input.calculationMode,
    coach_notes: input.coachNotes?.trim() || null,
    dietary_flags: input.dietaryFlags ?? [],
    allergies: input.allergies ?? [],
    updated_by: requester.id,
    updated_at: new Date().toISOString(),
  };

  const payload = existing
    ? { ...basePayload }
    : {
        ...basePayload,
        created_by: requester.id,
        created_at: new Date().toISOString(),
      };

  const query = existing
    ? supabase.from("nutrition_profiles").update(payload).eq("id", existing.id)
    : supabase.from("nutrition_profiles").insert(payload);

  const { error } = await query;
  if (error) {
    return { ok: false as const, message: error.message || "Ravintoprofiilin tallennus epäonnistui." };
  }

  return { ok: true as const };
}

export async function saveIngredientOnServer(requester: Requester, input: IngredientInput) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false as const, message: "Supabase ei ole käytössä tässä ympäristössä." };
  }

  const payload = {
    name: input.name.trim(),
    source: input.source,
    source_external_id: input.sourceExternalId?.trim() || null,
    owner_role: "admin",
    created_by: requester.id,
    default_purchase_unit: input.defaultPurchaseUnit ?? null,
    grams_per_unit: input.gramsPerUnit ?? null,
    kcal_per_100: input.kcalPer100,
    protein_per_100: input.proteinPer100,
    carbs_per_100: input.carbsPer100,
    fat_per_100: input.fatPer100,
    updated_at: new Date().toISOString(),
  };

  const query = input.id
    ? supabase.from("ingredient_catalog").update(payload).eq("id", input.id)
    : supabase.from("ingredient_catalog").insert({ ...payload, created_at: new Date().toISOString() });
  const { error } = await query;
  if (error) {
    return { ok: false as const, message: error.message || "Raaka-aineen tallennus epäonnistui." };
  }

  return { ok: true as const };
}

export async function saveRecipeOnServer(requester: Requester, input: RecipeInput) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false as const, message: "Supabase ei ole käytössä tässä ympäristössä." };
  }

  const timestamp = new Date().toISOString();
  let recipeId = input.id;

  const recipePayload = {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    instructions: input.instructions.trim(),
    meal_tag: input.mealTag,
    dietary_flags: input.dietaryFlags ?? [],
    allergies: input.allergies ?? [],
    owner_role: "admin",
    created_by: requester.id,
    default_servings: input.defaultServings,
    min_servings: input.minServings,
    max_servings: input.maxServings,
    updated_at: timestamp,
  };

  if (recipeId) {
    const { error } = await supabase.from("recipes").update(recipePayload).eq("id", recipeId);
    if (error) {
      return { ok: false as const, message: error.message || "Reseptin tallennus epäonnistui." };
    }

    const { error: deleteError } = await supabase.from("recipe_ingredients").delete().eq("recipe_id", recipeId);
    if (deleteError) {
      return { ok: false as const, message: deleteError.message || "Reseptin raaka-aineiden päivitys epäonnistui." };
    }
  } else {
    const { data, error } = await supabase
      .from("recipes")
      .insert({ ...recipePayload, created_at: timestamp })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) {
      return { ok: false as const, message: error?.message || "Reseptin tallennus epäonnistui." };
    }
    recipeId = data.id;
  }

  const ingredientIds = Array.from(new Set(
    input.ingredients
      .map((ingredient) => ingredient.ingredientId)
      .filter((value): value is string => Boolean(value)),
  ));
  const ingredientMap = new Map<string, { gramsPerUnit?: number }>();
  if (ingredientIds.length > 0) {
    const { data: catalogRows, error: catalogError } = await supabase
      .from("ingredient_catalog")
      .select("id,grams_per_unit")
      .in("id", ingredientIds);

    if (catalogError) {
      return { ok: false as const, message: catalogError.message || "Raaka-ainekirjaston haku epäonnistui." };
    }

    for (const row of catalogRows ?? []) {
      ingredientMap.set(row.id, { gramsPerUnit: row.grams_per_unit ?? undefined });
    }
  }

  const ingredientPayload = input.ingredients.map((ingredient, index) => ({
    recipe_id: recipeId,
    ingredient_id: ingredient.ingredientId ?? null,
    ingredient_name: ingredient.ingredientName?.trim() || "",
    quantity: ingredient.quantity ?? null,
    unit: ingredient.unit,
    display_quantity: ingredient.displayQuantity?.trim() || null,
    display_unit: ingredient.displayUnit?.trim() || null,
    normalized_quantity: resolveRecipeIngredientNormalizedQuantity(
      ingredient.quantity,
      ingredient.unit,
      ingredient.ingredientId ? ingredientMap.get(ingredient.ingredientId) : undefined,
    ) ?? null,
    ingredient_role: ingredient.ingredientRole,
    scaling_mode: ingredient.scalingMode,
    sort_order: index,
  }));

  const { error: ingredientsError } = await supabase.from("recipe_ingredients").insert(ingredientPayload);
  if (ingredientsError) {
    return { ok: false as const, message: ingredientsError.message || "Reseptin raaka-aineiden tallennus epäonnistui." };
  }

  return { ok: true as const, recipeId };
}

export async function deleteRecipeOnServer(recipeId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false as const, message: "Supabase ei ole käytössä tässä ympäristössä." };
  }

  const [{ count: templateCount, error: templateError }, { count: assignedCount, error: assignedError }] = await Promise.all([
    supabase
      .from("meal_plan_template_items")
      .select("id", { count: "exact", head: true })
      .eq("recipe_id", recipeId),
    supabase
      .from("assigned_meal_plan_items")
      .select("id", { count: "exact", head: true })
      .eq("recipe_id", recipeId),
  ]);

  if (templateError) {
    return { ok: false as const, message: templateError.message || "Reseptin käyttöä ateriapohjissa ei voitu tarkistaa." };
  }
  if (assignedError) {
    return { ok: false as const, message: assignedError.message || "Reseptin käyttöä jaetuissa pohjissa ei voitu tarkistaa." };
  }

  if ((templateCount ?? 0) > 0 || (assignedCount ?? 0) > 0) {
    return {
      ok: false as const,
      message: "Resepti on käytössä ateriapohjassa tai jaetussa suunnitelmassa, joten sitä ei voi poistaa.",
    };
  }

  const { error } = await supabase.from("recipes").delete().eq("id", recipeId);
  if (error) {
    return { ok: false as const, message: error.message || "Reseptin poistaminen epäonnistui." };
  }

  return { ok: true as const };
}

export async function saveMealPlanTemplateOnServer(requester: Requester, input: MealPlanTemplateInput) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false as const, message: "Supabase ei ole käytössä tässä ympäristössä." };
  }

  const timestamp = new Date().toISOString();
  let templateId = input.id;
  const payload = {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    owner_role: "admin",
    created_by: requester.id,
    updated_at: timestamp,
  };

  if (templateId) {
    const { error } = await supabase.from("meal_plan_templates").update(payload).eq("id", templateId);
    if (error) {
      return { ok: false as const, message: error.message || "Ateriapohjan tallennus epäonnistui." };
    }
    const { error: deleteError } = await supabase.from("meal_plan_template_items").delete().eq("template_id", templateId);
    if (deleteError) {
      return { ok: false as const, message: deleteError.message || "Ateriapohjan aterioiden päivitys epäonnistui." };
    }
  } else {
    const { data, error } = await supabase
      .from("meal_plan_templates")
      .insert({ ...payload, created_at: timestamp })
      .select("id")
      .single<{ id: string }>();
    if (error || !data) {
      return { ok: false as const, message: error?.message || "Ateriapohjan tallennus epäonnistui." };
    }
    templateId = data.id;
  }

  const { error: itemsError } = await supabase.from("meal_plan_template_items").insert(
    input.items.map((item) => ({
      template_id: templateId,
      meal_tag: item.mealTag,
      recipe_id: item.recipeId,
      sort_order: item.sortOrder,
    })),
  );
  if (itemsError) {
    return { ok: false as const, message: itemsError.message || "Ateriapohjan aterioiden tallennus epäonnistui." };
  }

  return { ok: true as const, templateId };
}

export async function assignMealPlanOnServer(requester: Requester, input: AssignedMealPlanInput) {
  if (!(await canRequesterManageAthlete(requester, input.athleteId))) {
    return { ok: false as const, message: "Voit jakaa ateriapohjia vain omille valmennettavillesi." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false as const, message: "Supabase ei ole käytössä tässä ympäristössä." };
  }

  const { data: template } = await supabase
    .from("meal_plan_templates")
    .select("id, name")
    .eq("id", input.templateId)
    .maybeSingle<{ id: string; name: string }>();

  if (!template) {
    return { ok: false as const, message: "Ateriapohjaa ei löytynyt." };
  }

  const { data: templateItems } = await supabase
    .from("meal_plan_template_items")
    .select("meal_tag, recipe_id, sort_order")
    .eq("template_id", template.id)
    .order("sort_order", { ascending: true });

  const timestamp = new Date().toISOString();
  const { error: deactivateError } = await supabase
    .from("assigned_meal_plans")
    .update({ active: false, updated_at: timestamp })
    .eq("athlete_id", input.athleteId)
    .eq("active", true);
  if (deactivateError) {
    return { ok: false as const, message: deactivateError.message || "Aiemman ateriapohjan sulkeminen epäonnistui." };
  }

  const { data: assigned, error } = await supabase
    .from("assigned_meal_plans")
    .insert({
      athlete_id: input.athleteId,
      template_id: template.id,
      assigned_by: requester.id,
      name: template.name,
      active: true,
      assigned_at: timestamp,
      updated_at: timestamp,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !assigned) {
    return { ok: false as const, message: error?.message || "Ateriapohjan jako epäonnistui." };
  }

  const { error: itemError } = await supabase.from("assigned_meal_plan_items").insert(
    (templateItems ?? []).map((item) => ({
      assigned_plan_id: assigned.id,
      meal_tag: item.meal_tag,
      recipe_id: item.recipe_id,
      sort_order: item.sort_order,
    })),
  );
  if (itemError) {
    return { ok: false as const, message: itemError.message || "Jaetun ateriapohjan rivien tallennus epäonnistui." };
  }

  return { ok: true as const, assignedPlanId: assigned.id };
}
