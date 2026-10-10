import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { verifyPassword } from "better-auth/crypto";
import { and, count, eq, gt, like } from "drizzle-orm";
import { db } from "@/db";
import { account, session, user, verification } from "@/db/auth-schema";
import { passwordRecoveryCode } from "@/db/password-recovery-schema";
import { publishLiveSessionRevocationInTransaction } from "./live-session-revocation";

export const PASSWORD_RESET_LIFETIME_SECONDS = 10 * 60;
export const PASSWORD_RECOVERY_CODE_COUNT = 8;
const resetPrefix = "reset-password:";

/** Shared with Better Auth: the database stores a hash, never the usable link token. */
export function passwordResetIdentifier(identifier: string): string {
  return `${resetPrefix}${createHash("sha256").update(identifier).digest("hex")}`;
}

function recoveryCodeHash(code: string): string {
  return createHash("sha256").update(`serrian-tide-password-recovery:${code}`).digest("hex");
}

export async function countPasswordRecoveryCodes(userId: string): Promise<number> {
  const [result] = await db.select({ value: count() }).from(passwordRecoveryCode).where(eq(passwordRecoveryCode.userId, userId));
  return result.value;
}

/** Reauthorize the signed-in owner and their current password while replacing the codes. */
export async function replacePasswordRecoveryCodes(userId: string, sessionId: string, currentPassword: string): Promise<string[]> {
  if (!currentPassword || currentPassword.length > 128) throw new Error("Enter your current password.");
  const codes = Array.from({ length: PASSWORD_RECOVERY_CODE_COUNT }, () => randomBytes(16).toString("hex"));
  await db.transaction(async (tx) => {
    const [owner] = await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");
    if (!owner) throw new Error("This account no longer exists.");
    const [activeSession] = await tx.select({ id: session.id }).from(session).where(and(eq(session.id, sessionId), eq(session.userId, userId), gt(session.expiresAt, new Date())));
    if (!activeSession) throw new Error("Sign in again to generate recovery codes.");
    const [credential] = await tx.select({ password: account.password }).from(account).where(and(eq(account.userId, userId), eq(account.providerId, "credential"), eq(account.issuer, "local:credential"))).for("update");
    if (!credential?.password || !await verifyPassword({ password: currentPassword, hash: credential.password })) {
      throw new Error("Your current password is incorrect.");
    }
    await tx.delete(passwordRecoveryCode).where(eq(passwordRecoveryCode.userId, userId));
    await tx.delete(verification).where(and(eq(verification.value, userId), like(verification.identifier, `${resetPrefix}%`)));
    await tx.insert(passwordRecoveryCode).values(codes.map((code) => ({ userId, codeHash: recoveryCodeHash(code) })));
  });
  return codes.map((code) => code.match(/.{8}/g)!.join("-"));
}

/** Exchange a saved code for a short-lived token accepted by Better Auth's reset endpoint. */
export async function redeemPasswordRecoveryCode(rawCode: string): Promise<string | null> {
  const code = rawCode.replace(/[\s-]/g, "").toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(code)) return null;
  const codeHash = recoveryCodeHash(code);

  return db.transaction(async (tx) => {
    const [saved] = await tx.select({ userId: passwordRecoveryCode.userId }).from(passwordRecoveryCode).where(eq(passwordRecoveryCode.codeHash, codeHash));
    if (!saved) return null;
    // Lock the owner first, matching replacement and recovery completion, so races cannot revive old codes.
    const [owner] = await tx.select({ id: user.id }).from(user).where(eq(user.id, saved.userId)).for("update");
    if (!owner) return null;
    const [consumed] = await tx.delete(passwordRecoveryCode).where(eq(passwordRecoveryCode.codeHash, codeHash)).returning({ userId: passwordRecoveryCode.userId });
    if (!consumed) return null;
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_LIFETIME_SECONDS * 1000);
    await tx.delete(verification).where(and(eq(verification.value, owner.id), like(verification.identifier, `${resetPrefix}%`)));
    await tx.insert(verification).values({
      id: randomUUID(),
      identifier: passwordResetIdentifier(`${resetPrefix}${token}`),
      value: owner.id,
      expiresAt,
    });
    return token;
  });
}

/** End sessions and notify live connections together, after Better Auth updates the password. */
export async function finishPasswordRecovery(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");
    await tx.delete(passwordRecoveryCode).where(eq(passwordRecoveryCode.userId, userId));
    await tx.delete(verification).where(and(eq(verification.value, userId), like(verification.identifier, `${resetPrefix}%`)));
    await tx.delete(session).where(eq(session.userId, userId));
    await publishLiveSessionRevocationInTransaction(tx, userId);
  });
}
