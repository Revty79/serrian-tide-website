import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { db } from "@/db";
import { containerProfile, inventoryInstanceLocation, inventoryStackLocation } from "@/db/container-schema";
import { item } from "@/db/item-schema";
import { firearmMagazineAttachment } from "@/db/magazine-schema";
import { campaignCharacterItem, campaignCharacterItemInstance, campaignCharacterItemEquipmentState } from "@/db/realm-schema";
import { campaignCharacterFirearmState } from "@/db/tabletop-operations-schema";
import { calculateContainerPhysics, weightInLb, type ContainerPhysicalProfile, type PhysicalGraph } from "./container-physics";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Caller locks the Character. Shared catalog locks keep measurements stable through a move. */
export async function readInventoryPhysicsInTransaction(tx: Transaction, characterId: number) {
  const copies = await tx.select().from(campaignCharacterItemInstance).where(and(eq(campaignCharacterItemInstance.characterId, characterId), isNull(campaignCharacterItemInstance.retiredAt)));
  const locations = await tx.select().from(inventoryInstanceLocation).where(eq(inventoryInstanceLocation.characterId, characterId));
  const allocations = await tx.select().from(inventoryStackLocation).where(eq(inventoryStackLocation.characterId, characterId));
  const stacks = await tx.select().from(campaignCharacterItem).where(eq(campaignCharacterItem.characterId, characterId));
  const firearms = await tx.select().from(campaignCharacterFirearmState).where(eq(campaignCharacterFirearmState.characterId, characterId));
  const attachments = await tx.select().from(firearmMagazineAttachment).where(eq(firearmMagazineAttachment.characterId, characterId));
  const ids = [...new Set([...copies.map(copy => copy.itemId), ...stacks.map(stack => stack.itemId),
    ...copies.flatMap(copy => copy.loadedAmmunitionItemId === null ? [] : [copy.loadedAmmunitionItemId]),
    ...firearms.flatMap(firearm => firearm.loadedAmmunitionItemId === null ? [] : [firearm.loadedAmmunitionItemId])])].sort((a, b) => a - b);
  const models = ids.length ? await tx.select({ item, container: containerProfile }).from(item)
    .leftJoin(containerProfile, eq(containerProfile.itemId, item.id)).where(inArray(item.id, ids)).orderBy(asc(item.id)).for("share", { of: item }) : [];
  const definitions = models.map(({ item: model, container }) => ({ itemId: model.id, name: model.name, weightLb: weightInLb(model.weight, model.weightUnit),
    physicalForm: model.physicalForm as "solid" | "liquid" | null, category: model.category, recordType: model.recordType,
    volumeL: model.volumeL, longestDimensionCm: model.longestDimensionCm, container: container as ContainerPhysicalProfile | null }));
  const graph: PhysicalGraph = {
    instances: copies.map(copy => ({ instanceId: copy.id, itemId: copy.itemId, containerInstanceId: locations.find(location => location.instanceId === copy.id)?.containerInstanceId ?? null })),
    stacks: stacks.map(stack => {
      const assigned = allocations.filter(location => location.itemId === stack.itemId).map(({ containerInstanceId, quantity }) => ({ containerInstanceId, quantity }));
      return { itemId: stack.itemId, ownedQuantity: stack.quantity, looseQuantity: stack.quantity - assigned.reduce((total, allocation) => total + allocation.quantity, 0), allocations: assigned };
    }),
  };
  const loads = [...copies.map(copy => ({ instanceId: copy.id, ammunitionItemId: copy.loadedAmmunitionItemId, rounds: copy.loadedRounds })),
    ...firearms.map(firearm => ({ instanceId: firearm.itemInstanceId, ammunitionItemId: firearm.loadedAmmunitionItemId, rounds: firearm.loadedRounds }))];
  return { graph, definitions, loads, attachments: attachments.map(({ weaponInstanceId, magazineInstanceId }) => ({ weaponInstanceId, magazineInstanceId })),
    ...calculateContainerPhysics(graph, definitions, loads, attachments) };
}

