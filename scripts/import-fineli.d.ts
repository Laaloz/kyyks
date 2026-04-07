declare module "@/scripts/import-fineli.mjs" {
  export type FineliIngredientRow = {
    source_external_id: string;
    name: string;
    source: "fineli";
    owner_role: "admin";
    default_purchase_unit: string;
    grams_per_unit: number | null;
    kcal_per_100: number;
    protein_per_100: number;
    carbs_per_100: number;
    fat_per_100: number;
  };

  export function parseFineliNumber(rawValue: unknown): number | null;
  export function parseFineliCsv(content: string): FineliIngredientRow[];
}
