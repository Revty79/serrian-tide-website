import assert from "node:assert/strict";
import { after, test } from "node:test";

import { and, desc, eq } from "drizzle-orm";

import { db, pool } from "@/db";
import { creature } from "@/db/creature-schema";
import { item, itemEffect, itemRuntimeProfile } from "@/db/item-schema";
import { skill } from "@/db/skill-schema";
import {
  campaignCharacterActiveCondition,
  campaignCharacterActiveMana,
  campaignCharacterActiveModifier,
  campaignCharacterItem,
  campaignCharacterItemInstance,
  campaignCharacterProfile,
  campaignCharacterSkillAllocation,
} from "@/db/realm-schema";
import {
  campaignSessionEncounterEffect,
  campaignSessionEncounterEffectPlan,
  campaignSessionEncounterEffectPlanEvent,
  campaignSessionEncounterInitiativeParticipant,
  campaignSessionEncounterParticipant,
  campaignSessionEncounterResponderOpportunity,
} from "@/db/tabletop-operations-schema";
import type { ActionDeclarationDraft } from "@/features/tabletop-operations/action-declaration";
import {
  cancelActionDeclarationInTransaction,
  commitActionDeclarationInTransaction,
  completeActionDeclarationTimingInTransaction,
  createActionDeclarationDraftInTransaction,
  lockActionDeclarationInTransaction,
  reconcileResponderOpportunityInTransaction,
} from "@/features/tabletop-operations/action-declaration-service";
import {
  addManualActionEffectInTransaction,
  amendActionEffectAmountInTransaction,
  applyActionEffectPlanInTransaction,
  approveActionEffectPlanInTransaction,
  declineActionEffectInTransaction,
  generateActionEffectPlanInTransaction,
} from "@/features/tabletop-operations/action-effect-plan-service";
import { spawnEncounterCreaturesInTransaction } from "@/features/tabletop-operations/creature-spawn-service";
import { lockOwnedEncounterRuntimeInTransaction } from "@/features/tabletop-operations/runtime-integration-service";

import { insertBuildTenFixture } from "./tabletop-build-ten-db-fixture";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for Action Effect Bridge validation.");
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
  throw new Error(`Refusing Action Effect Bridge tests against non-local host ${databaseUrl.hostname}.`);
}
if (!databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error(`Refusing Action Effect Bridge tests against non-development database ${databaseUrl.pathname.slice(1)}.`);
}

const ROLLBACK = new Error("ROLLBACK_ACTION_EFFECT_BRIDGE_TEST");

after(async () => {
  await pool.end();
});

function itemDraft(actorCharacterId: number, targetParticipantId: number, itemId: number, label: string, instanceId: number | null = null): ActionDeclarationDraft {
  return {
    actorCharacterId,
    targetCharacterIds: [targetParticipantId],
    label,
    actionKind: "item-use",
    sourceKind: "item",
    sourceRef: `item:${itemId}`,
    sourceInstanceId: instanceId,
    sourcePayload: {},
    weaponItemId: null,
    firingModeId: null,
    attackMode: "",
    initiativeCost: 1,
    allowsMultiRound: true,
    heldIntervention: false,
    windowKind: "ordinary",
    aimDeclared: false,
    calledShot: { declared: false, label: "", assignedPenalty: null },
    explicitModifiers: [],
    preparesForDeclarationId: null,
    godNotes: "Pass 8 exact Item source fixture.",
  };
}

