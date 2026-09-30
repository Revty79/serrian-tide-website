import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { companionDispositionEvent, creatureVesselProfile, ownedCreatureDisposition } from "@/db/companion-schema";
import { campaignCharacter, campaignCharacterItemInstance, campaignCreatureNpcProfile } from "@/db/realm-schema";
import { item } from "@/db/item-schema";
import { campaign } from "@/db/campaign-schema";
import { userRole } from "@/db/authorization-schema";
import { readCompanionProfileInTransaction } from "./companion-profile-service";
import { readCompanionProfileHistoryInTransaction } from "./companion-profile-history";
import { authorizeInventoryInTransaction } from "@/features/items/inventory-containment-service";
import { authorizeOwnedCreatureInTransaction, authorizeCompanionOwnerInTransaction } from "./owned-creature-service";
import { readInventoryAccessInTransaction } from "@/features/items/inventory-access-service";
import { resolveInventoryAvailability } from "@/features/items/inventory-access";
import { COMPANION_DISPOSITION_LABELS, vesselCopyLabel, type CompanionDisposition } from "./companion-disposition";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function readUnownedCompanionForActor(creatureCharacterId: number, userId: string) {
  if (!Number.isSafeInteger(creatureCharacterId) || creatureCharacterId <= 0) throw new Error("Choose a saved Creature.");
  return db.transaction(async tx => {
    const [candidate] = await tx.select({ campaignId: campaignCharacter.campaignId }).from(campaignCharacter).where(eq(campaignCharacter.id, creatureCharacterId));
    if (!candidate) throw new Error("Creature not found.");
    // Same Campaign-first lock order as ownership changes; cannot expose a mixed transfer snapshot.
    const [root] = await tx.select({ owner: campaign.createdByUserId }).from(campaign).where(eq(campaign.id, candidate.campaignId)).for("share");
    const roles = await tx.select({ role: userRole.role }).from(userRole).where(eq(userRole.userId, userId)).for("share");
    if (root?.owner !== userId || !roles.some(row => row.role === "god")) throw new Error("Only the Campaign-owning G.O.D. may inspect an unowned companion.");
    const [individual] = await tx.select({ name: campaignCharacter.name, archivedAt: campaignCharacter.archivedAt }).from(campaignCharacter)
      .innerJoin(campaignCreatureNpcProfile, eq(campaignCreatureNpcProfile.characterId, campaignCharacter.id))
      .where(and(eq(campaignCharacter.id, creatureCharacterId), eq(campaignCharacter.campaignId, candidate.campaignId),
        eq(campaignCharacter.isNpc, true), eq(campaignCharacter.npcKind, "creature"), isNull(campaignCharacter.ownerCharacterId))).for("share", { of: campaignCharacter });
    if (!individual) throw new Error("This Creature has an owner now. Refresh and use its current owner controls.");
    return { name: individual.name, identity: `Individual #${creatureCharacterId}`, archived: !!individual.archivedAt,
      profile: await readCompanionProfileInTransaction(tx, creatureCharacterId),
      profileHistory: await readCompanionProfileHistoryInTransaction(tx, creatureCharacterId),
      travelHistory: await readCompanionTravelHistoryInTransaction(tx, creatureCharacterId) };
  });
}

export async function readCompanionTravelHistoryForActor(ownerCharacterId: number, creatureCharacterId: number, userId: string) {
  return db.transaction(async tx => {
    await authorizeOwnedCreatureInTransaction(tx, ownerCharacterId, creatureCharacterId, userId);
    return readCompanionTravelHistoryInTransaction(tx, creatureCharacterId);
  });
}

