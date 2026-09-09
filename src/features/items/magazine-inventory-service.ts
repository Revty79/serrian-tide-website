import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import { db } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import { item } from "@/db/item-schema";
import { magazineProfile, magazineAmmunition, magazineInventoryOperation } from "@/db/magazine-schema";
import { campaignCharacter, campaignCharacterProfile, campaignCharacterItem as loose, campaignCharacterItemInstance as copy } from "@/db/realm-schema";
import { campaignSessionEncounter as encounter, campaignSessionEncounterParticipant as participant } from "@/db/tabletop-operations-schema";
import { canMutateActiveHealth, canReadActiveState } from "@/features/active-state/authorization";
import { lockEquipmentStateCharacterInTransaction } from "./equipment-state-service";
export type MagazineTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type MagazineCommand = { characterId: number; instanceId: number; requestKey: string; operation: "fill" | "add" | "empty"; ammunitionItemId: number | null; rounds: number | null; expectedRounds: number; expectedAmmunitionItemId: number | null };

async function access(tx: MagazineTransaction, characterId: number, userId: string, mutate: boolean) {
  const [entity] = await tx.select({ playerUserId: campaignCharacter.playerUserId, isNpc: campaignCharacter.isNpc, owner: campaign.createdByUserId,
    member: campaignPlayer.userId, archived: campaignCharacter.archivedAt, campaignArchived: campaign.archivedAt }).from(campaignCharacter)
    .innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId))
    .leftJoin(campaignPlayer, and(eq(campaignPlayer.campaignId, campaign.id), eq(campaignPlayer.userId, userId))).where(eq(campaignCharacter.id, characterId));
  if (!entity) throw new Error("Character not found.");
  const roles = await tx.select({ role: userRole.role }).from(userRole).where(eq(userRole.userId, userId));
  const subject = { userId, roles: roles.map((entry) => entry.role) }, target = { playerUserId: entity.playerUserId, campaignOwnerUserId: entity.owner, isNpc: entity.isNpc, isCampaignMember: entity.member === userId };
  const canManage = canMutateActiveHealth(subject, target) && !entity.archived && !entity.campaignArchived;
  if (!(mutate ? canManage : canReadActiveState(subject, target))) throw new Error("You do not have permission to manage this character's magazines.");
  return canManage;
}

async function combatActive(tx: MagazineTransaction, characterId: number, lock = false) {
  const query = tx.select({ status: encounter.status }).from(participant).innerJoin(encounter, eq(encounter.id, participant.encounterId)).where(eq(participant.characterId, characterId));
  const rows = lock ? await query.for("share", { of: encounter }) : await query;
  return rows.some((row) => row.status === "active");
}

export async function readMagazineInventoryInTransaction(tx: MagazineTransaction, characterId: number, userId: string) {
  const canManage = await access(tx, characterId, userId, false);
  const instances = await tx.select({ instanceId: copy.id, itemId: copy.itemId, name: item.name, capacity: magazineProfile.capacityRounds,
    loadedRounds: copy.loadedRounds, ammunitionItemId: copy.loadedAmmunitionItemId, archived: item.archivedAt }).from(copy)
    .innerJoin(item, eq(item.id, copy.itemId)).innerJoin(magazineProfile, eq(magazineProfile.itemId, copy.itemId))
    .where(and(eq(copy.characterId, characterId), isNull(copy.retiredAt))).orderBy(asc(copy.id));
  const magazines = [];
  for (const entry of instances) {
    const ammunition = await tx.select({ id: item.id, name: item.name, archived: item.archivedAt, quantity: loose.quantity }).from(magazineAmmunition)
      .innerJoin(item, eq(item.id, magazineAmmunition.ammunitionItemId))
      .leftJoin(loose, and(eq(loose.itemId, item.id), eq(loose.characterId, characterId)))
      .where(eq(magazineAmmunition.magazineItemId, entry.itemId)).orderBy(asc(item.name));
    magazines.push({ ...entry, archived: !!entry.archived, ammunition: ammunition.map((ammo) => ({ ...ammo, archived: !!ammo.archived, quantity: ammo.quantity ?? 0 })) });
  }
  return { characterId, canManage, combatActive: await combatActive(tx, characterId), magazines };
}
export type MagazineInventoryView = Awaited<ReturnType<typeof readMagazineInventoryInTransaction>>;

