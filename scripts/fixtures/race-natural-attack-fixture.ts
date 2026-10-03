import { eq } from "drizzle-orm";
import type { db } from "@/db";
import { race, raceNaturalAttack } from "@/db/race-schema";
import { campaignAllowedRace, campaignCharacter, campaignCharacterAttribute, campaignCharacterProfile } from "@/db/realm-schema";
import { emptyRaceNaturalAttack } from "@/features/races/race-natural-attacks";
import { raceNaturalAttackRef } from "@/features/tabletop-operations/race-natural-attack-runtime";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function raceNaturalAttackFixture(tx: Tx, characterId: number, skillId: number) {
  const [ancestry] = await tx.insert(race).values({ name: "Natural Attack fixture" }).returning();
  const [owner] = await tx.select({ campaignId: campaignCharacter.campaignId }).from(campaignCharacter).where(eq(campaignCharacter.id, characterId));
  await tx.insert(campaignAllowedRace).values({ campaignId: owner.campaignId, raceId: ancestry.id, sortOrder: 1 });
  await tx.update(campaignCharacterProfile).set({ raceId: ancestry.id }).where(eq(campaignCharacterProfile.characterId, characterId));
  await tx.insert(campaignCharacterAttribute).values({ characterId, attributeKey: "CON", value: 60 }).onConflictDoNothing();
  const definition = { ...emptyRaceNaturalAttack("fire-claw"), attackName: "Fire Claw", damage: "18", damageType: "Fire", skillId,
    notes: "A forty-foot cone in the story is not target geometry." };
  definition.authoring = { ...definition.authoring, initiativeCost: 4, mode: "melee", magical: true,
    range: { unit: "feet", reach: 5, short: 10, medium: 20, long: 40 } };
  const [attack] = await tx.insert(raceNaturalAttack).values({ ...definition, raceId: ancestry.id }).returning();
  return { ancestry, attack, ref: raceNaturalAttackRef(ancestry.id, attack.key) };
}