/** Caller must authorize this exact Creature before reading its retained history. */
async function readCompanionTravelHistoryInTransaction(tx: Transaction, creatureCharacterId: number) {
  const events = await tx.select({ id: companionDispositionEvent.id, revision: companionDispositionEvent.revision,
    before: companionDispositionEvent.before, after: companionDispositionEvent.after, actor: user.name, createdAt: companionDispositionEvent.createdAt })
    .from(companionDispositionEvent).leftJoin(user, eq(user.id, companionDispositionEvent.actorUserId))
    .where(eq(companionDispositionEvent.characterId, creatureCharacterId)).orderBy(desc(companionDispositionEvent.revision)).limit(30);
  const copyId = (state: Record<string, unknown> | null) => Number(state?.vesselInstanceId ?? state?.vessel_instance_id ?? 0);
  const ids = [...new Set(events.flatMap(row => [copyId(row.before), copyId(row.after)]).filter(id => id > 0))];
  const names = ids.length ? await tx.select({ id: campaignCharacterItemInstance.id, name: item.name }).from(campaignCharacterItemInstance)
    .innerJoin(item, eq(item.id, campaignCharacterItemInstance.itemId)).where(inArray(campaignCharacterItemInstance.id, ids)) : [];
  function describe(state: Record<string, unknown> | null) {
    if (!state) return "Travel disposition not set";
    const label = COMPANION_DISPOSITION_LABELS[state.disposition as CompanionDisposition] ?? "Travel disposition not set";
    const id = copyId(state), note = state.awayNote ?? state.away_note;
    return `${label}${id ? ` · ${vesselCopyLabel(names.find(row => row.id === id)?.name ?? "Previous Vessel", id)}` : note ? ` · ${String(note)}` : ""}`;
  }
  return events.map(row => ({ id: row.id, revision: row.revision, actor: row.actor ?? "Ownership removal (actor not recorded)",
    createdAt: row.createdAt.toISOString(), before: describe(row.before), after: describe(row.after) }));
}

export async function readVesselCompanionForActor(holderCharacterId: number, instanceId: number, userId: string) {
  if (!Number.isSafeInteger(instanceId) || instanceId <= 0) throw new Error("Choose a saved exact Creature Vessel copy.");
  return db.transaction(async tx => {
    await authorizeInventoryInTransaction(tx, holderCharacterId, userId, false);
    const [copy] = await tx.select({ name: item.name, id: campaignCharacterItemInstance.id, enabled: creatureVesselProfile.enabled,
      archivedAt: item.archivedAt, retiredAt: campaignCharacterItemInstance.retiredAt }).from(campaignCharacterItemInstance)
      .innerJoin(item, eq(item.id, campaignCharacterItemInstance.itemId)).innerJoin(creatureVesselProfile, eq(creatureVesselProfile.itemId, item.id))
      .where(and(eq(campaignCharacterItemInstance.id, instanceId), eq(campaignCharacterItemInstance.characterId, holderCharacterId))).for("share", { of: campaignCharacterItemInstance });
    if (!copy) throw new Error("This exact Vessel copy is no longer in the authorized Character's inventory.");
    const [binding] = await tx.select({ name: campaignCharacter.name, id: campaignCharacter.id }).from(ownedCreatureDisposition)
      .innerJoin(campaignCharacter, eq(campaignCharacter.id, ownedCreatureDisposition.characterId)).where(eq(ownedCreatureDisposition.vesselInstanceId, instanceId));
    const [holder] = await tx.select({ isNpc: campaignCharacter.isNpc, npcKind: campaignCharacter.npcKind }).from(campaignCharacter).where(eq(campaignCharacter.id, holderCharacterId));
    let canBind = false;
    if (!binding && copy.enabled && !copy.archivedAt && !copy.retiredAt && holder && (!holder.isNpc || holder.npcKind === "race")) {
      const access = await authorizeCompanionOwnerInTransaction(tx, holderCharacterId, userId, false);
      canBind = access.canOperate && access.canRename && resolveInventoryAvailability(await readInventoryAccessInTransaction(tx, holderCharacterId), { instanceId }).accessible;
    }
    return { label: vesselCopyLabel(copy.name, copy.id), creatureName: binding?.name ?? null, creatureIdentity: binding ? `Individual #${binding.id}` : null, canBind };
  });
}
