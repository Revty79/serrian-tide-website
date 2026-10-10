"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { GuidedField } from "@/components/field-guidance";

export function RecoveryCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/auth/recover-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (!response.ok) {
        setError(response.status === 429 ? "Too many attempts. Wait one minute before trying again." : response.status === 400 ? "This recovery code is invalid or has already been used. Try another saved code." : "Unable to start password recovery. Please try again.");
        return;
      }
      const result: { token?: unknown } = await response.json();
      if (typeof result.token !== "string") { setError("Unable to start password recovery. Please try again."); return; }
      setCode("");
      router.replace(`/reset-password?token=${encodeURIComponent(result.token)}`);
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return <form className="mt-8 space-y-5" onSubmit={submit}>
    <GuidedField label="Recovery code" help="Enter one of the password recovery codes you previously generated in Profile. Spaces and hyphens are optional. A valid code proves account ownership and can be used once.">
      <input name="recoveryCode" type="text" className="st-control w-full" autoComplete="off" autoCapitalize="none" spellCheck={false} value={code} onChange={(event) => setCode(event.target.value)} maxLength={128} required disabled={pending} />
    </GuidedField>
    <p className="text-sm text-slate-400">After using a code, you have ten minutes to set a new password. If you lose the reset page, use another saved code.</p>
    {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
    <button type="submit" className="st-button is-primary w-full" disabled={pending}>{pending ? "Checking code..." : "Continue to reset password"}</button>
    <p className="text-sm text-slate-400">Recovery codes must be saved in Profile before you forget your password. If you have no saved codes and cannot sign in, the server owner will need to help restore access.</p>
    <p className="text-center"><Link href="/login" className="text-sm text-amber-200">Return to sign in</Link></p>
  </form>;
}