export async function handleMagazineInTransaction(tx: MagazineTransaction, userId: string, command: MagazineCommand) {
  if (!Number.isSafeInteger(command.characterId) || command.characterId <= 0 || !Number.isSafeInteger(command.instanceId) || command.instanceId <= 0) throw new Error("Choose an exact owned magazine copy.");
  if (!command.requestKey?.trim() || command.requestKey.length > 160 || !["fill", "add", "empty"].includes(command.operation)) throw new Error("A valid magazine operation and retry identity are required.");
  await lockEquipmentStateCharacterInTransaction(tx, command.characterId);
  await access(tx, command.characterId, userId, true);
  const [receipt] = await tx.select().from(magazineInventoryOperation).where(and(eq(magazineInventoryOperation.characterId, command.characterId), eq(magazineInventoryOperation.requestKey, command.requestKey)));
  if (receipt) {
    if (receipt.actorUserId !== userId || !isDeepStrictEqual(receipt.request, command)) throw new Error("This retry identity was already used for a different magazine operation.");
    return receipt.result;
  }
  if (await combatActive(tx, command.characterId, true)) throw new Error("Magazine filling and emptying are unavailable during active combat. End combat before handling magazine inventory.");
  const [owned] = await tx.select().from(copy).where(and(eq(copy.id, command.instanceId), eq(copy.characterId, command.characterId), isNull(copy.retiredAt))).for("update");
  if (!owned) throw new Error("That magazine copy is not owned by this character.");
  const [model] = await tx.select({ capacity: magazineProfile.capacityRounds, archived: item.archivedAt }).from(item)
    .innerJoin(magazineProfile, eq(magazineProfile.itemId, item.id)).where(eq(item.id, owned.itemId)).for("share", { of: item });
  if (!model) throw new Error("That copy is not a magazine.");
  if (owned.loadedRounds !== command.expectedRounds || owned.loadedAmmunitionItemId !== command.expectedAmmunitionItemId) throw new Error("This magazine changed. Refresh its contents before trying again.");
  let loadedRounds = owned.loadedRounds, ammunitionItemId = owned.loadedAmmunitionItemId, unitCost = owned.loadedAmmunitionUnitCostCredits;
  const ammoId = command.operation === "empty" ? ammunitionItemId : command.ammunitionItemId;
  if (!ammoId && (command.operation !== "empty" || loadedRounds > 0)) throw new Error("Select a compatible ammunition type.");
  const [stack] = ammoId ? await tx.select().from(loose).where(and(eq(loose.characterId, command.characterId), eq(loose.itemId, ammoId))).for("update") : [];
  let transferred = 0;
  if (command.operation === "empty") {
    transferred = loadedRounds;
    if (transferred && ammoId) {
      const quantity = (stack?.quantity ?? 0) + transferred;
      const cost = ((stack?.quantity ?? 0) * (stack?.unitCostCredits ?? 0) + transferred * unitCost) / quantity;
      await tx.insert(loose).values({ characterId: command.characterId, itemId: ammoId, quantity, unitCostCredits: cost })
        .onConflictDoUpdate({ target: [loose.characterId, loose.itemId], set: { quantity, unitCostCredits: cost } });
    }
    loadedRounds = 0; ammunitionItemId = null; unitCost = 0;
  } else {
    if (model.archived) throw new Error("Restore the magazine model before filling it. You can still empty it.");
    const [compatible] = await tx.select({ id: item.id }).from(magazineAmmunition).innerJoin(item, eq(item.id, magazineAmmunition.ammunitionItemId))
      .where(and(eq(magazineAmmunition.magazineItemId, owned.itemId), eq(magazineAmmunition.ammunitionItemId, ammoId!), isNull(item.archivedAt)));
    if (!compatible) throw new Error("That ammunition is not compatible with this magazine.");
    if (loadedRounds > 0 && ammunitionItemId !== ammoId) throw new Error("Empty the magazine before changing ammunition types.");
    transferred = command.operation === "fill" ? model.capacity - loadedRounds : command.rounds!;
    if (!Number.isSafeInteger(transferred) || transferred <= 0) throw new Error("Enter a positive whole number of rounds; a full magazine cannot take more.");
    if (loadedRounds + transferred > model.capacity) throw new Error("These rounds would exceed the magazine's capacity.");
    if (!stack || stack.quantity < transferred) throw new Error("There is not enough compatible loose ammunition. Add fewer rounds or acquire more.");
    unitCost = (loadedRounds * unitCost + transferred * stack.unitCostCredits) / (loadedRounds + transferred);
    if (stack.quantity === transferred) await tx.delete(loose).where(and(eq(loose.characterId, command.characterId), eq(loose.itemId, ammoId!)));
    else await tx.update(loose).set({ quantity: stack.quantity - transferred }).where(and(eq(loose.characterId, command.characterId), eq(loose.itemId, ammoId!)));
    loadedRounds += transferred; ammunitionItemId = ammoId;
  }
  await tx.update(copy).set({ loadedRounds, loadedAmmunitionItemId: ammunitionItemId, loadedAmmunitionUnitCostCredits: unitCost, updatedAt: new Date() }).where(eq(copy.id, owned.id));
  await tx.update(campaignCharacterProfile).set({ commerceVersion: sql`${campaignCharacterProfile.commerceVersion} + 1`, updatedAt: new Date() }).where(eq(campaignCharacterProfile.characterId, command.characterId));
  const result = { instanceId: owned.id, loadedRounds, ammunitionItemId, transferred };
  await tx.insert(magazineInventoryOperation).values({ characterId: command.characterId, instanceId: owned.id, actorUserId: userId, requestKey: command.requestKey, request: command, result });
  return result;
}
