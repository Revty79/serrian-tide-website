import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import { containerProfile, inventoryInstanceLocation, inventoryStackLocation, inventoryContainerSubstance } from "@/db/container-schema";
import { campaignCharacter, campaignCharacterProfile, campaignCharacterItem, campaignCharacterItemInstance } from "@/db/realm-schema";
import { campaignSessionEncounter, campaignSessionEncounterParticipant } from "@/db/tabletop-operations-schema";
import { canMutateActiveHealth, canReadActiveState } from "@/features/active-state/authorization";
import { assertCharacterCombatWritableInTransaction } from "@/features/tabletop-operations/combat-freeze-service";
import { publishCharacterStateInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";
import { requireSession } from "@/lib/server-access";
import { lockEquipmentStateCharacterInTransaction } from "./equipment-state-service";
import { assertOutsideCombatEquipmentHandling } from "./magazine-inventory-service";
import { assertContainmentEquipmentInTransaction, assertPhysicalDestination, assertPhysicalSourceRelieved, readInventoryPhysicsInTransaction } from "./inventory-physical-service";
import { resolveContainedElapsedTime } from "./container-physics";
import { inventoryStackCustody } from "@/db/inventory-access-schema";
import { readInventoryAccessInTransaction } from "./inventory-access-service";
import { containerAccessState, requireInventoryAvailability, resolveInventoryAvailability } from "./inventory-access";
import { adjustSubstanceQuantity, type TimeSubject } from "./container-rules";

export type ContainmentTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type ContainmentCommand = {
  characterId: number;
  expectedCommerceVersion: number;
  fromContainerInstanceId: number | null;
  toContainerInstanceId: number | null;
} & ({ kind: "stack"; itemId: number; quantity: number } | { kind: "instance"; instanceId: number });

function positive(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive whole number.`);
}

export async function authorizeInventoryInTransaction(tx: ContainmentTransaction, characterId: number, userId: string, mutate: boolean) {
  positive(characterId, "Character identity");
  const [entity] = await tx.select({ playerUserId: campaignCharacter.playerUserId, isNpc: campaignCharacter.isNpc,
    campaignOwnerUserId: campaign.createdByUserId, member: campaignPlayer.userId,
    archived: campaignCharacter.archivedAt, campaignArchived: campaign.archivedAt }).from(campaignCharacter)
    .innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId))
    .leftJoin(campaignPlayer, and(eq(campaignPlayer.campaignId, campaign.id), eq(campaignPlayer.userId, userId)))
    .where(eq(campaignCharacter.id, characterId));
  const roles = await tx.select({ role: userRole.role }).from(userRole).where(eq(userRole.userId, userId));
  const subject = { userId, roles: roles.map(row => row.role) };
  if (!entity || !(mutate ? canMutateActiveHealth : canReadActiveState)(subject, { ...entity, isCampaignMember: entity.member === userId })) {
    throw new Error("You do not have permission to manage this Character's inventory locations.");
  }
  if (mutate && (entity.archived || entity.campaignArchived)) throw new Error("Restore the Campaign and Character before moving inventory.");
  return canMutateActiveHealth(subject, { ...entity, isCampaignMember: entity.member === userId }) && !entity.archived && !entity.campaignArchived;
}

async function snapshot(tx: ContainmentTransaction, characterId: number) {
  const [profile] = await tx.select({ commerceVersion: campaignCharacterProfile.commerceVersion }).from(campaignCharacterProfile)
    .where(eq(campaignCharacterProfile.characterId, characterId));
  if (!profile) throw new Error("Character profile not found.");
  const custody = await tx.select().from(inventoryStackCustody).where(eq(inventoryStackCustody.characterId, characterId));
  const stackRows = await tx.select().from(campaignCharacterItem).where(eq(campaignCharacterItem.characterId, characterId)).orderBy(asc(campaignCharacterItem.itemId));
  const stackLocations = await tx.select().from(inventoryStackLocation).where(eq(inventoryStackLocation.characterId, characterId)).orderBy(asc(inventoryStackLocation.containerInstanceId));
  const copies = await tx.select({ instanceId: campaignCharacterItemInstance.id, itemId: campaignCharacterItemInstance.itemId,
    isContainer: sql<boolean>`${containerProfile.itemId} is not null`, containerInstanceId: inventoryInstanceLocation.containerInstanceId,
  }).from(campaignCharacterItemInstance)
    .leftJoin(containerProfile, eq(containerProfile.itemId, campaignCharacterItemInstance.itemId))
    .leftJoin(inventoryInstanceLocation, eq(inventoryInstanceLocation.instanceId, campaignCharacterItemInstance.id))
    .where(and(eq(campaignCharacterItemInstance.characterId, characterId), isNull(campaignCharacterItemInstance.retiredAt)))
    .orderBy(asc(campaignCharacterItemInstance.id));
  const stacks = stackRows.map(row => {
    const allocations = stackLocations.filter(location => location.itemId === row.itemId)
      .map(({ containerInstanceId, quantity }) => ({ containerInstanceId, quantity }));
    const looseQuantity = row.quantity - allocations.reduce((total, location) => total + location.quantity, 0) - custody.filter(c => c.itemId === row.itemId).reduce((total, c) => total + c.quantity, 0);
    if (looseQuantity < 0) throw new Error("Invalid contained stack quantity; inventory locations need repair.");
    return { itemId: row.itemId, ownedQuantity: row.quantity, looseQuantity, allocations };
  });
  return { characterId, commerceVersion: profile.commerceVersion, stacks, instances: copies };
}

export type InventoryContainmentView = Awaited<ReturnType<typeof snapshot>>;

/** Character row locks give multi-query reads one consistent graph with ownership. */
export async function readInventoryContainmentInTransaction(tx: ContainmentTransaction, userId: string, characterId: number) {
  await authorizeInventoryInTransaction(tx, characterId, userId, false);
  await tx.select({ id: campaignCharacter.id }).from(campaignCharacter).where(eq(campaignCharacter.id, characterId)).for("share");
  return snapshot(tx, characterId);
}

function container(view: InventoryContainmentView, instanceId: number) {
  const copy = view.instances.find(row => row.instanceId === instanceId);
  if (!copy?.isContainer) throw new Error("Choose an active, owned container copy belonging to this Character.");
  return copy;
}

/** Immediate parent first, followed by each ancestor up to the Character. */
export function resolveContainmentAncestry(view: InventoryContainmentView, instanceId: number): number[] {
  const copy = view.instances.find(row => row.instanceId === instanceId);
  if (!copy) throw new Error("Choose an active exact copy owned by this Character.");
  const seen = new Set([instanceId]);
  const ancestors: number[] = [];
  let parentId = copy.containerInstanceId;
  while (parentId !== null) {
    if (seen.has(parentId)) throw new Error("Circular containment and self-containment are not allowed.");
    seen.add(parentId);
    ancestors.push(parentId);
    parentId = container(view, parentId).containerInstanceId;
  }
  return ancestors;
}

export async function readItemLocationInTransaction(tx: ContainmentTransaction, userId: string, characterId: number,
  owned: { kind: "instance"; instanceId: number } | { kind: "stack"; itemId: number }) {
  const view = await readInventoryContainmentInTransaction(tx, userId, characterId);
  const location = owned.kind === "instance" ? view.instances.find(row => row.instanceId === owned.instanceId)
    : view.stacks.find(row => row.itemId === owned.itemId);
  if (!location) throw new Error("That Item is not currently owned by this Character.");
  return location;
}

export async function readContainerContentsInTransaction(tx: ContainmentTransaction, userId: string, characterId: number, containerInstanceId: number) {
  const view = await readInventoryContainmentInTransaction(tx, userId, characterId);
  container(view, containerInstanceId);
  resolveContainmentAncestry(view, containerInstanceId);
  return {
    instances: view.instances.filter(row => row.containerInstanceId === containerInstanceId),
    stacks: view.stacks.flatMap(row => row.allocations.filter(allocation => allocation.containerInstanceId === containerInstanceId)
      .map(allocation => ({ itemId: row.itemId, quantity: allocation.quantity }))),
  };
}

/** Shared authorization, combat, lock and optimistic-version boundary for inventory mutations. */
export async function beginContainerMutation(tx: ContainmentTransaction, userId: string, command: { characterId: number; expectedCommerceVersion: number }, combatCompletion = false) {
  await authorizeInventoryInTransaction(tx, command.characterId, userId, true);
  if (!Number.isSafeInteger(command.expectedCommerceVersion) || command.expectedCommerceVersion < 0) throw new Error("Reload inventory before changing contents.");
  await assertCharacterCombatWritableInTransaction(tx, command.characterId);
  if (!combatCompletion) await assertOutsideCombatEquipmentHandling(tx, command.characterId);
  await lockEquipmentStateCharacterInTransaction(tx, command.characterId);
  await authorizeInventoryInTransaction(tx, command.characterId, userId, true);
  const [profile] = await tx.select({ version: campaignCharacterProfile.commerceVersion }).from(campaignCharacterProfile)
    .where(eq(campaignCharacterProfile.characterId, command.characterId)).for("update");
  if (!profile || profile.version !== command.expectedCommerceVersion) throw new Error("Inventory changed or this move already completed. Reload before moving contents.");
  return profile;
}

/** null means loose. Explicit source plus the inventory version makes stale/repeated moves fail closed. */
export async function moveInventoryContentInTransaction(tx: ContainmentTransaction, userId: string, command: ContainmentCommand, combatCompletion = false) {
  await authorizeInventoryInTransaction(tx, command.characterId, userId, true);
  if (!Number.isSafeInteger(command.expectedCommerceVersion) || command.expectedCommerceVersion < 0) throw new Error("Reload inventory before moving its contents.");
  for (const id of [command.fromContainerInstanceId, command.toContainerInstanceId]) if (id !== null) positive(id, "Container identity");
  if (command.fromContainerInstanceId === command.toContainerInstanceId) throw new Error("Choose a different inventory location.");
  if (command.kind !== "instance" && command.kind !== "stack") throw new Error("Choose an owned stack or exact copy.");
  const profile = await beginContainerMutation(tx, userId, command, combatCompletion);
  const view = await snapshot(tx, command.characterId);
  for (const id of [command.fromContainerInstanceId, command.toContainerInstanceId]) if (id !== null) container(view, id);
  const accessGraph = await readInventoryAccessInTransaction(tx, command.characterId);
  const sourceAccess = resolveInventoryAvailability(accessGraph, command.kind === "instance" ? { instanceId: command.instanceId } : { itemId: command.itemId, containerInstanceId: command.fromContainerInstanceId });
  requireInventoryAvailability(sourceAccess, false);
  for (const id of [command.fromContainerInstanceId, command.toContainerInstanceId]) if (id !== null) {
    requireInventoryAvailability(resolveInventoryAvailability(accessGraph, { instanceId: id }), false);
    if (containerAccessState(accessGraph, id) !== "open") throw new Error(`Open container #${id} first (${containerAccessState(accessGraph, id)}).`);
  }
  const physicsBefore = await readInventoryPhysicsInTransaction(tx, command.characterId);
  const target = command.toContainerInstanceId === null ? null : container(view, command.toContainerInstanceId);
  if (target) resolveContainmentAncestry(view, target.instanceId);
  if (command.fromContainerInstanceId !== null) container(view, command.fromContainerInstanceId);

  if (command.kind === "instance") {
    positive(command.instanceId, "Exact copy identity");
    const owned = view.instances.find(row => row.instanceId === command.instanceId);
    if (!owned) throw new Error("Choose an active exact copy owned by this Character.");
    if (physicsBefore.attachments.some(link => link.magazineInstanceId === owned.instanceId)) throw new Error("Detach this magazine from its firearm before moving it separately.");
    resolveContainmentAncestry(view, owned.instanceId);
    if (owned.containerInstanceId !== command.fromContainerInstanceId) throw new Error("This copy's location changed. Reload before moving it.");
    if (target && (target.instanceId === owned.instanceId || resolveContainmentAncestry(view, target.instanceId).includes(owned.instanceId))) {
      throw new Error("Circular containment and self-containment are not allowed.");
    }
    if (!target) await tx.delete(inventoryInstanceLocation).where(eq(inventoryInstanceLocation.instanceId, owned.instanceId));
    else await tx.insert(inventoryInstanceLocation).values({ characterId: command.characterId, instanceId: owned.instanceId, itemId: owned.itemId,
      containerInstanceId: target.instanceId, containerItemId: target.itemId }).onConflictDoUpdate({ target: inventoryInstanceLocation.instanceId,
      set: { containerInstanceId: target.instanceId, containerItemId: target.itemId } });
  } else {
    positive(command.itemId, "Item identity");
    positive(command.quantity, "Stack quantity");
    const owned = view.stacks.find(row => row.itemId === command.itemId);
    if (!owned) throw new Error("This Character does not own that stack.");
    const sourceQuantity = command.fromContainerInstanceId === null ? owned.looseQuantity
      : owned.allocations.find(row => row.containerInstanceId === command.fromContainerInstanceId)?.quantity ?? 0;
    if (command.quantity > sourceQuantity) throw new Error("Not enough owned stack quantity remains at the selected location.");
    const locationWhere = (containerInstanceId: number) => and(eq(inventoryStackLocation.characterId, command.characterId),
      eq(inventoryStackLocation.itemId, command.itemId), eq(inventoryStackLocation.containerInstanceId, containerInstanceId));
    // Remove from the source first, inside this transaction; any target failure rolls everything back.
    if (command.fromContainerInstanceId !== null) {
      if (sourceQuantity === command.quantity) await tx.delete(inventoryStackLocation).where(locationWhere(command.fromContainerInstanceId));
      else await tx.update(inventoryStackLocation).set({ quantity: sourceQuantity - command.quantity }).where(locationWhere(command.fromContainerInstanceId));
    }
    if (target) {
      const current = owned.allocations.find(row => row.containerInstanceId === target.instanceId);
      if (current) await tx.update(inventoryStackLocation).set({ quantity: current.quantity + command.quantity }).where(locationWhere(target.instanceId));
      else await tx.insert(inventoryStackLocation).values({ characterId: command.characterId, itemId: command.itemId,
        containerInstanceId: target.instanceId, containerItemId: target.itemId, quantity: command.quantity });
    }
  }
  const physicsAfter = await readInventoryPhysicsInTransaction(tx, command.characterId);
  assertPhysicalSourceRelieved(physicsBefore, physicsAfter, command.fromContainerInstanceId);
  if (target) {
    await assertContainmentEquipmentInTransaction(tx, command.characterId);
    assertPhysicalDestination(physicsAfter, target.instanceId);
    if (command.kind === "instance" && view.instances.find(copy => copy.instanceId === command.instanceId)?.isContainer) assertPhysicalDestination(physicsAfter, command.instanceId);
  }
  await tx.update(campaignCharacterProfile).set({ commerceVersion: profile.version + 1, updatedAt: new Date() })
    .where(eq(campaignCharacterProfile.characterId, command.characterId));
  await publishCharacterStateInvalidationInTransaction(tx, command.characterId);
  return snapshot(tx, command.characterId);
}

