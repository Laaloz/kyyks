#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

import { ingredientAliases } from "./recipe-ingredient-aliases.mjs";

function parseArgs(argv) {
  return {
    dryRun: argv.includes("--dry-run"),
  };
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

function normalizeName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[%]/g, " ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function resolveIngredient(catalogMap, ingredientName) {
  const normalizedName = normalizeName(ingredientName);
  const directMatch = catalogMap.get(normalizedName);
  if (directMatch) {
    return directMatch;
  }

  const aliasCandidates = ingredientAliases[normalizedName] ?? [];
  for (const alias of aliasCandidates) {
    const aliasMatch = catalogMap.get(normalizeName(alias));
    if (aliasMatch) {
      return aliasMatch;
    }
  }

  return null;
}

async function fetchAll(supabase, table, select) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(error.message || `${table} haku epaonnistui.`);
    }

    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) {
      break;
    }
  }

  return rows;
}

function resolveNormalizedQuantity(row, ingredientMatch) {
  if (row.quantity === undefined || row.quantity === null) {
    return null;
  }

  if (row.unit === "pcs" && ingredientMatch?.grams_per_unit) {
    return row.quantity * Number(ingredientMatch.grams_per_unit);
  }

  return row.quantity;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabase = getAdminClient();
  const catalogRows = await fetchAll(supabase, "ingredient_catalog", "id,name,display_name,grams_per_unit");
  const recipeIngredientRows = await fetchAll(
    supabase,
    "recipe_ingredients",
    "id,recipe_id,ingredient_id,ingredient_name,quantity,unit,normalized_quantity",
  );

  const catalogMap = new Map();
  for (const row of catalogRows) {
    catalogMap.set(normalizeName(row.name), row);
    if (row.display_name) {
      catalogMap.set(normalizeName(row.display_name), row);
    }
  }

  const repairs = [];
  const unresolved = [];

  for (const row of recipeIngredientRows) {
    if (row.ingredient_id || !row.ingredient_name?.trim()) {
      continue;
    }

    const match = resolveIngredient(catalogMap, row.ingredient_name);
    if (!match) {
      unresolved.push({
        id: row.id,
        recipeId: row.recipe_id,
        ingredientName: row.ingredient_name,
      });
      continue;
    }

    repairs.push({
      id: row.id,
      recipeId: row.recipe_id,
      ingredientName: row.ingredient_name,
      ingredientId: match.id,
      matchedName: match.display_name || match.name,
      normalizedQuantity: resolveNormalizedQuantity(row, match),
    });
  }

  if (!args.dryRun) {
    for (const repair of repairs) {
      const { error } = await supabase
        .from("recipe_ingredients")
        .update({
          ingredient_id: repair.ingredientId,
          normalized_quantity: repair.normalizedQuantity,
        })
        .eq("id", repair.id);

      if (error) {
        throw new Error(error.message || `Raaka-ainelinkin ${repair.id} korjaus epaonnistui.`);
      }
    }
  }

  console.log(JSON.stringify({
    dryRun: args.dryRun,
    scannedRecipeIngredients: recipeIngredientRows.length,
    repaired: repairs.length,
    unresolved: unresolved.length,
    repairedPreview: repairs.slice(0, 20),
    unresolvedPreview: unresolved.slice(0, 50),
  }, null, 2));
}

const isMainModule = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMainModule) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
