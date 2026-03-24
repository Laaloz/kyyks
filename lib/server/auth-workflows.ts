import "server-only";

import { addDaysIso, addMinutesIso, createSecureToken, hashToken, INVITE_EXPIRY_DAYS, RESET_TOKEN_EXPIRY_MINUTES } from "@/lib/auth-tokens";
import { sendTransactionalEmail } from "@/lib/email";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Role } from "@/lib/types";

type RequesterProfile = {
  id: string;
  role: Role;
  email: string;
  full_name: string;
};

type InvitePayload = {
  email: string;
  role: "coach" | "athlete";
  coachId?: string;
};

type PublicInviteRecord = {
  email: string;
  role: "coach" | "athlete";
  coachId: string | null;
  expiresAt: string;
  status: "pending" | "accepted";
};

type StoredInviteRecord = {
  id: string;
  token: string;
  email: string;
  role: "coach" | "athlete";
  invited_by: string;
  coach_id: string | null;
  status: "pending" | "accepted";
  created_at: string;
  expires_at: string;
};

function mapStoredInviteRecord(invite: StoredInviteRecord) {
  return {
    id: invite.id,
    token: invite.token,
    email: invite.email,
    role: invite.role,
    invitedBy: invite.invited_by,
    coachId: invite.coach_id,
    status: invite.status,
    createdAt: invite.created_at,
    expiresAt: invite.expires_at,
  };
}

async function sendInviteEmail({
  email,
  role,
  token,
  origin,
}: {
  email: string;
  role: "coach" | "athlete";
  token: string;
  origin: string;
}) {
  const inviteUrl = `${origin}/invite/${token}`;

  return sendTransactionalEmail({
    to: email,
    subject: "Sinut on kutsuttu rooki.fit-palveluun",
    text:
      role === "coach"
        ? `Sinut on kutsuttu valmentajaksi rooki.fit-palveluun. Avaa kutsu: ${inviteUrl}`
        : `Sinut on kutsuttu treenaajaksi rooki.fit-palveluun. Avaa kutsu: ${inviteUrl}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
        <h1 style="font-size:22px;margin-bottom:12px">Kutsu rooki.fit-palveluun</h1>
        <p>Sinulle on luotu ${role === "coach" ? "valmentajan" : "treenaajan"} kutsu rooki.fit-palveluun.</p>
        <p><a href="${inviteUrl}" style="display:inline-block;background:#09111d;color:#ffefae;padding:12px 18px;border-radius:12px;text-decoration:none;font-weight:700">Avaa kutsu</a></p>
        <p>Jos painike ei toimi, avaa tämä linkki selaimessa:</p>
        <p><a href="${inviteUrl}">${inviteUrl}</a></p>
      </div>
    `,
  });
}

export async function getPublicInviteByToken(token: string): Promise<PublicInviteRecord | null> {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return null;
  }

  const { data, error } = await admin
    .from("invites")
    .select("email, role, coach_id, expires_at, status")
    .eq("token", token)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    email: data.email,
    role: data.role,
    coachId: data.coach_id,
    expiresAt: data.expires_at,
    status: data.status,
  };
}

