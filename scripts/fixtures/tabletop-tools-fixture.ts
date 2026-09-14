import { eq } from "drizzle-orm";
import type { db } from "@/db";
import { item, itemEffect, itemRuntimeProfile, weaponProfile } from "@/db/item-schema";
import { magazineProfile, magazineAmmunition, weaponMagazine } from "@/db/magazine-schema";
import { campaignCharacterItem, campaignCharacterItemInstance, campaignInventoryItem } from "@/db/realm-schema";
import { campaignCharacterFirearmState, campaignSessionEncounter } from "@/db/tabletop-operations-schema";
import { skillExtension } from "@/db/skill-schema";
import { addScreenFirearm, addScreenSpell, screenFixture } from "./combat-screens-browser-fixture";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function tabletopToolsFixture(tx: Tx, label: string) {
  const f = await screenFixture(tx, label);
  await tx.update(campaignSessionEncounter).set({ status: "completed", completedAt: new Date() }).where(eq(campaignSessionEncounter.id, f.encounterId));
  const gear = await tx.insert(item).values([
    { name: "Travel Coat", recordType: "General Equipment", equipmentGroup: "general" },
    { name: "Practice Armor", recordType: "Armor", equipmentGroup: "armor" },
    { name: "Healing Draught", recordType: "General Equipment", equipmentGroup: "general" },
    { name: "Wayfinder Tonic", recordType: "General Equipment", equipmentGroup: "general" },
  ].map((entry) => ({ ...entry, canonicalId: `TOOLS-${crypto.randomUUID()}`.toUpperCase(), catalogScope: "equipment",
    family: "Fixture", category: "Fixture", priceBasis: "unit", createdByUserId: f.godId }))).returning();
  const [coat, armor, potion, manualItem] = gear;
  await tx.insert(campaignInventoryItem).values(gear.map(({ id }, index) => ({ campaignId: f.campaignId, itemId: id, sortOrder: 20 + index })));
  await tx.insert(campaignCharacterItem).values(gear.map(({ id }) => ({ characterId: f.heroId, itemId: id, quantity: 3, unitCostCredits: 0 })));
  await tx.insert(itemRuntimeProfile).values([potion, manualItem].map(({ id }) => ({ itemId: id, useMode: "consume-item", quantityPerUse: 1, activationLabel: "Drink" })));
  await tx.insert(itemEffect).values([
    { itemId: potion.id, sortOrder: 0, schemaVersion: 2, effectJson: { kind: "health.heal", amount: 3, scope: "full-body" } },
    { itemId: manualItem.id, sortOrder: 0, schemaVersion: 2, effectJson: { kind: "manual", title: "Find the path", description: "G.O.D. determines what route is revealed." } },
  ]);
  const { gun, instance: firearm } = await addScreenFirearm(tx, f);
  const [gunProfile] = await tx.update(weaponProfile).set({ reloadType: "Magazine" }).where(eq(weaponProfile.itemId, gun.id)).returning();
  await tx.update(campaignCharacterFirearmState).set({ loadedRounds: 0, loadedAmmunitionItemId: null, loadedAmmunitionProfileId: null,
    loadedAmmunitionUnitCostCredits: null, readied: false }).where(eq(campaignCharacterFirearmState.itemInstanceId, firearm.id));
  const ammoId = gunProfile.ammunitionItemId!;
  await tx.insert(campaignCharacterItem).values({ characterId: f.heroId, itemId: ammoId, quantity: 18, unitCostCredits: 1 });
  const [magazine] = await tx.insert(item).values({ canonicalId: `TOOLS-MAG-${crypto.randomUUID()}`.toUpperCase(), name: "Practice Magazine", recordType: "Magazine",
    catalogScope: "inventory", family: "Fixture", category: "Magazine", priceBasis: "unit", createdByUserId: f.godId }).returning();
  await tx.insert(magazineProfile).values({ itemId: magazine.id, capacityRounds: 6, fillInitiativeCostPerRound: 1 });
  await tx.insert(magazineAmmunition).values({ magazineItemId: magazine.id, ammunitionItemId: ammoId });
  await tx.insert(weaponMagazine).values({ weaponProfileId: gunProfile.id, magazineItemId: magazine.id });
  await tx.insert(campaignInventoryItem).values({ campaignId: f.campaignId, itemId: magazine.id, sortOrder: 30 });
  const [magazineCopy] = await tx.insert(campaignCharacterItemInstance).values({ characterId: f.heroId, itemId: magazine.id, currentCharges: 0, unitCostCredits: 1 }).returning();
  const learned = await addScreenSpell(tx, f);
  const spell = { ...learned.spell, name: "Wayfinder Passage", containers: [{ ...learned.spell.containers[0],
    effects: [{ id: "passage", ruleId: "teleportation", quantity: 1, description: "A passage across the quay." }] }] };
  await tx.update(skillExtension).set({ dataJson: JSON.stringify(spell) }).where(eq(skillExtension.skillId, learned.spellSkill.id));
  return { ...f, coat, armor, potion, manualItem, gun, firearm, ammoId, magazine, magazineCopy, learned, spell };
}
