import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Role, UserStatus } from "@/lib/types";

type RequesterProfile = {
  id: string;
  role: Role;
};

export async function deleteUserAccountOnServer({
  requester,
  targetUserId,
  targetEmail,
  targetStatus,
}: {
  requester: RequesterProfile;
  targetUserId: string;
  targetEmail?: string;
  targetStatus?: UserStatus;
}) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { ok: false as const, message: "Supabase admin -yhteys puuttuu. Tarkista service role -avain." };
  }

  if (requester.role !== "admin") {
    return { ok: false as const, message: "Vain admin voi poistaa käyttäjiä." };
  }

  if (requester.id === targetUserId) {
    return { ok: false as const, message: "Et voi poistaa omaa admin-tiliäsi." };
  }

  const { data: targetProfile } = await admin
    .from("profiles")
    .select("id, role, email")
    .eq("id", targetUserId)
    .maybeSingle();

  if (targetProfile) {
    if (targetProfile.role === "admin") {
      const { count: adminCount } = await admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin");

      if ((adminCount ?? 0) <= 1) {
        return { ok: false as const, message: "Viimeistä admin-käyttäjää ei voi poistaa." };
      }
    }

    const deleteResult = await admin.auth.admin.deleteUser(targetProfile.id);
    if (deleteResult.error) {
      return { ok: false as const, message: "Käyttäjän poisto tietokannasta epäonnistui." };
    }

    await admin
      .from("invites")
      .delete()
      .ilike("email", targetProfile.email);

    return { ok: true as const };
  }

  if (targetStatus === "invited" && targetEmail) {
    const { error: inviteDeleteError } = await admin
      .from("invites")
      .delete()
      .ilike("email", targetEmail);

    if (inviteDeleteError) {
      return { ok: false as const, message: "Avoimen kutsun poisto epäonnistui." };
    }

    return { ok: true as const };
  }

  return { ok: false as const, message: "Käyttäjää ei löytynyt." };
}
