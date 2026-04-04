import { NextResponse } from "next/server";

import { startScheduledWorkoutOnServer } from "@/lib/server/training-workflows";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(_request: Request, context: { params: Promise<{ scheduledWorkoutId: string }> }) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ message: "Supabase ei ole käytössä tässä ympäristössä." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Kirjaudu sisään ennen treenin käynnistystä." }, { status: 401 });
  }

  const { data: requester } = await supabase
    .from("profiles")
    .select("id, role, email, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!requester) {
    return NextResponse.json({ message: "Käyttäjäprofiilia ei löytynyt." }, { status: 403 });
  }

  const { scheduledWorkoutId } = await context.params;
  const result = await startScheduledWorkoutOnServer({
    requester,
    scheduledWorkoutId,
  });

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    scheduledWorkoutId,
    updatedAt: result.updatedAt,
    scheduledWorkout: result.payload?.scheduledWorkout,
    session: result.payload?.session,
  });
}
