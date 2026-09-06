import assert from "node:assert/strict";
import test, { after } from "node:test";

import { eq } from "drizzle-orm";

import { db, pool } from "@/db";
import {
  campaignSessionEncounterActionDeclaration,
  campaignSessionEncounterResponderOpportunity,
  campaignSessionRoll,
} from "@/db/tabletop-operations-schema";
import type { ActionDeclarationDraft } from "@/features/tabletop-operations/action-declaration";
import {
  commitActionDeclarationInTransaction,
  createActionDeclarationDraftInTransaction,
  lockActionDeclarationInTransaction,
  reconcileResponderOpportunityInTransaction,
} from "@/features/tabletop-operations/action-declaration-service";
import {
  declareDefenseInterventionInTransaction,
  recordDeclaredAttackRollInTransaction,
  recordDeclaredResponseRollInTransaction,
  resolveDeclaredDefensesAfterResponseIfReadyInTransaction,
  resolveDeclaredDefensesIfReadyInTransaction,
} from "@/features/tabletop-operations/defense-intervention-service";
import { lockOwnedEncounterRuntimeInTransaction } from "@/features/tabletop-operations/runtime-integration-service";

import { insertBuildTenFixture } from "./tabletop-build-ten-db-fixture";

if (process.env.SERRIAN_DISPOSABLE_COMBAT_PASS_ONE !== "true") {
  throw new Error("This concurrency rehearsal may run only inside the disposable Pass 1 PostgreSQL harness.");
}

function draft(actorCharacterId: number, targetCharacterId: number): ActionDeclarationDraft {
  return {
    actorCharacterId,
    targetCharacterIds: [targetCharacterId],
    label: "Concurrent Pass 1 attack",
    actionKind: "generic-attack",
    sourceKind: "generic",
    sourceRef: null,
    sourceInstanceId: null,
    weaponItemId: null,
    firingModeId: null,
    attackMode: "",
    initiativeCost: 2,
    allowsMultiRound: false,
    heldIntervention: false,
    windowKind: "melee-overlap",
    aimDeclared: false,
    calledShot: { declared: false, label: "", assignedPenalty: null },
    explicitModifiers: [],
    preparesForDeclarationId: null,
    godNotes: "Disposable concurrency fixture.",
  };
}

test("attack-first input survives, concurrent retries reuse one Roll, and the later defense resolves once", async () => {
  const setup = await db.transaction(async (tx) => {
    const base = await insertBuildTenFixture(tx, "pass-one-concurrency");
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, base.encounterId, base.godId);
    const god = { authority: "god-owner" as const, userId: base.godId };
    const player = { authority: "player" as const, userId: base.godId, characterId: base.heroId };
    const declarationId = await createActionDeclarationDraftInTransaction(tx, context, player, draft(base.heroId, base.defenderId));
    await lockActionDeclarationInTransaction(tx, context, player, declarationId);
    const pendingActionId = await commitActionDeclarationInTransaction(tx, context, player, declarationId);
    const [opportunity] = await tx.select().from(campaignSessionEncounterResponderOpportunity)
      .where(eq(campaignSessionEncounterResponderOpportunity.declarationId, declarationId));
    assert.ok(opportunity);
    await reconcileResponderOpportunityInTransaction(tx, context, god, opportunity.id, { decision: "allow" });
    const reactionId = await declareDefenseInterventionInTransaction(tx, context, god, {
      opportunityId: opportunity.id,
      reactionType: "intervention",
      protectedTargetCharacterId: base.defenderId,
      sourceKind: "manual",
      manualLabel: "Concurrent response",
      manualTarget: 40,
      initiativeCost: 1,
      rollRequired: true,
      intendedMechanicalPurpose: "Oppose the attack.",
      godApprovalReason: "Exact disposable test positioning.",
    });
    return { ...base, declarationId, pendingActionId, reactionId };
  });
  const rollInput = { method: "entered" as const, enteredTotal: 64, manualTarget: 30, manualLabel: "Concurrent attack target" };
  const first = await db.transaction(async (tx) => {
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, setup.encounterId, setup.godId);
    const god = { authority: "god-owner" as const, userId: setup.godId };
    const roll = await recordDeclaredAttackRollInTransaction(tx, context, god, setup.declarationId, rollInput);
    assert.equal(await resolveDeclaredDefensesIfReadyInTransaction(tx, context, god, setup.declarationId), null);
    return roll;
  });
  const concurrent = await Promise.all([1, 2].map(() => db.transaction(async (tx) => {
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, setup.encounterId, setup.godId);
    return recordDeclaredAttackRollInTransaction(tx, context, { authority: "god-owner", userId: setup.godId }, setup.declarationId, rollInput);
  })));
  assert.deepEqual(concurrent.map(({ id }) => id), [first.id, first.id]);
  assert.equal((await db.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.pendingActionId, setup.pendingActionId))).length, 1);

  await db.transaction(async (tx) => {
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, setup.encounterId, setup.godId);
    const god = { authority: "god-owner" as const, userId: setup.godId };
    await recordDeclaredResponseRollInTransaction(tx, context, god, setup.reactionId, { method: "entered", enteredTotal: 55 });
    const result = await resolveDeclaredDefensesAfterResponseIfReadyInTransaction(tx, context, god, setup.reactionId);
    assert.equal(result?.status, "awaiting-god-ruling");
  });
  const [resolved] = await db.select().from(campaignSessionEncounterActionDeclaration)
    .where(eq(campaignSessionEncounterActionDeclaration.id, setup.declarationId));
  assert.ok(resolved?.defenseResolutionJson);
});

after(async () => pool.end());
