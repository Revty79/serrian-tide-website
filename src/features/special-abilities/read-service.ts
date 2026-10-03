import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import { raceSkillLink } from "@/db/race-schema";
import { campaignCharacter, campaignCharacterProfile, campaignCharacterSkillAllocation } from "@/db/realm-schema";
import { skill, skillExtension } from "@/db/skill-schema";
import { requireSession } from "@/lib/server-access";
import { canReadActiveState } from "@/features/active-state/authorization";
import { canAccessSharedLibrary, type SharedLibraryActor } from "@/features/authorization/shared-library-access";
import { isSpecialAbilitySkill } from "@/features/characters/character-rules";
import { loadCharacterDerivedAbilitiesInTransaction } from "@/features/derived-abilities/character-derived-ability-service";
import { SPECIAL_ABILITY_MECHANICS_EXTENSION, referenceKey, type MechanicsReference } from "./models";
import type { CharacterSpecialAbilityView } from "./character-models";
import { readSpecialAbilityMechanics } from "./codec";
import { collectMechanicsReferences } from "./references";
import { readMechanicsReferenceViews } from "./reference-service";
import { resolveSpecialAbilityMechanics, type MechanicsOwnerFacts } from "./resolution";
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Shared saved-Normal possession adapter. Never reads temporary Form Skills or
 * interprets native Creature ranks as Character Special Ability scores. */
async function characterContext(tx: Transaction, characterId: number, actor: SharedLibraryActor) {
  const [entity] = await tx.select({ playerUserId: campaignCharacter.playerUserId, campaignOwnerUserId: campaign.createdByUserId,
    isNpc: campaignCharacter.isNpc, npcKind: campaignCharacter.npcKind, member: campaignPlayer.userId })
    .from(campaignCharacter).innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId))
    .leftJoin(campaignPlayer, and(eq(campaignPlayer.campaignId, campaign.id), eq(campaignPlayer.userId, actor.userId)))
    .where(eq(campaignCharacter.id, characterId));
  if (!entity || !canReadActiveState(actor, { ...entity, isCampaignMember: entity.member === actor.userId })) throw new Error("You do not have permission to read this Character's mechanics.");
  if (entity.npcKind === "creature") return null;
  const rows = await tx.select().from(campaignCharacterSkillAllocation).where(eq(campaignCharacterSkillAllocation.characterId, characterId));
  const raceLinks = await tx.select({ skillId: raceSkillLink.skillId, value: raceSkillLink.value }).from(campaignCharacterProfile)
    .innerJoin(raceSkillLink, eq(raceSkillLink.raceId, campaignCharacterProfile.raceId)).where(eq(campaignCharacterProfile.characterId, characterId));
  const purchased = new Set(rows.filter(row => row.points > 0).map(row => row.skillId)), racial = new Set(raceLinks.map(row => row.skillId));
  const assigned = new Set(rows.filter(row => row.specialAbilityGranted).map(row => row.skillId));
  const owner: MechanicsOwnerFacts = { possessedSkillIds: new Set([...purchased, ...assigned, ...racial]), possessedDerivedAbilityIds: null,
    savedAllocations: { skillAllocations: rows, racialSkillLinks: raceLinks } };
  return { owner, purchased, assigned, racial };
}
async function derivedFacts(tx: Transaction, characterId: number, userId: string, owner: MechanicsOwnerFacts, refs: readonly MechanicsReference[]) {
  if (!refs.some(ref => ref.kind === "derived-ability")) return;
  // SELECT-only loader, lock=false. The encompassing transaction forbids writes.
  const existing = await loadCharacterDerivedAbilitiesInTransaction(tx, characterId, userId, false);
  owner.possessedDerivedAbilityIds = new Set(existing.resolution.statuses.filter(row => row.possessed).map(row => row.abilityId));
}

/** One authorized snapshot for all possessed abilities. Query count is independent
 * of ability count: one source/extension join, up to two reference batches, and
 * at most one existing Derived facts load. No consumer parses extension JSON. */
