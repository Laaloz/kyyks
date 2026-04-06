import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { AdminDashboard } from "@/components/workout/admin-dashboard";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a">) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/workout/own-measurements-card", () => ({
  OwnMeasurementsCard: ({ sectionId }: { sectionId: string }) => <div data-testid={sectionId}>mittaukset</div>,
}));

vi.mock("@/components/workout/shared", () => ({
  MetricGrid: () => <div>MetricGrid</div>,
  OwnTrainingOverviewCard: () => <div>OwnTrainingOverviewCard</div>,
  roleLabel: (role: string) => role,
}));

const mockUseAppState = vi.fn();

vi.mock("@/providers/app-state-provider", () => ({
  useAppState: () => mockUseAppState(),
}));

describe("AdminDashboard overview tabs", () => {
  it("shows snapshot by default and swaps content when a new tab is selected", () => {
    mockUseAppState.mockReturnValue({
      currentUser: {
        id: "admin_1",
        role: "admin",
        fullName: "Admin User",
        email: "admin@example.com",
        status: "active",
        createdAt: "2026-04-01T08:00:00.000Z",
        updatedAt: "2026-04-01T08:00:00.000Z",
      },
      state: {
        users: [
          {
            id: "admin_1",
            role: "admin",
            fullName: "Admin User",
            email: "admin@example.com",
            status: "active",
            createdAt: "2026-04-01T08:00:00.000Z",
            updatedAt: "2026-04-01T08:00:00.000Z",
          },
          {
            id: "coach_1",
            role: "coach",
            fullName: "Coach User",
            email: "coach@example.com",
            status: "active",
            createdAt: "2026-04-01T08:00:00.000Z",
            updatedAt: "2026-04-01T08:00:00.000Z",
          },
          {
            id: "athlete_1",
            role: "athlete",
            fullName: "Athlete User",
            email: "athlete@example.com",
            status: "active",
            createdAt: "2026-04-01T08:00:00.000Z",
            updatedAt: "2026-04-01T08:00:00.000Z",
          },
        ],
        invites: [
          {
            id: "invite_1",
            email: "new-athlete@example.com",
            role: "athlete",
            coachId: "coach_1",
            invitedBy: "admin_1",
            status: "pending",
            token: "token-1",
            createdAt: "2026-04-01T08:00:00.000Z",
            expiresAt: "2026-04-08T08:00:00.000Z",
          },
        ],
        assignments: [
          {
            id: "assignment_1",
            coachId: "coach_1",
            athleteId: "athlete_1",
            active: true,
            createdAt: "2026-04-01T08:00:00.000Z",
            updatedAt: "2026-04-01T08:00:00.000Z",
          },
        ],
        plans: [
          {
            id: "plan_1",
            coachId: "coach_1",
            athleteId: "athlete_1",
            title: "Perusvoima",
            workouts: [{ id: "workout_template_1", exercises: [] }],
            startDate: "2026-04-01",
            weekCount: 4,
            createdAt: "2026-04-01T08:00:00.000Z",
          },
        ],
        sessions: [],
        scheduledWorkouts: [],
        notes: [],
      },
      notify: vi.fn(),
      createInvite: vi.fn(),
      resendInvite: vi.fn(),
    });

    render(<AdminDashboard view="overview" />);

    expect(screen.getByRole("tab", { name: "Tilannekuva" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Miltä verkon arki näyttää juuri nyt")).toBeInTheDocument();
    expect(screen.queryByText("Seuraa kuka on tulossa sisään järjestelmään")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Kutsut" }));

    expect(screen.getByRole("tab", { name: "Kutsut" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Seuraa kuka on tulossa sisään järjestelmään")).toBeInTheDocument();
    expect(screen.queryByText("Miltä verkon arki näyttää juuri nyt")).not.toBeInTheDocument();
  });
});
