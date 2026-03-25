// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  isHCaptchaServerConfigured,
  verifyHCaptchaToken,
  verifyPublicCaptchaOrCreateErrorResponse,
} from "@/lib/server/hcaptcha";

describe("hcaptcha server verification", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.HCAPTCHA_SECRET_KEY;
  });

  it("reports missing server secret configuration", async () => {
    delete process.env.HCAPTCHA_SECRET_KEY;

    expect(isHCaptchaServerConfigured()).toBe(false);
    await expect(verifyHCaptchaToken("token")).resolves.toEqual({
      ok: false,
      message: "Captcha-tarkistus ei ole käytettävissä juuri nyt.",
    });
  });

  it("rejects empty captcha token", async () => {
    process.env.HCAPTCHA_SECRET_KEY = "secret";

    await expect(verifyHCaptchaToken("")).resolves.toEqual({
      ok: false,
      message: "Vahvista captcha ennen jatkamista.",
    });
  });

  it("accepts successful hcaptcha verification", async () => {
    process.env.HCAPTCHA_SECRET_KEY = "secret";
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyHCaptchaToken("valid-token")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://hcaptcha.com/siteverify",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("creates a route response when public captcha verification fails", async () => {
    process.env.HCAPTCHA_SECRET_KEY = "secret";

    const response = await verifyPublicCaptchaOrCreateErrorResponse("");

    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toEqual({ message: "Vahvista captcha ennen jatkamista." });
  });
});
