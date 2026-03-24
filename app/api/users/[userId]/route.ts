import { NextResponse } from "next/server";
import { z } from "zod";

import { deleteUserAccountOnServer, updateUserRoleOnServer } from "@/lib/server/user-admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  email: z.string().email().optional(),
  status: z.enum(["active", "invited"]).optional(),
});

const patchSchema = z.object({
  email: z.string().email().optional(),
  role: z.enum(["admin", "coach", "athlete"]),
});

async function getRequester() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      error: NextResponse.json({ message: "Supabase ei ole käytössä tässä ympäristössä." }, { status: 503 }),
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json({ message: "Kirjaudu sisään ennen käyttäjän hallintaa." }, { status: 401 }),
    };
  }

  const { data: requester } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!requester) {
    return {
      error: NextResponse.json({ message: "Käyttäjäprofiilia ei löytynyt." }, { status: 403 }),
    };
  }

  return { requester };
}

export async function DELETE(request: Request, context: { params: Promise<{ userId: string }> }) {
  const requesterResult = await getRequester();
  if ("error" in requesterResult) {
    return requesterResult.error;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Virheellinen poistopyyntö." }, { status: 400 });
  }

  const { userId } = await context.params;
  const result = await deleteUserAccountOnServer({
    requester: requesterResult.requester,
    targetUserId: userId,
    targetEmail: parsed.data.email,
    targetStatus: parsed.data.status,
  });

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, resolvedUserId: result.resolvedUserId });
}

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  const requesterResult = await getRequester();
  if ("error" in requesterResult) {
    return requesterResult.error;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Virheellinen roolipyyntö." }, { status: 400 });
  }

  const { userId } = await context.params;
  const result = await updateUserRoleOnServer({
    requester: requesterResult.requester,
    targetUserId: userId,
    targetEmail: parsed.data.email,
    nextRole: parsed.data.role,
  });

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    resolvedUserId: result.resolvedUserId,
    updatedAt: "updatedAt" in result ? result.updatedAt : undefined,
    message: result.message,
  });
}
