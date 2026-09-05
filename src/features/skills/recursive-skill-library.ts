export const CORE_SKILL_ATTRIBUTE_KEYS = [
  "STR",
  "DEX",
  "CON",
  "INT",
  "WIS",
  "CHA",
] as const;

export const REVIEW_REQUIRED_ATTRIBUTE_KEY = "REVIEW_REQUIRED";

export type CanonicalSkillDefinition = Readonly<{
  id: number;
  name: string;
  classification: string;
  tier: number | null;
  primaryAttribute: string | null;
  secondaryAttribute: string | null;
}>;

export type RecursiveSkillDefinition = CanonicalSkillDefinition & Readonly<{
  definition?: string;
  sourceSystem?: string | null;
  sourceExternalId?: string | null;
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

export const SKILL_HIERARCHY_REVIEW_CODES = [
  "duplicate-skill-identity",
  "duplicate-relationship",
  "multiple-parents",
  "cycle",
  "broken-parent",
  "broken-child",
  "missing-root-attribute",
  "conflicting-governing-roots",
  "descendant-attribute-difference",
] as const;

export type SkillHierarchyReviewCode =
  (typeof SKILL_HIERARCHY_REVIEW_CODES)[number];

export type SkillHierarchyReviewReason = Readonly<{
  code: SkillHierarchyReviewCode;
  severity: "review" | "notice";
  message: string;
  skillId: number | null;
  relationshipIds: readonly number[];
}>;

export type RecursiveSkillNode = RecursiveSkillDefinition & Readonly<{
  parentIds: readonly number[];
  childIds: readonly number[];
  reviewReasons: readonly SkillHierarchyReviewReason[];
}>;

export type RecursiveSkillPath = Readonly<{
  key: string;
  rootSkillId: number;
  endpointSkillId: number;
  rootToEndpointIds: readonly number[];
  endpointToRootIds: readonly number[];
  rootToEndpointNames: readonly string[];
  effectiveAttribute: string | null;
  attributeGroupKey: string;
  reviewReasons: readonly SkillHierarchyReviewReason[];
}>;

export type RecursiveSkillRoot = Readonly<{
  skillId: number;
  name: string;
  effectiveAttribute: string | null;
  attributeGroupKey: string;
  immediateChildCount: number;
  reviewReasons: readonly SkillHierarchyReviewReason[];
}>;

export type RecursiveSkillAttributeGroup = Readonly<{
  key: string;
  label: string;
  rootSkillIds: readonly number[];
}>;

export type RecursiveSkillLibrary = Readonly<{
  skills: readonly RecursiveSkillNode[];
  relationships: readonly CanonicalSkillParentRelationship[];
  roots: readonly RecursiveSkillRoot[];
  attributeGroups: readonly RecursiveSkillAttributeGroup[];
  paths: readonly RecursiveSkillPath[];
  reviewReasons: readonly SkillHierarchyReviewReason[];
  duplicateNames: readonly Readonly<{
    normalizedName: string;
    name: string;
    skillIds: readonly number[];
  }>[];
  maximumDepth: number;
}>;

export type RecursiveSkillSearchResult = Readonly<{
  skill: RecursiveSkillNode;
  path: RecursiveSkillPath;
  lineageLabel: string;
}>;

export type SkillStructureChangePreview = Readonly<{
  skillId: number | null;
  oldParentIds: readonly number[];
  proposedParentIds: readonly number[];
  oldPaths: readonly RecursiveSkillPath[];
  proposedPaths: readonly RecursiveSkillPath[];
  affectedSkillIds: readonly number[];
  structurallySignificant: boolean;
  ambiguousMultipleParents: boolean;
  requiresConfirmation: boolean;
  validationErrors: readonly string[];
  reviewReasons: readonly SkillHierarchyReviewReason[];
}>;

function normalizeRelationshipType(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function normalizedAttribute(value: string | null): string | null {
  const normalized = value?.trim().toUpperCase() ?? "";
  return normalized || null;
}

function trimmedAttribute(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function normalizedName(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function compareText(left: string, right: string): number {
  const normalizedLeft = normalizedName(left);
  const normalizedRight = normalizedName(right);
  if (normalizedLeft < normalizedRight) return -1;
  if (normalizedLeft > normalizedRight) return 1;
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareNumbers(left: number, right: number): number {
  return left - right;
}

function uniqueNumbers(values: readonly number[]): number[] {
  return [...new Set(values)];
}

function relationshipIsParent(
  relationship: CanonicalSkillParentRelationship,
): boolean {
  return normalizeRelationshipType(relationship.relationshipType) === "parent";
}

export function getEffectiveRootAttribute(
  root: CanonicalSkillDefinition,
): string | null {
  const normalizedRootName = normalizedName(root.name);
  if (normalizedRootName === "spellcraft" || normalizedRootName === "talismanism") return "INT";
  if (normalizedRootName === "faith") return "WIS";
  return normalizedAttribute(root.primaryAttribute);
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
    if (!relationshipIsParent(relationship)) continue;
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
    const distinctParentIds = uniqueNumbers(parentEdges.map(({ relatedSkillId }) => relatedSkillId));
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
  const normalizedRootName = normalizedName(root.name);
  const fallbackAttribute = normalizedRootName === "spellcraft" || normalizedRootName === "talismanism"
    ? "INT"
    : normalizedRootName === "faith"
      ? "WIS"
      : trimmedAttribute(root.primaryAttribute);
  const authoredAttributes = [...new Set(rootToEndpoint.flatMap((node) => [
    trimmedAttribute(node.primaryAttribute),
    trimmedAttribute(node.secondaryAttribute),
  ]).filter((value): value is string => value !== null))].sort(compareText);
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
  const parentEdges = relationships.filter(relationshipIsParent);
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
  const normalizedRootName = normalizedName(root.name);
  const fallbackAttribute = normalizedRootName === "spellcraft" || normalizedRootName === "talismanism"
    ? "INT"
    : normalizedRootName === "faith"
      ? "WIS"
      : trimmedAttribute(root.primaryAttribute);
  const authoredAttributes = [...new Set(nodes.flatMap((node) => [
    trimmedAttribute(node.primaryAttribute),
    trimmedAttribute(node.secondaryAttribute),
  ]).filter((value): value is string => value !== null))].sort(compareText);
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

export function enumerateCanonicalSkillPathAlternatives(
  endpointSkillId: number,
  skills: readonly CanonicalSkillDefinition[],
  relationships: readonly CanonicalSkillParentRelationship[],
): CanonicalSkillPathValidation[] {
  const parentsBySkill = new Map<number, number[]>();
  for (const relationship of relationships) {
    if (!relationshipIsParent(relationship)) continue;
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

function addReason(
  reasons: SkillHierarchyReviewReason[],
  reason: SkillHierarchyReviewReason,
): void {
  if (reasons.some((candidate) => (
    candidate.code === reason.code &&
    candidate.skillId === reason.skillId &&
    candidate.message === reason.message
  ))) return;
  reasons.push(reason);
}

function reasonsForPath(
  pathIds: readonly number[],
  reasonsBySkill: ReadonlyMap<number, readonly SkillHierarchyReviewReason[]>,
): SkillHierarchyReviewReason[] {
  const result: SkillHierarchyReviewReason[] = [];
  for (const skillId of pathIds) {
    for (const reason of reasonsBySkill.get(skillId) ?? []) addReason(result, reason);
  }
  return result;
}

export function buildRecursiveSkillLibrary(
  skillRows: readonly RecursiveSkillDefinition[],
  relationshipRows: readonly CanonicalSkillParentRelationship[],
): RecursiveSkillLibrary {
  const skillsById = new Map<number, RecursiveSkillDefinition>();
  const reasons: SkillHierarchyReviewReason[] = [];
  const reasonsBySkill = new Map<number, SkillHierarchyReviewReason[]>();
  const recordReason = (reason: SkillHierarchyReviewReason) => {
    addReason(reasons, reason);
    if (reason.skillId === null) return;
    const current = reasonsBySkill.get(reason.skillId) ?? [];
    addReason(current, reason);
    reasonsBySkill.set(reason.skillId, current);
  };

  for (const row of skillRows) {
    if (skillsById.has(row.id)) {
      recordReason({
        code: "duplicate-skill-identity",
        severity: "review",
        message: `Skill identity #${row.id} appears more than once in the loaded catalog.`,
        skillId: row.id,
        relationshipIds: [],
      });
      continue;
    }
    skillsById.set(row.id, row);
  }

  const parentRelationships = relationshipRows.filter(relationshipIsParent);
  const duplicateRelationships = new Map<string, CanonicalSkillParentRelationship[]>();
  for (const edge of relationshipRows) {
    const key = `${edge.skillId}:${edge.relatedSkillId}:${normalizeRelationshipType(edge.relationshipType)}`;
    const current = duplicateRelationships.get(key) ?? [];
    current.push(edge);
    duplicateRelationships.set(key, current);
  }
  for (const duplicates of duplicateRelationships.values()) {
    if (duplicates.length < 2) continue;
    const edge = duplicates[0]!;
    recordReason({
      code: "duplicate-relationship",
      severity: "review",
      message: `Skill #${edge.skillId} repeats the ${edge.relationshipType} relationship to Skill #${edge.relatedSkillId}.`,
      skillId: skillsById.has(edge.skillId) ? edge.skillId : null,
      relationshipIds: duplicates.map(({ id }) => id),
    });
  }

  const validParentEdges: CanonicalSkillParentRelationship[] = [];
  const hasBrokenParent = new Set<number>();
  for (const edge of parentRelationships) {
    if (!skillsById.has(edge.skillId)) {
      recordReason({
        code: "broken-child",
        severity: "review",
        message: `Relationship #${edge.id} references missing child Skill #${edge.skillId}.`,
        skillId: null,
        relationshipIds: [edge.id],
      });
      continue;
    }
    if (!skillsById.has(edge.relatedSkillId)) {
      hasBrokenParent.add(edge.skillId);
      recordReason({
        code: "broken-parent",
        severity: "review",
        message: `Skill #${edge.skillId} references missing parent Skill #${edge.relatedSkillId}.`,
        skillId: edge.skillId,
        relationshipIds: [edge.id],
      });
      continue;
    }
    validParentEdges.push(edge);
  }

  const parentsBySkill = new Map<number, CanonicalSkillParentRelationship[]>();
  const childrenByParent = new Map<number, CanonicalSkillParentRelationship[]>();
  for (const edge of validParentEdges) {
    const parentEdges = parentsBySkill.get(edge.skillId) ?? [];
    parentEdges.push(edge);
    parentsBySkill.set(edge.skillId, parentEdges);
    const childEdges = childrenByParent.get(edge.relatedSkillId) ?? [];
    childEdges.push(edge);
    childrenByParent.set(edge.relatedSkillId, childEdges);
  }

  for (const [skillId, edges] of parentsBySkill) {
    const parentIds = uniqueNumbers(edges.map(({ relatedSkillId }) => relatedSkillId));
    if (parentIds.length > 1) {
      recordReason({
        code: "multiple-parents",
        severity: "review",
        message: `Skill #${skillId} has ${parentIds.length} genuinely different parent identities: ${parentIds.map((id) => `#${id}`).join(", ")}.`,
        skillId,
        relationshipIds: edges.map(({ id }) => id),
      });
    }
  }

  const cycleMembers = new Set<number>();
  const state = new Map<number, "visiting" | "visited">();
  const stack: number[] = [];
  const detectCycles = (skillId: number): void => {
    const currentState = state.get(skillId);
    if (currentState === "visited") return;
    if (currentState === "visiting") {
      const start = stack.lastIndexOf(skillId);
      for (const member of stack.slice(Math.max(0, start))) cycleMembers.add(member);
      cycleMembers.add(skillId);
      return;
    }
    state.set(skillId, "visiting");
    stack.push(skillId);
    for (const parentId of uniqueNumbers((parentsBySkill.get(skillId) ?? []).map(({ relatedSkillId }) => relatedSkillId))) {
      detectCycles(parentId);
    }
    stack.pop();
    state.set(skillId, "visited");
  };
  for (const skillId of skillsById.keys()) detectCycles(skillId);
  for (const skillId of [...cycleMembers].sort(compareNumbers)) {
    const candidate = skillsById.get(skillId)!;
    recordReason({
      code: "cycle",
      severity: "review",
      message: `Skill #${skillId} (${candidate.name}) participates in a canonical parent cycle.`,
      skillId,
      relationshipIds: (parentsBySkill.get(skillId) ?? []).map(({ id }) => id),
    });
  }

  const compareSkillIds = (leftId: number, rightId: number): number => {
    const left = skillsById.get(leftId)!;
    const right = skillsById.get(rightId)!;
    return compareText(left.name, right.name) || compareNumbers(left.id, right.id);
  };
  for (const edges of childrenByParent.values()) {
    edges.sort((left, right) => (
      left.sortOrder - right.sortOrder ||
      compareSkillIds(left.skillId, right.skillId) ||
      left.id - right.id
    ));
  }

  const ordinaryRootIds = [...skillsById.keys()]
    .filter((skillId) => (parentsBySkill.get(skillId) ?? []).length === 0)
    .sort(compareSkillIds);
  const reachable = new Set<number>();
  const markReachable = (skillId: number): void => {
    if (reachable.has(skillId)) return;
    reachable.add(skillId);
    for (const edge of childrenByParent.get(skillId) ?? []) markReachable(edge.skillId);
  };
  for (const rootId of ordinaryRootIds) markReachable(rootId);
  const syntheticRootIds: number[] = [];
  const remaining = new Set([...skillsById.keys()].filter((id) => !reachable.has(id)));
  while (remaining.size) {
    const rootId = [...remaining].sort(compareSkillIds)[0]!;
    syntheticRootIds.push(rootId);
    const removeComponent = (skillId: number): void => {
      if (!remaining.delete(skillId)) return;
      for (const edge of childrenByParent.get(skillId) ?? []) removeComponent(edge.skillId);
      for (const edge of parentsBySkill.get(skillId) ?? []) removeComponent(edge.relatedSkillId);
    };
    removeComponent(rootId);
  }
  const syntheticRoots = new Set(syntheticRootIds);
  const rootIds = [...ordinaryRootIds, ...syntheticRootIds];

  for (const rootId of ordinaryRootIds) {
    const root = skillsById.get(rootId)!;
    if (getEffectiveRootAttribute(root) === null) {
      recordReason({
        code: "missing-root-attribute",
        severity: "review",
        message: `Root Skill #${rootId} (${root.name}) has no authored primary Attribute.`,
        skillId: rootId,
        relationshipIds: [],
      });
    }
  }

  const paths: RecursiveSkillPath[] = [];
  const seenPathKeys = new Set<string>();
  const walkPaths = (
    rootId: number,
    currentId: number,
    pathIds: readonly number[],
    forceReview: boolean,
  ): void => {
    if (pathIds.includes(currentId)) return;
    const nextPath = [...pathIds, currentId];
    const key = nextPath.join(">");
    if (seenPathKeys.has(key)) return;
    seenPathKeys.add(key);
    const root = skillsById.get(rootId)!;
    const effectiveAttribute = forceReview ? null : getEffectiveRootAttribute(root);
    paths.push({
      key,
      rootSkillId: rootId,
      endpointSkillId: currentId,
      rootToEndpointIds: nextPath,
      endpointToRootIds: [...nextPath].reverse(),
      rootToEndpointNames: nextPath.map((id) => skillsById.get(id)!.name),
      effectiveAttribute,
      attributeGroupKey: effectiveAttribute ?? REVIEW_REQUIRED_ATTRIBUTE_KEY,
      reviewReasons: reasonsForPath(nextPath, reasonsBySkill),
    });
    for (const edge of childrenByParent.get(currentId) ?? []) {
      walkPaths(rootId, edge.skillId, nextPath, forceReview);
    }
  };
  for (const rootId of rootIds) {
    walkPaths(
      rootId,
      rootId,
      [],
      syntheticRoots.has(rootId) || hasBrokenParent.has(rootId),
    );
  }

  const effectiveAttributesBySkill = new Map<number, Set<string>>();
  for (const path of paths) {
    if (path.effectiveAttribute === null) continue;
    const attributes = effectiveAttributesBySkill.get(path.endpointSkillId) ?? new Set<string>();
    attributes.add(path.effectiveAttribute);
    effectiveAttributesBySkill.set(path.endpointSkillId, attributes);
  }
  for (const [skillId, attributes] of effectiveAttributesBySkill) {
    if (attributes.size < 2) continue;
    recordReason({
      code: "conflicting-governing-roots",
      severity: "review",
      message: `Skill #${skillId} resolves through roots governed by ${[...attributes].sort(compareText).join(" and ")}.`,
      skillId,
      relationshipIds: (parentsBySkill.get(skillId) ?? []).map(({ id }) => id),
    });
  }
  for (const path of paths) {
    if (path.rootToEndpointIds.length < 2 || path.effectiveAttribute === null) continue;
    const endpoint = skillsById.get(path.endpointSkillId)!;
    const authored = normalizedAttribute(endpoint.primaryAttribute);
    if (authored === null || authored === path.effectiveAttribute) continue;
    recordReason({
      code: "descendant-attribute-difference",
      severity: "notice",
      message: `Skill #${endpoint.id} authors ${authored}, while its governing root keeps this lineage in ${path.effectiveAttribute}.`,
      skillId: endpoint.id,
      relationshipIds: [],
    });
  }

  const nodes = [...skillsById.values()]
    .sort((left, right) => compareText(left.name, right.name) || left.id - right.id)
    .map<RecursiveSkillNode>((row) => ({
      ...row,
      parentIds: uniqueNumbers((parentsBySkill.get(row.id) ?? []).map(({ relatedSkillId }) => relatedSkillId)),
      childIds: uniqueNumbers((childrenByParent.get(row.id) ?? []).map(({ skillId }) => skillId)),
      reviewReasons: reasonsBySkill.get(row.id) ?? [],
    }));

  const roots = rootIds.map<RecursiveSkillRoot>((skillId) => {
    const row = skillsById.get(skillId)!;
    const forceReview = syntheticRoots.has(skillId) || hasBrokenParent.has(skillId);
    const effectiveAttribute = forceReview ? null : getEffectiveRootAttribute(row);
    return {
      skillId,
      name: row.name,
      effectiveAttribute,
      attributeGroupKey: effectiveAttribute ?? REVIEW_REQUIRED_ATTRIBUTE_KEY,
      immediateChildCount: uniqueNumbers((childrenByParent.get(skillId) ?? []).map(({ skillId: childId }) => childId)).length,
      reviewReasons: reasonsBySkill.get(skillId) ?? [],
    };
  }).sort((left, right) => compareText(left.name, right.name) || left.skillId - right.skillId);

  const groupRoots = new Map<string, number[]>();
  for (const root of roots) {
    const current = groupRoots.get(root.attributeGroupKey) ?? [];
    current.push(root.skillId);
    groupRoots.set(root.attributeGroupKey, current);
  }
  const customKeys = [...groupRoots.keys()]
    .filter((key) => !CORE_SKILL_ATTRIBUTE_KEYS.includes(key as (typeof CORE_SKILL_ATTRIBUTE_KEYS)[number]) && key !== REVIEW_REQUIRED_ATTRIBUTE_KEY)
    .sort(compareText);
  const groupKeys = [
    ...CORE_SKILL_ATTRIBUTE_KEYS.filter((key) => groupRoots.has(key)),
    ...customKeys,
    ...(groupRoots.has(REVIEW_REQUIRED_ATTRIBUTE_KEY) ? [REVIEW_REQUIRED_ATTRIBUTE_KEY] : []),
  ];
  const attributeGroups = groupKeys.map<RecursiveSkillAttributeGroup>((key) => ({
    key,
    label: key === REVIEW_REQUIRED_ATTRIBUTE_KEY ? "Review Required / Missing Attribute" : key,
    rootSkillIds: (groupRoots.get(key) ?? []).sort(compareSkillIds),
  }));

  const names = new Map<string, RecursiveSkillDefinition[]>();
  for (const row of skillsById.values()) {
    const key = normalizedName(row.name);
    const current = names.get(key) ?? [];
    current.push(row);
    names.set(key, current);
  }
  const duplicateNames = [...names.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([nameKey, entries]) => ({
      normalizedName: nameKey,
      name: entries[0]!.name,
      skillIds: entries.map(({ id }) => id).sort(compareNumbers),
    }))
    .sort((left, right) => compareText(left.name, right.name));

  const refreshedPaths = paths.map((path) => ({
    ...path,
    reviewReasons: reasonsForPath(path.rootToEndpointIds, reasonsBySkill),
  }));

  return {
    skills: nodes.map((node) => ({
      ...node,
      reviewReasons: reasonsBySkill.get(node.id) ?? [],
    })),
    relationships: [...relationshipRows],
    roots,
    attributeGroups,
    paths: refreshedPaths,
    reviewReasons: reasons,
    duplicateNames,
    maximumDepth: refreshedPaths.reduce((maximum, path) => Math.max(maximum, path.rootToEndpointIds.length), 0),
  };
}

export function searchRecursiveSkillLibrary(
  library: RecursiveSkillLibrary,
  query: string,
  limit = 80,
): RecursiveSkillSearchResult[] {
  const needle = query.trim().toLocaleLowerCase("en-US");
  if (!needle) return [];
  const skillsById = new Map(library.skills.map((skill) => [skill.id, skill]));
  return library.paths
    .flatMap<RecursiveSkillSearchResult>((path) => {
      const skill = skillsById.get(path.endpointSkillId);
      if (!skill) return [];
      const matches = [
        skill.name,
        String(skill.id),
        `#${skill.id}`,
        skill.classification,
        skill.primaryAttribute ?? "",
        skill.secondaryAttribute ?? "",
      ].some((value) => value.toLocaleLowerCase("en-US").includes(needle));
      if (!matches) return [];
      return [{
        skill,
        path,
        lineageLabel: path.rootToEndpointIds.map((id) => {
          const node = skillsById.get(id)!;
          return `${node.name} (#${node.id})`;
        }).join(" → "),
      }];
    })
    .sort((left, right) => (
      compareText(left.skill.name, right.skill.name) ||
      compareText(left.lineageLabel, right.lineageLabel) ||
      left.skill.id - right.skill.id
    ))
    .slice(0, Math.max(1, limit));
}

export function getRecursiveSkillPath(
  library: RecursiveSkillLibrary,
  rootToEndpointIds: readonly number[],
): RecursiveSkillPath | null {
  const key = rootToEndpointIds.join(">");
  return library.paths.find((path) => path.key === key) ?? null;
}

export function getRecursiveSkillChildren(
  library: RecursiveSkillLibrary,
  path: RecursiveSkillPath,
): RecursiveSkillPath[] {
  return library.paths.filter((candidate) => (
    candidate.rootToEndpointIds.length === path.rootToEndpointIds.length + 1 &&
    candidate.rootToEndpointIds.slice(0, -1).every((id, index) => id === path.rootToEndpointIds[index])
  ));
}

export function previewSkillStructureChange(
  library: RecursiveSkillLibrary,
  input: Readonly<{
    skillId?: number;
    skillName: string;
    proposedParentIds: readonly number[];
    proposedSkill?: Partial<Omit<RecursiveSkillDefinition, "id" | "name">>;
  }>,
): SkillStructureChangePreview {
  const skillsById = new Map(library.skills.map((skill) => [skill.id, skill]));
  const currentSkill = input.skillId === undefined ? null : skillsById.get(input.skillId) ?? null;
  const previewSkillId = currentSkill?.id ?? -1;
  const proposedParentIds = uniqueNumbers(input.proposedParentIds);
  const proposedSkill = input.proposedSkill;
  const oldParentIds = currentSkill?.parentIds ?? [];
  const validationErrors: string[] = [];
  if (proposedParentIds.includes(previewSkillId)) {
    validationErrors.push("A Skill cannot become its own parent.");
  }
  for (const parentId of proposedParentIds) {
    if (!skillsById.has(parentId)) validationErrors.push(`Parent Skill #${parentId} does not exist.`);
  }

  const previewSkills: RecursiveSkillDefinition[] = currentSkill
    ? library.skills.map((skill) => skill.id === currentSkill.id
        ? {
            ...skill,
            name: input.skillName,
            classification: proposedSkill?.classification === undefined ? skill.classification : proposedSkill.classification,
            tier: proposedSkill?.tier === undefined ? skill.tier : proposedSkill.tier,
            primaryAttribute: proposedSkill?.primaryAttribute === undefined ? skill.primaryAttribute : proposedSkill.primaryAttribute,
            secondaryAttribute: proposedSkill?.secondaryAttribute === undefined ? skill.secondaryAttribute : proposedSkill.secondaryAttribute,
            definition: proposedSkill?.definition === undefined ? skill.definition : proposedSkill.definition,
            sourceSystem: proposedSkill?.sourceSystem === undefined ? skill.sourceSystem : proposedSkill.sourceSystem,
            sourceExternalId: proposedSkill?.sourceExternalId === undefined ? skill.sourceExternalId : proposedSkill.sourceExternalId,
          }
        : skill)
    : [...library.skills, {
        id: previewSkillId,
        name: input.skillName || "Untitled Skill",
        classification: proposedSkill?.classification ?? "standard",
        tier: proposedSkill?.tier ?? null,
        primaryAttribute: proposedSkill?.primaryAttribute ?? null,
        secondaryAttribute: proposedSkill?.secondaryAttribute ?? null,
        definition: proposedSkill?.definition,
        sourceSystem: proposedSkill?.sourceSystem,
        sourceExternalId: proposedSkill?.sourceExternalId,
      }];
  const otherRelationships = library.relationships.filter((relationship) => !(
    relationshipIsParent(relationship) && relationship.skillId === previewSkillId
  ));
  const proposedRelationships = proposedParentIds.map<CanonicalSkillParentRelationship>((parentId, index) => ({
    id: -(index + 1),
    skillId: previewSkillId,
    relatedSkillId: parentId,
    relationshipType: "parent",
    sortOrder: index,
  }));
  const proposedLibrary = buildRecursiveSkillLibrary(
    previewSkills,
    [...otherRelationships, ...proposedRelationships],
  );
  const proposedReasons = proposedLibrary.skills.find(({ id }) => id === previewSkillId)?.reviewReasons ?? [];
  if (proposedReasons.some(({ code }) => code === "cycle")) {
    validationErrors.push("The proposed parent selection would create a canonical Skill cycle.");
  }

  const affected = new Set<number>();
  if (currentSkill) {
    const visit = (skillId: number): void => {
      if (affected.has(skillId)) return;
      affected.add(skillId);
      const node = skillsById.get(skillId);
      for (const childId of node?.childIds ?? []) visit(childId);
    };
    visit(currentSkill.id);
  }
  const sortedOldParents = [...oldParentIds].sort(compareNumbers);
  const sortedProposedParents = [...proposedParentIds].sort(compareNumbers);
  const oldPaths = currentSkill ? library.paths.filter(({ endpointSkillId }) => endpointSkillId === currentSkill.id) : [];
  const proposedPaths = proposedLibrary.paths.filter(({ endpointSkillId }) => endpointSkillId === previewSkillId);
  const placementSignature = (paths: readonly RecursiveSkillPath[]) => paths
    .map((path) => `${path.key}:${path.attributeGroupKey}`)
    .sort(compareText);
  const oldPlacement = placementSignature(oldPaths);
  const proposedPlacement = placementSignature(proposedPaths);
  const placementChanged = oldPlacement.length !== proposedPlacement.length ||
    oldPlacement.some((entry, index) => entry !== proposedPlacement[index]);
  const structurallySignificant = currentSkill !== null && (
    sortedOldParents.length !== sortedProposedParents.length ||
    sortedOldParents.some((id, index) => id !== sortedProposedParents[index]) ||
    placementChanged
  );
  const ambiguousMultipleParents = proposedParentIds.length > 1;

  return {
    skillId: currentSkill?.id ?? null,
    oldParentIds,
    proposedParentIds,
    oldPaths,
    proposedPaths,
    affectedSkillIds: [...affected].sort(compareNumbers),
    structurallySignificant,
    ambiguousMultipleParents,
    requiresConfirmation: structurallySignificant || ambiguousMultipleParents,
    validationErrors: [...new Set(validationErrors)],
    reviewReasons: proposedReasons,
  };
}
