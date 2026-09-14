import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { weaponProfile } from "@/db/item-schema";
import { campaignCharacterItemEquipmentState, campaignCharacterItemInstance } from "@/db/realm-schema";
import { campaignSessionEncounterInitiativeParticipant as participant, campaignSessionEncounterActionDeclaration as declaration,
  campaignSessionRoll } from "@/db/tabletop-operations-schema";
import { completionServiceFixture } from "./fixtures/combat-completion-service-fixture";
import { startMeleeDraw, completeMeleeDraw, readMeleeDrawOptions } from "@/features/tabletop-operations/combat-melee-draw-service";
import { readCharacterEquipmentStateInTransaction } from "@/features/items/equipment-state-service";
import { readyOwnedWeaponInTransaction } from "@/features/items/equipment-state-service";
import { campaignSessionEncounter } from "@/db/tabletop-operations-schema";
import { loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { advanceInitiativeTimeline } from "@/features/tabletop-operations/initiative-runtime";
import { interruptActionDeclarationInTransaction } from "@/features/tabletop-operations/action-declaration-service";
import { setCombatFrozenInTransaction } from "@/features/tabletop-operations/combat-freeze-service";

if (process.env.SERRIAN_DISPOSABLE_COMBAT_COMPLETION !== "true") throw new Error("Use the isolated completion harness.");
after(() => pool.end());
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const rollback = new Error("ROLLBACK_MELEE_DRAW");
async function fixture(tx: Tx, cost: number | null = 2, copy = false, npc = false) {
  const f = await completionServiceFixture(tx, "melee-draw"), characterId = npc ? f.defenderId : f.heroId;
  await tx.delete(campaignCharacterItemEquipmentState).where(and(eq(campaignCharacterItemEquipmentState.characterId, characterId), eq(campaignCharacterItemEquipmentState.itemId, f.weaponId)));
  await tx.update(weaponProfile).set({ drawInitiativeCost: cost }).where(eq(weaponProfile.itemId, f.weaponId));
  await tx.update(participant).set({ participationStatus: "active" }).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, characterId)));
  const instanceId = copy ? (await tx.insert(campaignCharacterItemInstance).values({ characterId, itemId: f.weaponId, currentCharges: 0, unitCostCredits: 0, equipmentState: "inactive" }).returning())[0].id : null;
  return { ...f, characterId, actor: npc ? f.god : f.player, command: { characterId, itemId: f.weaponId, instanceId, requestKey: crypto.randomUUID() } };
}
async function check(run: (tx: Tx) => Promise<void>) {
  await assert.rejects(db.transaction(async (tx) => { await run(tx); throw rollback; }), (error) => { if (error !== rollback) console.error(error); return error === rollback; });
}
for (const copy of [false, true]) for (const npc of [false, true]) test(`draw ${copy ? "copy" : "stack"} for ${npc ? "NPC" : "Player"} completes once through Initiative without a Roll`, () => check(async (tx) => {
  const f = await fixture(tx, 0.5, copy, npc);
  const result = await startMeleeDraw(tx, f.context, f.actor, f.command);
  assert.deepEqual(await startMeleeDraw(tx, f.context, f.actor, f.command), result);
  assert.equal((await readCharacterEquipmentStateInTransaction(tx, f.characterId)).wieldedWeapons.length, 0);
  const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
  const after = advanceInitiativeTimeline(before, before.runtime.timelineInitiative - 0.5);
  await persistInitiativeEngineInTransaction(tx, f.context, before, after);
  const state = await readCharacterEquipmentStateInTransaction(tx, f.characterId);
  assert.equal(state.wieldedWeapons.length, 1);
  assert.equal(state.wieldedWeapons[0].instanceId, f.command.instanceId);
  await completeMeleeDraw(tx, result.declarationId!, f.godId);
  assert.deepEqual(await startMeleeDraw(tx, f.context, f.actor, f.command), result);
  assert.equal((await readCharacterEquipmentStateInTransaction(tx, f.characterId)).wieldedWeapons[0].activeQuantity, 1);
  assert.equal((await tx.select().from(declaration).where(eq(declaration.id, result.declarationId!)))[0].status, "resolved");
  assert.equal((await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.encounterId, f.encounterId))).length, 0);
}));
test("interrupted draw keeps weapon unwielded and cannot start a second draw while busy", () => check(async (tx) => {
  const f = await fixture(tx);
  const result = await startMeleeDraw(tx, f.context, f.actor, f.command);
  await assert.rejects(tx.transaction((nested) => startMeleeDraw(nested, f.context, f.actor, { ...f.command, requestKey: crypto.randomUUID() })));
  const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
  await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, before.runtime.timelineInitiative - 1));
  assert.equal((await readCharacterEquipmentStateInTransaction(tx, f.characterId)).wieldedWeapons.length, 0);
  const spent = (await loadInitiativeEngineInTransaction(tx, f.encounterId)).participants.find((entry) => entry.characterId === f.characterId)!.currentInitiative;
  await interruptActionDeclarationInTransaction(tx, f.context, f.god, result.declarationId!, "Draw interrupted");
  await completeMeleeDraw(tx, result.declarationId!, f.godId);
  assert.equal((await readCharacterEquipmentStateInTransaction(tx, f.characterId)).wieldedWeapons.length, 0);
  assert.equal((await loadInitiativeEngineInTransaction(tx, f.encounterId)).participants.find((entry) => entry.characterId === f.characterId)!.currentInitiative, spent);
}));
test("missing costs, insufficient Initiative, wrong owner, and Freeze reject before drawing", () => check(async (tx) => {
  const f = await fixture(tx, null);
  await assert.rejects(startMeleeDraw(tx, f.context, f.actor, f.command), /Set Draw Initiative/);
  await tx.update(weaponProfile).set({ drawInitiativeCost: 23 }).where(eq(weaponProfile.itemId, f.weaponId));
  await assert.rejects(startMeleeDraw(tx, f.context, f.actor, f.command), /only 22 remains/);
  await assert.rejects(startMeleeDraw(tx, f.context, f.god, f.command), /own action choice/);
  await setCombatFrozenInTransaction(tx, f.encounterId, f.god, { frozen: true, expectedRevision: 0 });
  await assert.rejects(startMeleeDraw(tx, f.context, f.actor, f.command), /paused|frozen|Freeze/i);
  assert.equal((await readCharacterEquipmentStateInTransaction(tx, f.characterId)).wieldedWeapons.length, 0);
}));
test("zero-cost draw needs an opportunity and retains an exact retry receipt", () => check(async (tx) => {
  const f = await fixture(tx, 0);
  await tx.update(participant).set({ participationStatus: "passed" }).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, f.characterId)));
  await assert.rejects(startMeleeDraw(tx, f.context, f.actor, f.command), /opportunity/);
  await tx.update(participant).set({ participationStatus: "active" }).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, f.characterId)));
  const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
  await startMeleeDraw(tx, f.context, f.actor, f.command);
  await startMeleeDraw(tx, f.context, f.actor, f.command);
  await assert.rejects(startMeleeDraw(tx, f.context, f.actor, { ...f.command, itemId: f.weaponId + 1 }), /different draw/);
  assert.equal((await readCharacterEquipmentStateInTransaction(tx, f.characterId)).wieldedWeapons[0].activeQuantity, 1);
  assert.equal((await readMeleeDrawOptions(tx, f.characterId)).length, 0);
  assert.deepEqual(await loadInitiativeEngineInTransaction(tx, f.encounterId), before);
}));

