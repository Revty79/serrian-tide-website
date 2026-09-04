import {
  PERCENTILE_NUMERIC_BOUND,
  PERCENTILE_ROLL_LABEL,
  validateRollResult,
} from "./percentile-resolution";

export const ROLL_METHODS = ["random", "entered"] as const;
export const ROLL_VISIBILITIES = ["table", "god-only"] as const;
export const ROLL_PURPOSES = ["free", "attribute", "skill", "attack", "defense", "ability", "other"] as const;
export const ROLL_STATUSES = ["recorded", "voided"] as const;

export { PERCENTILE_ROLL_LABEL, validateRollResult } from "./percentile-resolution";

export type RollMethod = (typeof ROLL_METHODS)[number];
export type RollVisibility = (typeof ROLL_VISIBILITIES)[number];
export type RollPurpose = (typeof ROLL_PURPOSES)[number];
export type RollStatus = (typeof ROLL_STATUSES)[number];

export type RollRandomSource = (minimumInclusive: number, maximumExclusive: number) => number;

export type RollOutcome = { resultTotal: number };

export type RollRecordRequest = {
  sessionId: number;
  sceneId?: number | null;
  encounterId?: number | null;
  rollerCharacterId?: number | null;
  targetCharacterId?: number | null;
  pendingActionId?: number | null;
  reactionId?: number | null;
  method: RollMethod;
  visibility: RollVisibility;
  purposeKind: RollPurpose;
  enteredTotal?: number | null;
  label?: string;
  targetNumber?: number | null;
  notes?: string;
};

export type NormalizedRollRecordRequest = Omit<RollRecordRequest, "label" | "notes"> & {
  sceneId: number | null;
  encounterId: number | null;
  rollerCharacterId: number | null;
  targetCharacterId: number | null;
  pendingActionId: number | null;
  reactionId: number | null;
  enteredTotal: number | null;
  label: string;
  targetNumber: number | null;
  notes: string;
};

function hasValue<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function positiveId(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} is invalid.`);
  return value;
}

function optionalPositiveId(value: number | null | undefined, label: string): number | null {
  return value === null || value === undefined ? null : positiveId(value, label);
}

function boundedText(value: string | undefined, label: string, maximum: number): string {
  const normalized = (value ?? "").trim();
  if (normalized.length > maximum) throw new Error(`${label} must be ${maximum} characters or fewer.`);
  return normalized;
}

export function getHitLocationFromPercentile(resultTotal: number): number {
  return validateRollResult(resultTotal) % 10;
}

export function generateRandomRoll(randomSource: RollRandomSource): RollOutcome {
  const resultTotal = randomSource(1, 101);
  if (!Number.isInteger(resultTotal) || resultTotal < 1 || resultTotal > 100) {
    throw new Error(`The secure Roll source returned an invalid ${PERCENTILE_ROLL_LABEL} result.`);
  }
  return { resultTotal };
}

export function resolveRollOutcome(
  request: NormalizedRollRecordRequest,
  randomSource: RollRandomSource,
): RollOutcome {
  if (request.method === "random") {
    if (request.enteredTotal !== null) {
      throw new Error("A System Random Roll cannot accept a browser-supplied result.");
    }
    return generateRandomRoll(randomSource);
  }
  if (request.enteredTotal === null) throw new Error("Enter the physical percentile result.");
  return { resultTotal: validateRollResult(request.enteredTotal) };
}

export function normalizeRollRecordRequest(request: RollRecordRequest): NormalizedRollRecordRequest {
  if (!hasValue(ROLL_METHODS, request.method)) throw new Error("Roll method is invalid.");
  if (!hasValue(ROLL_VISIBILITIES, request.visibility)) throw new Error("Roll visibility is invalid.");
  if (!hasValue(ROLL_PURPOSES, request.purposeKind)) throw new Error("Roll purpose is invalid.");
  const sceneId = optionalPositiveId(request.sceneId, "Scene");
  const encounterId = optionalPositiveId(request.encounterId, "Encounter");
  const pendingActionId = optionalPositiveId(request.pendingActionId, "Pending Action");
  const reactionId = optionalPositiveId(request.reactionId, "Reaction");
  if (encounterId !== null && sceneId === null) throw new Error("An Encounter-scoped Roll requires its Scene context.");
  if ((pendingActionId !== null || reactionId !== null) && encounterId === null) {
    throw new Error("Action and Reaction Rolls require an Encounter context.");
  }
  const targetNumber = request.targetNumber === null || request.targetNumber === undefined
    ? null
    : request.targetNumber;
  if (
    targetNumber !== null
    && (!Number.isFinite(targetNumber) || Math.abs(targetNumber) > PERCENTILE_NUMERIC_BOUND)
  ) {
    throw new Error("Target Number must be a finite table reference value.");
  }
  const enteredTotal = request.enteredTotal === null || request.enteredTotal === undefined
    ? null
    : request.enteredTotal;
  return {
    ...request,
    sessionId: positiveId(request.sessionId, "Session"),
    sceneId,
    encounterId,
    rollerCharacterId: optionalPositiveId(request.rollerCharacterId, "Roller Character"),
    targetCharacterId: optionalPositiveId(request.targetCharacterId, "Target Character"),
    pendingActionId,
    reactionId,
    enteredTotal,
    label: boundedText(request.label, "Roll label", 200),
    targetNumber,
    notes: boundedText(request.notes, "Roll notes", 2000),
  };
}

export function normalizeVoidReason(reason: string): string {
  const normalized = boundedText(reason, "Void reason", 500);
  if (!normalized) throw new Error("A nonblank reason is required to void a Roll.");
  return normalized;
}

export type RollReadActor = "god-owner" | "player";

export function canReadRollVisibility(actor: RollReadActor, visibility: RollVisibility): boolean {
  return actor === "god-owner" || visibility === "table";
}

export function readableRollVisibilities(actor: RollReadActor): RollVisibility[] {
  return actor === "god-owner" ? ["table", "god-only"] : ["table"];
}
