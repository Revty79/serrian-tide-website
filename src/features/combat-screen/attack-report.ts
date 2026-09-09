import type { ActionEffectPlanView } from "@/features/tabletop-operations/action-effect-plan-service";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function isOrdinaryAttackReport(plan: Pick<ActionEffectPlanView, "sourceKind" | "sourceSnapshot">) {
  return ["weapon", "creature-attack"].includes(plan.sourceKind) && !plan.sourceSnapshot.identity.startsWith("firearm-attack:");
}

export function isSpellResultReport(plan: Pick<ActionEffectPlanView, "sourceKind" | "status" | "effects">) {
  return plan.sourceKind === "spell" && ["calculated", "approved", "application-failed"].includes(plan.status)
    && !plan.effects.every((effect) => effect.effectType === "spell.area-report");
}

/** Display the owning engine's recorded proposal; do not calculate damage here. */
export function attackReportTarget(effect: ActionEffectPlanView["effects"][number]) {
  const authored = object(effect.authoredValue), final = object(effect.finalValue);
  const application = object(final.application ?? authored.application), ordinary = object(application.ordinaryAttack);
  const calculated = object(effect.calculatedValue), roll = object(authored.roll);
  return {
    name: effect.targetName,
    location: typeof ordinary.locationName === "string" ? ordinary.locationName : "Location needs a ruling",
    locationNumber: typeof application.hitLocationNumber === "number" ? application.hitLocationNumber : null,
    damage: effect.status === "declined" ? 0 : typeof object(final.effect).amount === "number" ? Number(object(final.effect).amount) : null,
    suggestedDamage: typeof calculated.netDamage === "number" ? calculated.netDamage : null,
    outcome: roll.succeeded === false ? "Miss" : effect.status === "declined" ? "No damage" : "Hit",
    explanation: effect.status === "declined" ? effect.amendmentReason : "",
    calculation: ["baseDamage", "extraSuccesses", "armor", "soak", "netDamage"].every((key) => typeof calculated[key] === "number") && roll.succeeded !== false
      ? `${calculated.baseDamage} base + ${calculated.extraSuccesses} extra successes − ${calculated.armor} armor − ${calculated.soak} soak = ${calculated.netDamage}` : null,
    questions: Array.isArray(ordinary.issues) ? ordinary.issues.filter((entry): entry is string => typeof entry === "string") : [],
  };
}

export function attackReportSignature(plan: ActionEffectPlanView) {
  return JSON.stringify([plan.id, plan.status, plan.effects.map((effect) => [effect.id, effect.status, effect.finalValue, effect.amendmentReason])]);
}
