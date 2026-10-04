import { campaignSkillWhere } from "@/features/catalog-visibility/campaign-catalog-access";
import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { campaign, campaignAllowedSystem, campaignSkillExclusion } from "@/db/campaign-schema";
import { campaignCharacter, campaignCharacterProfile, campaignCharacterSkillAllocation, campaignCreatureNpcProfile } from "@/db/realm-schema";
import { raceSkillLink } from "@/db/race-schema";
import { campaignSessionEncounterParticipant } from "@/db/tabletop-operations-schema";
import { loadRecursiveSkillLibrary } from "@/features/skills/recursive-skill-library-service";
import { allocationSkillPath, createCampaignSkillAccess, validateCampaignSkillExclusions, type CampaignSkillExclusion } from "./campaign-skill-access";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type CampaignSkillConflict = { subject: string; characterId: number | null; skillId: number; skillName: string; path: string; source: "allocation" | "race grant" | "creature grant"; reason: string };

export async function readCampaignSkillExclusions(executor: Tx | typeof db, campaignId: number) {
  return executor.select({ skillId: campaignSkillExclusion.skillId, pathKey: campaignSkillExclusion.pathKey }).from(campaignSkillExclusion).where(eq(campaignSkillExclusion.campaignId, campaignId));
}

/** Serialize acquisition against Campaign restriction saves. Caller must already authorize access. */
export async function loadCampaignSkillAccessInTransaction(tx: Tx, campaignId: number) {
  const [row] = await tx.select({ id: campaign.id }).from(campaign).where(eq(campaign.id, campaignId)).for("update");
  if (!row) throw new Error("Campaign not found.");
  const library = await loadRecursiveSkillLibrary(tx, campaignSkillWhere(campaignId));
  const systems = await tx.select({ system: campaignAllowedSystem.system }).from(campaignAllowedSystem).where(eq(campaignAllowedSystem.campaignId, campaignId));
  const exclusions = await readCampaignSkillExclusions(tx, campaignId);
  return { library, access: createCampaignSkillAccess(library, systems.map(row => row.system), exclusions) };
}

export async function saveCampaignSkillExclusionsInTransaction(tx: Tx, campaignId: number, input: readonly CampaignSkillExclusion[]) {
  await tx.select({ id: campaign.id }).from(campaign).where(eq(campaign.id, campaignId)).for("update");
  const exclusions = validateCampaignSkillExclusions(await loadRecursiveSkillLibrary(tx, campaignSkillWhere(campaignId)), input);
  await tx.delete(campaignSkillExclusion).where(eq(campaignSkillExclusion.campaignId, campaignId));
  if (exclusions.length) await tx.insert(campaignSkillExclusion).values(exclusions.map(row => ({ ...row, campaignId })));
}

export async function assertCampaignSkillGrantsInTransaction(tx: Tx, campaignId: number, grants: readonly { skillId: number; rank?: string | number | null; value?: number | null }[], previous: readonly { skillId: number; rank?: string | number | null; value?: number | null }[] = []) {
  if (!grants.length && !previous.length) return;
  const { access, library } = await loadCampaignSkillAccessInTransaction(tx, campaignId);
  for (const old of previous) {
    if (!access.canGrant(old.skillId) && !grants.some(row => row.skillId === old.skillId && row.rank === old.rank && row.value === old.value)) throw new Error("Restricted historical Creature grants must be preserved without changing their investment.");
  }
  for (const grant of grants) {
    const retained = previous.some(row => row.skillId === grant.skillId && row.rank === grant.rank && row.value === grant.value);
    if (!retained && !access.canGrant(grant.skillId)) throw new Error(`Campaign restrictions block the grant of ${library.skills.find(row => row.id === grant.skillId)?.name ?? `Skill #${grant.skillId}`}. No allowed Skill path remains.`);
  }
}

export async function assertCampaignRaceGrantsInTransaction(tx: Tx, campaignId: number, raceId: number | null) {
  if (raceId === null) return;
  const links = await tx.select({ skillId: raceSkillLink.skillId }).from(raceSkillLink).where(eq(raceSkillLink.raceId, raceId));
  await assertCampaignSkillGrantsInTransaction(tx, campaignId, links);
}

function snapshotGrants(snapshot: unknown): { skillId: number }[] {
  const value = typeof snapshot === "string" ? JSON.parse(snapshot) : snapshot;
  if (!value || typeof value !== "object" || !Array.isArray(value.skillLinks)) return [];
  return value.skillLinks.filter((row: { skillId?: unknown }) => Number.isSafeInteger(row?.skillId));
}

export async function getCampaignSkillConflicts(campaignId: number): Promise<CampaignSkillConflict[]> {
  const library = await loadRecursiveSkillLibrary(db, campaignSkillWhere(campaignId));
  const systems = await db.select({ system: campaignAllowedSystem.system }).from(campaignAllowedSystem).where(eq(campaignAllowedSystem.campaignId, campaignId));
  const access = createCampaignSkillAccess(library, systems.map(row => row.system), await readCampaignSkillExclusions(db, campaignId));
  const characters = await db.select({ id: campaignCharacter.id, name: campaignCharacter.name }).from(campaignCharacter).where(eq(campaignCharacter.campaignId, campaignId));
  const conflicts: CampaignSkillConflict[] = [];
  const skillName = (id: number) => library.skills.find(row => row.id === id)?.name ?? `Skill #${id}`;
  const reviewGrants = (subject: string, characterId: number | null, grants: readonly { skillId: number }[], source: "race grant" | "creature grant") => {
    for (const grant of grants) if (!access.canGrant(grant.skillId)) conflicts.push({ subject, characterId, skillId: grant.skillId, skillName: skillName(grant.skillId), path: "Grant without an allocated branch", source, reason: "No allowed path remains. Existing grant is retained; new investment is frozen." });
  };
  for (const character of characters) {
    const allocations = await db.select().from(campaignCharacterSkillAllocation).where(eq(campaignCharacterSkillAllocation.characterId, character.id));
    for (const allocation of allocations) {
      const path = allocationSkillPath(allocation.id, allocations);
      const result = access.resolve(path ?? []);
      if (!result.allowed) conflicts.push({ subject: character.name, characterId: character.id, skillId: allocation.skillId, skillName: skillName(allocation.skillId), path: path?.map(skillName).join(" → ") ?? "Invalid historical ancestry", source: "allocation", reason: result.reason! });
    }
    const [profile] = await db.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, character.id));
    if (profile?.raceId) reviewGrants(character.name, character.id, await db.select({ skillId: raceSkillLink.skillId }).from(raceSkillLink).where(eq(raceSkillLink.raceId, profile.raceId)), "race grant");
    const [creature] = await db.select().from(campaignCreatureNpcProfile).where(eq(campaignCreatureNpcProfile.characterId, character.id));
    if (creature) reviewGrants(character.name, character.id, snapshotGrants(creature.currentSnapshotJson), "creature grant");
  }
  const creatures = await db.select({ name: campaignSessionEncounterParticipant.displayLabel, snapshot: campaignSessionEncounterParticipant.creatureSnapshotJson }).from(campaignSessionEncounterParticipant).where(eq(campaignSessionEncounterParticipant.campaignId, campaignId));
  for (const creature of creatures) if (creature.snapshot) reviewGrants(creature.name, null, snapshotGrants(creature.snapshot), "creature grant");
  return conflicts;
}
