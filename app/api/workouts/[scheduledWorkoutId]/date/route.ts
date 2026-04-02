import { z } from "zod";

import { createRequestTimer } from "@/lib/server/request-timing";
import { updateWorkoutDateOnServer } from "@/lib/server/training-workflows";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  scheduledDate: z.string(),
  expectedUpdatedAt: z.string().datetime(),
});

export async function PATCH(request: Request, context: { params: Promise<{ scheduledWorkoutId: string }> }) {
  const timer = createRequestTimer("workout-date-patch");
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return timer.json({ message: "Supabase ei ole käytössä tässä ympäristössä." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return timer.json({ message: "Kirjaudu sisään ennen treenipäivän muokkausta." }, { status: 401 });
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
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return timer.json({ message: "Virheellinen treenipäivä." }, { status: 400 });
  }

  const { scheduledWorkoutId } = await context.params;
  const result = await updateWorkoutDateOnServer({
    requester,
    scheduledWorkoutId,
    scheduledDate: parsed.data.scheduledDate,
    expectedUpdatedAt: parsed.data.expectedUpdatedAt,
  });

  if (!result.ok) {
    return timer.json({ message: result.message, code: result.code }, { status: result.code?.startsWith("stale") ? 409 : 400 });
  }

  timer.log({ userId: user.id, scheduledWorkoutId });
  return timer.json({ ok: true, updatedAt: result.updatedAt, completedAt: result.completedAt });
}
