import {
  resolveCharacterSkillLineageOptions,
  resolveCharacterSkillLineageSelection,
  type CharacterSkillLineageInput,
  type CharacterSkillLineageResolvedSelection,
  type CharacterWeaponCanonicalAlternative,
  type CharacterWeaponGoverningSelection,
} from "@/features/items/character-weapon-governance";
import type { CanonicalSkillPathValidation } from "@/features/items/weapon-skill-governance";
import type {
  RollGoverningSourceRequest,
  RollGoverningSourceSnapshot,
} from "./roll-mechanical-snapshot";
import {
  compareAttackAndDefense,
  type OpposedPercentileComparison,
  type PercentileResolution,
  type PercentileTargetModifier,
} from "./percentile-resolution";

export const DEFENSE_INTERVENTION_TYPES = [
  "no-reaction",
  "dodge",
  "parry",
  "block",
  "tackle",
  "intervention",
] as const;

export const DEFENSE_SOURCE_KINDS = [
  "none",
  "skill",
  "attribute",
  "weapon",
  "item",
  "spell",
  "derived-ability",
  "creature-defense",
  "manual",
] as const;

export const ORIGINAL_ACTION_DISPOSITIONS = [
  "continue",
  "continue-modified",
  "retarget",
  "cancel",
  "stopped",
  "target-removed",
  "awaiting-god-ruling",
] as const;

export type DefenseInterventionType = (typeof DEFENSE_INTERVENTION_TYPES)[number];
export type DefenseSourceKind = (typeof DEFENSE_SOURCE_KINDS)[number];
export type OriginalActionDisposition = (typeof ORIGINAL_ACTION_DISPOSITIONS)[number];

export type DefenseSkillPathMapping = Readonly<{
  id: number;
  endpointSkillId: number;
  reviewState: "review-required" | "approved";
  conditional: boolean;
  circumstanceLabel: string;
  sortOrder: number;
  path: CanonicalSkillPathValidation;
}>;

export type DodgeGovernanceResolution = Readonly<{
  status: "resolved";
  selected: CharacterSkillLineageResolvedSelection;
  alternatives: readonly CharacterWeaponCanonicalAlternative[];
  tiedMappingIds: readonly number[];
  hasTie: boolean;
  resolutionSource: "canonical" | "god-override";
  explanation: string;
}> | Readonly<{
  status: "needs-god-ruling";
  alternatives: readonly CharacterWeaponCanonicalAlternative[];
  explanation: string;
}>;

export type DefenseSourceSnapshot = Readonly<{
  kind: DefenseSourceKind;
  label: string;
  itemId: number | null;
  instanceId: number | null;
  skillAllocationId: number | null;
  attributeKey: string | null;
  derivedAbilityId: number | null;
  sourceRef: string | null;
  governingSource: RollGoverningSourceRequest | null;
  governingSnapshot: RollGoverningSourceSnapshot | null;
  authoredContext?: unknown;
}>;

export type DefenseInterventionSnapshot = Readonly<{
  schemaVersion: 1;
  actionDeclarationId: number;
  pendingActionId: number;
  responderOpportunityId: number;
  responderCharacterId: number;
  protectedTargetCharacterId: number;
  targetCharacterId: number | null;
  opposesReactionId: number | null;
  reactionType: DefenseInterventionType;
  source: DefenseSourceSnapshot;
  rollRequired: boolean;
  initiativeCost: number;
  explicitModifiers: readonly PercentileTargetModifier[];
  intendedMechanicalPurpose: string;
  godApprovalReason: string;
  declaredByUserId: string;
  declaredAt: string;
}>;

export type IndividualDefenseOutcome = Readonly<{
  reactionId: number;
  reactionType: DefenseInterventionType;
  status:
    | "no-defense"
    | "attack-failed"
    | "defense-failed"
    | "defense-stopped-attack"
    | "intervention-awaits-god"
    | "missing-roll"
    | "god-ruling-required"
    | "cancelled";
  comparison: OpposedPercentileComparison | null;
  defenseSucceeded: boolean | null;
  attackerAdditionalCost: number;
  defenderFinalCost: number;
  defenderRefund: number;
}>;

