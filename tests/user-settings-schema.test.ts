import { describe, expect, it } from "vitest";

import { bodyMeasurementSchema, userSettingsSchema } from "@/components/workout/schemas";

describe("userSettingsSchema", () => {
  it("accepts the Mallu theme mode", () => {
    const parsed = userSettingsSchema.safeParse({
      fullName: "Mallu Testaaja",
      profileImageUrl: "https://example.com/avatar.jpg",
      defaultDashboardView: "overview",
      emailNotifications: true,
      weeklyMeasurementReminders: true,
      themeMode: "mallu",
      loadIncrementKg: 2.5,
    });

    expect(parsed.success).toBe(true);
  });
});

describe("bodyMeasurementSchema", () => {
  it("coerces decimal strings into numbers", () => {
    const parsed = bodyMeasurementSchema.safeParse({
      heightCm: "",
      weightKg: "72,4",
      waistCm: "81",
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({
      heightCm: undefined,
      weightKg: 72.4,
      waistCm: 81,
    });
  });

  it("treats empty strings as undefined", () => {
    const parsed = bodyMeasurementSchema.safeParse({
      heightCm: "",
      weightKg: "",
      waistCm: "",
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({
      heightCm: undefined,
      weightKg: undefined,
      waistCm: undefined,
    });
  });
});
