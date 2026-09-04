import type { CharacterAttributeKey, CharacterSkillReference } from "@/features/characters/models";
import {
  resolveCharacterSkillLineageOptions,
  resolveCharacterSkillLineageSelection,
  type CharacterSkillLineageInput,
  type CharacterWeaponResolvedSource,
} from "@/features/items/character-weapon-governance";
import {
  enumerateCanonicalSkillPathAlternatives,
  validateSelectedCanonicalSkillPath,
  type CanonicalSkillParentRelationship,
  type CanonicalSkillPathValidation,
  type CanonicalWeaponSkillOption,
} from "@/features/items/weapon-skill-governance";

import type { RollGoverningSourceRequest, RollGoverningSourceSnapshot } from "./roll-mechanical-snapshot";
import { resolvePercentileCheck, validateRollResult, type PercentileResolution, type PercentileTargetModifier } from "./percentile-resolution";

export const CALLED_CHECK_STATUSES = ["pending", "answered", "requires-god-ruling", "resolved", "cancelled", "superseded"] as const;
export const HIGH_LOW_MODES = ["neutral", "player-calls-rolls", "player-calls-god-rolls"] as const;
export const HIGH_LOW_SIDES = ["low", "high"] as const;

export type CalledCheckStatus = (typeof CALLED_CHECK_STATUSES)[number];
export type HighLowMode = (typeof HIGH_LOW_MODES)[number];
export type HighLowSide = (typeof HIGH_LOW_SIDES)[number];

export type CalledCheckRequestedSource =
  | Readonly<{ kind: "attribute"; attributeKey: CharacterAttributeKey }>
  | Readonly<{ kind: "skill"; endpointSkillId: number; rootToEndpointSkillIds: readonly number[] }>;

export type CalledCheckResolvedSource = Readonly<{
  status: "resolved";
  source: CharacterWeaponResolvedSource;
  governingSource: RollGoverningSourceRequest;
  governingSnapshot: RollGoverningSourceSnapshot;
  originalTarget: number;
  finalTarget: number;
  modifiers: readonly PercentileTargetModifier[];
  explanation: string;
}> | Readonly<{
  status: "requires-god-ruling";
  reason: "invalid-skill-path" | "ambiguous-skill-path" | "missing-character-source" | "unsupported-creature-source";
  explanation: string;
  alternatives: readonly CanonicalSkillPathValidation[];
}>;

export type HighLowResolution = Readonly<{
  resultTotal: number;
  rolledSide: HighLowSide;
  calledSide: HighLowSide | null;
  matchedCall: boolean | null;
  criticalFailure: boolean;
  criticalSuccess: boolean;
  doubleOtt: boolean;
  requiresGodRuling: boolean;
  rulingReasons: readonly ("critical-failure" | "double-ott-critical-success" | "called-side-critical-interaction")[];
}>;

function asCanonicalRelationships(
  relationships: CharacterSkillLineageInput["skillRelationships"],
): CanonicalSkillParentRelationship[] {
  return relationships.map((relationship, index) => ({ id: index + 1, ...relationship }));
}

function applyAwarenessFallback(path: CanonicalSkillPathValidation): CanonicalSkillPathValidation {
  const includesAwareness = path.rootToEndpoint.some(({ name }) => name.trim().toLocaleLowerCase("en-US") === "awareness");
  if (!includesAwareness) return path;
  const problems = path.problems.filter(({ code }) => code !== "missing-attribute");
  return {
    ...path,
    valid: problems.length === 0,
    fallbackAttribute: problems.length === 0 ? "WIS" : null,
    problems,
  };
}

export function getCalledCheckSkillPathAlternatives(
  endpointSkillId: number,
  skills: readonly CharacterSkillReference[],
  relationships: CharacterSkillLineageInput["skillRelationships"],
): CanonicalSkillPathValidation[] {
  return enumerateCanonicalSkillPathAlternatives(
    endpointSkillId,
    skills,
    asCanonicalRelationships(relationships),
  ).map(applyAwarenessFallback);
}

