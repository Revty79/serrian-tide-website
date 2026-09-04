import assert from "node:assert/strict";
import { after, test } from "node:test";

import { and, eq } from "drizzle-orm";

import { db, pool } from "@/db";
import { user } from "@/db/auth-schema";
import { campaignPlayer } from "@/db/campaign-schema";
import {
  campaignCharacterActiveHealth,
  campaignCharacterItem,
} from "@/db/realm-schema";
import {
  campaignSessionEncounterActionDeclaration,
  campaignSessionEncounterActionDeclarationEvent,
  campaignSessionEncounterInitiativeParticipant,
  campaignSessionEncounterParticipant,
  campaignSessionEncounterPendingAction,
  campaignSessionEncounterResponderOpportunity,
  campaignSessionRoll,
  campaignSessionSceneMember,
} from "@/db/tabletop-operations-schema";
import {
  abandonActionDeclarationInTransaction,
  addExceptionalResponderOpportunityInTransaction,
  cancelActionDeclarationInTransaction,
  commitActionDeclarationInTransaction,
  completeActionDeclarationTimingInTransaction,
  createActionDeclarationDraftInTransaction,
  editActionDeclarationDraftInTransaction,
  interruptActionDeclarationInTransaction,
  lockActionDeclarationInTransaction,
  readActionDeclarationWorkspaceInTransaction,
  reconcileResponderOpportunityInTransaction,
  recordLongActionRoundContinuationsInTransaction,
  resolveActionDeclarationInTransaction,
  resumeInterruptedActionDeclarationInTransaction,
  reviseLockedActionDeclarationInTransaction,
} from "@/features/tabletop-operations/action-declaration-service";
import type { ActionDeclarationDraft } from "@/features/tabletop-operations/action-declaration";
import {
  advanceInitiativeRound,
  advanceInitiativeTimeline,
  passInitiative,
} from "@/features/tabletop-operations/initiative-runtime";
import {
  lockEncounterCloseoutContextInTransaction,
  readEncounterCloseoutInTransaction,
} from "@/features/tabletop-operations/encounter-closeout-service";
import { recordRollInTransaction } from "@/features/tabletop-operations/roll-runtime-service";
import {
  loadInitiativeEngineInTransaction,
  lockOwnedEncounterRuntimeInTransaction,
  persistInitiativeEngineInTransaction,
} from "@/features/tabletop-operations/runtime-integration-service";

import { insertBuildTenFixture } from "./tabletop-build-ten-db-fixture";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for action declaration validation.");
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
  throw new Error(`Refusing action declaration tests against non-local host ${databaseUrl.hostname}.`);
}
if (!databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error(`Refusing action declaration tests against non-development database ${databaseUrl.pathname.slice(1)}.`);
}

const ROLLBACK = new Error("ROLLBACK_ACTION_DECLARATION_WINDOWS_TEST");

function declarationDraft(actorCharacterId: number, targetCharacterId: number, overrides: Partial<ActionDeclarationDraft> = {}): ActionDeclarationDraft {
  return {
    actorCharacterId,
    targetCharacterIds: [targetCharacterId],
    label: "Measured attack",
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
    aimDeclared: true,
    calledShot: { declared: true, label: "Weapon hand", assignedPenalty: -20 },
    explicitModifiers: [{ label: "Table position", value: -5 }],
    preparesForDeclarationId: null,
    godNotes: "No outcome is authorized by this declaration.",
    ...overrides,
  };
}

after(async () => {
  await pool.end();
});

