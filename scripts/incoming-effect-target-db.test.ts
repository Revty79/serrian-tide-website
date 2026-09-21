import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { user } from "@/db/auth-schema";
import { userRole } from "@/db/authorization-schema";
import { creature } from "@/db/creature-schema";
import { armorLocation, armorLocationReference, armorProfile, item } from "@/db/item-schema";
import { race } from "@/db/race-schema";
import { campaignCharacter, campaignCharacterProfile, campaignCreatureNpcProfile, campaignCharacterItem, campaignCharacterItemEquipmentState, campaignCharacterActiveModifier } from "@/db/realm-schema";
import { campaignSessionEncounterParticipant as participant } from "@/db/tabletop-operations-schema";
import type { InteractionRuleProfile } from "@/features/interaction-rules/interaction-rules";
import { readIncomingEffectTargetInTransaction } from "@/features/incoming-effects/incoming-effect-target-service";
import { resolveIncomingEffect } from "@/features/incoming-effects/resolve-incoming-effect";
import type { IncomingEffectTarget } from "@/features/incoming-effects/models";
import { saveRaceNaturalProtectionInTransaction } from "@/features/races/race-natural-protection-service";
import { completionServiceFixture } from "./fixtures/combat-completion-service-fixture";
import type { BuildTenDbTransaction as Tx } from "./tabletop-build-ten-db-fixture";

