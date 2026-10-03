import { eq } from "drizzle-orm";
import type { db } from "@/db";
import { race } from "@/db/race-schema";
import { item, armorProfile, armorLocation, armorLocationReference, itemArmorDamageModifier } from "@/db/item-schema";
import { campaignCharacterAttribute, campaignCharacterProfile, campaignCharacterItem, campaignCharacterItemEquipmentState } from "@/db/realm-schema";
import { saveRaceNaturalProtectionInTransaction } from "@/features/races/race-natural-protection-service";
import type { InteractionRuleProfile } from "@/features/interaction-rules/interaction-rules";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Approved example, shared by real weapon, projectile, Creature, Item and Spell tests. */
export async function protectionPipelineFixture(tx: Tx, owner: string, targetId: number, magicalRequirement = false) {
  const interactionRules: InteractionRuleProfile = { schemaVersion: 1, rules: [
    { key: "fire", name: "Fire Resistance", ruleType: "resistance", percentage: 50, scope: "damage", match: "ALL", sortOrder: 1, notes: "",
      conditions: [{ key: "fire", kind: "damage-type", damageType: "Fire" }] },
    ...(magicalRequirement ? [{ key: "magic", name: "Magical only", ruleType: "requirement" as const, percentage: null, scope: "damage" as const, match: "ALL" as const, sortOrder: 0, notes: "",
      conditions: [{ key: "magic", kind: "magical" as const, magical: true }] }] : []),
  ] };
  const [ancestry] = await tx.insert(race).values({ name: "Layered protection fixture", interactionRules }).returning();
  await tx.update(campaignCharacterProfile).set({ raceId: ancestry.id }).where(eq(campaignCharacterProfile.characterId, targetId));
  await tx.insert(campaignCharacterAttribute).values({ characterId: targetId, attributeKey: "CON", value: 60 }).onConflictDoNothing();
  await saveRaceNaturalProtectionInTransaction(tx, ancestry.id, [{ key: "hide", name: "Hide", coverage: { kind: "all" }, naturalSoak: 2, sortOrder: 0 }]);
  const [helmet] = await tx.insert(item).values({ canonicalId: `PROTECTION-${crypto.randomUUID()}`.toUpperCase(), name: "Fire helmet", catalogScope: "equipment", equipmentGroup: "armor", recordType: "Armor", family: "Armor", category: "Armor", priceBasis: "unit", createdByUserId: owner }).returning();
  await tx.insert(armorProfile).values({ itemId: helmet.id, baseSoak: 4, coverage: "Head", damageModifiersSourceText: "Prose is not another modifier." });
  await tx.insert(armorLocationReference).values({ locationCode: "0", locationName: "Head", sortOrder: 0 }).onConflictDoNothing();
  await tx.insert(armorLocation).values({ itemId: helmet.id, locationCode: "0" });
  const [modifier] = await tx.insert(itemArmorDamageModifier).values({ itemId: helmet.id, damageType: "Fire", modifier: "+2", modifierText: "Fire +200 is descriptive only", notes: "Do not parse numbers here", sortOrder: 0 }).returning();
  await tx.insert(campaignCharacterItem).values({ characterId: targetId, itemId: helmet.id, quantity: 1, unitCostCredits: 0 });
  await tx.insert(campaignCharacterItemEquipmentState).values({ characterId: targetId, itemId: helmet.id, state: "worn", quantity: 1 });
  return { helmet, modifier, ancestry };
}
