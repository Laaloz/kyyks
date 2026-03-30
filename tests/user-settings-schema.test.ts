import { describe, expect, it } from "vitest";

import { userSettingsSchema } from "@/components/workout/schemas";

describe("userSettingsSchema", () => {
  it("accepts the Mallu theme mode", () => {
    const parsed = userSettingsSchema.safeParse({
      fullName: "Mallu Testaaja",
      defaultDashboardView: "overview",
      emailNotifications: true,
      weeklyMeasurementReminders: true,
      themeMode: "mallu",
      loadIncrementKg: 2.5,
    });

    expect(parsed.success).toBe(true);
  });
});