export async function createInviteAndSendEmail({
  requester,
  payload,
  origin,
}: {
  requester: RequesterProfile;
  payload: InvitePayload;
  origin: string;
}) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { ok: false as const, message: "Supabase admin -yhteys puuttuu. Tarkista service role -avain." };
  }

  const normalizedEmail = payload.email.trim().toLowerCase();
  if (!normalizedEmail) {
    return { ok: false as const, message: "Anna kelvollinen sähköposti." };
  }

  if (requester.role !== "admin" && requester.role !== "coach") {
    return { ok: false as const, message: "Vain admin tai valmentaja voi luoda kutsuja." };
  }

  if (requester.role === "coach") {
    if (payload.role !== "athlete") {
      return { ok: false as const, message: "Valmentaja voi kutsua vain treenaajia." };
    }
    if (payload.coachId !== requester.id) {
      return { ok: false as const, message: "Valmentaja voi kutsua treenaajan vain omalle rosterilleen." };
    }
  }

  if (payload.role === "athlete" && !payload.coachId) {
    return { ok: false as const, message: "Treenaajalle pitää valita vastuullinen valmentaja." };
  }

  if (payload.role === "athlete" && payload.coachId) {
    const { data: assignedCoach, error: coachError } = await admin
      .from("profiles")
      .select("id, role")
      .eq("id", payload.coachId)
      .maybeSingle();

    if (coachError || !assignedCoach || !["admin", "coach"].includes(assignedCoach.role)) {
      return { ok: false as const, message: "Treenaajalle pitää valita valmennuskelpoinen vastuuhenkilö." };
    }
  }

  const { data: duplicateInvite } = await admin
    .from("invites")
    .select("id")
    .eq("email", normalizedEmail)
    .eq("status", "pending")
    .maybeSingle();

  if (duplicateInvite) {
    return { ok: false as const, message: "Tälle sähköpostille on jo avoin kutsu." };
  }

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id, status")
    .ilike("email", normalizedEmail)
    .maybeSingle();

  if (existingProfile?.status === "active") {
    return { ok: false as const, message: "Tällä sähköpostilla on jo aktiivinen käyttäjätili." };
  }

  const createdAt = new Date().toISOString();
  const expiresAt = addDaysIso(createdAt, INVITE_EXPIRY_DAYS);
  const token = createSecureToken();

  const { data: invite, error: inviteError } = await admin
    .from("invites")
    .insert({
      token,
      email: normalizedEmail,
      role: payload.role,
      invited_by: requester.id,
      coach_id: payload.coachId ?? null,
      status: "pending",
      expires_at: expiresAt,
    })
    .select("id, token, email, role, invited_by, coach_id, status, created_at, expires_at")
    .single<StoredInviteRecord>();

  if (inviteError || !invite) {
    return { ok: false as const, message: "Kutsun luonti epäonnistui." };
  }

  const mailResult = await sendInviteEmail({
    email: normalizedEmail,
    role: payload.role,
    token,
    origin,
  });

  if (!mailResult.ok) {
    await admin.from("invites").delete().eq("id", invite.id);
    return { ok: false as const, message: mailResult.message };
  }

  return {
    ok: true as const,
    invite: mapStoredInviteRecord(invite),
  };
}

export async function resendInviteEmail({
  requester,
  inviteId,
  origin,
}: {
  requester: RequesterProfile;
  inviteId: string;
  origin: string;
}) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { ok: false as const, message: "Supabase admin -yhteys puuttuu. Tarkista service role -avain." };
  }

  if (requester.role !== "admin" && requester.role !== "coach") {
    return { ok: false as const, message: "Vain admin tai valmentaja voi lähettää kutsun uudelleen." };
  }

  const { data: invite, error: inviteError } = await admin
    .from("invites")
    .select("id, token, email, role, invited_by, coach_id, status, created_at, expires_at")
    .eq("id", inviteId)
    .maybeSingle<StoredInviteRecord>();

  if (inviteError || !invite) {
    return { ok: false as const, message: "Kutsua ei löytynyt." };
  }

  if (invite.status !== "pending") {
    return { ok: false as const, message: "Vain avoimen kutsun voi lähettää uudelleen." };
  }

  if (requester.role === "coach" && invite.invited_by !== requester.id) {
    return { ok: false as const, message: "Valmentaja voi lähettää uudelleen vain omat kutsunsa." };
  }

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id, status")
    .ilike("email", invite.email)
    .maybeSingle();

  if (existingProfile?.status === "active") {
    return { ok: false as const, message: "Tällä sähköpostilla on jo aktiivinen käyttäjätili." };
  }

  const nextToken = createSecureToken();
  const nextExpiresAt = addDaysIso(new Date().toISOString(), INVITE_EXPIRY_DAYS);

  const { data: updatedInvite, error: updateError } = await admin
    .from("invites")
    .update({
      token: nextToken,
      expires_at: nextExpiresAt,
    })
    .eq("id", invite.id)
    .select("id, token, email, role, invited_by, coach_id, status, created_at, expires_at")
    .single<StoredInviteRecord>();

  if (updateError || !updatedInvite) {
    return { ok: false as const, message: "Kutsun uudelleenlähetys epäonnistui." };
  }

  const mailResult = await sendInviteEmail({
    email: updatedInvite.email,
    role: updatedInvite.role,
    token: updatedInvite.token,
    origin,
  });

  if (!mailResult.ok) {
    await admin
      .from("invites")
      .update({
        token: invite.token,
        expires_at: invite.expires_at,
      })
      .eq("id", invite.id);
    return { ok: false as const, message: mailResult.message };
  }

  return {
    ok: true as const,
    invite: mapStoredInviteRecord(updatedInvite),
  };
}