export async function readInventoryContainment(characterId: number) {
  const session = await requireSession();
  return db.transaction(tx => readInventoryContainmentInTransaction(tx, session.user.id, characterId));
}

export async function moveInventoryContent(command: ContainmentCommand) {
  const session = await requireSession();
  return db.transaction(tx => moveInventoryContentInTransaction(tx, session.user.id, command));
}

export async function readPhysicalInventoryInTransaction(tx: ContainmentTransaction, userId: string, characterId: number) {
  const canManage = await authorizeInventoryInTransaction(tx, characterId, userId, false);
  const location = await readInventoryContainmentInTransaction(tx, userId, characterId);
  const physics = await readInventoryPhysicsInTransaction(tx, characterId);
  let movementBlockedReason: string | null = canManage ? null : "You have read-only access to this Character's inventory.";
  const [combat] = await tx.select({ id: campaignSessionEncounter.id }).from(campaignSessionEncounter)
    .innerJoin(campaignSessionEncounterParticipant, eq(campaignSessionEncounterParticipant.encounterId, campaignSessionEncounter.id))
    .where(and(eq(campaignSessionEncounterParticipant.characterId, characterId), eq(campaignSessionEncounter.status, "active"))).limit(1);
  if (combat) movementBlockedReason = "Use Inventory handling in the combat Item controls to retrieve, stow, open, close or drop with Initiative. Direct rearrangement is unavailable during active combat or Freeze.";
  const accessGraph = await readInventoryAccessInTransaction(tx, characterId);
  const [owner] = await tx.select({ userId: campaign.createdByUserId }).from(campaignCharacter).innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId)).where(eq(campaignCharacter.id, characterId));
  const canRule = !!canManage && owner?.userId === userId && (await tx.select().from(userRole).where(and(eq(userRole.userId, userId), eq(userRole.role, "god")))).length > 0;
  const { inventoryScenes } = await import("./inventory-custody-service");
  return { ...location, ...physics, accessGraph, canManage, canRule, scenes: await inventoryScenes(tx, characterId), activeEncounterId: combat?.id ?? null, movementBlockedReason };
}
export type PhysicalInventoryView = Awaited<ReturnType<typeof readPhysicalInventoryInTransaction>>;
export async function readPhysicalInventory(characterId: number) {
  const session = await requireSession();
  return db.transaction(tx => readPhysicalInventoryInTransaction(tx, session.user.id, characterId));
}

