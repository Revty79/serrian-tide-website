import "server-only";

import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaign } from "@/db/campaign-schema";
import { item, itemPowerResource, itemRuntimeProfile, weaponProfile, weaponFiringMode } from "@/db/item-schema";
import { firearmMagazineAttachment } from "@/db/magazine-schema";
import { campaignCharacter, campaignCharacterProfile, campaignCharacterItem, campaignCharacterItemInstance, campaignCharacterItemEquipmentState, campaignInventoryItem } from "@/db/realm-schema";
import { campaignCharacterFirearmState } from "@/db/tabletop-operations-schema";
import { requireSession } from "@/lib/server-access";
import { assertCharacterCombatWritableInTransaction } from "@/features/tabletop-operations/combat-freeze-service";
import { publishCharacterStateInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";
import { getItemOwnershipStrategy, getStartingItemInstanceCharges } from "./item-ownership";
import { DEFAULT_ITEM_RUNTIME_PROFILE, type ItemRuntimeProfile } from "./item-runtime";
import { EQUIPMENT_STATES, type EquipmentState } from "./equipment-state";
import { lockEquipmentStateCharacterInTransaction, reconcileEquipmentAfterOwnershipMutationInTransaction, setInstanceEquipmentStateInTransaction, setStackEquipmentStateInTransaction, validateEquipmentOwnershipMutationInTransaction } from "./equipment-state-service";
import { assertOutsideCombatEquipmentHandling } from "./magazine-inventory-service";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type OwnerInventoryCommand = {
  characterId: number;
  itemId: number;
  quantity: number;
  expectedCommerceVersion: number;
} & ({ operation: "grant" } | { operation: "remove"; instanceId: number | null; state: EquipmentState });

async function requireOwner(tx: Transaction, characterId: number, userId: string, lock = false) {
  const query = tx.select({ campaignId: campaign.id, owner: campaign.createdByUserId, archived: campaign.archivedAt, characterArchived: campaignCharacter.archivedAt })
    .from(campaignCharacter).innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId))
    .where(eq(campaignCharacter.id, characterId));
  const [target] = await (lock ? query.for("share", { of: campaign }) : query);
  if (!target || target.owner !== userId) throw new Error("Only this Character's campaign creator can grant or remove owned items.");
  if (target.archived || target.characterArchived) throw new Error("Restore the archived Campaign or Character before adjusting inventory.");
  return target;
}

async function availableItems(tx: Transaction, campaignId: number) {
  return tx.select({ id: item.id, name: item.name, canonicalId: item.canonicalId, description: item.description, recordType: item.recordType })
    .from(campaignInventoryItem).innerJoin(item, eq(item.id, campaignInventoryItem.itemId))
    .where(and(eq(campaignInventoryItem.campaignId, campaignId), isNull(item.archivedAt)))
    .orderBy(asc(item.name), asc(item.id));
}

export async function getOwnerGrantItems(characterId: number) {
  const session = await requireSession();
  return db.transaction(async tx => {
    const target = await requireOwner(tx, characterId, session.user.id);
    return availableItems(tx, target.campaignId);
  });
}

