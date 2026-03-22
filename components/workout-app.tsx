"use client";

import { LoginScreen } from "@/components/workout/login-screen";
import { DashboardShell } from "@/components/workout/dashboard-shell";
import { LoadingScreen } from "@/components/workout/loading-screen";
import { useAppState } from "@/providers/app-state-provider";

export function WorkoutApp() {
  const { currentUser, isHydrated } = useAppState();

  if (!isHydrated) {
    return <LoadingScreen />;
  }

  if (!currentUser) {
    return <LoginScreen />;
  }

  return <DashboardShell />;
}
