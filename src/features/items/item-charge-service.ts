import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import { item, itemRuntimeProfile } from "@/db/item-schema";
import { campaignCharacter, campaignCharacterItemInstance } from "@/db/realm-schema";
import {
  canMutateActiveHealth,
  canReadActiveState,
} from "@/features/active-state/authorization";
import { requireSession } from "@/lib/server-access";

import { lockEquipmentStateCharacterInTransaction, type EquipmentStateTransaction } from "./equipment-state-service";
import {
  createItemChargeState,
  restoreItemCharges,
  restoreItemChargesFull,
  setItemCurrentCharges,
  spendItemCharges,
  type CharacterItemChargeStateView,
  type ItemChargeState,
} from "./item-charge";
import { validateItemRuntimeProfile } from "./item-runtime";

export type ItemChargeTransaction = EquipmentStateTransaction;

export type ItemChargeInstanceIdentity = {
  characterId: number;
  itemId: number;
  instanceId: number;
};

export type RestoreItemChargesCommand = ItemChargeInstanceIdentity & { amount: number };
export type SetItemCurrentChargesCommand = ItemChargeInstanceIdentity & { currentCharges: number };

type ChargeRow = {
  instanceId: number;
  characterId: number;
  itemId: number;
  itemName: string;
  currentCharges: number;
  equipmentState: string;
  runtimeUseMode: string | null;
  runtimeQuantityPerUse: number | null;
  runtimeMaximumCharges: number | null;
  runtimeChargesPerUse: number | null;
  runtimeRechargeNotes: string | null;
  runtimeActivationLabel: string | null;
  runtimeUseNotes: string | null;
};

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must reference a saved record.`);
  return value;
}

function stateFromRow(row: ChargeRow): ItemChargeState {
  if (row.runtimeUseMode !== "charges") {
    return createItemChargeState({
      instanceId: row.instanceId,
      itemId: row.itemId,
      itemName: row.itemName,
      maximumCharges: null,
      currentCharges: row.currentCharges,
      chargesPerUse: null,
      equipmentState: row.equipmentState as ItemChargeState["equipmentState"],
      rechargeNotes: "",
      definitionStatus: "definition-mismatch",
    });
  }
  const validation = validateItemRuntimeProfile({
    useMode: row.runtimeUseMode,
    quantityPerUse: row.runtimeQuantityPerUse,
    maximumCharges: row.runtimeMaximumCharges,
    chargesPerUse: row.runtimeChargesPerUse,
    rechargeNotes: row.runtimeRechargeNotes,
    activationLabel: row.runtimeActivationLabel,
    useNotes: row.runtimeUseNotes,
  });
  if (!validation.valid || validation.profile.maximumCharges === null || validation.profile.chargesPerUse === null) {
    throw new Error(`Charged Item ${row.itemName} has an invalid current runtime definition.`);
  }
  return createItemChargeState({
    instanceId: row.instanceId,
    itemId: row.itemId,
    itemName: row.itemName,
    maximumCharges: validation.profile.maximumCharges,
    currentCharges: row.currentCharges,
    chargesPerUse: validation.profile.chargesPerUse,
    equipmentState: row.equipmentState as ItemChargeState["equipmentState"],
    rechargeNotes: validation.profile.rechargeNotes,
    definitionStatus: "charged",
  });
}

function chargeColumns() {
  return {
    instanceId: campaignCharacterItemInstance.id,
    characterId: campaignCharacterItemInstance.characterId,
    itemId: campaignCharacterItemInstance.itemId,
    itemName: item.name,
    currentCharges: campaignCharacterItemInstance.currentCharges,
    equipmentState: campaignCharacterItemInstance.equipmentState,
    runtimeUseMode: itemRuntimeProfile.useMode,
    runtimeQuantityPerUse: itemRuntimeProfile.quantityPerUse,
    runtimeMaximumCharges: itemRuntimeProfile.maximumCharges,
    runtimeChargesPerUse: itemRuntimeProfile.chargesPerUse,
    runtimeRechargeNotes: itemRuntimeProfile.rechargeNotes,
    runtimeActivationLabel: itemRuntimeProfile.activationLabel,
    runtimeUseNotes: itemRuntimeProfile.useNotes,
  };
}

export async function readCharacterItemChargeStateInTransaction(
  tx: ItemChargeTransaction,
  characterId: number,
): Promise<CharacterItemChargeStateView> {
  positiveId(characterId, "Charge State Character");
  const rows = await tx.select(chargeColumns()).from(campaignCharacterItemInstance)
    .innerJoin(item, eq(item.id, campaignCharacterItemInstance.itemId))
    .leftJoin(itemRuntimeProfile, eq(itemRuntimeProfile.itemId, item.id))
    .where(eq(campaignCharacterItemInstance.characterId, characterId))
    .orderBy(asc(item.name), asc(campaignCharacterItemInstance.id));
  return { characterId, instances: rows.map(stateFromRow) };
}

export async function readItemChargeStateInTransaction(
  tx: ItemChargeTransaction,
  identity: ItemChargeInstanceIdentity,
  lock = false,
): Promise<ItemChargeState> {
  positiveId(identity.characterId, "Charge State Character");
  positiveId(identity.itemId, "Charged Item");
  positiveId(identity.instanceId, "Charged Item Instance");
  if (lock) await lockEquipmentStateCharacterInTransaction(tx, identity.characterId);
  const query = tx.select(chargeColumns()).from(campaignCharacterItemInstance)
    .innerJoin(item, eq(item.id, campaignCharacterItemInstance.itemId))
    .leftJoin(itemRuntimeProfile, eq(itemRuntimeProfile.itemId, item.id))
    .where(and(
      eq(campaignCharacterItemInstance.id, identity.instanceId),
      eq(campaignCharacterItemInstance.characterId, identity.characterId),
      eq(campaignCharacterItemInstance.itemId, identity.itemId),
    )).limit(1);
  const rows = lock
    ? await query.for("update", { of: campaignCharacterItemInstance })
    : await query;
  if (!rows[0]) throw new Error("The selected owned Item instance was not found for this Character and Item.");
  const state = stateFromRow(rows[0]);
  if (state.definitionStatus !== "charged") {
    throw new Error("This owned Item instance is preserved, but its current Item definition no longer uses Charges. G.O.D./author resolution is required.");
  }
  return state;
}

async function updateCurrentChargesInTransaction(
  tx: ItemChargeTransaction,
  identity: ItemChargeInstanceIdentity,
  resolveNext: (state: ItemChargeState & { maximumCharges: number; chargesPerUse: number }) => number,
): Promise<ItemChargeState> {
  const state = await readItemChargeStateInTransaction(tx, identity, true);
  if (state.maximumCharges === null || state.chargesPerUse === null) {
    throw new Error("The current Item definition does not provide a valid Charge profile.");
  }
  const next = resolveNext({ ...state, maximumCharges: state.maximumCharges, chargesPerUse: state.chargesPerUse });
  const updated = await tx.update(campaignCharacterItemInstance).set({
    currentCharges: next,
    updatedAt: new Date(),
  }).where(and(
    eq(campaignCharacterItemInstance.id, identity.instanceId),
    eq(campaignCharacterItemInstance.characterId, identity.characterId),
    eq(campaignCharacterItemInstance.itemId, identity.itemId),
  )).returning({ id: campaignCharacterItemInstance.id });
  if (!updated.length) throw new Error("The selected owned Item instance changed before Charges could be updated.");
  return createItemChargeState({
    ...state,
    currentCharges: next,
  });
}

export function spendItemChargesInTransaction(
  tx: ItemChargeTransaction,
  identity: ItemChargeInstanceIdentity,
): Promise<ItemChargeState> {
  return updateCurrentChargesInTransaction(tx, identity, (state) => spendItemCharges(state.currentCharges, state.chargesPerUse));
}

export function restoreItemChargesInTransaction(
  tx: ItemChargeTransaction,
  command: RestoreItemChargesCommand,
): Promise<ItemChargeState> {
  return updateCurrentChargesInTransaction(tx, command, (state) => restoreItemCharges(state.currentCharges, state.maximumCharges, command.amount));
}

export function restoreItemChargesFullInTransaction(
  tx: ItemChargeTransaction,
  identity: ItemChargeInstanceIdentity,
): Promise<ItemChargeState> {
  return updateCurrentChargesInTransaction(tx, identity, (state) => restoreItemChargesFull(state.maximumCharges));
}

export function setItemCurrentChargesInTransaction(
  tx: ItemChargeTransaction,
  command: SetItemCurrentChargesCommand,
): Promise<ItemChargeState> {
  return updateCurrentChargesInTransaction(tx, command, (state) => setItemCurrentCharges(state.maximumCharges, command.currentCharges));
}

type Access = { tx: ItemChargeTransaction };
async function withChargeAccess<T>(
  characterId: number,
  access: "read" | "mutate",
  operation: (authorized: Access) => Promise<T>,
): Promise<T> {
  const session = await requireSession();
  return db.transaction(async (tx) => {
    const roles = await tx.select({ role: userRole.role }).from(userRole).where(eq(userRole.userId, session.user.id));
    const entities = await tx.select({ playerUserId: campaignCharacter.playerUserId, isNpc: campaignCharacter.isNpc, owner: campaign.createdByUserId, member: campaignPlayer.userId })
        .from(campaignCharacter).innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId))
        .leftJoin(campaignPlayer, and(eq(campaignPlayer.campaignId, campaignCharacter.campaignId), eq(campaignPlayer.userId, session.user.id)))
        .where(eq(campaignCharacter.id, characterId)).limit(1);
    const entity = entities[0];
    if (!entity) throw new Error("Character not found.");
    const subject = { userId: session.user.id, roles: roles.map(({ role }) => role) };
    const accessEntity = {
      playerUserId: entity.playerUserId,
      campaignOwnerUserId: entity.owner,
      isNpc: entity.isNpc,
      isCampaignMember: entity.member === session.user.id,
    };
    const authorized = access === "read"
      ? canReadActiveState(subject, accessEntity)
      : canMutateActiveHealth(subject, accessEntity);
    if (!authorized) throw new Error(`You do not have permission to ${access === "read" ? "view" : "manage"} this entity's Item Charges.`);
    return operation({ tx });
  });
}