/** A locked monotonic inventory version makes repeats fail closed without a new receipt schema. */
export async function adjustOwnerInventory(command: OwnerInventoryCommand) {
  const session = await requireSession();
  if (![command.characterId, command.itemId, command.quantity].every(value => Number.isSafeInteger(value) && value > 0)
    || !Number.isSafeInteger(command.expectedCommerceVersion) || command.expectedCommerceVersion < 0) {
    throw new Error("Choose a saved item and a positive whole quantity from the current inventory.");
  }
  if (command.operation === "grant" && command.quantity > 1000) throw new Error("Add up to 1,000 copies per adjustment.");
  if (command.operation !== "grant" && command.operation !== "remove") throw new Error("Choose Add or Remove.");
  return db.transaction(async tx => {
    await requireOwner(tx, command.characterId, session.user.id);
    await assertCharacterCombatWritableInTransaction(tx, command.characterId);
    await assertOutsideCombatEquipmentHandling(tx, command.characterId);
    await lockEquipmentStateCharacterInTransaction(tx, command.characterId);
    const target = await requireOwner(tx, command.characterId, session.user.id, true);
    const [profile] = await tx.select({ version: campaignCharacterProfile.commerceVersion }).from(campaignCharacterProfile)
      .where(eq(campaignCharacterProfile.characterId, command.characterId)).for("update");
    if (!profile || profile.version !== command.expectedCommerceVersion) throw new Error("Inventory changed or this adjustment already completed. Reload before making another adjustment.");
    if (command.operation === "grant") {
      const [definition] = await tx.select({
        id: item.id, runtime: itemRuntimeProfile, maximumCharges: itemPowerResource.maximumCharges,
        isMagazine: sql<boolean>`exists(select 1 from magazine_profiles where magazine_profiles.item_id = ${item.id})`,
        isFirearm: sql<boolean>`coalesce(lower(trim(${weaponProfile.profileRecordType})) <> 'ammunition' and (${weaponProfile.ammunitionItemId} is not null or exists(select 1 from ${weaponFiringMode} where ${weaponFiringMode.weaponProfileId} = ${weaponProfile.id})), false)`,
      }).from(campaignInventoryItem).innerJoin(item, eq(item.id, campaignInventoryItem.itemId))
        .leftJoin(itemRuntimeProfile, eq(itemRuntimeProfile.itemId, item.id)).leftJoin(itemPowerResource, eq(itemPowerResource.itemId, item.id))
        .leftJoin(weaponProfile, eq(weaponProfile.itemId, item.id))
        .where(and(eq(campaignInventoryItem.campaignId, target.campaignId), eq(item.id, command.itemId), isNull(item.archivedAt)))
        .for("share", { of: [item, campaignInventoryItem] });
      if (!definition) throw new Error("That item is not currently available to this Campaign.");
      const runtime = (definition.runtime ?? DEFAULT_ITEM_RUNTIME_PROFILE) as ItemRuntimeProfile;
      const exact = definition.isFirearm || definition.isMagazine;
      const powerResource = definition.maximumCharges === null ? null : { maximumCharges: definition.maximumCharges };
      const strategy = getItemOwnershipStrategy(runtime, exact, powerResource);
      const [stack] = await tx.select().from(campaignCharacterItem).where(and(eq(campaignCharacterItem.characterId, command.characterId), eq(campaignCharacterItem.itemId, command.itemId))).for("update");
      const [copy] = await tx.select({ id: campaignCharacterItemInstance.id }).from(campaignCharacterItemInstance).where(and(eq(campaignCharacterItemInstance.characterId, command.characterId), eq(campaignCharacterItemInstance.itemId, command.itemId), isNull(campaignCharacterItemInstance.retiredAt))).limit(1);
      if (strategy === "instance") {
        if (stack && !exact) throw new Error("Existing ownership uses a different tracking rule. Resolve it before granting more copies.");
        const charges = getStartingItemInstanceCharges(runtime, exact, powerResource);
        // Bound individual insert batches; no new quantity or starting-ammunition rule.
        for (let remaining = command.quantity; remaining > 0; remaining -= Math.min(remaining, 500)) {
          await tx.insert(campaignCharacterItemInstance).values(Array.from({ length: Math.min(remaining, 500) }, () => ({ characterId: command.characterId, itemId: command.itemId, currentCharges: charges, unitCostCredits: 0 })));
        }
      } else {
        if (copy) throw new Error("Existing ownership uses individual copies. Resolve it before granting a stack.");
        const quantity = (stack?.quantity ?? 0) + command.quantity;
        if (!Number.isSafeInteger(quantity) || quantity > 2147483647) throw new Error("The resulting owned quantity is too large.");
        // Existing weighted acquisition-cost convention: free copies add no purchase cost.
        const unitCostCredits = stack ? stack.quantity * stack.unitCostCredits / quantity : 0;
        await tx.insert(campaignCharacterItem).values({ characterId: command.characterId, itemId: command.itemId, quantity, unitCostCredits })
          .onConflictDoUpdate({ target: [campaignCharacterItem.characterId, campaignCharacterItem.itemId], set: { quantity, unitCostCredits } });
      }
    } else {
      if (!EQUIPMENT_STATES.includes(command.state)) throw new Error("Choose the equipment state to remove from.");
      if (command.instanceId !== null) {
        if (!Number.isSafeInteger(command.instanceId) || command.instanceId <= 0 || command.quantity !== 1) throw new Error("Choose one exact owned copy.");
        const [copy] = await tx.select().from(campaignCharacterItemInstance).where(and(eq(campaignCharacterItemInstance.id, command.instanceId), eq(campaignCharacterItemInstance.characterId, command.characterId), eq(campaignCharacterItemInstance.itemId, command.itemId), isNull(campaignCharacterItemInstance.retiredAt))).for("update");
        if (!copy) throw new Error("That exact copy is no longer owned by this Character.");
        if (copy.equipmentState !== command.state) throw new Error("This copy's equipment state changed. Reload before removing it.");
        const [attachment] = await tx.select({ id: firearmMagazineAttachment.weaponInstanceId }).from(firearmMagazineAttachment).where(or(eq(firearmMagazineAttachment.weaponInstanceId, copy.id), eq(firearmMagazineAttachment.magazineInstanceId, copy.id)));
        if (attachment) throw new Error("Detach the magazine through the existing firearm controls before removing this copy.");
        const [firearm] = await tx.select().from(campaignCharacterFirearmState).where(eq(campaignCharacterFirearmState.itemInstanceId, copy.id)).for("update");
        if (copy.loadedRounds > 0 || (firearm?.loadedRounds ?? 0) > 0) throw new Error("Unload the firearm or empty the magazine through its existing controls before removing this copy.");
        if (copy.equipmentState !== "inactive") await setInstanceEquipmentStateInTransaction(tx, { characterId: command.characterId, instanceId: copy.id, state: "inactive" });
        const stacks = await tx.select().from(campaignCharacterItem).where(eq(campaignCharacterItem.characterId, command.characterId));
        await validateEquipmentOwnershipMutationInTransaction(tx, { characterId: command.characterId, nextStackQuantities: stacks, removedInstanceIds: [copy.id] });
        // Retain exact charge/ammunition history and references, as existing sale retirement does.
        await tx.update(campaignCharacterItemInstance).set({ retiredAt: new Date(), retirementReason: "Removed by campaign creator.", updatedAt: new Date() }).where(eq(campaignCharacterItemInstance.id, copy.id));
      } else {
        const stacks = await tx.select().from(campaignCharacterItem).where(eq(campaignCharacterItem.characterId, command.characterId)).for("update");
        const stack = stacks.find(entry => entry.itemId === command.itemId);
        if (!stack) throw new Error("This Character no longer owns that stack.");
        const states = await tx.select().from(campaignCharacterItemEquipmentState).where(and(eq(campaignCharacterItemEquipmentState.characterId, command.characterId), eq(campaignCharacterItemEquipmentState.itemId, command.itemId)));
        const available = command.state === "inactive" ? stack.quantity - states.reduce((sum, row) => sum + row.quantity, 0) : states.find(row => row.state === command.state)?.quantity ?? 0;
        if (command.quantity > available) throw new Error("Not enough copies remain in that equipment state. Reload and check the removal quantity.");
        if (command.state !== "inactive") await setStackEquipmentStateInTransaction(tx, { characterId: command.characterId, itemId: command.itemId, state: command.state, quantity: available - command.quantity });
        const quantity = stack.quantity - command.quantity;
        await validateEquipmentOwnershipMutationInTransaction(tx, { characterId: command.characterId, nextStackQuantities: stacks.map(row => row.itemId === command.itemId ? { ...row, quantity } : row), removedInstanceIds: [] });
        const where = and(eq(campaignCharacterItem.characterId, command.characterId), eq(campaignCharacterItem.itemId, command.itemId));
        if (quantity === 0) await tx.delete(campaignCharacterItem).where(where);
        else await tx.update(campaignCharacterItem).set({ quantity }).where(where);
      }
      await reconcileEquipmentAfterOwnershipMutationInTransaction(tx, command.characterId);
    }
    await tx.update(campaignCharacterProfile).set({ commerceVersion: profile.version + 1, updatedAt: new Date() }).where(eq(campaignCharacterProfile.characterId, command.characterId));
    await publishCharacterStateInvalidationInTransaction(tx, command.characterId);
  });
}
