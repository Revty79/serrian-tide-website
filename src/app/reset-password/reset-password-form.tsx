"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { PasswordInput } from "@/components/password-input";
import { authClient } from "@/lib/auth-client";

export function ResetPasswordForm({ token, invalidLink }: { token?: string; invalidLink: boolean }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState(invalidLink);
  const [complete, setComplete] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || complete || invalid || !token) return;
    setError("");
    if (password.length < 8 || password.length > 128) {
      setError("Use a password between 8 and 128 characters.");
      return;
    }
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setPending(true);
    try {
      const result = await authClient.resetPassword({ token, newPassword: password });
      if (result.error) {
        if (result.error.code === "INVALID_TOKEN") {
          setInvalid(true);
        } else {
          setError("Unable to reset your password. Please try again.");
        }
        return;
      }
      setPassword("");
      setConfirmation("");
      setComplete(true);
      // Keep the used recovery token out of the current address and browser history.
      window.history.replaceState(null, "", "/reset-password");
    } catch {
      setError("Unable to connect. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (complete) return <div className="mt-8 space-y-5 text-center">
    <p role="status" className="text-emerald-300">Your password has been reset. Sign in with your new password. Previous sessions have been signed out. Save new recovery codes in Profile.</p>
    <Link href="/login" className="st-button is-primary">Return to sign in</Link>
  </div>;

  if (invalid) return <div className="mt-8 space-y-5 text-center">
    <p role="alert" className="text-red-300">This reset link is missing, expired, or has already been used. Request a new link.</p>
    <Link href="/forgot-password" className="st-button is-primary">Get help resetting your password</Link>
    <p><Link href="/login" className="text-sm text-amber-200">Return to sign in</Link></p>
  </div>;

  return <form onSubmit={submit} className="mt-8 space-y-5">
    <div className="st-field">
      <label htmlFor="new-password">New password</label>
      <PasswordInput id="new-password" name="newPassword" label="new password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} maxLength={128} required disabled={pending} aria-describedby="new-password-rules" />
      <p id="new-password-rules" className="text-sm text-slate-400">Use 8 to 128 characters. Show lets you check what you typed.</p>
    </div>
    <div className="st-field">
      <label htmlFor="confirm-new-password">Confirm new password</label>
      <PasswordInput id="confirm-new-password" name="confirmPassword" label="confirmation password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={8} maxLength={128} required disabled={pending} aria-describedby="confirm-password-help" />
      <p id="confirm-password-help" className="text-sm text-slate-400">Enter the same new password again.</p>
    </div>
    <p className="text-sm text-slate-400">Resetting your password signs out your existing sessions and invalidates your old recovery codes. Save a new set in Profile after signing in.</p>
    {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
    <button type="submit" disabled={pending} className="st-button is-primary w-full">{pending ? "Resetting password..." : "Reset password"}</button>
    <p className="text-center"><Link href="/login" className="text-sm text-amber-200">Return to sign in</Link></p>
  </form>;
}
