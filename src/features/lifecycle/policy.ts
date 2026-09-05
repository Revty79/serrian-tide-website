import {
  LIFECYCLE_ENTITY_KINDS,
  type LifecycleActor,
  type LifecycleEntityKind,
  type LifecycleTargetInput,
} from "./types";

export const PERMANENT_DELETION_ENVIRONMENT_VARIABLE =
  "SERRIAN_TIDE_ENABLE_PERMANENT_DELETION";

export type PermanentDeletionEnvironment = {
  NODE_ENV?: string;
  SERRIAN_TIDE_ENABLE_PERMANENT_DELETION?: string;
};

export function isPermanentDeletionEnabled(
  environment: PermanentDeletionEnvironment = process.env,
): boolean {
  return environment.NODE_ENV !== "production"
    || environment.SERRIAN_TIDE_ENABLE_PERMANENT_DELETION === "true";
}

export function assertPermanentDeletionEnabled(
  environment: PermanentDeletionEnvironment = process.env,
): void {
  if (!isPermanentDeletionEnabled(environment)) {
    throw new Error(
      `Permanent deletion is disabled in production by recovery protection. Set ${PERMANENT_DELETION_ENVIRONMENT_VARIABLE}=true on the server only after recovery has been proven.`,
    );
  }
}

export function isLifecycleEntityKind(value: unknown): value is LifecycleEntityKind {
  return typeof value === "string"
    && (LIFECYCLE_ENTITY_KINDS as readonly string[]).includes(value);
}

export function parseLifecycleTarget(input: LifecycleTargetInput): LifecycleTargetInput {
  if (!input || !isLifecycleEntityKind(input.entityKind)) {
    throw new Error("A supported lifecycle entity type is required.");
  }
  if (!Number.isInteger(input.entityId) || input.entityId <= 0) {
    throw new Error("A saved lifecycle record must be selected.");
  }
  return { entityKind: input.entityKind, entityId: input.entityId };
}

export function normalizeLifecycleReason(reason?: string): string {
  const normalized = reason?.trim() ?? "";
  if (normalized.length > 1000) {
    throw new Error("Lifecycle reasons cannot exceed 1,000 characters.");
  }
  return normalized;
}

export function isLifecycleActor(actor: LifecycleActor): boolean {
  return actor.roles.includes("god") || actor.roles.includes("admin");
}

export function isAdministrator(actor: LifecycleActor): boolean {
  return actor.roles.includes("admin");
}

export function canManageOwnedRoot(
  actor: LifecycleActor,
  ownerUserId: string | null,
): boolean {
  return isLifecycleActor(actor)
    && (isAdministrator(actor) || ownerUserId === actor.userId);
}

export function isProtectedSharedRoot(input: {
  createdByUserId: string | null;
  sourceSystem: string | null;
}): boolean {
  return input.createdByUserId === null || Boolean(input.sourceSystem?.trim());
}

export function canManageSharedRoot(
  actor: LifecycleActor,
  input: { createdByUserId: string | null; sourceSystem: string | null },
): boolean {
  return !isProtectedSharedRoot(input)
    && canManageOwnedRoot(actor, input.createdByUserId);
}

export function assertOwnedRootManager(
  actor: LifecycleActor,
  ownerUserId: string | null,
  label: string,
): void {
  if (!isLifecycleActor(actor)) {
    throw new Error("G.O.D. or administrator access is required.");
  }
  if (!canManageOwnedRoot(actor, ownerUserId)) {
    throw new Error(`Only the ${label} creator or an administrator can manage it.`);
  }
}

export function assertSharedRootManager(
  actor: LifecycleActor,
  input: { createdByUserId: string | null; sourceSystem: string | null },
  label: string,
): void {
  if (!isLifecycleActor(actor)) {
    throw new Error("G.O.D. or administrator access is required.");
  }
  if (isProtectedSharedRoot(input)) {
    throw new Error(
      `${label} is canonical, imported, system-owned, or has ambiguous legacy ownership and is protected from ordinary lifecycle changes.`,
    );
  }
  if (!canManageSharedRoot(actor, input)) {
    throw new Error(`Only the ${label} creator or an administrator can manage it.`);
  }
}

export function assertExactConfirmation(
  expectedName: string,
  confirmationName?: string,
): void {
  if (confirmationName !== expectedName) {
    throw new Error(`Type the exact name \"${expectedName}\" to confirm permanent deletion.`);
  }
}
