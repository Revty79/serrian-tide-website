import "server-only";

import type { MechanicalEffectPlan } from "@/features/mechanical-effects";

import {
  applyConditionInTransaction,
  applyModifierInTransaction,
  type ActiveEffectsTransaction,
} from "./active-effects-service";
import { persistActiveHealthStateInTransaction } from "./active-health-service";
import type { ActiveHealthAnatomy } from "./models";

export async function persistPlannedMechanicalEffectInTransaction(
  tx: ActiveEffectsTransaction,
  input: {
    plan: MechanicalEffectPlan;
    targetCharacterId: number;
    sourceEffectKey: string;
    targetAnatomy?: ActiveHealthAnatomy | null;
  },
): Promise<void> {
  const { plan } = input;
  if (plan.status !== "ready" || !plan.effect || !plan.source) {
    throw new Error("Mechanical Effect is not ready for persistence.");
  }
  if (plan.effect.kind === "health.heal" || plan.effect.kind === "health.damage") {
    if (!input.targetAnatomy || !plan.healthResult) {
      throw new Error("Health Mechanical Effect lost its authoritative anatomy or result.");
    }
    await persistActiveHealthStateInTransaction(tx, input.targetAnatomy, plan.healthResult.nextState);
    return;
  }
  if (plan.effect.kind === "condition.apply") {
    await applyConditionInTransaction(tx, { characterId: input.targetCharacterId, effect: plan.effect, source: plan.source, sourceEffectKey: input.sourceEffectKey });
    return;
  }
  if (plan.effect.kind === "modifier.apply") {
    await applyModifierInTransaction(tx, { characterId: input.targetCharacterId, effect: plan.effect, source: plan.source, sourceEffectKey: input.sourceEffectKey });
    return;
  }
  throw new Error("Manual Mechanical Effects do not persist automatically.");
}
