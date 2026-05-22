import { NextResponse } from "next/server";

import { estimateExtraActivityKcal } from "@/lib/extra-activities";
import type { ExtraActivityType, Role } from "@/lib/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ activityId: string }> },
) {
  const { activityId } = await params;
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ message: "Supabase ei ole käytössä tässä ympäristössä." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Kirjaudu sisään ennen extra-treenin poistoa." }, { status: 401 });
  }

  const { error } = await supabase.from("extra_activities").delete().eq("id", activityId);
  if (error) {
    return NextResponse.json({ message: "Extra-treenin poisto epäonnistui." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

type PatchBodyPayload = {
  activityType?: ExtraActivityType;
  durationMinutes?: number;
  manualKcal?: number;
  occurredAt?: string;
  notes?: string;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ activityId: string }> },
) {
  const { activityId } = await params;
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ message: "Supabase ei ole käytössä tässä ympäristössä." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Kirjaudu sisään ennen extra-treenin muokkausta." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as PatchBodyPayload | null;
  const activityType = body?.activityType;
  const durationMinutes = Number(body?.durationMinutes ?? 0);
  const manualKcal = Number(body?.manualKcal ?? 0);
  const occurredAt = body?.occurredAt;

  if (
    !activityType ||
    !["run", "walk", "cycle", "swim", "climb", "hike", "row", "ski", "yoga", "hiit", "combat", "dance", "mobility", "other"].includes(activityType)
  ) {
    return NextResponse.json({ message: "Valitse extra-treenin tyyppi." }, { status: 400 });
  }

  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return NextResponse.json({ message: "Anna kestolle vähintään 1 minuutti." }, { status: 400 });
  }

  const occurredAtDate = occurredAt ? new Date(occurredAt) : null;
  if (!occurredAtDate || !Number.isFinite(occurredAtDate.getTime())) {
    return NextResponse.json({ message: "Anna extra-treenille kelvollinen päivämäärä." }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, weight_kg")
    .eq("id", user.id)
    .maybeSingle<{ id: string; role: Role; weight_kg: number | null }>();

  if (!profile) {
    return NextResponse.json({ message: "Käyttäjäprofiilia ei löytynyt." }, { status: 403 });
  }

  const estimatedKcal = estimateExtraActivityKcal({
    activityType,
    durationMinutes,
    weightKg: profile.weight_kg ?? undefined,
  });
  const resolvedKcal = Number.isFinite(manualKcal) && manualKcal > 0 ? Math.round(manualKcal) : estimatedKcal;

  const { error } = await supabase
    .from("extra_activities")
    .update({
      activity_type: activityType,
      duration_minutes: Math.round(durationMinutes),
      estimated_kcal: resolvedKcal,
      occurred_at: occurredAtDate.toISOString(),
      notes: body?.notes?.trim() || null,
    })
    .eq("id", activityId);

  if (error) {
    return NextResponse.json({ message: "Extra-treenin muokkaus epäonnistui." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
