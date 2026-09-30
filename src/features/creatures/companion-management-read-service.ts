import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { companionDispositionEvent, creatureVesselProfile, ownedCreatureDisposition } from "@/db/companion-schema";
import { campaignCharacter, campaignCharacterItemInstance } from "@/db/realm-schema";
import { item } from "@/db/item-schema";
import { authorizeInventoryInTransaction } from "@/features/items/inventory-containment-service";
import { authorizeOwnedCreatureInTransaction } from "./owned-creature-service";
import { COMPANION_DISPOSITION_LABELS, vesselCopyLabel, type CompanionDisposition } from "./companion-disposition";

export async function readCompanionTravelHistoryForActor(ownerCharacterId: number, creatureCharacterId: number, userId: string) {
  return db.transaction(async tx => {
    await authorizeOwnedCreatureInTransaction(tx, ownerCharacterId, creatureCharacterId, userId);
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
  });
}

export async function readVesselCompanionForActor(holderCharacterId: number, instanceId: number, userId: string) {
  if (!Number.isSafeInteger(instanceId) || instanceId <= 0) throw new Error("Choose a saved exact Creature Vessel copy.");
  return db.transaction(async tx => {
    await authorizeInventoryInTransaction(tx, holderCharacterId, userId, false);
    const [copy] = await tx.select({ name: item.name, id: campaignCharacterItemInstance.id }).from(campaignCharacterItemInstance)
      .innerJoin(item, eq(item.id, campaignCharacterItemInstance.itemId)).innerJoin(creatureVesselProfile, eq(creatureVesselProfile.itemId, item.id))
      .where(and(eq(campaignCharacterItemInstance.id, instanceId), eq(campaignCharacterItemInstance.characterId, holderCharacterId))).for("share", { of: campaignCharacterItemInstance });
    if (!copy) throw new Error("This exact Vessel copy is no longer in the authorized Character's inventory.");
    const [binding] = await tx.select({ name: campaignCharacter.name }).from(ownedCreatureDisposition)
      .innerJoin(campaignCharacter, eq(campaignCharacter.id, ownedCreatureDisposition.characterId)).where(eq(ownedCreatureDisposition.vesselInstanceId, instanceId));
    return { label: vesselCopyLabel(copy.name, copy.id), creatureName: binding?.name ?? null };
  });
}
