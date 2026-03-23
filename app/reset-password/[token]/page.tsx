import { ResetPasswordView } from "@/components/workout/reset-password-view";

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ResetPasswordView token={token} />;
}
