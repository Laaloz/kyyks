import { NextResponse } from "next/server";
import { z } from "zod";

import { createTemplateOnServer } from "@/lib/server/training-workflows";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const exerciseSchema = z.object({
  exerciseId: z.string(),
  instruction: z.string(),
  setCount: z.number(),
  targetReps: z.number(),
  targetLoad: z.number().optional(),
  restSeconds: z.number(),
  notes: z.string().optional(),
});

const requestSchema = z.object({
  title: z.string(),
  description: z.string(),
  goal: z.string(),
  splitType: z.enum(["upper", "lower", "full_body", "custom"]),
  blockTitle: z.string(),
  blockNote: z.string().optional(),
  exercises: z.array(exerciseSchema),
});

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ message: "Supabase ei ole käytössä tässä ympäristössä." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Kirjaudu sisään ennen treenipohjan tallennusta." }, { status: 401 });
  }

  const { data: requester } = await supabase
    .from("profiles")
    .select("id, role, email, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!requester) {
    return NextResponse.json({ message: "Käyttäjäprofiilia ei löytynyt." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Virheellinen treenipohjapyyntö." }, { status: 400 });
  }

  const result = await createTemplateOnServer({
    requester,
    payload: parsed.data,
  });

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, templateId: result.templateId });
}
