export const WEAPON_SKILL_GOVERNANCE_REVIEW_STATES = ["review-required", "approved"] as const;

export type WeaponSkillGovernanceReviewState =
  (typeof WEAPON_SKILL_GOVERNANCE_REVIEW_STATES)[number];

export type CanonicalSkillDefinition = Readonly<{
  id: number;
  name: string;
  classification: string;
  tier: number | null;
  primaryAttribute: string | null;
  secondaryAttribute: string | null;
}>;

export type CanonicalSkillParentRelationship = Readonly<{
  id: number;
  skillId: number;
  relatedSkillId: number;
  relationshipType: string;
  sortOrder: number;
}>;

export const CANONICAL_SKILL_PATH_PROBLEM_CODES = [
  "missing-endpoint",
  "duplicate-skill-identity",
  "ambiguous-parent",
  "broken-parent",
  "cycle",
  "missing-attribute",
] as const;

export type CanonicalSkillPathProblemCode =
  (typeof CANONICAL_SKILL_PATH_PROBLEM_CODES)[number];

export type CanonicalSkillPathProblem = Readonly<{
  code: CanonicalSkillPathProblemCode;
  message: string;
  skillId: number | null;
}>;

export type CanonicalSkillPathNode = CanonicalSkillDefinition;

export type CanonicalSkillPathValidation = Readonly<{
  endpointSkillId: number;
  valid: boolean;
  endpointToRoot: readonly CanonicalSkillPathNode[];
  rootToEndpoint: readonly CanonicalSkillPathNode[];
  fallbackAttribute: string | null;
  authoredAttributes: readonly string[];
  problems: readonly CanonicalSkillPathProblem[];
}>;

