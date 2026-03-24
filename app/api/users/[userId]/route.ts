import { NextResponse } from "next/server";
import { z } from "zod";

import { deleteUserAccountOnServer } from "@/lib/server/user-admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  email: z.string().email().optional(),
  status: z.enum(["active", "invited"]).optional(),
});

export async function DELETE(request: Request, context: { params: Promise<{ userId: string }> }) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ message: "Supabase ei ole käytössä tässä ympäristössä." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Kirjaudu sisään ennen käyttäjän poistoa." }, { status: 401 });
  }

  const { data: requester } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!requester) {
    return NextResponse.json({ message: "Käyttäjäprofiilia ei löytynyt." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Virheellinen poistopyyntö." }, { status: 400 });
  }

  const { userId } = await context.params;
  const result = await deleteUserAccountOnServer({
    requester,
    targetUserId: userId,
    targetEmail: parsed.data.email,
    targetStatus: parsed.data.status,
  });

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
