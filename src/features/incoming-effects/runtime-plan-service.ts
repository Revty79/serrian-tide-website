import "server-only";
import type { db } from "@/db";
import { planMechanicalEffect, type MechanicalEffectPlan, type MechanicalEffectApplication, type MechanicalEffectHealthContext, type MechanicalEffect } from "@/features/mechanical-effects";
import type { FrozenActionSourceSnapshot } from "@/features/tabletop-operations/action-effect-bridge";
import { resolveIncomingEffectProposal, incomingObject, storedIncomingResolution } from "./effect-proposal";
import { readIncomingEffectRuntimeTargetInTransaction } from "./incoming-effect-target-service";
import type { IncomingEffectTarget } from "./models";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Used by the existing authorized sheet runtimes. Sequential effects share the
 * projected Health state, including prevention and capped Absorption healing. */
export async function resolveRuntimeMechanicalPlansInTransaction(tx: Tx, input: {
  campaignId: number;
  source: Pick<FrozenActionSourceSnapshot, "kind" | "authoredData" | "incomingSourceFacts" | "displayName">;
  entries: Array<{ plan: MechanicalEffectPlan; targetId: number; application: MechanicalEffectApplication }>;
  health: ReadonlyMap<number, MechanicalEffectHealthContext>;
}): Promise<MechanicalEffectPlan[]> {
  const states = new Map(input.health), targets = new Map<string, IncomingEffectTarget>(), plans: MechanicalEffectPlan[] = [];
  for (const entry of input.entries) {
    const effect = entry.plan.effect;
    if (!effect || effect.kind === "manual" || entry.plan.status === "invalid") { plans.push(entry.plan); continue; }
    if (effect.kind === "health.heal") {
      const health = states.get(entry.targetId);
      const healing = planMechanicalEffect({ effect, source: entry.plan.source, application: entry.application, health });
      if (health && healing.healthResult) states.set(entry.targetId, { ...health, state: healing.healthResult.nextState });
      plans.push(healing); continue;
    }
    const targetKey = `${entry.targetId}:${effect.kind === "health.damage"}`;
    let target = targets.get(targetKey);
    if (!target) { target = await readIncomingEffectRuntimeTargetInTransaction(tx, input.campaignId, entry.targetId, effect.kind === "health.damage"); targets.set(targetKey, target); }
    const proposal = resolveIncomingEffectProposal({ effectKey: String(plans.length), effectType: effect.kind, targetParticipantId: entry.targetId,
      authoredValue: { effect }, calculatedValue: effect, finalValue: { effect, application: entry.application }, unit: "Effect", resource: "",
      applicationSupported: entry.plan.status === "ready", godReviewRequired: false, status: "calculated", amendmentReason: "" }, input.source, target);
    const resolution = storedIncomingResolution(proposal.authoredValue);
    const health = states.get(entry.targetId);
    if (proposal.status === "requires-god-ruling") {
      plans.push({ ...entry.plan, status: "manual", summary: proposal.amendmentReason, healthResult: null, ...(resolution ? { incomingEffect: resolution } : {}) });
      continue;
    }
    if (proposal.status === "declined") {
      plans.push({ ...entry.plan, status: "ready", healthResult: null, summary: resolution?.status === "prevented" ? "The incoming effect was prevented." : "No damage remains after protection.",
        ...(resolution ? { incomingEffect: resolution } : {}) });
      continue;
    }
    const resolvedEffect = incomingObject(proposal.finalValue).effect as MechanicalEffect;
    const plan = planMechanicalEffect({ effect: resolvedEffect, source: entry.plan.source,
      application: incomingObject(incomingObject(proposal.finalValue).application) as MechanicalEffectApplication, health });
    if (resolution) plan.incomingEffect = resolution;
    if (health && plan.healthResult) states.set(entry.targetId, { ...health, state: plan.healthResult.nextState });
    plans.push(plan);
  }
  return plans;
}
