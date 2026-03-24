import { NextResponse } from "next/server";
import { z } from "zod";

import { acceptInviteOnServer } from "@/lib/server/auth-workflows";

const requestSchema = z.object({
  fullName: z.string().min(2),
  password: z.string().min(6),
});

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Virheellinen kutsun aktivointipyyntö." }, { status: 400 });
  }

  const { token } = await context.params;
  const result = await acceptInviteOnServer({
    token,
    fullName: parsed.data.fullName,
    password: parsed.data.password,
  });

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({ email: result.email });
}
