import { NextResponse } from "next/server";
import { z } from "zod";

import { createRequestTimer } from "@/lib/server/request-timing";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const settingsSchema = z.object({
  fullName: z.string().trim().min(2),
  profileImageUrl: z.union([z.string().trim().url(), z.literal("")]).transform((value) => (value === "" ? null : value)),
  defaultDashboardView: z.enum(["overview", "templates", "invites", "athlete-log", "conversation", "athletes", "users"]),
  emailNotifications: z.boolean(),
  weeklyMeasurementReminders: z.boolean(),
  themeMode: z.enum(["light", "dark", "mallu"]),
  loadIncrementKg: z.union([z.literal(1), z.literal(2.5), z.literal(5)]),
});

export async function PATCH(request: Request) {
  const timer = createRequestTimer("settings-patch");
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return timer.json({ message: "Supabase ei ole käytössä tässä ympäristössä." }, { status: 503 });
  }

  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  const {
    data: { user },
  } = accessToken ? await supabase.auth.getUser(accessToken) : await supabase.auth.getUser();

  if (!user) {
    return timer.json({ message: "Kirjaudu sisään ennen asetusten tallennusta." }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = settingsSchema.safeParse(payload);

  if (!parsed.success) {
    return timer.json({ message: "Asetusten tiedot olivat virheelliset." }, { status: 400 });
  }

  const timestamp = new Date().toISOString();
  const adminSupabase = createSupabaseAdminClient();

  const clientForUpdate = adminSupabase ?? supabase;

  const { error } = await clientForUpdate
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      profile_image_url: parsed.data.profileImageUrl,
      default_dashboard_view: parsed.data.defaultDashboardView,
      email_notifications: parsed.data.emailNotifications,
      weekly_measurement_reminders: parsed.data.weeklyMeasurementReminders,
      theme_mode: parsed.data.themeMode,
      load_increment_kg: parsed.data.loadIncrementKg,
      updated_at: timestamp,
    })
    .eq("id", user.id);

  if (error) {
    return timer.json(
      { message: error.message || "Asetusten tallennus epäonnistui." },
      { status: 400 },
    );
  }

  timer.log({ userId: user.id });
  return timer.json({ ok: true });
}
