import type { ActionEffectPlanView } from "@/features/tabletop-operations/action-effect-plan-service";
import { ordinaryDamageCalculation } from "./result-summary";
import { storedIncomingResolution } from "@/features/incoming-effects/effect-proposal";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function isOrdinaryAttackReport(plan: Pick<ActionEffectPlanView, "sourceKind" | "sourceSnapshot">) {
  return ["weapon", "creature-attack"].includes(plan.sourceKind) && !plan.sourceSnapshot.identity.startsWith("firearm-attack:");
}

export function isSpellResultReport(plan: Pick<ActionEffectPlanView, "sourceKind" | "status" | "effects">) {
  if (plan.sourceKind !== "spell") return false;
  if (plan.effects.some((effect) => typeof effect.effectKey === "string" && effect.effectKey.startsWith("spell-combat-recovery:"))) return false;
  return ["calculated", "approved", "application-failed"].includes(plan.status)
    && !plan.effects.every((effect) => effect.effectType === "spell.area-report");
}

/** Display the owning engine's recorded proposal; do not calculate damage here. */
export function attackReportTarget(effect: ActionEffectPlanView["effects"][number]) {
  const authored = object(effect.authoredValue), final = object(effect.finalValue);
  const application = object(final.application ?? authored.application), ordinary = object(application.ordinaryAttack);
  const calculated = object(effect.calculatedValue), roll = object(authored.roll);
  const incoming = storedIncomingResolution(effect.authoredValue), applied = object(final.effect);
  const unresolved = incoming?.status === "requires-god-ruling" && effect.status === "requires-god-ruling";
  return {
    name: effect.targetName,
    location: typeof ordinary.locationName === "string" ? ordinary.locationName : "Location needs a ruling",
    locationNumber: typeof application.hitLocationNumber === "number" ? application.hitLocationNumber : null,
    damage: unresolved ? null : effect.status === "declined" || applied.kind === "health.heal" ? 0 : typeof applied.amount === "number" ? applied.amount : null,
    healing: !unresolved && applied.kind === "health.heal" && typeof applied.amount === "number" ? applied.amount : null,
    suggestedDamage: incoming ? null : typeof calculated.netDamage === "number" ? calculated.netDamage : null,
    outcome: roll.succeeded === false ? "Miss" : unresolved ? "G.O.D. ruling required" : effect.status === "declined" ? "No damage" : applied.kind === "health.heal" ? "Absorbed as healing" : "Hit",
    explanation: effect.status === "declined" ? effect.amendmentReason : "",
    calculation: !incoming && roll.succeeded !== false ? ordinaryDamageCalculation(calculated) : null,
    questions: Array.isArray(ordinary.issues) ? ordinary.issues.filter((entry): entry is string => typeof entry === "string") : [],
  };
}

export function attackReportSignature(plan: ActionEffectPlanView) {
  return JSON.stringify([plan.id, plan.status, plan.effects.map((effect) => [effect.id, effect.status, effect.finalValue, effect.amendmentReason])]);
}
