import { AuthShell } from "@/components/auth-shell";
import { ForgotForm } from "./forgot-form";

export default function ForgotPage() {
  return (
    <AuthShell title="Forgot your password?" blurb="Enter your email and we'll send you a link to choose a new one.">
      <ForgotForm />
    </AuthShell>
  );
}
