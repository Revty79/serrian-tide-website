import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import {
  campaignCharacter,
  campaignCharacterAttribute,
  campaignCharacterProfile,
  campaignCharacterSkillAllocation,
  campaignCharacterWeaponOverride,
  type CharacterAttributeKey,
} from "@/db/realm-schema";
import { race, raceSkillLink } from "@/db/race-schema";
import { skill, skillRelationship } from "@/db/skill-schema";
import type {
  CharacterRaceAggregate,
  CharacterSkillReference,
} from "@/features/characters/models";
import { requireSession } from "@/lib/server-access";

import {
  resolveCharacterWeaponGovernance,
  type CharacterWeaponGovernanceResult,
  type CharacterWeaponGoverningSelection,
  type CharacterWeaponOneActionOverride,
  type PersistentCharacterWeaponOverride,
  type ResolveCharacterWeaponGovernanceInput,
} from "./character-weapon-governance";
import {
  readWeaponSkillGovernanceInTransaction,
  type WeaponSkillGovernanceTransaction,
} from "./weapon-skill-governance-service";

export type CharacterWeaponGovernanceTransaction = WeaponSkillGovernanceTransaction;

export type CharacterWeaponGovernanceActor = Readonly<{
  userId: string;
}>;

export type CharacterWeaponGovernanceRequest = Readonly<{
  campaignId: number;
  characterId: number;
  itemId: number;
  firingModeId: number | null;
  oneActionOverride?: CharacterWeaponOneActionOverride | null;
}>;

export type NormalCharacterWeaponGovernanceRequest = Omit<
  CharacterWeaponGovernanceRequest,
  "oneActionOverride"
>;

export type OneActionCharacterWeaponGovernanceRequest =
  NormalCharacterWeaponGovernanceRequest & Readonly<{
    oneActionOverride: CharacterWeaponOneActionOverride;
  }>;

export type CharacterWeaponOverrideScope = Readonly<{
  campaignId: number;
  characterId: number;
  itemId: number;
  firingModeId: number | null;
}>;

export type SaveCharacterWeaponOverrideRequest = CharacterWeaponOverrideScope & Readonly<{
  selection: CharacterWeaponGoverningSelection;
  reason: string;
}>;

