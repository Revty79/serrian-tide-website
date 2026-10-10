import { AuthCard } from "@/components/auth-card";
import { RecoveryCodeForm } from "./recovery-code-form";

export default function ForgotPasswordPage() {
  return <AuthCard title="Forgot your password?" description="Use a saved recovery code to choose a new password.">
    <RecoveryCodeForm />
  </AuthCard>;
}
