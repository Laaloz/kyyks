import { InviteAcceptView } from "@/components/workout/invite-accept-view";
import { getPublicInviteByToken } from "@/lib/server/auth-workflows";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await getPublicInviteByToken(token);
  return <InviteAcceptView token={token} initialInvite={invite} />;
}
