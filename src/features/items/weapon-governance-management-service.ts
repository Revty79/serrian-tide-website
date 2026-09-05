import "server-only";

import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import type { db } from "@/db";
import { user } from "@/db/auth-schema";
import { userRole } from "@/db/authorization-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import { item, weaponProfile } from "@/db/item-schema";
import {
  campaignCharacter,
  campaignCharacterItem,
  campaignCharacterItemEquipmentState,
  campaignCharacterItemInstance,
  campaignCharacterSkillAllocation,
  campaignCharacterWeaponOverride,
} from "@/db/realm-schema";
import { skill } from "@/db/skill-schema";
import {
  createOrReplaceCharacterWeaponOverrideInTransaction,
  readCharacterWeaponGovernanceDetailInTransaction,
  removeCharacterWeaponOverrideInTransaction,
  resolveCharacterWeaponGovernanceInTransaction,
  type CharacterWeaponGovernanceActor,
  type CharacterWeaponGovernanceDetail,
  type CharacterWeaponGovernanceRequest,
  type CharacterWeaponOverrideScope,
  type SaveCharacterWeaponOverrideRequest,
} from "./character-weapon-governance-service";
import type {
  CharacterWeaponGovernanceResult,
  CharacterWeaponOneActionOverride,
  PersistentCharacterWeaponOverride,
} from "./character-weapon-governance";
import type { PercentileTargetModifier } from "@/features/tabletop-operations/percentile-resolution";
import type { RollRecordRequest } from "@/features/tabletop-operations/roll-runtime";
import {
  recordRollInTransaction,
  type AuthorizedRollActor,
  type RollLedgerEntry,
} from "@/features/tabletop-operations/roll-runtime-service";

export type WeaponGovernanceManagementTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type WeaponGovernanceCharacterOption = Readonly<{
  id: number;
  name: string;
  kindLabel: "Player Character" | "Race NPC" | "Creature NPC";
  playerName: string | null;
}>;

export type WeaponGovernanceOwnedWeapon = Readonly<{
  itemId: number;
  canonicalId: string;
  name: string;
  catalogScope: "equipment" | "inventory";
  weaponProfileId: number;
  quantity: number;
  equipmentStates: readonly string[];
  owned: boolean;
  retainedOverrideOnly: boolean;
}>;

export type WeaponGovernancePersistentOverrideView = Readonly<{
  id: number;
  firingModeId: number | null;
  scopeLabel: string;
  sourceLabel: string;
  reason: string;
  updatedByName: string;
  updatedAt: string;
}>;

export type GodWeaponGovernanceWorkspaceView = Readonly<{
  campaignId: number;
  characters: readonly WeaponGovernanceCharacterOption[];
  selectedCharacter: WeaponGovernanceCharacterOption | null;
  weapons: readonly WeaponGovernanceOwnedWeapon[];
  selectedWeapon: WeaponGovernanceOwnedWeapon | null;
  selectedFiringModeId: number | null;
  detail: CharacterWeaponGovernanceDetail | null;
  persistentOverride: WeaponGovernancePersistentOverrideView | null;
}>;

export type PlayerWeaponGovernanceModeView = Readonly<{
  firingModeId: number | null;
  label: string;
  canonicalBehavior: "weapon-default" | "mode-override" | "inherits-weapon-default";
  resolution: CharacterWeaponGovernanceResult;
}>;

export type PlayerWeaponGovernanceWeaponView = WeaponGovernanceOwnedWeapon & Readonly<{
  modes: readonly PlayerWeaponGovernanceModeView[];
}>;

export type PlayerWeaponGovernanceView = Readonly<{
  characterId: number;
  characterName: string;
  weapons: readonly PlayerWeaponGovernanceWeaponView[];
}>;

export type GodWeaponGovernanceRollRequest = Omit<
  RollRecordRequest,
  "rollerCharacterId" | "targetNumber" | "mechanical"