if (process.env.SERRIAN_DISPOSABLE_COMBAT_COMPLETION !== "true") throw new Error("Use the isolated completion harness.");
after(() => pool.end());
const rollback = new Error("ROLLBACK_INCOMING_EFFECT_FIXTURE");
function rules(percentage: number, owner: "race" | "creature" = "race"): InteractionRuleProfile {
  return { schemaVersion: 1, rules: [{ key: "fire", name: "Fire Resistance", ruleType: "resistance", scope: "damage", match: "ALL", percentage, sortOrder: 0, notes: "",
    conditions: [{ key: "fire", kind: "damage-type", damageType: "Fire" }], ...(owner === "creature" ? { crImpact: "None" as const } : {}) }] };
}
function resolve(target: IncomingEffectTarget) {
  return resolveIncomingEffect({ target, effect: { label: "Test Fire", amount: 12, harmful: null }, hitLocationKey: "0",
    source: { damageType: "Fire", magical: false, sourceKind: "weapon", weaponFamily: "none", itemProperties: [], itemTags: [], mechanicalEffectKind: "health.damage", conditionName: null } });
}
async function fixture(tx: Tx) {
  const f = await completionServiceFixture(tx, "incoming-effect");
  await tx.insert(userRole).values({ userId: f.godId, role: "god" });
  return f;
}
function isolated(name: string, run: (tx: Tx, f: Awaited<ReturnType<typeof fixture>>) => Promise<void>) {
  test(name, async () => {
    await assert.rejects(db.transaction(async (tx) => { await run(tx, await fixture(tx)); throw rollback; }), (error) => error === rollback);
  });
}
isolated("normal Character and Race NPC resolve currently assigned live Race mechanics", async (tx, f) => {
  const [ancestry] = await tx.insert(race).values({ name: "Incoming Race", interactionRules: rules(25) }).returning();
  await saveRaceNaturalProtectionInTransaction(tx, ancestry.id, [{ key: "hide", name: "Hide", naturalArmor: 2, naturalSoak: 1, coverage: { kind: "all" }, sortOrder: 0 }]);
  for (const id of [f.heroId, f.defenderId]) {
    await tx.update(campaignCharacterProfile).set({ raceId: ancestry.id }).where(eq(campaignCharacterProfile.characterId, id));
    const context = await readIncomingEffectTargetInTransaction(tx, f.godId, { kind: "character", characterId: id });
    assert.equal(context.ruleSource.kind, "race"); assert.equal(resolve(context).finalEffect?.damage, 6);
    const occurrence = await readIncomingEffectTargetInTransaction(tx, f.godId, { kind: "encounter-participant", campaignId: f.campaignId, encounterId: f.encounterId, participantId: id });
    assert.deepEqual(occurrence.interactionRules, context.interactionRules);
  }
  const frozen = await readIncomingEffectTargetInTransaction(tx, f.godId, { kind: "character", characterId: f.heroId });
  await tx.update(race).set({ interactionRules: rules(50) }).where(eq(race.id, ancestry.id));
  assert.equal(resolve(await readIncomingEffectTargetInTransaction(tx, f.godId, { kind: "character", characterId: f.heroId })).finalEffect?.damage, 3);
  assert.equal(resolve(frozen).finalEffect?.damage, 6, "supplied prior facts stay frozen");
  assert.equal((await tx.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, f.heroId)))[0].raceId, ancestry.id);
});
isolated("no assigned Race, Race without rules or natural protection, and Race reassignment remain valid", async (tx, f) => {
  const target = { kind: "character" as const, characterId: f.heroId };
  assert.equal(resolve(await readIncomingEffectTargetInTransaction(tx, f.godId, target)).finalEffect?.damage, 12);
  const [empty] = await tx.insert(race).values({ name: "Empty Race" }).returning();
  await tx.update(campaignCharacterProfile).set({ raceId: empty.id }).where(eq(campaignCharacterProfile.characterId, f.heroId));
  const context = await readIncomingEffectTargetInTransaction(tx, f.godId, target);
  assert.equal(context.interactionRules, null); assert.deepEqual(context.protection.natural, []); assert.equal(resolve(context).status, "resolved");
  const [second] = await tx.insert(race).values({ name: "Second Race", interactionRules: rules(50) }).returning();
  await tx.update(campaignCharacterProfile).set({ raceId: second.id }).where(eq(campaignCharacterProfile.characterId, f.heroId));
  assert.equal(resolve(await readIncomingEffectTargetInTransaction(tx, f.godId, target)).finalEffect?.damage, 6);
  await tx.update(campaignCharacterProfile).set({ raceId: null }).where(eq(campaignCharacterProfile.characterId, f.heroId));
  assert.equal(resolve(await readIncomingEffectTargetInTransaction(tx, f.godId, target)).finalEffect?.damage, 12);
});
isolated("direct Creature uses the exact negative runtime key and encounter snapshot, including old snapshots", async (tx, f) => {
  const target = { kind: "encounter-participant" as const, campaignId: f.campaignId, encounterId: f.encounterId, participantId: f.occurrences[0] };
  assert.ok(target.participantId < 0);
  const old = await readIncomingEffectTargetInTransaction(tx, f.godId, target);
  assert.equal(old.interactionRules, null); assert.equal(resolve(old).finalEffect?.damage, 12);
  const snapshot = { ...f.creatureSnapshot, core: { ...f.creatureSnapshot.core, interactionRules: rules(25, "creature") } };
  await tx.update(participant).set({ creatureSnapshotJson: snapshot }).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, target.participantId)));
  const [occurrence] = await tx.select().from(participant).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, target.participantId)));
  await tx.update(creature).set({ interactionRules: rules(100, "creature") }).where(eq(creature.id, occurrence.creatureId!));
  assert.equal(resolve(await readIncomingEffectTargetInTransaction(tx, f.godId, target)).finalEffect?.damage, 9, "master edits never replace occurrence rules");
  assert.equal(resolve(await readIncomingEffectTargetInTransaction(tx, f.godId, { ...target, participantId: f.occurrences[1] })).finalEffect?.damage, 12, "other occurrence remains independent");
  // Make the serial ID distinct from every runtime key to catch accidental participant_id queries.
  await tx.update(participant).set({ participantId: 1900000000 }).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, target.participantId)));
  assert.equal(resolve(await readIncomingEffectTargetInTransaction(tx, f.godId, target)).finalEffect?.damage, 9);
  await assert.rejects(readIncomingEffectTargetInTransaction(tx, f.godId, { ...target, participantId: 1900000000 }), /does not belong/);
  await assert.rejects(readIncomingEffectTargetInTransaction(tx, f.godId, { ...target, campaignId: f.campaignId + 100000 }), /does not belong/);
  await assert.rejects(readIncomingEffectTargetInTransaction(tx, f.godId, { ...target, encounterId: f.encounterId + 100000 }), /does not belong/);
});
isolated("Creature NPC current individual snapshot wins over baseline/master; worn remains separate", async (tx, f) => {
  const [occurrence] = await tx.select().from(participant).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, f.occurrences[0])));
  const snapshot = { ...f.creatureSnapshot, core: { ...f.creatureSnapshot.core, interactionRules: rules(25, "creature") }, hitLocations: [{ ...f.creatureSnapshot.hitLocations[0], naturalArmor: "2", soak: "1" }] };
  await tx.update(campaignCharacter).set({ npcKind: "creature" }).where(eq(campaignCharacter.id, f.defenderId));
  await tx.insert(campaignCreatureNpcProfile).values({ characterId: f.defenderId, creatureId: occurrence.creatureId!, baselineSnapshotJson: JSON.stringify(f.creatureSnapshot), currentSnapshotJson: JSON.stringify(snapshot) });
  await tx.update(creature).set({ interactionRules: rules(100, "creature") }).where(eq(creature.id, occurrence.creatureId!));
  const target = { kind: "character" as const, characterId: f.defenderId };
  const context = await readIncomingEffectTargetInTransaction(tx, f.godId, target);
  assert.equal(context.ruleSource.kind, "creature-snapshot"); assert.equal(resolve(context).finalEffect?.damage, 6);
  await equipArmor(tx, f.defenderId);
  const equipped = await readIncomingEffectTargetInTransaction(tx, f.godId, target);
  assert.equal(equipped.protection.worn[0].baseSoak, 3); assert.equal(resolve(equipped).finalEffect?.damage, 4);
  await tx.update(campaignCreatureNpcProfile).set({ currentSnapshotJson: JSON.stringify(f.creatureSnapshot) }).where(eq(campaignCreatureNpcProfile.characterId, f.defenderId));
  assert.equal((await readIncomingEffectTargetInTransaction(tx, f.godId, target)).interactionRules, null, "legacy individual snapshot never inherits current master rules");
});
async function equipArmor(tx: Tx, characterId: number) {
  const [armor] = await tx.insert(item).values({ canonicalId: `ARMOR-${crypto.randomUUID()}`.toUpperCase(), name: "Test Helmet", catalogScope: "equipment", equipmentGroup: "armor", recordType: "Armor", family: "Armor", category: "Armor", priceBasis: "unit" }).returning();
  await tx.insert(armorProfile).values({ itemId: armor.id, baseSoak: 3, coverage: "Head" });
  await tx.insert(armorLocationReference).values({ locationCode: "0", locationName: "Head", sortOrder: 0 }).onConflictDoNothing();
  await tx.insert(armorLocation).values({ itemId: armor.id, locationCode: "0" });
  await tx.insert(campaignCharacterItem).values({ characterId, itemId: armor.id, quantity: 1, unitCostCredits: 0 });
  await tx.insert(campaignCharacterItemEquipmentState).values({ characterId, itemId: armor.id, state: "worn", quantity: 1 });
}
isolated("Character and occurrence temporary Soak exclude ended/expired records", async (tx, f) => {
  await tx.insert(campaignCharacterActiveModifier).values([
    { characterId: f.heroId, label: "Ward", modifierChannel: "soak", targetKey: "self", amount: 2, sourceKind: "spell", sourceId: "ward", sourceName: "Ward", durationKind: "scene", durationLabel: "Scene" },
    { characterId: f.heroId, label: "Ended", modifierChannel: "soak", targetKey: "self", amount: 999, sourceKind: "spell", sourceId: "old", sourceName: "Ended", durationKind: "scene", durationLabel: "Scene", endedAt: new Date() },
  ]);
  const character = await readIncomingEffectTargetInTransaction(tx, f.godId, { kind: "character", characterId: f.heroId });
  assert.equal(character.protection.temporary.length, 1); assert.equal(resolve(character).finalEffect?.damage, 10);
  const target = { kind: "encounter-participant" as const, campaignId: f.campaignId, encounterId: f.encounterId, participantId: f.occurrences[0] };
  const [row] = await tx.select().from(participant).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, target.participantId)));
  await tx.update(participant).set({ localStateJson: { ...(row.localStateJson as object), modifiers: [
    { effectPlanEffectId: 1, label: "Ward", channel: "soak", targetKey: "self", amount: 3 },
    { effectPlanEffectId: 2, channel: "soak", targetKey: "self", amount: 999, expiredAt: "expired" },
  ] } }).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, target.participantId)));
  const direct = await readIncomingEffectTargetInTransaction(tx, f.godId, target);
  assert.equal(direct.protection.temporary.length, 1); assert.equal(resolve(direct).finalEffect?.damage, 9);
});
isolated("authorization rejects strangers and limits Players to their own Character, retaining admin reads", async (tx, f) => {
  const target = { kind: "character" as const, characterId: f.heroId };
  const outsider = `outsider-${crypto.randomUUID()}`;
  await tx.insert(user).values({ id: outsider, name: "Outsider", username: outsider, email: `${outsider}@example.invalid` });
  await tx.insert(userRole).values({ userId: outsider, role: "god" });
  await assert.rejects(readIncomingEffectTargetInTransaction(tx, outsider, target), /permission/);
  const direct = { kind: "encounter-participant" as const, campaignId: f.campaignId, encounterId: f.encounterId, participantId: f.occurrences[0] };
  await assert.rejects(readIncomingEffectTargetInTransaction(tx, outsider, direct), /permission/);
  await tx.delete(userRole).where(eq(userRole.userId, f.godId));
  await tx.insert(userRole).values({ userId: f.godId, role: "player" });
  assert.equal(resolve(await readIncomingEffectTargetInTransaction(tx, f.godId, target)).status, "resolved");
  await assert.rejects(readIncomingEffectTargetInTransaction(tx, f.godId, { ...target, characterId: f.defenderId }), /permission/);
  await assert.rejects(readIncomingEffectTargetInTransaction(tx, f.godId, direct), /permission/);
  await tx.insert(userRole).values({ userId: outsider, role: "admin" });
  assert.equal(resolve(await readIncomingEffectTargetInTransaction(tx, outsider, direct)).status, "resolved");
});
test("target read and repeated resolution succeed in a read-only transaction; all stored rows remain identical", async () => {
  const f = await db.transaction(fixture);
  const tables = (await pool.query<{ tablename: string }>("select tablename from pg_tables where schemaname='public' order by tablename")).rows;
  const digest = async () => {
    const entries = [];
    for (const { tablename } of tables) {
      assert.match(tablename, /^[a-z_]+$/);
      const rows = await pool.query(`select md5(coalesce(string_agg(row_to_json(t)::text, '' order by row_to_json(t)::text), '')) digest from "${tablename}" t`);
      entries.push([tablename, rows.rows[0].digest]);
    }
    return entries;
  };
  const before = await digest();
  await db.transaction(async (tx) => {
    for (const target of [{ kind: "character" as const, characterId: f.heroId }, { kind: "encounter-participant" as const, campaignId: f.campaignId, encounterId: f.encounterId, participantId: f.occurrences[0] }]) {
      const context = await readIncomingEffectTargetInTransaction(tx, f.godId, target);
      assert.deepEqual(resolve(context), resolve(context));
    }
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
  assert.deepEqual(await digest(), before, "no HP, effects, resources, Initiative, plans, authoring or any other stored rows changed");
});
