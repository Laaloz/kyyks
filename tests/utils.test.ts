import { describe, expect, it } from "vitest";

import { formatDate, formatDateWithWeekday } from "@/lib/utils";

describe("date formatters", () => {
  it("returns fallback text for invalid dates", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
    expect(formatDateWithWeekday("not-a-date")).toBe("not-a-date");
  });

  it("returns dash for empty values", () => {
    expect(formatDate("")).toBe("-");
    expect(formatDateWithWeekday("")).toBe("-");
  });
});
