import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Role, UserStatus } from "@/lib/types";

type RequesterProfile = {
  id: string;
  role: Role;
};

type ManagedProfile = {
  id: string;
  role: Role;
  email: string;
  status?: UserStatus;
};

async function resolveManagedProfile(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  targetUserId: string,
  targetEmail?: string,
) {
  let { data: targetProfile } = await admin
    .from("profiles")
    .select("id, role, email, status")
    .eq("id", targetUserId)
    .maybeSingle<ManagedProfile>();

  if (!targetProfile && targetEmail) {
    const profileByEmail = await admin
      .from("profiles")
      .select("id, role, email, status")
      .ilike("email", targetEmail)
      .maybeSingle<ManagedProfile>();

    targetProfile = profileByEmail.data ?? null;
  }

  return targetProfile;
}

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

  const targetProfile = await resolveManagedProfile(admin, targetUserId, targetEmail);

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

    return { ok: true as const, resolvedUserId: targetProfile.id };
  }

  if (targetStatus === "invited" && targetEmail) {
    const { error: inviteDeleteError } = await admin
      .from("invites")
      .delete()
      .ilike("email", targetEmail);

    if (inviteDeleteError) {
      return { ok: false as const, message: "Avoimen kutsun poisto epäonnistui." };
    }

    return { ok: true as const, resolvedUserId: targetUserId };
  }

  return { ok: false as const, message: "Käyttäjää ei löytynyt." };
}

export async function updateUserRoleOnServer({
  requester,
  targetUserId,
  targetEmail,
  nextRole,
}: {
  requester: RequesterProfile;
  targetUserId: string;
  targetEmail?: string;
  nextRole: Role;
}) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { ok: false as const, message: "Supabase admin -yhteys puuttuu. Tarkista service role -avain." };
  }

  if (requester.role !== "admin") {
    return { ok: false as const, message: "Vain admin voi vaihtaa käyttäjän roolia." };
  }

  const targetProfile = await resolveManagedProfile(admin, targetUserId, targetEmail);
  if (!targetProfile) {
    return { ok: false as const, message: "Käyttäjää ei löytynyt." };
  }

  if (targetProfile.id === requester.id) {
    return { ok: false as const, message: "Et voi vaihtaa omaa admin-rooliasi." };
  }

  if (targetProfile.role === nextRole) {
    return { ok: true as const, message: "Rooli oli jo valittuna.", resolvedUserId: targetProfile.id };
  }

  if (targetProfile.role === "admin" && nextRole !== "admin") {
    const { count: adminCount } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");

    if ((adminCount ?? 0) <= 1) {
      return { ok: false as const, message: "Viimeisen admin-käyttäjän roolia ei voi vaihtaa." };
    }
  }

  if (targetProfile.role === "coach" && nextRole !== "coach") {
    const { count: activeAthleteCount } = await admin
      .from("coach_athlete_assignments")
      .select("id", { count: "exact", head: true })
      .eq("coach_id", targetProfile.id)
      .eq("active", true);

    if ((activeAthleteCount ?? 0) > 0) {
      return {
        ok: false as const,
        message: "Siirrä ensin valmennettavat toiselle valmentajalle ennen roolin vaihtoa.",
      };
    }

    const { count: coachedProgramCount } = await admin
      .from("training_plans")
      .select("id", { count: "exact", head: true })
      .eq("coach_id", targetProfile.id);

    if ((coachedProgramCount ?? 0) > 0) {
      return {
        ok: false as const,
        message: "Siirrä tai päätä ensin käyttäjän valmennusohjelmat ennen roolin vaihtoa.",
      };
    }
  }

  const updatedAt = new Date().toISOString();
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      role: nextRole,
      updated_at: updatedAt,
      default_dashboard_view: nextRole === "athlete" ? "athlete-log" : "overview",
    })
    .eq("id", targetProfile.id);

  if (profileError) {
    return { ok: false as const, message: "Roolin päivitys tietokantaan epäonnistui." };
  }

  if (nextRole === "admin") {
    await admin
      .from("coach_athlete_assignments")
      .delete()
      .or(`coach_id.eq.${targetProfile.id},athlete_id.eq.${targetProfile.id}`);
  } else if (nextRole === "coach") {
    await admin
      .from("coach_athlete_assignments")
      .delete()
      .eq("athlete_id", targetProfile.id);
  } else {
    await admin
      .from("coach_athlete_assignments")
      .delete()
      .eq("coach_id", targetProfile.id);
  }

  return {
    ok: true as const,
    resolvedUserId: targetProfile.id,
    updatedAt,
  };
}

