import assert from "node:assert/strict";
import { after, test } from "node:test";

import { and, count, eq, inArray, like, sql } from "drizzle-orm";

import { db, pool } from "@/db";
import { user } from "@/db/auth-schema";
import { userRole } from "@/db/authorization-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import {
  creature,
  creatureAttack,
  creatureAttribute,
  creatureHitLocation,
  creatureHpPool,
  creatureMovement,
} from "@/db/creature-schema";
import {
  campaignCharacter,
  campaignCharacterAttribute,
  campaignCharacterItemInstance,
  campaignCharacterProfile,
  campaignCharacterSkillAllocation,
  campaignCreatureNpcProfile,
  campaignInventoryItem,
} from "@/db/realm-schema";
import { item, itemEffect, itemRuntimeProfile } from "@/db/item-schema";
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
import { readActiveHealthInTransaction } from "@/features/active-state/active-health-service";
import { readActiveEffectsInTransaction } from "@/features/active-state/active-effects-service";
import { readActiveManaInTransaction } from "@/features/active-state/active-mana-service";
import { readItemChargeStateInTransaction } from "@/features/items/item-charge-service";
import { readCharacterEquipmentStateInTransaction } from "@/features/items/equipment-state-service";
import { readCombatAidEncounterInTransaction } from "@/features/tabletop-operations/combat-aid-service";
import { spawnEncounterCreaturesInTransaction } from "@/features/tabletop-operations/creature-spawn-service";
import {
  applyEncounterDamageInTransaction,
  addEncounterConditionInTransaction,
  declareEncounterReactionInTransaction,
  executeImmediateEncounterItemInTransaction,
  lockOwnedEncounterRuntimeInTransaction,
  mutateEncounterManaInTransaction,
  resolveAuthoredActionInTransaction,
  resolveEncounterReactionInTransaction,
  setEncounterEquipmentStateInTransaction,
  startCreatureAttackInTransaction,
} from "@/features/tabletop-operations/runtime-integration-service";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for Runtime Integration PostgreSQL validation.");
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
  throw new Error(`Refusing Runtime Integration tests against non-local host ${databaseUrl.hostname}.`);
}
if (!databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error(`Refusing Runtime Integration tests against non-development database ${databaseUrl.pathname.slice(1)}.`);
}

const ROLLBACK = new Error("ROLLBACK_TABLETOP_RUNTIME_INTEGRATION_TEST");
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

after(async () => {
  await pool.end();
});

