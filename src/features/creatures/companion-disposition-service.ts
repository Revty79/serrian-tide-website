import "server-only";
import { isDeepStrictEqual } from "node:util";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { companionDispositionEvent as event, creatureVesselProfile as profile, ownedCreatureDisposition as disposition } from "@/db/companion-schema";
import { item } from "@/db/item-schema";
import { campaignCharacterItemInstance as copy, campaignCharacter, campaignCreatureNpcProfile } from "@/db/realm-schema";
import { assertExactInventoryAvailable, readInventoryAccessInTransaction } from "@/features/items/inventory-access-service";
import { resolveInventoryAvailability } from "@/features/items/inventory-access";
import { assertOutsideCombatEquipmentHandling } from "@/features/items/magazine-inventory-service";
import { assertCharacterCombatWritableInTransaction } from "@/features/tabletop-operations/combat-freeze-service";
import { authorizeOwnedCreatureInTransaction, authorizeCompanionOwnerInTransaction } from "./owned-creature-service";
import { normalizeCompanionDispositionCommand, vesselCopyLabel, type CompanionDispositionCommand } from "./companion-disposition";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function currentRevision(tx: Transaction, characterId: number) {
  const [row] = await tx.select({ revision: sql<number>`coalesce(max(${event.revision}), 0)::int` }).from(event).where(eq(event.characterId, characterId));
  return row.revision;
}

/** Internal projection after caller has authorized this exact owned Creature. */
export async function readCompanionDispositionInTransaction(tx: Transaction, characterId: number, ownerCharacterId: number) {
  const [row] = await tx.select().from(disposition).where(eq(disposition.characterId, characterId));
  let vessel: { instanceId: number; label: string; custody: string } | null = null;
  if (row?.vesselInstanceId !== null && row?.vesselInstanceId !== undefined) {
    const [held] = await tx.select({ instanceId: copy.id, holderId: copy.characterId, name: item.name, archivedAt: item.archivedAt }).from(copy)
      .innerJoin(item, eq(item.id, copy.itemId)).where(eq(copy.id, row.vesselInstanceId));
    let custody = "Held elsewhere; the Creature's ownership is unchanged.";
    if (held.holderId === ownerCharacterId || held.holderId === characterId) {
      const available = resolveInventoryAvailability(await readInventoryAccessInTransaction(tx, held.holderId), { instanceId: held.instanceId });
      custody = `${held.holderId === ownerCharacterId ? "Owner's inventory" : "Companion's inventory"} · ${available.custody}`;
      if (available.containerInstanceId !== null) custody += " · inside a container";
      if (!available.accessible) custody += " · currently inaccessible";
    }
    if (held.archivedAt) custody += " (Vessel definition archived; existing binding retained)";
    vessel = { instanceId: held.instanceId, label: vesselCopyLabel(held.name, held.instanceId), custody };
  }
  return { disposition: row?.disposition ?? null, awayNote: row?.awayNote ?? "", revision: Math.max(row?.revision ?? 0, await currentRevision(tx, characterId)),
    vessel, updatedAt: row?.updatedAt.toISOString() ?? null };
}

export async function assertManagementOutsideCombat(tx: Transaction, ownerId: number, creatureId: number, label = "Travel disposition and Vessel bindings") {
  for (const id of [ownerId, creatureId].sort((a, b) => a - b)) {
    await assertCharacterCombatWritableInTransaction(tx, id);
    try { await assertOutsideCombatEquipmentHandling(tx, id); }
    catch { throw new Error(`${label} can be changed only outside active encounters for both the owner and Creature.`); }
  }
}

export async function readCompanionDispositionForActor(ownerCharacterId: number, creatureCharacterId: number, userId: string) {
  return db.transaction(async tx => {
    return readDispositionManagementInTransaction(tx, ownerCharacterId, creatureCharacterId, userId);
  });
}

/** The inverse chooser reuses Creature-side eligibility. Saving uses changeCompanionDispositionForActor unchanged. */
export async function readVesselBindingOptionsForActor(ownerCharacterId: number, instanceId: number, userId: string) {
  if (!Number.isSafeInteger(instanceId) || instanceId <= 0) throw new Error("Choose a saved exact Vessel copy.");
  return db.transaction(async tx => {
    const access = await authorizeCompanionOwnerInTransaction(tx, ownerCharacterId, userId);
    if (!access.canOperate || !access.canRename) throw new Error("Only the owning Player or Campaign G.O.D. may bind companions for an active owner.");
    const candidates = await tx.select({ id: campaignCharacter.id, name: campaignCharacter.name }).from(campaignCharacter)
      .innerJoin(campaignCreatureNpcProfile, eq(campaignCreatureNpcProfile.characterId, campaignCharacter.id))
      .where(and(eq(campaignCharacter.ownerCharacterId, ownerCharacterId), eq(campaignCharacter.campaignId, access.campaignId),
        eq(campaignCharacter.isNpc, true), eq(campaignCharacter.npcKind, "creature"), isNull(campaignCharacter.archivedAt)))
      .orderBy(asc(campaignCharacter.name), asc(campaignCharacter.id));
    const options = [];
    for (const candidate of candidates) {
      const view = await readDispositionManagementInTransaction(tx, ownerCharacterId, candidate.id, userId);
      if (view.canChange && view.vessel === null && view.vessels.some(copy => copy.instanceId === instanceId)) {
        options.push({ characterId: candidate.id, label: `${candidate.name} · Individual #${candidate.id}`, disposition: view.disposition, revision: view.revision });
      }
    }
    return options;
  });
}