/** Read-only hook for a future timer, using current containment. Callers split any
 * elapsed interval at movement/catalog changes; this is not a historical clock. */
export async function readContainedElapsedTimeInTransaction(tx: ContainmentTransaction, userId: string, characterId: number,
  target: { instanceId: number } | { itemId: number; containerInstanceId: number | null }, elapsed: number, traits: Pick<TimeSubject, "living" | "perishable"> = {}) {
  const view = await readPhysicalInventoryInTransaction(tx, userId, characterId);
  let parent: number | null, itemId: number;
  if ("instanceId" in target) {
    const copy = view.instances.find(row => row.instanceId === target.instanceId);
    if (!copy) throw new Error("Choose an active owned copy for contained time.");
    const assembly = view.attachments.find(row => row.magazineInstanceId === copy.instanceId);
    parent = assembly ? view.instances.find(row => row.instanceId === assembly.weaponInstanceId)!.containerInstanceId : copy.containerInstanceId;
    itemId = copy.itemId;
  } else {
    const stack = view.stacks.find(row => row.itemId === target.itemId);
    if (!stack || !(target.containerInstanceId === null ? stack.looseQuantity > 0 : stack.allocations.some(row => row.containerInstanceId === target.containerInstanceId))) throw new Error("Choose an owned stack portion for contained time.");
    parent = target.containerInstanceId; itemId = target.itemId;
  }
  const model = view.definitions.find(row => row.itemId === itemId)!;
  return resolveContainedElapsedTime(view.graph, view.definitions, parent, elapsed, { category: model.category, recordType: model.recordType, ...traits });
}

