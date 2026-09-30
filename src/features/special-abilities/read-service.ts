import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import { raceSkillLink } from "@/db/race-schema";
import { campaignCharacter, campaignCharacterProfile, campaignCharacterSkillAllocation } from "@/db/realm-schema";
import { skill, skillExtension } from "@/db/skill-schema";
import { requireSession } from "@/lib/server-access";
import { canReadActiveState } from "@/features/active-state/authorization";
import { canAccessSharedLibrary } from "@/features/authorization/shared-library-access";
import { loadCharacterDerivedAbilitiesInTransaction } from "@/features/derived-abilities/character-derived-ability-service";
import { SPECIAL_ABILITY_MECHANICS_EXTENSION } from "./models";
import { readSpecialAbilityMechanics } from "./codec";
import { collectMechanicsReferences } from "./references";
import { readMechanicsReferenceViews } from "./reference-service";
import { resolveSpecialAbilityMechanics, type MechanicsOwnerFacts } from "./resolution";

/** Authorized projection for future consumers. The DB itself enforces read-only.
 * Session identity/roles and saved Normal facts are never supplied by a client.
 */
export async function getSpecialAbilityMechanicsProjection(skillId: number, characterId?: number) {
  if (!Number.isSafeInteger(skillId) || skillId <= 0 || characterId !== undefined && (!Number.isSafeInteger(characterId) || characterId <= 0)) throw new Error("Choose a saved Skill and Character.");
  const session = await requireSession();
  return db.transaction(async tx => {
    const roles = (await tx.select({ role: userRole.role }).from(userRole).where(eq(userRole.userId, session.user.id))).map(row => row.role);
    const actor = { userId: session.user.id, roles };
    let owner: MechanicsOwnerFacts | null = null;
    if (characterId === undefined) {
      if (!canAccessSharedLibrary(actor)) throw new Error("G.O.D. or administrator access is required to read the mechanics catalog.");
    } else {
      const [entity] = await tx.select({ playerUserId: campaignCharacter.playerUserId, campaignOwnerUserId: campaign.createdByUserId,
        isNpc: campaignCharacter.isNpc, npcKind: campaignCharacter.npcKind, member: campaignPlayer.userId })
        .from(campaignCharacter).innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId))
        .leftJoin(campaignPlayer, and(eq(campaignPlayer.campaignId, campaign.id), eq(campaignPlayer.userId, session.user.id)))
        .where(eq(campaignCharacter.id, characterId));
      if (!entity || !canReadActiveState(actor, { ...entity, isCampaignMember: entity.member === session.user.id })) throw new Error("You do not have permission to read this Character's mechanics.");
      // Native Creature snapshots require their own adapter later. Never invent
      // Character purchased progression from a Creature's fixed Skill Rank.
      if (entity.npcKind !== "creature") {
        const rows = await tx.select().from(campaignCharacterSkillAllocation).where(eq(campaignCharacterSkillAllocation.characterId, characterId));
        const raceLinks = await tx.select({ skillId: raceSkillLink.skillId }).from(campaignCharacterProfile)
          .innerJoin(raceSkillLink, eq(raceSkillLink.raceId, campaignCharacterProfile.raceId)).where(eq(campaignCharacterProfile.characterId, characterId));
        const possessedSkillIds = new Set([...rows.filter(row => row.points > 0).map(row => row.skillId), ...raceLinks.map(row => row.skillId)]);
        if (!possessedSkillIds.has(skillId) && !canAccessSharedLibrary(actor)) throw new Error("This Character does not possess that Special Ability.");
        owner = { possessedSkillIds, possessedDerivedAbilityIds: null,
          savedAllocations: { skillAllocations: rows.map(row => ({ draftId: row.id, skillId: row.skillId, points: row.points, parentDraftId: row.parentAllocationId })) } };
      } else if (!canAccessSharedLibrary(actor)) throw new Error("Native Creature mechanics require a Creature-specific read projection.");
    }
    const [source] = await tx.select({ id: skill.id, name: skill.name, classification: skill.classification, archivedAt: skill.archivedAt })
      .from(skill).where(eq(skill.id, skillId));
    if (!source) throw new Error("That Skill no longer exists.");
    const [stored] = await tx.select({ schemaVersion: skillExtension.schemaVersion, dataJson: skillExtension.dataJson }).from(skillExtension)
      .where(and(eq(skillExtension.skillId, skillId), eq(skillExtension.extensionType, SPECIAL_ABILITY_MECHANICS_EXTENSION)));
    const read = readSpecialAbilityMechanics(stored);
    const refs = read.status === "ready" ? collectMechanicsReferences(read.document) : [];
    if (owner && refs.some(ref => ref.kind === "derived-ability")) {
      // Existing loader is SELECT-only with lock=false. Do not call acquisition,
      // use, recharge or passive synchronization; this transaction forbids writes.
      const existing = await loadCharacterDerivedAbilitiesInTransaction(tx, characterId!, session.user.id, false);
      owner.possessedDerivedAbilityIds = new Set(existing.resolution.statuses.filter(row => row.possessed).map(row => row.abilityId));
    }
    return resolveSpecialAbilityMechanics({ source: { id: source.id, name: source.name, classification: source.classification, archived: source.archivedAt !== null },
      stored: stored ?? null, owner, references: await readMechanicsReferenceViews(tx, refs) });
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
