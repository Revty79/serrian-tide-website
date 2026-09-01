import { RUNTIME_DURATION_KINDS, type RuntimeDuration } from "@/features/mechanical-effects";

export const TABLETOP_BOUND_DURATION_KINDS = [
  "combat-steps",
  "combat-rounds",
  "scene",
] as const;

export type TabletopBoundDurationKind = (typeof TABLETOP_BOUND_DURATION_KINDS)[number];
export type DurationBindingStatus = "active" | "expired" | "closed";
export type DurationEffectKind = "condition" | "modifier";

export type InitiativeDurationPosition = {
  status: "active" | "closed";
  roundNumber: number;
  stepNumber: number;
};

export type InitiativeDurationTransition = {
  combatStepBoundaries: number;
  combatRoundBoundaries: number;
  initiativeClosed: boolean;
};

export function isTabletopBoundDurationKind(
  kind: RuntimeDuration["kind"],
): kind is TabletopBoundDurationKind {
  return TABLETOP_BOUND_DURATION_KINDS.includes(kind as TabletopBoundDurationKind);
}

export function requireFiniteDurationValue(value: number | null | undefined): number {
  if (!Number.isInteger(value) || (value ?? 0) <= 0) {
    throw new Error("A finite runtime duration requires a positive whole remaining value.");
  }
  return value as number;
}

export function getInitiativeDurationTransition(
  before: InitiativeDurationPosition,
  after: InitiativeDurationPosition,
  passage: "elapsed" | "correction" = "elapsed",
): InitiativeDurationTransition {
  if (passage === "correction") {
    return { combatStepBoundaries: 0, combatRoundBoundaries: 0, initiativeClosed: false };
  }
  return {
    combatStepBoundaries: Math.max(0, after.stepNumber - before.stepNumber),
    combatRoundBoundaries: Math.max(0, after.roundNumber - before.roundNumber),
    initiativeClosed: before.status === "active" && after.status === "closed",
  };
}

export function advanceFiniteDuration(
  remainingValue: number,
  boundariesCrossed: number,
): { remainingValue: number; expired: boolean } {
  const remaining = requireFiniteDurationValue(remainingValue);
  if (!Number.isInteger(boundariesCrossed) || boundariesCrossed < 0) {
    throw new Error("Duration advancement requires a nonnegative whole boundary count.");
  }
  const next = Math.max(0, remaining - boundariesCrossed);
  return { remainingValue: next, expired: next === 0 };
}

export function assertDurationVocabularyUnchanged(): void {
  const expected = ["until-removed", "combat-steps", "combat-rounds", "scene"];
  if (RUNTIME_DURATION_KINDS.length !== expected.length
    || RUNTIME_DURATION_KINDS.some((kind, index) => kind !== expected[index])) {
    throw new Error("Build 9 must not change the established runtime duration vocabulary.");
  }
}
