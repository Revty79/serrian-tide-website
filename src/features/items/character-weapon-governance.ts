import {
  getCharacterSkillRanks,
  getEffectiveSkillPoints,
  getSkillRollTarget,
  getSpecialAbilityRollTarget,
  hasSkillPoints,
  isSpecialAbilitySkill,
  normalizeSkillAttributeKey,
} from "@/features/characters/character-rules";
import {
  CHARACTER_ATTRIBUTE_LABELS,
  type CharacterAttributeKey,
  type CharacterDraft,
  type CharacterRaceAggregate,
  type CharacterSkillRelationship,
  type CharacterSkillReference,
} from "@/features/characters/models";
import type {
  RollGoverningSourceRequest,
  RollGoverningSourceSnapshot,
  SkillPathSnapshotEntry,
} from "@/features/tabletop-operations/roll-mechanical-snapshot";
import { PERCENTILE_NUMERIC_BOUND } from "@/features/tabletop-operations/percentile-resolution";

import {
  selectApplicableCanonicalWeaponSkillPaths,
  type CanonicalSkillPathValidation,
  type CanonicalWeaponSkillOption,
} from "./weapon-skill-governance";
import type { WeaponSkillGovernanceReadModel } from "./weapon-skill-governance-service";

export const CHARACTER_WEAPON_GOVERNANCE_RULING_REASONS = [
  "missing-canonical-path",
  "invalid-canonical-path",
  "invalid-character-allocation-lineage",
  "missing-character-attribute",
  "unsupported-creature-governance",
  "invalid-one-action-override",
] as const;

export type CharacterWeaponGovernanceRulingReason =
  (typeof CHARACTER_WEAPON_GOVERNANCE_RULING_REASONS)[number];

export type CharacterWeaponAllocation = Readonly<{
  id: number;
  characterId: number;
  skillId: number;
  parentAllocationId: number | null;
  points: number;
}>;

export type CharacterWeaponGoverningSelection =
  | Readonly<{ kind: "skill"; allocationId: number }>
  | Readonly<{ kind: "attribute"; attributeKey: CharacterAttributeKey }>;

export type PersistentCharacterWeaponOverride = Readonly<{
  id: number;
  campaignId: number;
  characterId: number;
  itemId: number;
  weaponProfileId: number;
  firingModeId: number | null;
  selection: CharacterWeaponGoverningSelection;
  reason: string;
  updatedByUserId: string;
  createdAt: string;
  updatedAt: string;
}>;

export type CharacterWeaponOneActionOverride =
  | Readonly<{
      kind: "skill";
      allocationId: number;
      reason: string;
    }>
  | Readonly<{
      kind: "attribute";
      attributeKey: CharacterAttributeKey;
      reason: string;
    }>
  | Readonly<{
      kind: "manual";
      label: string;
      originalTarget: number;
      reason: string;
    }>;

export type CharacterWeaponGovernanceContext = Readonly<{
  campaignId: number;
  characterId: number;
  isNpc: boolean;
  npcKind: "race" | "creature";
  itemId: number;
  weaponCanonicalId: string;
  weaponName: string;
  weaponProfileId: number;
  firingModeId: number | null;
}>;

export type CharacterWeaponResolvedSource =
  | Readonly<{
      kind: "skill";
      allocationId: number;
      skillId: number;
      skillName: string;
      allocationPath: readonly SkillPathSnapshotEntry[];
      calculatedPercentage: number;
      originalTarget: number;
    }>
  | Readonly<{
      kind: "attribute";
      attributeKey: CharacterAttributeKey;
      attributeDisplayName: string;
      attributeValue: number;
      originalTarget: number;
    }>
  | Readonly<{
      kind: "manual";
      label: string;
      originalTarget: number;
    }>;

export type CharacterWeaponCanonicalAlternative = Readonly<{
  status: "resolved";
  canonicalMappingId: number;
  endpointSkillId: number;
  canonicalPath: CanonicalSkillPathValidation;
  source: CharacterWeaponResolvedSource;
  rollGoverningSource: RollGoverningSourceRequest;
  rollGoverningSourceSnapshot: RollGoverningSourceSnapshot;
  explanation: string;
}> | Readonly<{
  status: "unresolved";
  canonicalMappingId: number;
  endpointSkillId: number;
  canonicalPath: CanonicalSkillPathValidation;
  reason: Extract<CharacterWeaponGovernanceRulingReason,
    "invalid-character-allocation-lineage" | "missing-character-attribute" | "invalid-canonical-path">;
  explanation: string;
}>;

