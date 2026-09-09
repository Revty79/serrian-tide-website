import { eq } from "drizzle-orm";
import { skill, skillExtension, skillRelationship } from "@/db/skill-schema";
import { campaignCharacterAttribute, campaignCharacterProfile, campaignCharacterSkillAllocation } from "@/db/realm-schema";
import { createEmptySpell, createContainer, createModifierSelection } from "@/features/spell-construction/utilities/spellFactory";
import type { RuntimeIntegrationTransaction as Tx } from "@/features/tabletop-operations/runtime-integration-service";

/** A learned spell, without a fabricated governing target or a source ruling. */
export async function addLearnedCombatSpell(tx: Tx, f: { heroId: number; godId: string }, options: { area?: boolean; fixed?: boolean; name?: string } = {}) {
  // Browser scenarios share one catalog. Do not create duplicate magic roots
  // whose names would make the existing magic-profile lookup ambiguous.
  const existingRoot = await tx.select().from(skill).where(eq(skill.name, "Spellcraft"));
  const framework = existingRoot[0] ?? (await tx.insert(skill).values({ name: "Spellcraft", classification: "standard", tier: 1, primaryAttribute: "INT", createdByUserId: f.godId }).returning())[0];
  const existingChannel = await tx.select().from(skill).where(eq(skill.name, "Channeling"));
  const channeling = existingChannel[0] ?? (await tx.insert(skill).values({ name: "Channeling", classification: "standard", tier: 1, primaryAttribute: "WIS", createdByUserId: f.godId }).returning())[0];
  const [spellSkill] = await tx.insert(skill).values({ name: options.name ?? "Screen Arc Bolt", classification: "standard", tier: 2, primaryAttribute: "INT", createdByUserId: f.godId }).returning();
  await tx.insert(skillRelationship).values({ skillId: spellSkill.id, relatedSkillId: framework.id, relationshipType: "parent" });
  const [root] = await tx.insert(campaignCharacterSkillAllocation).values({ characterId: f.heroId, skillId: framework.id, points: 1 }).returning();
  const [allocation] = await tx.insert(campaignCharacterSkillAllocation).values({ characterId: f.heroId, skillId: spellSkill.id, parentAllocationId: root.id, points: 5 }).returning();
  await tx.insert(campaignCharacterSkillAllocation).values({ characterId: f.heroId, skillId: channeling.id, points: 20 });
  await tx.insert(campaignCharacterAttribute).values({ characterId: f.heroId, attributeKey: "INT", value: 50 }).onConflictDoNothing();
  await tx.update(campaignCharacterProfile).set({ baseMagicSteps: 4 }).where(eq(campaignCharacterProfile.characterId, f.heroId));
  const spell = { ...createEmptySpell(), name: spellSkill.name, castingSystem: "Spellcraft" as const, sphere: "Force", frameworkSkillId: framework.id,
    modifiers: [createModifierSelection(options.fixed ? "static-assignment" : "per-success-assignment")],
    containers: [{ ...createContainer(options.area ? "aoe" : "target"), id: "bolt-target",
      ...(options.area ? { shape: { id: "bolt-shape", ruleId: "radius", quantity: 0, description: "Test area" } } : {}),
      effects: [{ id: "bolt-damage", ruleId: "damage", quantity: 2, description: "Learned test spell" }] }] };
  await tx.insert(skillExtension).values({ skillId: spellSkill.id, extensionType: "spell-construction", schemaVersion: 1, dataJson: JSON.stringify(spell) });
  return { allocation, spell, spellSkill, root };
}