export type DefenseGroupOutcome = Readonly<{
  status: "resolved" | "unresolved" | "awaiting-god-ruling";
  attackStopped: boolean;
  attackContinues: boolean;
  multipleDefensesAllFailed: boolean;
  atLeastOneDefenseStoppedAttack: boolean;
  requiredRollReactionIds: readonly number[];
  missingRollReactionIds: readonly number[];
  attackerAdditionalCost: number;
  outcomes: readonly IndividualDefenseOutcome[];
}>;

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be greater than zero.`);
  return value;
}

function nonnegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be zero or greater.`);
  return value;
}

export function getDefenseInitiativeCommitment(
  reactionType: DefenseInterventionType,
  sourceCost?: number | null,
): number {
  if (reactionType === "no-reaction") return 0;
  if (reactionType === "dodge") return 1;
  if (reactionType === "tackle") return 3;
  if (reactionType === "parry" || reactionType === "block") {
    return positive(sourceCost ?? 0, "Defending Item Initiative Cost");
  }
  return positive(sourceCost ?? 0, "Intervention Initiative Cost");
}

export function resolveDodgeGovernance(input: {
  lineage: CharacterSkillLineageInput;
  mappings: readonly DefenseSkillPathMapping[];
  approvedConditionalMappingIds?: readonly number[];
  godOverride?: Readonly<{
    selection: CharacterWeaponGoverningSelection;
    reason: string;
  }> | null;
}): DodgeGovernanceResolution {
  if (input.godOverride) {
    const reason = input.godOverride.reason.trim();
    const selected = reason
      ? resolveCharacterSkillLineageSelection(input.lineage, input.godOverride.selection)
      : null;
    if (!selected) {
      return { status: "needs-god-ruling", alternatives: [], explanation: "The Dodge override does not identify an exact owned Skill lineage or Attribute with a nonblank reason." };
    }
    return {
      status: "resolved",
      selected,
      alternatives: [],
      tiedMappingIds: [],
      hasTie: false,
      resolutionSource: "god-override",
      explanation: `G.O.D. approved an exact Dodge governing-source override: ${reason}`,
    };
  }
  const approvedConditional = new Set(input.approvedConditionalMappingIds ?? []);
  const mappings = input.mappings
    .filter((mapping) => mapping.reviewState === "approved")
    .filter((mapping) => !mapping.conditional || approvedConditional.has(mapping.id))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id);
  const alternatives = resolveCharacterSkillLineageOptions(
    input.lineage,
    mappings.map((mapping) => ({
      id: mapping.id,
      firingModeId: null,
      endpointSkillId: mapping.endpointSkillId,
      reviewState: mapping.reviewState,
      sortOrder: mapping.sortOrder,
      notes: mapping.circumstanceLabel,
      path: mapping.path,
    })),
  );
  const resolved = alternatives.filter((entry): entry is CharacterWeaponCanonicalAlternative & { status: "resolved" } => entry.status === "resolved");
  if (!resolved.length) {
    return {
      status: "needs-god-ruling",
      alternatives,
      explanation: mappings.length
        ? "No approved Dodge path resolved through this Character's exact allocation lineage and root-Attribute fallback."
        : "No unconditional or G.O.D.-approved conditional Dodge path is configured.",
    };
  }
  const lowestTarget = Math.min(...resolved.map(({ source }) => source.originalTarget));
  const tied = resolved.filter(({ source }) => source.originalTarget === lowestTarget);
  const selectedAlternative = tied[0]!;
  return {
    status: "resolved",
    selected: {
      source: selectedAlternative.source,
      rollGoverningSource: selectedAlternative.rollGoverningSource,
      rollGoverningSourceSnapshot: selectedAlternative.rollGoverningSourceSnapshot,
    },
    alternatives,
    tiedMappingIds: tied.map(({ canonicalMappingId }) => canonicalMappingId),
    hasTie: tied.length > 1,
    resolutionSource: "canonical",
    explanation: `Selected the lowest approved Dodge roll-over target (${lowestTarget}); tied alternatives remain explicit.`,
  };
}

