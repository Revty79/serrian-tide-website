import assert from "node:assert/strict";
import { after, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { campaignCharacterAttribute } from "@/db/realm-schema";
import { campaignSessionEncounterInitiativeParticipant as participant, campaignSessionRoll,
  campaignSessionEffectDurationBinding as binding } from "@/db/tabletop-operations-schema";
import { commitActionDeclarationInTransaction, createActionDeclarationDraftInTransaction, lockActionDeclarationInTransaction } from "@/features/tabletop-operations/action-declaration-service";
import { declareDefenseInterventionInTransaction, resolveDeclaredDefensesInTransaction, recordDeclaredAttackRollInTransaction } from "@/features/tabletop-operations/defense-intervention-service";
import { applyActionEffectPlanInTransaction, generateActionEffectPlanInTransaction, approveActionEffectPlanInTransaction } from "@/features/tabletop-operations/action-effect-plan-service";
import { COMBAT_PAUSED_MESSAGE, setCombatFrozenInTransaction, readCombatPauseStateInTransaction } from "@/features/tabletop-operations/combat-freeze-service";
import { readCombatEntityInformationInTransaction, readCombatProjectionInTransaction } from "@/features/tabletop-operations/combat-projection-service";
import { addEncounterConditionInTransaction, holdParticipantInitiativeInTransaction, loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction, mutateEncounterManaInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { advanceInitiativeTimeline } from "@/features/tabletop-operations/initiative-runtime";
import { readRollLedgerInTransaction } from "@/features/tabletop-operations/roll-runtime-service";
import { applyInitiativeDurationTransitionInTransaction } from "@/features/tabletop-operations/duration-lifecycle-service";
import { applyLocalizedDamageInTransaction } from "@/features/active-state/active-health-service";
import { completionDraft, completionServiceFixture } from "./fixtures/combat-completion-service-fixture";

if (process.env.SERRIAN_DISPOSABLE_COMBAT_COMPLETION !== "true") throw new Error("Use the isolated completion harness.");
after(() => pool.end());
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Fixture = Awaited<ReturnType<typeof completionServiceFixture>>;
const paused = (error: unknown) => error instanceof Error && error.message === COMBAT_PAUSED_MESSAGE;
async function active(tx: Tx, f: Fixture, id: number) {
  await tx.update(participant).set({ participationStatus: "active" }).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, id)));
}
async function draft(tx: Tx, f: Fixture) {
  const id = await createActionDeclarationDraftInTransaction(tx, f.context, f.god,
    { ...completionDraft(f.occurrences[0], f.occurrences[1]), sourceKind: "creature-attack", sourceRef: "fixture-shortsword" });
  await lockActionDeclarationInTransaction(tx, f.context, f.god, id);
  return id;
}

test("only owning G.O.D. pauses; reconnect retains state; retries and stale Resume cannot toggle a later pause", async () => {
  const f = await db.transaction((tx) => completionServiceFixture(tx, "pause-authority"));
  for (const actor of [f.player, { authority: "god-owner", userId: "unrelated-god" }, { authority: "admin", userId: f.godId }]) {
    await assert.rejects(db.transaction((tx) => setCombatFrozenInTransaction(tx, f.encounterId, actor, { frozen: true, expectedRevision: 0 })), /Only the Campaign-owning/);
  }
  const before = await db.transaction((tx) => loadInitiativeEngineInTransaction(tx, f.encounterId));
  const first = await db.transaction((tx) => setCombatFrozenInTransaction(tx, f.encounterId, f.god, { frozen: true, expectedRevision: 0 }));
  assert.equal(first.frozen, true); assert.equal(first.canResume, true); assert.equal(first.revision, 1);
  const client = await pool.connect();
  try { assert.equal((await client.query('select frozen_at is not null frozen, freeze_revision from campaign_session_encounter where id=$1', [f.encounterId])).rows[0].freeze_revision, 1); }
  finally { client.release(); }
  const reconnect = await db.transaction((tx) => readCombatPauseStateInTransaction(tx, f.encounterId, f.player));
  assert.equal(reconnect.frozenAt, first.frozenAt); assert.equal(reconnect.canResume, false);
  assert.deepEqual(await db.transaction((tx) => setCombatFrozenInTransaction(tx, f.encounterId, f.god, { frozen: true, expectedRevision: 0 })), first);
  for (const actor of [f.player, { authority: "god-owner", userId: "unrelated-god" }]) {
    await assert.rejects(db.transaction((tx) => setCombatFrozenInTransaction(tx, f.encounterId, actor, { frozen: false, expectedRevision: 1 })), /Only the Campaign-owning/);
  }
  await db.transaction((tx) => setCombatFrozenInTransaction(tx, f.encounterId, f.god, { frozen: false, expectedRevision: 1 }));
  await db.transaction((tx) => setCombatFrozenInTransaction(tx, f.encounterId, f.god, { frozen: true, expectedRevision: 2 }));
  await assert.rejects(db.transaction((tx) => setCombatFrozenInTransaction(tx, f.encounterId, f.god, { frozen: false, expectedRevision: 1 })), /state changed/);
  assert.deepEqual(await db.transaction((tx) => loadInitiativeEngineInTransaction(tx, f.encounterId)), before);
});