function normalizedAttribute(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function invalidPath(
  endpointSkillId: number,
  endpointToRoot: readonly CanonicalSkillPathNode[],
  problems: readonly CanonicalSkillPathProblem[],
): CanonicalSkillPathValidation {
  return {
    endpointSkillId,
    valid: false,
    endpointToRoot,
    rootToEndpoint: [...endpointToRoot].reverse(),
    fallbackAttribute: null,
    authoredAttributes: [],
    problems,
  };
}

export function validateCanonicalSkillPath(
  endpointSkillId: number,
  skills: readonly CanonicalSkillDefinition[],
  relationships: readonly CanonicalSkillParentRelationship[],
): CanonicalSkillPathValidation {
  if (!Number.isSafeInteger(endpointSkillId) || endpointSkillId <= 0) {
    return invalidPath(endpointSkillId, [], [{
      code: "missing-endpoint",
      message: `Endpoint Skill #${endpointSkillId} is invalid or missing.`,
      skillId: endpointSkillId,
    }]);
  }

  const skillsById = new Map<number, CanonicalSkillDefinition>();
  const duplicateIds = new Set<number>();
  for (const candidate of skills) {
    if (skillsById.has(candidate.id)) duplicateIds.add(candidate.id);
    else skillsById.set(candidate.id, candidate);
  }
  if (duplicateIds.has(endpointSkillId)) {
    return invalidPath(endpointSkillId, [], [{
      code: "duplicate-skill-identity",
      message: `Endpoint Skill identity #${endpointSkillId} appears more than once in the canonical Skill catalog.`,
      skillId: endpointSkillId,
    }]);
  }

  const endpoint = skillsById.get(endpointSkillId);
  if (!endpoint) {
    return invalidPath(endpointSkillId, [], [{
      code: "missing-endpoint",
      message: `Endpoint Skill #${endpointSkillId} does not exist.`,
      skillId: endpointSkillId,
    }]);
  }

  const parentRelationships = new Map<number, CanonicalSkillParentRelationship[]>();
  for (const relationship of relationships) {
    if (relationship.relationshipType.trim().toLocaleLowerCase("en-US") !== "parent") continue;
    const current = parentRelationships.get(relationship.skillId) ?? [];
    current.push(relationship);
    parentRelationships.set(relationship.skillId, current);
  }

  const endpointToRoot: CanonicalSkillPathNode[] = [];
  const visited = new Set<number>();
  let current = endpoint;
  while (true) {
    if (visited.has(current.id)) {
      return invalidPath(endpointSkillId, endpointToRoot, [{
        code: "cycle",
        message: `The canonical parent route cycles back to Skill #${current.id} (${current.name}).`,
        skillId: current.id,
      }]);
    }
    visited.add(current.id);
    endpointToRoot.push(current);

    const parentEdges = parentRelationships.get(current.id) ?? [];
    const distinctParentIds = [...new Set(parentEdges.map(({ relatedSkillId }) => relatedSkillId))];
    if (distinctParentIds.length > 1) {
      return invalidPath(endpointSkillId, endpointToRoot, [{
        code: "ambiguous-parent",
        message: `Skill #${current.id} (${current.name}) has multiple authored parents: ${distinctParentIds.map((id) => `#${id}`).join(", ")}.`,
        skillId: current.id,
      }]);
    }
    if (distinctParentIds.length === 0) break;

    const parentId = distinctParentIds[0]!;
    if (duplicateIds.has(parentId)) {
      return invalidPath(endpointSkillId, endpointToRoot, [{
        code: "duplicate-skill-identity",
        message: `Parent Skill identity #${parentId} appears more than once in the canonical Skill catalog.`,
        skillId: parentId,
      }]);
    }
    const parent = skillsById.get(parentId);
    if (!parent) {
      return invalidPath(endpointSkillId, endpointToRoot, [{
        code: "broken-parent",
        message: `Skill #${current.id} (${current.name}) references missing parent Skill #${parentId}.`,
        skillId: current.id,
      }]);
    }
    current = parent;
  }

  const rootToEndpoint = [...endpointToRoot].reverse();
  const root = rootToEndpoint[0]!;
  const rootPrimaryAttribute = normalizedAttribute(root.primaryAttribute);
  const normalizedRootName = root.name.trim().toLocaleLowerCase("en-US");
  const fallbackAttribute =
    normalizedRootName === "spellcraft" || normalizedRootName === "talismanism"
      ? "INT"
      : normalizedRootName === "faith"
        ? "WIS"
        : rootPrimaryAttribute;
  const authoredAttributes = [...new Set(rootToEndpoint.flatMap((node) => [
    normalizedAttribute(node.primaryAttribute),
    normalizedAttribute(node.secondaryAttribute),
  ]).filter((value): value is string => value !== null))].sort((left, right) => left.localeCompare(right));
  const problems: CanonicalSkillPathProblem[] = [];
  if (fallbackAttribute === null) {
    problems.push({
      code: "missing-attribute",
      message: `Root Skill #${root.id} (${root.name}) has no authored primary Attribute for fallback.`,
      skillId: root.id,
    });
  }

  return {
    endpointSkillId,
    valid: problems.length === 0,
    endpointToRoot,
    rootToEndpoint,
    fallbackAttribute: problems.length === 0 ? fallbackAttribute : null,
    authoredAttributes,
    problems,
  };
}

/**
 * Validates one explicitly selected root-to-endpoint route. Unlike the global
 * weapon validator, an authored multi-parent Skill is valid here only because
 * the caller has preserved the exact parent route that was selected.
 */
export function validateSelectedCanonicalSkillPath(
  rootToEndpointIds: readonly number[],
  skills: readonly CanonicalSkillDefinition[],
  relationships: readonly CanonicalSkillParentRelationship[],
): CanonicalSkillPathValidation {
  const endpointSkillId = rootToEndpointIds.at(-1) ?? 0;
  if (!rootToEndpointIds.length) return invalidPath(endpointSkillId, [], [{
    code: "missing-endpoint",
    message: "An exact canonical Skill route is required.",
    skillId: null,
  }]);
  const skillsById = new Map<number, CanonicalSkillDefinition>();
  const duplicateIds = new Set<number>();
  for (const candidate of skills) {
    if (skillsById.has(candidate.id)) duplicateIds.add(candidate.id);
    else skillsById.set(candidate.id, candidate);
  }
  const nodes: CanonicalSkillDefinition[] = [];
  const seen = new Set<number>();
  for (const skillId of rootToEndpointIds) {
    if (seen.has(skillId)) return invalidPath(endpointSkillId, [...nodes].reverse(), [{
      code: "cycle",
      message: `The selected canonical route repeats Skill #${skillId}.`,
      skillId,
    }]);
    seen.add(skillId);
    if (duplicateIds.has(skillId)) return invalidPath(endpointSkillId, [...nodes].reverse(), [{
      code: "duplicate-skill-identity",
      message: `Skill identity #${skillId} appears more than once in the canonical Skill catalog.`,
      skillId,
    }]);
    const node = skillsById.get(skillId);
    if (!node) return invalidPath(endpointSkillId, [...nodes].reverse(), [{
      code: "broken-parent",
      message: `The selected route references missing Skill #${skillId}.`,
      skillId,
    }]);
    nodes.push(node);
  }
  const parentEdges = relationships.filter(({ relationshipType }) => (
    relationshipType.trim().toLocaleLowerCase("en-US") === "parent"
  ));
  const rootParents = new Set(parentEdges.filter(({ skillId }) => skillId === nodes[0]!.id).map(({ relatedSkillId }) => relatedSkillId));
  if (rootParents.size) return invalidPath(endpointSkillId, [...nodes].reverse(), [{
    code: "broken-parent",
    message: `The selected route stops before the authored parent of Skill #${nodes[0]!.id} (${nodes[0]!.name}).`,
    skillId: nodes[0]!.id,
  }]);
  for (let index = 1; index < nodes.length; index += 1) {
    const child = nodes[index]!;
    const parent = nodes[index - 1]!;
    if (!parentEdges.some((edge) => edge.skillId === child.id && edge.relatedSkillId === parent.id)) {
      return invalidPath(endpointSkillId, [...nodes].reverse(), [{
        code: "broken-parent",
        message: `Skill #${child.id} (${child.name}) is not authored beneath Skill #${parent.id} (${parent.name}).`,
        skillId: child.id,
      }]);
    }
  }
  const root = nodes[0]!;
  const normalizedRootName = root.name.trim().toLocaleLowerCase("en-US");
  const rootPrimaryAttribute = normalizedAttribute(root.primaryAttribute);
  const fallbackAttribute = normalizedRootName === "spellcraft" || normalizedRootName === "talismanism"
    ? "INT"
    : normalizedRootName === "faith"
      ? "WIS"
      : rootPrimaryAttribute;
  const authoredAttributes = [...new Set(nodes.flatMap((node) => [
    normalizedAttribute(node.primaryAttribute),
    normalizedAttribute(node.secondaryAttribute),
  ]).filter((value): value is string => value !== null))].sort((left, right) => left.localeCompare(right));
  const problems: CanonicalSkillPathProblem[] = fallbackAttribute === null ? [{
    code: "missing-attribute",
    message: `Root Skill #${root.id} (${root.name}) has no authored primary Attribute for fallback.`,
    skillId: root.id,
  }] : [];
  return {
    endpointSkillId,
    valid: problems.length === 0,
    endpointToRoot: [...nodes].reverse(),
    rootToEndpoint: nodes,
    fallbackAttribute: problems.length ? null : fallbackAttribute,
    authoredAttributes,
    problems,
  };
}

/** Returns every exact canonical ancestry alternative for a broad endpoint. */
export function enumerateCanonicalSkillPathAlternatives(
  endpointSkillId: number,
  skills: readonly CanonicalSkillDefinition[],
  relationships: readonly CanonicalSkillParentRelationship[],
): CanonicalSkillPathValidation[] {
  const parentsBySkill = new Map<number, number[]>();
  for (const relationship of relationships) {
    if (relationship.relationshipType.trim().toLocaleLowerCase("en-US") !== "parent") continue;
    const parents = parentsBySkill.get(relationship.skillId) ?? [];
    if (!parents.includes(relationship.relatedSkillId)) parents.push(relationship.relatedSkillId);
    parentsBySkill.set(relationship.skillId, parents);
  }
  const routes: number[][] = [];
  const walk = (current: number, endpointToRoot: number[], seen: ReadonlySet<number>): void => {
    if (seen.has(current)) return;
    const nextSeen = new Set(seen).add(current);
    const route = [...endpointToRoot, current];
    const parents = parentsBySkill.get(current) ?? [];
    if (!parents.length) {
      routes.push([...route].reverse());
      return;
    }
    for (const parentId of parents) walk(parentId, route, nextSeen);
  };
  walk(endpointSkillId, [], new Set());
  if (!routes.length) return [validateCanonicalSkillPath(endpointSkillId, skills, relationships)];
  return routes.map((route) => validateSelectedCanonicalSkillPath(route, skills, relationships));
}

export type CanonicalWeaponSkillOption = Readonly<{
  id: number;
  firingModeId: number | null;
  endpointSkillId: number;
  reviewState: WeaponSkillGovernanceReviewState;
  sortOrder: number;
  notes: string;
  path: CanonicalSkillPathValidation;
}>;

export type CanonicalWeaponSkillScope = Readonly<{
  firingModeId: number | null;
  options: readonly CanonicalWeaponSkillOption[];
}>;

export type ApplicableCanonicalWeaponSkillPaths = Readonly<{
  source: "weapon-default" | "firing-mode";
  firingModeId: number | null;
  options: readonly CanonicalWeaponSkillOption[];
}>;

function approvedOptions(scope: CanonicalWeaponSkillScope): CanonicalWeaponSkillOption[] {
  return scope.options
    .filter(({ reviewState, path }) => reviewState === "approved" && path.valid)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id);
}

export function selectApplicableCanonicalWeaponSkillPaths(
  weaponDefault: CanonicalWeaponSkillScope,
  modes: readonly CanonicalWeaponSkillScope[],
  firingModeId: number | null,
): ApplicableCanonicalWeaponSkillPaths {
  if (firingModeId !== null) {
    const mode = modes.find((candidate) => candidate.firingModeId === firingModeId);
    if (!mode) throw new Error(`Firing Mode #${firingModeId} does not belong to this Weapon Profile.`);
    const modeOptions = approvedOptions(mode);
    if (modeOptions.length) {
      return { source: "firing-mode", firingModeId, options: modeOptions };
    }
  }
  return {
    source: "weapon-default",
    firingModeId: null,
    options: approvedOptions(weaponDefault),
  };
}