test("guarded Pass 8 plans freeze sources and apply Character or direct-Creature effects atomically once", async () => {
  const ledger = await pool.query<{ count: number }>("select count(*)::int count from drizzle.__drizzle_migrations");
  assert.equal(ledger.rows[0]?.count, 29);

  await assert.rejects(db.transaction(async (tx) => {
    const base = await insertBuildTenFixture(tx, "action-effect-bridge");
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, base.encounterId, base.godId);
    const god = { authority: "god-owner" as const, userId: base.godId };
    const suffix = crypto.randomUUID();
    const [authoredItem] = await tx.insert(item).values({
      canonicalId: `ITEM-PASS8-${suffix}`.toUpperCase(),
      name: "Pass 8 Field Effect",
      catalogScope: "equipment",
      equipmentGroup: "general",
      recordType: "General Equipment",
      family: "Pass 8",
      category: "Test",
      priceBasis: "unit",
      createdByUserId: base.godId,
    }).returning({ id: item.id });
    assert.ok(authoredItem);
    await tx.insert(itemRuntimeProfile).values({ itemId: authoredItem.id, useMode: "consume-item", quantityPerUse: 1, activationLabel: "Activate" });
    await tx.insert(itemEffect).values([
      {
        itemId: authoredItem.id,
        schemaVersion: 2,
        effectJson: { kind: "condition.apply", name: "Pass 8 Mark", description: "Exact authored Condition.", duration: { kind: "scene" } },
        sortOrder: 0,
      },
      {
        itemId: authoredItem.id,
        schemaVersion: 2,
        effectJson: { kind: "modifier.apply", label: "Pass 8 Guard", channel: "soak", targetKey: "self", amount: 3, duration: { kind: "scene" } },
        sortOrder: 1,
      },
      {
        itemId: authoredItem.id,
        schemaVersion: 2,
        effectJson: { kind: "condition.apply", name: "Declined Pass 8 Mark", description: "This proposal will be explicitly declined.", duration: { kind: "scene" } },
        sortOrder: 2,
      },
    ]);
    await tx.insert(campaignCharacterItem).values({ characterId: base.heroId, itemId: authoredItem.id, quantity: 2, unitCostCredits: 0 });
    const [chargedItem] = await tx.insert(item).values({
      canonicalId: `ITEM-PASS8-CHARGED-${suffix}`.toUpperCase(),
      name: "Pass 8 Exact Charged Item",
      catalogScope: "equipment",
      equipmentGroup: "general",
      recordType: "General Equipment",
      family: "Pass 8",
      category: "Test",
      priceBasis: "unit",
      createdByUserId: base.godId,
    }).returning({ id: item.id });
    assert.ok(chargedItem);
    await tx.insert(itemRuntimeProfile).values({
      itemId: chargedItem.id,
      useMode: "charges",
      maximumCharges: 3,
      chargesPerUse: 1,
      activationLabel: "Discharge",
    });
    const [chargedInstance] = await tx.insert(campaignCharacterItemInstance).values({
      characterId: base.heroId,
      itemId: chargedItem.id,
      currentCharges: 3,
      unitCostCredits: 0,
    }).returning({ id: campaignCharacterItemInstance.id });
    assert.ok(chargedInstance);
    const magicSkills = await tx.select({ id: skill.id, name: skill.name }).from(skill);
    const spellcraft = magicSkills.find(({ name }) => name === "Spellcraft");
    const channeling = magicSkills.find(({ name }) => name === "Channeling");
    assert.ok(spellcraft && channeling);
    await tx.update(campaignCharacterProfile).set({ baseMagicSteps: 1 }).where(eq(campaignCharacterProfile.characterId, base.heroId));
    await tx.insert(campaignCharacterSkillAllocation).values([
      { characterId: base.heroId, skillId: spellcraft.id, points: 2 },
      { characterId: base.heroId, skillId: channeling.id, points: 2 },
    ]);

    const [masterCreature] = await tx.insert(creature).values({
      canonicalId: `CREATURE-PASS8-${suffix}`.toUpperCase(),
      canonicalName: "Pass 8 Occurrence",
      size: "Medium",
      totalHp: 20,
      createdByUserId: base.godId,
    }).returning({ id: creature.id, canonicalName: creature.canonicalName });
    assert.ok(masterCreature);
    const spawned = await spawnEncounterCreaturesInTransaction(tx, context, base.godId, {
      creatureId: masterCreature.id,
      quantity: 2,
      joinInitiative: false,
    });
    const firstOccurrence = spawned.created[0]!.runtimeParticipantKey;
    const secondOccurrence = spawned.created[1]!.runtimeParticipantKey;

    async function preparePlan(
      targetParticipantId: number,
      label: string,
      afterLock?: () => Promise<void>,
      sourceItemId = authoredItem.id,
      sourceInstanceId: number | null = null,
    ): Promise<number> {
      const declarationId = await createActionDeclarationDraftInTransaction(
        tx,
        context,
        god,
        itemDraft(base.heroId, targetParticipantId, sourceItemId, label, sourceInstanceId),
      );
      await lockActionDeclarationInTransaction(tx, context, god, declarationId);
      if (afterLock) await afterLock();
      await commitActionDeclarationInTransaction(tx, context, god, declarationId);
      const opportunities = await tx.select().from(campaignSessionEncounterResponderOpportunity)
        .where(eq(campaignSessionEncounterResponderOpportunity.declarationId, declarationId));
      for (const opportunity of opportunities) {
        await reconcileResponderOpportunityInTransaction(tx, context, god, opportunity.id, {
          status: "declined",
          reason: "Pass 8 database fixture declines the response window.",
        });
      }
      await completeActionDeclarationTimingInTransaction(tx, context, god, declarationId, "Pass 8 fixture reaches the established application boundary.");
      return generateActionEffectPlanInTransaction(tx, context, god, declarationId);
    }

    const characterPlanId = await preparePlan(base.defenderId, "Character effect plan", async () => {
      await tx.update(item).set({ name: "Pass 8 Canonical Name Changed" }).where(eq(item.id, authoredItem.id));
    });
    const duplicatePlanId = await generateActionEffectPlanInTransaction(tx, context, god, (
      await tx.select({ declarationId: campaignSessionEncounterEffectPlan.declarationId })
        .from(campaignSessionEncounterEffectPlan)
        .where(eq(campaignSessionEncounterEffectPlan.id, characterPlanId))
    )[0]!.declarationId);
    assert.equal(duplicatePlanId, characterPlanId);
    assert.equal((await tx.select().from(campaignCharacterActiveCondition).where(eq(campaignCharacterActiveCondition.characterId, base.defenderId))).length, 0);
    assert.equal((await tx.select().from(campaignCharacterActiveModifier).where(eq(campaignCharacterActiveModifier.characterId, base.defenderId))).length, 0);

    const [frozenPlan] = await tx.select().from(campaignSessionEncounterEffectPlan).where(eq(campaignSessionEncounterEffectPlan.id, characterPlanId));
    assert.equal((frozenPlan?.sourceSnapshotJson as { displayName?: string }).displayName, "Pass 8 Field Effect — Activate");
    assert.equal((frozenPlan?.sourceDivergenceJson as { status?: string }).status, "changed");
    await assert.rejects(addManualActionEffectInTransaction(
      tx,
      context,
      god,
      characterPlanId,
      base.heroId,
      "Injected retarget attempt.",
      "This target was not locked by the declaration.",
    ), /exact locked targets/);

    const cancelledPlanId = await preparePlan(base.defenderId, "Cancelled consequence stage");
    const [cancelledPlanBefore] = await tx.select({ declarationId: campaignSessionEncounterEffectPlan.declarationId })
      .from(campaignSessionEncounterEffectPlan)
      .where(eq(campaignSessionEncounterEffectPlan.id, cancelledPlanId));
    assert.ok(cancelledPlanBefore);
    await cancelActionDeclarationInTransaction(
      tx,
      context,
      god,
      cancelledPlanBefore.declarationId,
      "The originating action was cancelled before any consequence applied.",
    );
    assert.equal((await tx.select({ status: campaignSessionEncounterEffectPlan.status })
      .from(campaignSessionEncounterEffectPlan)
      .where(eq(campaignSessionEncounterEffectPlan.id, cancelledPlanId)))[0]?.status, "cancelled");
    await createActionDeclarationDraftInTransaction(
      tx,
      context,
      god,
      itemDraft(base.heroId, base.defenderId, authoredItem.id, "Explicit replacement declaration"),
      cancelledPlanBefore.declarationId,
    );
    assert.equal((await tx.select({ status: campaignSessionEncounterEffectPlan.status })
      .from(campaignSessionEncounterEffectPlan)
      .where(eq(campaignSessionEncounterEffectPlan.id, cancelledPlanId)))[0]?.status, "superseded");

    const characterEffects = await tx.select().from(campaignSessionEncounterEffect)
      .where(eq(campaignSessionEncounterEffect.planId, characterPlanId));
    const modifier = characterEffects.find(({ effectType }) => effectType === "modifier.apply");
    const declinedCondition = characterEffects.find(({ authoredValueJson }) => (
      (authoredValueJson as { effect?: { name?: string } }).effect?.name === "Declined Pass 8 Mark"
    ));
    assert.ok(modifier);
    assert.ok(declinedCondition);
    await assert.rejects(amendActionEffectAmountInTransaction(tx, context, god, characterPlanId, modifier.id, 5, ""), /reason is required/);
    await amendActionEffectAmountInTransaction(tx, context, god, characterPlanId, modifier.id, 5, "Exact table ruling for the authored modifier.");
    const [amended] = await tx.select().from(campaignSessionEncounterEffect).where(eq(campaignSessionEncounterEffect.id, modifier.id));
    assert.equal(amended?.calculatedValueJson, 3);
    assert.equal(((amended?.authoredValueJson as { effect: { amount: number } }).effect.amount), 3);
    assert.equal(((amended?.finalValueJson as { effect: { amount: number } }).effect.amount), 5);
    await declineActionEffectInTransaction(tx, context, god, characterPlanId, declinedCondition.id, "This exact authored effect is not part of the table ruling.");
    await approveActionEffectPlanInTransaction(tx, context, god, characterPlanId, "Approved guarded fixture proposal.");

    const [validManaCost, invalidCost] = await tx.insert(campaignSessionEncounterEffect).values([{
      planId: characterPlanId,
      encounterId: context.encounterId,
      sceneId: context.sceneId,
      sessionId: context.sessionId,
      campaignId: context.campaignId,
      targetParticipantId: base.heroId,
      effectKey: "cost:mana-idempotency-proof",
      effectType: "resource.mana",
      sourceKind: "item",
      sourceIdentity: frozenPlan!.sourceIdentity,
      authoredValueJson: { amount: 0.25, resourceKey: "Spellcraft" },
      calculatedValueJson: 0.25,
      finalValueJson: { amount: 0.25, resourceKey: "Spellcraft" },
      unit: "Mana",
      resource: "Spellcraft",
      applicationSupported: true,
      status: "approved" as const,
    }, {
      planId: characterPlanId,
      encounterId: context.encounterId,
      sceneId: context.sceneId,
      sessionId: context.sessionId,
      campaignId: context.campaignId,
      targetParticipantId: base.heroId,
      effectKey: "cost:failure-proof",
      effectType: "resource.mana",
      sourceKind: "item",
      sourceIdentity: frozenPlan!.sourceIdentity,
      authoredValueJson: { amount: 1, resourceKey: "Invalid" },
      calculatedValueJson: 1,
      finalValueJson: { amount: 1, resourceKey: "Invalid" },
      unit: "Mana",
      resource: "Invalid",
      applicationSupported: true,
      status: "approved" as const,
    }]).returning({ id: campaignSessionEncounterEffect.id });
    assert.ok(validManaCost && invalidCost);
    assert.equal(await applyActionEffectPlanInTransaction(tx, context, god, characterPlanId), "application-failed");
    assert.equal((await tx.select().from(campaignCharacterActiveCondition).where(eq(campaignCharacterActiveCondition.characterId, base.defenderId))).length, 0);
    assert.equal((await tx.select().from(campaignCharacterActiveModifier).where(eq(campaignCharacterActiveModifier.characterId, base.defenderId))).length, 0);
    assert.equal((await tx.select().from(campaignCharacterActiveMana).where(eq(campaignCharacterActiveMana.characterId, base.heroId))).length, 0);
    assert.equal((await tx.select({ quantity: campaignCharacterItem.quantity }).from(campaignCharacterItem).where(and(
      eq(campaignCharacterItem.characterId, base.heroId),
      eq(campaignCharacterItem.itemId, authoredItem.id),
    )))[0]?.quantity, 2);

    await declineActionEffectInTransaction(tx, context, god, characterPlanId, invalidCost.id, "Malformed stored executor proof is explicitly declined.");
    const retryStatus = await applyActionEffectPlanInTransaction(tx, context, god, characterPlanId);
    if (retryStatus === "application-failed") {
      const [failure] = await tx.select({ reason: campaignSessionEncounterEffectPlanEvent.reason })
        .from(campaignSessionEncounterEffectPlanEvent)
        .where(and(
          eq(campaignSessionEncounterEffectPlanEvent.planId, characterPlanId),
          eq(campaignSessionEncounterEffectPlanEvent.eventKind, "effect-plan-application-failed"),
        )).orderBy(desc(campaignSessionEncounterEffectPlanEvent.id)).limit(1);
      throw new Error(`Unexpected retry failure: ${failure?.reason ?? "unknown"}`);
    }
    assert.equal(retryStatus, "applied");
    assert.equal(await applyActionEffectPlanInTransaction(tx, context, god, characterPlanId), "applied");
    const conditions = await tx.select().from(campaignCharacterActiveCondition).where(eq(campaignCharacterActiveCondition.characterId, base.defenderId));
    const modifiers = await tx.select().from(campaignCharacterActiveModifier).where(eq(campaignCharacterActiveModifier.characterId, base.defenderId));
    assert.equal(conditions.length, 1);
    assert.equal(modifiers.length, 1);
    assert.equal(modifiers[0]?.amount, 5);
    const [mana] = await tx.select().from(campaignCharacterActiveMana).where(and(
      eq(campaignCharacterActiveMana.characterId, base.heroId),
      eq(campaignCharacterActiveMana.system, "Spellcraft"),
    ));
    assert.equal(mana?.manaSpent, 0.25);
    assert.equal((await tx.select({ quantity: campaignCharacterItem.quantity }).from(campaignCharacterItem).where(and(
      eq(campaignCharacterItem.characterId, base.heroId),
      eq(campaignCharacterItem.itemId, authoredItem.id),
    )))[0]?.quantity, 1);

    const directPlanId = await preparePlan(firstOccurrence, "Direct Creature occurrence effect plan");
    await approveActionEffectPlanInTransaction(tx, context, god, directPlanId, "Apply only to the exact encounter occurrence.");
    assert.equal(await applyActionEffectPlanInTransaction(tx, context, god, directPlanId), "applied");
    assert.equal((await tx.select().from(campaignCharacterItem).where(and(
      eq(campaignCharacterItem.characterId, base.heroId),
      eq(campaignCharacterItem.itemId, authoredItem.id),
    ))).length, 0);

    const chargePlanId = await preparePlan(
      base.heroId,
      "Exact owned Item instance Charge plan",
      undefined,
      chargedItem.id,
      chargedInstance.id,
    );
    await approveActionEffectPlanInTransaction(tx, context, god, chargePlanId, "Apply the exact frozen Charge cost.");
    assert.equal(await applyActionEffectPlanInTransaction(tx, context, god, chargePlanId), "applied");
    assert.equal(await applyActionEffectPlanInTransaction(tx, context, god, chargePlanId), "applied");
    assert.equal((await tx.select({ charges: campaignCharacterItemInstance.currentCharges }).from(campaignCharacterItemInstance).where(
      eq(campaignCharacterItemInstance.id, chargedInstance.id),
    ))[0]?.charges, 2);
    const occurrenceRows = await tx.select({
      key: campaignSessionEncounterParticipant.characterId,
      localState: campaignSessionEncounterParticipant.localStateJson,
    }).from(campaignSessionEncounterParticipant).where(and(
      eq(campaignSessionEncounterParticipant.encounterId, context.encounterId),
      eq(campaignSessionEncounterParticipant.participantKind, "creature"),
    ));
    const firstState = occurrenceRows.find(({ key }) => key === firstOccurrence)?.localState as { conditions?: unknown[]; modifiers?: unknown[] };
    const secondState = occurrenceRows.find(({ key }) => key === secondOccurrence)?.localState as { conditions?: unknown[]; modifiers?: unknown[] };
    assert.equal(firstState.conditions?.length, 2);
    assert.equal(firstState.modifiers?.length, 1);
    assert.equal(secondState.conditions?.length ?? 0, 0);
    assert.equal(secondState.modifiers?.length ?? 0, 0);
    assert.equal((await tx.select().from(campaignCharacterActiveCondition).where(eq(campaignCharacterActiveCondition.characterId, firstOccurrence))).length, 0);
    assert.equal((await tx.select().from(campaignCharacterActiveModifier).where(eq(campaignCharacterActiveModifier.characterId, firstOccurrence))).length, 0);
    assert.equal((await tx.select({ name: creature.canonicalName }).from(creature).where(eq(creature.id, masterCreature.id)))[0]?.name, masterCreature.canonicalName);
    const [actorInitiative] = await tx.select({ current: campaignSessionEncounterInitiativeParticipant.currentInitiative })
      .from(campaignSessionEncounterInitiativeParticipant)
      .where(and(
        eq(campaignSessionEncounterInitiativeParticipant.encounterId, context.encounterId),
        eq(campaignSessionEncounterInitiativeParticipant.characterId, base.heroId),
      ));
    assert.ok(actorInitiative);
    assert.equal(Number.isFinite(actorInitiative.current), true);

    await assert.rejects(generateActionEffectPlanInTransaction(tx, context, {
      authority: "god-owner",
      userId: `${base.godId}-administrator-only`,
    }, 999_999), /Campaign-owning G\.O\.D/);

    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});
