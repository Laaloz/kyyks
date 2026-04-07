#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const REQUIRED_HEADERS = [
  "id",
  "name",
  "energy,calculated (kJ)",
  "fat, total (g)",
  "carbohydrate, available (g)",
  "protein, total (g)",
];

function parseArgs(argv) {
  const args = {
    file: "",
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
      continue;
    }
    if (!args.file) {
      args.file = value;
    }
  }

  return args;
}

export function parseFineliNumber(rawValue) {
  if (rawValue === undefined || rawValue === null) {
    return null;
  }

  const value = String(rawValue).trim();
  if (!value || value === "N/A") {
    return null;
  }

  if (value.startsWith("<")) {
    const parsedLessThan = Number(value.slice(1).replace(",", "."));
    return Number.isFinite(parsedLessThan) ? parsedLessThan : null;
  }

  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function splitSemicolonLine(line) {
  return line.split(";");
}

export function parseFineliCsv(content) {
  const normalized = content.replace(/^\uFEFF/, "");
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("CSV-tiedosto on tyhjä tai siitä puuttuu datarivejä.");
  }

  const headers = splitSemicolonLine(lines[0]);
  for (const header of REQUIRED_HEADERS) {
    if (!headers.includes(header)) {
      throw new Error(`CSV-tiedostosta puuttuu vaadittu sarake: ${header}`);
    }
  }

  return lines.slice(1).map((line) => {
    const cells = splitSemicolonLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));

    const energyKj = parseFineliNumber(row["energy,calculated (kJ)"]);
    const kcalPer100 = energyKj === null ? 0 : Math.round(energyKj / 4.184);

    return {
      source_external_id: String(row.id).trim(),
      name: String(row.name).trim(),
      source: "fineli",
      owner_role: "admin",
      default_purchase_unit: "g",
      grams_per_unit: null,
      kcal_per_100: kcalPer100,
      protein_per_100: parseFineliNumber(row["protein, total (g)"]) ?? 0,
      carbs_per_100: parseFineliNumber(row["carbohydrate, available (g)"]) ?? 0,
      fat_per_100: parseFineliNumber(row["fat, total (g)"]) ?? 0,
    };
  }).filter((row) => row.name.length > 0);
}

async function upsertRows(rows) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL tai SUPABASE_SERVICE_ROLE_KEY puuttuu ympäristömuuttujista.");
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const timestamp = new Date().toISOString();
  const payload = rows.map((row) => ({
    ...row,
    created_by: process.env.FINELI_CREATED_BY ?? process.env.FINELI_ADMIN_USER_ID ?? null,
    created_at: timestamp,
    updated_at: timestamp,
  }));

  const missingCreator = payload.some((row) => !row.created_by);
  if (missingCreator) {
    throw new Error("Aseta FINELI_CREATED_BY tai FINELI_ADMIN_USER_ID admin-käyttäjän UUID-arvoksi ennen importtia.");
  }

  const { error } = await supabase
    .from("ingredient_catalog")
    .upsert(payload, {
      onConflict: "source,source_external_id",
      ignoreDuplicates: false,
    });

  if (!error) {
    return;
  }

  const supportsSourceExternalUpsert = !String(error.message || "")
    .includes("no unique or exclusion constraint matching the ON CONFLICT specification");

  if (supportsSourceExternalUpsert) {
    throw new Error(error.message || "Fineli-import epäonnistui.");
  }

  // Fallback for deployments where partial unique index cannot be targeted via ON CONFLICT.
  const externalIds = Array.from(new Set(payload
    .map((row) => row.source_external_id)
    .filter(Boolean)));

  const existingByExternalId = new Map();
  const chunkSize = 500;

  for (let index = 0; index < externalIds.length; index += chunkSize) {
    const chunk = externalIds.slice(index, index + chunkSize);
    const { data, error: selectError } = await supabase
      .from("ingredient_catalog")
      .select("id,source_external_id")
      .eq("source", "fineli")
      .in("source_external_id", chunk);

    if (selectError) {
      throw new Error(selectError.message || "Fineli-import epäonnistui olemassa olevien rivien haussa.");
    }

    for (const row of data ?? []) {
      if (row.source_external_id) {
        existingByExternalId.set(row.source_external_id, row.id);
      }
    }
  }

  const payloadWithIds = payload.map((row) => {
    const existingId = row.source_external_id ? existingByExternalId.get(row.source_external_id) : undefined;
    return existingId ? { ...row, id: existingId } : row;
  });

  const { error: fallbackError } = await supabase
    .from("ingredient_catalog")
    .upsert(payloadWithIds, {
      onConflict: "id",
      ignoreDuplicates: false,
    });

  if (fallbackError) {
    throw new Error(fallbackError.message || "Fineli-import epäonnistui fallback-upsertissa.");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    throw new Error("Anna CSV-tiedoston polku. Esim: npm run import:fineli -- ~/Downloads/resultset.csv --dry-run");
  }

  const content = await readFile(args.file, "utf8");
  const parsedRows = parseFineliCsv(content);
  const rows = typeof args.limit === "number" && Number.isFinite(args.limit)
    ? parsedRows.slice(0, args.limit)
    : parsedRows;

  if (args.dryRun) {
    console.log(JSON.stringify({
      count: rows.length,
      preview: rows.slice(0, 10),
    }, null, 2));
    return;
  }

  await upsertRows(rows);
  console.log(`Imported ${rows.length} Fineli ingredients.`);
}

const isMainModule = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMainModule) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
