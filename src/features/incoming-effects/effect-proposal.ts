import type { MechanicalEffect } from "@/features/mechanical-effects";
import type { ActionEffectProposal, FrozenActionSourceSnapshot } from "@/features/tabletop-operations/action-effect-bridge";
import { interactionRuleInScope, matchInteractionRule } from "./interaction-matcher";
import type { IncomingEffectResolution, IncomingEffectTarget } from "./models";
import { resolveIncomingEffect } from "./resolve-incoming-effect";
import { incomingFactsForEffect, incomingFactsFromFrozenSource } from "./source-facts";

export const incomingObject = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function storedIncomingResolution(value: unknown): IncomingEffectResolution | null {
  const stored = incomingObject(value).incomingEffectResolution;
  return incomingObject(stored).schemaVersion === 1 ? stored as IncomingEffectResolution : null;
}

/** Maps a frozen calculation onto the existing effect workflow. The original
 * calculation stays in authoredValue even when a G.O.D. later amends the result. */
export function applyIncomingResolution(proposal: ActionEffectProposal, effect: MechanicalEffect, resolution: IncomingEffectResolution): ActionEffectProposal {
  const final = incomingObject(proposal.finalValue);
  const application = incomingObject(final.application);
  const authoredValue = { ...incomingObject(proposal.authoredValue), incomingEffectResolution: resolution,
    incomingApplicationSupported: proposal.applicationSupported, incomingOriginalApplication: application, incomingOriginalEffect: effect };
  if (resolution.status === "invalid") throw new Error(`Invalid incoming effect: ${resolution.issues.map(({ message }) => message).join(" ")}`);
  if (resolution.status === "requires-god-ruling") return { ...proposal, authoredValue, applicationSupported: false,
    godReviewRequired: true, status: "requires-god-ruling", amendmentReason: resolution.issues.map(({ message }) => message).join(" ") };
  const result = resolution.finalEffect!;
  const oldCalculation = incomingObject(proposal.calculatedValue);
  const calculatedValue = typeof oldCalculation.grossDamage === "number"
    ? { ...oldCalculation, netDamage: result.damage, incomingResolution: true }
    : effect.kind === "health.damage" ? result.disposition === "absorbed" ? result.healing : result.damage : proposal.calculatedValue;
  if (result.disposition === "prevented" || effect.kind === "health.damage" && result.damage === 0 && result.healing === 0) return {
    ...proposal, authoredValue, calculatedValue, finalValue: null, applicationSupported: false,
    godReviewRequired: false, status: "declined", amendmentReason: resolution.explanation.join(" "),
  };
  let resolvedEffect = effect;
  if (result.disposition === "absorbed") {
    // Area healing preserves the incoming pool. The Health executor applies its
    // current cap once, under its existing lock, instead of spreading healing.
    resolvedEffect = { kind: "health.heal", scope: "area", amount: result.healing,
      ...(effect.kind === "health.damage" && effect.timing ? { timing: effect.timing } : {}) };
    if (typeof application.poolKey !== "string" || !application.poolKey) return {
      ...proposal, authoredValue, effectType: "health.heal", calculatedValue: result,
      finalValue: { ...final, effect: resolvedEffect }, applicationSupported: false, godReviewRequired: true,
      status: "requires-god-ruling", amendmentReason: "Absorption calculated healing; select its exact incoming HP pool before application.",
    };
  } else if (effect.kind === "health.damage") resolvedEffect = { ...effect, amount: result.damage };
  return { ...proposal, authoredValue, effectType: resolvedEffect.kind, calculatedValue,
    finalValue: { ...final, effect: resolvedEffect } };
}

/** Optional source contributions can be removed or allocated after planning.
 * Recalculate against the original target facts, retaining both calculations. */