> & Readonly<{
  governance: CharacterWeaponGovernanceRequest;
  modifiers?: readonly PercentileTargetModifier[];
}>;

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} is invalid.`);
  return value;
}

function isAmmunition(profileRecordType: string, itemRecordType: string): boolean {
  return profileRecordType.trim().toLocaleLowerCase("en-US") === "ammunition"
    || itemRecordType.trim().toLocaleLowerCase("en-US") === "ammunition";
}

async function assertCampaignOwnerGod(
  tx: WeaponGovernanceManagementTransaction,
  actor: CharacterWeaponGovernanceActor,
  campaignId: number,
): Promise<void> {
  const [authorized] = await tx.select({ campaignId: campaign.id })
    .from(campaign)
    .innerJoin(userRole, and(
      eq(userRole.userId, actor.userId),
      eq(userRole.role, "god"),
    ))
    .where(and(
      eq(campaign.id, positiveId(campaignId, "Campaign")),
      eq(campaign.createdByUserId, actor.userId),
      isNull(campaign.archivedAt),
    ))
    .limit(1);
  if (!authorized) throw new Error("Only the Campaign-owning G.O.D. may manage Character weapon governance.");
}

async function readCharacters(
  tx: WeaponGovernanceManagementTransaction,
  campaignId: number,
): Promise<WeaponGovernanceCharacterOption[]> {
  const rows = await tx.select({
    id: campaignCharacter.id,
    name: campaignCharacter.name,
    isNpc: campaignCharacter.isNpc,
    npcKind: campaignCharacter.npcKind,
    playerName: user.name,
    playerUsername: user.username,
  }).from(campaignCharacter)
    .innerJoin(user, eq(user.id, campaignCharacter.playerUserId))
    .where(and(
      eq(campaignCharacter.campaignId, campaignId),
      isNull(campaignCharacter.archivedAt),
    ))
    .orderBy(asc(campaignCharacter.name), asc(campaignCharacter.id));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    kindLabel: row.isNpc
      ? row.npcKind === "creature" ? "Creature NPC" : "Race NPC"
      : "Player Character",
    playerName: row.isNpc ? null : row.playerUsername ?? row.playerName,
  }));
}

async function readCharacterWeapons(
  tx: WeaponGovernanceManagementTransaction,
  campaignId: number,
  characterId: number,
): Promise<WeaponGovernanceOwnedWeapon[]> {
  const characterIdentity = and(
    eq(campaignCharacter.id, characterId),
    eq(campaignCharacter.campaignId, campaignId),
  );
  const stackRows = await tx.select({
      itemId: campaignCharacterItem.itemId,
      canonicalId: item.canonicalId,
      name: item.name,
      catalogScope: item.catalogScope,
      itemRecordType: item.recordType,
      profileRecordType: weaponProfile.profileRecordType,
      weaponProfileId: weaponProfile.id,
      quantity: campaignCharacterItem.quantity,
    }).from(campaignCharacterItem)
      .innerJoin(campaignCharacter, and(
        eq(campaignCharacter.id, campaignCharacterItem.characterId),
        characterIdentity,
      ))
      .innerJoin(item, eq(item.id, campaignCharacterItem.itemId))
      .innerJoin(weaponProfile, eq(weaponProfile.itemId, item.id))
      .where(eq(campaignCharacterItem.characterId, characterId));
  const equipmentRows = await tx.select({
      itemId: campaignCharacterItemEquipmentState.itemId,
      state: campaignCharacterItemEquipmentState.state,
      quantity: campaignCharacterItemEquipmentState.quantity,
    }).from(campaignCharacterItemEquipmentState)
      .where(eq(campaignCharacterItemEquipmentState.characterId, characterId));
  const instanceRows = await tx.select({
      itemId: campaignCharacterItemInstance.itemId,
      canonicalId: item.canonicalId,
      name: item.name,
      catalogScope: item.catalogScope,
      itemRecordType: item.recordType,
      profileRecordType: weaponProfile.profileRecordType,
      weaponProfileId: weaponProfile.id,
      equipmentState: campaignCharacterItemInstance.equipmentState,
    }).from(campaignCharacterItemInstance)
      .innerJoin(campaignCharacter, and(
        eq(campaignCharacter.id, campaignCharacterItemInstance.characterId),
        characterIdentity,
      ))
      .innerJoin(item, eq(item.id, campaignCharacterItemInstance.itemId))
      .innerJoin(weaponProfile, eq(weaponProfile.itemId, item.id))
      .where(eq(campaignCharacterItemInstance.characterId, characterId));
  const retainedRows = await tx.select({
      itemId: campaignCharacterWeaponOverride.itemId,
      canonicalId: item.canonicalId,
      name: item.name,
      catalogScope: item.catalogScope,
      itemRecordType: item.recordType,
      profileRecordType: weaponProfile.profileRecordType,
      weaponProfileId: campaignCharacterWeaponOverride.weaponProfileId,
    }).from(campaignCharacterWeaponOverride)
      .innerJoin(item, eq(item.id, campaignCharacterWeaponOverride.itemId))
      .innerJoin(weaponProfile, eq(weaponProfile.id, campaignCharacterWeaponOverride.weaponProfileId))
      .where(and(
        eq(campaignCharacterWeaponOverride.campaignId, campaignId),
        eq(campaignCharacterWeaponOverride.characterId, characterId),
      ));
  const equipmentByItem = new Map<number, string[]>();
  for (const row of equipmentRows) {
    const list = equipmentByItem.get(row.itemId) ?? [];
    list.push(`${row.state} ${row.quantity}`);
    equipmentByItem.set(row.itemId, list);
  }
  const weapons = new Map<number, WeaponGovernanceOwnedWeapon>();
  for (const row of stackRows) {
    if (isAmmunition(row.profileRecordType, row.itemRecordType)) continue;
    weapons.set(row.itemId, {
      itemId: row.itemId,
      canonicalId: row.canonicalId,
      name: row.name,
      catalogScope: row.catalogScope as "equipment" | "inventory",
      weaponProfileId: row.weaponProfileId,
      quantity: row.quantity,
      equipmentStates: equipmentByItem.get(row.itemId) ?? [],
      owned: true,
      retainedOverrideOnly: false,
    });
  }
  for (const row of instanceRows) {
    if (isAmmunition(row.profileRecordType, row.itemRecordType)) continue;
    const existing = weapons.get(row.itemId);
    const states = row.equipmentState === "inactive" ? [] : [row.equipmentState];
    weapons.set(row.itemId, existing ? {
      ...existing,
      quantity: existing.quantity + 1,
      equipmentStates: [...new Set([...existing.equipmentStates, ...states])],
    } : {
      itemId: row.itemId,
      canonicalId: row.canonicalId,
      name: row.name,
      catalogScope: row.catalogScope as "equipment" | "inventory",
      weaponProfileId: row.weaponProfileId,
      quantity: 1,
      equipmentStates: states,
      owned: true,
      retainedOverrideOnly: false,
    });
  }
  for (const row of retainedRows) {
    if (weapons.has(row.itemId) || isAmmunition(row.profileRecordType, row.itemRecordType)) continue;
    weapons.set(row.itemId, {
      itemId: row.itemId,
      canonicalId: row.canonicalId,
      name: row.name,
      catalogScope: row.catalogScope as "equipment" | "inventory",
      weaponProfileId: row.weaponProfileId,
      quantity: 0,
      equipmentStates: [],
      owned: false,
      retainedOverrideOnly: true,
    });
  }
  return [...weapons.values()].sort((left, right) => left.name.localeCompare(right.name) || left.itemId - right.itemId);
}

export async function assertCharacterOwnsCanonicalWeaponInTransaction(
  tx: WeaponGovernanceManagementTransaction,
  scope: Pick<CharacterWeaponOverrideScope, "campaignId" | "characterId" | "itemId">,
): Promise<void> {
  const weapons = await readCharacterWeapons(tx, scope.campaignId, scope.characterId);
  if (!weapons.some(({ itemId, owned }) => itemId === scope.itemId && owned)) {
    throw new Error("The selected Character does not own that canonical Weapon.");
  }
}

async function persistentOverrideView(
  tx: WeaponGovernanceManagementTransaction,
  override: PersistentCharacterWeaponOverride | null,
  detail: CharacterWeaponGovernanceDetail,
): Promise<WeaponGovernancePersistentOverrideView | null> {
  if (!override) return null;
  const [author] = await tx.select({ name: user.name, username: user.username })
    .from(user)
    .where(eq(user.id, override.updatedByUserId))
    .limit(1);
  let sourceLabel: string;
  if (override.selection.kind === "attribute") {
    sourceLabel = `${override.selection.attributeKey} straight Attribute`;
  } else {
    const allocationId = override.selection.allocationId;
    const choice = detail.governingChoices.find(({ selection }) => (
      selection.kind === "skill" && selection.allocationId === allocationId
    ));
    if (choice) sourceLabel = choice.detail;
    else {
      const [allocation] = await tx.select({ skillName: skill.name })
        .from(campaignCharacterSkillAllocation)
        .innerJoin(skill, eq(skill.id, campaignCharacterSkillAllocation.skillId))
        .where(and(
          eq(campaignCharacterSkillAllocation.id, allocationId),
          eq(campaignCharacterSkillAllocation.characterId, override.characterId),
        ))
        .limit(1);
      sourceLabel = `${allocation?.skillName ?? "Preserved Skill allocation"} - allocation #${allocationId}`;
    }
  }
  const modeName = override.firingModeId === null
    ? null
    : detail.governance.modes.find(({ id }) => id === override.firingModeId)?.name ?? `Mode #${override.firingModeId}`;
  return {
    id: override.id,
    firingModeId: override.firingModeId,
    scopeLabel: modeName ? `${modeName} only` : "All uses of this weapon",
    sourceLabel,
    reason: override.reason,
    updatedByName: author?.username ?? author?.name ?? "Unknown G.O.D.",
    updatedAt: override.updatedAt,
  };
}

