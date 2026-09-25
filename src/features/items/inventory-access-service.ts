import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import type { db } from "@/db";
import { containerProfile, inventoryInstanceLocation, inventoryStackLocation } from "@/db/container-schema";
import { inventoryContainerAccess, inventoryInstanceCustody, inventoryStackCustody } from "@/db/inventory-access-schema";
import { campaignCharacterItem, campaignCharacterItemInstance } from "@/db/realm-schema";
import { item } from "@/db/item-schema";
import { firearmMagazineAttachment } from "@/db/magazine-schema";
import { availableLooseQuantity, requireInventoryAvailability, resolveInventoryAvailability, type InventoryAccessGraph } from "./inventory-access";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Caller owns the Character/Encounter lock for mutation. No authorization is implied by this internal read. */
export async function readInventoryAccessInTransaction(tx: Tx, characterId: number): Promise<InventoryAccessGraph> {
  const copies = await tx.select({ instanceId: campaignCharacterItemInstance.id, itemId: campaignCharacterItemInstance.itemId, containerInstanceId: inventoryInstanceLocation.containerInstanceId,
    name: item.name, closureMode: containerProfile.closureMode, state: inventoryContainerAccess.state }).from(campaignCharacterItemInstance)
    .innerJoin(item, eq(item.id, campaignCharacterItemInstance.itemId)).leftJoin(containerProfile, eq(containerProfile.itemId, item.id))
    .leftJoin(inventoryInstanceLocation, eq(inventoryInstanceLocation.instanceId, campaignCharacterItemInstance.id))
    .leftJoin(inventoryContainerAccess, eq(inventoryContainerAccess.instanceId, campaignCharacterItemInstance.id))
    .where(and(eq(campaignCharacterItemInstance.characterId, characterId), isNull(campaignCharacterItemInstance.retiredAt))).orderBy(campaignCharacterItemInstance.id);
  const stacks = await tx.select().from(campaignCharacterItem).where(eq(campaignCharacterItem.characterId, characterId)).orderBy(campaignCharacterItem.itemId);
  const allocations = await tx.select().from(inventoryStackLocation).where(eq(inventoryStackLocation.characterId, characterId)).orderBy(inventoryStackLocation.itemId, inventoryStackLocation.containerInstanceId);
  const exactCustody = await tx.select().from(inventoryInstanceCustody).where(eq(inventoryInstanceCustody.characterId, characterId)).orderBy(inventoryInstanceCustody.instanceId);
  const stackCustody = await tx.select().from(inventoryStackCustody).where(eq(inventoryStackCustody.characterId, characterId)).orderBy(inventoryStackCustody.id);
  const attachments = await tx.select().from(firearmMagazineAttachment).where(eq(firearmMagazineAttachment.characterId, characterId)).orderBy(firearmMagazineAttachment.weaponInstanceId);
  const graph: InventoryAccessGraph = { instances: copies, exactCustody, stackCustody, attachments,
    containers: copies.filter(row => row.closureMode !== null).map(row => ({ ...row, closureMode: row.closureMode! })),
    stacks: stacks.map(row => ({ itemId: row.itemId, ownedQuantity: row.quantity, looseQuantity: 0, allocations: allocations.filter(a => a.itemId === row.itemId) })) };
  for (const row of graph.stacks) row.looseQuantity = availableLooseQuantity(graph, row.itemId);
  return graph;
}
export async function assertExactInventoryAvailable(tx: Tx, characterId: number, instanceId: number, loose = true) {
  const graph = await readInventoryAccessInTransaction(tx, characterId);
  const availability = resolveInventoryAvailability(graph, { instanceId });
  requireInventoryAvailability(availability, loose);
  return availability;
}
export async function assertLooseStackAvailable(tx: Tx, characterId: number, itemId: number, quantity: number) {
  if (!Number.isSafeInteger(quantity) || quantity < 0) throw new Error("Choose a valid whole Item quantity.");
  const graph = await readInventoryAccessInTransaction(tx, characterId);
  if (quantity > availableLooseQuantity(graph, itemId)) throw new Error("Not enough carried, Loose inventory is available. Retrieve or recover the required quantity first.");
}
