import assert from "node:assert/strict";
import { after, test } from "node:test";

import { eq, inArray } from "drizzle-orm";

import { db, pool } from "@/db";
import { user } from "@/db/auth-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import { creature } from "@/db/creature-schema";
import { armorProfile, item, itemRuntimeProfile, weaponProfile } from "@/db/item-schema";
import {
  campaignCharacter,
  campaignCharacterAttribute,
  campaignCharacterInjury,
  campaignCharacterItem,
  campaignCharacterItemEquipmentState,
  campaignCharacterItemInstance,
  campaignCharacterProfile,
  campaignCharacterSkillAllocation,
  campaignCreatureNpcProfile,
} from "@/db/realm-schema";
import { skill } from "@/db/skill-schema";
import {
  campaignSession,
  campaignSessionEncounter,
  campaignSessionEncounterInitiative,
  campaignSessionEncounterInitiativeParticipant,
  campaignSessionEncounterParticipant,
  campaignSessionEncounterPendingAction,
  campaignSessionRoster,
  campaignSessionScene,
  campaignSessionSceneMember,
} from "@/db/tabletop-operations-schema";
import {
  applyConditionInTransaction,
  applyModifierInTransaction,
  endModifierInTransaction,
  resolveConditionInTransaction,
} from "@/features/active-state/active-effects-service";
import {
  lockActiveHealthInTransaction,
  persistActiveHealthStateInTransaction,
} from "@/features/active-state/active-health-service";
import { spendActiveManaInTransaction } from "@/features/active-state/active-mana-service";
import { applyLocalizedDamage } from "@/features/active-state/health-rules";
import { spendItemChargesInTransaction } from "@/features/items/item-charge-service";
import { readCombatAidEncounterInTransaction } from "@/features/tabletop-operations/combat-aid-service";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for Combat Aid PostgreSQL validation.");
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
  throw new Error(`Refusing Combat Aid tests against non-local host ${databaseUrl.hostname}.`);
}
if (!databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error(`Refusing Combat Aid tests against non-development database ${databaseUrl.pathname.slice(1)}.`);
}

const ROLLBACK = new Error("ROLLBACK_COMBAT_AID_TEST");

after(async () => {
  await pool.end();
});

