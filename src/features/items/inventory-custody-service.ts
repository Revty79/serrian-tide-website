import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import { campaign } from "@/db/campaign-schema";
import { userRole } from "@/db/authorization-schema";
import { item } from "@/db/item-schema";
import { inventoryContainerAccess, inventoryCustodyEvent, inventoryInstanceCustody, inventoryStackCustody } from "@/db/inventory-access-schema";
import { containerProfile, inventoryContainerSubstance, inventoryInstanceLocation, inventoryStackLocation } from "@/db/container-schema";
import { campaignCharacter, campaignCharacterItemEquipmentState, campaignCharacterItemInstance, campaignCharacterProfile } from "@/db/realm-schema";
import { campaignSession, campaignSessionScene, campaignSessionSceneMember } from "@/db/tabletop-operations-schema";
import { authorizeInventoryInTransaction, beginContainerMutation, type ContainmentTransaction as Tx } from "./inventory-containment-service";
import { readInventoryAccessInTransaction } from "./inventory-access-service";
import { availableLooseQuantity, containerAccessState, requireInventoryAvailability, resolveInventoryAvailability, type ContainerAccessState } from "./inventory-access";
import { lockEquipmentStateCharacterInTransaction, reconcileItemPassiveEffectsInTransaction } from "./equipment-state-service";
import { assertCharacterCombatWritableInTransaction } from "@/features/tabletop-operations/combat-freeze-service";
import { publishCharacterStateInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";

export type InventoryHandlingCommand = {
  characterId: number; expectedCommerceVersion: number; requestKey: string;
  operation: "drop" | "stolen" | "lost" | "recover" | "open" | "close" | "access-ruling" | "destroy";
  instanceId: number | null; itemId: number; quantity: number; custodyId?: number;
  sceneId?: number | null; note?: string; reason?: string; accessState?: ContainerAccessState; confirmMagicalSpill?: boolean;
};
export async function canRuleInventory(tx: Tx, characterId: number, userId: string) {
  const [owner] = await tx.select({ owner: campaign.createdByUserId }).from(campaignCharacter).innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId)).where(eq(campaignCharacter.id, characterId));
  const roles = await tx.select().from(userRole).where(and(eq(userRole.userId, userId), eq(userRole.role, "god")));
  return owner?.owner === userId && roles.length > 0;
}
export async function inventoryScenes(tx: Tx, characterId: number) {
  return tx.select({ sceneId: campaignSessionScene.id, sessionId: campaignSession.id, contextLabel: sql<string>`${campaignSession.title} || ' / ' || ${campaignSessionScene.title}` })
    .from(campaignSessionSceneMember).innerJoin(campaignSessionScene, eq(campaignSessionScene.id, campaignSessionSceneMember.sceneId))
    .innerJoin(campaignSession, eq(campaignSession.id, campaignSessionScene.sessionId))
    .where(and(eq(campaignSessionSceneMember.characterId, characterId), eq(campaignSessionScene.status, "active"), eq(campaignSession.status, "active")));
}
async function changed(tx: Tx, characterId: number) {
  await reconcileItemPassiveEffectsInTransaction(tx, characterId);
  await tx.update(campaignCharacterProfile).set({ commerceVersion: sql`${campaignCharacterProfile.commerceVersion} + 1`, updatedAt: new Date() }).where(eq(campaignCharacterProfile.characterId, characterId));
  await publishCharacterStateInvalidationInTransaction(tx, characterId);
}
/** Internal completion flag is supplied only by the authorized combat action service. */
export async function handleInventoryInTransaction(tx: Tx, userId: string, command: InventoryHandlingCommand, combatCompletion = false) {
  await authorizeInventoryInTransaction(tx, command.characterId, userId, true);
  if (!command.requestKey?.trim() || command.requestKey.length > 160 || !Number.isSafeInteger(command.itemId) || command.itemId <= 0 || !Number.isSafeInteger(command.quantity) || command.quantity <= 0
    || command.instanceId !== null && (!Number.isSafeInteger(command.instanceId) || command.instanceId <= 0 || command.quantity !== 1)) throw new Error("Choose an exact Item or a positive whole stack quantity and a retry identity.");
  if (!["drop", "stolen", "lost", "recover", "open", "close", "access-ruling", "destroy"].includes(command.operation)) throw new Error("Choose a supported inventory operation.");
  const god = await canRuleInventory(tx, command.characterId, userId);
  if (["stolen", "lost", "access-ruling", "destroy"].includes(command.operation) && !god) throw new Error("Only the Campaign-owning G.O.D. may make this inventory ruling.");
  if (["stolen", "lost", "access-ruling", "destroy"].includes(command.operation) && !command.reason?.trim()) throw new Error("Give a reason for this G.O.D. inventory ruling.");
  await assertCharacterCombatWritableInTransaction(tx, command.characterId);
  await lockEquipmentStateCharacterInTransaction(tx, command.characterId);
  const [receipt] = await tx.select().from(inventoryCustodyEvent).where(and(eq(inventoryCustodyEvent.characterId, command.characterId), eq(inventoryCustodyEvent.requestKey, command.requestKey)));
  if (receipt) {
    if (receipt.actorUserId !== userId || !isDeepStrictEqual(receipt.evidence.command, command)) throw new Error("This retry identity belongs to a different inventory operation.");
    return { eventId: receipt.id };
  }
  const administrative = god && ["stolen", "lost", "recover", "access-ruling", "destroy"].includes(command.operation);
  await beginContainerMutation(tx, userId, command, combatCompletion || administrative);
  const graph = await readInventoryAccessInTransaction(tx, command.characterId);
  const copy = command.instanceId === null ? null : graph.instances.find(row => row.instanceId === command.instanceId && row.itemId === command.itemId);
  if (command.instanceId !== null && !copy) throw new Error("Choose an active owned exact copy.");
  const selected = command.instanceId === null ? { itemId: command.itemId, containerInstanceId: null, ...(command.custodyId === undefined ? {} : { custodyId: command.custodyId }) } : { instanceId: command.instanceId };
  const availability = resolveInventoryAvailability(graph, selected);
  const scenes = await inventoryScenes(tx, command.characterId);
  const scene = command.sceneId ? scenes.find(row => row.sceneId === command.sceneId) : scenes.length === 1 ? scenes[0] : undefined;
  if (command.sceneId && !scene) throw new Error("Choose a current active Scene containing this Character.");
  const location = { sessionId: scene?.sessionId ?? null, sceneId: scene?.sceneId ?? null, contextLabel: scene?.contextLabel ?? "",
    note: command.note?.trim() ?? "", reason: command.reason?.trim() ?? "", actorUserId: userId, updatedAt: new Date() };
  let previousStatus = availability.custody as string, newStatus = previousStatus;
  const evidence: Record<string, unknown> = { command };
  if (command.operation === "open" || command.operation === "close" || command.operation === "access-ruling") {
    if (!copy || !graph.containers.some(row => row.instanceId === copy.instanceId)) throw new Error("Choose an exact container copy.");
    const model = graph.containers.find(row => row.instanceId === copy.instanceId)!;
    if (model.closureMode !== "open-close") throw new Error("This container is always accessible and has no closure to operate.");
    if (command.operation !== "access-ruling") requireInventoryAvailability(availability, false);
    const before = containerAccessState(graph, copy.instanceId);
    const target = command.operation === "access-ruling" ? command.accessState : command.operation === "open" ? "open" : "closed";
    if (!target || !["open", "closed", "locked", "sealed"].includes(target)) throw new Error("Choose an access state.");
    if (command.operation !== "access-ruling" && (before === "locked" || before === "sealed")) throw new Error("Locked or sealed containers require an explicit G.O.D. access ruling.");
    if (before === target) throw new Error("This container already has that access state.");
    await tx.insert(inventoryContainerAccess).values({ instanceId: copy.instanceId, characterId: command.characterId, itemId: copy.itemId, state: target, actorUserId: userId, reason: location.reason })
      .onConflictDoUpdate({ target: inventoryContainerAccess.instanceId, set: { state: target, actorUserId: userId, reason: location.reason, updatedAt: new Date() } });
    previousStatus = before; newStatus = target;
  } else if (command.operation === "destroy") {
    if (!copy) throw new Error("Choose an exact container to resolve destruction.");
    const [model] = await tx.select({ profile: containerProfile, magical: item.isMagical }).from(containerProfile).innerJoin(item, eq(item.id, containerProfile.itemId)).where(eq(item.id, copy.itemId));
    if (!model) throw new Error("Only containers support this explicit spill resolution.");
    const p = model.profile;
    const special = model.magical || p.weightCapacityMode !== "normal" || p.volumeCapacityMode !== "normal" || p.containedWeightBehavior !== "normal" || p.timeBehavior !== "normal" || p.livingContentsAllowed || p.source?.mode === "infinite";
    if (special && command.confirmMagicalSpill !== true) throw new Error("Magical or special container destruction needs an explicit G.O.D. ruling that spilling these contents is safe. No destruction effect is inferred.");
    if (graph.attachments.some(row => row.weaponInstanceId === copy.instanceId || row.magazineInstanceId === copy.instanceId)) throw new Error("Resolve specialized attachments before retiring this container; destruction cannot detach or unload them automatically.");
    const rootCustody = availability.rootInstanceId === null ? undefined : await tx.select().from(inventoryInstanceCustody).where(eq(inventoryInstanceCustody.instanceId, availability.rootInstanceId)).then(rows => rows[0]);
    const spillContext = rootCustody ? { sessionId: rootCustody.sessionId, sceneId: rootCustody.sceneId, contextLabel: rootCustody.contextLabel, note: rootCustody.note, reason: location.reason, actorUserId: userId, updatedAt: new Date() } : location;
    const children = graph.instances.filter(row => row.containerInstanceId === copy.instanceId);
    const stacks = await tx.select().from(inventoryStackLocation).where(eq(inventoryStackLocation.containerInstanceId, copy.instanceId));
    const substance = await tx.select().from(inventoryContainerSubstance).where(eq(inventoryContainerSubstance.instanceId, copy.instanceId));
    await tx.delete(inventoryInstanceLocation).where(eq(inventoryInstanceLocation.containerInstanceId, copy.instanceId));
    await tx.delete(inventoryStackLocation).where(eq(inventoryStackLocation.containerInstanceId, copy.instanceId));
    for (const child of children) if (availability.custody !== "carried") await tx.insert(inventoryInstanceCustody).values({ instanceId: child.instanceId, characterId: command.characterId, itemId: child.itemId, status: availability.custody, ...spillContext });
    for (const stack of stacks) if (availability.custody !== "carried") await tx.insert(inventoryStackCustody).values({ characterId: command.characterId, itemId: stack.itemId, quantity: stack.quantity, status: availability.custody, ...spillContext });
    await tx.delete(inventoryContainerSubstance).where(eq(inventoryContainerSubstance.instanceId, copy.instanceId));
    await tx.delete(inventoryInstanceLocation).where(eq(inventoryInstanceLocation.instanceId, copy.instanceId));
    await tx.delete(inventoryInstanceCustody).where(eq(inventoryInstanceCustody.instanceId, copy.instanceId));
    await tx.delete(inventoryContainerAccess).where(eq(inventoryContainerAccess.instanceId, copy.instanceId));
    await tx.update(campaignCharacterItemInstance).set({ equipmentState: "inactive", retiredAt: new Date(), retirementReason: `Container destruction: ${location.reason}`, updatedAt: new Date() }).where(eq(campaignCharacterItemInstance.id, copy.instanceId));
    evidence.spill = { children, stacks, substance, custody: availability.custody, specialRuling: special, infiniteSource: p.source?.mode === "infinite" ? p.source : null };
    newStatus = "retired";
  } else if (command.operation === "recover") {
    if (availability.custody === "carried" || availability.ancestors.length || availability.attached) throw new Error("Choose an unavailable root to recover.");
    const prior = copy ? await tx.select().from(inventoryInstanceCustody).where(eq(inventoryInstanceCustody.instanceId, copy.instanceId)).then(rows => rows[0])
      : await tx.select().from(inventoryStackCustody).where(and(eq(inventoryStackCustody.characterId, command.characterId), eq(inventoryStackCustody.id, command.custodyId ?? 0))).then(rows => rows[0]);
    if (!prior) throw new Error("This custody allocation changed. Reload inventory.");
    if (!god && (prior.status !== "dropped" || !scene || prior.sceneId !== scene.sceneId)) throw new Error("Players may recover their own dropped inventory only in its active Scene. Other recovery needs the Campaign-owning G.O.D.");
    if (copy) await tx.delete(inventoryInstanceCustody).where(eq(inventoryInstanceCustody.instanceId, copy.instanceId));
    else {
      const stack = graph.stackCustody.find(row => row.id === command.custodyId)!;
      if (command.quantity > stack.quantity) throw new Error("Not enough quantity remains in this custody allocation.");
      if (command.quantity === stack.quantity) await tx.delete(inventoryStackCustody).where(eq(inventoryStackCustody.id, stack.id));
      else await tx.update(inventoryStackCustody).set({ quantity: stack.quantity - command.quantity }).where(eq(inventoryStackCustody.id, stack.id));
    }
    evidence.previous = prior; newStatus = "carried";
  } else {
    const custodyStatus = command.operation === "drop" ? "dropped" : command.operation;
    if (availability.custody !== "carried" || availability.ancestors.length || availability.attached) throw new Error("Only carried, Loose root inventory can receive custody. Retrieve it or recover it first.");
    if (command.operation === "drop" && !scene) throw new Error("Dropping needs an active Scene containing this Character. Outside tabletop, the G.O.D. may mark inventory lost.");
    if (copy) {
      const [owned] = await tx.select().from(campaignCharacterItemInstance).where(and(eq(campaignCharacterItemInstance.id, copy.instanceId), isNull(campaignCharacterItemInstance.retiredAt)));
      if (!owned) throw new Error("This owned copy changed.");
      if (command.operation === "drop" && ["worn", "wielded"].includes(owned.equipmentState)) throw new Error("Change this Item to Equipped or Inactive before dropping it. Dropping does not unequip gear.");
      if (command.operation !== "drop" && owned.equipmentState !== "inactive") {
        evidence.equipmentBefore = owned.equipmentState; evidence.forcedInactive = true;
        await tx.update(campaignCharacterItemInstance).set({ equipmentState: "inactive", updatedAt: new Date() }).where(eq(campaignCharacterItemInstance.id, copy.instanceId));
      }
      await tx.insert(inventoryInstanceCustody).values({ instanceId: copy.instanceId, characterId: command.characterId, itemId: copy.itemId, status: custodyStatus, ...location });
    } else {
      if (command.quantity > availableLooseQuantity(graph, command.itemId)) throw new Error("Only the available Loose stack remainder can receive root custody.");
      const states = await tx.select().from(campaignCharacterItemEquipmentState).where(and(eq(campaignCharacterItemEquipmentState.characterId, command.characterId), eq(campaignCharacterItemEquipmentState.itemId, command.itemId)));
      const worn = states.filter(row => row.state === "worn" || row.state === "wielded").reduce((total, row) => total + row.quantity, 0);
      if (command.operation === "drop" && command.quantity > availableLooseQuantity(graph, command.itemId) - worn) throw new Error("Reduce Worn/Wielded quantities before dropping these copies.");
      if (command.operation !== "drop") {
        const remaining = availableLooseQuantity(graph, command.itemId) - command.quantity;
        let budget = remaining;
        evidence.equipmentBefore = states;
        for (const row of states) {
          const quantity = Math.min(row.quantity, budget); budget -= quantity;
          if (quantity === 0) await tx.delete(campaignCharacterItemEquipmentState).where(and(eq(campaignCharacterItemEquipmentState.characterId, command.characterId), eq(campaignCharacterItemEquipmentState.itemId, command.itemId), eq(campaignCharacterItemEquipmentState.state, row.state)));
          else if (quantity !== row.quantity) await tx.update(campaignCharacterItemEquipmentState).set({ quantity, updatedAt: new Date() }).where(and(eq(campaignCharacterItemEquipmentState.characterId, command.characterId), eq(campaignCharacterItemEquipmentState.itemId, command.itemId), eq(campaignCharacterItemEquipmentState.state, row.state)));
        }
      }
      await tx.insert(inventoryStackCustody).values({ characterId: command.characterId, itemId: command.itemId, quantity: command.quantity, status: custodyStatus, ...location });
    }
    newStatus = custodyStatus;
  }
  await changed(tx, command.characterId);
  const [event] = await tx.insert(inventoryCustodyEvent).values({ characterId: command.characterId, itemId: command.itemId, instanceId: command.instanceId, quantity: command.quantity,
    operation: command.operation, previousStatus, newStatus, requestKey: command.requestKey, evidence, ...location }).returning({ id: inventoryCustodyEvent.id });
  return { eventId: event.id };
}
