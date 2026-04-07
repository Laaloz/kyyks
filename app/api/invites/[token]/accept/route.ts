import { NextResponse } from "next/server";
import { z } from "zod";

import { acceptInviteOnServer } from "@/lib/server/auth-workflows";
import { verifyPublicCaptchaOrCreateErrorResponse } from "@/lib/server/hcaptcha";

const requestSchema = z.object({
  fullName: z.string().min(2),
  password: z.string().min(6),
  captchaToken: z.string().optional(),
  age: z.number().int().min(13).max(100).optional(),
  sex: z.enum(["female", "male", "other"]).optional(),
  heightCm: z.number().min(80).max(250).optional(),
  weightKg: z.number().min(20).max(350).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Virheellinen kutsun aktivointipyyntö." }, { status: 400 });
  }

  const captchaErrorResponse = await verifyPublicCaptchaOrCreateErrorResponse(parsed.data.captchaToken);
  if (captchaErrorResponse) {
    return captchaErrorResponse;
  }

  const { token } = await context.params;
  const result = await acceptInviteOnServer({
    token,
    fullName: parsed.data.fullName,
    password: parsed.data.password,
    age: parsed.data.age,
    sex: parsed.data.sex,
    heightCm: parsed.data.heightCm,
    weightKg: parsed.data.weightKg,
  });

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({ email: result.email, message: "message" in result ? result.message : undefined });
}
