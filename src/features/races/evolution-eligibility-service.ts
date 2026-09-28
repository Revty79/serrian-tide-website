import "server-only";
import { and, asc, eq, ilike, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { campaign } from "@/db/campaign-schema";
import { race, raceSkillLink } from "@/db/race-schema";
import { raceEvolutionPath } from "@/db/race-evolution-schema";
import { campaignCharacter, campaignCharacterProfile, campaignCharacterAttribute, campaignCharacterSkillAllocation } from "@/db/realm-schema";
import type { SharedLibraryActor } from "@/features/authorization/shared-library-access";
import { readActiveEffectsInTransaction } from "@/features/active-state/active-effects-service";
import { usableEvolutionItems, requireEvolutionGod } from "@/features/evolutions/evolution-preview-facts";
import { evaluateEvolutionGroups, type EvolutionEvaluation } from "@/features/evolutions/evolution-requirements";
import { characterFormAccessContextFromFacts } from "@/features/forms/form-access-context";
import { getCharacterSkillPointsById } from "@/features/characters/character-rules";
import { loadCharacterDerivedAbilitiesInTransaction } from "@/features/derived-abilities/character-derived-ability-service";
import { readRaceFormsInTransaction } from "./race-form-service";
import { readEvolutionRequirements } from "./evolution-requirement-service";
import { requireEvolutionId } from "./race-evolutions";

export type RaceEvolutionEligibility = EvolutionEvaluation & { owner: "race"; pathId: number; pathVersion: number; sourceRaceId: number; destinationRaceId: number };
const raceIndividual = or(eq(campaignCharacter.isNpc, false), eq(campaignCharacter.npcKind, "race"));

export async function listRaceEvolutionPreviewIndividuals(sourceRaceId: number, search: string, actor: SharedLibraryActor) {
  requireEvolutionGod(actor); requireEvolutionId(sourceRaceId, "Source Race");
  return db.select({ id: campaignCharacter.id, name: campaignCharacter.name, campaignName: campaign.name }).from(campaignCharacter)
    .innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId)).innerJoin(campaignCharacterProfile, eq(campaignCharacterProfile.characterId, campaignCharacter.id))
    .where(and(eq(campaign.createdByUserId, actor.userId), eq(campaignCharacterProfile.raceId, sourceRaceId), raceIndividual,
      isNull(campaign.archivedAt), isNull(campaignCharacter.archivedAt), ilike(campaignCharacter.name, `%${search.trim().slice(0,200)}%`)))
    .orderBy(asc(campaignCharacter.name), asc(campaignCharacter.id)).limit(30);
}

/** PCs and Race NPCs use saved Character mechanics; no aggregate loader with lazy state creation. */
export async function previewRaceEvolutionForActor(characterId: number, pathId: number, actor: SharedLibraryActor): Promise<RaceEvolutionEligibility> {
  requireEvolutionGod(actor); requireEvolutionId(characterId, "Character"); requireEvolutionId(pathId, "Race Evolution path");
  return db.transaction(tx => readRaceEvolutionEligibilityInTransaction(tx, characterId, pathId, actor), { isolationLevel: "repeatable read", accessMode: "read only" });
}

export async function readRaceEvolutionEligibilityInTransaction(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], characterId: number, pathId: number, actor: SharedLibraryActor): Promise<RaceEvolutionEligibility> {
    const [individual] = await tx.select({ character: campaignCharacter, profile: campaignCharacterProfile, campaignOwner: campaign.createdByUserId, campaignArchived: campaign.archivedAt }).from(campaignCharacter)
      .innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId)).innerJoin(campaignCharacterProfile, eq(campaignCharacterProfile.characterId, campaignCharacter.id))
      .where(and(eq(campaignCharacter.id, characterId), raceIndividual));
    if (!individual || individual.campaignOwner !== actor.userId) throw new Error("Only the Campaign G.O.D. may preview this Character's Race Evolution.");
    const [path] = await tx.select().from(raceEvolutionPath).where(eq(raceEvolutionPath.id, pathId));
    if (!path || path.sourceRaceId !== individual.profile.raceId) throw new Error("Evolution path does not belong to this Character's current Race.");
    const [source] = await tx.select().from(race).where(eq(race.id, path.sourceRaceId));
    const [destination] = await tx.select().from(race).where(eq(race.id, path.destinationRaceId));
    if (!source || !destination) throw new Error("Evolution source or destination no longer exists.");
    const attributes = await tx.select().from(campaignCharacterAttribute).where(eq(campaignCharacterAttribute.characterId, characterId));
    const allocations = await tx.select().from(campaignCharacterSkillAllocation).where(eq(campaignCharacterSkillAllocation.characterId, characterId));
    const raceSkills = await tx.select({ skillId: raceSkillLink.skillId }).from(raceSkillLink).where(eq(raceSkillLink.raceId, path.sourceRaceId));
    const abilities = await loadCharacterDerivedAbilitiesInTransaction(tx, characterId, actor.userId, false);
    const context = characterFormAccessContextFromFacts({ attributes,
      skillPoints: getCharacterSkillPointsById({ skillAllocations: allocations.map(row => ({ draftId: row.id, skillId: row.skillId, points: row.points, parentDraftId: row.parentAllocationId })) }),
      // getRacialSkillGrant treats any exact saved Race Skill link as possession, even a zero-valued grant.
      racialSkillIds: raceSkills.map(row => row.skillId), possessedDerivedAbilityIds: new Set(abilities.resolution.statuses.filter(row => row.possessed).map(row => row.abilityId)),
    });
    const effects = await readActiveEffectsInTransaction(tx, characterId);
    return { owner: "race", pathId: path.id, pathVersion: path.version, sourceRaceId: path.sourceRaceId, destinationRaceId: path.destinationRaceId,
      ...evaluateEvolutionGroups(await readEvolutionRequirements(tx, path.id, path.requirementMode), {
        owner: "race", unavailable: !!source.archivedAt || !!destination.archivedAt || !!individual.character.archivedAt || !!individual.campaignArchived,
        context, forms: await readRaceFormsInTransaction(tx, path.sourceRaceId), age: individual.profile.age,
        currentExperience: individual.profile.experience, totalExperience: individual.profile.totalExperience,
        ownerPresent: false, ownerItemIds: null, individualItemIds: await usableEvolutionItems(tx, characterId), conditionNames: effects.conditions.map(row => row.name),
      }) };
}