function withChargeReadAccess<T>(characterId: number, operation: (access: Access) => Promise<T>): Promise<T> {
  return withChargeAccess(characterId, "read", operation);
}

function withChargeMutationAccess<T>(characterId: number, operation: (access: Access) => Promise<T>): Promise<T> {
  return withChargeAccess(characterId, "mutate", operation);
}

export function getCharacterItemChargeState(characterId: number): Promise<CharacterItemChargeStateView> {
  return withChargeReadAccess(characterId, ({ tx }) => readCharacterItemChargeStateInTransaction(tx, characterId));
}

async function mutateAndRead(
  characterId: number,
  mutation: (tx: ItemChargeTransaction) => Promise<ItemChargeState>,
): Promise<CharacterItemChargeStateView> {
  return withChargeMutationAccess(characterId, async ({ tx }) => {
    await mutation(tx);
    return readCharacterItemChargeStateInTransaction(tx, characterId);
  });
}

export function restoreItemChargesForCharacter(command: RestoreItemChargesCommand): Promise<CharacterItemChargeStateView> {
  return mutateAndRead(command.characterId, (tx) => restoreItemChargesInTransaction(tx, command));
}

export function restoreItemChargesFullForCharacter(identity: ItemChargeInstanceIdentity): Promise<CharacterItemChargeStateView> {
  return mutateAndRead(identity.characterId, (tx) => restoreItemChargesFullInTransaction(tx, identity));
}

export function setItemCurrentChargesForCharacter(command: SetItemCurrentChargesCommand): Promise<CharacterItemChargeStateView> {
  return mutateAndRead(command.characterId, (tx) => setItemCurrentChargesInTransaction(tx, command));
}
