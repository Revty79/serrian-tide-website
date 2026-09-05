import { normalizeLifecycleReason } from "./policy";

export function parseAccountDeletionUserId(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 255) {
    throw new Error("A valid User account must be selected.");
  }
  return value;
}

export function parseRequiredAccountDeletionReason(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("An account-deletion reason is required.");
  }
  const reason = normalizeLifecycleReason(value);
  if (!reason) {
    throw new Error("An account-deletion reason is required.");
  }
  return reason;
}

export function getAccountDeletionConfirmation(email: string): string {
  return `DELETE ${email}`;
}

export function assertExactAccountDeletionConfirmation(
  email: string,
  confirmationText: unknown,
): void {
  const expected = getAccountDeletionConfirmation(email);
  if (confirmationText !== expected) {
    throw new Error(`Type exactly \"${expected}\" to confirm permanent account deletion.`);
  }
}

export function getAccountDeletionProhibitions(input: {
  actingUserId: string;
  targetUserId: string;
  targetIsAdministrator: boolean;
  activeAdministratorCount: number;
}): string[] {
  const prohibitions: string[] = [];
  if (input.targetUserId === input.actingUserId) {
    prohibitions.push("Administrators cannot delete their own account.");
  }
  if (input.targetIsAdministrator && input.activeAdministratorCount <= 1) {
    prohibitions.push("The last administrator account cannot be deleted.");
  }
  return prohibitions;
}