export function resolveCalledCheckSource(
  input: CharacterSkillLineageInput,
  requested: CalledCheckRequestedSource,
  modifiers: readonly PercentileTargetModifier[] = [],
): CalledCheckResolvedSource {
  if (input.context.npcKind === "creature" && input.context.characterId < 0) {
    return {
      status: "requires-god-ruling",
      reason: "unsupported-creature-source",
      explanation: "Direct encounter Creatures do not enter Character Attribute or Skill services.",
      alternatives: [],
    };
  }
  if (requested.kind === "attribute") {
    const resolved = resolveCharacterSkillLineageSelection(input, requested);
    if (!resolved) return {
      status: "requires-god-ruling",
      reason: "missing-character-source",
      explanation: `The Character has no valid current ${requested.attributeKey} value. No fallback Attribute was guessed.`,
      alternatives: [],
    };
    const finalTarget = resolvePercentileCheck({ resultTotal: 50, originalTarget: resolved.source.originalTarget, modifiers }).finalTarget;
    return {
      status: "resolved",
      source: resolved.source,
      governingSource: resolved.rollGoverningSource,
      governingSnapshot: resolved.rollGoverningSourceSnapshot,
      originalTarget: resolved.source.originalTarget,
      finalTarget,
      modifiers,
      explanation: `${requested.attributeKey} straight Attribute target is 100 - current Attribute.`,
    };
  }

  const alternatives = getCalledCheckSkillPathAlternatives(
    requested.endpointSkillId,
    input.skillCatalog,
    input.skillRelationships,
  );
  if (!requested.rootToEndpointSkillIds.length && alternatives.filter(({ valid }) => valid).length > 1) return {
    status: "requires-god-ruling",
    reason: "ambiguous-skill-path",
    explanation: "This broad Skill has several genuinely different ancestry routes. The G.O.D. must choose one exact path.",
    alternatives,
  };
  if (requested.rootToEndpointSkillIds.at(-1) !== requested.endpointSkillId) return {
    status: "requires-god-ruling",
    reason: "invalid-skill-path",
    explanation: "The selected exact Skill route does not end at the requested canonical Skill identity.",
    alternatives,
  };
  const selectedPath = applyAwarenessFallback(validateSelectedCanonicalSkillPath(
    requested.rootToEndpointSkillIds,
    input.skillCatalog,
    asCanonicalRelationships(input.skillRelationships),
  ));
  if (!selectedPath.valid) return {
    status: "requires-god-ruling",
    reason: alternatives.filter(({ valid }) => valid).length > 1 ? "ambiguous-skill-path" : "invalid-skill-path",
    explanation: selectedPath.problems.map(({ message }) => message).join(" ") || "The selected exact Skill path is invalid.",
    alternatives,
  };
  const option: CanonicalWeaponSkillOption = {
    id: requested.endpointSkillId,
    firingModeId: null,
    endpointSkillId: requested.endpointSkillId,
    reviewState: "approved",
    sortOrder: 0,
    notes: "Called Check exact selected route.",
    path: selectedPath,
  };
  const resolved = resolveCharacterSkillLineageOptions(input, [option])[0];
  if (!resolved || resolved.status !== "resolved") return {
    status: "requires-god-ruling",
    reason: "missing-character-source",
    explanation: resolved?.explanation ?? "The exact Character Skill lineage cannot produce an authoritative target.",
    alternatives,
  };
  const finalTarget = resolvePercentileCheck({ resultTotal: 50, originalTarget: resolved.source.originalTarget, modifiers }).finalTarget;
  return {
    status: "resolved",
    source: resolved.source,
    governingSource: resolved.rollGoverningSource,
    governingSnapshot: resolved.rollGoverningSourceSnapshot,
    originalTarget: resolved.source.originalTarget,
    finalTarget,
    modifiers,
    explanation: resolved.explanation,
  };
}

export function evaluateCalledCheck(
  source: Readonly<{ originalTarget: number; modifiers: readonly PercentileTargetModifier[] }>,
  resultTotal: number,
): PercentileResolution {
  return resolvePercentileCheck({
    resultTotal,
    originalTarget: source.originalTarget,
    modifiers: source.modifiers,
  });
}

export function resolveHighLow(resultTotal: number, calledSide: HighLowSide | null): HighLowResolution {
  const result = validateRollResult(resultTotal);
  const rolledSide: HighLowSide = result <= 50 ? "low" : "high";
  const criticalFailure = result === 1;
  const criticalSuccess = result === 100;
  const critical = criticalFailure || criticalSuccess;
  const rulingReasons: HighLowResolution["rulingReasons"][number][] = [];
  if (criticalFailure) rulingReasons.push("critical-failure");
  if (criticalSuccess) rulingReasons.push("double-ott-critical-success");
  if (calledSide !== null && critical) rulingReasons.push("called-side-critical-interaction");
  return {
    resultTotal: result,
    rolledSide,
    calledSide,
    matchedCall: calledSide === null ? null : calledSide === rolledSide,
    criticalFailure,
    criticalSuccess,
    doubleOtt: criticalSuccess,
    requiresGodRuling: rulingReasons.length > 0,
    rulingReasons,
  };
}

export function summarizeCalledCheckBatch(statuses: readonly CalledCheckStatus[]): Readonly<{
  total: number;
  pending: number;
  resolved: number;
  requiresGodRuling: number;
  cancelled: number;
  rerolled: number;
  complete: boolean;
}> {
  return {
    total: statuses.length,
    pending: statuses.filter((status) => status === "pending" || status === "answered").length,
    resolved: statuses.filter((status) => status === "resolved").length,
    requiresGodRuling: statuses.filter((status) => status === "requires-god-ruling").length,
    cancelled: statuses.filter((status) => status === "cancelled").length,
    rerolled: statuses.filter((status) => status === "superseded").length,
    complete: statuses.every((status) => ["resolved", "cancelled", "superseded"].includes(status)),
  };
}
