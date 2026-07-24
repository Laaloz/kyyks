#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

import { ingredientAliases } from "./recipe-ingredient-aliases.mjs";
import { recipeSeedData } from "./recipe-seed-data.mjs";

function parseArgs(argv) {
  const args = {
    dryRun: false,
    limit: undefined,
    only: undefined,
    createdBy: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (value === "--limit") {
      args.limit = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    // Vain nimetyt reseptit. Erotin on ';' (ei ',') koska nimissa on pilkkuja.
    // --only:n kanssa EI prunata muita reseptejä (osittainen ajo ei saa poistaa mitään).
    if (value === "--only") {
      args.only = (argv[index + 1] || "").split(";").map((name) => name.trim()).filter(Boolean);
      index += 1;
      continue;
    }
    if (value === "--created-by") {
      args.createdBy = argv[index + 1];
      index += 1;
      continue;
    }
    // Ensimmainen ei-flag-argumentti tulkitaan admin-kayttajan created_by-arvoksi.
    if (!value.startsWith("--") && args.createdBy === undefined) {
      args.createdBy = value;
    }
  }

  return args;
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL tai SUPABASE_SERVICE_ROLE_KEY puuttuu ymparistomuuttujista.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getCreatedBy() {
  return process.env.RECIPE_SEED_CREATED_BY
    || process.env.FINELI_CREATED_BY
    || process.env.FINELI_ADMIN_USER_ID
    || null;
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[%]/g, " % ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function resolveIngredientId(ingredientCatalogMap, ingredientName) {
  const normalizedName = normalizeName(ingredientName);
  const directMatch = ingredientCatalogMap.get(normalizedName);
  if (directMatch) {
    return directMatch;
  }

  const aliasCandidates = ingredientAliases[normalizedName] ?? [];
  for (const alias of aliasCandidates) {
    const aliasMatch = ingredientCatalogMap.get(normalizeName(alias));
    if (aliasMatch) {
      return aliasMatch;
    }
  }

  return null;
}

async function fetchIngredientCatalogMap(supabase) {
  const ingredientCatalogMap = new Map();
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("ingredient_catalog")
      .select("id,name,display_name,grams_per_unit")
      .range(from, to);

    if (error) {
      throw new Error(error.message || "Ingredient catalogin haku epaonnistui.");
    }

    const rows = data ?? [];
    rows.forEach((row) => {
      ingredientCatalogMap.set(normalizeName(row.name), {
        id: row.id,
        gramsPerUnit: row.grams_per_unit,
      });
      if (row.display_name) {
        ingredientCatalogMap.set(normalizeName(row.display_name), {
          id: row.id,
          gramsPerUnit: row.grams_per_unit,
        });
      }
    });

    if (rows.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return ingredientCatalogMap;
}

function resolveNormalizedQuantity(row, ingredientMatch) {
  if (row.quantity === undefined || row.quantity === null) {
    return null;
  }

  if (row.unit === "pcs" && ingredientMatch?.gramsPerUnit) {
    return row.quantity * Number(ingredientMatch.gramsPerUnit);
  }

  return row.quantity;
}

async function findExistingRecipeId(supabase, recipe) {
  const { data, error } = await supabase
    .from("recipes")
    .select("id")
    .eq("name", recipe.name)
    .eq("meal_tag", recipe.mealTag)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || `Reseptin ${recipe.name} tarkistus epaonnistui.`);
  }

  return data?.id ?? null;
}

async function upsertRecipe(supabase, recipe, createdBy, ingredientCatalogMap, timestamp) {
  const existingRecipeId = await findExistingRecipeId(supabase, recipe);

  const recipePayload = {
    name: recipe.name.trim(),
    description: recipe.description?.trim() || null,
    instructions: recipe.instructions.trim(),
    meal_tag: recipe.mealTag,
    dietary_flags: recipe.dietaryFlags ?? [],
    allergies: recipe.allergies ?? [],
    owner_role: "admin",
    created_by: createdBy,
    default_servings: recipe.defaultServings,
    min_servings: recipe.minServings,
    max_servings: recipe.maxServings,
    updated_at: timestamp,
  };

  let recipeId = existingRecipeId;

  if (recipeId) {
    const { error } = await supabase.from("recipes").update(recipePayload).eq("id", recipeId);
    if (error) {
      throw new Error(error.message || `Reseptin ${recipe.name} paivitys epaonnistui.`);
    }

    const { error: deleteError } = await supabase.from("recipe_ingredients").delete().eq("recipe_id", recipeId);
    if (deleteError) {
      throw new Error(deleteError.message || `Reseptin ${recipe.name} raaka-aineiden poisto epaonnistui.`);
    }
  } else {
    const { data, error } = await supabase
      .from("recipes")
      .insert({ ...recipePayload, created_at: timestamp })
      .select("id")
      .single();

    if (error || !data?.id) {
      throw new Error(error?.message || `Reseptin ${recipe.name} tallennus epaonnistui.`);
    }

    recipeId = data.id;
  }

  const unresolvedIngredients = [];
  const ingredientPayload = recipe.ingredients.map((row, index) => {
    const ingredientMatch = row.ingredientName
      ? resolveIngredientId(ingredientCatalogMap, row.ingredientName)
      : null;
    const ingredientId = ingredientMatch?.id ?? null;

    if (!ingredientId && row.ingredientName) {
      unresolvedIngredients.push(row.ingredientName);
    }

    return {
      recipe_id: recipeId,
      ingredient_id: ingredientId,
      ingredient_name: row.ingredientName?.trim() || "",
      group_label: row.groupLabel?.trim() || null,
      alternatives: row.alternatives?.map((value) => value.trim()).filter(Boolean) ?? [],
      alternative_options: (row.alternativeOptions ?? [])
        .map((option) => {
          const optionMatch = option.ingredientName
            ? resolveIngredientId(ingredientCatalogMap, option.ingredientName)
            : null;
          if (option.ingredientName && !optionMatch) {
            unresolvedIngredients.push(option.ingredientName);
          }
          return {
            ingredientId: optionMatch?.id ?? null,
            ingredientName: option.ingredientName?.trim() ?? "",
            grams: Math.max(0, Math.round(Number(option.grams) || 0)),
          };
        })
        .filter((option) => option.ingredientName.length > 0 && option.grams > 0),
      quantity: row.quantity ?? null,
      unit: row.unit,
      display_quantity: row.displayQuantity?.trim() || null,
      display_unit: row.displayUnit?.trim() || null,
      normalized_quantity: resolveNormalizedQuantity(row, ingredientMatch),
      ingredient_role: row.ingredientRole,
      scaling_mode: row.scalingMode,
      sort_order: index,
    };
  });

  const { error: ingredientsError } = await supabase.from("recipe_ingredients").insert(ingredientPayload);
  if (ingredientsError) {
    throw new Error(ingredientsError.message || `Reseptin ${recipe.name} raaka-aineiden tallennus epaonnistui.`);
  }

  return {
    recipeId,
    created: !existingRecipeId,
    unresolvedIngredients,
  };
}

async function pruneMissingRecipes(supabase, createdBy, keepRecipeIds) {
  const { data, error } = await supabase
    .from("recipes")
    .select("id")
    .eq("owner_role", "admin")
    .eq("created_by", createdBy);

  if (error) {
    throw new Error(error.message || "Vanhojen reseptien haku epaonnistui.");
  }

  const staleRecipeIds = (data ?? [])
    .map((row) => row.id)
    .filter((id) => !keepRecipeIds.has(id));

  if (staleRecipeIds.length === 0) {
    return 0;
  }

  const [{ error: assignedItemsError }, { error: templateItemsError }, { error: recipeIngredientsError }] = await Promise.all([
    supabase.from("assigned_meal_plan_items").delete().in("recipe_id", staleRecipeIds),
    supabase.from("meal_plan_template_items").delete().in("recipe_id", staleRecipeIds),
    supabase.from("recipe_ingredients").delete().in("recipe_id", staleRecipeIds),
  ]);

  if (assignedItemsError) {
    throw new Error(assignedItemsError.message || "Vanhojen jaettujen ateriapohjarivien poisto epaonnistui.");
  }
  if (templateItemsError) {
    throw new Error(templateItemsError.message || "Vanhojen ateriapohjarivien poisto epaonnistui.");
  }
  if (recipeIngredientsError) {
    throw new Error(recipeIngredientsError.message || "Vanhojen reseptiraaka-aineiden poisto epaonnistui.");
  }

  const { error: recipesError } = await supabase.from("recipes").delete().in("id", staleRecipeIds);
  if (recipesError) {
    throw new Error(recipesError.message || "Vanhojen reseptien poisto epaonnistui.");
  }

  return staleRecipeIds.length;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let recipes = recipeSeedData;
  if (args.only && args.only.length > 0) {
    const wanted = new Set(args.only);
    recipes = recipeSeedData.filter((recipe) => wanted.has(recipe.name));
    const missing = args.only.filter((name) => !recipeSeedData.some((recipe) => recipe.name === name));
    if (missing.length > 0) {
      throw new Error(`--only: reseptiä ei löytynyt seed-datasta: ${missing.join(", ")}`);
    }
  }
  if (typeof args.limit === "number" && Number.isFinite(args.limit)) {
    recipes = recipes.slice(0, args.limit);
  }

  if (args.dryRun) {
    console.log(JSON.stringify({
      count: recipes.length,
      preview: recipes.slice(0, 5).map((recipe) => ({
        name: recipe.name,
        mealTag: recipe.mealTag,
        ingredients: recipe.ingredients.length,
      })),
    }, null, 2));
    return;
  }

  const createdBy = args.createdBy || getCreatedBy();
  if (!createdBy) {
    throw new Error(
      "Anna admin-kayttajan UUID joko argumenttina (npm run import:recipes <uuid>) tai RECIPE_SEED_CREATED_BY-ymparistomuuttujana.",
    );
  }
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(createdBy)) {
    throw new Error(
      `created_by ei ole kelvollinen UUID: "${createdBy}". Kayta admin-kayttajan taytta UUID:ta (esim. 11111111-2222-3333-4444-555555555555).`,
    );
  }

  const supabase = getAdminClient();
  const ingredientCatalogMap = await fetchIngredientCatalogMap(supabase);
  const timestamp = new Date().toISOString();
  const unresolvedByRecipe = [];
  let createdCount = 0;
  let updatedCount = 0;
  const keptRecipeIds = new Set();

  for (const recipe of recipes) {
    const result = await upsertRecipe(supabase, recipe, createdBy, ingredientCatalogMap, timestamp);
    keptRecipeIds.add(result.recipeId);
    if (result.created) {
      createdCount += 1;
    } else {
      updatedCount += 1;
    }

    if (result.unresolvedIngredients.length > 0) {
      unresolvedByRecipe.push({
        recipe: recipe.name,
        ingredients: Array.from(new Set(result.unresolvedIngredients)).sort(),
      });
    }
  }

  // Osittaisessa ajossa (--only tai --limit) EI prunata: muuten muut admin-reseptit
  // poistuisivat koska ne eivät ole keptRecipeIds:ssä. Prune vain täydessä ajossa.
  const isPartialRun = (args.only && args.only.length > 0) || typeof args.limit === "number";
  const prunedCount = isPartialRun ? 0 : await pruneMissingRecipes(supabase, createdBy, keptRecipeIds);

  console.log(JSON.stringify({
    imported: recipes.length,
    created: createdCount,
    updated: updatedCount,
    pruned: prunedCount,
    prunedSkipped: isPartialRun,
    unresolvedIngredients: unresolvedByRecipe,
  }, null, 2));
}

const isMainModule = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMainModule) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
