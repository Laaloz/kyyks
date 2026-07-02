import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FoodEntryEditSheet } from "@/components/workout/add-food-sheet";
import type { DayMealPlanEntry } from "@/lib/types";

function buildEntry(overrides?: Partial<DayMealPlanEntry>): DayMealPlanEntry {
  return {
    id: "entry_1",
    athleteId: "athlete_1",
    planDate: "2026-07-02",
    mealTag: "breakfast",
    recipeId: null,
    source: "added",
    servings: 1,
    position: 0,
    grams: 250,
    foodName: "Kaurapuuro mustikoilla",
    kcalPer100: 80,
    proteinPer100: 3,
    carbsPer100: 14,
    fatPer100: 2,
    createdAt: "2026-07-02T06:00:00.000Z",
    updatedAt: "2026-07-02T06:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe("FoodEntryEditSheet", () => {
  it("näyttää arvot lukunäkymänä: nimi, annoskoko, kcal/annos, makrosarakkeet ja per 100 g -rivi", () => {
    render(<FoodEntryEditSheet entry={buildEntry()} aiEnabled onClose={() => {}} onSave={vi.fn()} />);

    expect(screen.getByText("Kaurapuuro mustikoilla")).toBeTruthy();
    expect(screen.getByText("250 g")).toBeTruthy();
    // 250 g × 80 kcal/100 g = 200 kcal/annos.
    expect(screen.getByText("200")).toBeTruthy();
    expect(screen.getByText("kcal / annos")).toBeTruthy();
    expect(screen.getByText("Proteiini")).toBeTruthy();
    expect(screen.getByText("Hiilihydraatit")).toBeTruthy();
    expect(screen.getByText(/80 kcal · P 3 g · H 14 g · R 2 g \/ 100 g/)).toBeTruthy();
    // Lukunäkymässä ei ole muokattavia kenttiä — nimi on tekstiä, ei inputtia.
    expect(screen.queryByDisplayValue("Kaurapuuro mustikoilla")).toBeNull();
    expect(screen.queryByLabelText("Annoskoko grammoina")).toBeNull();
  });

  it("annoskoon muutos ...-valikon kautta päivittää kcal/annos-luvun", () => {
    render(<FoodEntryEditSheet entry={buildEntry()} aiEnabled onClose={() => {}} onSave={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("Avaa muokkausvalinnat"));
    fireEvent.click(screen.getByText("Muuta annoskokoa"));
    fireEvent.change(screen.getByLabelText("Annoskoko grammoina"), { target: { value: "100" } });
    expect(screen.getByText("80")).toBeTruthy();
  });

  it("nimen muokkaus avautuu valikosta ja muutos vaihtaa tallennuksen AI-uudelleenarvioksi", () => {
    render(<FoodEntryEditSheet entry={buildEntry()} aiEnabled onClose={() => {}} onSave={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("Avaa muokkausvalinnat"));
    fireEvent.click(screen.getByText("Muokkaa nimeä"));
    const nameInput = screen.getByDisplayValue("Kaurapuuro mustikoilla");
    fireEvent.change(nameInput, { target: { value: "Kaurapuuro ja banaani" } });
    expect(screen.getByText("Tallenna ja arvioi uudelleen")).toBeTruthy();
  });

  it("käsin muokkaus avautuu valikosta", () => {
    render(<FoodEntryEditSheet entry={buildEntry()} aiEnabled onClose={() => {}} onSave={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("Avaa muokkausvalinnat"));
    fireEvent.click(screen.getByText("Muokkaa arvoja itse"));
    expect(screen.getByText("Energia")).toBeTruthy();
    expect(screen.getByDisplayValue("Kaurapuuro mustikoilla")).toBeTruthy();
  });

  it("avautuu suoraan käsitilaan kun arvot puuttuvat (esim. AI-arvio epäonnistui)", () => {
    render(
      <FoodEntryEditSheet
        entry={buildEntry({ kcalPer100: null, proteinPer100: null, carbsPer100: null, fatPer100: null, aiStatus: "failed" })}
        aiEnabled
        onClose={() => {}}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByText("Energia")).toBeTruthy();
    expect(screen.queryByLabelText("Avaa muokkausvalinnat")).toBeNull();
  });

  it("ilman AI:ta valikossa ei ole nimen AI-muokkausta mutta muut valinnat ovat", () => {
    render(<FoodEntryEditSheet entry={buildEntry()} aiEnabled={false} onClose={() => {}} onSave={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("Avaa muokkausvalinnat"));
    expect(screen.queryByText("Muokkaa nimeä")).toBeNull();
    expect(screen.getByText("Muuta annoskokoa")).toBeTruthy();
    expect(screen.getByText("Muokkaa arvoja itse")).toBeTruthy();
  });
});