export type SubstanceCommand = { characterId: number; expectedCommerceVersion: number; instanceId: number;
  operation: "add" | "draw"; quantity: number; sourceItemId?: number };

/** Draw/add records a quantity adjustment, not consumption effects or a transfer to another owner. */
export async function changeContainerSubstanceInTransaction(tx: ContainmentTransaction, userId: string, command: SubstanceCommand) {
  const profile = await beginContainerMutation(tx, userId, command);
  positive(command.instanceId, "Container copy");
  if (command.operation !== "add" && command.operation !== "draw") throw new Error("Choose add or draw substance.");
  if (!Number.isFinite(command.quantity) || command.quantity <= 0) throw new Error("Substance quantity must be finite and greater than zero.");
  const accessGraph = await readInventoryAccessInTransaction(tx, command.characterId);
  requireInventoryAvailability(resolveInventoryAvailability(accessGraph, { instanceId: command.instanceId }), false);
  if (containerAccessState(accessGraph, command.instanceId) !== "open") throw new Error("Open the container before drawing or adding substance.");
  const before = await readInventoryPhysicsInTransaction(tx, command.characterId);
  const copy = before.graph.instances.find(row => row.instanceId === command.instanceId);
  const load = before.containers.find(row => row.instanceId === command.instanceId);
  if (!copy || !load) throw new Error("Choose an active container owned by this Character.");
  const source = load.profile.source;
  const stored = before.bulkContents.find(row => row.instanceId === command.instanceId);
  if (before.attachments.some(row => row.magazineInstanceId === command.instanceId)) throw new Error("Detach this copy before handling its substance.");
  let substance = stored?.substance ?? source?.substance;
  if (command.operation === "add") {
    if (!source || source.mode !== "finite") throw new Error("Only finite sources can receive substance.");
    // Players select an existing authored source, never submit physical metadata.
    const selected = command.sourceItemId === undefined ? source.substance : before.definitions.find(row => row.itemId === command.sourceItemId)?.container?.source?.substance;
    if (!selected) throw new Error("Choose a substance from an owned, authored source container.");
    if (selected.unit !== source.substance.unit) throw new Error("The source and container must use the same quantity unit.");
    if (source.locked && selected.id !== source.substance.id) throw new Error("This container is locked to its authored substance.");
    if (stored && (selected.id !== stored.substance.id || selected.unit !== stored.substance.unit)) throw new Error("Draw out the existing substance before changing it; mixing is not supported.");
    substance = selected;
    const quantity = adjustSubstanceQuantity(stored?.quantity ?? 0, command.quantity, "add", source.maxQuantity);
    await tx.insert(inventoryContainerSubstance).values({ instanceId: copy.instanceId, characterId: command.characterId, itemId: copy.itemId, substance, quantity })
      .onConflictDoUpdate({ target: inventoryContainerSubstance.instanceId, set: { quantity, substance } });
    assertPhysicalDestination(await readInventoryPhysicsInTransaction(tx, command.characterId), copy.instanceId);
  } else if (stored) {
    const quantity = adjustSubstanceQuantity(stored.quantity, command.quantity, "draw", null);
    if (quantity === 0) await tx.delete(inventoryContainerSubstance).where(eq(inventoryContainerSubstance.instanceId, copy.instanceId));
    else await tx.update(inventoryContainerSubstance).set({ quantity }).where(eq(inventoryContainerSubstance.instanceId, copy.instanceId));
    assertPhysicalSourceRelieved(before, await readInventoryPhysicsInTransaction(tx, command.characterId), copy.instanceId);
  } else if (!source || source.mode !== "infinite") throw new Error("This container has no substance to draw.");
  await tx.update(campaignCharacterProfile).set({ commerceVersion: profile.version + 1, updatedAt: new Date() }).where(eq(campaignCharacterProfile.characterId, command.characterId));
  await publishCharacterStateInvalidationInTransaction(tx, command.characterId);
  return { substance: substance!, quantity: command.quantity, operation: command.operation };
}