export async function readGodWeaponGovernanceWorkspaceInTransaction(
  tx: WeaponGovernanceManagementTransaction,
  actor: CharacterWeaponGovernanceActor,
  request: {
    campaignId: number;
    characterId: number | null;
    itemId: number | null;
    firingModeId: number | null;
  },
): Promise<GodWeaponGovernanceWorkspaceView> {
  await assertCampaignOwnerGod(tx, actor, request.campaignId);
  const characters = await readCharacters(tx, request.campaignId);
  const selectedCharacter = request.characterId === null
    ? characters[0] ?? null
    : characters.find(({ id }) => id === positiveId(request.characterId!, "Character")) ?? null;
  if (request.characterId !== null && !selectedCharacter) {
    throw new Error("The selected Character does not belong to this Campaign.");
  }
  if (!selectedCharacter) return {
    campaignId: request.campaignId,
    characters,
    selectedCharacter: null,
    weapons: [],
    selectedWeapon: null,
    selectedFiringModeId: null,
    detail: null,
    persistentOverride: null,
  };
  const weapons = await readCharacterWeapons(tx, request.campaignId, selectedCharacter.id);
  const selectedWeapon = request.itemId === null
    ? weapons.find(({ owned }) => owned) ?? weapons[0] ?? null
    : weapons.find(({ itemId }) => itemId === positiveId(request.itemId!, "Item")) ?? null;
  if (request.itemId !== null && !selectedWeapon) {
    throw new Error("That canonical Weapon is neither owned by this Character nor retained by an existing override.");
  }
  if (!selectedWeapon) return {
    campaignId: request.campaignId,
    characters,
    selectedCharacter,
    weapons,
    selectedWeapon: null,
    selectedFiringModeId: null,
    detail: null,
    persistentOverride: null,
  };
  const detail = await readCharacterWeaponGovernanceDetailInTransaction(tx, actor, {
    campaignId: request.campaignId,
    characterId: selectedCharacter.id,
    itemId: selectedWeapon.itemId,
    firingModeId: request.firingModeId,
  });
  if (request.firingModeId !== null && !detail.governance.modes.some(({ id }) => id === request.firingModeId)) {
    throw new Error("The selected firing mode does not belong to this Weapon Profile.");
  }
  return {
    campaignId: request.campaignId,
    characters,
    selectedCharacter,
    weapons,
    selectedWeapon,
    selectedFiringModeId: request.firingModeId,
    detail,
    persistentOverride: await persistentOverrideView(tx, detail.persistentOverride, detail),
  };
}

