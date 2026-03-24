import { NextResponse } from "next/server";

import { getPublicInviteByToken } from "@/lib/server/auth-workflows";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const invite = await getPublicInviteByToken(token);

  if (!invite) {
    return NextResponse.json({ message: "Kutsua ei löytynyt." }, { status: 404 });
  }

  return NextResponse.json({ invite });
}
