import "server-only";

import { NextResponse } from "next/server";

type HCaptchaVerificationResult =
  | { ok: true }
  | { ok: false; message: string };

type HCaptchaResponse = {
  success?: boolean;
};

function getHCaptchaSecret() {
  return process.env.HCAPTCHA_SECRET_KEY ?? process.env.HCAPTCHA_SECRET ?? "";
}

export function isHCaptchaServerConfigured() {
  return Boolean(getHCaptchaSecret());
}

export async function verifyHCaptchaToken(
  token: string | undefined,
  remoteIp?: string,
): Promise<HCaptchaVerificationResult> {
  const secret = getHCaptchaSecret();
  if (!secret) {
    return { ok: false, message: "Captcha-tarkistus ei ole käytettävissä juuri nyt." };
  }

  const normalizedToken = token?.trim();
  if (!normalizedToken) {
    return { ok: false, message: "Vahvista captcha ennen jatkamista." };
  }

  const body = new URLSearchParams({
    secret,
    response: normalizedToken,
  });

  if (remoteIp) {
    body.set("remoteip", remoteIp);
  }

  try {
    const response = await fetch("https://hcaptcha.com/siteverify", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      return { ok: false, message: "Captcha-varmennus epäonnistui. Yritä uudelleen." };
    }

    const payload = (await response.json().catch(() => null)) as HCaptchaResponse | null;
    if (!payload?.success) {
      return { ok: false, message: "Captcha-varmennus epäonnistui. Yritä uudelleen." };
    }

    return { ok: true };
  } catch {
    return { ok: false, message: "Captcha-varmennus epäonnistui. Yritä uudelleen." };
  }
}

export async function verifyPublicCaptchaOrCreateErrorResponse(token: string | undefined) {
  if (!isHCaptchaServerConfigured()) {
    return null;
  }

  const verification = await verifyHCaptchaToken(token);
  if (verification.ok) {
    return null;
  }

  return NextResponse.json({ message: verification.message }, { status: 400 });
}