export async function getCharacterSpecialAbilityMechanics(characterId: number): Promise<CharacterSpecialAbilityView> {
  if (!Number.isSafeInteger(characterId) || characterId <= 0) throw new Error("Choose a saved Character.");
  const session = await requireSession();
  return db.transaction(async tx => {
    const roles = (await tx.select({ role: userRole.role }).from(userRole).where(eq(userRole.userId, session.user.id))).map(row => row.role);
    const context = await characterContext(tx, characterId, { userId: session.user.id, roles });
    const base = { characterId, runtimeSupported: false as const };
    if (!context) return { ...base, context: "native-creature-unavailable", abilities: [] };
    const ids = [...context.owner.possessedSkillIds!];
    if (!ids.length) return { ...base, context: "saved-normal", abilities: [] };
    const rows = (await tx.select({ id: skill.id, name: skill.name, definition: skill.definition, classification: skill.classification, archivedAt: skill.archivedAt,
      schemaVersion: skillExtension.schemaVersion, dataJson: skillExtension.dataJson }).from(skill)
      .leftJoin(skillExtension, and(eq(skillExtension.skillId, skill.id), eq(skillExtension.extensionType, SPECIAL_ABILITY_MECHANICS_EXTENSION)))
      .where(inArray(skill.id, ids)).orderBy(asc(skill.name), asc(skill.id))).filter(isSpecialAbilitySkill);
    const refs = new Map<string, MechanicsReference>();
    const sources = rows.map(row => {
      const stored = row.schemaVersion === null || row.dataJson === null ? null : { schemaVersion: row.schemaVersion, dataJson: row.dataJson };
      const read = readSpecialAbilityMechanics(stored);
      if (read.status === "ready") for (const ref of collectMechanicsReferences(read.document)) refs.set(referenceKey(ref), ref);
      return { row, stored };
    });
    await derivedFacts(tx, characterId, session.user.id, context.owner, [...refs.values()]);
    // Existing Character readers expose shared Skill/Derived catalog definitions.
    // Here only names of exact authored references are returned, after Character
    // authorization. Discovery preferences are not a record-read ACL.
    const references = await readMechanicsReferenceViews(tx, [...refs.values()]);
    return { ...base, context: "saved-normal", abilities: sources.map(({ row, stored }) => ({ definition: row.definition ?? "",
      possession: { purchased: context.purchased.has(row.id), racial: context.racial.has(row.id), assigned: context.assigned.has(row.id) },
      mechanics: resolveSpecialAbilityMechanics({ source: { id: row.id, name: row.name, classification: row.classification, archived: row.archivedAt !== null }, stored, owner: context.owner, references }) })) };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

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
      const context = await characterContext(tx, characterId, actor);
      if (context) {
        owner = context.owner;
        if (!owner.possessedSkillIds!.has(skillId) && !canAccessSharedLibrary(actor)) throw new Error("This Character does not possess that Special Ability.");
      } else if (!canAccessSharedLibrary(actor)) throw new Error("Native Creature mechanics require a Creature-specific read projection.");
    }
    const [source] = await tx.select({ id: skill.id, name: skill.name, classification: skill.classification, archivedAt: skill.archivedAt })
      .from(skill).where(eq(skill.id, skillId));
    if (!source) throw new Error("That Skill no longer exists.");
    const [stored] = await tx.select({ schemaVersion: skillExtension.schemaVersion, dataJson: skillExtension.dataJson }).from(skillExtension)
      .where(and(eq(skillExtension.skillId, skillId), eq(skillExtension.extensionType, SPECIAL_ABILITY_MECHANICS_EXTENSION)));
    const read = readSpecialAbilityMechanics(stored);
    const refs = read.status === "ready" ? collectMechanicsReferences(read.document) : [];
    if (owner) await derivedFacts(tx, characterId!, session.user.id, owner, refs);
    return resolveSpecialAbilityMechanics({ source: { id: source.id, name: source.name, classification: source.classification, archived: source.archivedAt !== null },
      stored: stored ?? null, owner, references: await readMechanicsReferenceViews(tx, refs) });
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