test("paused inspection and sealed readiness preserve Hold, Rolls, pending work and Step-bound effects", async () => {
  const f = await db.transaction(async (tx) => {
    const f = await completionServiceFixture(tx, "pause-sealed");
    await tx.insert(campaignCharacterAttribute).values({ characterId: f.heroId, attributeKey: "CON", value: 50 });
    await active(tx, f, f.occurrences[0]); await active(tx, f, f.heroId);
    await addEncounterConditionInTransaction(tx, f.context, f.godId, { targetCharacterId: f.heroId, name: "Fixture duration", description: "Explicit two Steps", duration: { kind: "combat-steps", value: 2 } });
    const declarationId = await draft(tx, f);
    const pendingId = await commitActionDeclarationInTransaction(tx, f.context, f.god, declarationId, { method: "entered", enteredTotal: 55 });
    return { ...f, declarationId, pendingId };
  });
  const before = await db.transaction((tx) => loadInitiativeEngineInTransaction(tx, f.encounterId));
  const durationBefore = await db.select().from(binding).where(eq(binding.encounterId, f.encounterId));
  await db.transaction((tx) => setCombatFrozenInTransaction(tx, f.encounterId, f.god, { frozen: true, expectedRevision: 0 }));
  const view = await db.transaction((tx) => readCombatProjectionInTransaction(tx, f.context, f.god));
  assert.equal(view.pause.message, COMBAT_PAUSED_MESSAGE);
  assert.ok(view.entities.every((entity) => !entity.canActNow && !entity.canRespondNow && entity.canInspect));
  assert.equal(view.entities.find(({ participantId }) => participantId === f.occurrences[0])?.currentAction, null);
  assert.equal(view.declarations.some(({ id }) => id === f.declarationId), false);
  const ledger = await db.transaction((tx) => readRollLedgerInTransaction(tx,
    { userId: f.godId, campaignId: f.campaignId, readAs: "god-owner", canRecordGodOnly: true }, f.sessionId, { encounterId: f.encounterId }));
  assert.equal(ledger.rolls.length, 0);
  const info = await db.transaction((tx) => readCombatEntityInformationInTransaction(tx, f.context, f.player, f.heroId));
  assert.equal(info.resources?.kind, "character"); assert.ok(info.resources && "health" in info.resources && info.resources.health && info.resources.health.tracks.length > 0);
  const creature = await db.transaction((tx) => readCombatEntityInformationInTransaction(tx, f.context, f.god, f.occurrences[0]));
  assert.equal(creature.resources?.kind, "creature");
  for (const write of [
    (tx: Tx) => commitActionDeclarationInTransaction(tx, f.context, f.god, f.declarationId),
    (tx: Tx) => holdParticipantInitiativeInTransaction(tx, f.context, f.heroId),
    (tx: Tx) => declareDefenseInterventionInTransaction(tx, f.context, f.player, { opportunityId: 1, reactionType: "dodge", protectedTargetCharacterId: f.heroId }),
    (tx: Tx) => applyActionEffectPlanInTransaction(tx, f.context, f.god, 1),
    (tx: Tx) => recordDeclaredAttackRollInTransaction(tx, f.context, f.god, f.declarationId, { method: "random" }),
    (tx: Tx) => applyLocalizedDamageInTransaction(tx, { characterId: f.heroId, amount: 3, hitLocationNumber: 0 }, "race"),
    (tx: Tx) => applyInitiativeDurationTransitionInTransaction(tx, f.context, before.runtime, { ...before.runtime, stepNumber: before.runtime.stepNumber + 1 }),
    (tx: Tx) => mutateEncounterManaInTransaction(tx, f.context, { targetCharacterId: f.heroId, system: "Spellcraft", operation: "restore-pool" }),
    async (tx: Tx) => persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, 18)),
  ]) await assert.rejects(db.transaction(async (tx) => { await write(tx); }), paused);
  assert.deepEqual(await db.transaction((tx) => loadInitiativeEngineInTransaction(tx, f.encounterId)), before);
  assert.deepEqual(await db.select().from(binding).where(eq(binding.encounterId, f.encounterId)), durationBefore);
  await db.transaction((tx) => setCombatFrozenInTransaction(tx, f.encounterId, f.god, { frozen: false, expectedRevision: 1 }));
  await db.transaction((tx) => holdParticipantInitiativeInTransaction(tx, f.context, f.heroId));
  assert.equal(await db.transaction((tx) => commitActionDeclarationInTransaction(tx, f.context, f.god, f.declarationId)), f.pendingId);
  assert.equal((await db.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.encounterId, f.encounterId))).length, 1);
  const resumed = await db.transaction((tx) => readCombatProjectionInTransaction(tx, f.context, f.god));
  assert.equal(resumed.entities.find(({ participantId }) => participantId === f.occurrences[0])?.currentAction?.remaining, 4);
  assert.equal(resumed.runtime.timelineInitiative, 22);
});

