import "server-only";
import { isDeepStrictEqual } from "node:util";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { item } from "@/db/item-schema";
import { inventoryCustodyEvent } from "@/db/inventory-access-schema";
import { campaignCharacterItem, campaignCharacterItemInstance, campaignCharacterProfile } from "@/db/realm-schema";
import { assertCharacterCombatWritableInTransaction } from "@/features/tabletop-operations/combat-freeze-service";
import { publishCharacterStateInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";
import { assertOutsideCombatEquipmentHandling } from "@/features/items/magazine-inventory-service";
import { assertExactInventoryAvailable, assertLooseStackAvailable, readInventoryAccessInTransaction } from "@/features/items/inventory-access-service";
import { availableLooseQuantity, resolveInventoryAvailability } from "@/features/items/inventory-access";
import { ACTIVE_EQUIPMENT_STATES, type EquipmentState } from "@/features/items/equipment-state";
import { readCharacterEquipmentStateInTransaction, reconcileEquipmentAfterOwnershipMutationInTransaction, requireEquipmentState,
  setInstanceEquipmentStateInTransaction, setStackEquipmentStateInTransaction, validateEquipmentOwnershipMutationInTransaction } from "@/features/items/equipment-state-service";
import { authorizeOwnedCreatureInTransaction } from "./owned-creature-service";
import type { CreatureNpcConstructorTransaction as Transaction } from "./creature-npc-constructor-service";

export type CompanionEquipmentCommand = {
  ownerCharacterId: number; creatureCharacterId: number; itemId: number; instanceId: number | null; quantity: number;
  operation: "to-creature" | "to-character" | "set-state"; state: EquipmentState;
  ownerVersion: number; creatureVersion: number; requestKey: string;
  expectedStates: { inactive: number; equipped: number; worn: number; wielded: number };
};
const specialItem = {
  container: sql<boolean>`exists(select 1 from container_profiles cp where cp.item_id = ${item.id})`,
};

async function equipmentRows(tx: Transaction, characterId: number) {
  const equipment = await readCharacterEquipmentStateInTransaction(tx, characterId);
  const access = await readInventoryAccessInTransaction(tx, characterId);
  const ids = [...new Set([...equipment.stacks, ...equipment.instances].map(row => row.itemId))];
  const definitions = ids.length ? await tx.select({ id: item.id, archivedAt: item.archivedAt, ...specialItem }).from(item).where(inArray(item.id, ids)) : [];
  const eligible = (id: number) => definitions.some(row => row.id === id && !row.archivedAt && !row.container);
  return [
    ...equipment.stacks.map(row => ({ itemId: row.itemId, instanceId: null as number | null, name: row.itemName, quantity: row.ownedQuantity,
      inactive: row.inactiveQuantity, equipped: row.equippedQuantity, worn: row.wornQuantity, wielded: row.wieldedQuantity,
      transferable: Math.min(row.inactiveQuantity, availableLooseQuantity(access, row.itemId)), eligible: eligible(row.itemId),
    })),
    ...equipment.instances.map(row => { const available = resolveInventoryAvailability(access, { instanceId: row.instanceId }); return {
      itemId: row.itemId, instanceId: row.instanceId, name: row.itemName, quantity: 1,
      inactive: row.state === "inactive" ? 1 : 0, equipped: row.state === "equipped" ? 1 : 0, worn: row.state === "worn" ? 1 : 0, wielded: row.state === "wielded" ? 1 : 0,
      transferable: available.custody === "carried" && available.containerInstanceId === null && row.state === "inactive" ? 1 : 0, eligible: eligible(row.itemId),
    }; }),
  ];
}
async function versions(tx: Transaction, ownerId: number, creatureId: number) {
  const profiles = await tx.select({ id: campaignCharacterProfile.characterId, version: campaignCharacterProfile.commerceVersion }).from(campaignCharacterProfile)
    .where(inArray(campaignCharacterProfile.characterId, [ownerId, creatureId]));
  if (profiles.length !== 2) throw new Error("The Character or Creature inventory profile is missing.");
  return { ownerVersion: profiles.find(row => row.id === ownerId)!.version, creatureVersion: profiles.find(row => row.id === creatureId)!.version };
}

export async function readCompanionEquipmentForActor(ownerCharacterId: number, creatureCharacterId: number, userId: string) {
  return db.transaction(async tx => {
    const access = await authorizeOwnedCreatureInTransaction(tx, ownerCharacterId, creatureCharacterId, userId);
    return { ...await versions(tx, ownerCharacterId, creatureCharacterId), canChange: access.canChange,
      ownerEquipment: await equipmentRows(tx, ownerCharacterId), creatureEquipment: await equipmentRows(tx, creatureCharacterId) };
  });
}

async function setState(tx: Transaction, holderId: number, command: CompanionEquipmentCommand) {
  if (command.instanceId !== null) {
    await setInstanceEquipmentStateInTransaction(tx, { characterId: holderId, instanceId: command.instanceId, state: command.state });
  } else {
    // Same whole-stack role operation as the Character sheet; shared setters retain validation and passive effects.
    for (const state of ACTIVE_EQUIPMENT_STATES) if (state !== command.state) await setStackEquipmentStateInTransaction(tx, { characterId: holderId, itemId: command.itemId, state, quantity: 0 });
    if (command.state !== "inactive") await setStackEquipmentStateInTransaction(tx, { characterId: holderId, itemId: command.itemId, state: command.state, quantity: command.quantity });
  }
}

export async function changeCompanionEquipmentForActor(input: CompanionEquipmentCommand, userId: string) {
  if (![input.ownerCharacterId, input.creatureCharacterId, input.itemId, input.quantity].every(value => Number.isSafeInteger(value) && value > 0)
    || (input.instanceId !== null && (!Number.isSafeInteger(input.instanceId) || input.instanceId <= 0 || input.quantity !== 1))
    || ![input.ownerVersion, input.creatureVersion].every(value => Number.isSafeInteger(value) && value >= 0)
    || !["inactive", ...ACTIVE_EQUIPMENT_STATES].every(state => Number.isSafeInteger(input.expectedStates?.[state as EquipmentState]) && input.expectedStates[state as EquipmentState] >= 0)
    || !input.requestKey?.trim() || input.requestKey.length > 160
    || !["to-creature", "to-character", "set-state"].includes(input.operation)) throw new Error("Choose current personal equipment, a valid quantity, and a retry identity.");
  const command: CompanionEquipmentCommand = { ownerCharacterId: input.ownerCharacterId, creatureCharacterId: input.creatureCharacterId, itemId: input.itemId,
    instanceId: input.instanceId, quantity: input.quantity, operation: input.operation, state: requireEquipmentState(input.state), ownerVersion: input.ownerVersion, creatureVersion: input.creatureVersion, requestKey: input.requestKey,
    expectedStates: { inactive: input.expectedStates.inactive, equipped: input.expectedStates.equipped, worn: input.expectedStates.worn, wielded: input.expectedStates.wielded } };
  return db.transaction(async tx => {
    await authorizeOwnedCreatureInTransaction(tx, command.ownerCharacterId, command.creatureCharacterId, userId, false);
    // Preserve the existing Encounter-before-Character lock order. This pass offers only out-of-combat handling.
    for (const id of [command.ownerCharacterId, command.creatureCharacterId].sort((a,b) => a-b)) {
      await assertCharacterCombatWritableInTransaction(tx, id);
      await assertOutsideCombatEquipmentHandling(tx, id);
    }
    const access = await authorizeOwnedCreatureInTransaction(tx, command.ownerCharacterId, command.creatureCharacterId, userId);
    if (!access.canOperate) throw new Error("Only the owning Player or Campaign G.O.D. may manage companion equipment.");
    if (!access.canChange) throw new Error("Restore the Campaign, Character, and Creature before managing equipment.");
    const [receipt] = await tx.select().from(inventoryCustodyEvent).where(and(eq(inventoryCustodyEvent.characterId, command.ownerCharacterId), eq(inventoryCustodyEvent.requestKey, command.requestKey)));
    if (receipt) {
      if (receipt.actorUserId !== userId || !isDeepStrictEqual(receipt.evidence.command, command)) throw new Error("This retry identity belongs to another inventory operation.");
      return { eventId: receipt.id };
    }
    const current = await versions(tx, command.ownerCharacterId, command.creatureCharacterId);
    if (current.ownerVersion !== command.ownerVersion || current.creatureVersion !== command.creatureVersion) throw new Error("Inventory changed. Refresh companion equipment before continuing.");
    const [definition] = await tx.select({ id: item.id, archivedAt: item.archivedAt, scope: item.catalogScope, ...specialItem }).from(item).where(eq(item.id, command.itemId)).for("update");
    if (!definition || definition.archivedAt || definition.scope !== "equipment" || definition.container) throw new Error("Choose active personal Equipment. Containers and cargo use their separate inventory controls.");
    const from = command.operation === "to-creature" ? command.ownerCharacterId : command.creatureCharacterId;
    const to = command.operation === "to-creature" ? command.creatureCharacterId : command.ownerCharacterId;
    const selected = (await equipmentRows(tx, from)).find(row => row.itemId === command.itemId && row.instanceId === command.instanceId);
    if (!selected || !["inactive", ...ACTIVE_EQUIPMENT_STATES].every(state => selected[state as EquipmentState] === command.expectedStates[state as EquipmentState])) {
      throw new Error("Equipment changed. Refresh companion equipment before continuing.");
    }
    if (command.instanceId !== null) {
      const [copy] = await tx.select({ id: campaignCharacterItemInstance.id }).from(campaignCharacterItemInstance).where(and(eq(campaignCharacterItemInstance.id, command.instanceId), eq(campaignCharacterItemInstance.itemId, command.itemId), eq(campaignCharacterItemInstance.characterId, from), isNull(campaignCharacterItemInstance.retiredAt)));
      if (!copy) throw new Error("Choose an exact Item currently held by that Character or Creature.");
    }
    if (command.operation === "set-state") await setState(tx, command.creatureCharacterId, command);
    else {
      const stacks = await tx.select().from(campaignCharacterItem).where(eq(campaignCharacterItem.characterId, from)).orderBy(asc(campaignCharacterItem.itemId));
      if (command.instanceId !== null) {
        await assertExactInventoryAvailable(tx, from, command.instanceId);
        if (command.operation === "to-character") await setState(tx, from, { ...command, state: "inactive" });
        await validateEquipmentOwnershipMutationInTransaction(tx, { characterId: from, nextStackQuantities: stacks, removedInstanceIds: [command.instanceId] });
        // Prepared firearms have a holder-scoped runtime record; do not discard or recreate it here.
        const preparation = await tx.execute(sql`select 1 from campaign_character_firearm_state where item_instance_id = ${command.instanceId} limit 1`);
        if (preparation.rows.length) throw new Error("This copy has firearm runtime state. Its transfer requires the firearm inventory workflow.");
        await tx.update(campaignCharacterItemInstance).set({ characterId: to, updatedAt: new Date() }).where(eq(campaignCharacterItemInstance.id, command.instanceId));
      } else {
        const stack = stacks.find(row => row.itemId === command.itemId);
        if (!stack || stack.quantity < command.quantity) throw new Error("That equipment quantity is no longer held here.");
        await assertLooseStackAvailable(tx, from, command.itemId, command.quantity);
        if (command.operation === "to-character") await setState(tx, from, { ...command, state: "inactive" });
        await validateEquipmentOwnershipMutationInTransaction(tx, { characterId: from, nextStackQuantities: stacks.map(row => ({ itemId: row.itemId, quantity: row.quantity - (row.itemId === command.itemId ? command.quantity : 0) })), removedInstanceIds: [] });
        const [destination] = await tx.select().from(campaignCharacterItem).where(and(eq(campaignCharacterItem.characterId, to), eq(campaignCharacterItem.itemId, command.itemId)));
        const quantity = (destination?.quantity ?? 0) + command.quantity;
        const cost = ((destination?.quantity ?? 0) * (destination?.unitCostCredits ?? 0) + command.quantity * stack.unitCostCredits) / quantity;
        if (stack.quantity === command.quantity) await tx.delete(campaignCharacterItem).where(and(eq(campaignCharacterItem.characterId, from), eq(campaignCharacterItem.itemId, command.itemId)));
        else await tx.update(campaignCharacterItem).set({ quantity: stack.quantity - command.quantity }).where(and(eq(campaignCharacterItem.characterId, from), eq(campaignCharacterItem.itemId, command.itemId)));
        await tx.insert(campaignCharacterItem).values({ characterId: to, itemId: command.itemId, quantity, unitCostCredits: cost }).onConflictDoUpdate({ target: [campaignCharacterItem.characterId, campaignCharacterItem.itemId], set: { quantity, unitCostCredits: cost } });
      }
      await reconcileEquipmentAfterOwnershipMutationInTransaction(tx, from);
      if (command.operation === "to-creature" && command.state !== "inactive") {
        if (command.instanceId !== null) await setState(tx, to, command);
        else {
          const equipment = await readCharacterEquipmentStateInTransaction(tx, to);
          const row = equipment.stacks.find(row => row.itemId === command.itemId)!;
          const existing = command.state === "worn" ? row.wornQuantity : command.state === "wielded" ? row.wieldedQuantity : row.equippedQuantity;
          await setStackEquipmentStateInTransaction(tx, { characterId: to, itemId: command.itemId, state: command.state, quantity: existing + command.quantity });
        }
      }
      await reconcileEquipmentAfterOwnershipMutationInTransaction(tx, to);
    }
    for (const id of [command.ownerCharacterId, command.creatureCharacterId]) {
      await tx.update(campaignCharacterProfile).set({ commerceVersion: sql`${campaignCharacterProfile.commerceVersion} + 1`, updatedAt: new Date() }).where(eq(campaignCharacterProfile.characterId, id));
      await publishCharacterStateInvalidationInTransaction(tx, id);
    }
    const [event] = await tx.insert(inventoryCustodyEvent).values({ characterId: command.ownerCharacterId, itemId: command.itemId, instanceId: command.instanceId, quantity: command.quantity,
      operation: `companion-equipment-${command.operation}`, previousStatus: "carried", newStatus: "carried", requestKey: command.requestKey, actorUserId: userId,
      evidence: { command, sourceCharacterId: from, destinationCharacterId: command.operation === "set-state" ? from : to } }).returning({ id: inventoryCustodyEvent.id });
    return { eventId: event.id };
  });
}
