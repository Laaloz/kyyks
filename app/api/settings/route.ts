import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const settingsSchema = z.object({
  fullName: z.string().trim().min(2),
  defaultDashboardView: z.enum(["overview", "templates", "invites", "athlete-log", "conversation"]),
  emailNotifications: z.boolean(),
  themeMode: z.enum(["light", "dark"]),
});

export async function PATCH(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ message: "Supabase ei ole käytössä tässä ympäristössä." }, { status: 503 });
  }

  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  const {
    data: { user },
  } = accessToken ? await supabase.auth.getUser(accessToken) : await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Kirjaudu sisään ennen asetusten tallennusta." }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = settingsSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ message: "Asetusten tiedot olivat virheelliset." }, { status: 400 });
  }

  const timestamp = new Date().toISOString();

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      default_dashboard_view: parsed.data.defaultDashboardView,
      email_notifications: parsed.data.emailNotifications,
      theme_mode: parsed.data.themeMode,
      updated_at: timestamp,
    })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ message: "Asetusten tallennus epäonnistui." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
