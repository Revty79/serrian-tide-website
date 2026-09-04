import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/auth-schema";
import {
  item,
  weaponFiringMode,
  weaponProfile,
  weaponSkillPathMapping,
} from "@/db/item-schema";
import { skill, skillRelationship } from "@/db/skill-schema";

import {
  WEAPON_SKILL_GOVERNANCE_REVIEW_STATES,
  selectApplicableCanonicalWeaponSkillPaths,
  validateCanonicalSkillPath,
  type CanonicalSkillDefinition,
  type CanonicalSkillParentRelationship,
  type CanonicalSkillPathValidation,
  type CanonicalWeaponSkillOption,
  type WeaponSkillGovernanceReviewState,
} from "./weapon-skill-governance";

export type WeaponSkillGovernanceTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AuthorizedWeaponSkillGovernanceActor = Readonly<{
  userId: string;
  canAuthorMasterContent: boolean;
}>;

export type WeaponSkillPathMappingDraft = Readonly<{
  id: number | null;
  firingModeId: number | null;
  endpointSkillId: number;
  reviewState: WeaponSkillGovernanceReviewState;
  notes: string;
}>;

export type WeaponSkillPathMappingView = CanonicalWeaponSkillOption & Readonly<{
  weaponProfileId: number;
  endpointSkillName: string;
  updatedByUserId: string;
  updatedByName: string;
  createdAt: string;
  updatedAt: string;
}>;

export type WeaponSkillGovernanceStatus = "missing" | "review-required" | "approved" | "invalid";

export type WeaponSkillGovernanceScopeView = Readonly<{
  firingModeId: number | null;
  firingModeName: string | null;
  status: WeaponSkillGovernanceStatus;
  options: readonly WeaponSkillPathMappingView[];
  approvedOptions: readonly WeaponSkillPathMappingView[];
  problems: readonly string[];
}>;

export type WeaponSkillGovernanceModeView = Readonly<{
  id: number;
  name: string;
  sortOrder: number;
  canonicalBehavior: "mode-override" | "inherits-weapon-default";
  scope: WeaponSkillGovernanceScopeView;
  applicableApprovedOptions: readonly WeaponSkillPathMappingView[];
}>;

export type WeaponSkillGovernanceReadModel = Readonly<{
  itemId: number;
  weaponCanonicalId: string;
  weaponName: string;
  weaponProfileId: number;
  weaponDefault: WeaponSkillGovernanceScopeView;
  modes: readonly WeaponSkillGovernanceModeView[];
}>;

function isAmmunitionProfile(profileRecordType: string, itemRecordType: string): boolean {
  return profileRecordType.trim().toLocaleLowerCase("en-US") === "ammunition"
    || itemRecordType.trim().toLocaleLowerCase("en-US") === "ammunition";
}

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} is invalid.`);
  return value;
}

function normalizeNotes(value: unknown): string {
  if (typeof value !== "string") throw new Error("Governing Skill Path notes are invalid.");
  const notes = value.trim();
  if (notes.length > 1000) throw new Error("Governing Skill Path notes must be 1000 characters or fewer.");
  return notes;
}

function normalizeReviewState(value: unknown): WeaponSkillGovernanceReviewState {
  if (typeof value !== "string" || !WEAPON_SKILL_GOVERNANCE_REVIEW_STATES.includes(value as WeaponSkillGovernanceReviewState)) {
    throw new Error("Governing Skill Path review state is invalid.");
  }
  return value as WeaponSkillGovernanceReviewState;
}

async function readCanonicalSkillGraph(tx: WeaponSkillGovernanceTransaction): Promise<{
  skills: CanonicalSkillDefinition[];
  relationships: CanonicalSkillParentRelationship[];
}> {
  const skills = await tx.select({
    id: skill.id,
    name: skill.name,
    classification: skill.classification,
    tier: skill.tier,
    primaryAttribute: skill.primaryAttribute,
    secondaryAttribute: skill.secondaryAttribute,
  }).from(skill).orderBy(asc(skill.name), asc(skill.id));
  const relationships = await tx.select({
    id: skillRelationship.id,
    skillId: skillRelationship.skillId,
    relatedSkillId: skillRelationship.relatedSkillId,
    relationshipType: skillRelationship.relationshipType,
    sortOrder: skillRelationship.sortOrder,
  }).from(skillRelationship).orderBy(asc(skillRelationship.id));
  return { skills, relationships };
}

function buildScope(
  firingModeId: number | null,
  firingModeName: string | null,
  options: readonly WeaponSkillPathMappingView[],
): WeaponSkillGovernanceScopeView {
  const ordered = [...options].sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id);
  const approvedOptions = ordered.filter(({ reviewState, path }) => reviewState === "approved" && path.valid);
  const problems = ordered.flatMap(({ endpointSkillId, reviewState, path }) => [
    ...(reviewState === "review-required" ? [`Skill #${endpointSkillId} still requires review.`] : []),
    ...path.problems.map(({ message }) => message),
  ]);
  if (!ordered.length) problems.push("No canonical governing Skill Path has been authored for this scope.");
  const status: WeaponSkillGovernanceStatus = !ordered.length
    ? "missing"
    : ordered.some(({ path }) => !path.valid)
      ? "invalid"
      : ordered.every(({ reviewState }) => reviewState === "approved")
        ? "approved"
        : "review-required";
  return { firingModeId, firingModeName, status, options: ordered, approvedOptions, problems };
}

