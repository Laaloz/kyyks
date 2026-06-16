import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DashboardShell } from "@/components/workout/dashboard-shell";
import type { Role } from "@/lib/types";

// Raskaat paneelit korvataan tyhjillä stubeilla — testi kohdistuu vain naviin.
vi.mock("@/components/workout/athlete-dashboard", () => ({ AthleteDashboard: () => null }));
vi.mock("@/components/workout/coach-dashboard", () => ({ CoachDashboard: () => null }));
vi.mock("@/components/workout/user-settings-panel", () => ({ UserSettingsPanel: () => null }));
vi.mock("@/components/workout/profile-sheet", () => ({ ProfileSheet: () => null }));
vi.mock("@/components/workout/athlete/measurement-reminder-dialog", () => ({
  MeasurementReminderDialog: () => null,
}));
vi.mock("@/lib/measurement-reminder", () => ({
  getMeasurementReminderState: () => ({ isDue: false, weightDue: false, waistDue: false, cycleKey: null }),
}));

const mockUseAppState = vi.fn();
vi.mock("@/providers/app-state-provider", () => ({
  useAppState: () => mockUseAppState(),
}));

function buildContext(role: Role, options: { preview: boolean }) {
  const currentUser = {
    id: "athlete-1",
    fullName: "Iina Itsenäinen",
    email: "iina@example.com",
    role,
    updatedAt: new Date().toISOString(),
    profileImageUrl: null,
    settings: { defaultDashboardView: undefined, weeklyMeasurementReminders: false },
  };
  const admin = { id: "admin-1", fullName: "Anna Admin", email: "anna@example.com", role: "admin" as Role };

  return {
    authenticatedUser: options.preview ? admin : currentUser,
    currentUser,
    isImpersonating: options.preview,
    isPreviewMode: options.preview,
    logout: vi.fn(),
    stopAdminImpersonation: vi.fn(() => ({ ok: true })),
    stopAthletePreview: vi.fn(() => ({ ok: true })),
    markConversationRead: vi.fn(),
    state: { assignments: [], users: [], conversationEntries: [] },
  };
}

afterEach(() => {
  cleanup();
  mockUseAppState.mockReset();
});

describe("DashboardShell-navi esikatselussa", () => {
  it("näyttää adminin esikatselussa itsenäisen treenaajan Ohjelma-välilehden", () => {
    mockUseAppState.mockReturnValue(buildContext("independent_athlete", { preview: true }));

    render(<DashboardShell />);

    // Esikatselupalkki vahvistaa että ollaan preview-tilassa kuten urheilijalla.
    expect(screen.getByText(/Esikatselu/)).toBeInTheDocument();
    // Työpöytänavin välilehti (role="tab") on rooliperustaisesti läsnä.
    expect(screen.getByRole("tab", { name: "Ohjelma" })).toBeInTheDocument();
  });

  it("ei näytä Ohjelma-välilehteä valmennettavalle (athlete) treenaajalle", () => {
    mockUseAppState.mockReturnValue(buildContext("athlete", { preview: true }));

    render(<DashboardShell />);

    expect(screen.queryByRole("tab", { name: "Ohjelma" })).not.toBeInTheDocument();
  });
});