export function reconcileDefenseCost(input: {
  reactionType: DefenseInterventionType;
  committedInitiativeCost: number;
  defenseSucceeded: boolean;
}): { defenderFinalCost: number; defenderRefund: number; attackerAdditionalCost: number } {
  const committed = nonnegative(input.committedInitiativeCost, "Committed response Initiative Cost");
  if (input.reactionType === "no-reaction") {
    if (committed !== 0) throw new Error("No Defense cannot commit Initiative.");
    return { defenderFinalCost: 0, defenderRefund: 0, attackerAdditionalCost: 0 };
  }
  if (input.reactionType === "dodge") {
    if (committed !== 1) throw new Error("Dodge must commit exactly 1 Initiative.");
    return { defenderFinalCost: 1, defenderRefund: 0, attackerAdditionalCost: 0 };
  }
  if ((input.reactionType === "parry" || input.reactionType === "block") && input.defenseSucceeded) {
    return {
      defenderFinalCost: 1,
      defenderRefund: committed - 1,
      attackerAdditionalCost: committed,
    };
  }
  return { defenderFinalCost: committed, defenderRefund: 0, attackerAdditionalCost: 0 };
}

export function resolveDefenseGroup(input: {
  attack: PercentileResolution;
  defenses: readonly Readonly<{
    reactionId: number;
    reactionType: DefenseInterventionType;
    committedInitiativeCost: number;
    roll: PercentileResolution | null;
    cancelled?: boolean;
    opposesReactionId?: number | null;
  }>[];
}): DefenseGroupOutcome {
  const outcomes: IndividualDefenseOutcome[] = [];
  const rootDefenses = input.defenses.filter(({ opposesReactionId }) => opposesReactionId == null);
  for (const defense of rootDefenses) {
    if (defense.cancelled) {
      outcomes.push({ reactionId: defense.reactionId, reactionType: defense.reactionType, status: "cancelled", comparison: null, defenseSucceeded: null, attackerAdditionalCost: 0, defenderFinalCost: defense.committedInitiativeCost, defenderRefund: 0 });
      continue;
    }
    if (defense.reactionType === "no-reaction") {
      outcomes.push({ reactionId: defense.reactionId, reactionType: defense.reactionType, status: "no-defense", comparison: null, defenseSucceeded: false, attackerAdditionalCost: 0, defenderFinalCost: 0, defenderRefund: 0 });
      continue;
    }
    if (defense.reactionType === "intervention" || defense.reactionType === "tackle") {
      if (!defense.roll && defense.reactionType === "tackle") {
        outcomes.push({ reactionId: defense.reactionId, reactionType: defense.reactionType, status: "missing-roll", comparison: null, defenseSucceeded: null, attackerAdditionalCost: 0, defenderFinalCost: defense.committedInitiativeCost, defenderRefund: 0 });
      } else {
        outcomes.push({ reactionId: defense.reactionId, reactionType: defense.reactionType, status: "intervention-awaits-god", comparison: null, defenseSucceeded: defense.roll?.succeeded ?? null, attackerAdditionalCost: 0, defenderFinalCost: defense.committedInitiativeCost, defenderRefund: 0 });
      }
      continue;
    }
    if (!defense.roll) {
      outcomes.push({ reactionId: defense.reactionId, reactionType: defense.reactionType, status: "missing-roll", comparison: null, defenseSucceeded: null, attackerAdditionalCost: 0, defenderFinalCost: defense.committedInitiativeCost, defenderRefund: 0 });
      continue;
    }
    const comparison = compareAttackAndDefense(input.attack, defense.roll);
    if (comparison.requiresGodRuling) {
      outcomes.push({ reactionId: defense.reactionId, reactionType: defense.reactionType, status: "god-ruling-required", comparison, defenseSucceeded: null, attackerAdditionalCost: 0, defenderFinalCost: defense.committedInitiativeCost, defenderRefund: 0 });
      continue;
    }
    const succeeded = input.attack.succeeded && comparison.objectiveOutcome === "defense-wins";
    const costs = reconcileDefenseCost({ reactionType: defense.reactionType, committedInitiativeCost: defense.committedInitiativeCost, defenseSucceeded: succeeded });
    outcomes.push({
      reactionId: defense.reactionId,
      reactionType: defense.reactionType,
      status: !input.attack.succeeded ? "attack-failed" : succeeded ? "defense-stopped-attack" : "defense-failed",
      comparison,
      defenseSucceeded: succeeded,
      ...costs,
    });
  }
  const missing = outcomes.filter(({ status }) => status === "missing-roll").map(({ reactionId }) => reactionId);
  const ruling = input.attack.requiresGodRuling
    || outcomes.some(({ status }) => status === "god-ruling-required" || status === "intervention-awaits-god");
  const stopped = !input.attack.succeeded || outcomes.some(({ status }) => status === "defense-stopped-attack");
  const ordinary = outcomes.filter(({ reactionType, status }) => !["no-reaction", "tackle", "intervention"].includes(reactionType) && status !== "cancelled");
  return {
    status: missing.length ? "unresolved" : ruling ? "awaiting-god-ruling" : "resolved",
    attackStopped: stopped,
    attackContinues: !stopped,
    multipleDefensesAllFailed: ordinary.length > 1 && ordinary.every(({ status }) => status === "defense-failed"),
    atLeastOneDefenseStoppedAttack: outcomes.some(({ status }) => status === "defense-stopped-attack"),
    requiredRollReactionIds: rootDefenses.filter(({ reactionType }) => reactionType !== "no-reaction").map(({ reactionId }) => reactionId),
    missingRollReactionIds: missing,
    attackerAdditionalCost: outcomes.reduce((sum, outcome) => sum + outcome.attackerAdditionalCost, 0),
    outcomes,
  };
}

