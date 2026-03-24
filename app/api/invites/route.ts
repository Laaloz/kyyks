import { NextResponse } from "next/server";
import { z } from "zod";

import { createInviteAndSendEmail, listVisiblePendingInvites } from "@/lib/server/auth-workflows";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  email: z.string().email(),
  role: z.enum(["coach", "athlete"]),
  coachId: z.string().optional(),
});

async function getRequesterProfile() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { error: NextResponse.json({ message: "Supabase ei ole käytössä tässä ympäristössä." }, { status: 503 }) };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ message: "Kirjaudu sisään ennen kutsujen käyttöä." }, { status: 401 }) };
  }

  const { data: requester } = await supabase
    .from("profiles")
    .select("id, role, email, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!requester) {
    return { error: NextResponse.json({ message: "Käyttäjäprofiilia ei löytynyt." }, { status: 403 }) };
  }

  return { requester };
}

export async function GET() {
  const requesterResult = await getRequesterProfile();
  if ("error" in requesterResult) {
    return requesterResult.error;
  }

  const result = await listVisiblePendingInvites({
    requester: requesterResult.requester,
  });

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({
    invites: result.invites,
    activeEmails: result.activeEmails,
  });
}

export async function POST(request: Request) {
  const requesterResult = await getRequesterProfile();
  if ("error" in requesterResult) {
    return requesterResult.error;
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Virheellinen kutsupyyntö." }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const result = await createInviteAndSendEmail({
    requester: requesterResult.requester,
    payload: parsed.data,
    origin,
  });

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({ invite: result.invite });
}