export type CharacterWeaponNormalResolution = Readonly<{
  status: "resolved";
  canonicalSource: "weapon-default" | "firing-mode";
  alternatives: readonly CharacterWeaponCanonicalAlternative[];
  selectedAlternative: CharacterWeaponCanonicalAlternative & { status: "resolved" };
  tiedCanonicalMappingIds: readonly number[];
  hasTie: boolean;
}> | Readonly<{
  status: "needs-god-ruling";
  reason: CharacterWeaponGovernanceRulingReason;
  canonicalSource: "weapon-default" | "firing-mode" | null;
  alternatives: readonly CharacterWeaponCanonicalAlternative[];
  explanation: string;
}>;

type SuccessfulCharacterWeaponGovernance = CharacterWeaponGovernanceContext & Readonly<{
  status: "resolved-normal" | "resolved-persistent-override" | "resolved-one-action-override";
  resolutionSource: "normal" | "persistent-override" | "one-action-override";
  source: CharacterWeaponResolvedSource;
  originalTarget: number;
  canonicalMappingId: number | null;
  canonicalPath: CanonicalSkillPathValidation | null;
  normalResolution: CharacterWeaponNormalResolution;
  persistentOverrideId: number | null;
  overrideReason: string | null;
  explanation: string;
  rollGoverningSource: RollGoverningSourceRequest;
  rollGoverningSourceSnapshot: RollGoverningSourceSnapshot;
}>;

export type CharacterWeaponGovernanceResult =
  | SuccessfulCharacterWeaponGovernance
  | (CharacterWeaponGovernanceContext & Readonly<{
      status: "needs-god-ruling";
      reason: CharacterWeaponGovernanceRulingReason;
      explanation: string;
      normalResolution: CharacterWeaponNormalResolution;
      persistentOverrideId: null;
    }>)
  | (CharacterWeaponGovernanceContext & Readonly<{
      status: "override-invalid";
      reason: string;
      explanation: string;
      normalResolution: CharacterWeaponNormalResolution;
      persistentOverrideId: number;
    }>);

export type ResolveCharacterWeaponGovernanceInput = Readonly<{
  context: CharacterWeaponGovernanceContext;
  governance: WeaponSkillGovernanceReadModel;
  attributes: Readonly<Partial<Record<CharacterAttributeKey, number>>>;
  allocations: readonly CharacterWeaponAllocation[];
  skillCatalog: readonly CharacterSkillReference[];
  skillRelationships: readonly CharacterSkillRelationship[];
  race?: CharacterRaceAggregate | null;
  persistentOverride?: PersistentCharacterWeaponOverride | null;
  oneActionOverride?: CharacterWeaponOneActionOverride | null;
}>;

type AllocationPathResult =
  | { valid: true; allocations: CharacterWeaponAllocation[] }
  | { valid: false; explanation: string };

type ResolvedSelection = Readonly<{
  source: CharacterWeaponResolvedSource;
  rollGoverningSource: RollGoverningSourceRequest;
  rollGoverningSourceSnapshot: RollGoverningSourceSnapshot;
}>;

function exactPathEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function finiteAttribute(
  attributes: ResolveCharacterWeaponGovernanceInput["attributes"],
  key: CharacterAttributeKey,
): number | null {
  const value = attributes[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function characterDraft(input: ResolveCharacterWeaponGovernanceInput): CharacterDraft {
  return {
    name: "Weapon governance resolver",
    profile: {
      raceId: input.race?.race.id ?? null,
      age: null,
      sex: "",
      heightFeet: null,
      heightInches: null,
      weight: null,
      skinColor: "",
      eyeColor: "",
      hairColor: "",
      deity: "",
      definingMarks: "",
      personality: "",
      goals: "",
      secrets: "",
      backstory: "",
      motivations: "",
      fame: 0,
      experience: 0,
      totalExperience: 0,
      quintessence: 0,
      totalQuintessence: 0,
      creditsRemaining: 0,
      fatePoints: null,
      hpMultiplierSteps: 0,
      baseMovementSteps: 0,
      baseMagicSteps: 0,
    },
    attributes: {
      STR: input.attributes.STR ?? Number.NaN,
      DEX: input.attributes.DEX ?? Number.NaN,
      CON: input.attributes.CON ?? Number.NaN,
      INT: input.attributes.INT ?? Number.NaN,
      WIS: input.attributes.WIS ?? Number.NaN,
      CHR: input.attributes.CHR ?? Number.NaN,
    },
    skillAllocations: input.allocations.map((allocation) => ({
      draftId: allocation.id,
      skillId: allocation.skillId,
      parentDraftId: allocation.parentAllocationId,
      points: allocation.points,
    })),
    items: [],
    itemInstances: [],
    currencyHoldings: [],
  };
}

function allocationPath(
  allocation: CharacterWeaponAllocation,
  allocationsById: ReadonlyMap<number, CharacterWeaponAllocation>,
  characterId: number,
  parentRelationships: ReadonlySet<string>,
): AllocationPathResult {
  const reversed: CharacterWeaponAllocation[] = [];
  const seen = new Set<number>();
  let cursor: CharacterWeaponAllocation | undefined = allocation;
  while (cursor) {
    if (cursor.characterId !== characterId) {
      return { valid: false, explanation: "The Skill allocation path crosses into another Character." };
    }
    if (seen.has(cursor.id)) {
      return { valid: false, explanation: "The Skill allocation path contains a cycle." };
    }
    seen.add(cursor.id);
    reversed.push(cursor);
    if (cursor.parentAllocationId === null) break;
    const child = cursor;
    cursor = allocationsById.get(cursor.parentAllocationId);
    if (!cursor) {
      return { valid: false, explanation: "The Skill allocation path has a missing parent allocation." };
    }
    if (!parentRelationships.has(`${child.skillId}:${cursor.skillId}`)) {
      return {
        valid: false,
        explanation: "The Skill allocation path does not follow an authored canonical parent relationship.",
      };
    }
  }
  return { valid: true, allocations: reversed.reverse() };
}

function skillSnapshotPath(
  path: readonly CharacterWeaponAllocation[],
  skillsById: ReadonlyMap<number, CharacterSkillReference>,
): SkillPathSnapshotEntry[] | null {
  const snapshot: SkillPathSnapshotEntry[] = [];
  for (const allocation of path) {
    const selectedSkill = skillsById.get(allocation.skillId);
    if (!selectedSkill) return null;
    snapshot.push({
      allocationId: allocation.id,
      skillId: selectedSkill.id,
      skillName: selectedSkill.name,
      skillTier: selectedSkill.tier,
    });
  }
  return snapshot;
}

function resolveAttributeSelection(
  context: CharacterWeaponGovernanceContext,
  attributes: ResolveCharacterWeaponGovernanceInput["attributes"],
  attributeKey: CharacterAttributeKey,
): ResolvedSelection | null {
  const value = finiteAttribute(attributes, attributeKey);
  if (value === null) return null;
  const originalTarget = 100 - value;
  const source = {
    kind: "attribute" as const,
    attributeKey,
    attributeDisplayName: CHARACTER_ATTRIBUTE_LABELS[attributeKey],
    attributeValue: value,
    originalTarget,
  };
  return {
    source,
    rollGoverningSource: { kind: "attribute", characterId: context.characterId, attributeKey },
    rollGoverningSourceSnapshot: {
      kind: "attribute",
      characterId: context.characterId,
      attributeKey,
      attributeDisplayName: CHARACTER_ATTRIBUTE_LABELS[attributeKey],
      attributeValue: value,
      originalTarget,
    },
  };
}

function resolveSkillSelection(
  input: ResolveCharacterWeaponGovernanceInput,
  allocation: CharacterWeaponAllocation,
  path: readonly CharacterWeaponAllocation[],
  ranks: ReadonlyMap<number, number>,
  skillsById: ReadonlyMap<number, CharacterSkillReference>,
): ResolvedSelection | null {
  const selectedSkill = skillsById.get(allocation.skillId);
  const snapshotPath = skillSnapshotPath(path, skillsById);
  if (!selectedSkill || !snapshotPath) return null;
  if (!hasSkillPoints(getEffectiveSkillPoints(allocation.points, input.race ?? null, allocation.skillId))) {
    return null;
  }
  const rank = ranks.get(allocation.id);
  if (rank === undefined || !Number.isFinite(rank)) return null;
  const attributeKey = normalizeSkillAttributeKey(selectedSkill.primaryAttribute);
  let calculatedPercentage: number;
  if (attributeKey) {
    const value = finiteAttribute(input.attributes, attributeKey);
    if (value === null) return null;
    calculatedPercentage = getSkillRollTarget(value, rank);
  } else if (isSpecialAbilitySkill(selectedSkill)) {
    calculatedPercentage = getSpecialAbilityRollTarget(rank);
  } else {
    return null;
  }
  const source = {
    kind: "skill" as const,
    allocationId: allocation.id,
    skillId: selectedSkill.id,
    skillName: selectedSkill.name,
    allocationPath: snapshotPath,
    calculatedPercentage,
    originalTarget: calculatedPercentage,
  };
  return {
    source,
    rollGoverningSource: {
      kind: "skill",
      characterId: input.context.characterId,
      allocationId: allocation.id,
      calculatedPercentage,
    },
    rollGoverningSourceSnapshot: {
      kind: "skill",
      characterId: input.context.characterId,
      allocationId: allocation.id,
      skillId: selectedSkill.id,
      skillName: selectedSkill.name,
      skillClassification: selectedSkill.classification,
      skillTier: selectedSkill.tier,
      skillPath: snapshotPath,
      calculatedPercentage,
      originalTarget: calculatedPercentage,
    },
  };
}

function resolveCanonicalOption(
  input: ResolveCharacterWeaponGovernanceInput,
  option: CanonicalWeaponSkillOption,
  allocationsById: ReadonlyMap<number, CharacterWeaponAllocation>,
  allocationPaths: ReadonlyMap<number, AllocationPathResult>,
  ranks: ReadonlyMap<number, number>,
  skillsById: ReadonlyMap<number, CharacterSkillReference>,
): CharacterWeaponCanonicalAlternative {
  const canonicalIds = option.path.rootToEndpoint.map(({ id }) => id);
  if (!option.path.valid || canonicalIds.length === 0) {
    return {
      status: "unresolved",
      canonicalMappingId: option.id,
      endpointSkillId: option.endpointSkillId,
      canonicalPath: option.path,
      reason: "invalid-canonical-path",
      explanation: "This canonical Skill path is invalid and cannot govern a Character weapon check.",
    };
  }

  for (let depth = canonicalIds.length; depth >= 1; depth -= 1) {
    const expectedPath = canonicalIds.slice(0, depth);
    const invalidCandidates = input.allocations.filter((allocation) => {
      const resolvedPath = allocationPaths.get(allocation.id);
      const directParent = allocation.parentAllocationId === null
        ? null
        : allocationsById.get(allocation.parentAllocationId) ?? null;
      const expectedParentSkillId = expectedPath.length > 1
        ? expectedPath[expectedPath.length - 2]
        : null;
      return allocation.skillId === expectedPath[expectedPath.length - 1]
        && resolvedPath?.valid === false
        && (
          directParent === null
          || directParent.skillId === expectedParentSkillId
        )
        && hasSkillPoints(getEffectiveSkillPoints(
          allocation.points,
          input.race ?? null,
          allocation.skillId,
        ));
    });
    if (invalidCandidates.length) {
      return {
        status: "unresolved",
        canonicalMappingId: option.id,
        endpointSkillId: option.endpointSkillId,
        canonicalPath: option.path,
        reason: "invalid-character-allocation-lineage",
        explanation: `Owned allocation #${invalidCandidates[0]!.id} has malformed ancestry at canonical path depth ${depth}.`,
      };
    }
    const matches = input.allocations.filter((allocation) => {
      const resolvedPath = allocationPaths.get(allocation.id);
      return resolvedPath?.valid === true
        && exactPathEqual(resolvedPath.allocations.map(({ skillId }) => skillId), expectedPath)
        && hasSkillPoints(getEffectiveSkillPoints(
          allocation.points,
          input.race ?? null,
          allocation.skillId,
        ));
    });
    if (matches.length > 1) {
      return {
        status: "unresolved",
        canonicalMappingId: option.id,
        endpointSkillId: option.endpointSkillId,
        canonicalPath: option.path,
        reason: "invalid-character-allocation-lineage",
        explanation: `Multiple owned allocations indistinguishably match canonical Skill-ID path ${expectedPath.join(" -> ")}.`,
      };
    }
    if (matches.length === 1) {
      const allocation = matches[0]!;
      const path = allocationPaths.get(allocation.id);
      if (!path?.valid) throw new Error("Exact allocation match lost its validated ancestry.");
      const resolved = resolveSkillSelection(input, allocation, path.allocations, ranks, skillsById);
      if (!resolved) {
        return {
          status: "unresolved",
          canonicalMappingId: option.id,
          endpointSkillId: option.endpointSkillId,
          canonicalPath: option.path,
          reason: "missing-character-attribute",
          explanation: `The exact owned Skill allocation #${allocation.id} cannot produce its authoritative calculated percentage from current Character data.`,
        };
      }
      return {
        status: "resolved",
        canonicalMappingId: option.id,
        endpointSkillId: option.endpointSkillId,
        canonicalPath: option.path,
        ...resolved,
        explanation: `Used the deepest owned exact allocation #${allocation.id} at canonical path depth ${depth}; parent and child values were not stacked.`,
      };
    }
  }

  const fallbackKey = normalizeSkillAttributeKey(option.path.fallbackAttribute);
  if (!fallbackKey) {
    return {
      status: "unresolved",
      canonicalMappingId: option.id,
      endpointSkillId: option.endpointSkillId,
      canonicalPath: option.path,
      reason: "invalid-canonical-path",
      explanation: "The canonical path does not resolve to a supported fallback Attribute.",
    };
  }
  const resolved = resolveAttributeSelection(input.context, input.attributes, fallbackKey);
  if (!resolved) {
    return {
      status: "unresolved",
      canonicalMappingId: option.id,
      endpointSkillId: option.endpointSkillId,
      canonicalPath: option.path,
      reason: "missing-character-attribute",
      explanation: `The Character has no valid current ${fallbackKey} record for straight-Attribute fallback.`,
    };
  }
  return {
    status: "resolved",
    canonicalMappingId: option.id,
    endpointSkillId: option.endpointSkillId,
    canonicalPath: option.path,
    ...resolved,
    explanation: `No exact Skill allocation on this canonical path is owned; used straight ${fallbackKey} at 100 - Attribute with no added untrained penalty.`,
  };
}

function normalResolution(
  input: ResolveCharacterWeaponGovernanceInput,
  allocationsById: ReadonlyMap<number, CharacterWeaponAllocation>,
  allocationPaths: ReadonlyMap<number, AllocationPathResult>,
  ranks: ReadonlyMap<number, number>,
  skillsById: ReadonlyMap<number, CharacterSkillReference>,
): CharacterWeaponNormalResolution {
  if (input.context.npcKind === "creature") {
    return {
      status: "needs-god-ruling",
      reason: "unsupported-creature-governance",
      canonicalSource: null,
      alternatives: [],
      explanation: "Creature NPCs do not acquire Character Skill ownership; a manufactured weapon needs an explicit supported override or ruling.",
    };
  }
  const modeScopes = input.governance.modes.map(({ scope }) => scope);
  let applicable: ReturnType<typeof selectApplicableCanonicalWeaponSkillPaths>;
  try {
    applicable = selectApplicableCanonicalWeaponSkillPaths(
      input.governance.weaponDefault,
      modeScopes,
      input.context.firingModeId,
    );
  } catch (error) {
    return {
      status: "needs-god-ruling",
      reason: "invalid-canonical-path",
      canonicalSource: null,
      alternatives: [],
      explanation: error instanceof Error ? error.message : "The selected firing mode is invalid.",
    };
  }
  if (!applicable.options.length) {
    const selectedScope = applicable.source === "firing-mode"
      ? input.governance.modes.find(({ id }) => id === input.context.firingModeId)?.scope
      : input.governance.weaponDefault;
    const invalid = selectedScope?.options.some(({ path }) => !path.valid) ?? false;
    return {
      status: "needs-god-ruling",
      reason: invalid ? "invalid-canonical-path" : "missing-canonical-path",
      canonicalSource: applicable.source,
      alternatives: [],
      explanation: invalid
        ? "Applicable canonical governance contains no usable approved path because its authored path is invalid."
        : "No approved canonical governing Skill path applies to this weapon and firing mode.",
    };
  }
  const alternatives = applicable.options.map((option) => resolveCanonicalOption(
    input,
    option,
    allocationsById,
    allocationPaths,
    ranks,
    skillsById,
  ));
  if (alternatives.some(
    (alternative) => alternative.status === "unresolved"
      && alternative.reason === "invalid-character-allocation-lineage",
  )) {
    return {
      status: "needs-god-ruling",
      reason: "invalid-character-allocation-lineage",
      canonicalSource: applicable.source,
      alternatives,
      explanation: "At least one applicable canonical path has indistinguishable or malformed Character allocation ancestry.",
    };
  }
  const resolved = alternatives.filter(
    (alternative): alternative is CharacterWeaponCanonicalAlternative & { status: "resolved" } =>
      alternative.status === "resolved",
  );
  if (!resolved.length) {
    const first = alternatives[0];
    return {
      status: "needs-god-ruling",
      reason: first?.status === "unresolved" ? first.reason : "invalid-canonical-path",
      canonicalSource: applicable.source,
      alternatives,
      explanation: "Every applicable approved canonical path requires a G.O.D. ruling for this Character.",
    };
  }
  const bestTarget = Math.min(...resolved.map(({ source }) => source.originalTarget));
  const tied = resolved.filter(({ source }) => source.originalTarget === bestTarget);
  return {
    status: "resolved",
    canonicalSource: applicable.source,
    alternatives,
    selectedAlternative: tied[0]!,
    tiedCanonicalMappingIds: tied.map(({ canonicalMappingId }) => canonicalMappingId),
    hasTie: tied.length > 1,
  };
}

function resolveExplicitSelection(
  input: ResolveCharacterWeaponGovernanceInput,
  selection: CharacterWeaponGoverningSelection,
  allocationsById: ReadonlyMap<number, CharacterWeaponAllocation>,
  allocationPaths: ReadonlyMap<number, AllocationPathResult>,
  ranks: ReadonlyMap<number, number>,
  skillsById: ReadonlyMap<number, CharacterSkillReference>,
): ResolvedSelection | null {
  if (selection.kind === "attribute") {
    return resolveAttributeSelection(input.context, input.attributes, selection.attributeKey);
  }
  if (input.context.npcKind === "creature") return null;
  const allocation = allocationsById.get(selection.allocationId);
  const path = allocation ? allocationPaths.get(allocation.id) : null;
  if (!allocation || allocation.characterId !== input.context.characterId || !path?.valid) return null;
  return resolveSkillSelection(input, allocation, path.allocations, ranks, skillsById);
}

function normalizedReason(reason: string): string | null {
  if (typeof reason !== "string") return null;
  const normalized = reason.trim();
  return normalized && normalized.length <= 1000 ? normalized : null;
}

function resultContext(input: ResolveCharacterWeaponGovernanceInput): CharacterWeaponGovernanceContext {
  return input.context;
}

export function resolveCharacterWeaponGovernance(
  input: ResolveCharacterWeaponGovernanceInput,
): CharacterWeaponGovernanceResult {
  if (
    input.governance.itemId !== input.context.itemId
    || input.governance.weaponProfileId !== input.context.weaponProfileId
    || input.governance.weaponCanonicalId !== input.context.weaponCanonicalId
  ) {
    throw new Error("Canonical weapon governance does not match the requested Item and Weapon Profile identity.");
  }
  const allocationsById = new Map<number, CharacterWeaponAllocation>();
  const duplicateAllocationIds = new Set<number>();
  for (const allocation of input.allocations) {
    if (allocationsById.has(allocation.id)) duplicateAllocationIds.add(allocation.id);
    else allocationsById.set(allocation.id, allocation);
  }
  const parentRelationships = new Set(
    input.skillRelationships
      .filter(({ relationshipType }) => relationshipType.trim().toLocaleLowerCase("en-US") === "parent")
      .map(({ skillId, relatedSkillId }) => `${skillId}:${relatedSkillId}`),
  );
  const allocationPaths = new Map<number, AllocationPathResult>();
  for (const allocation of input.allocations) {
    allocationPaths.set(
      allocation.id,
      duplicateAllocationIds.has(allocation.id)
        ? { valid: false, explanation: `Allocation identity #${allocation.id} appears more than once.` }
        : allocationPath(
            allocation,
            allocationsById,
            input.context.characterId,
            parentRelationships,
          ),
    );
  }
  const skillsById = new Map(input.skillCatalog.map((entry) => [entry.id, entry]));
  const ranks = getCharacterSkillRanks(characterDraft(input), input.skillCatalog, input.race ?? null);
  const normal = normalResolution(input, allocationsById, allocationPaths, ranks, skillsById);

  const oneAction = input.oneActionOverride ?? null;
  if (oneAction) {
    const reason = normalizedReason(oneAction.reason);
    let resolved: ResolvedSelection | null = null;
    if (reason && oneAction.kind === "manual") {
      const label = typeof oneAction.label === "string" ? oneAction.label.trim() : "";
      if (
        label
        && label.length <= 200
        && Number.isFinite(oneAction.originalTarget)
        && Math.abs(oneAction.originalTarget) <= PERCENTILE_NUMERIC_BOUND
      ) {
        resolved = {
          source: { kind: "manual", label, originalTarget: oneAction.originalTarget },
          rollGoverningSource: { kind: "manual", label, originalTarget: oneAction.originalTarget },
          rollGoverningSourceSnapshot: { kind: "manual", label, originalTarget: oneAction.originalTarget },
        };
      }
    } else if (reason && oneAction.kind !== "manual") {
      resolved = resolveExplicitSelection(
        input,
        oneAction,
        allocationsById,
        allocationPaths,
        ranks,
        skillsById,
      );
    }
    if (!reason || !resolved) {
      return {
        ...resultContext(input),
        status: "needs-god-ruling",
        reason: "invalid-one-action-override",
        explanation: "The one-action override has no valid exact source and required bounded reason.",
        normalResolution: normal,
        persistentOverrideId: null,
      };
    }
    return {
      ...resultContext(input),
      status: "resolved-one-action-override",
      resolutionSource: "one-action-override",
      source: resolved.source,
      originalTarget: resolved.source.originalTarget,
      canonicalMappingId: null,
      canonicalPath: null,
      normalResolution: normal,
      persistentOverrideId: input.persistentOverride?.id ?? null,
      overrideReason: reason,
      explanation: `One-action G.O.D. override replaced normal governance for this resolution only: ${reason}`,
      rollGoverningSource: resolved.rollGoverningSource,
      rollGoverningSourceSnapshot: resolved.rollGoverningSourceSnapshot,
    };
  }

  const persistent = input.persistentOverride ?? null;
  if (persistent) {
    const identityMatches = persistent.campaignId === input.context.campaignId
      && persistent.characterId === input.context.characterId
      && persistent.itemId === input.context.itemId
      && persistent.weaponProfileId === input.context.weaponProfileId
      && (persistent.firingModeId === null || persistent.firingModeId === input.context.firingModeId);
    const reason = normalizedReason(persistent.reason);
    const resolved = identityMatches && reason
      ? resolveExplicitSelection(
          input,
          persistent.selection,
          allocationsById,
          allocationPaths,
          ranks,
          skillsById,
        )
      : null;
    if (!resolved || !reason) {
      return {
        ...resultContext(input),
        status: "override-invalid",
        reason: "The persisted override no longer identifies a valid exact Character governing source for this scope.",
        explanation: "The invalid persistent override remains visible and blocks silent fallback to normal governance.",
        normalResolution: normal,
        persistentOverrideId: persistent.id,
      };
    }
    return {
      ...resultContext(input),
      status: "resolved-persistent-override",
      resolutionSource: "persistent-override",
      source: resolved.source,
      originalTarget: resolved.source.originalTarget,
      canonicalMappingId: null,
      canonicalPath: null,
      normalResolution: normal,
      persistentOverrideId: persistent.id,
      overrideReason: reason,
      explanation: `Persistent G.O.D. override #${persistent.id} replaced normal governance: ${reason}`,
      rollGoverningSource: resolved.rollGoverningSource,
      rollGoverningSourceSnapshot: resolved.rollGoverningSourceSnapshot,
    };
  }

  if (normal.status === "needs-god-ruling") {
    return {
      ...resultContext(input),
      status: "needs-god-ruling",
      reason: normal.reason,
      explanation: normal.explanation,
      normalResolution: normal,
      persistentOverrideId: null,
    };
  }
  const selected = normal.selectedAlternative;
  return {
    ...resultContext(input),
    status: "resolved-normal",
    resolutionSource: "normal",
    source: selected.source,
    originalTarget: selected.source.originalTarget,
    canonicalMappingId: selected.canonicalMappingId,
    canonicalPath: selected.canonicalPath,
    normalResolution: normal,
    persistentOverrideId: null,
    overrideReason: null,
    explanation: `Normal canonical governance selected mapping #${selected.canonicalMappingId}. ${selected.explanation}`,
    rollGoverningSource: selected.rollGoverningSource,
    rollGoverningSourceSnapshot: selected.rollGoverningSourceSnapshot,
  };
}
