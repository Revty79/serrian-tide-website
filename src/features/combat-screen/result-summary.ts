import type { ActionEffectRowView } from "@/features/tabletop-operations/action-effect-plan-service";
import type { RollLedgerEntry } from "@/features/tabletop-operations/roll-runtime-service";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Format recorded evidence only; never recalculate or infer a hit from a roll number. */
export function combatRollSummary(roll: Pick<RollLedgerEntry, "effectiveMechanicalSnapshot" | "effectiveResultTotal" | "status">) {
  const result = roll.effectiveMechanicalSnapshot?.resolution;
  if (!result) return `Roll ${roll.effectiveResultTotal}${roll.status === "voided" ? " (voided)" : ""}`;
  return `Roll ${result.resultTotal} against roll-over target ${result.finalTarget}: ${result.succeeded ? "success" : "failure"}; ${result.additionalSuccesses} extra successes${result.requiresGodRuling ? "; critical ruling required" : ""}${roll.status === "voided" ? " (voided)" : ""}`;
}

export function combatEffectSummary(effect: Pick<ActionEffectRowView, "effectType" | "status" | "authoredValue" | "calculatedValue" | "finalValue" | "amendmentReason"> & Partial<Pick<ActionEffectRowView, "appliedResult">>, mayReadMechanics: boolean) {
  const final = object(effect.finalValue);
  const amount = typeof effect.finalValue === "number" ? effect.finalValue : typeof final.netDamage === "number" ? final.netDamage : object(final.effect).amount;
  const applied = effect.status === "applied";
  if (effect.effectType === "spell.area-report") {
    const area = object(final.areaReport), kind = object(final.effect).kind;
    return `Area report: ${typeof final.amount === "number" ? `${final.amount} ${kind === "health.damage" ? "damage" : kind === "health.heal" ? "healing" : "effect amount"}` : "authored effect"}${typeof area.shape === "string" ? ` in ${area.shape}` : ""}.${final.failed ? " Casting Roll failed." : ""}${final.critical ? " Critical Roll recorded." : ""} No combatant HP or effects were changed.`;
  }
  if (effect.effectType !== "health.damage") return `${effect.effectType.replaceAll(".", " ")}: ${effect.status.replaceAll("-", " ")}${typeof amount === "number" ? ` (${amount})` : ""}`;
  const authored = object(effect.authoredValue), application = object(final.application ?? authored.application);
  const calculated = object(effect.calculatedValue), ordinary = object(application.ordinaryAttack), roll = object(authored.roll);
  const locationName = ordinary.locationName ?? object(application.spellHitLocation).locationName;
  const location = mayReadMechanics && typeof locationName === "string" ? ` to ${locationName}` : "";
  let summary = applied ? `${typeof amount === "number" ? amount : "Recorded"} damage applied${location}.`
    : effect.status === "declined" ? "No damage applied."
    : `${typeof amount === "number" ? amount + " damage" : "Damage"} pending${location}.`;
  if (!mayReadMechanics) return summary;
  const outcome = object(object(effect.appliedResult).combatOutcome);
  // These are historical receipts. Current agency comes from the entity's
  // condition, since healing or revival may have happened after this hit.
  if (applied && outcome.dead === true) summary += " This hit caused death.";
  else if (applied && outcome.unconscious === true) summary += " This hit caused unconsciousness.";
  else if (applied && outcome.incapacitated === true) summary += " This hit caused incapacitation.";
  else if (applied && outcome.limbIncapacitated === true) summary += ` ${String(outcome.limbName ?? "The limb")} was incapacitated.`;
  else if (applied && outcome.locationConsequenceRequiresGodRuling === true) summary += " Location injury requires a G.O.D. condition ruling; death or incapacitation was not recorded by this hit.";
  if (effect.status === "declined") summary = roll.succeeded === false ? "Miss - no damage applied."
    : `No damage applied.${effect.amendmentReason ? ` Recorded decision: ${effect.amendmentReason}` : " See the recorded ruling."}`;
  // A failed attack never delivered the calculated potential hit.
  if (roll.succeeded !== false && ["baseDamage", "extraSuccesses", "armor", "soak", "netDamage"].every((key) => typeof calculated[key] === "number")) {
    summary += ` Damage calculation: ${calculated.baseDamage} base + ${calculated.extraSuccesses} extra successes - ${calculated.armor} armor - ${calculated.soak} soak = ${calculated.netDamage}.`;
  }
  return summary;
}