export async function saveGodCharacterWeaponOverrideInTransaction(
  tx: WeaponGovernanceManagementTransaction,
  actor: CharacterWeaponGovernanceActor,
  request: SaveCharacterWeaponOverrideRequest,
): Promise<void> {
  await assertCampaignOwnerGod(tx, actor, request.campaignId);
  await assertCharacterOwnsCanonicalWeaponInTransaction(tx, request);
  await createOrReplaceCharacterWeaponOverrideInTransaction(tx, actor, request);
}

export async function removeGodCharacterWeaponOverrideInTransaction(
  tx: WeaponGovernanceManagementTransaction,
  actor: CharacterWeaponGovernanceActor,
  scope: CharacterWeaponOverrideScope,
): Promise<void> {
  await assertCampaignOwnerGod(tx, actor, scope.campaignId);
  const removed = await removeCharacterWeaponOverrideInTransaction(tx, actor, scope);
  if (!removed) throw new Error("That exact persistent weapon override no longer exists.");
}

export async function previewGodCharacterWeaponOneActionInTransaction(
  tx: WeaponGovernanceManagementTransaction,
  actor: CharacterWeaponGovernanceActor,
  request: CharacterWeaponGovernanceRequest & { oneActionOverride: CharacterWeaponOneActionOverride },
): Promise<CharacterWeaponGovernanceResult> {
  await assertCampaignOwnerGod(tx, actor, request.campaignId);
  await assertCharacterOwnsCanonicalWeaponInTransaction(tx, request);
  return resolveCharacterWeaponGovernanceInTransaction(tx, actor, request);
}

