import assert from "node:assert/strict";
import { after, test } from "node:test";

import { and, eq } from "drizzle-orm";

import { db, pool } from "@/db";
import { campaignCharacterActiveHealth } from "@/db/realm-schema";
import {
  campaignSessionEncounterActionDeclaration,
  campaignSessionEncounterInitiativeParticipant,
  campaignSessionEncounterReaction,
  campaignSessionEncounterReactionEvent,
  campaignSessionEncounterResponderOpportunity,
} from "@/db/tabletop-operations-schema";
import type { ActionDeclarationDraft } from "@/features/tabletop-operations/action-declaration";
import {
  commitActionDeclarationInTransaction,
  createActionDeclarationDraftInTransaction,
  lockActionDeclarationInTransaction,
  readActionDeclarationWorkspaceInTransaction,
  reconcileResponderOpportunityInTransaction,
} from "@/features/tabletop-operations/action-declaration-service";
import {
  declareDefenseInterventionInTransaction,
  recordDeclaredAttackRollInTransaction,
  recordDeclaredResponseRollInTransaction,
  resolveDeclaredDefensesIfReadyInTransaction,
  resolveDeclaredDefensesInTransaction,
} from "@/features/tabletop-operations/defense-intervention-service";
import { lockOwnedEncounterRuntimeInTransaction } from "@/features/tabletop-operations/runtime-integration-service";

import { insertBuildTenFixture } from "./tabletop-build-ten-db-fixture";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for defense/intervention validation.");
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
  throw new Error(`Refusing defense/intervention tests against non-local host ${databaseUrl.hostname}.`);
}
if (!databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error(`Refusing defense/intervention tests against non-development database ${databaseUrl.pathname.slice(1)}.`);
}

const ROLLBACK = new Error("ROLLBACK_DEFENSE_INTERVENTION_TEST");

function draft(actorCharacterId: number, targetCharacterId: number): ActionDeclarationDraft {
  return {
    actorCharacterId,
    targetCharacterIds: [targetCharacterId],
    label: "Pass 7 opposed action",
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
    godNotes: "Pass 7 DB isolation fixture.",
  };
}

after(async () => {
  await pool.end();
});

