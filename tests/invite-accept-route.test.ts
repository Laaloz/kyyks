// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const { acceptInviteOnServerMock } = vi.hoisted(() => ({
  acceptInviteOnServerMock: vi.fn(),
}));

const { verifyPublicCaptchaOrCreateErrorResponseMock } = vi.hoisted(() => ({
  verifyPublicCaptchaOrCreateErrorResponseMock: vi.fn(),
}));

vi.mock("@/lib/server/auth-workflows", () => ({
  acceptInviteOnServer: acceptInviteOnServerMock,
}));

vi.mock("@/lib/server/hcaptcha", () => ({
  verifyPublicCaptchaOrCreateErrorResponse: verifyPublicCaptchaOrCreateErrorResponseMock,
}));

import { POST } from "@/app/api/invites/[token]/accept/route";

describe("invite accept route", () => {
  beforeEach(() => {
    acceptInviteOnServerMock.mockReset();
    verifyPublicCaptchaOrCreateErrorResponseMock.mockReset();
    verifyPublicCaptchaOrCreateErrorResponseMock.mockResolvedValue(null);
  });

  it("verifies captcha on server before accepting invite when configured", async () => {
    acceptInviteOnServerMock.mockResolvedValue({ ok: true, email: "athlete@example.com", message: "ok" });

    const response = await POST(
      new Request("https://rooki.fit/api/invites/token-1/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: "Athlete One", password: "secret123", captchaToken: "captcha-token" }),
      }),
      { params: Promise.resolve({ token: "token-1" }) },
    );

    expect(response.status).toBe(200);
    expect(verifyPublicCaptchaOrCreateErrorResponseMock).toHaveBeenCalledWith("captcha-token");
    expect(acceptInviteOnServerMock).toHaveBeenCalledWith({
      token: "token-1",
      fullName: "Athlete One",
      password: "secret123",
    });
  });

  it("returns captcha error when server verification fails", async () => {
    verifyPublicCaptchaOrCreateErrorResponseMock.mockResolvedValue(
      NextResponse.json({ message: "Vahvista captcha ennen jatkamista." }, { status: 400 }),
    );

    const response = await POST(
      new Request("https://rooki.fit/api/invites/token-1/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: "Athlete One", password: "secret123", captchaToken: "" }),
      }),
      { params: Promise.resolve({ token: "token-1" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ message: "Vahvista captcha ennen jatkamista." });
    expect(acceptInviteOnServerMock).not.toHaveBeenCalled();
  });
});
