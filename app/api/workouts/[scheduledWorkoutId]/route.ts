import { NextResponse } from "next/server";

import { createRequestTimer } from "@/lib/server/request-timing";
import { deleteWorkoutOnServer, updateWorkoutDurationOnServer } from "@/lib/server/training-workflows";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function PATCH(request: Request, context: { params: Promise<{ scheduledWorkoutId: string }> }) {
  const timer = createRequestTimer("workout-duration-patch");
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return timer.json({ message: "Supabase ei ole käytössä tässä ympäristössä." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return timer.json({ message: "Kirjaudu sisään ennen treeniajan muokkausta." }, { status: 401 });
  }

  const { data: requester } = await supabase
    .from("profiles")
    .select("id, role, email, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!requester) {
    return timer.json({ message: "Käyttäjäprofiilia ei löytynyt." }, { status: 403 });
  }

  const payload = (await request.json().catch(() => null)) as { durationSeconds?: number } | null;
  const { scheduledWorkoutId } = await context.params;
  const result = await updateWorkoutDurationOnServer({
    requester,
    scheduledWorkoutId,
    durationSeconds: payload?.durationSeconds ?? Number.NaN,
  });

  if (!result.ok) {
    return timer.json({ message: result.message }, { status: 400 });
  }

  timer.log({ userId: user.id, scheduledWorkoutId });
  return timer.json({ ok: true });
}

export async function DELETE(_request: Request, context: { params: Promise<{ scheduledWorkoutId: string }> }) {
  const timer = createRequestTimer("workout-delete");
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return timer.json({ message: "Supabase ei ole käytössä tässä ympäristössä." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return timer.json({ message: "Kirjaudu sisään ennen treenin poistamista." }, { status: 401 });
  }

  const { data: requester } = await supabase
    .from("profiles")
    .select("id, role, email, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!requester) {
    return timer.json({ message: "Käyttäjäprofiilia ei löytynyt." }, { status: 403 });
  }

  const { scheduledWorkoutId } = await context.params;
  const result = await deleteWorkoutOnServer({
    requester,
    scheduledWorkoutId,
  });

  if (!result.ok) {
    return timer.json({ message: result.message }, { status: 400 });
  }

  timer.log({ userId: user.id, scheduledWorkoutId });
  return timer.json({ ok: true });
}
