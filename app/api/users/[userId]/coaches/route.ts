import { NextResponse } from "next/server";
import { z } from "zod";

import { assignAthleteCoachesOnServer } from "@/lib/server/user-admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  email: z.string().email().optional(),
  coachIds: z.array(z.string()).min(1),
});

export async function PUT(request: Request, context: { params: Promise<{ userId: string }> }) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ message: "Supabase ei ole käytössä tässä ympäristössä." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Kirjaudu sisään ennen vastuuhenkilöiden päivitystä." }, { status: 401 });
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
    return NextResponse.json({ message: "Virheellinen vastuuhenkilöpyyntö." }, { status: 400 });
  }

  const { userId } = await context.params;
  const result = await assignAthleteCoachesOnServer({
    requester,
    athleteId: userId,
    athleteEmail: parsed.data.email,
    coachIds: parsed.data.coachIds,
  });

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    resolvedAthleteId: result.resolvedAthleteId,
    coachIds: result.coachIds,
    updatedInviteCoachId: result.updatedInviteCoachId,
    createdAt: result.createdAt,
    message: result.message,
  });
}