async function fixture(tx: Tx, label: string) {
  const suffix = crypto.randomUUID();
  const godId = `build8-${label}-${suffix}`;
  await tx.insert(user).values({
    id: godId,
    name: "Build 8 Test G.O.D.",
    email: `${godId}@example.invalid`,
    username: godId,
  });
  await tx.insert(userRole).values({ userId: godId, role: "god" });
  const [createdCampaign] = await tx.insert(campaign).values({
    name: `Build 8 ${label} ${suffix}`,
    overview: "Rollback-only Runtime Integration fixture.",
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
  const [target] = await tx.insert(campaignCharacter).values({
    campaignId: createdCampaign.id,
    playerUserId: godId,
    name: `Build 8 Player ${suffix}`,
  }).returning({ id: campaignCharacter.id });
  assert.ok(target);
  await tx.insert(campaignCharacterProfile).values({ characterId: target.id, hpMultiplierSteps: 0, baseMagicSteps: 1 });
  await tx.insert(campaignCharacterAttribute).values([
    { characterId: target.id, attributeKey: "CON", value: 30 },
    { characterId: target.id, attributeKey: "DEX", value: 30 },
  ]);

  const [session] = await tx.insert(campaignSession).values({
    campaignId: createdCampaign.id,
    title: "Build 8 Session",
    sequenceNumber: 1,
    status: "active",
    startedAt: new Date(),
  }).returning({ id: campaignSession.id });
  assert.ok(session);
  await tx.insert(campaignSessionRoster).values({
    sessionId: session.id,
    campaignId: createdCampaign.id,
    characterId: target.id,
    sortOrder: 0,
  });
  const [scene] = await tx.insert(campaignSessionScene).values({
    sessionId: session.id,
    campaignId: createdCampaign.id,
    title: "Build 8 Scene",
    sequenceNumber: 1,
    status: "active",
    startedAt: new Date(),
  }).returning({ id: campaignSessionScene.id });
  assert.ok(scene);
  await tx.insert(campaignSessionSceneMember).values({
    sceneId: scene.id,
    sessionId: session.id,
    campaignId: createdCampaign.id,
    characterId: target.id,
    sortOrder: 0,
  });
  const [encounter] = await tx.insert(campaignSessionEncounter).values({
    sceneId: scene.id,
    sessionId: session.id,
    campaignId: createdCampaign.id,
    title: "Build 8 Encounter",
    sequenceNumber: 1,
    encounterType: "combat",
    status: "active",
    startedAt: new Date(),
  }).returning({ id: campaignSessionEncounter.id });
  assert.ok(encounter);
  await tx.insert(campaignSessionEncounterParticipant).values({
    encounterId: encounter.id,
    sceneId: scene.id,
    sessionId: session.id,
    campaignId: createdCampaign.id,
    characterId: target.id,
    sortOrder: 0,
  });

  const canonicalPrefix = `BUILD8-${label}-${suffix}`.toUpperCase();
  const [master] = await tx.insert(creature).values({
    canonicalId: canonicalPrefix,
    canonicalName: `${label} Beast`,
    family: "Build 8",
    creatureType: "Test",
    size: "Medium",
    createdByUserId: godId,
  }).returning({ id: creature.id });
  assert.ok(master);
  await tx.insert(creatureAttribute).values([
    { creatureId: master.id, attributeKey: "Dexterity", value: 30, sortOrder: 0 },
    { creatureId: master.id, attributeKey: "Constitution", value: 30, sortOrder: 1 },
  ]);
  await tx.insert(creatureMovement).values({
    creatureId: master.id,
    movementMode: "Land",
    movementValue: 5,
    sortOrder: 0,
  });
  const [bodyPool] = await tx.insert(creatureHpPool).values({
    canonicalId: `${canonicalPrefix}-BODY`,
    creatureId: master.id,
    poolName: "Body",
    hpPercentage: 100,
    sortOrder: 0,
  }).returning({ id: creatureHpPool.id });
  assert.ok(bodyPool);
  await tx.insert(creatureHitLocation).values({
    creatureId: master.id,
    hitLocationNumber: 1,
    locationName: "Body",
    bodyPartsIncluded: "Body",
    hpPoolId: bodyPool.id,
    sortOrder: 0,
  });
  await tx.insert(creatureAttack).values({
    canonicalId: `${canonicalPrefix}-BITE`,
    creatureId: master.id,
    attackName: "Bite",
    attackPercentage: 55,
    damage: "4",
    damageType: "Piercing",
    sortOrder: 0,
  });
  const context = await lockOwnedEncounterRuntimeInTransaction(tx, encounter.id, godId);
  return {
    suffix,
    godId,
    campaignId: createdCampaign.id,
    sessionId: session.id,
    sceneId: scene.id,
    encounterId: encounter.id,
    targetCharacterId: target.id,
    masterCreatureId: master.id,
    attackCanonicalId: `${canonicalPrefix}-BITE`,
    context,
  };
}

async function addInitiative(tx: Tx, data: Awaited<ReturnType<typeof fixture>>, timelineInitiative: number) {
  await tx.insert(campaignSessionEncounterInitiative).values({
    encounterId: data.encounterId,
    sceneId: data.sceneId,
    sessionId: data.sessionId,
    campaignId: data.campaignId,
    timelineInitiative,
  });
}

test("Creature Catalog batch spawn creates independent real NPCs and all three memberships", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await fixture(tx, "Spawn");
    const result = await spawnEncounterCreaturesInTransaction(tx, data.context, data.godId, {
      creatureId: data.masterCreatureId,
      quantity: 3,
      joinInitiative: false,
    });
    assert.deepEqual(result.created.map(({ name }) => name), ["Spawn Beast 1", "Spawn Beast 2", "Spawn Beast 3"]);
    const ids = result.created.map(({ characterId }) => characterId);
    const profiles = await tx.select().from(campaignCreatureNpcProfile).where(inArray(campaignCreatureNpcProfile.characterId, ids));
    const roster = await tx.select().from(campaignSessionRoster).where(inArray(campaignSessionRoster.characterId, ids));
    const sceneMembers = await tx.select().from(campaignSessionSceneMember).where(inArray(campaignSessionSceneMember.characterId, ids));
    const encounterParticipants = await tx.select().from(campaignSessionEncounterParticipant).where(inArray(campaignSessionEncounterParticipant.characterId, ids));
    assert.equal(profiles.length, 3);
    assert.equal(roster.length, 3);
    assert.equal(sceneMembers.length, 3);
    assert.equal(encounterParticipants.length, 3);

    const first = await readActiveHealthInTransaction(tx, ids[0]!, "creature");
    await applyEncounterDamageInTransaction(tx, data.context, {
      targetCharacterId: ids[0]!,
      amount: 5,
      poolKey: first.anatomy.pools[0]!.key,
    });
    assert.equal((await readActiveHealthInTransaction(tx, ids[0]!, "creature")).view.totalDamage, 5);
    assert.equal((await readActiveHealthInTransaction(tx, ids[1]!, "creature")).view.totalDamage, 0);

    const player = await readActiveHealthInTransaction(tx, data.targetCharacterId, "race");
    await applyEncounterDamageInTransaction(tx, data.context, {
      targetCharacterId: data.targetCharacterId,
      amount: 3,
      poolKey: player.anatomy.pools[0]!.key,
    });
    assert.equal((await readActiveHealthInTransaction(tx, data.targetCharacterId, "race")).view.totalDamage, 3);
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

test("G.O.D. operations mutate the same Player Character Health, Mana, Conditions, charged Item, and Equipment state", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await fixture(tx, "PlayerState");
    const healthBefore = await readActiveHealthInTransaction(tx, data.targetCharacterId, "race");
    await applyEncounterDamageInTransaction(tx, data.context, {
      targetCharacterId: data.targetCharacterId,
      amount: 2,
      poolKey: healthBefore.anatomy.pools[0]!.key,
    });
    assert.equal((await readActiveHealthInTransaction(tx, data.targetCharacterId, "race")).view.totalDamage, 2);

    const magicSkills = await tx.select({ id: skill.id, name: skill.name }).from(skill)
      .where(inArray(skill.name, ["Spellcraft", "Channeling"]));
    const spellcraftId = magicSkills.find(({ name }) => name === "Spellcraft")?.id;
    const channelingId = magicSkills.find(({ name }) => name === "Channeling")?.id;
    assert.ok(spellcraftId && channelingId, "Canonical Spellcraft and Channeling Skills are required.");
    const [rootAllocation] = await tx.insert(campaignCharacterSkillAllocation).values({
      characterId: data.targetCharacterId,
      skillId: spellcraftId,
      points: 1,
    }).returning({ id: campaignCharacterSkillAllocation.id });
    assert.ok(rootAllocation);
    await tx.insert(campaignCharacterSkillAllocation).values({
      characterId: data.targetCharacterId,
      skillId: channelingId,
      parentAllocationId: rootAllocation.id,
      points: 2,
    });
    const manaBefore = await readActiveManaInTransaction(tx, data.targetCharacterId);
    const spellcraft = manaBefore.pools.find(({ system }) => system === "Spellcraft");
    assert.ok(spellcraft && spellcraft.currentMana > 0);
    const manaSpend = Math.min(0.25, spellcraft.currentMana);
    await mutateEncounterManaInTransaction(tx, data.context, {
      targetCharacterId: data.targetCharacterId,
      system: "Spellcraft",
      operation: "spend",
      amount: manaSpend,
    });
    const manaAfter = await readActiveManaInTransaction(tx, data.targetCharacterId);
    assert.equal(manaAfter.pools.find(({ system }) => system === "Spellcraft")?.currentMana, spellcraft.currentMana - manaSpend);

    await addEncounterConditionInTransaction(tx, data.context, data.godId, {
      targetCharacterId: data.targetCharacterId,
      name: "Build 8 Verified",
      description: "Rollback-only same-state proof.",
      duration: { kind: "scene", value: null },
    });
    const effects = await readActiveEffectsInTransaction(tx, data.targetCharacterId, false);
    assert.ok(effects.conditions.some(({ name }) => name === "Build 8 Verified"));

    const [chargedItem] = await tx.insert(item).values({
      canonicalId: `BUILD8-CHARGED-${data.suffix}`.toUpperCase(),
      name: "Build 8 Charged Token",
      catalogScope: "equipment",
      equipmentGroup: "general",
      recordType: "runtime-test",
      family: "Build 8",
      category: "Runtime Test",
      priceBasis: "item",
      isMagical: true,
      createdByUserId: data.godId,
    }).returning({ id: item.id });
    assert.ok(chargedItem);
    await tx.insert(itemRuntimeProfile).values({
      itemId: chargedItem.id,
      useMode: "charges",
      maximumCharges: 3,
      chargesPerUse: 1,
      activationLabel: "Invoke",
    });
    await tx.insert(itemEffect).values({
      itemId: chargedItem.id,
      schemaVersion: 2,
      effectJson: { kind: "manual", title: "Build 8 audit", description: "No automatic consequence." },
      sortOrder: 0,
    });
    await tx.insert(campaignInventoryItem).values({
      campaignId: data.campaignId,
      itemId: chargedItem.id,
      sortOrder: 0,
    });
    const [ownedInstance] = await tx.insert(campaignCharacterItemInstance).values({
      characterId: data.targetCharacterId,
      itemId: chargedItem.id,
      currentCharges: 3,
      equipmentState: "inactive",
      unitCostCredits: 0,
    }).returning({ id: campaignCharacterItemInstance.id });
    assert.ok(ownedInstance);
    await executeImmediateEncounterItemInTransaction(tx, data.context, data.godId, {
      sourceCharacterId: data.targetCharacterId,
      targetCharacterId: data.targetCharacterId,
      itemId: chargedItem.id,
      itemInstanceId: ownedInstance.id,
      effectSelections: {},
    });
    const chargeState = await readItemChargeStateInTransaction(tx, {
      characterId: data.targetCharacterId,
      itemId: chargedItem.id,
      instanceId: ownedInstance.id,
    });
    assert.equal(chargeState.currentCharges, 2);
    await setEncounterEquipmentStateInTransaction(tx, data.context, {
      kind: "instance",
      targetCharacterId: data.targetCharacterId,
      instanceId: ownedInstance.id,
      state: "wielded",
    });
    const equipment = await readCharacterEquipmentStateInTransaction(tx, data.targetCharacterId);
    assert.equal(equipment.instances.find(({ instanceId }) => instanceId === ownedInstance.id)?.state, "wielded");
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

test("Creature spawn can explicitly late-enroll without moving the shared timeline", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await fixture(tx, "Enroll");
    await addInitiative(tx, data, 20);
    await tx.insert(campaignSessionEncounterInitiativeParticipant).values({
      encounterId: data.encounterId,
      sceneId: data.sceneId,
      sessionId: data.sessionId,
      campaignId: data.campaignId,
      characterId: data.targetCharacterId,
      normalTotalInitiative: 20,
      currentInitiative: 20,
      movementMode: "Land",
    });
    const result = await spawnEncounterCreaturesInTransaction(tx, data.context, data.godId, {
      creatureId: data.masterCreatureId,
      quantity: 2,
      joinInitiative: true,
      movementMode: "Land",
    });
    const [runtime] = await tx.select().from(campaignSessionEncounterInitiative)
      .where(eq(campaignSessionEncounterInitiative.encounterId, data.encounterId));
    assert.equal(runtime?.timelineInitiative, 20);
    const joined = await tx.select().from(campaignSessionEncounterInitiativeParticipant)
      .where(inArray(campaignSessionEncounterInitiativeParticipant.characterId, result.created.map(({ characterId }) => characterId)));
    assert.equal(joined.length, 2);
    assert.ok(joined.every((entry) => entry.currentInitiative === entry.normalTotalInitiative));
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

test("authored Creature attacks defer damage, reconcile Dodge, preserve history, and reject double resolution", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await fixture(tx, "Timing");
    await addInitiative(tx, data, 30);
    const spawned = await spawnEncounterCreaturesInTransaction(tx, data.context, data.godId, {
      creatureId: data.masterCreatureId,
      quantity: 1,
      joinInitiative: false,
    });
    const attackerId = spawned.created[0]!.characterId;
    await tx.insert(campaignSessionEncounterInitiativeParticipant).values([
      {
        encounterId: data.encounterId, sceneId: data.sceneId, sessionId: data.sessionId,
        campaignId: data.campaignId, characterId: attackerId,
        normalTotalInitiative: 30, currentInitiative: 30, movementMode: "Land",
      },
      {
        encounterId: data.encounterId, sceneId: data.sceneId, sessionId: data.sessionId,
        campaignId: data.campaignId, characterId: data.targetCharacterId,
        normalTotalInitiative: 29, currentInitiative: 29, movementMode: "Land",
      },
    ]);
    const before = await readActiveHealthInTransaction(tx, data.targetCharacterId, "race");
    const poolKey = before.anatomy.pools[0]!.key;

    const dodgedAction = await startCreatureAttackInTransaction(tx, data.context, {
      sourceCharacterId: attackerId,
      targetCharacterId: data.targetCharacterId,
      attackCanonicalId: data.attackCanonicalId,
    });
    assert.equal((await readActiveHealthInTransaction(tx, data.targetCharacterId, "race")).view.totalDamage, 0);
    const reaction = await declareEncounterReactionInTransaction(tx, data.context, {
      pendingActionId: dodgedAction.pendingActionId,
      reactorCharacterId: data.targetCharacterId,
      reactionType: "dodge",
    });
    assert.equal(reaction.committedInitiativeCost, 1);
    const dodgeResult = await resolveEncounterReactionInTransaction(tx, data.context, reaction.id, true);
    assert.equal(dodgeResult.attackPrevented, true);
    const [timelineAfterDodge] = await tx.select().from(campaignSessionEncounterInitiative)
      .where(eq(campaignSessionEncounterInitiative.encounterId, data.encounterId));
    assert.equal(timelineAfterDodge?.timelineInitiative, 30);
    await tx.update(campaignSessionEncounterPendingAction).set({
      status: "completed", initiativeSpent: 2, remainingInitiativeCost: 0, completedRound: 1,
    }).where(eq(campaignSessionEncounterPendingAction.id, dodgedAction.pendingActionId));
    await tx.update(campaignSessionEncounterInitiativeParticipant).set({ currentInitiative: 28 })
      .where(and(
        eq(campaignSessionEncounterInitiativeParticipant.encounterId, data.encounterId),
        eq(campaignSessionEncounterInitiativeParticipant.characterId, attackerId),
      ));
    await tx.update(campaignSessionEncounterInitiative).set({ timelineInitiative: 28, stepNumber: 2 })
      .where(eq(campaignSessionEncounterInitiative.encounterId, data.encounterId));
    await assert.rejects(resolveAuthoredActionInTransaction(tx, data.context, dodgedAction.id, data.godId, {
      outcome: "hit", finalDamage: 4, poolKey,
    }), /already prevented/);
    await resolveAuthoredActionInTransaction(tx, data.context, dodgedAction.id, data.godId, { outcome: "dodged" });

    const damageAction = await startCreatureAttackInTransaction(tx, data.context, {
      sourceCharacterId: attackerId,
      targetCharacterId: data.targetCharacterId,
      attackCanonicalId: data.attackCanonicalId,
    });
    assert.equal((await readActiveHealthInTransaction(tx, data.targetCharacterId, "race")).view.totalDamage, 0);
    await tx.update(campaignSessionEncounterPendingAction).set({
      status: "completed", initiativeSpent: 2, remainingInitiativeCost: 0, completedRound: 1,
    }).where(eq(campaignSessionEncounterPendingAction.id, damageAction.pendingActionId));
    await tx.update(campaignSessionEncounterInitiativeParticipant).set({ currentInitiative: 26 })
      .where(and(
        eq(campaignSessionEncounterInitiativeParticipant.encounterId, data.encounterId),
        eq(campaignSessionEncounterInitiativeParticipant.characterId, attackerId),
      ));
    await tx.update(campaignSessionEncounterInitiative).set({ timelineInitiative: 26, stepNumber: 3 })
      .where(eq(campaignSessionEncounterInitiative.encounterId, data.encounterId));
    await resolveAuthoredActionInTransaction(tx, data.context, damageAction.id, data.godId, {
      outcome: "hit", finalDamage: 4, poolKey,
    });
    assert.equal((await readActiveHealthInTransaction(tx, data.targetCharacterId, "race")).view.totalDamage, 4);
    await assert.rejects(resolveAuthoredActionInTransaction(tx, data.context, damageAction.id, data.godId, {
      outcome: "hit", finalDamage: 4, poolKey,
    }), /already been resolved or cancelled/);
    assert.equal((await readActiveHealthInTransaction(tx, data.targetCharacterId, "race")).view.totalDamage, 4);

    const combatAid = await readCombatAidEncounterInTransaction(tx, data.encounterId, data.godId);
    assert.equal(combatAid.authoredActions.length, 2);
    assert.equal(combatAid.reactions.length, 1);
    assert.ok(combatAid.authoredActions.every(({ resolutionStatus }) => resolutionStatus === "resolved"));

    const [outsider] = await tx.insert(campaignCharacter).values({
      campaignId: data.campaignId,
      playerUserId: data.godId,
      name: `Outside Encounter ${data.suffix}`,
      isNpc: true,
    }).returning({ id: campaignCharacter.id });
    assert.ok(outsider);
    await assert.rejects(startCreatureAttackInTransaction(tx, data.context, {
      sourceCharacterId: attackerId,
      targetCharacterId: outsider.id,
      attackCanonicalId: data.attackCanonicalId,
    }), /current Encounter Participants/);
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

test("a mid-batch Creature constructor failure rolls back every spawned NPC and membership", async () => {
  const marker = crypto.randomUUID();
  const functionName = `build8_fail_${marker.replaceAll("-", "")}`;
  const label = `Rollback${marker.slice(0, 8)}`;
  await assert.rejects(db.transaction(async (tx) => {
    const data = await fixture(tx, label);
    await tx.execute(sql.raw(`
      create function ${functionName}() returns trigger language plpgsql as $$
      begin
        if new.name like '${label} Beast 2%' then raise exception 'BUILD8_INTENTIONAL_BATCH_FAILURE'; end if;
        return new;
      end $$
    `));
    await tx.execute(sql.raw(`
      create trigger ${functionName}_trigger before insert on campaign_character
      for each row execute function ${functionName}();
    `));
    await spawnEncounterCreaturesInTransaction(tx, data.context, data.godId, {
      creatureId: data.masterCreatureId,
      quantity: 3,
      joinInitiative: false,
    });
  }), (error: unknown) => {
    const cause = typeof error === "object" && error !== null && "cause" in error
      ? (error as { cause?: unknown }).cause
      : null;
    return cause instanceof Error && /BUILD8_INTENTIONAL_BATCH_FAILURE/.test(cause.message);
  });
  const [remaining] = await db.select({ value: count() }).from(campaignCharacter)
    .where(like(campaignCharacter.name, `${label} Beast %`));
  assert.equal(Number(remaining?.value ?? 0), 0);
});
