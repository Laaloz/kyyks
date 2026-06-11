"use client";

import { Component, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

type PanelErrorBoundaryProps = {
  children: ReactNode;
};

type PanelErrorBoundaryState = {
  hasError: boolean;
};

export class PanelErrorBoundary extends Component<PanelErrorBoundaryProps, PanelErrorBoundaryState> {
  state: PanelErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): PanelErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Workspace panel crashed", error);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        role="alert"
        className="flex min-h-[16rem] w-full flex-col items-center justify-center gap-4 rounded-3xl border border-[var(--border)] bg-[var(--surface)] px-6 py-10 text-center"
      >
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--text)]">
            Näkymän lataaminen epäonnistui
          </h2>
          <p className="mt-2 max-w-sm text-sm text-[var(--text-muted)]">
            Tapahtui odottamaton virhe. Muut näkymät toimivat normaalisti — voit yrittää tätä uudelleen tai vaihtaa näkymää.
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={this.handleRetry}>
          Yritä uudelleen
        </Button>
      </div>
    );
  }
}