export async function recordGodWeaponGovernanceRollInTransaction(
  tx: WeaponGovernanceManagementTransaction,
  actor: AuthorizedRollActor,
  input: GodWeaponGovernanceRollRequest,
): Promise<RollLedgerEntry> {
  const { governance: governanceRequest, modifiers, ...roll } = input;
  await assertCampaignOwnerGod(tx, actor, governanceRequest.campaignId);
  if (actor.campaignId !== governanceRequest.campaignId) {
    throw new Error("The selected weapon governance does not belong to this Roll Session's Campaign.");
  }
  await assertCharacterOwnsCanonicalWeaponInTransaction(tx, governanceRequest);
  const governance = await resolveCharacterWeaponGovernanceInTransaction(
    tx,
    actor,
    governanceRequest,
  );
  if (
    governance.status !== "resolved-normal"
    && governance.status !== "resolved-persistent-override"
    && governance.status !== "resolved-one-action-override"
  ) {
    throw new Error("Weapon governance must resolve to an exact source before this Roll can be recorded.");
  }
  return recordRollInTransaction(tx, actor, {
    ...roll,
    rollerCharacterId: governance.characterId,
    targetNumber: null,
    mechanical: {
      governingSource: governance.rollGoverningSource,
      modifiers,
    },
  });
}

export async function readPlayerWeaponGovernanceInTransaction(
  tx: WeaponGovernanceManagementTransaction,
  actor: CharacterWeaponGovernanceActor,
  characterIdInput: number,
): Promise<PlayerWeaponGovernanceView> {
  const characterId = positiveId(characterIdInput, "Character");
  const [character] = await tx.select({
    id: campaignCharacter.id,
    name: campaignCharacter.name,
    campaignId: campaignCharacter.campaignId,
  }).from(campaignCharacter)
    .innerJoin(campaignPlayer, and(
      eq(campaignPlayer.campaignId, campaignCharacter.campaignId),
      eq(campaignPlayer.userId, actor.userId),
    ))
    .where(and(
      eq(campaignCharacter.id, characterId),
      eq(campaignCharacter.playerUserId, actor.userId),
      eq(campaignCharacter.isNpc, false),
    ))
    .limit(1);
  if (!character) throw new Error("A Player may see weapon governance only for their own assigned Character.");
  const weapons = (await readCharacterWeapons(tx, character.campaignId, character.id)).filter(({ owned }) => owned);
  const weaponViews: PlayerWeaponGovernanceWeaponView[] = [];
  for (const weapon of weapons) {
    const defaultDetail = await readCharacterWeaponGovernanceDetailInTransaction(tx, actor, {
      campaignId: character.campaignId,
      characterId: character.id,
      itemId: weapon.itemId,
      firingModeId: null,
    });
    const modes: PlayerWeaponGovernanceModeView[] = [{
      firingModeId: null,
      label: "Weapon default",
      canonicalBehavior: "weapon-default",
      resolution: defaultDetail.resolution,
    }];
    for (const mode of defaultDetail.governance.modes) {
      modes.push({
        firingModeId: mode.id,
        label: mode.name,
        canonicalBehavior: mode.canonicalBehavior,
        resolution: await resolveCharacterWeaponGovernanceInTransaction(tx, actor, {
          campaignId: character.campaignId,
          characterId: character.id,
          itemId: weapon.itemId,
          firingModeId: mode.id,
        }),
      });
    }
    weaponViews.push({ ...weapon, modes });
  }
  return { characterId: character.id, characterName: character.name, weapons: weaponViews };
}

export async function readOverrideIdsForAllocationsInTransaction(
  tx: WeaponGovernanceManagementTransaction,
  characterId: number,
  allocationIds: readonly number[],
): Promise<Array<{
  overrideId: number;
  allocationId: number;
  campaignId: number;
  itemId: number;
  weaponName: string;
  canonicalId: string;
  firingModeId: number | null;
}>> {
  if (!allocationIds.length) return [];
  const rows = await tx.select({
    overrideId: campaignCharacterWeaponOverride.id,
    allocationId: campaignCharacterWeaponOverride.skillAllocationId,
    campaignId: campaignCharacterWeaponOverride.campaignId,
    itemId: campaignCharacterWeaponOverride.itemId,
    weaponName: item.name,
    canonicalId: item.canonicalId,
    firingModeId: campaignCharacterWeaponOverride.firingModeId,
  }).from(campaignCharacterWeaponOverride)
    .innerJoin(item, eq(item.id, campaignCharacterWeaponOverride.itemId))
    .where(and(
      eq(campaignCharacterWeaponOverride.characterId, positiveId(characterId, "Character")),
      isNotNull(campaignCharacterWeaponOverride.skillAllocationId),
      inArray(campaignCharacterWeaponOverride.skillAllocationId, allocationIds),
    ));
  return rows.flatMap((row) => row.allocationId === null ? [] : [{ ...row, allocationId: row.allocationId }]);
}