type LoadedCharacter = Readonly<{
  characterId: number;
  campaignId: number;
  playerUserId: string;
  campaignOwnerUserId: string;
  membershipUserId: string | null;
  isNpc: boolean;
  npcKind: "race" | "creature";
}>;

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} is invalid.`);
  return value;
}

function normalizeReason(value: string): string {
  if (typeof value !== "string") throw new Error("Weapon override reason is required.");
  const reason = value.trim();
  if (!reason || reason.length > 1000) {
    throw new Error("Weapon override reason must be nonblank and 1000 characters or fewer.");
  }
  return reason;
}

async function loadCharacter(
  tx: CharacterWeaponGovernanceTransaction,
  actor: CharacterWeaponGovernanceActor,
  campaignId: number,
  characterId: number,
): Promise<LoadedCharacter> {
  const [row] = await tx
    .select({
      characterId: campaignCharacter.id,
      campaignId: campaignCharacter.campaignId,
      playerUserId: campaignCharacter.playerUserId,
      campaignOwnerUserId: campaign.createdByUserId,
      membershipUserId: campaignPlayer.userId,
      isNpc: campaignCharacter.isNpc,
      npcKind: campaignCharacter.npcKind,
    })
    .from(campaignCharacter)
    .innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId))
    .leftJoin(campaignPlayer, and(
      eq(campaignPlayer.campaignId, campaignCharacter.campaignId),
      eq(campaignPlayer.userId, actor.userId),
    ))
    .where(and(
      eq(campaignCharacter.id, positiveId(characterId, "Character")),
      eq(campaignCharacter.campaignId, positiveId(campaignId, "Campaign")),
    ))
    .limit(1);
  if (!row) throw new Error("Character does not belong to the selected Campaign.");
  if (
    row.campaignOwnerUserId !== actor.userId
    && (row.playerUserId !== actor.userId || row.membershipUserId !== actor.userId)
  ) {
    throw new Error("You cannot resolve weapon governance for this Campaign Character.");
  }
  return {
    ...row,
    npcKind: row.npcKind === "creature" ? "creature" : "race",
  };
}

async function assertCampaignOwnerGod(
  tx: CharacterWeaponGovernanceTransaction,
  actor: CharacterWeaponGovernanceActor,
  loaded: LoadedCharacter,
): Promise<void> {
  const [godRole] = await tx.select({ role: userRole.role })
    .from(userRole)
    .where(and(eq(userRole.userId, actor.userId), eq(userRole.role, "god")))
    .limit(1);
  if (loaded.campaignOwnerUserId !== actor.userId || !godRole) {
    throw new Error("Only the Campaign-owning G.O.D. may change Character weapon governance.");
  }
}

async function loadRaceAggregate(
  tx: CharacterWeaponGovernanceTransaction,
  characterId: number,
): Promise<CharacterRaceAggregate | null> {
  const [profile] = await tx.select({ raceId: campaignCharacterProfile.raceId })
    .from(campaignCharacterProfile)
    .where(eq(campaignCharacterProfile.characterId, characterId))
    .limit(1);
  if (!profile || profile.raceId === null) return null;
  const [raceRow] = await tx.select({
    id: race.id,
    name: race.name,
    size: race.size,
    baseMagic: race.baseMagic,
    ageMin: race.ageMin,
    ageMax: race.ageMax,
    ageRangeText: race.ageRangeText,
    physicalDescription: race.physicalDescription,
    racialQuirkName: race.racialQuirkName,
    quirkSuccessEffect: race.quirkSuccessEffect,
    quirkFailureEffect: race.quirkFailureEffect,
  }).from(race).where(eq(race.id, profile.raceId)).limit(1);
  if (!raceRow) throw new Error("The Character's Race identity is invalid.");
  const links = await tx.select({
    skillId: raceSkillLink.skillId,
    skillName: skill.name,
    skillClassification: skill.classification,
    linkType: raceSkillLink.linkType,
    value: raceSkillLink.value,
  }).from(raceSkillLink)
    .innerJoin(skill, eq(skill.id, raceSkillLink.skillId))
    .where(eq(raceSkillLink.raceId, profile.raceId));
  return {
    race: raceRow,
    attributeCaps: [],
    movementModes: [],
    skillLinks: links,
  };
}

async function loadResolutionInput(
  tx: CharacterWeaponGovernanceTransaction,
  actor: CharacterWeaponGovernanceActor,
  request: CharacterWeaponGovernanceRequest,
): Promise<ResolveCharacterWeaponGovernanceInput> {
  const loaded = await loadCharacter(
    tx,
    actor,
    request.campaignId,
    request.characterId,
  );
  if (request.oneActionOverride) await assertCampaignOwnerGod(tx, actor, loaded);
  const governance = await readWeaponSkillGovernanceInTransaction(tx, positiveId(request.itemId, "Item"));
  if (!governance) throw new Error("That Item is not a canonical Weapon Profile.");
  if (
    request.firingModeId !== null
    && !governance.modes.some(({ id }) => id === request.firingModeId)
  ) {
    throw new Error("The selected firing mode does not belong to the selected Weapon Profile.");
  }
  const attributeRows = await tx.select({
      attributeKey: campaignCharacterAttribute.attributeKey,
      value: campaignCharacterAttribute.value,
    }).from(campaignCharacterAttribute)
      .where(eq(campaignCharacterAttribute.characterId, loaded.characterId));
  const allocationRows = await tx.select({
      id: campaignCharacterSkillAllocation.id,
      characterId: campaignCharacterSkillAllocation.characterId,
      skillId: campaignCharacterSkillAllocation.skillId,
      parentAllocationId: campaignCharacterSkillAllocation.parentAllocationId,
      points: campaignCharacterSkillAllocation.points,
    }).from(campaignCharacterSkillAllocation)
      .where(eq(campaignCharacterSkillAllocation.characterId, loaded.characterId))
      .orderBy(asc(campaignCharacterSkillAllocation.id));
  const skillRows = await tx.select({
      id: skill.id,
      name: skill.name,
      classification: skill.classification,
      tier: skill.tier,
      primaryAttribute: skill.primaryAttribute,
      secondaryAttribute: skill.secondaryAttribute,
      definition: skill.definition,
    }).from(skill).orderBy(asc(skill.id));
  const relationshipRows = await tx.select({
    skillId: skillRelationship.skillId,
    relatedSkillId: skillRelationship.relatedSkillId,
    relationshipType: skillRelationship.relationshipType,
    sortOrder: skillRelationship.sortOrder,
  }).from(skillRelationship).orderBy(asc(skillRelationship.id));
  const selectedRace = await loadRaceAggregate(tx, loaded.characterId);
  const attributes: Partial<Record<CharacterAttributeKey, number>> = {};
  for (const row of attributeRows) {
    if (["STR", "DEX", "CON", "INT", "WIS", "CHR"].includes(row.attributeKey)) {
      attributes[row.attributeKey as CharacterAttributeKey] = row.value;
    }
  }
  const skillCatalog: CharacterSkillReference[] = skillRows.map((row) => ({
    ...row,
    spellLevel: null,
    manaCost: null,
    spellDocumentJson: null,
  }));
  const persistentOverride = await readApplicableOverrideForLoaded(
    tx,
    loaded,
    governance.itemId,
    governance.weaponProfileId,
    request.firingModeId,
  );
  return {
    context: {
      campaignId: loaded.campaignId,
      characterId: loaded.characterId,
      isNpc: loaded.isNpc,
      npcKind: loaded.npcKind,
      itemId: governance.itemId,
      weaponCanonicalId: governance.weaponCanonicalId,
      weaponName: governance.weaponName,
      weaponProfileId: governance.weaponProfileId,
      firingModeId: request.firingModeId,
    },
    governance,
    attributes,
    allocations: allocationRows,
    skillCatalog,
    skillRelationships: relationshipRows,
    race: selectedRace,
    persistentOverride,
    oneActionOverride: request.oneActionOverride ?? null,
  };
}

function persistedOverride(row: typeof campaignCharacterWeaponOverride.$inferSelect): PersistentCharacterWeaponOverride {
  const selection: CharacterWeaponGoverningSelection = row.skillAllocationId !== null
    ? { kind: "skill", allocationId: row.skillAllocationId }
    : { kind: "attribute", attributeKey: row.attributeKey as CharacterAttributeKey };
  return {
    id: row.id,
    campaignId: row.campaignId,
    characterId: row.characterId,
    itemId: row.itemId,
    weaponProfileId: row.weaponProfileId,
    firingModeId: row.firingModeId,
    selection,
    reason: row.reason,
    updatedByUserId: row.updatedByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function readApplicableOverrideForLoaded(
  tx: CharacterWeaponGovernanceTransaction,
  loaded: LoadedCharacter,
  itemId: number,
  weaponProfileId: number,
  firingModeId: number | null,
): Promise<PersistentCharacterWeaponOverride | null> {
  const rows = await tx.select().from(campaignCharacterWeaponOverride)
    .where(and(
      eq(campaignCharacterWeaponOverride.campaignId, loaded.campaignId),
      eq(campaignCharacterWeaponOverride.characterId, loaded.characterId),
      eq(campaignCharacterWeaponOverride.itemId, itemId),
      eq(campaignCharacterWeaponOverride.weaponProfileId, weaponProfileId),
    ))
    .orderBy(asc(campaignCharacterWeaponOverride.id));
  const selected = firingModeId === null
    ? rows.find(({ firingModeId: storedModeId }) => storedModeId === null)
    : rows.find(({ firingModeId: storedModeId }) => storedModeId === firingModeId)
      ?? rows.find(({ firingModeId: storedModeId }) => storedModeId === null);
  return selected ? persistedOverride(selected) : null;
}

export async function readApplicableCharacterWeaponOverrideInTransaction(
  tx: CharacterWeaponGovernanceTransaction,
  actor: CharacterWeaponGovernanceActor,
  scope: CharacterWeaponOverrideScope,
): Promise<PersistentCharacterWeaponOverride | null> {
  const loaded = await loadCharacter(tx, actor, scope.campaignId, scope.characterId);
  const governance = await readWeaponSkillGovernanceInTransaction(tx, positiveId(scope.itemId, "Item"));
  if (!governance) throw new Error("That Item is not a canonical Weapon Profile.");
  if (scope.firingModeId !== null && !governance.modes.some(({ id }) => id === scope.firingModeId)) {
    throw new Error("The selected firing mode does not belong to the selected Weapon Profile.");
  }
  return readApplicableOverrideForLoaded(
    tx,
    loaded,
    governance.itemId,
    governance.weaponProfileId,
    scope.firingModeId,
  );
}

export async function resolveCharacterWeaponGovernanceInTransaction(
  tx: CharacterWeaponGovernanceTransaction,
  actor: CharacterWeaponGovernanceActor,
  request: CharacterWeaponGovernanceRequest,
): Promise<CharacterWeaponGovernanceResult> {
  return resolveCharacterWeaponGovernance(await loadResolutionInput(tx, actor, request));
}

export async function resolveNormalCharacterWeaponGovernanceInTransaction(
  tx: CharacterWeaponGovernanceTransaction,
  actor: CharacterWeaponGovernanceActor,
  request: NormalCharacterWeaponGovernanceRequest,
): Promise<CharacterWeaponGovernanceResult> {
  return resolveCharacterWeaponGovernanceInTransaction(tx, actor, request);
}

export async function resolveCharacterWeaponGovernanceWithOneActionOverrideInTransaction(
  tx: CharacterWeaponGovernanceTransaction,
  actor: CharacterWeaponGovernanceActor,
  request: OneActionCharacterWeaponGovernanceRequest,
): Promise<CharacterWeaponGovernanceResult> {
  return resolveCharacterWeaponGovernanceInTransaction(tx, actor, request);
}

export async function createOrReplaceCharacterWeaponOverrideInTransaction(
  tx: CharacterWeaponGovernanceTransaction,
  actor: CharacterWeaponGovernanceActor,
  request: SaveCharacterWeaponOverrideRequest,
): Promise<PersistentCharacterWeaponOverride> {
  const loaded = await loadCharacter(tx, actor, request.campaignId, request.characterId);
  await assertCampaignOwnerGod(tx, actor, loaded);
  const reason = normalizeReason(request.reason);
  const governance = await readWeaponSkillGovernanceInTransaction(tx, positiveId(request.itemId, "Item"));
  if (!governance) throw new Error("That Item is not a canonical Weapon Profile.");
  if (request.firingModeId !== null && !governance.modes.some(({ id }) => id === request.firingModeId)) {
    throw new Error("The selected firing mode does not belong to the selected Weapon Profile.");
  }
  const validation = resolveCharacterWeaponGovernance(await loadResolutionInput(tx, actor, {
    campaignId: request.campaignId,
    characterId: request.characterId,
    itemId: request.itemId,
    firingModeId: request.firingModeId,
    oneActionOverride: { ...request.selection, reason },
  }));
  if (validation.status !== "resolved-one-action-override") {
    throw new Error("The selected persistent governing source is not a valid exact owned Character source.");
  }

  const storedRows = await tx.select().from(campaignCharacterWeaponOverride)
    .where(and(
      eq(campaignCharacterWeaponOverride.campaignId, loaded.campaignId),
      eq(campaignCharacterWeaponOverride.characterId, loaded.characterId),
      eq(campaignCharacterWeaponOverride.weaponProfileId, governance.weaponProfileId),
    ))
    .orderBy(asc(campaignCharacterWeaponOverride.id))
    .for("update");
  const existing = storedRows.find(({ firingModeId }) => firingModeId === request.firingModeId);
  const values = {
    campaignId: loaded.campaignId,
    characterId: loaded.characterId,
    itemId: governance.itemId,
    weaponProfileId: governance.weaponProfileId,
    firingModeId: request.firingModeId,
    skillAllocationId: request.selection.kind === "skill" ? request.selection.allocationId : null,
    attributeKey: request.selection.kind === "attribute" ? request.selection.attributeKey : null,
    reason,
    updatedByUserId: actor.userId,
    updatedAt: new Date(),
  };
  const [saved] = existing
    ? await tx.update(campaignCharacterWeaponOverride)
        .set(values)
        .where(eq(campaignCharacterWeaponOverride.id, existing.id))
        .returning()
    : await tx.insert(campaignCharacterWeaponOverride).values(values).returning();
  if (!saved) throw new Error("The Character weapon override could not be saved.");
  return persistedOverride(saved);
}

export async function removeCharacterWeaponOverrideInTransaction(
  tx: CharacterWeaponGovernanceTransaction,
  actor: CharacterWeaponGovernanceActor,
  scope: CharacterWeaponOverrideScope,
): Promise<boolean> {
  const loaded = await loadCharacter(tx, actor, scope.campaignId, scope.characterId);
  await assertCampaignOwnerGod(tx, actor, loaded);
  const governance = await readWeaponSkillGovernanceInTransaction(tx, positiveId(scope.itemId, "Item"));
  if (!governance) throw new Error("That Item is not a canonical Weapon Profile.");
  if (scope.firingModeId !== null && !governance.modes.some(({ id }) => id === scope.firingModeId)) {
    throw new Error("The selected firing mode does not belong to the selected Weapon Profile.");
  }
  const matching = await tx.delete(campaignCharacterWeaponOverride).where(and(
    eq(campaignCharacterWeaponOverride.campaignId, loaded.campaignId),
    eq(campaignCharacterWeaponOverride.characterId, loaded.characterId),
    eq(campaignCharacterWeaponOverride.weaponProfileId, governance.weaponProfileId),
    scope.firingModeId === null
      ? isNull(campaignCharacterWeaponOverride.firingModeId)
      : eq(campaignCharacterWeaponOverride.firingModeId, scope.firingModeId),
  )).returning({ id: campaignCharacterWeaponOverride.id });
  return matching.length > 0;
}

async function authenticatedActor(): Promise<CharacterWeaponGovernanceActor> {
  const session = await requireSession();
  return { userId: session.user.id };
}

export async function resolveCharacterWeaponGovernanceForCurrentUser(
  request: CharacterWeaponGovernanceRequest,
): Promise<CharacterWeaponGovernanceResult> {
  const actor = await authenticatedActor();
  return db.transaction((tx) => resolveCharacterWeaponGovernanceInTransaction(tx, actor, request));
}

export async function resolveNormalCharacterWeaponGovernance(
  request: NormalCharacterWeaponGovernanceRequest,
): Promise<CharacterWeaponGovernanceResult> {
  const actor = await authenticatedActor();
  return db.transaction((tx) => resolveNormalCharacterWeaponGovernanceInTransaction(tx, actor, request));
}

export async function resolveCharacterWeaponGovernanceWithOneActionOverride(
  request: OneActionCharacterWeaponGovernanceRequest,
): Promise<CharacterWeaponGovernanceResult> {
  const actor = await authenticatedActor();
  return db.transaction((tx) => (
    resolveCharacterWeaponGovernanceWithOneActionOverrideInTransaction(tx, actor, request)
  ));
}

export async function readApplicableCharacterWeaponOverride(
  scope: CharacterWeaponOverrideScope,
): Promise<PersistentCharacterWeaponOverride | null> {
  const actor = await authenticatedActor();
  return db.transaction((tx) => readApplicableCharacterWeaponOverrideInTransaction(tx, actor, scope));
}

export async function createOrReplaceCharacterWeaponOverride(
  request: SaveCharacterWeaponOverrideRequest,
): Promise<PersistentCharacterWeaponOverride> {
  const actor = await authenticatedActor();
  return db.transaction((tx) => createOrReplaceCharacterWeaponOverrideInTransaction(tx, actor, request));
}

export async function removeCharacterWeaponOverride(
  scope: CharacterWeaponOverrideScope,
): Promise<boolean> {
  const actor = await authenticatedActor();
  return db.transaction((tx) => removeCharacterWeaponOverrideInTransaction(tx, actor, scope));
}
