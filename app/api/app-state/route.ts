import { NextResponse } from "next/server";

import { ensureProfileForAuthenticatedUserOnServer } from "@/lib/server/auth-workflows";
import { loadVisibleSupabaseAppState } from "@/lib/server/training-sync";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ message: "Supabase ei ole käytössä tässä ympäristössä." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Kirjaudu sisään ennen tietojen synkronointia." }, { status: 401 });
  }

  try {
    await ensureProfileForAuthenticatedUserOnServer({
      authUserId: user.id,
      email: user.email,
      fullName:
        typeof user.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name
          : typeof user.user_metadata?.name === "string"
            ? user.user_metadata.name
            : null,
    });

    const snapshot = await loadVisibleSupabaseAppState(supabase);
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "Sovellustilan haku epäonnistui.";
    console.error("[app-state] failed to load visible state", {
      message,
      userId: user.id,
    });
    return NextResponse.json({ message }, { status: 500 });
  }
}