test("Combat Aid rereads authoritative Health, Mana, effects, Equipment, Charges, Creature anatomy, and Initiative", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const suffix = crypto.randomUUID();
    const godId = `combat-aid-god-${suffix}`;
    await tx.insert(user).values({
      id: godId,
      name: "Combat Aid Test G.O.D.",
      email: `${godId}@example.invalid`,
      username: godId,
    });
    const [createdCampaign] = await tx.insert(campaign).values({
      name: `Combat Aid ${suffix}`,
      overview: "Rollback-only Combat Aid integration fixture.",
      attributePoints: 0,
      skillPoints: 0,
      maxStartingSkill: 0,
      pointsToUnlockNextTier: 0,
      maxPointsInSkill: 100,
      startingCreditAmount: 0,
      currencySystem: "Credits",
      fatePointMethod: "Assigned",
      assignedFatePoints: 0,
      createdByUserId: godId,
    }).returning({ id: campaign.id });
    assert.ok(createdCampaign);
    await tx.insert(campaignPlayer).values({ campaignId: createdCampaign.id, userId: godId });

    const [pc, creatureNpc] = await tx.insert(campaignCharacter).values([
      { campaignId: createdCampaign.id, playerUserId: godId, name: "Combat Aid Hero" },
      { campaignId: createdCampaign.id, playerUserId: godId, name: "Combat Aid Hydra", isNpc: true, npcKind: "creature", npcBuildMode: "detailed" },
    ]).returning({ id: campaignCharacter.id });
    assert.ok(pc && creatureNpc);
    await tx.insert(campaignCharacterProfile).values([
      { characterId: pc.id, hpMultiplierSteps: 0, baseMagicSteps: 2 },
      { characterId: creatureNpc.id, hpMultiplierSteps: 0, baseMagicSteps: 0 },
    ]);
    await tx.insert(campaignCharacterAttribute).values({ characterId: pc.id, attributeKey: "CON", value: 25 });

    const magicSkills = await tx.select({ id: skill.id, name: skill.name }).from(skill)
      .where(inArray(skill.name, ["Spellcraft", "Channeling"]));
    const spellcraftId = magicSkills.find(({ name }) => name === "Spellcraft")?.id;
    const channelingId = magicSkills.find(({ name }) => name === "Channeling")?.id;
    assert.ok(spellcraftId && channelingId, "Canonical Spellcraft and Channeling Skills are required.");
    const [magicRoot] = await tx.insert(campaignCharacterSkillAllocation).values({
      characterId: pc.id,
      skillId: spellcraftId,
      points: 1,
    }).returning({ id: campaignCharacterSkillAllocation.id });
    assert.ok(magicRoot);
    await tx.insert(campaignCharacterSkillAllocation).values({
      characterId: pc.id,
      skillId: channelingId,
      parentAllocationId: magicRoot.id,
      points: 10,
    });

    const [creatureDefinition] = await tx.insert(creature).values({
      canonicalId: `BUILD7-${suffix}`.toUpperCase(),
      canonicalName: "Combat Aid Hydra Template",
      size: "Large",
    }).returning({ id: creature.id });
    assert.ok(creatureDefinition);
    const creatureSnapshot = JSON.stringify({
      core: { size: "Large", hpMultiplierSteps: 0, baseMovementSteps: 0, baseMagicSteps: 0 },
      attributes: [{ attributeKey: "Constitution", value: 30 }],
      hpPools: [
        { canonicalId: `BUILD7-BODY-${suffix}`.toUpperCase(), poolName: "Body", hpPercentage: 70, sortOrder: 0 },
        { canonicalId: `BUILD7-TAILS-${suffix}`.toUpperCase(), poolName: "Tails", hpPercentage: 30, sortOrder: 1 },
      ],
      hitLocations: [
        { hitLocationNumber: 1, locationName: "Torso", bodyPartsIncluded: "Torso", hpPoolCanonicalId: `BUILD7-BODY-${suffix}`.toUpperCase(), sortOrder: 0 },
        { hitLocationNumber: 8, locationName: "Left Tail", bodyPartsIncluded: "Left Tail", hpPoolCanonicalId: `BUILD7-TAILS-${suffix}`.toUpperCase(), sortOrder: 1 },
        { hitLocationNumber: 9, locationName: "Right Tail", bodyPartsIncluded: "Right Tail", hpPoolCanonicalId: `BUILD7-TAILS-${suffix}`.toUpperCase(), sortOrder: 2 },
      ],
    });
    await tx.insert(campaignCreatureNpcProfile).values({
      characterId: creatureNpc.id,
      creatureId: creatureDefinition.id,
      baselineSnapshotJson: creatureSnapshot,
      currentSnapshotJson: creatureSnapshot,
    });

    const [weapon, armor] = await tx.insert(item).values([
      {
        canonicalId: `BUILD7-WEAPON-${suffix}`.toUpperCase(),
        name: "Combat Aid Arc Rifle",
        catalogScope: "equipment",
        equipmentGroup: "weapon",
        recordType: "test",
        family: "test",
        category: "weapon",
        priceBasis: "unit",
      },
      {
        canonicalId: `BUILD7-ARMOR-${suffix}`.toUpperCase(),
        name: "Combat Aid Field Armor",
        catalogScope: "equipment",
        equipmentGroup: "armor",
        recordType: "test",
        family: "test",
        category: "armor",
        priceBasis: "unit",
      },
    ]).returning({ id: item.id });
    assert.ok(weapon && armor);
    await tx.insert(weaponProfile).values({
      itemId: weapon.id,
      weaponType: "Rifle",
      handedness: "Two-Handed",
      damageSource: "Weapon",
      damage: "7",
      damageType: "Energy",
      initiativeCost: 6,
      rangeText: "Long",
      rulesText: "Rollback-only authoritative weapon profile.",
    });
    await tx.insert(armorProfile).values({
      itemId: armor.id,
      armorType: "Field",
      coverage: "Body",
      baseSoak: 3,
      rulesText: "Rollback-only authoritative armor profile.",
    });
    await tx.insert(itemRuntimeProfile).values({
      itemId: weapon.id,
      useMode: "charges",
      maximumCharges: 5,
      chargesPerUse: 1,
      activationLabel: "Fire",
      rechargeNotes: "Reload at the table.",
    });
    await tx.insert(campaignCharacterItem).values({
      characterId: pc.id,
      itemId: armor.id,
      quantity: 1,
      unitCostCredits: 0,
    });
    await tx.insert(campaignCharacterItemEquipmentState).values({
      characterId: pc.id,
      itemId: armor.id,
      state: "worn",
      quantity: 1,
    });
    const [weaponInstance] = await tx.insert(campaignCharacterItemInstance).values({
      characterId: pc.id,
      itemId: weapon.id,
      currentCharges: 5,
      equipmentState: "wielded",
      unitCostCredits: 0,
    }).returning({ id: campaignCharacterItemInstance.id });
    assert.ok(weaponInstance);

    const [session] = await tx.insert(campaignSession).values({
      campaignId: createdCampaign.id,
      title: "Combat Aid Session",
      sequenceNumber: 1,
    }).returning({ id: campaignSession.id });
    assert.ok(session);
    const participantIds = [pc.id, creatureNpc.id];
    await tx.insert(campaignSessionRoster).values(participantIds.map((characterId, sortOrder) => ({
      sessionId: session.id,
      campaignId: createdCampaign.id,
      characterId,
      sortOrder,
    })));
    const [scene] = await tx.insert(campaignSessionScene).values({
      sessionId: session.id,
      campaignId: createdCampaign.id,
      title: "Combat Aid Scene",
      sequenceNumber: 1,
    }).returning({ id: campaignSessionScene.id });
    assert.ok(scene);
    await tx.insert(campaignSessionSceneMember).values(participantIds.map((characterId, sortOrder) => ({
      sceneId: scene.id,
      sessionId: session.id,
      campaignId: createdCampaign.id,
      characterId,
      sortOrder,
    })));
    const [encounter] = await tx.insert(campaignSessionEncounter).values({
      sceneId: scene.id,
      sessionId: session.id,
      campaignId: createdCampaign.id,
      title: "Combat Aid Encounter",
      sequenceNumber: 1,
      encounterType: "combat",
    }).returning({ id: campaignSessionEncounter.id });
    assert.ok(encounter);
    await tx.insert(campaignSessionEncounterParticipant).values(participantIds.map((characterId, sortOrder) => ({
      encounterId: encounter.id,
      sceneId: scene.id,
      sessionId: session.id,
      campaignId: createdCampaign.id,
      characterId,
      sortOrder,
    })));
    await tx.insert(campaignSessionEncounterInitiative).values({
      encounterId: encounter.id,
      sceneId: scene.id,
      sessionId: session.id,
      campaignId: createdCampaign.id,
      timelineInitiative: 18,
    });
    await tx.insert(campaignSessionEncounterInitiativeParticipant).values({
      encounterId: encounter.id,
      sceneId: scene.id,
      sessionId: session.id,
      campaignId: createdCampaign.id,
      characterId: pc.id,
      normalTotalInitiative: 31,
      currentInitiative: 23,
      participationStatus: "holding",
      deferredInitiativeCost: 3,
      movementMode: "Walk",
    });
    await tx.insert(campaignSessionEncounterPendingAction).values({
      encounterId: encounter.id,
      sceneId: scene.id,
      sessionId: session.id,
      campaignId: createdCampaign.id,
      actorCharacterId: pc.id,
      label: "Exact pending action",
      originalInitiativeCost: 6,
      remainingInitiativeCost: 6,
      startInitiative: 23,
      startTimelineInitiative: 18,
      expectedCompletionInitiative: 17,
      startedRound: 1,
    });

    const before = await readCombatAidEncounterInTransaction(tx, encounter.id, godId);
    assert.deepEqual(before.participants.map(({ identity }) => identity.characterId), participantIds);
    const beforePc = before.participants[0]!;
    assert.equal(beforePc.health?.total.maximumHp, 50);
    assert.equal(beforePc.health?.total.remainingHp, 50);
    assert.ok(beforePc.mana?.pools.some(({ system, currentMana, maximumMana }) => system === "Spellcraft" && currentMana === maximumMana && currentMana > 0));
    assert.ok(beforePc.equipment?.wieldedWeapons.some((entry) => entry.itemId === weapon.id && entry.instanceId === weaponInstance.id && entry.damage === "7" && entry.damageType === "Energy" && entry.initiativeCost === 6));
    assert.ok(beforePc.equipment?.wornArmor.some((entry) => entry.itemId === armor.id && entry.baseSoak === 3));
    assert.equal(beforePc.resources?.chargedInstances.find(({ instanceId }) => instanceId === weaponInstance.id)?.currentCharges, 5);
    assert.equal(beforePc.initiative.enrolled && beforePc.initiative.currentInitiative, 23);
    assert.equal(beforePc.initiative.enrolled && beforePc.initiative.pendingAction?.label, "Exact pending action");
    assert.deepEqual(before.participants[1]!.initiative, { enrolled: false });

    const health = await lockActiveHealthInTransaction(tx, pc.id, "race");
    const location = health.anatomy.hitLocations.find(({ poolKey }) => Boolean(poolKey))!;
    await persistActiveHealthStateInTransaction(tx, health.anatomy, applyLocalizedDamage(
      health.state,
      health.anatomy,
      { amount: 3, hitLocationNumber: location.result },
    ));
    await tx.insert(campaignCharacterInjury).values({
      characterId: pc.id,
      poolKey: location.poolKey!,
      poolNameSnapshot: location.poolName!,
      hitLocationNumber: location.result,
      hitLocationNameSnapshot: location.name,
      name: "Visible injury",
      notes: "Authoritative Injury record.",
      damageAmount: 3,
    });
    await spendActiveManaInTransaction(tx, { characterId: pc.id, system: "Spellcraft", amount: 1 });
    const source = { kind: "god" as const, id: godId, name: "Combat Aid Test G.O.D." };
    const condition = await applyConditionInTransaction(tx, {
      characterId: pc.id,
      source,
      sourceEffectKey: "combat-aid-condition",
      effect: { kind: "condition.apply", name: "Observed", description: "Visible Condition.", duration: { kind: "until-removed", value: null } },
    });
    const modifier = await applyModifierInTransaction(tx, {
      characterId: pc.id,
      source,
      sourceEffectKey: "combat-aid-modifier",
      effect: { kind: "modifier.apply", label: "Quickened", channel: "initiative", targetKey: "self", amount: 2, duration: { kind: "combat-steps", value: 3 } },
    });
    await spendItemChargesInTransaction(tx, { characterId: pc.id, itemId: weapon.id, instanceId: weaponInstance.id });
    const creatureHealth = await lockActiveHealthInTransaction(tx, creatureNpc.id, "creature");
    await persistActiveHealthStateInTransaction(tx, creatureHealth.anatomy, applyLocalizedDamage(
      creatureHealth.state,
      creatureHealth.anatomy,
      { amount: 2, hitLocationNumber: 8 },
    ));

    const after = await readCombatAidEncounterInTransaction(tx, encounter.id, godId);
    const afterPc = after.participants[0]!;
    assert.equal(afterPc.health?.total.damage, 3);
    assert.equal(afterPc.health?.total.remainingHp, 47);
    assert.equal(afterPc.health?.tracks.find(({ key }) => key === location.poolKey)?.damage, 3);
    assert.ok(afterPc.health?.injuries.some(({ name, resolved }) => name === "Visible injury" && !resolved));
    assert.equal(afterPc.mana?.pools.find(({ system }) => system === "Spellcraft")?.manaSpent, 1);
    assert.ok(afterPc.effects?.conditions.some(({ id }) => id === condition.id));
    assert.ok(afterPc.effects?.modifiers.some(({ id }) => id === modifier.id));
    assert.equal(afterPc.resources?.chargedInstances.find(({ instanceId }) => instanceId === weaponInstance.id)?.currentCharges, 4);
    const afterCreature = after.participants[1]!;
    assert.equal(afterCreature.health?.anatomy.kind, "creature");
    assert.deepEqual(afterCreature.health?.anatomy.pools.map(({ name }) => name), ["Body", "Tails"]);
    assert.equal(afterCreature.health?.anatomy.hitLocations.filter(({ poolName }) => poolName === "Tails").length, 2);
    assert.equal(afterCreature.health?.total.damage, 2);

    await resolveConditionInTransaction(tx, pc.id, condition.id, "Verified reread");
    await endModifierInTransaction(tx, pc.id, modifier.id, "Verified reread");
    const resolved = await readCombatAidEncounterInTransaction(tx, encounter.id, godId);
    assert.equal(resolved.participants[0]!.effects?.conditions.some(({ id }) => id === condition.id), false);
    assert.equal(resolved.participants[0]!.effects?.modifiers.some(({ id }) => id === modifier.id), false);
    await assert.rejects(
      readCombatAidEncounterInTransaction(tx, encounter.id, "not-the-owner"),
      /Campaign creator/,
    );
    throw ROLLBACK;
  }), (error) => error === ROLLBACK);
});

test("Combat Aid integration leaves no persistent fixtures", async () => {
  const rows = await db.select({ id: user.id }).from(user).where(eq(user.name, "Combat Aid Test G.O.D."));
  assert.equal(rows.length, 0);
});
