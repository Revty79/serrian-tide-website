import type { ActionEffectRowView } from "@/features/tabletop-operations/action-effect-plan-service";
import type { RollLedgerEntry } from "@/features/tabletop-operations/roll-runtime-service";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Format recorded evidence only; never recalculate or infer a hit from a roll number. */
export function combatRollSummary(roll: Pick<RollLedgerEntry, "effectiveMechanicalSnapshot" | "effectiveResultTotal" | "status">) {
  const result = roll.effectiveMechanicalSnapshot?.resolution;
  if (!result) return `Roll ${roll.effectiveResultTotal}${roll.status === "voided" ? " (voided)" : ""}`;
  return `Roll ${result.resultTotal} against roll-over target ${result.finalTarget}: ${result.succeeded ? "success" : "failure"}; ${result.additionalSuccesses} extra successes${result.requiresGodRuling ? "; critical ruling required" : ""}${roll.status === "voided" ? " (voided)" : ""}`;
}

export function combatEffectSummary(effect: Pick<ActionEffectRowView, "effectType" | "status" | "authoredValue" | "calculatedValue" | "finalValue" | "amendmentReason">, mayReadMechanics: boolean) {
  const final = object(effect.finalValue);
  const amount = typeof effect.finalValue === "number" ? effect.finalValue : typeof final.netDamage === "number" ? final.netDamage : object(final.effect).amount;
  const applied = effect.status === "applied";
  if (effect.effectType !== "health.damage") return `${effect.effectType.replaceAll(".", " ")}: ${effect.status.replaceAll("-", " ")}${typeof amount === "number" ? ` (${amount})` : ""}`;
  const authored = object(effect.authoredValue), application = object(final.application ?? authored.application);
  const calculated = object(effect.calculatedValue), ordinary = object(application.ordinaryAttack), roll = object(authored.roll);
  const location = mayReadMechanics && typeof ordinary.locationName === "string" ? ` to ${ordinary.locationName}` : "";
  let summary = applied ? `${typeof amount === "number" ? amount : "Recorded"} damage applied${location}.`
    : effect.status === "declined" ? "No damage applied."
    : `${typeof amount === "number" ? amount + " damage" : "Damage"} pending${location}.`;
  if (!mayReadMechanics) return summary;
  if (effect.status === "declined") summary = roll.succeeded === false ? "Miss - no damage applied."
    : effect.amendmentReason || "No damage applied; see the recorded ruling.";
  // A failed attack never delivered the calculated potential hit.
  if (roll.succeeded !== false && ["baseDamage", "extraSuccesses", "armor", "soak", "netDamage"].every((key) => typeof calculated[key] === "number")) {
    summary += ` Damage calculation: ${calculated.baseDamage} base + ${calculated.extraSuccesses} extra successes - ${calculated.armor} armor - ${calculated.soak} soak = ${calculated.netDamage}.`;
  }
  return summary;
}
