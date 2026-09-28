import "server-only";
import { and, asc, eq, ilike, isNull } from "drizzle-orm";
import { db } from "@/db";
import { campaign } from "@/db/campaign-schema";
import { creature, creatureEvolutionPath } from "@/db/creature-schema";
import { campaignCharacter, campaignCharacterProfile, campaignCreatureNpcProfile } from "@/db/realm-schema";
import type { SharedLibraryActor } from "@/features/authorization/shared-library-access";
import { usableEvolutionItems, requireEvolutionGod } from "@/features/evolutions/evolution-preview-facts";
import { readActiveEffectsInTransaction } from "@/features/active-state/active-effects-service";
import { parseCreatureNpcSnapshot } from "./creature-npc-constructor-service";
import { readEvolutionRequirements } from "./evolution-requirement-service";
import { evaluateEvolutionRequirements, type EvolutionEligibility } from "./evolution-requirements";
import { requireEvolutionId } from "./creature-evolutions";

export async function listEvolutionPreviewIndividuals(sourceCreatureId: number, search: string, actor: SharedLibraryActor) {
  requireEvolutionGod(actor); requireEvolutionId(sourceCreatureId, "Source Creature");
  return db.select({ id: campaignCharacter.id, name: campaignCharacter.name, campaignName: campaign.name }).from(campaignCharacter)
    .innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId)).innerJoin(campaignCreatureNpcProfile, eq(campaignCreatureNpcProfile.characterId, campaignCharacter.id))
    .where(and(eq(campaign.createdByUserId, actor.userId), eq(campaignCreatureNpcProfile.creatureId, sourceCreatureId), eq(campaignCharacter.isNpc, true), eq(campaignCharacter.npcKind, "creature"),
      isNull(campaign.archivedAt), isNull(campaignCharacter.archivedAt), ilike(campaignCharacter.name, `%${search.trim().slice(0,200)}%`)))
    .orderBy(asc(campaignCharacter.name), asc(campaignCharacter.id)).limit(30);
}

/** One consistent, enforced read-only transaction. No health/profile/inventory lazy initialization. */
export async function previewEvolutionForActor(characterId: number, pathId: number, actor: SharedLibraryActor): Promise<EvolutionEligibility> {
  requireEvolutionGod(actor); requireEvolutionId(characterId, "Individual Creature"); requireEvolutionId(pathId, "Evolution path");
  return db.transaction(async tx => {
    const [individual] = await tx.select({ character: campaignCharacter, npc: campaignCreatureNpcProfile, campaignOwner: campaign.createdByUserId, campaignArchived: campaign.archivedAt }).from(campaignCharacter)
      .innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId)).innerJoin(campaignCreatureNpcProfile, eq(campaignCreatureNpcProfile.characterId, campaignCharacter.id))
      .where(and(eq(campaignCharacter.id, characterId), eq(campaignCharacter.isNpc, true), eq(campaignCharacter.npcKind, "creature")));
    if (!individual || individual.campaignOwner !== actor.userId) throw new Error("Only the Campaign G.O.D. may preview this individual Creature.");
    const [path] = await tx.select().from(creatureEvolutionPath).where(eq(creatureEvolutionPath.id, pathId));
    if (!path || path.sourceCreatureId !== individual.npc.creatureId) throw new Error("Evolution path does not belong to this individual's current Creature definition.");
    const [source] = await tx.select({ archivedAt: creature.archivedAt }).from(creature).where(eq(creature.id, path.sourceCreatureId));
    const [destination] = await tx.select({ archivedAt: creature.archivedAt }).from(creature).where(eq(creature.id, path.destinationCreatureId));
    if (!source || !destination) throw new Error("Evolution source or destination no longer exists.");
    const [profile] = await tx.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, characterId));
    const ownerId = individual.character.ownerCharacterId;
    const [owner] = ownerId === null ? [] : await tx.select({ id: campaignCharacter.id, archivedAt: campaignCharacter.archivedAt }).from(campaignCharacter)
      .where(and(eq(campaignCharacter.id, ownerId), eq(campaignCharacter.campaignId, individual.character.campaignId)));
    const requirements = await readEvolutionRequirements(tx, path.id, path.requirementMode);
    const effects = await readActiveEffectsInTransaction(tx, characterId);
    let snapshot;
    try { snapshot = parseCreatureNpcSnapshot(individual.npc.currentSnapshotJson, "Current snapshot", individual.npc.hpAdjustment); }
    catch { return { owner: "creature", pathId: path.id, pathVersion: path.version, sourceCreatureId: path.sourceCreatureId, destinationCreatureId: path.destinationCreatureId, status: "not-eligible", explanation: "The current individual snapshot needs correction before eligibility can be checked.", groups: [] }; }
    return evaluateEvolutionRequirements({ ...path, destinationArchived: !!destination.archivedAt, sourceArchived: !!source.archivedAt, individualArchived: !!individual.character.archivedAt || !!individual.campaignArchived }, requirements, {
      sourceCreatureId: individual.npc.creatureId, snapshot, age: profile?.age ?? null, currentExperience: profile?.experience ?? null, totalExperience: profile?.totalExperience ?? null,
      ownerPresent: !!owner, creatureItemIds: await usableEvolutionItems(tx, characterId), ownerItemIds: owner && !owner.archivedAt ? await usableEvolutionItems(tx, owner.id) : null,
      conditionNames: effects.conditions.map(row => row.name),
    });
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
