import { NextResponse } from "next/server";
import { z } from "zod";

import { setProgramStatusOnServer } from "@/lib/server/training-workflows";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  status: z.enum(["active", "archived", "removed"]),
});

export async function POST(request: Request, context: { params: Promise<{ programId: string }> }) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ message: "Supabase ei ole käytössä tässä ympäristössä." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Kirjaudu sisään ennen ohjelman hallintaa." }, { status: 401 });
  }

  const { data: requester } = await supabase
    .from("profiles")
    .select("id, role, email, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!requester) {
    return NextResponse.json({ message: "Käyttäjäprofiilia ei löytynyt." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Virheellinen tilapyyntö." }, { status: 400 });
  }

  const { programId } = await context.params;
  const result = await setProgramStatusOnServer({
    requester,
    programId,
    status: parsed.data.status,
  });

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
