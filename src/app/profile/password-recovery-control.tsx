"use client";

import { useState, useTransition, type FormEvent } from "react";
import { PasswordInput } from "@/components/password-input";
import { generatePasswordRecoveryCodes } from "./actions";
import styles from "./password-recovery.module.css";

export function PasswordRecoveryControl({ remainingCodes, accountLabel }: { remainingCodes: number; accountLabel: string }) {
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [remaining, setRemaining] = useState(remainingCodes);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();

  function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError("");
    setFeedback("");
    startTransition(async () => {
      try {
        const result = await generatePasswordRecoveryCodes(password);
        if (!result.ok) { setError(result.message); return; }
        setCodes(result.codes);
        setRemaining(result.codes.length);
        setPassword("");
      } catch {
        setError("Unable to generate recovery codes. Please try again.");
      }
    });
  }

  function savedText() {
    return `Serrian Tide password recovery codes\nAccount: ${accountLabel}\n\nKeep these private and save them somewhere you can access if you forget your password.\nUse one code at Forgot your password? on the sign-in page.\nEach code works once. Replacing codes or completing a password reset invalidates this set.\n\n${codes.join("\n")}\n`;
  }

  async function copy() {
    try { await navigator.clipboard.writeText(savedText()); setFeedback("Recovery codes copied."); }
    catch { setFeedback("Select and copy the codes below, or use Download codes."); }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([savedText()], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "serrian-tide-recovery-codes.txt";
    anchor.click();
    URL.revokeObjectURL(url);
    setFeedback("Recovery codes downloaded.");
  }

  return <div className={styles.content}>
    <p>Save recovery codes so you can reset a forgotten password yourself. You will not need email delivery or an administrator.</p>
    <p role="status">{remaining ? `${remaining} unused recovery codes are available.` : "You have no saved recovery codes. Generate and save a set before you need to recover your account."}</p>
    <p>Each code works once. Generating a new set replaces the old codes. After resetting your password, sign in and save a fresh set.</p>
    <form onSubmit={generate} className={styles.form}>
      <div className="st-field">
        <label htmlFor="recovery-current-password">Current password</label>
        <PasswordInput id="recovery-current-password" name="currentPassword" label="current password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} maxLength={128} disabled={pending} required aria-describedby="recovery-password-help" />
        <span id="recovery-password-help" className={styles.help}>Confirm your account password to create or replace your recovery codes.</span>
      </div>
      <button type="submit" disabled={pending} className="st-button is-primary">{pending ? "Generating codes..." : remaining ? "Generate new recovery codes" : "Generate recovery codes"}</button>
    </form>
    {error ? <div role="alert" className={styles.error}>{error}</div> : null}
    {codes.length ? <div className={styles.saved}>
      <h3>Save these codes now</h3>
      <p>The full codes are shown only here. Keep them private and store them outside this account, such as in a password manager or a printed copy.</p>
      <ol className={styles.codes} aria-label="New password recovery codes">{codes.map((code) => <li key={code}><code>{code}</code></li>)}</ol>
      <div className={styles.actions}>
        <button type="button" className="st-button" onClick={copy}>Copy codes</button>
        <button type="button" className="st-button" onClick={download}>Download codes</button>
        <button type="button" className="st-button" onClick={() => { setCodes([]); setFeedback("Recovery codes hidden. Use your saved copy if you need them."); }}>I saved my codes</button>
      </div>
    </div> : null}
    {feedback ? <div role="status">{feedback}</div> : null}
  </div>;
}
