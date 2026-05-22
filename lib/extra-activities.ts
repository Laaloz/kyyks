import type { ExtraActivityType } from "@/lib/types";

type ActivityConfig = {
  label: string;
  met: number;
};

export const extraActivityCatalog: Record<ExtraActivityType, ActivityConfig> = {
  run: { label: "Juoksu", met: 9.8 },
  walk: { label: "Kävely", met: 3.8 },
  cycle: { label: "Pyöräily", met: 7.5 },
  swim: { label: "Uinti", met: 8.3 },
  climb: { label: "Kiipeily", met: 8 },
  hike: { label: "Vaellus", met: 6.5 },
  row: { label: "Soutu", met: 7 },
  ski: { label: "Hiihto", met: 8.8 },
  yoga: { label: "Jooga", met: 2.8 },
  hiit: { label: "HIIT", met: 9.5 },
  combat: { label: "Kamppailulajit", met: 9 },
  dance: { label: "Tanssi", met: 6 },
  mobility: { label: "Liikkuvuus", met: 2.5 },
  other: { label: "Muu", met: 5.5 },
};

export function estimateExtraActivityKcal(params: {
  activityType: ExtraActivityType;
  durationMinutes: number;
  weightKg?: number;
}) {
  const met = extraActivityCatalog[params.activityType].met;
  const weightKg = params.weightKg && params.weightKg > 0 ? params.weightKg : 75;
  const durationHours = Math.max(0, params.durationMinutes) / 60;
  const kcal = met * weightKg * durationHours;
  return Math.round(kcal);
}