export async function assignAthleteCoachesOnServer({
  requester,
  athleteId,
  athleteEmail,
  coachIds,
}: {
  requester: RequesterProfile;
  athleteId: string;
  athleteEmail?: string;
  coachIds: string[];
}) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { ok: false as const, message: "Supabase admin -yhteys puuttuu. Tarkista service role -avain." };
  }

  if (requester.role !== "admin") {
    return { ok: false as const, message: "Vain admin voi vaihtaa treenaajan valmentajat." };
  }

  const athlete = await resolveManagedProfile(admin, athleteId, athleteEmail);
  if (!athlete || athlete.role !== "athlete") {
    return { ok: false as const, message: "Treenaajaa ei löytynyt." };
  }

  const uniqueCoachIds = Array.from(new Set(coachIds.filter(Boolean)));
  if (!uniqueCoachIds.length) {
    return { ok: false as const, message: "Valitse vähintään yksi valmentaja." };
  }

  const { data: selectedCoaches, error: coachError } = await admin
    .from("profiles")
    .select("id, role")
    .in("id", uniqueCoachIds);

  if (coachError || !selectedCoaches || selectedCoaches.length !== uniqueCoachIds.length) {
    return { ok: false as const, message: "Yksi tai useampi valituista valmentajista ei ole kelvollinen." };
  }

  if (selectedCoaches.some((coach) => coach.role !== "admin" && coach.role !== "coach")) {
    return { ok: false as const, message: "Yksi tai useampi valituista valmentajista ei ole kelvollinen." };
  }

  const { data: activeAssignments } = await admin
    .from("coach_athlete_assignments")
    .select("coach_id")
    .eq("athlete_id", athlete.id)
    .eq("active", true);

  const activeCoachIds = (activeAssignments ?? []).map((assignment) => assignment.coach_id).sort();
  const normalizedSelectedCoachIds = [...uniqueCoachIds].sort();
  if (
    activeCoachIds.length === normalizedSelectedCoachIds.length &&
    activeCoachIds.every((coachId, index) => coachId === normalizedSelectedCoachIds[index])
  ) {
    return { ok: true as const, message: "Valmentajat olivat jo valittuna.", resolvedAthleteId: athlete.id };
  }

  const createdAt = new Date().toISOString();
  const primaryCoachId = uniqueCoachIds[0] ?? "";

  const { error: deleteAssignmentsError } = await admin
    .from("coach_athlete_assignments")
    .delete()
    .eq("athlete_id", athlete.id)
    .eq("active", true);

  if (deleteAssignmentsError) {
    return { ok: false as const, message: "Vastuuhenkilöiden päivitys epäonnistui." };
  }

  const { error: insertAssignmentsError } = await admin
    .from("coach_athlete_assignments")
    .insert(
      uniqueCoachIds.map((coachId) => ({
        coach_id: coachId,
        athlete_id: athlete.id,
        active: true,
        created_at: createdAt,
      })),
    );

  if (insertAssignmentsError) {
    return { ok: false as const, message: "Vastuuhenkilöiden päivitys epäonnistui." };
  }

  const { error: inviteUpdateError } = await admin
    .from("invites")
    .update({ coach_id: primaryCoachId })
    .ilike("email", athlete.email)
    .eq("role", "athlete")
    .eq("status", "pending");

  if (inviteUpdateError) {
    return { ok: false as const, message: "Vastuuhenkilöiden päivitys epäonnistui." };
  }

  return {
    ok: true as const,
    resolvedAthleteId: athlete.id,
    coachIds: uniqueCoachIds,
    updatedInviteCoachId: primaryCoachId,
    createdAt,
  };
}
