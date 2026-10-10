import type { Metadata } from "next";
import { AuthCard } from "@/components/auth-card";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Reset password | Serrian Tide", referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: {
  searchParams: Promise<{ token?: string | string[]; error?: string | string[] }>;
}) {
  const query = await searchParams;
  const token = typeof query.token === "string" && query.token.length <= 256 ? query.token : undefined;

  return (
    <AuthCard title="Choose a new password" description="Set a new password for your Serrian Tide account.">
      <ResetPasswordForm token={token} invalidLink={Boolean(query.error) || !token} />
    </AuthCard>
  );
}