test("guarded Pass 7 declarations are atomic, authorized, immutable, auditable, and non-automating", async () => {
  const ledgerBefore = await pool.query<{ count: number }>("select count(*)::int count from drizzle.__drizzle_migrations");
  assert.equal(ledgerBefore.rows[0]?.count, 41);

  await assert.rejects(db.transaction(async (tx) => {
    const base = await insertBuildTenFixture(tx, "defense-intervention");
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, base.encounterId, base.godId);
    const god = { authority: "god-owner" as const, userId: base.godId };
    const player = { authority: "player" as const, userId: base.godId, characterId: base.heroId };
    const startingHealth = await tx.select().from(campaignCharacterActiveHealth)
      .where(eq(campaignCharacterActiveHealth.characterId, base.defenderId));

    const declarationId = await createActionDeclarationDraftInTransaction(tx, context, player, draft(base.heroId, base.defenderId));
    await lockActionDeclarationInTransaction(tx, context, player, declarationId);
    const pendingActionId = await commitActionDeclarationInTransaction(tx, context, player, declarationId);
    const [opportunity] = await tx.select().from(campaignSessionEncounterResponderOpportunity)
      .where(eq(campaignSessionEncounterResponderOpportunity.declarationId, declarationId));
    assert.ok(opportunity);

    const defenderBefore = (await tx.select({ current: campaignSessionEncounterInitiativeParticipant.currentInitiative })
      .from(campaignSessionEncounterInitiativeParticipant).where(and(
        eq(campaignSessionEncounterInitiativeParticipant.encounterId, base.encounterId),
        eq(campaignSessionEncounterInitiativeParticipant.characterId, base.defenderId),
      )))[0]!.current;
    await assert.rejects(declareDefenseInterventionInTransaction(tx, context, god, {
      opportunityId: opportunity.id,
      reactionType: "no-reaction",
      protectedTargetCharacterId: base.defenderId,
    }), /must first confirm/);
    await reconcileResponderOpportunityInTransaction(tx, context, god, opportunity.id, { decision: "allow" });
    await assert.rejects(declareDefenseInterventionInTransaction(tx, context, player, {
      opportunityId: opportunity.id,
      reactionType: "no-reaction",
      protectedTargetCharacterId: base.defenderId,
    }), /own authorized Character/);
    assert.equal((await tx.select({ current: campaignSessionEncounterInitiativeParticipant.currentInitiative })
      .from(campaignSessionEncounterInitiativeParticipant).where(and(
        eq(campaignSessionEncounterInitiativeParticipant.encounterId, base.encounterId),
        eq(campaignSessionEncounterInitiativeParticipant.characterId, base.defenderId),
      )))[0]!.current, defenderBefore);

    const reactionId = await declareDefenseInterventionInTransaction(tx, context, god, {
      opportunityId: opportunity.id,
      reactionType: "intervention",
      protectedTargetCharacterId: base.defenderId,
      sourceKind: "manual",
      manualLabel: "Pass 1 independent defense",
      manualTarget: 40,
      initiativeCost: 1,
      rollRequired: true,
      intendedMechanicalPurpose: "Oppose the declared action.",
      godApprovalReason: "The responder has a legitimate line of effect.",
    });
    const [reaction] = await tx.select().from(campaignSessionEncounterReaction).where(eq(campaignSessionEncounterReaction.id, reactionId));
    assert.equal(reaction?.status, "declared");
    assert.equal(reaction?.committedInitiativeCost, 1);
    assert.equal(reaction?.rollRequired, true);
    assert.ok(reaction?.declarationSnapshotJson);
    assert.equal((await tx.select().from(campaignSessionEncounterReactionEvent).where(eq(campaignSessionEncounterReactionEvent.reactionId, reactionId))).length, 1);
    assert.equal((await tx.select().from(campaignSessionEncounterResponderOpportunity).where(eq(campaignSessionEncounterResponderOpportunity.id, opportunity.id)))[0]?.status, "response-declared");

    await assert.rejects(declareDefenseInterventionInTransaction(tx, context, god, {
      opportunityId: opportunity.id,
      reactionType: "dodge",
      protectedTargetCharacterId: base.defenderId,
    }), /pending responder opportunity/);

    const defenseRoll = await recordDeclaredResponseRollInTransaction(tx, context, god, reactionId, { method: "entered", enteredTotal: 55 });
    assert.equal(defenseRoll.reactionId, reactionId);
    assert.equal(await resolveDeclaredDefensesIfReadyInTransaction(tx, context, god, declarationId), null);
    const defenseRetry = await recordDeclaredResponseRollInTransaction(tx, context, god, reactionId, { method: "entered", enteredTotal: 55 });
    assert.equal(defenseRetry.id, defenseRoll.id);
    await assert.rejects(recordDeclaredResponseRollInTransaction(tx, context, god, reactionId, { method: "entered", enteredTotal: 56 }), /different immutable history/);

    const attackRoll = await recordDeclaredAttackRollInTransaction(tx, context, god, declarationId, {
      method: "entered",
      enteredTotal: 65,
      manualTarget: 50,
      manualLabel: "Pass 7 explicit test target",
    });
    assert.equal(attackRoll.pendingActionId, pendingActionId);
    assert.equal(attackRoll.mechanicalSnapshot?.resolution.resultTotal, 65);
    const attackRetry = await recordDeclaredAttackRollInTransaction(tx, context, god, declarationId, {
      method: "entered",
      enteredTotal: 65,
      manualTarget: 50,
      manualLabel: "Pass 7 explicit test target",
    });
    assert.equal(attackRetry.id, attackRoll.id);
    const outcome = await resolveDeclaredDefensesIfReadyInTransaction(tx, context, god, declarationId);
    assert.ok(outcome);
    assert.equal(outcome.status, "awaiting-god-ruling");
    const idempotentOutcome = await resolveDeclaredDefensesInTransaction(tx, context, god, declarationId);
    assert.deepEqual(idempotentOutcome, outcome);
    const [resolvedDeclaration] = await tx.select().from(campaignSessionEncounterActionDeclaration)
      .where(eq(campaignSessionEncounterActionDeclaration.id, declarationId));
    assert.ok(resolvedDeclaration?.defenseResolutionJson);
    const godView = await readActionDeclarationWorkspaceInTransaction(tx, context, god);
    assert.equal(godView.declarations.find(({ id }) => id === declarationId)?.rollState.resolved, true);
    assert.deepEqual(await tx.select().from(campaignCharacterActiveHealth)
      .where(eq(campaignCharacterActiveHealth.characterId, base.defenderId)), startingHealth);

    await assert.rejects(declareDefenseInterventionInTransaction(tx, context, {
      authority: "god-owner",
      userId: `${base.godId}-forged`,
    }, {
      opportunityId: opportunity.id + 999_999,
      reactionType: "no-reaction",
      protectedTargetCharacterId: base.defenderId,
    }), /pending responder opportunity|Campaign-owning G\.O\.D/);

    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});
