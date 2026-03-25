import { NextResponse } from "next/server";
import { z } from "zod";

import { createPasswordResetRequestAndSendEmail } from "@/lib/server/auth-workflows";
import { verifyPublicCaptchaOrCreateErrorResponse } from "@/lib/server/hcaptcha";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  userId: z.string().optional(),
  email: z.string().email().optional(),
  captchaToken: z.string().optional(),
});

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ message: "Supabase ei ole käytössä tässä ympäristössä." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Virheellinen nollauspyyntö." }, { status: 400 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let requester = null;
  if (user) {
    const profileResult = await supabase
      .from("profiles")
      .select("id, role, email, full_name")
      .eq("id", user.id)
      .maybeSingle();
    requester = profileResult.data ?? null;
  }

  const isAdminRequest = Boolean(parsed.data.userId);
  const isPublicSelfServiceRequest = !user && Boolean(parsed.data.email);

  if (isAdminRequest) {
    if (!requester) {
      return NextResponse.json({ message: "Kirjaudu sisään ennen salasanan nollausta." }, { status: 401 });
    }

    if (requester.role !== "admin") {
      return NextResponse.json({ message: "Vain admin voi lähettää nollausviestejä muille käyttäjille." }, { status: 403 });
    }
  }

  if (!requester && !isPublicSelfServiceRequest) {
    return NextResponse.json({ message: "Anna sähköpostiosoite salasanan nollausta varten." }, { status: 400 });
  }

  if (isPublicSelfServiceRequest) {
    const captchaErrorResponse = await verifyPublicCaptchaOrCreateErrorResponse(parsed.data.captchaToken);
    if (captchaErrorResponse) {
      return captchaErrorResponse;
    }
  }

  const origin = new URL(request.url).origin;
  const result = await createPasswordResetRequestAndSendEmail({
    requester,
    targetUserId: parsed.data.userId ?? requester?.id,
    targetEmail: parsed.data.email,
    origin,
    mode: isAdminRequest ? "admin" : "self_service",
  });

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }

  return NextResponse.json({ message: result.message });
}