export function recalculateFrozenIncoming(proposal: ActionEffectProposal, amount: number): ActionEffectProposal | null {
  const original = storedIncomingResolution(proposal.authoredValue);
  if (!original) return null;
  const authored = incomingObject(proposal.authoredValue);
  const effect = { ...incomingObject(authored.incomingOriginalEffect), amount } as MechanicalEffect;
  const resolution = resolveIncomingEffect({ ...original.input, effect: { ...original.input.effect, amount } });
  const next = applyIncomingResolution({ ...proposal, applicationSupported: authored.incomingApplicationSupported === true,
    status: "calculated", godReviewRequired: false,
    finalValue: { effect, application: authored.incomingOriginalApplication } }, effect, resolution);
  return { ...next, authoredValue: { ...incomingObject(next.authoredValue), incomingEffectResolution: original, incomingRecalculation: resolution } };
}

export function proposalFromEffectRow(row: {
  effectKey: string; effectType: string; targetParticipantId: number; authoredValueJson?: unknown; calculatedValueJson?: unknown;
  finalValueJson?: unknown; unit?: string | null; resource?: string | null; applicationSupported?: boolean; godReviewRequired?: boolean;
  status?: string; amendmentReason?: string;
}): ActionEffectProposal {
  return { effectKey: row.effectKey, effectType: row.effectType, targetParticipantId: row.targetParticipantId, authoredValue: row.authoredValueJson,
    calculatedValue: row.calculatedValueJson, finalValue: row.finalValueJson, unit: row.unit ?? "", resource: row.resource ?? "",
    applicationSupported: row.applicationSupported ?? false, godReviewRequired: row.godReviewRequired ?? false,
    status: (row.status ?? "calculated") as ActionEffectProposal["status"], amendmentReason: row.amendmentReason ?? "" };
}

export function incomingProposalFields(proposal: ActionEffectProposal) {
  return { effectType: proposal.effectType, authoredValueJson: proposal.authoredValue, calculatedValueJson: proposal.calculatedValue,
    finalValueJson: proposal.finalValue, applicationSupported: proposal.applicationSupported, godReviewRequired: proposal.godReviewRequired,
    status: proposal.status, amendmentReason: proposal.amendmentReason };
}

export function resolveIncomingEffectProposal(proposal: ActionEffectProposal, source: Pick<FrozenActionSourceSnapshot, "kind" | "authoredData" | "incomingSourceFacts" | "displayName">, target: IncomingEffectTarget): ActionEffectProposal {
  if (proposal.status === "declined" || storedIncomingResolution(proposal.authoredValue)) return proposal;
  const final = incomingObject(proposal.finalValue);
  const effect = final.effect as MechanicalEffect | undefined;
  if (!effect || effect.kind === "manual" || effect.kind === "health.heal") return proposal;
  const application = incomingObject(final.application);
  if (!application.poolKey && Number.isInteger(application.hitLocationNumber)) {
    const poolKey = target.applicationLocations?.find(({ number }) => number === application.hitLocationNumber)?.poolKey;
    if (poolKey) proposal = { ...proposal, finalValue: { ...final, application: { ...application, poolKey } } };
  }
  const facts = incomingFactsForEffect(incomingFactsFromFrozenSource(source), effect);
  const instruction = incomingObject(incomingObject(proposal.authoredValue).instruction);
  const harmful = effect.kind === "health.damage" ? true : typeof instruction.harmful === "boolean" ? instruction.harmful : null;
  // Unknown harmfulness matters only if an applicable Requirement/Immunity
  // could change this non-damage effect. Beneficial/ordinary state effects keep
  // their existing behavior when no such interaction is possible.
  if (harmful === null && !(target.interactionRules?.rules ?? []).some((rule) =>
    interactionRuleInScope(rule, facts) && (rule.ruleType === "requirement"
      || rule.ruleType === "immunity" && matchInteractionRule(rule, facts).outcome !== "no-match"))) return proposal;
  const resolution = resolveIncomingEffect({ effect: { label: source.displayName, amount: effect.kind === "health.damage" ? effect.amount : null, harmful },
    source: facts, target, hitLocationKey: Number.isInteger(application.hitLocationNumber) ? String(application.hitLocationNumber) : null });
  return applyIncomingResolution(proposal, effect, resolution);
}