export async function createPasswordResetRequestAndSendEmail({
  requester,
  targetUserId,
  origin,
  mode,
}: {
  requester: RequesterProfile;
  targetUserId: string;
  origin: string;
  mode: "self_service" | "admin";
}) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { ok: false as const, message: "Supabase admin -yhteys puuttuu. Tarkista service role -avain." };
  }

  const { data: targetUser, error: targetError } = await admin
    .from("profiles")
    .select("id, email, status")
    .eq("id", targetUserId)
    .maybeSingle();

  if (targetError || !targetUser) {
    return { ok: false as const, message: "Käyttäjää ei löytynyt." };
  }

  if (targetUser.status !== "active") {
    return { ok: false as const, message: "Käyttäjä ei ole vielä aktivoinut tiliään." };
  }

  const createdAt = new Date().toISOString();
  const token = createSecureToken();
  const tokenHash = await hashToken(token);

  await admin
    .from("password_reset_requests")
    .update({ consumed_at: createdAt })
    .eq("user_id", targetUser.id)
    .is("consumed_at", null);

  const { error: insertError } = await admin.from("password_reset_requests").insert({
    user_id: targetUser.id,
    email: targetUser.email,
    token_hash: tokenHash,
    created_at: createdAt,
    expires_at: addMinutesIso(createdAt, RESET_TOKEN_EXPIRY_MINUTES),
    requested_by_user_id: requester.id,
    requested_by_role: mode,
  });

  if (insertError) {
    return { ok: false as const, message: "Salasanan nollauspyynnön luonti epäonnistui." };
  }

  const resetUrl = `${origin}/reset-password/${token}`;
  const mailResult = await sendTransactionalEmail({
    to: targetUser.email,
    subject: "Salasanan nollaus rooki.fit-palveluun",
    text: `Avaa salasanan nollauslinkki: ${resetUrl}`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
        <h1 style="font-size:22px;margin-bottom:12px">Aseta uusi salasana</h1>
        <p>Salasanan nollaus on pyydetty rooki.fit-palveluun.</p>
        <p><a href="${resetUrl}" style="display:inline-block;background:#09111d;color:#ffefae;padding:12px 18px;border-radius:12px;text-decoration:none;font-weight:700">Avaa reset-linkki</a></p>
        <p>Jos painike ei toimi, avaa tämä linkki selaimessa:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
      </div>
    `,
  });

  if (!mailResult.ok) {
    await admin
      .from("password_reset_requests")
      .delete()
      .eq("token_hash", tokenHash);
    return { ok: false as const, message: mailResult.message };
  }

  return {
    ok: true as const,
    message: `Nollausviesti lähetettiin osoitteeseen ${targetUser.email}.`,
  };
}

export async function acceptInviteOnServer({
  token,
  fullName,
  password,
}: {
  token: string;
  fullName: string;
  password: string;
}) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { ok: false as const, message: "Supabase admin -yhteys puuttuu. Tarkista service role -avain." };
  }

  const trimmedToken = token.trim();
  if (!trimmedToken) {
    return { ok: false as const, message: "Kutsulinkki on virheellinen." };
  }

  const trimmedName = fullName.trim();
  if (trimmedName.length < 2) {
    return { ok: false as const, message: "Anna koko nimi." };
  }

  if (password.trim().length < 6) {
    return { ok: false as const, message: "Salasanan pitää olla vähintään 6 merkkiä." };
  }

  const { data: invite, error: inviteError } = await admin
    .from("invites")
    .select("id, token, email, role, coach_id, status, expires_at")
    .eq("token", trimmedToken)
    .maybeSingle();

  if (inviteError || !invite || invite.status !== "pending") {
    return { ok: false as const, message: "Kutsua ei löytynyt tai se on jo käytetty." };
  }

  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return { ok: false as const, message: "Kutsu on vanhentunut. Pyydä uusi kutsu." };
  }

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id, status")
    .ilike("email", invite.email)
    .maybeSingle();

  if (existingProfile?.status === "active") {
    return { ok: false as const, message: "Tällä sähköpostilla on jo aktiivinen käyttäjätili." };
  }

  const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
    email: invite.email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: trimmedName,
    },
  });

  const authUser = createdUser.user;
  if (createUserError || !authUser) {
    return { ok: false as const, message: "Tunnuksen luonti epäonnistui." };
  }

  const now = new Date().toISOString();

  const { error: profileError } = await admin.from("profiles").upsert({
    id: authUser.id,
    role: invite.role,
    full_name: trimmedName,
    email: invite.email,
    status: "active",
    default_dashboard_view: invite.role === "athlete" ? "athlete-log" : "overview",
    email_notifications: false,
    theme_mode: "light",
    created_at: now,
    updated_at: now,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(authUser.id);
    return { ok: false as const, message: "Käyttäjäprofiilin luonti epäonnistui." };
  }

  if (invite.role === "athlete" && invite.coach_id) {
    const { error: assignmentError } = await admin
      .from("coach_athlete_assignments")
      .insert({
        coach_id: invite.coach_id,
        athlete_id: authUser.id,
        active: true,
        created_at: now,
      });

    if (assignmentError) {
      await admin.from("profiles").delete().eq("id", authUser.id);
      await admin.auth.admin.deleteUser(authUser.id);
      return { ok: false as const, message: "Valmentajasuhteen luonti epäonnistui." };
    }
  }

  const { error: inviteUpdateError } = await admin
    .from("invites")
    .update({ status: "accepted" })
    .eq("id", invite.id);

  if (inviteUpdateError) {
    return { ok: false as const, message: "Kutsun viimeistely epäonnistui." };
  }

  return {
    ok: true as const,
    email: invite.email,
  };
}

export async function completePasswordResetOnServer({
  token,
  password,
}: {
  token: string;
  password: string;
}) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { ok: false as const, message: "Supabase admin -yhteys puuttuu. Tarkista service role -avain." };
  }

  const trimmedToken = token.trim();
  if (!trimmedToken) {
    return { ok: false as const, message: "Nollauslinkki on virheellinen." };
  }

  if (password.trim().length < 8) {
    return { ok: false as const, message: "Salasanan tulee olla vähintään 8 merkkiä." };
  }

  const tokenHash = await hashToken(trimmedToken);
  const { data: request, error: requestError } = await admin
    .from("password_reset_requests")
    .select("id, user_id, email, expires_at, consumed_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (requestError || !request || request.consumed_at) {
    return { ok: false as const, message: "Nollauslinkki on vanhentunut tai jo käytetty." };
  }

  if (new Date(request.expires_at).getTime() <= Date.now()) {
    return { ok: false as const, message: "Nollauslinkki on vanhentunut tai jo käytetty." };
  }

  const { error: updateUserError } = await admin.auth.admin.updateUserById(request.user_id, {
    password,
  });

  if (updateUserError) {
    return { ok: false as const, message: "Salasanan päivittäminen epäonnistui." };
  }

  const { error: consumeError } = await admin
    .from("password_reset_requests")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", request.id);

  if (consumeError) {
    return { ok: false as const, message: "Nollauspyynnön viimeistely epäonnistui." };
  }

  return { ok: true as const };
}
