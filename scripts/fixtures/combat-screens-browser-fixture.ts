import { and, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { user, account } from "@/db/auth-schema";
import { userRole } from "@/db/authorization-schema";
import { campaignPlayer } from "@/db/campaign-schema";
import { race, raceMovementMode } from "@/db/race-schema";
import { creature, creatureAttribute, creatureMovement, creatureHpPool, creatureHitLocation, creatureAttack } from "@/db/creature-schema";
import { campaignInventoryItem, campaignAllowedRace, campaignCharacter, campaignCharacterAttribute, campaignCharacterProfile, campaignCharacterActiveHealth } from "@/db/realm-schema";
import { campaignSessionEncounterParticipant as member, campaignSessionEncounterInitiativeParticipant as enrollment, campaignSessionEncounterPendingActionSource as source, campaignSessionEncounterReaction as reaction } from "@/db/tabletop-operations-schema";
import { completionServiceFixture } from "./combat-completion-service-fixture";
import type { BuildTenDbTransaction as Tx } from "../tabletop-build-ten-db-fixture";
import { skill } from "@/db/skill-schema";
import { item, weaponProfile, weaponFiringMode, weaponSkillPathMapping } from "@/db/item-schema";
import { campaignCharacterSkillAllocation, campaignCharacterSpellDocument, campaignCharacterItemInstance } from "@/db/realm-schema";
import { campaignCharacterFirearmState } from "@/db/tabletop-operations-schema";
import { createEmptySpell, createContainer } from "@/features/spell-construction/utilities/spellFactory";
import { recordCombatSourceResolutionInTransaction } from "@/features/tabletop-operations/combat-source-resolution-service";
export const SCREEN_PASSWORD = "Combat-Browser-Only-2026!";
export async function screenFixture(tx: Tx, label: string, simultaneous = false) {
  if (process.env.SERRIAN_DISPOSABLE_COMBAT_SCREENS !== "true") throw new Error("Only the disposable screen harness may seed these fixtures.");
  const f = await completionServiceFixture(tx, label), playerId = `screen-player-${crypto.randomUUID()}`;
  await tx.insert(campaignInventoryItem).values({ campaignId: f.campaignId, itemId: f.weaponId, sortOrder: 0 });
  await tx.insert(user).values({ id: playerId, name: "Screen Player", email: `${playerId}@example.invalid`, emailVerified: true, username: playerId });
  await tx.update(user).set({ emailVerified: true }).where(eq(user.id, f.godId));
  const password = await hashPassword(SCREEN_PASSWORD);
  for (const [id, role] of [[f.godId, "god"], [playerId, "player"]] as const) {
    await tx.insert(userRole).values({ userId: id, role });
    await tx.insert(account).values({ id: `${id}-credential`, issuer: "local:credential", accountId: id, providerId: "credential", userId: id, password, updatedAt: new Date() });
  }
  await tx.insert(campaignPlayer).values({ campaignId: f.campaignId, userId: playerId });
  await tx.update(campaignPlayer).set({ isNpcController: true }).where(and(eq(campaignPlayer.campaignId, f.campaignId), eq(campaignPlayer.userId, f.godId)));
  await tx.update(campaignCharacter).set({ playerUserId: playerId, name: "Rowan" }).where(eq(campaignCharacter.id, f.heroId));
  await tx.update(campaignCharacter).set({ name: "Sentry NPC" }).where(eq(campaignCharacter.id, f.defenderId));
  const [ancestry] = await tx.insert(race).values({ name: `Screen Human ${label}`, size: "Medium", baseMagic: 5, createdByUserId: f.godId }).returning();
  await tx.insert(campaignAllowedRace).values({ campaignId: f.campaignId, raceId: ancestry.id, sortOrder: 0 });
  await tx.insert(raceMovementMode).values({ raceId: ancestry.id, movementMode: "Walk", baseValue: 2 });
  for (const id of [f.heroId, f.defenderId]) {
    await tx.update(campaignCharacterProfile).set({ raceId: ancestry.id }).where(eq(campaignCharacterProfile.characterId, id));
    for (const attributeKey of ["STR", "DEX", "CON", "INT", "WIS", "CHR"] as const) await tx.insert(campaignCharacterAttribute).values({ characterId: id, attributeKey, value: 50 }).onConflictDoNothing();
    await tx.update(campaignCharacterActiveHealth).set({ totalDamage: 0 }).where(eq(campaignCharacterActiveHealth.characterId, id));
  }
  // Resolve only the synthetic fixture's unrelated legacy demonstration work.
  await tx.update(source).set({ resolutionStatus: "resolved", resolvedAt: new Date() }).where(eq(source.pendingActionId, f.pendingActionId));
  await tx.update(reaction).set({ status: "resolved", resolvedAt: new Date() }).where(eq(reaction.id, f.reactionId));
  const snapshot = { ...f.creatureSnapshot, core: { ...f.creatureSnapshot.core, killXp: 3 },
    attributes: [{ attributeKey: "Dexterity", value: 30 }], movement: [{ movementMode: "Walk", movementValue: 2 }] };
  for (const id of f.occurrences) await tx.update(member).set({ creatureSnapshotJson: snapshot }).where(eq(member.characterId, id));
  const [occurrence] = await tx.select().from(member).where(eq(member.characterId, f.occurrences[0])); const templateId = occurrence.creatureId!;
  await tx.update(creature).set({ killXp: 3 }).where(eq(creature.id, templateId));
  await tx.insert(creatureAttribute).values({ creatureId: templateId, attributeKey: "Dexterity", value: 30 });
  await tx.insert(creatureMovement).values({ creatureId: templateId, movementMode: "Walk", movementValue: 2 });
  const [head] = await tx.insert(creatureHpPool).values({ creatureId: templateId, canonicalId: `SCREEN-HEAD-${crypto.randomUUID()}`.toUpperCase(), poolName: "Head", maximumHp: 3 }).returning();
  await tx.insert(creatureHitLocation).values({ creatureId: templateId, hitLocationNumber: 0, locationName: "Head", hpPoolId: head.id, naturalArmor: 0, soak: 0 });
  await tx.insert(creatureAttack).values({ creatureId: templateId, canonicalId: `SCREEN-ATTACK-${crypto.randomUUID()}`.toUpperCase(), attackName: "Shortsword", attackPercentage: 50, damage: "4", damageType: "Slashing" });
  await tx.update(enrollment).set({ participationStatus: "active" }).where(and(eq(enrollment.encounterId, f.encounterId), eq(enrollment.characterId, f.heroId)));
  if (simultaneous) await tx.update(enrollment).set({ participationStatus: "active" }).where(and(eq(enrollment.encounterId, f.encounterId), eq(enrollment.characterId, f.defenderId)));
  return { ...f, templateId, playerId, player: { authority: "player" as const, userId: playerId, characterId: f.heroId } };
}
export async function addScreenSpell(tx: Tx, f: Awaited<ReturnType<typeof screenFixture>>) {
  const [spellcraft, channeling] = await tx.insert(skill).values([{ name: "Spellcraft", classification: "standard", tier: 1, primaryAttribute: "INT", createdByUserId: f.godId }, { name: "Channeling", classification: "standard", tier: 1, primaryAttribute: "WIS", createdByUserId: f.godId }]).returning();
  await tx.insert(campaignCharacterSkillAllocation).values([{ characterId: f.heroId, skillId: spellcraft.id, points: 1 }, { characterId: f.heroId, skillId: channeling.id, points: 20 }]);
  await tx.update(campaignCharacterProfile).set({ baseMagicSteps: 4 }).where(eq(campaignCharacterProfile.characterId, f.heroId));
  const spell = { ...createEmptySpell(), name: "Screen Arc Bolt", castingSystem: "Spellcraft" as const, sphere: "Force", frameworkSkillId: spellcraft.id, containers: [{ ...createContainer("target"), id: "bolt-target", effects: [{ id: "bolt-damage", ruleId: "damage", quantity: 2, description: "Isolated browser damage spell" }] }] };
  const [saved] = await tx.insert(campaignCharacterSpellDocument).values({ characterId: f.heroId, documentId: spell.id, name: spell.name, tradition: spell.tradition, inSpellbook: true, documentJson: JSON.stringify(spell) }).returning();
  await recordCombatSourceResolutionInTransaction(tx, f.context, f.god, { participantId: f.heroId, sourceKind: "spell", sourceRef: `personal:${saved.id}`, mode: "automatic-no-roll", governing: null, effectScaling: {}, reason: "Explicit isolated no-roll spell authority for the screen test." });
  return saved;
}
export async function addScreenFirearm(tx: Tx, f: Awaited<ReturnType<typeof screenFixture>>) {
  const [ammo, gun] = await tx.insert(item).values([
    { canonicalId: `SCREEN-AMMO-${crypto.randomUUID()}`.toUpperCase(), name: "Screen Cartridge", catalogScope: "inventory", recordType: "Ammunition", family: "Fixture", category: "Ammunition", priceBasis: "per round", createdByUserId: f.godId },
    { canonicalId: `SCREEN-GUN-${crypto.randomUUID()}`.toUpperCase(), name: "Screen Pistol", catalogScope: "equipment", equipmentGroup: "weapon", recordType: "Weapon", family: "Fixture", category: "Firearm", priceBasis: "unit", createdByUserId: f.godId },
  ]).returning();
  const [ammunition] = await tx.insert(weaponProfile).values({ itemId: ammo.id, profileRecordType: "Ammunition", damage: "2", damageType: "Ballistic", ammunitionCyclingInitiativeModifier: 0, ammunitionRecoilResetInitiativeModifier: 0 }).returning();
  await tx.insert(campaignInventoryItem).values([{ campaignId: f.campaignId, itemId: ammo.id, sortOrder: 1 }, { campaignId: f.campaignId, itemId: gun.id, sortOrder: 2 }]);
  const [profile] = await tx.insert(weaponProfile).values({ itemId: gun.id, profileRecordType: "Weapon", weaponType: "Handgun", damageSource: "Ammunition", ammunitionItemId: ammo.id, rangeText: "Ranged", capacityRounds: 6, readinessMode: "draw-is-ready", drawInitiativeCost: 1, readyInitiativeCost: 1, reloadInitiativeCost: 2, unloadInitiativeCost: 1, firingModeChangeInitiativeCost: 1 }).returning();
  const [mode] = await tx.insert(weaponFiringMode).values({ weaponProfileId: profile.id, name: "Single", normalizedName: "single", sortOrder: 0, baseCyclingInitiativeCost: 0, baseRecoilResetInitiativeCost: 0, deliveryCadence: "per-trigger", roundsPerCadence: 1 }).returning();
  await tx.insert(weaponSkillPathMapping).values({ weaponProfileId: profile.id, endpointSkillId: f.skillId, reviewState: "approved", sortOrder: 0, updatedByUserId: f.godId });
  const [instance] = await tx.insert(campaignCharacterItemInstance).values({ characterId: f.heroId, itemId: gun.id, equipmentState: "wielded", currentCharges: 0, unitCostCredits: 1 }).returning();
  await tx.insert(campaignCharacterFirearmState).values({ itemInstanceId: instance.id, campaignId: f.campaignId, characterId: f.heroId, itemId: gun.id, weaponProfileId: profile.id, selectedFiringModeId: mode.id,
    loadedAmmunitionItemId: ammo.id, loadedAmmunitionProfileId: ammunition.id, loadedAmmunitionUnitCostCredits: 1, loadedRounds: 3, capacityRounds: 6, capacitySource: "canonical", readinessMode: "draw-is-ready", readinessModeSource: "canonical", readied: true, initializationKey: crypto.randomUUID(), initializedByUserId: f.godId, updatedByUserId: f.godId });
  return { instance, gun };
}