test("Resume applies an approved pending consequence once, retaining the recorded Roll and elapsed timing", async () => {
  const f = await db.transaction(async (tx) => {
    const f = await completionServiceFixture(tx, "pause-approved-damage"); await active(tx, f, f.occurrences[0]);
    const declarationId = await draft(tx, f);
    await commitActionDeclarationInTransaction(tx, f.context, f.god, declarationId, { method: "entered", enteredTotal: 70 });
    await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, declarationId);
    const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, 18));
    const planId = await generateActionEffectPlanInTransaction(tx, f.context, f.god, declarationId,
      { targetParticipantId: f.occurrences[1], hitLocationNumber: 0, finalDamage: 4, reason: "Explicit synthetic location damage for pause retry." });
    await approveActionEffectPlanInTransaction(tx, f.context, f.god, planId);
    return { ...f, planId };
  });
  const unrelated = await db.transaction((tx) => completionServiceFixture(tx, "pause-other-encounter"));
  await db.transaction((tx) => setCombatFrozenInTransaction(tx, f.encounterId, f.god, { frozen: true, expectedRevision: 0 }));
  await assert.rejects(db.transaction((tx) => applyActionEffectPlanInTransaction(tx, f.context, f.god, f.planId)), paused);
  // Another encounter still accepts its own declarations.
  await db.transaction((tx) => draft(tx, unrelated));
  await db.transaction((tx) => setCombatFrozenInTransaction(tx, f.encounterId, f.god, { frozen: false, expectedRevision: 1 }));
  for (let retry = 0; retry < 2; retry++) await db.transaction((tx) => applyActionEffectPlanInTransaction(tx, f.context, f.god, f.planId));
  const info = await db.transaction((tx) => readCombatEntityInformationInTransaction(tx, f.context, f.god, f.occurrences[1]));
  assert.equal((info.resources && "state" in info.resources ? info.resources.state as { health: { totalDamage: number } } : null)?.health.totalDamage, 4);
  assert.equal((await db.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.encounterId, f.encounterId))).length, 1);
  assert.equal((await db.transaction((tx) => loadInitiativeEngineInTransaction(tx, f.encounterId))).runtime.timelineInitiative, 18);
});

function gate() { let release!: () => void; const wait = new Promise<void>((resolve) => { release = resolve; }); return { wait, release }; }
async function waitForLock(label: string) {
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    const rows = await pool.query("select 1 from pg_stat_activity where application_name=$1 and wait_event_type='Lock'", [label]);
    if (rows.rowCount) return;
    await delay(10);
  }
  throw new Error("Expected actual PostgreSQL lock contention did not occur.");
}
for (const freezesFirst of [true, false]) test(`Freeze races actual declaration at the shared write boundary; freeze first=${freezesFirst}`, async () => {
  const f = await db.transaction(async (tx) => { const f = await completionServiceFixture(tx, `race-${freezesFirst}`); await active(tx, f, f.occurrences[0]); return { ...f, declarationId: await draft(tx, f) }; });
  const held = gate(), release = gate();
  const first = db.transaction(async (tx) => {
    if (freezesFirst) await setCombatFrozenInTransaction(tx, f.encounterId, f.god, { frozen: true, expectedRevision: 0 });
    else await commitActionDeclarationInTransaction(tx, f.context, f.god, f.declarationId, { method: "entered", enteredTotal: 55 });
    held.release(); await release.wait;
  });
  await held.wait;
  const label = `completion-freeze-race-${f.encounterId}`;
  const second = db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('application_name', ${label}, true)`);
    if (freezesFirst) return commitActionDeclarationInTransaction(tx, f.context, f.god, f.declarationId, { method: "entered", enteredTotal: 55 });
    return setCombatFrozenInTransaction(tx, f.encounterId, f.god, { frozen: true, expectedRevision: 0 });
  }).then((value) => ({ value, error: null }), (error: unknown) => ({ value: null, error }));
  try { await waitForLock(label); } finally { release.release(); }
  await first; const result = await second;
  if (freezesFirst) assert.ok(paused(result.error)); else assert.equal(result.error, null);
  const engine = await db.transaction((tx) => loadInitiativeEngineInTransaction(tx, f.encounterId));
  assert.equal(engine.pendingActions.filter(({ actorCharacterId }) => actorCharacterId === f.occurrences[0]).length, freezesFirst ? 0 : 1);
  assert.equal((await db.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.encounterId, f.encounterId))).length, freezesFirst ? 0 : 1);
});