async function readDispositionManagementInTransaction(tx: Transaction, ownerCharacterId: number, creatureCharacterId: number, userId: string) {
  const access = await authorizeOwnedCreatureInTransaction(tx, ownerCharacterId, creatureCharacterId, userId);
  let blockedReason = access.canChange ? "" : "Only the owning Player or Campaign G.O.D. can manage an active companion.";
  // Read-only availability check: do not acquire Encounter locks after Character locks.
  const active = await tx.execute(sql`select 1 from campaign_session_encounter e join campaign_session_encounter_participant p on p.encounter_id = e.id
    where e.status = 'active' and p.character_id in (${ownerCharacterId}, ${creatureCharacterId}) limit 1`);
  if (active.rows.length) blockedReason = "Finish the owner and Creature's active encounters before changing travel disposition.";
  const graph = await readInventoryAccessInTransaction(tx, ownerCharacterId);
  const candidates = access.canChange ? await tx.select({ instanceId: copy.id, name: item.name }).from(copy)
    .innerJoin(item, eq(item.id, copy.itemId)).innerJoin(profile, and(eq(profile.itemId, item.id), eq(profile.enabled, true)))
    .leftJoin(disposition, eq(disposition.vesselInstanceId, copy.id))
    .where(and(eq(copy.characterId, ownerCharacterId), isNull(copy.retiredAt), isNull(item.archivedAt), isNull(disposition.characterId)))
    .orderBy(asc(item.name), asc(copy.id)) : [];
  return { ...await readCompanionDispositionInTransaction(tx, creatureCharacterId, ownerCharacterId), canChange: !blockedReason, blockedReason,
    vessels: candidates.filter(candidate => resolveInventoryAvailability(graph, { instanceId: candidate.instanceId }).accessible)
      .map(candidate => ({ instanceId: candidate.instanceId, label: vesselCopyLabel(candidate.name, candidate.instanceId) })) };
}

export async function changeCompanionDispositionForActor(input: CompanionDispositionCommand, userId: string) {
  const command = normalizeCompanionDispositionCommand(input);
  return db.transaction(async tx => {
    await authorizeOwnedCreatureInTransaction(tx, command.ownerCharacterId, command.creatureCharacterId, userId, false);
    // Also fence new enrollment and Encounter start, including currently absent participants.
    // A brief fail-fast table lock follows the existing persistent Evolution convention.
    try {
      await tx.execute(sql`LOCK TABLE campaign_session_encounter, campaign_session_encounter_participant IN SHARE MODE NOWAIT`);
    } catch { throw new Error("Encounter state is changing. Retry travel management after that operation finishes."); }
    // Existing Encounter-before-Character lock order; configuration never creates a combat action.
    await assertManagementOutsideCombat(tx, command.ownerCharacterId, command.creatureCharacterId);
    const access = await authorizeOwnedCreatureInTransaction(tx, command.ownerCharacterId, command.creatureCharacterId, userId);
    if (!access.canChange) throw new Error("Only the owning Player or Campaign G.O.D. may manage an active owned Creature's travel disposition.");
    const [receipt] = await tx.select().from(event).where(and(eq(event.characterId, command.creatureCharacterId), eq(event.requestKey, command.requestKey)));
    if (receipt) {
      if (receipt.actorUserId !== userId || !isDeepStrictEqual(receipt.command, command)) throw new Error("This retry identity belongs to another companion change.");
      return { revision: receipt.revision };
    }
    const [before] = await tx.select().from(disposition).where(eq(disposition.characterId, command.creatureCharacterId)).for("update");
    const revision = Math.max(before?.revision ?? 0, await currentRevision(tx, command.creatureCharacterId));
    if (revision !== command.expectedRevision) throw new Error("Travel disposition changed. Refresh the companion before saving again.");
    if (before?.vesselInstanceId && before.vesselInstanceId !== command.vesselInstanceId && !command.acknowledgeUnbind) {
      throw new Error("Confirm that this change will unbind the current Creature Vessel.");
    }
    let vesselItemId: number | null = null;
    if (command.vesselInstanceId !== null) {
      if (command.vesselInstanceId === before?.vesselInstanceId) vesselItemId = before.vesselItemId;
      else {
        const [candidate] = await tx.select({ itemId: copy.itemId }).from(copy).innerJoin(item, eq(item.id, copy.itemId))
          .innerJoin(profile, and(eq(profile.itemId, item.id), eq(profile.enabled, true)))
          .where(and(eq(copy.id, command.vesselInstanceId), eq(copy.characterId, command.ownerCharacterId), isNull(copy.retiredAt), isNull(item.archivedAt)))
          .for("update", { of: [item, copy] });
        if (!candidate) throw new Error("Choose an active exact Creature Vessel copy in the owner's inventory.");
        await assertExactInventoryAvailable(tx, command.ownerCharacterId, command.vesselInstanceId, false);
        const [bound] = await tx.select({ id: disposition.characterId }).from(disposition).where(eq(disposition.vesselInstanceId, command.vesselInstanceId));
        if (bound) throw new Error("That exact Creature Vessel copy is already bound to a Creature.");
        vesselItemId = candidate.itemId;
      }
    }
    const values = { campaignId: access.campaignId, characterId: command.creatureCharacterId, disposition: command.disposition,
      awayNote: command.awayNote, vesselInstanceId: command.vesselInstanceId, vesselItemId,
      revision: revision + 1, updatedByUserId: userId, updatedAt: new Date() };
    await tx.insert(disposition).values(values).onConflictDoUpdate({ target: disposition.characterId, set: values });
    await tx.insert(event).values({ campaignId: access.campaignId, characterId: command.creatureCharacterId, actorUserId: userId,
      requestKey: command.requestKey, revision: values.revision, command, before: before ?? null, after: values });
    return { revision: values.revision };
  });
}
