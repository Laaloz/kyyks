#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

import { manualIngredientSeed } from "./manual-ingredient-seed.mjs";

function parseArgs(argv) {
  const args = {
    dryRun: false,
    limit: undefined,
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

async function findExistingIngredientId(supabase, ingredient) {
  const { data, error } = await supabase
    .from("ingredient_catalog")
    .select("id")
    .eq("name", ingredient.name)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || `Raaka-aineen ${ingredient.name} tarkistus epaonnistui.`);
  }

  return data?.id ?? null;
}

async function upsertIngredient(supabase, ingredient, createdBy, timestamp) {
  const existingId = await findExistingIngredientId(supabase, ingredient);
  const payload = {
    name: ingredient.name,
    source: ingredient.source,
    source_external_id: null,
    owner_role: "admin",
    created_by: createdBy,
    default_purchase_unit: ingredient.defaultPurchaseUnit ?? null,
    grams_per_unit: ingredient.gramsPerUnit ?? null,
    kcal_per_100: ingredient.kcalPer100,
    protein_per_100: ingredient.proteinPer100,
    carbs_per_100: ingredient.carbsPer100,
    fat_per_100: ingredient.fatPer100,
    updated_at: timestamp,
  };

  if (existingId) {
    const { error } = await supabase.from("ingredient_catalog").update(payload).eq("id", existingId);
    if (error) {
      throw new Error(error.message || `Raaka-aineen ${ingredient.name} paivitys epaonnistui.`);
    }
    return "updated";
  }

  const { error } = await supabase.from("ingredient_catalog").insert({
    ...payload,
    created_at: timestamp,
  });
  if (error) {
    throw new Error(error.message || `Raaka-aineen ${ingredient.name} tallennus epaonnistui.`);
  }
  return "created";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const ingredients = typeof args.limit === "number" && Number.isFinite(args.limit)
    ? manualIngredientSeed.slice(0, args.limit)
    : manualIngredientSeed;

  if (args.dryRun) {
    console.log(JSON.stringify({
      count: ingredients.length,
      preview: ingredients.slice(0, 10),
    }, null, 2));
    return;
  }

  const createdBy = getCreatedBy();
  if (!createdBy) {
    throw new Error("Aseta RECIPE_SEED_CREATED_BY admin-kayttajan UUID-arvoksi ennen importtia.");
  }

  const supabase = getAdminClient();
  const timestamp = new Date().toISOString();
  let created = 0;
  let updated = 0;

  for (const ingredient of ingredients) {
    const action = await upsertIngredient(supabase, ingredient, createdBy, timestamp);
    if (action === "created") {
      created += 1;
    } else {
      updated += 1;
    }
  }

  console.log(JSON.stringify({
    imported: ingredients.length,
    created,
    updated,
  }, null, 2));
}

const isMainModule = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMainModule) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
