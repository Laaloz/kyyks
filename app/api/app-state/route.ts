import { NextResponse } from "next/server";

import { ensureProfileForAuthenticatedUserOnServer } from "@/lib/server/auth-workflows";
import { createRequestTimer } from "@/lib/server/request-timing";
import { loadVisibleSupabaseAppState } from "@/lib/server/training-sync";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const timer = createRequestTimer("app-state");
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return timer.json({ message: "Supabase ei ole käytössä tässä ympäristössä." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return timer.json({ message: "Kirjaudu sisään ennen tietojen synkronointia." }, { status: 401 });
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

    const lite = new URL(request.url).searchParams.get("lite") === "1";
    const snapshot = await loadVisibleSupabaseAppState(supabase, { lite });
    timer.log({ userId: user.id, lite });
    return timer.json(snapshot);
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "Sovellustilan haku epäonnistui.";
    console.error("[app-state] failed to load visible state", {
      message,
      userId: user.id,
    });
    timer.log({ userId: user.id, ok: false });
    return timer.json({ message }, { status: 500 });
  }
}