export async function readWeaponSkillGovernanceInTransaction(
  tx: WeaponSkillGovernanceTransaction,
  itemId: number,
): Promise<WeaponSkillGovernanceReadModel | null> {
  const normalizedItemId = positiveId(itemId, "Item");
  const [profile] = await tx.select({
    itemId: item.id,
    weaponCanonicalId: item.canonicalId,
    weaponName: item.name,
    weaponProfileId: weaponProfile.id,
    profileRecordType: weaponProfile.profileRecordType,
    itemRecordType: item.recordType,
  }).from(item)
    .innerJoin(weaponProfile, eq(weaponProfile.itemId, item.id))
    .where(eq(item.id, normalizedItemId))
    .limit(1);
  if (!profile) return null;
  if (isAmmunitionProfile(profile.profileRecordType, profile.itemRecordType)) return null;

  const modes = await tx.select({ id: weaponFiringMode.id, name: weaponFiringMode.name, sortOrder: weaponFiringMode.sortOrder })
    .from(weaponFiringMode)
    .where(eq(weaponFiringMode.weaponProfileId, profile.weaponProfileId))
    .orderBy(asc(weaponFiringMode.sortOrder), asc(weaponFiringMode.id));
  const mappingRows = await tx.select().from(weaponSkillPathMapping)
    .where(eq(weaponSkillPathMapping.weaponProfileId, profile.weaponProfileId))
    .orderBy(asc(weaponSkillPathMapping.firingModeId), asc(weaponSkillPathMapping.sortOrder), asc(weaponSkillPathMapping.id));
  const graph = await readCanonicalSkillGraph(tx);
  const skillNames = new Map(graph.skills.map(({ id, name }) => [id, name]));
  const userIds = [...new Set(mappingRows.map(({ updatedByUserId }) => updatedByUserId))];
  const userRows = userIds.length
    ? await tx.select({ id: user.id, name: user.name, username: user.username }).from(user).where(inArray(user.id, userIds))
    : [];
  const userNames = new Map(userRows.map((row) => [row.id, row.username ?? row.name]));
  const mappings: WeaponSkillPathMappingView[] = mappingRows.map((row) => ({
    id: row.id,
    weaponProfileId: row.weaponProfileId,
    firingModeId: row.firingModeId,
    endpointSkillId: row.endpointSkillId,
    endpointSkillName: skillNames.get(row.endpointSkillId) ?? `Missing Skill #${row.endpointSkillId}`,
    reviewState: row.reviewState as WeaponSkillGovernanceReviewState,
    notes: row.notes,
    sortOrder: row.sortOrder,
    path: validateCanonicalSkillPath(row.endpointSkillId, graph.skills, graph.relationships),
    updatedByUserId: row.updatedByUserId,
    updatedByName: userNames.get(row.updatedByUserId) ?? "Unknown user",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
  const weaponDefault = buildScope(null, null, mappings.filter(({ firingModeId }) => firingModeId === null));
  const canonicalModeScopes = modes.map((mode) => buildScope(
    mode.id,
    mode.name,
    mappings.filter(({ firingModeId }) => firingModeId === mode.id),
  ));
  return {
    itemId: profile.itemId,
    weaponCanonicalId: profile.weaponCanonicalId,
    weaponName: profile.weaponName,
    weaponProfileId: profile.weaponProfileId,
    weaponDefault,
    modes: modes.map((mode, index): WeaponSkillGovernanceModeView => {
      const scope = canonicalModeScopes[index]!;
      const applicable = selectApplicableCanonicalWeaponSkillPaths(weaponDefault, canonicalModeScopes, mode.id);
      return {
        ...mode,
        canonicalBehavior: applicable.source === "firing-mode" ? "mode-override" : "inherits-weapon-default",
        scope,
        applicableApprovedOptions: applicable.options as WeaponSkillPathMappingView[],
      };
    }),
  };
}

export async function readWeaponSkillGovernance(itemId: number): Promise<WeaponSkillGovernanceReadModel | null> {
  return db.transaction((tx) => readWeaponSkillGovernanceInTransaction(tx, itemId));
}

export async function saveWeaponSkillGovernanceInTransaction(
  tx: WeaponSkillGovernanceTransaction,
  actor: AuthorizedWeaponSkillGovernanceActor,
  itemId: number,
  input: readonly WeaponSkillPathMappingDraft[],
): Promise<WeaponSkillGovernanceReadModel> {
  if (!actor.canAuthorMasterContent || !actor.userId.trim()) {
    throw new Error("G.O.D. master-content authoring access is required.");
  }
  if (!Array.isArray(input) || input.length > 100) {
    throw new Error("A Weapon Profile may contain at most 100 canonical governing Skill Paths.");
  }
  const normalizedItemId = positiveId(itemId, "Item");
  const [profile] = await tx.select({
    id: weaponProfile.id,
    profileRecordType: weaponProfile.profileRecordType,
    itemRecordType: item.recordType,
  })
    .from(weaponProfile)
    .innerJoin(item, eq(item.id, weaponProfile.itemId))
    .where(eq(item.id, normalizedItemId))
    .limit(1)
    .for("update");
  if (!profile) throw new Error("That Item does not have a persisted Weapon Profile.");
  if (isAmmunitionProfile(profile.profileRecordType, profile.itemRecordType)) {
    throw new Error("Ammunition Profiles do not author weapon Governing Skill Paths.");
  }

  const modes = await tx.select({ id: weaponFiringMode.id })
    .from(weaponFiringMode)
    .where(eq(weaponFiringMode.weaponProfileId, profile.id));
  const modeIds = new Set(modes.map(({ id }) => id));
  const seenIds = new Set<number>();
  const seenEndpoints = new Set<string>();
  const scopeOrders = new Map<string, number>();
  const normalized = input.map((candidate) => {
    const id = candidate.id === null ? null : positiveId(candidate.id, "Governing Skill Path mapping");
    if (id !== null && seenIds.has(id)) throw new Error("A Governing Skill Path mapping identity was submitted more than once.");
    if (id !== null) seenIds.add(id);
    const firingModeId = candidate.firingModeId === null ? null : positiveId(candidate.firingModeId, "Firing Mode");
    if (firingModeId !== null && !modeIds.has(firingModeId)) {
      throw new Error(`Firing Mode #${firingModeId} does not belong to this Weapon Profile.`);
    }
    const endpointSkillId = positiveId(candidate.endpointSkillId, "Endpoint Skill");
    const scopeKey = firingModeId === null ? "weapon" : `mode:${firingModeId}`;
    const endpointKey = `${scopeKey}:${endpointSkillId}`;
    if (seenEndpoints.has(endpointKey)) {
      throw new Error(`Endpoint Skill #${endpointSkillId} is duplicated in the same governance scope.`);
    }
    seenEndpoints.add(endpointKey);
    const sortOrder = scopeOrders.get(scopeKey) ?? 0;
    scopeOrders.set(scopeKey, sortOrder + 1);
    return {
      id,
      weaponProfileId: profile.id,
      firingModeId,
      endpointSkillId,
      reviewState: normalizeReviewState(candidate.reviewState),
      notes: normalizeNotes(candidate.notes),
      sortOrder,
    };
  });

  const graph = await readCanonicalSkillGraph(tx);
  for (const mapping of normalized) {
    const validation = validateCanonicalSkillPath(mapping.endpointSkillId, graph.skills, graph.relationships);
    if (mapping.reviewState === "approved" && !validation.valid) {
      throw new Error(`Skill #${mapping.endpointSkillId} cannot be approved: ${validation.problems.map(({ message }) => message).join(" ")}`);
    }
  }

  const stored = await tx.select().from(weaponSkillPathMapping)
    .where(eq(weaponSkillPathMapping.weaponProfileId, profile.id))
    .orderBy(asc(weaponSkillPathMapping.id));
  const storedById = new Map(stored.map((row) => [row.id, row]));
  for (const mapping of normalized) {
    if (mapping.id === null) continue;
    const previous = storedById.get(mapping.id);
    if (!previous) throw new Error("A Governing Skill Path mapping does not belong to this Weapon Profile.");
    if (previous.endpointSkillId !== mapping.endpointSkillId || previous.firingModeId !== mapping.firingModeId) {
      throw new Error("An existing Governing Skill Path endpoint or scope cannot be silently redirected; remove it and add a new path.");
    }
  }
  const submittedIds = new Set(normalized.flatMap(({ id }) => id === null ? [] : [id]));
  const removedIds = stored.map(({ id }) => id).filter((id) => !submittedIds.has(id));
  if (removedIds.length) {
    await tx.delete(weaponSkillPathMapping).where(and(
      eq(weaponSkillPathMapping.weaponProfileId, profile.id),
      inArray(weaponSkillPathMapping.id, removedIds),
    ));
  }
  const retained = stored.filter(({ id }) => submittedIds.has(id));
  if (retained.some(({ sortOrder }) => sortOrder >= 1_000_000)) {
    throw new Error("Stored Governing Skill Path order is outside the service-managed range.");
  }
  if (retained.length) {
    await tx.update(weaponSkillPathMapping)
      .set({ sortOrder: sql`${weaponSkillPathMapping.sortOrder} + 1000000` })
      .where(and(
        eq(weaponSkillPathMapping.weaponProfileId, profile.id),
        inArray(weaponSkillPathMapping.id, retained.map(({ id }) => id)),
      ));
  }
  for (const mapping of normalized.filter(({ id }) => id !== null)) {
    const updated = await tx.update(weaponSkillPathMapping).set({
      reviewState: mapping.reviewState,
      notes: mapping.notes,
      sortOrder: mapping.sortOrder,
      updatedByUserId: actor.userId,
      updatedAt: new Date(),
    }).where(and(
      eq(weaponSkillPathMapping.id, mapping.id!),
      eq(weaponSkillPathMapping.weaponProfileId, profile.id),
    )).returning({ id: weaponSkillPathMapping.id });
    if (!updated.length) throw new Error("A Governing Skill Path changed before it could be saved.");
  }
  const additions = normalized.filter(({ id }) => id === null);
  if (additions.length) {
    await tx.insert(weaponSkillPathMapping).values(additions.map((mapping) => ({
      weaponProfileId: mapping.weaponProfileId,
      firingModeId: mapping.firingModeId,
      endpointSkillId: mapping.endpointSkillId,
      reviewState: mapping.reviewState,
      notes: mapping.notes,
      sortOrder: mapping.sortOrder,
      updatedByUserId: actor.userId,
    })));
  }
  const reloaded = await readWeaponSkillGovernanceInTransaction(tx, normalizedItemId);
  if (!reloaded) throw new Error("The saved Weapon governing Skill Paths could not be reloaded.");
  return reloaded;
}

export async function saveWeaponSkillGovernance(
  actor: AuthorizedWeaponSkillGovernanceActor,
  itemId: number,
  input: readonly WeaponSkillPathMappingDraft[],
): Promise<WeaponSkillGovernanceReadModel> {
  return db.transaction((tx) => saveWeaponSkillGovernanceInTransaction(tx, actor, itemId, input));
}

export async function readCanonicalSkillPathPreview(
  tx: WeaponSkillGovernanceTransaction,
  endpointSkillId: number,
): Promise<CanonicalSkillPathValidation> {
  const graph = await readCanonicalSkillGraph(tx);
  return validateCanonicalSkillPath(endpointSkillId, graph.skills, graph.relationships);
}