export function resolveTackle(input: {
  tackleRoll: PercentileResolution;
  targetResponse: "no-defense" | PercentileResolution;
  dangerKind: "firearm" | "other";
}): Readonly<{
  status: "succeeded" | "failed" | "awaiting-god-ruling";
  comparison: OpposedPercentileComparison | null;
  targetRemovedFromPath: boolean;
  bulletTransferredToTackler: false;
  originalActionRequiresGodDisposition: boolean;
}> {
  const comparison = input.targetResponse === "no-defense"
    ? null
    : compareAttackAndDefense(input.tackleRoll, input.targetResponse);
  const requiresRuling = input.tackleRoll.requiresGodRuling || comparison?.requiresGodRuling === true;
  const succeeded = input.targetResponse === "no-defense"
    ? input.tackleRoll.succeeded
    : comparison?.objectiveOutcome === "attack-wins";
  return {
    status: requiresRuling ? "awaiting-god-ruling" : succeeded ? "succeeded" : "failed",
    comparison,
    targetRemovedFromPath: !requiresRuling && succeeded && input.dangerKind === "firearm",
    bulletTransferredToTackler: false,
    originalActionRequiresGodDisposition: requiresRuling || input.dangerKind !== "firearm",
  };
}

export function buildDefenseInterventionSnapshot(input: Omit<DefenseInterventionSnapshot, "schemaVersion">): DefenseInterventionSnapshot {
  const cost = getDefenseInitiativeCommitment(input.reactionType, input.initiativeCost);
  if (input.reactionType !== "no-reaction" && input.rollRequired && input.source.governingSource === null) {
    throw new Error("A rolling response requires an exact governing source.");
  }
  if (input.reactionType === "no-reaction" && input.rollRequired) throw new Error("No Defense never creates a Roll.");
  if (input.reactionType === "intervention" && !input.godApprovalReason.trim()) throw new Error("General Intervention requires a G.O.D. approval reason.");
  return {
    ...input,
    schemaVersion: 1,
    initiativeCost: cost,
    explicitModifiers: input.explicitModifiers.map((modifier) => ({ ...modifier })),
    source: { ...input.source },
  };
}

export function parseDefenseInterventionSnapshot(value: unknown): DefenseInterventionSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Stored defense/intervention declaration is invalid.");
  const snapshot = value as DefenseInterventionSnapshot;
  if (snapshot.schemaVersion !== 1 || !DEFENSE_INTERVENTION_TYPES.includes(snapshot.reactionType)) {
    throw new Error("Stored defense/intervention declaration version or type is unsupported.");
  }
  return buildDefenseInterventionSnapshot({ ...snapshot });
}

export function rollGoverningRequestFromLockedActionSource(
  value: unknown,
  characterId: number,
): RollGoverningSourceRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (source.kind === "skill" && Number.isSafeInteger(source.allocationId) && typeof source.calculatedPercentage === "number") {
    return {
      kind: "skill",
      characterId,
      allocationId: source.allocationId as number,
      calculatedPercentage: source.calculatedPercentage,
    };
  }
  if (source.kind === "attribute" && typeof source.attributeKey === "string") {
    return { kind: "attribute", characterId, attributeKey: source.attributeKey };
  }
  if (source.kind === "manual" && typeof source.label === "string" && typeof source.originalTarget === "number") {
    return { kind: "manual", label: source.label, originalTarget: source.originalTarget };
  }
  return null;
}