test("guarded declaration lifecycle, windows, Rolls, rulings, authorization, and carryover stay durable and non-automating", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const base = await insertBuildTenFixture(tx, "action-declarations");
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, base.encounterId, base.godId);
    const godActor = { authority: "god-owner" as const, userId: base.godId };
    const playerActor = { authority: "player" as const, userId: base.godId, characterId: base.heroId };
    const outsiderId = `action-declaration-outsider-${crypto.randomUUID()}`;
    await tx.insert(user).values({
      id: outsiderId,
      name: "Action Declaration Outsider",
      email: `${outsiderId}@example.invalid`,
      username: outsiderId,
    });
    await tx.insert(campaignPlayer).values({ campaignId: base.campaignId, userId: outsiderId });

    await tx.insert(campaignSessionSceneMember).values({
      sceneId: base.sceneId,
      sessionId: base.sessionId,
      campaignId: base.campaignId,
      characterId: base.rosterOnlyId,
      sortOrder: 2,
    });
    await tx.insert(campaignSessionEncounterParticipant).values({
      encounterId: base.encounterId,
      sceneId: base.sceneId,
      sessionId: base.sessionId,
      campaignId: base.campaignId,
      characterId: base.rosterOnlyId,
      sortOrder: 2,
    });
    await tx.insert(campaignSessionEncounterInitiativeParticipant).values({
      encounterId: base.encounterId,
      sceneId: base.sceneId,
      sessionId: base.sessionId,
      campaignId: base.campaignId,
      characterId: base.rosterOnlyId,
      normalTotalInitiative: 20,
      currentInitiative: 10,
    });

    const initialInitiative = await tx.select().from(campaignSessionEncounterInitiativeParticipant)
      .where(eq(campaignSessionEncounterInitiativeParticipant.encounterId, base.encounterId));
    const initialPendingCount = (await tx.select().from(campaignSessionEncounterPendingAction)
      .where(eq(campaignSessionEncounterPendingAction.encounterId, base.encounterId))).length;
    const initialHealth = await tx.select().from(campaignCharacterActiveHealth)
      .where(eq(campaignCharacterActiveHealth.characterId, base.heroId));
    const initialItems = await tx.select().from(campaignCharacterItem)
      .where(eq(campaignCharacterItem.characterId, base.heroId));

    await assert.rejects(
      createActionDeclarationDraftInTransaction(tx, context, {
        authority: "player",
        userId: outsiderId,
        characterId: base.heroId,
      }, declarationDraft(base.heroId, base.defenderId)),
      /own authorized Character/,
    );
    await assert.rejects(
      createActionDeclarationDraftInTransaction(tx, context, {
        authority: "god-owner",
        userId: outsiderId,
      }, declarationDraft(base.heroId, base.defenderId)),
      /Campaign-owning G\.O\.D/,
    );
    await assert.rejects(
      lockOwnedEncounterRuntimeInTransaction(tx, base.encounterId + 999_999, base.godId),
      /Encounter no longer exists/,
    );

    const firstId = await createActionDeclarationDraftInTransaction(
      tx,
      context,
      playerActor,
      declarationDraft(base.heroId, base.defenderId, { label: "Editable draft", initiativeCost: 1 }),
    );
    await editActionDeclarationDraftInTransaction(
      tx,
      context,
      playerActor,
      firstId,
      declarationDraft(base.heroId, base.defenderId, { label: "Frozen attack", initiativeCost: 2 }),
    );
    assert.equal((await tx.select().from(campaignSessionEncounterPendingAction)
      .where(eq(campaignSessionEncounterPendingAction.encounterId, base.encounterId))).length, initialPendingCount);
    assert.deepEqual(await tx.select().from(campaignSessionEncounterInitiativeParticipant)
      .where(eq(campaignSessionEncounterInitiativeParticipant.encounterId, base.encounterId)), initialInitiative);

    const closeoutContext = await lockEncounterCloseoutContextInTransaction(tx, base.encounterId, base.godId);
    assert.ok((await readEncounterCloseoutInTransaction(tx, closeoutContext)).blockers
      .some(({ code }) => code === "action-declaration-open"));

    await lockActionDeclarationInTransaction(tx, context, playerActor, firstId);
    const [lockedFirst] = await tx.select().from(campaignSessionEncounterActionDeclaration)
      .where(eq(campaignSessionEncounterActionDeclaration.id, firstId));
    assert.ok(lockedFirst?.lockedSnapshotJson);
    assert.equal((lockedFirst.lockedSnapshotJson as { label: string }).label, "Frozen attack");
    assert.equal((lockedFirst.lockedSnapshotJson as { initiativeCost: number }).initiativeCost, 2);
    await assert.rejects(
      editActionDeclarationDraftInTransaction(tx, context, playerActor, firstId, declarationDraft(base.heroId, base.defenderId)),
      /Only a draft declaration may be edited/,
    );

    const declarationId = await reviseLockedActionDeclarationInTransaction(tx, context, playerActor, firstId);
    const [replacement] = await tx.select().from(campaignSessionEncounterActionDeclaration)
      .where(eq(campaignSessionEncounterActionDeclaration.id, declarationId));
    assert.equal(replacement?.versionNumber, 2);
    assert.equal(replacement?.supersedesDeclarationId, firstId);
    assert.equal((await tx.select().from(campaignSessionEncounterActionDeclaration)
      .where(eq(campaignSessionEncounterActionDeclaration.id, firstId)))[0]?.status, "cancelled");
    await editActionDeclarationDraftInTransaction(
      tx,
      context,
      playerActor,
      declarationId,
      declarationDraft(base.heroId, base.defenderId, { label: "Committed frozen attack" }),
    );
    await assert.rejects(
      commitActionDeclarationInTransaction(tx, context, playerActor, declarationId),
      /requires a locked declaration/,
    );
    await lockActionDeclarationInTransaction(tx, context, playerActor, declarationId);
    const pendingActionId = await commitActionDeclarationInTransaction(tx, context, playerActor, declarationId);
    const [pending] = await tx.select().from(campaignSessionEncounterPendingAction)
      .where(eq(campaignSessionEncounterPendingAction.id, pendingActionId));
    assert.equal(pending?.startInitiative, 18);
    assert.equal(pending?.originalInitiativeCost, 2);
    assert.equal(pending?.initiativeSpent, 0);
    assert.equal(pending?.remainingInitiativeCost, 2);
    assert.equal(pending?.expectedCompletionInitiative, 16);
    assert.equal((await tx.select().from(campaignSessionEncounterInitiativeParticipant).where(and(
      eq(campaignSessionEncounterInitiativeParticipant.encounterId, base.encounterId),
      eq(campaignSessionEncounterInitiativeParticipant.characterId, base.heroId),
    )))[0]?.currentInitiative, 18);

    let opportunities = await tx.select().from(campaignSessionEncounterResponderOpportunity)
      .where(eq(campaignSessionEncounterResponderOpportunity.declarationId, declarationId));
    assert.deepEqual(opportunities.map(({ responderCharacterId }) => responderCharacterId), [base.defenderId]);
    assert.equal(opportunities[0]?.reachedAtInitiative, 17);
    assert.equal(opportunities[0]?.requiresGodConfirmation, true);

    await assert.rejects(recordRollInTransaction(tx, base.actor, {
      sessionId: base.sessionId,
      sceneId: base.sceneId,
      encounterId: base.encounterId,
      rollerCharacterId: base.heroId,
      targetCharacterId: base.defenderId,
      pendingActionId,
      method: "entered",
      visibility: "table",
      purposeKind: "attack",
      enteredTotal: 55,
    }), /locked, committed, rolling-ready/);
    const freeRoll = await recordRollInTransaction(tx, base.actor, {
      sessionId: base.sessionId,
      method: "entered",
      visibility: "god-only",
      purposeKind: "free",
      enteredTotal: 44,
      label: "Unaffected free Roll",
    });
    assert.equal(freeRoll.resultTotal, 44);

    await assert.rejects(
      addExceptionalResponderOpportunityInTransaction(tx, context, godActor, declarationId, base.rosterOnlyId, ""),
      /reason is required/,
    );
    await addExceptionalResponderOpportunityInTransaction(
      tx,
      context,
      godActor,
      declarationId,
      base.rosterOnlyId,
      "A concealed route makes intervention fictionally possible.",
    );
    opportunities = await tx.select().from(campaignSessionEncounterResponderOpportunity)
      .where(eq(campaignSessionEncounterResponderOpportunity.declarationId, declarationId));
    const normalOpportunity = opportunities.find(({ source }) => source === "initiative")!;
    const exceptionalOpportunity = opportunities.find(({ source }) => source === "god-exception")!;
    await reconcileResponderOpportunityInTransaction(tx, context, godActor, normalOpportunity.id, { status: "declined" });
    await reconcileResponderOpportunityInTransaction(tx, context, godActor, exceptionalOpportunity.id, {
      status: "response-declared",
      responseLabel: "Reserve a future supported intervention",
    });
    assert.equal((await tx.select().from(campaignSessionEncounterActionDeclaration)
      .where(eq(campaignSessionEncounterActionDeclaration.id, declarationId)))[0]?.status, "rolling-ready");

    const ordinaryRoll = await recordRollInTransaction(tx, base.actor, {
      sessionId: base.sessionId,
      sceneId: base.sceneId,
      encounterId: base.encounterId,
      rollerCharacterId: base.heroId,
      targetCharacterId: base.defenderId,
      pendingActionId,
      method: "entered",
      visibility: "table",
      purposeKind: "attack",
      enteredTotal: 55,
    });
    assert.equal(ordinaryRoll.resultTotal, 55);
    assert.equal((await tx.select().from(campaignSessionEncounterActionDeclaration)
      .where(eq(campaignSessionEncounterActionDeclaration.id, declarationId)))[0]?.status, "rolling");
    assert.equal((await tx.select().from(campaignSessionEncounterPendingAction)
      .where(eq(campaignSessionEncounterPendingAction.id, pendingActionId)))[0]?.status, "active");

    await recordRollInTransaction(tx, base.actor, {
      sessionId: base.sessionId,
      sceneId: base.sceneId,
      encounterId: base.encounterId,
      rollerCharacterId: base.heroId,
      pendingActionId,
      method: "entered",
      visibility: "table",
      purposeKind: "attack",
      enteredTotal: 100,
    });
    assert.equal((await tx.select().from(campaignSessionEncounterActionDeclaration)
      .where(eq(campaignSessionEncounterActionDeclaration.id, declarationId)))[0]?.status, "awaiting-god-ruling");

    let beforeEngine = await loadInitiativeEngineInTransaction(tx, base.encounterId);
    let afterEngine = advanceInitiativeTimeline(beforeEngine, 17);
    await persistInitiativeEngineInTransaction(tx, context, beforeEngine, afterEngine);
    await interruptActionDeclarationInTransaction(
      tx,
      context,
      godActor,
      declarationId,
      "Explicit interruption at the reached Initiative position.",
    );
    let interrupted = (await tx.select().from(campaignSessionEncounterPendingAction)
      .where(eq(campaignSessionEncounterPendingAction.id, pendingActionId)))[0]!;
    assert.equal(interrupted.initiativeSpent, 1);
    assert.equal(interrupted.remainingInitiativeCost, 1);
    assert.equal(interrupted.status, "interrupted");

    await resumeInterruptedActionDeclarationInTransaction(
      tx,
      context,
      godActor,
      declarationId,
      "The G.O.D. rules this generic action may resume.",
    );
    opportunities = await tx.select().from(campaignSessionEncounterResponderOpportunity)
      .where(eq(campaignSessionEncounterResponderOpportunity.declarationId, declarationId));
    const resumedPending = opportunities.filter(({ status, windowSequence }) => status === "pending" && windowSequence === 2);
    assert.deepEqual(resumedPending.map(({ responderCharacterId }) => responderCharacterId), [base.defenderId]);
    await reconcileResponderOpportunityInTransaction(tx, context, godActor, resumedPending[0]!.id, { status: "ineligible", reason: "Explicitly unaware after the interruption." });
    await abandonActionDeclarationInTransaction(tx, context, godActor, declarationId, "The actor abandons the resumed action.");
    interrupted = (await tx.select().from(campaignSessionEncounterPendingAction)
      .where(eq(campaignSessionEncounterPendingAction.id, pendingActionId)))[0]!;
    assert.equal(interrupted.initiativeSpent, 1);
    assert.equal(interrupted.remainingInitiativeCost, 1);
    assert.equal(interrupted.status, "abandoned");

    const zeroCostCancellation = await createActionDeclarationDraftInTransaction(
      tx,
      context,
      godActor,
      declarationDraft(base.heroId, base.defenderId, { label: "Cancelled locked declaration" }),
    );
    await lockActionDeclarationInTransaction(tx, context, godActor, zeroCostCancellation);
    await cancelActionDeclarationInTransaction(tx, context, godActor, zeroCostCancellation);
    assert.equal((await tx.select().from(campaignSessionEncounterPendingAction)
      .where(eq(campaignSessionEncounterPendingAction.encounterId, base.encounterId))).length, initialPendingCount + 1);

    const draftCancellation = await createActionDeclarationDraftInTransaction(
      tx,
      context,
      godActor,
      declarationDraft(base.heroId, base.defenderId, { label: "Cancelled draft declaration" }),
    );
    await cancelActionDeclarationInTransaction(tx, context, godActor, draftCancellation);
    assert.equal((await tx.select().from(campaignSessionEncounterActionDeclaration)
      .where(eq(campaignSessionEncounterActionDeclaration.id, draftCancellation)))[0]?.status, "cancelled");
    assert.equal((await tx.select().from(campaignSessionEncounterPendingAction)
      .where(eq(campaignSessionEncounterPendingAction.encounterId, base.encounterId))).length, initialPendingCount + 1);

    const unaffordableDeclaration = await createActionDeclarationDraftInTransaction(
      tx,
      context,
      godActor,
      declarationDraft(base.heroId, base.defenderId, {
        label: "Unaffordable ordinary action",
        initiativeCost: 18,
        allowsMultiRound: false,
      }),
    );
    await lockActionDeclarationInTransaction(tx, context, godActor, unaffordableDeclaration);
    await assert.rejects(
      commitActionDeclarationInTransaction(tx, context, godActor, unaffordableDeclaration),
      /ordinary action cannot cost more/,
    );
    await cancelActionDeclarationInTransaction(tx, context, godActor, unaffordableDeclaration);

    const longDeclarationId = await createActionDeclarationDraftInTransaction(
      tx,
      context,
      godActor,
      declarationDraft(base.heroId, base.defenderId, {
        label: "Long preparation",
        actionKind: "preparation",
        initiativeCost: 20,
        allowsMultiRound: true,
        windowKind: "preparation",
        aimDeclared: false,
        calledShot: { declared: false, label: "", assignedPenalty: null },
      }),
    );
    await lockActionDeclarationInTransaction(tx, context, godActor, longDeclarationId);
    const longPendingId = await commitActionDeclarationInTransaction(tx, context, godActor, longDeclarationId);
    const conflictingDeclarationId = await createActionDeclarationDraftInTransaction(
      tx,
      context,
      godActor,
      declarationDraft(base.heroId, base.defenderId, { label: "Unrelated action during long preparation" }),
    );
    await lockActionDeclarationInTransaction(tx, context, godActor, conflictingDeclarationId);
    await assert.rejects(
      commitActionDeclarationInTransaction(tx, context, godActor, conflictingDeclarationId),
      /already committed to an active pending action/,
    );
    await cancelActionDeclarationInTransaction(tx, context, godActor, conflictingDeclarationId);
    const longOpportunities = await tx.select().from(campaignSessionEncounterResponderOpportunity)
      .where(eq(campaignSessionEncounterResponderOpportunity.declarationId, longDeclarationId));
    for (const opportunity of longOpportunities) {
      await reconcileResponderOpportunityInTransaction(tx, context, godActor, opportunity.id, { status: "declined" });
    }
    beforeEngine = await loadInitiativeEngineInTransaction(tx, base.encounterId);
    afterEngine = passInitiative(beforeEngine, base.defenderId);
    afterEngine = advanceInitiativeTimeline(afterEngine, 10);
    afterEngine = passInitiative(afterEngine, base.rosterOnlyId);
    afterEngine = advanceInitiativeTimeline(afterEngine, 0);
    await persistInitiativeEngineInTransaction(tx, context, beforeEngine, afterEngine);
    const beforeRound = afterEngine;
    const nextRound = advanceInitiativeRound(beforeRound);
    await recordLongActionRoundContinuationsInTransaction(
      tx,
      context,
      beforeRound.runtime.roundNumber,
      nextRound.runtime.roundNumber,
      nextRound,
      base.godId,
    );
    await persistInitiativeEngineInTransaction(tx, context, beforeRound, nextRound);
    const [carried] = await tx.select().from(campaignSessionEncounterPendingAction)
      .where(eq(campaignSessionEncounterPendingAction.id, longPendingId));
    assert.equal(carried?.originalInitiativeCost, 20);
    assert.equal(carried?.initiativeSpent, 17);
    assert.equal(carried?.remainingInitiativeCost, 3);
    assert.equal(carried?.startedRound, 3);
    assert.equal(carried?.status, "active");
    assert.ok((await tx.select().from(campaignSessionEncounterActionDeclarationEvent).where(and(
      eq(campaignSessionEncounterActionDeclarationEvent.declarationId, longDeclarationId),
      eq(campaignSessionEncounterActionDeclarationEvent.eventKind, "long-action-continued"),
    ))).length === 1);
    const workspace = await readActionDeclarationWorkspaceInTransaction(tx, context, godActor);
    assert.equal(workspace.run.find(({ actorCharacterId }) => actorCharacterId === base.heroId)?.hasTheRun, false);
    assert.ok(workspace.declarations.find(({ id }) => id === longDeclarationId));

    await completeActionDeclarationTimingInTransaction(
      tx,
      context,
      godActor,
      longDeclarationId,
      "The G.O.D. closes the remaining timing for resolution-state validation.",
    );
    await resolveActionDeclarationInTransaction(tx, context, godActor, longDeclarationId, "Explicitly resolved without an invented outcome.");
    await assert.rejects(
      resolveActionDeclarationInTransaction(tx, context, godActor, longDeclarationId, "A duplicate resolution must fail."),
      /cannot transition from resolved to resolved/,
    );

    assert.deepEqual(await tx.select().from(campaignCharacterActiveHealth)
      .where(eq(campaignCharacterActiveHealth.characterId, base.heroId)), initialHealth);
    assert.deepEqual(await tx.select().from(campaignCharacterItem)
      .where(eq(campaignCharacterItem.characterId, base.heroId)), initialItems);
    assert.equal((await tx.select().from(campaignSessionRoll).where(and(
      eq(campaignSessionRoll.pendingActionId, pendingActionId),
      eq(campaignSessionRoll.purposeKind, "attack"),
    ))).length, 2);
    assert.ok((await tx.select().from(campaignSessionEncounterActionDeclarationEvent)
      .where(eq(campaignSessionEncounterActionDeclarationEvent.declarationId, declarationId))).length >= 10);

    const terminal = (await tx.select().from(campaignSessionEncounterActionDeclaration)
      .where(eq(campaignSessionEncounterActionDeclaration.id, declarationId)))[0]!;
    assert.equal(terminal.status, "abandoned");
    await assert.rejects(
      commitActionDeclarationInTransaction(tx, context, godActor, declarationId),
      /requires a locked declaration/,
    );

    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});
