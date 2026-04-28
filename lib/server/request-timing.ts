import { NextResponse } from "next/server";

function toDurationMs(startedAt: number) {
  return Number((performance.now() - startedAt).toFixed(1));
}

export function createRequestTimer(label: string) {
  const startedAt = performance.now();

  return {
    checkpoint(phase: string, metadata?: Record<string, unknown>) {
      const durationMs = toDurationMs(startedAt);
      console.info(`[timing] ${label}:${phase}`, {
        durationMs,
        ...metadata,
      });
      return durationMs;
    },
    json(body: unknown, init?: ResponseInit) {
      const durationMs = toDurationMs(startedAt);
      const response = NextResponse.json(body, init);
      response.headers.set("Server-Timing", `${label};dur=${durationMs}`);
      response.headers.set("X-Response-Time", `${durationMs}ms`);
      return response;
    },
    log(metadata?: Record<string, unknown>) {
      const durationMs = toDurationMs(startedAt);
      console.info(`[timing] ${label}`, {
        durationMs,
        ...metadata,
      });
      return durationMs;
    },
  };
}