for (const copy of [false, true]) test(`tabletop ready ${copy ? "copy" : "stack"} preserves ownership, repeats safely, and rejects active combat`, () => check(async (tx) => {
  const f = await fixture(tx, null, copy);
  const command = { ...f.command, wieldedQuantity: 1 };
  await assert.rejects(readyOwnedWeaponInTransaction(tx, command), /active combat/);
  await tx.update(campaignSessionEncounter).set({ status: "completed", completedAt: new Date() }).where(eq(campaignSessionEncounter.id, f.encounterId));
  // Exercise moving a unit from Equipped when no inactive stack unit remains.
  if (!copy) await tx.insert(campaignCharacterItemEquipmentState).values({ characterId: f.characterId, itemId: f.weaponId, state: "equipped", quantity: 1 });
  const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
  await readyOwnedWeaponInTransaction(tx, command);
  await readyOwnedWeaponInTransaction(tx, command);
  const state = await readCharacterEquipmentStateInTransaction(tx, f.characterId);
  assert.equal(state.wieldedWeapons.length, 1);
  assert.equal(state.wieldedWeapons[0].activeQuantity, 1);
  assert.equal(state.wieldedWeapons[0].instanceId, command.instanceId);
  if (!copy) assert.equal(state.stacks[0].equippedQuantity, 0);
  assert.deepEqual(await loadInitiativeEngineInTransaction(tx, f.encounterId), before);
  await assert.rejects(readyOwnedWeaponInTransaction(tx, { ...command, itemId: f.weaponId + 1000000 }), /active owned weapon/);
  await assert.rejects(readyOwnedWeaponInTransaction(tx, { ...command, instanceId: 1000000 }), /exact owned weapon copy/);
}));
