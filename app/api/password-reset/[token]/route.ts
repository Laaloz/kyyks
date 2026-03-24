import { NextResponse } from "next/server";
import { z } from "zod";

import { completePasswordResetOnServer } from "@/lib/server/auth-workflows";

const requestSchema = z.object({
  password: z.string().min(8),
});

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Virheellinen salasanan nollauspyyntö." }, { status: 400 });
  }

  const { token } = await context.params;
  const result = await completePasswordResetOnServer({
    token,
    password: parsed.data.password,
  });

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
