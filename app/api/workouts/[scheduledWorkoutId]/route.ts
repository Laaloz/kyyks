import { NextResponse } from "next/server";

import { createRequestTimer } from "@/lib/server/request-timing";
import { deleteWorkoutOnServer, updateWorkoutDurationOnServer } from "@/lib/server/training-workflows";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { z } from "zod";

const durationRequestSchema = z.object({
  durationSeconds: z.number(),
  expectedUpdatedAt: z.string().datetime(),
});

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

  const body = await request.json().catch(() => null);
  const parsed = durationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return timer.json({ message: "Virheellinen treeniajan muokkauspyyntö." }, { status: 400 });
  }
  const { scheduledWorkoutId } = await context.params;
  const result = await updateWorkoutDurationOnServer({
    requester,
    scheduledWorkoutId,
    durationSeconds: parsed.data.durationSeconds,
    expectedUpdatedAt: parsed.data.expectedUpdatedAt,
  });

  if (!result.ok) {
    return timer.json({ message: result.message, code: result.code }, { status: result.code?.startsWith("stale") ? 409 : 400 });
  }

  timer.log({ userId: user.id, scheduledWorkoutId });
  return timer.json({ ok: true, updatedAt: result.updatedAt, completedAt: result.completedAt });
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

  console.info("[workout-action] delete", {
    userId: user.id,
    scheduledWorkoutId,
    ok: result.ok,
    message: result.ok ? undefined : result.message,
  });

  if (!result.ok) {
    return timer.json({ message: result.message }, { status: 400 });
  }

  timer.log({ userId: user.id, scheduledWorkoutId });
  return timer.json({ ok: true });
}
