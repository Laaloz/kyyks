import { NextResponse } from "next/server";
import { z } from "zod";

import { createPasswordResetRequestAndSendEmail } from "@/lib/server/auth-workflows";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  userId: z.string().optional(),
});

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ message: "Supabase ei ole käytössä tässä ympäristössä." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Virheellinen nollauspyyntö." }, { status: 400 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Kirjaudu sisään ennen salasanan nollausta." }, { status: 401 });
  }

  const { data: requester } = await supabase
    .from("profiles")
    .select("id, role, email, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!requester) {
    return NextResponse.json({ message: "Käyttäjäprofiilia ei löytynyt." }, { status: 403 });
  }

  const targetUserId = parsed.data.userId ?? requester.id;
  const mode = parsed.data.userId ? "admin" : "self_service";

  if (parsed.data.userId && requester.role !== "admin") {
    return NextResponse.json({ message: "Vain admin voi lähettää nollausviestejä muille käyttäjille." }, { status: 403 });
  }

  const origin = new URL(request.url).origin;
  const result = await createPasswordResetRequestAndSendEmail({
    requester,
    targetUserId,
    origin,
    mode,
  });

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({ message: result.message });
}
