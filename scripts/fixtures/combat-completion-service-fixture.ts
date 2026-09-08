import { eq } from "drizzle-orm";
import { creature } from "@/db/creature-schema";
import { item, weaponProfile, weaponSkillPathMapping } from "@/db/item-schema";
import { skill } from "@/db/skill-schema";
import { campaignCharacterAttribute, campaignCharacterItem, campaignCharacterItemEquipmentState } from "@/db/realm-schema";
import { campaignSessionEncounterParticipant, campaignSessionEncounterInitiative, campaignSessionEncounterInitiativeParticipant, defenseSkillPathMapping } from "@/db/tabletop-operations-schema";
import { spawnEncounterCreaturesInTransaction } from "@/features/tabletop-operations/creature-spawn-service";
import { lockOwnedEncounterRuntimeInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import type { ActionDeclarationDraft } from "@/features/tabletop-operations/action-declaration";
import { insertBuildTenFixture, type BuildTenDbTransaction } from "../tabletop-build-ten-db-fixture";

export function completionDraft(actorCharacterId: number, target: number): ActionDeclarationDraft {
  return { actorCharacterId, targetCharacterIds: [target], label: "Completion fixture action", actionKind: "weapon-attack", sourceKind: "generic",
    sourceRef: null, sourceInstanceId: null, weaponItemId: null, firingModeId: null, attackMode: "", initiativeCost: 4,
    allowsMultiRound: false, heldIntervention: false, windowKind: "melee-overlap", aimDeclared: false,
    calledShot: { declared: false, label: "", assignedPenalty: null }, explicitModifiers: [], preparesForDeclarationId: null, godNotes: "Explicit synthetic fixture" };
}

export async function completionServiceFixture(tx: BuildTenDbTransaction, label: string) {
  const base = await insertBuildTenFixture(tx, label);
  const context = await lockOwnedEncounterRuntimeInTransaction(tx, base.encounterId, base.godId);
  const [path] = await tx.insert(skill).values({ name: `Completion path ${crypto.randomUUID()}`, classification: "standard", tier: 1, primaryAttribute: "DEX", createdByUserId: base.godId }).returning();
  await tx.insert(defenseSkillPathMapping).values({ endpointSkillId: path.id, reviewState: "approved", updatedByUserId: base.godId });
  const [weapon] = await tx.insert(item).values({ canonicalId: `COMPLETION-${crypto.randomUUID()}`.toUpperCase(), name: "Fixture Shortsword", catalogScope: "equipment", equipmentGroup: "weapon", recordType: "Weapon", family: "Fixture", category: "Fixture", priceBasis: "unit", createdByUserId: base.godId }).returning();
  const [profile] = await tx.insert(weaponProfile).values({ itemId: weapon.id, profileRecordType: "Weapon", weaponType: "Sword", damage: "4", initiativeCost: 4, damageType: "Slashing" }).returning();
  await tx.insert(weaponSkillPathMapping).values({ weaponProfileId: profile.id, endpointSkillId: path.id, reviewState: "approved", sortOrder: 0, updatedByUserId: base.godId });
  for (const characterId of [base.heroId, base.defenderId]) {
    await tx.insert(campaignCharacterAttribute).values({ characterId, attributeKey: "DEX", value: 50 });
    await tx.insert(campaignCharacterItem).values({ characterId, itemId: weapon.id, quantity: 1, unitCostCredits: 0 });
    await tx.insert(campaignCharacterItemEquipmentState).values({ characterId, itemId: weapon.id, state: "wielded", quantity: 1 });
  }
  const [template] = await tx.insert(creature).values({ canonicalId: `COMPLETION-${crypto.randomUUID()}`.toUpperCase(), canonicalName: "Fixture Goblin", size: "Medium", totalHp: 30, createdByUserId: base.godId }).returning();
  const occurrences = (await spawnEncounterCreaturesInTransaction(tx, context, base.godId, { requestKey: crypto.randomUUID(), creatureId: template.id, quantity: 2, joinInitiative: false })).created.map(({ runtimeParticipantKey }) => runtimeParticipantKey);
  const creatureSnapshot = { core: { canonicalName: "Fixture Goblin", totalHp: 30, size: "Medium" },
    attacks: [{ canonicalId: "fixture-shortsword", attackName: "Shortsword", attackPercentage: 50, damage: "4", damageType: "Slashing" }],
    defenses: [{ defenseType: "Dodge", value: "40", seedIdentity: "fixture-dodge" }, { defenseType: "Block", value: "50", seedIdentity: "fixture-block" }],
    hpPools: [{ canonicalId: "fixture-head", poolName: "Head", maximumHp: 3 }],
    hitLocations: [{ hitLocationNumber: 0, locationName: "Head", hpPoolCanonicalId: "fixture-head", soak: "0", naturalArmor: "0" }],
  };
  for (const characterId of occurrences) {
    await tx.update(campaignSessionEncounterParticipant).set({ creatureSnapshotJson: creatureSnapshot }).where(eq(campaignSessionEncounterParticipant.characterId, characterId));
    await tx.insert(campaignSessionEncounterInitiativeParticipant).values({ encounterId: base.encounterId, sceneId: base.sceneId, sessionId: base.sessionId, campaignId: base.campaignId, characterId, normalTotalInitiative: 22, currentInitiative: 22, movementMode: "Walk" });
  }
  await tx.update(campaignSessionEncounterInitiativeParticipant).set({ normalTotalInitiative: 22, currentInitiative: 22, participationStatus: "passed", lastSatisfiedStep: 0 }).where(eq(campaignSessionEncounterInitiativeParticipant.encounterId, base.encounterId));
  await tx.update(campaignSessionEncounterInitiative).set({ roundNumber: 1, stepNumber: 1, timelineInitiative: 22 }).where(eq(campaignSessionEncounterInitiative.encounterId, base.encounterId));
  return { ...base, context, weaponId: weapon.id, skillId: path.id, occurrences, creatureSnapshot,
    god: { authority: "god-owner" as const, userId: base.godId },
    player: { authority: "player" as const, userId: base.godId, characterId: base.heroId } };
}
