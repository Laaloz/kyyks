import { describe, expect, it } from "vitest";

import { parseFineliCsv, parseFineliNumber } from "@/scripts/import-fineli.mjs";

describe("Fineli import parser", () => {
  it("parses numeric values including less-than markers", () => {
    expect(parseFineliNumber("12.5")).toBe(12.5);
    expect(parseFineliNumber("<0.1")).toBe(0.1);
    expect(parseFineliNumber("N/A")).toBeNull();
    expect(parseFineliNumber("")).toBeNull();
  });

  it("maps semicolon separated fineli csv into ingredient rows", () => {
    const csv = [
      "id;name;energy,calculated (kJ);fat, total (g);carbohydrate, available (g);protein, total (g)",
      "379;Almond;2517;51.2;6.6;24.1",
      "28916;Apple, Average, With Skin;155;<0.1;7.7;0.2",
    ].join("\n");

    const rows = parseFineliCsv(csv);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      source_external_id: "379",
      name: "Almond",
      source: "fineli",
      kcal_per_100: 602,
      fat_per_100: 51.2,
      carbs_per_100: 6.6,
      protein_per_100: 24.1,
    });
    expect(rows[1]).toMatchObject({
      source_external_id: "28916",
      name: "Apple, Average, With Skin",
      fat_per_100: 0.1,
      carbs_per_100: 7.7,
      protein_per_100: 0.2,
    });
  });
});