/** Check immediate destination and every ancestor in its resulting graph. */
export function assertPhysicalDestination(view: Awaited<ReturnType<typeof readInventoryPhysicsInTransaction>>, destinationId: number | null) {
  const seen = new Set<number>();
  while (destinationId !== null) {
    if (seen.has(destinationId)) throw new Error("Circular containment and self-containment are not allowed.");
    seen.add(destinationId);
    const load = view.containers.find(container => container.instanceId === destinationId);
    if (!load) throw new Error("Choose an active, owned container copy.");
    if (load.problems.length) throw new Error(load.problems[0]);
    destinationId = view.graph.instances.find(copy => copy.instanceId === destinationId)?.containerInstanceId ?? null;
  }
}

/** A legacy load may be relieved without requiring all missing data to be authored first. */
export function assertPhysicalSourceRelieved(before: Awaited<ReturnType<typeof readInventoryPhysicsInTransaction>>, after: Awaited<ReturnType<typeof readInventoryPhysicsInTransaction>>, sourceId: number | null) {
  const seen = new Set<number>();
  while (sourceId !== null) {
    if (seen.has(sourceId)) throw new Error("Circular containment and self-containment are not allowed.");
    seen.add(sourceId);
    const previous = before.containers.find(row => row.instanceId === sourceId), current = after.containers.find(row => row.instanceId === sourceId);
    if (!previous || !current) throw new Error("The source container changed. Reload inventory.");
    if (current.problems.length && (!previous.problems.length || current.contentsWeight.known > previous.contentsWeight.known + 1e-9 || current.usedVolume.known > previous.usedVolume.known + 1e-9
      || current.contentsWeight.unknown.some(name => !previous.contentsWeight.unknown.includes(name)) || current.usedVolume.unknown.some(name => !previous.usedVolume.unknown.includes(name)))) throw new Error(current.problems[0]);
    sourceId = after.graph.instances.find(row => row.instanceId === sourceId)?.containerInstanceId ?? null;
  }
}

export async function assertContainmentEquipmentInTransaction(tx: Transaction, characterId: number) {
  const [conflict] = await tx.select({ id: campaignCharacterItemInstance.id }).from(campaignCharacterItemInstance)
    .innerJoin(inventoryInstanceLocation, eq(inventoryInstanceLocation.instanceId, campaignCharacterItemInstance.id))
    .where(and(eq(campaignCharacterItemInstance.characterId, characterId), inArray(campaignCharacterItemInstance.equipmentState, ["worn", "wielded"])));
  if (conflict) throw new Error(`Copy #${conflict.id} is Worn or Wielded. Change it to Equipped or Inactive before storing it.`);
  const [stack] = await tx.execute<{ item_id: number }>(sql`select o.item_id from campaign_character_item o
    where o.character_id = ${characterId} and o.quantity <
      coalesce((select sum(l.quantity) from inventory_stack_location l where l.character_id=o.character_id and l.item_id=o.item_id),0)
      + coalesce((select sum(e.quantity) from campaign_character_item_equipment_state e where e.character_id=o.character_id and e.item_id=o.item_id and e.state in ('worn','wielded')),0)`).then(result => result.rows);
  if (stack) throw new Error("Worn and Wielded stack copies must stay loose. Reduce those equipment quantities before storing more copies.");
}

export async function assertInstanceCanBeWornInTransaction(tx: Transaction, instanceId: number, state: string) {
  if (state !== "worn" && state !== "wielded") return;
  const [location] = await tx.select().from(inventoryInstanceLocation).where(eq(inventoryInstanceLocation.instanceId, instanceId));
  if (location) throw new Error("Move this Item to loose before marking it Worn or Wielded.");
}
export async function assertStackCanBeWornInTransaction(tx: Transaction, characterId: number, itemId: number, state: string, quantity: number, ownedQuantity: number) {
  if (state !== "worn" && state !== "wielded") return;
  const allocations = await tx.select().from(inventoryStackLocation).where(and(eq(inventoryStackLocation.characterId, characterId), eq(inventoryStackLocation.itemId, itemId)));
  const equipment = await tx.select().from(campaignCharacterItemEquipmentState).where(and(eq(campaignCharacterItemEquipmentState.characterId, characterId), eq(campaignCharacterItemEquipmentState.itemId, itemId)));
  const requiredLoose = quantity + equipment.filter(row => row.state !== state && (row.state === "worn" || row.state === "wielded")).reduce((total, row) => total + row.quantity, 0);
  if (requiredLoose > ownedQuantity - allocations.reduce((total, row) => total + row.quantity, 0)) throw new Error("Move enough copies to loose before marking them Worn or Wielded.");
}
