import "server-only";
import { assertCombatWritableInTransaction } from "@/features/tabletop-operations/combat-freeze-service";
import { readActionEffectWorkspaceInTransaction, ruleIncomingActionEffectInTransaction, confirmActionEffectRulingInTransaction } from "@/features/tabletop-operations/action-effect-plan-service";
import type { RuntimeIntegrationTransaction, OwnedEncounterRuntimeContext } from "@/features/tabletop-operations/runtime-integration-service";
import type { ActionDeclarationActor } from "@/features/tabletop-operations/action-declaration-service";
import { attackReportSignature } from "./attack-report";
import { isItemResultReport, itemEffectReview } from "./item-report";

/** Coordinates the existing ruling/application services; never supplies damage values. */
export async function reviewCombatItemReportInTransaction(tx: RuntimeIntegrationTransaction, context: OwnedEncounterRuntimeContext,
  actor: ActionDeclarationActor, planId: number, signature: string,
  action: { kind: "locations"; locations: Record<string, number> } | { kind: "apply" }) {
  if (actor.authority !== "god-owner" || actor.userId !== context.ownerUserId) throw new Error("Only the campaign's G.O.D. may finish Item results.");
  await assertCombatWritableInTransaction(tx, context.encounterId);
  const plan = (await readActionEffectWorkspaceInTransaction(tx, context)).plans.find((entry) => entry.id === planId);
  if (!plan || plan.sourceKind !== "item") throw new Error("That Item result is unavailable.");
  if (plan.status === "applied") return { planId, status: "applied" as const };
  if (!isItemResultReport(plan) || attackReportSignature(plan) !== signature) throw new Error("This Item result changed. Review the refreshed result before continuing.");
  if (action.kind === "locations") {
    const choices = Object.entries(action.locations);
    if (!choices.length) throw new Error("Choose the missing damage locations first.");
    for (const [effectId, location] of choices) {
      const effect = plan.effects.find((entry) => entry.id === Number(effectId));
      if (!effect || !itemEffectReview(effect).needsLocation || !Number.isInteger(location)
        || !itemEffectReview(effect).locations.some((entry) => entry.number === location)) throw new Error("Choose a listed location for each unfinished target.");
      await ruleIncomingActionEffectInTransaction(tx, context, actor, plan.id, effect.id, {
        disposition: "location", hitLocationNumber: location,
        reason: `G.O.D. selected ${itemEffectReview(effect).locations.find((entry) => entry.number === location)!.name} for ${effect.targetName}'s Item effect. Calculate damage using the recorded rules.`,
      });
    }
    return { planId, status: "locations-recorded" as const };
  }
  if (action.kind !== "apply") throw new Error("Choose a supported Item review action.");
  if (plan.effects.some((effect) => itemEffectReview(effect).blocked)) throw new Error("Resolve the highlighted target decisions before applying this Item. No additional Charges were spent.");
  const status = await confirmActionEffectRulingInTransaction(tx, context, actor, plan.id, "G.O.D. reviewed and confirmed the remaining Item effects shown in the result report.");
  return { planId, status };
}
