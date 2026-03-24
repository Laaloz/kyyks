import { NextResponse } from "next/server";

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
    const snapshot = await loadVisibleSupabaseAppState(supabase);
    return NextResponse.json(snapshot);
  } catch {
    return NextResponse.json({ message: "Sovellustilan haku epäonnistui." }, { status: 500 });
  }
}
