import type { RollPurpose } from "./roll-runtime";

// Presentation scope only. Combat records and their runtime rules remain intact.
export const TABLETOP_ROLL_PURPOSES = ["free", "attribute", "skill", "ability", "other"] as const satisfies readonly RollPurpose[];

export function isTabletopReferenceRoll(roll: {
  purposeKind: RollPurpose;
  encounterId: number | null;
  pendingActionId: number | null;
  reactionId: number | null;
}): boolean {
  return roll.encounterId === null
    && roll.pendingActionId === null
    && roll.reactionId === null
    && roll.purposeKind !== "attack"
    && roll.purposeKind !== "defense";
}
