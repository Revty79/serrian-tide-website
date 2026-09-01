import "server-only";

import type { MechanicalEffectPlan } from "@/features/mechanical-effects";

import {
  applyConditionInTransaction,
  applyModifierInTransaction,
  type ActiveEffectsTransaction,
} from "./active-effects-service";
import type { ActiveEffectDuration } from "./active-effects";
import { persistActiveHealthStateInTransaction } from "./active-health-service";
import type { ActiveHealthAnatomy } from "./models";

export type PersistedMechanicalEffectIdentity =
  | { kind: "condition"; id: number; characterId: number; duration: ActiveEffectDuration }
  | { kind: "modifier"; id: number; characterId: number; duration: ActiveEffectDuration };

export type PersistedMechanicalEffectObserver = (
  effect: PersistedMechanicalEffectIdentity,
) => Promise<void>;

export async function persistPlannedMechanicalEffectInTransaction(
  tx: ActiveEffectsTransaction,
  input: {
    plan: MechanicalEffectPlan;
    targetCharacterId: number;
    sourceEffectKey: string;
    targetAnatomy?: ActiveHealthAnatomy | null;
  },
): Promise<PersistedMechanicalEffectIdentity | null> {
  const { plan } = input;
  if (plan.status !== "ready" || !plan.effect || !plan.source) {
    throw new Error("Mechanical Effect is not ready for persistence.");
  }
  if (plan.effect.kind === "health.heal" || plan.effect.kind === "health.damage") {
    if (!input.targetAnatomy || !plan.healthResult) {
      throw new Error("Health Mechanical Effect lost its authoritative anatomy or result.");
    }
    await persistActiveHealthStateInTransaction(tx, input.targetAnatomy, plan.healthResult.nextState);
    return null;
  }
  if (plan.effect.kind === "condition.apply") {
    const created = await applyConditionInTransaction(tx, { characterId: input.targetCharacterId, effect: plan.effect, source: plan.source, sourceEffectKey: input.sourceEffectKey });
    return { kind: "condition", id: created.id, characterId: created.characterId, duration: created.duration };
  }
  if (plan.effect.kind === "modifier.apply") {
    const created = await applyModifierInTransaction(tx, { characterId: input.targetCharacterId, effect: plan.effect, source: plan.source, sourceEffectKey: input.sourceEffectKey });
    return { kind: "modifier", id: created.id, characterId: created.characterId, duration: created.duration };
  }
  throw new Error("Manual Mechanical Effects do not persist automatically.");
}
