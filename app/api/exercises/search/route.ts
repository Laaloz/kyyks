import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

// Palvelinpuolen liikehaku ohjelmaeditorin liikevalitsimeen.
//
// Korvaa koko liikekatalogin lataamisen app-state-payloadiin: katalogi kasvaa satoihin
// liikkeisiin, ja jokaisen käyttäjän jokaisella latauksella siirretty kokonaislista
// (nimet, ohjeet, kuva-URLit) olisi satoja kilotavuja. Sama ratkaisu kuin ainesosahaussa
// (/api/nutrition/ingredients/search, migraatio 059).
//
// Haku nojaa exercises_name_trgm_idx-indeksiin (migraatio 064): ilike '%term%' ei voi
// käyttää btree-indeksiä johtavan wildcardin takia.
//
// Palauttaa vain valitsimen tarvitsemat kentät — ei vaiheittaisia ohjeita eikä kuvia.
// Cue on mukana, koska valitsin esitäyttää sillä liikkeen ohjeen ohjelmaan lisättäessä.
const RESULT_LIMIT = 25;
const MIN_TERM_LENGTH = 2;

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ message: "Supabase ei ole käytössä tässä ympäristössä." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Kirjaudu sisään ennen liikehakua." }, { status: 401 });
  }

  const term = (new URL(request.url).searchParams.get("q") ?? "").trim();

  // Lyhyt haku palauttaisi käytännössä satunnaisen otoksen koko katalogista; valitsin
  // näyttää siihen asti oman kehotteensa.
  if (term.length < MIN_TERM_LENGTH) {
    return NextResponse.json({ exercises: [] });
  }

  // Näkyvyys tulee RLS:stä (exercises read by authenticated users) — globaalit kaikille,
  // coach_custom omistajalleen.
  const { data, error } = await supabase
    .from("exercises")
    .select("id, external_key, name, category, equipment, cue, scope, coach_id, thumbnail_url")
    .ilike("name", `%${term}%`)
    .order("name", { ascending: true })
    .limit(RESULT_LIMIT);

  if (error) {
    return NextResponse.json({ message: "Liikkeiden haku epäonnistui." }, { status: 400 });
  }

  return NextResponse.json({
    exercises: (data ?? []).map((row) => ({
      // Asiakaspuolen id on external_key jos se on (globaalit), muuten UUID (omat liikkeet)
      // — sama sääntö kuin training-sync.ts:n mapExerciseRow:ssa.
      id: row.external_key ?? row.id,
      name: row.name,
      category: row.category,
      equipment: row.equipment,
      cue: row.cue,
      scope: row.scope,
      coachId: row.coach_id ?? undefined,
      thumbnailUrl: row.thumbnail_url ?? undefined,
    })),
  });
}
