import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { race } from "@/db/race-schema";
import { creature } from "@/db/creature-schema";
import { item, itemProperty, armorProfile, armorLocation, armorLocationReference } from "@/db/item-schema";
import { campaignCharacter, campaignCharacterProfile, campaignCharacterAttribute, campaignCharacterActiveModifier, campaignCharacterItem, campaignCharacterItemEquipmentState, campaignCreatureNpcProfile } from "@/db/realm-schema";
import { campaignSessionEncounterParticipant as member, campaignSessionEncounterInitiativeParticipant as initiative, campaignSessionEncounterEffect as effect } from "@/db/tabletop-operations-schema";
import { createActionDeclarationDraftInTransaction, lockActionDeclarationInTransaction, commitActionDeclarationInTransaction } from "@/features/tabletop-operations/action-declaration-service";
import { generateActionEffectPlanInTransaction, applyRoutineCombatConsequencesInTransaction, ruleIncomingActionEffectInTransaction, approveActionEffectPlanInTransaction, applyActionEffectPlanInTransaction } from "@/features/tabletop-operations/action-effect-plan-service";
import { resolveDeclaredDefensesInTransaction } from "@/features/tabletop-operations/defense-intervention-service";
import { loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { advanceInitiativeTimeline } from "@/features/tabletop-operations/initiative-runtime";
import { storedIncomingResolution } from "@/features/incoming-effects/effect-proposal";
import { saveRaceNaturalProtectionInTransaction } from "@/features/races/race-natural-protection-service";
import { emptyCreatureAttackAuthoring, emptyCreatureAbilityAuthoring } from "@/features/creatures/creature-authoring";
import type { InteractionRule, InteractionRuleProfile } from "@/features/interaction-rules/interaction-rules";
import { completionServiceFixture, completionDraft } from "./fixtures/combat-completion-service-fixture";
import { readPlayerTabletopRuntimeInTransaction } from "@/features/tabletop-operations/player-tabletop-console-service";
import { derivedAbility, derivedAbilityCost, derivedAbilityEffect, characterDerivedAbility, characterDerivedAbilityUse, campaignAllowedDerivedAbility } from "@/db/derived-ability-schema";
import { recordCombatSourceResolutionInTransaction } from "@/features/tabletop-operations/combat-source-resolution-service";
import { campaignCharacterActiveCondition } from "@/db/realm-schema";
import { campaignCharacterActiveHealth } from "@/db/realm-schema";
import { derivedAbilityUseCondition } from "@/db/derived-ability-schema";
import { readAbilityFactsInTransaction } from "@/features/ability-use-conditions/fact-service";
import { reconcileCharacterDerivedAbilityPassivesInTransaction } from "@/features/derived-abilities/character-derived-ability-service";
import { addLearnedCombatSpell } from "./fixtures/combat-learned-spell-fixture";
import { readActiveManaInTransaction } from "@/features/active-state/active-mana-service";

if (process.env.SERRIAN_DISPOSABLE_COMBAT_COMPLETION !== "true") throw new Error("Use the disposable combat completion harness.");
after(() => pool.end());
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Fixture = Awaited<ReturnType<typeof fixture>>;
const rollback = new Error("PASS6_ROLLBACK");
function rules(kind: InteractionRule["ruleType"], percentage: number | null = null, condition: InteractionRule["conditions"][number] = { key: "slash", kind: "damage-type", damageType: "Slashing" }): InteractionRuleProfile {
  return { schemaVersion: 1, rules: [{ key: "rule", name: `Test ${kind}`, ruleType: kind, percentage, match: "ALL", scope: "damage", sortOrder: 0, notes: "Private test notes", conditions: [condition] }] };
}
async function fixture(tx: Tx, name: string) {
  const f = await completionServiceFixture(tx, name);
  await tx.insert(userRole).values([{ userId: f.godId, role: "god" }, { userId: f.godId, role: "player" }]);
  await tx.insert(campaignCharacterAttribute).values([f.heroId, f.defenderId].map((characterId) => ({ characterId, attributeKey: "CON" as const, value: 60 })));
  const snapshot = { ...f.creatureSnapshot, core: { ...f.creatureSnapshot.core, hpMultiplierSteps: 0, baseMovementSteps: 0, baseMagicSteps: 0 },
    attributes: [{ attributeKey: "CON", value: 60 }],
    attacks: f.creatureSnapshot.attacks.map((attack) => ({ ...attack, authoring: { ...emptyCreatureAttackAuthoring(), initiativeCost: 4, magical: false } })),
    hpPools: [{ canonicalId: "body", poolName: "Body", maximumHp: 30, hpPercentage: 100, sortOrder: 0 }],
    hitLocations: [{ hitLocationNumber: 0, locationName: "Body", bodyPartsIncluded: "Body", hpPoolCanonicalId: "body", naturalArmor: "0", soak: "0", sortOrder: 0 }] };
  await tx.update(member).set({ creatureSnapshotJson: snapshot }).where(and(eq(member.encounterId, f.encounterId), eq(member.participantKind, "creature")));
  return { ...f, snapshot };
}
function isolated(name: string, run: (tx: Tx, f: Fixture) => Promise<void>) {
  test(name, async () => assert.rejects(db.transaction(async (tx) => { await run(tx, await fixture(tx, name)); throw rollback; }), (error) => {
    if (error !== rollback) console.error(error); return error === rollback;
  }));
}
async function startAttack(tx: Tx, f: Fixture, actorId = f.heroId, targetId = f.occurrences[0], creatureAttack = false) {
  const engine = await loadInitiativeEngineInTransaction(tx, f.encounterId);
  const point = engine.runtime.timelineInitiative;
  await tx.update(initiative).set({ currentInitiative: point, normalTotalInitiative: 22, participationStatus: "active" }).where(and(eq(initiative.encounterId, f.encounterId), eq(initiative.characterId, actorId)));
  const actor = actorId === f.heroId ? f.player : f.god;
  const id = await createActionDeclarationDraftInTransaction(tx, f.context, actor, { ...completionDraft(actorId, targetId),
    sourceKind: creatureAttack ? "creature-attack" : "weapon", sourceRef: creatureAttack ? "fixture-shortsword" : null, weaponItemId: creatureAttack ? null : f.weaponId });
  await lockActionDeclarationInTransaction(tx, f.context, actor, id);
  await commitActionDeclarationInTransaction(tx, f.context, actor, id, { method: "entered", enteredTotal: 70 });
  await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, id);
  const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
  await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, point - 4));
  return id;
}
async function armor(tx: Tx, f: Fixture, targetId: number, amount = 1) {
  const [owned] = await tx.insert(item).values({ canonicalId: `P6-ARMOR-${crypto.randomUUID()}`.toUpperCase(), name: "Helmet", catalogScope: "equipment", equipmentGroup: "armor", recordType: "Armor", family: "Armor", category: "Armor", priceBasis: "unit", createdByUserId: f.godId }).returning();
  await tx.insert(armorProfile).values({ itemId: owned.id, baseSoak: amount, coverage: "Head" });
  await tx.insert(armorLocationReference).values({ locationCode: "0", locationName: "Head", sortOrder: 0 }).onConflictDoNothing();
  await tx.insert(armorLocation).values({ itemId: owned.id, locationCode: "0" });
  await tx.insert(campaignCharacterItem).values({ characterId: targetId, itemId: owned.id, quantity: 1, unitCostCredits: 0 });
  await tx.insert(campaignCharacterItemEquipmentState).values({ characterId: targetId, itemId: owned.id, state: "worn", quantity: 1 });
  return owned;
}

async function setRules(tx: Tx, f: Fixture, entries: InteractionRule[]) {
  await tx.update(member).set({ creatureSnapshotJson: { ...f.snapshot, core: { ...f.snapshot.core,
    interactionRules: { schemaVersion: 1, rules: entries.map((rule, index) => ({ ...rule, key: `rule-${index}`, sortOrder: index, crImpact: "None" })) } } },
    localStateJson: { health: { totalDamage: 20, poolDamage: { body: 20 } } } }).where(eq(member.characterId, f.occurrences[0]));
}
async function result(tx: Tx, f: Fixture, targetId = f.occurrences[0], actorId = f.heroId, creatureAttack = false) {
  const id = await startAttack(tx, f, actorId, targetId, creatureAttack);
  const planId = await generateActionEffectPlanInTransaction(tx, f.context, f.god, id);
  const [row] = await tx.select().from(effect).where(eq(effect.planId, planId));
  const resolution = storedIncomingResolution(row.authoredValueJson)!;
  assert.ok(resolution);
  assert.deepEqual(resolution.stages.map(({ key }) => key), ["source", "worn", "interaction", "natural", "temporary", "final"]);
  return { id, planId, row, resolution };
}
async function apply(tx: Tx, f: Fixture, outcome: Awaited<ReturnType<typeof result>>) {
  for (let retry = 0; retry < 3; retry++) assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.player, outcome.id, outcome.planId)).status, "applied");
}
isolated("Pass 6 private incoming ruling reasons never reach the Player before or after application", async (tx, f) => {
  await setRules(tx, f, [...rules("absorption", 50).rules, ...rules("immunity").rules]);
  const outcome = await result(tx, f);
  await ruleIncomingActionEffectInTransaction(tx, f.context, f.god, outcome.planId, outcome.row.id, { disposition: "damage", amount: 2, reason: "PRIVATE_INCOMING_RULING_SECRET" });
  for (const applied of [false, true]) {
    if (applied) {
      await approveActionEffectPlanInTransaction(tx, f.context, f.god, outcome.planId);
      await applyActionEffectPlanInTransaction(tx, f.context, f.god, outcome.planId);
    }
    const view = await readPlayerTabletopRuntimeInTransaction(tx, f.heroId, f.player.userId);
    assert.ok(view.combat);
    assert.doesNotMatch(JSON.stringify(view), /PRIVATE_INCOMING_RULING_SECRET|Private test notes/);
  }
});
const silver: InteractionRule["conditions"][number] = { key: "silver", kind: "item-property", propertyName: "Material", value: "Silver" };
const magic: InteractionRule["conditions"][number] = { key: "magic", kind: "magical", magical: true };

isolated("Pass 6 private Creature attack authoring is absent from the targeted Player's projection", async (tx, f) => {
  await tx.update(member).set({ creatureSnapshotJson: { ...f.snapshot, attacks: f.snapshot.attacks.map((attack) => ({ ...attack, specialEffect: "PRIVATE_CREATURE_EFFECT", requirements: "PRIVATE_CREATURE_REQUIREMENTS" })) } }).where(eq(member.characterId, f.occurrences[0]));
  await result(tx, f, f.heroId, f.occurrences[0], true);
  const view = await readPlayerTabletopRuntimeInTransaction(tx, f.heroId, f.player.userId);
  const paths: string[] = [];
  function inspect(value: unknown, path: string) {
    if (typeof value === "string" && value.includes("PRIVATE_CREATURE")) paths.push(path);
    else if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) inspect(child, `${path}.${key}`);
  }
  inspect(view, "player");
  assert.deepEqual(paths, []);
});

for (const identity of ["player", "race-npc", "creature-npc", "direct"] as const) {
  for (const [worn, natural, temporary] of [[0, 0, 0], [1, 0, 0], [0, 2, 0], [0, 0, 1], [1, 2, 0], [1, 2, 1]]) {
    if (identity === "direct" && worn) continue;
    isolated(`Pass 6 protection ${identity}: worn ${worn}, natural ${natural}, temporary ${temporary}`, async (tx, f) => {
      const characterTarget = identity === "player" ? f.heroId : f.defenderId;
      const target = identity === "direct" ? f.occurrences[1] : characterTarget;
      const actor = identity === "player" ? f.defenderId : f.heroId;
      if (identity === "creature-npc" || identity === "direct") {
        const snapshot = { ...f.snapshot, hitLocations: [{ ...f.snapshot.hitLocations[0], locationName: "Head", naturalArmor: String(natural), soak: "0" }] };
        if (identity === "direct") await tx.update(member).set({ creatureSnapshotJson: snapshot,
          localStateJson: { modifiers: temporary ? [{ id: "ward", label: "Ward", channel: "soak", targetKey: "self", amount: temporary }] : [] } }).where(eq(member.characterId, target));
        else {
          const [direct] = await tx.select().from(member).where(eq(member.characterId, f.occurrences[0]));
          await tx.update(campaignCharacter).set({ npcKind: "creature" }).where(eq(campaignCharacter.id, target));
          await tx.insert(campaignCreatureNpcProfile).values({ characterId: target, creatureId: direct.creatureId!, baselineSnapshotJson: JSON.stringify(snapshot), currentSnapshotJson: JSON.stringify(snapshot) });
          await tx.update(creature).set({ interactionRules: { ...rules("immunity"), rules: rules("immunity").rules.map((r) => ({ ...r, crImpact: "None" })) } }).where(eq(creature.id, direct.creatureId!));
        }
      } else {
        const [ancestry] = await tx.insert(race).values({ name: "Pass 6 target Race" }).returning();
        await tx.update(campaignCharacterProfile).set({ raceId: ancestry.id }).where(eq(campaignCharacterProfile.characterId, target));
        if (natural) await saveRaceNaturalProtectionInTransaction(tx, ancestry.id, [{ key: "hide", name: "Natural hide", coverage: { kind: "all" }, naturalArmor: natural, naturalSoak: 0, sortOrder: 0 }]);
      }
      if (worn) await armor(tx, f, target, worn);
      if (temporary && identity !== "direct") await tx.insert(campaignCharacterActiveModifier).values({ characterId: target, label: "Ward", modifierChannel: "soak", targetKey: "self", amount: temporary, sourceKind: "god", sourceId: "p6", sourceName: "Ward", durationKind: "scene", durationLabel: "This scene" });
      const outcome = await result(tx, f, target, actor);
      assert.equal(outcome.resolution.status, "resolved");
      assert.equal(outcome.resolution.input.effect.amount, 6);
      assert.equal(outcome.resolution.finalEffect?.damage, 6 - worn - natural - temporary);
      const layers = outcome.resolution.input.target.protection;
      assert.equal(layers.worn.length, worn ? 1 : 0);
      assert.equal(layers.temporary.length, temporary ? 1 : 0);
      assert.equal(layers.natural[0]?.source.kind ?? "none", identity === "direct" || identity === "creature-npc" ? "creature-snapshot" : natural ? "race" : "none");
      await approveActionEffectPlanInTransaction(tx, f.context, f.god, outcome.planId);
      for (let retry = 0; retry < 2; retry++) assert.equal(await applyActionEffectPlanInTransaction(tx, f.context, f.god, outcome.planId), "applied");
    });
  }
}

for (const mode of ["silver", "magical", "ANY", "ALL", "independent"] as const) for (const material of ["Steel", "Silver"]) for (const magical of [false, true]) {
  isolated(`Pass 6 Requirement ${mode}, ${material}, Magical ${magical}`, async (tx, f) => {
    await tx.insert(itemProperty).values({ itemId: f.weaponId, propertyName: "Material", value: material });
    await tx.update(item).set({ isMagical: magical }).where(eq(item.id, f.weaponId));
    const base = rules("requirement").rules[0];
    const entries = mode === "independent" ? [{ ...base, conditions: [silver] }, { ...base, conditions: [magic] }]
      : [{ ...base, match: mode === "ANY" ? "ANY" as const : "ALL" as const, conditions: mode === "silver" ? [silver] : mode === "magical" ? [magic] : [silver, magic] }];
    await setRules(tx, f, entries);
    const allowed = mode === "silver" ? material === "Silver" : mode === "magical" ? magical : mode === "ANY" ? material === "Silver" || magical : material === "Silver" && magical;
    const outcome = await result(tx, f);
    assert.equal(outcome.resolution.status, allowed ? "resolved" : "prevented");
    assert.equal(outcome.resolution.finalEffect?.damage, allowed ? 6 : 0);
    await apply(tx, f, outcome);
  });
}

for (const [name, factors, expected] of [
  ["multiple Resistance", [["resistance", 25], ["resistance", 25]], 4],
  ["multiple Vulnerability", [["vulnerability", 25], ["vulnerability", 25]], 10],
  ["Resistance and Vulnerability", [["resistance", 25], ["vulnerability", 25]], 6],
  ["above 100 Resistance", [["resistance", 150]], 0],
  ["above 100 Vulnerability", [["vulnerability", 150]], 15],
] as const) isolated(`Pass 6 ${name} multiplies without intermediate rounding`, async (tx, f) => {
  await setRules(tx, f, factors.map(([kind, percentage], index) => ({ ...rules(kind, percentage).rules[0], sortOrder: index })));
  const outcome = await result(tx, f);
  assert.equal(outcome.resolution.finalEffect?.damage, expected); assert.equal(outcome.resolution.finalEffect?.healing, 0);
  assert.deepEqual(outcome.resolution.matchedRules.map(({ ruleType, percentage }) => [ruleType, percentage]), factors.map((factor) => [...factor]));
  await apply(tx, f, outcome);
});

for (const percentage of [50, 100, 150]) isolated(`Pass 6 ${percentage}% Absorption skips natural and temporary and caps same pool once`, async (tx, f) => {
  await setRules(tx, f, rules("absorption", percentage).rules);
  const [before] = await tx.select().from(member).where(eq(member.characterId, f.occurrences[0]));
  const snapshot = before.creatureSnapshotJson as typeof f.snapshot;
  await tx.update(member).set({ creatureSnapshotJson: { ...snapshot, hitLocations: [{ ...snapshot.hitLocations[0], naturalArmor: "9", soak: "9" }] },
    localStateJson: { health: { totalDamage: 2, poolDamage: { body: 2 } }, modifiers: [{ id: "ward", label: "Ward", channel: "soak", targetKey: "self", amount: 9 }] } }).where(eq(member.characterId, f.occurrences[0]));
  const outcome = await result(tx, f);
  assert.equal(outcome.resolution.finalEffect?.damage, 0); assert.equal(outcome.resolution.finalEffect?.healing, 6 * percentage / 100);
  for (const key of ["natural", "temporary"]) assert.equal(outcome.resolution.stages.find((stage) => stage.key === key)?.status, "skipped");
  await apply(tx, f, outcome);
  const [after] = await tx.select().from(member).where(eq(member.characterId, f.occurrences[0]));
  assert.deepEqual((after.localStateJson as { health: unknown }).health, { totalDamage: 0, poolDamage: { body: 0 } });
});

for (const conflict of ["immunity", "resistance", "vulnerability", "absorption"] as const) for (const disposition of ["damage", "healing", "prevent"] as const) {
  isolated(`Pass 6 Absorption + ${conflict}: explicit ${disposition} keeps original evidence`, async (tx, f) => {
    await setRules(tx, f, [...rules("absorption", 50).rules, ...rules(conflict, conflict === "immunity" ? null : 50).rules]);
    const outcome = await result(tx, f);
    assert.equal(outcome.resolution.status, "requires-god-ruling"); assert.equal(outcome.resolution.finalEffect, null);
    assert.ok(outcome.resolution.candidates.length >= 2);
    await assert.rejects(ruleIncomingActionEffectInTransaction(tx, f.context, { authority: "god-owner", userId: "unrelated-god" }, outcome.planId, outcome.row.id, { disposition, amount: 2, reason: "Unauthorized" }), /G.O.D.|owning|authority/i);
    await ruleIncomingActionEffectInTransaction(tx, f.context, f.god, outcome.planId, outcome.row.id, { disposition, amount: 2, reason: "Explicit case ruling; no general precedence authored" });
    await approveActionEffectPlanInTransaction(tx, f.context, f.god, outcome.planId);
    for (let retry = 0; retry < 3; retry++) assert.equal(await applyActionEffectPlanInTransaction(tx, f.context, f.god, outcome.planId), "applied");
    assert.deepEqual((await tx.select().from(effect).where(eq(effect.id, outcome.row.id)))[0].authoredValueJson, outcome.row.authoredValueJson);
    const [target] = await tx.select().from(member).where(eq(member.characterId, f.occurrences[0]));
    assert.equal((target.localStateJson as { health: { totalDamage: number } }).health.totalDamage, disposition === "damage" ? 22 : disposition === "healing" ? 18 : 20);
  });
}

for (const boundary of ["worn-overlap", "natural-overlap", "armor-metadata"] as const) isolated(`Pass 6 ${boundary} stops with exact sources`, async (tx, f) => {
  if (boundary === "natural-overlap") {
    const [ancestry] = await tx.insert(race).values({ name: "Overlapping natural protection" }).returning();
    await tx.update(campaignCharacterProfile).set({ raceId: ancestry.id }).where(eq(campaignCharacterProfile.characterId, f.defenderId));
    await saveRaceNaturalProtectionInTransaction(tx, ancestry.id, [1, 2].map((amount) => ({ key: `hide-${amount}`, name: `Hide ${amount}`, coverage: { kind: "all" }, naturalArmor: amount, naturalSoak: 0, sortOrder: amount })));
  } else {
    const first = await armor(tx, f, f.defenderId, 1);
    if (boundary === "worn-overlap") await armor(tx, f, f.defenderId, 2);
    else await tx.update(armorProfile).set({ damageModifiersSourceText: "Fire +2" }).where(eq(armorProfile.itemId, first.id));
  }
  const outcome = await result(tx, f, f.defenderId);
  assert.equal(outcome.resolution.status, "requires-god-ruling"); assert.equal(outcome.resolution.finalEffect, null);
  const layers = outcome.resolution.input.target.protection;
  if (boundary === "worn-overlap") assert.deepEqual(layers.worn.map(({ baseSoak }) => baseSoak), [1, 2]);
  if (boundary === "natural-overlap") assert.deepEqual(layers.natural.map(({ armor }) => armor), [1, 2]);
  if (boundary === "armor-metadata") assert.equal(layers.worn[0].damageModifiersSourceText, "Fire +2");
});

for (const targetKind of ["creature-npc", "direct"] as const) isolated(`Pass 6 direct Creature attacks ${targetKind} using complete base plus accepted Roll successes`, async (tx, f) => {
  const target = targetKind === "direct" ? f.occurrences[1] : f.defenderId;
  if (targetKind === "creature-npc") {
    const [direct] = await tx.select().from(member).where(eq(member.characterId, f.occurrences[0]));
    await tx.update(campaignCharacter).set({ npcKind: "creature" }).where(eq(campaignCharacter.id, target));
    await tx.insert(campaignCreatureNpcProfile).values({ characterId: target, creatureId: direct.creatureId!, baselineSnapshotJson: JSON.stringify(f.snapshot), currentSnapshotJson: JSON.stringify(f.snapshot) });
  }
  const outcome = await result(tx, f, target, f.occurrences[0], true);
  assert.equal(outcome.resolution.input.effect.amount, 6, "authored 4 + accepted extra-success 2, no Character attribute bonus");
  await approveActionEffectPlanInTransaction(tx, f.context, f.god, outcome.planId);
  assert.equal(await applyActionEffectPlanInTransaction(tx, f.context, f.god, outcome.planId), "applied");
});

isolated("Pass 6 Absorption uses post-Worn damage, skipping Race natural and temporary protection", async (tx, f) => {
  const [ancestry] = await tx.insert(race).values({ name: "Absorbing armor wearer", interactionRules: rules("absorption", 50) }).returning();
  await tx.update(campaignCharacterProfile).set({ raceId: ancestry.id }).where(eq(campaignCharacterProfile.characterId, f.defenderId));
  await saveRaceNaturalProtectionInTransaction(tx, ancestry.id, [{ key: "hide", name: "Hide", coverage: { kind: "all" }, naturalArmor: 8, naturalSoak: 9, sortOrder: 0 }]);
  await armor(tx, f, f.defenderId, 2);
  await tx.insert(campaignCharacterActiveModifier).values({ characterId: f.defenderId, label: "Ward", modifierChannel: "soak", targetKey: "self", amount: 9, sourceKind: "god", sourceId: "p6", sourceName: "Ward", durationKind: "scene", durationLabel: "This scene" });
  const outcome = await result(tx, f, f.defenderId);
  assert.equal(outcome.resolution.status, "absorbed"); assert.equal(outcome.resolution.stages[1].damageAfter, 4);
  assert.equal(outcome.resolution.finalEffect?.healing, 2); assert.equal(outcome.resolution.finalEffect?.damage, 0);
  assert.equal(outcome.resolution.stages[3].status, "skipped"); assert.equal(outcome.resolution.stages[4].status, "skipped");
  await apply(tx, f, outcome);
});

test("Pass 6 concurrent Derived commitment, plan generation and application retain one spend, receipt and condition", async () => {
  const prepared = await db.transaction(async (tx) => {
    const f = await fixture(tx, "pass6-concurrent-use");
    const [ability] = await tx.insert(derivedAbility).values({ name: "Concurrent Ward", acquisitionType: "awarded", activationType: "activated", createdByUserId: f.godId }).returning();
    await tx.insert(campaignAllowedDerivedAbility).values({ campaignId: f.campaignId, derivedAbilityId: ability.id });
    await tx.insert(characterDerivedAbility).values({ characterId: f.heroId, derivedAbilityId: ability.id, acquisitionMethod: "awarded", acquiredByUserId: f.godId });
    await tx.insert(derivedAbilityCost).values({ derivedAbilityId: ability.id, costType: "initiative", amount: 4 });
    await tx.insert(derivedAbilityEffect).values({ derivedAbilityId: ability.id, sortOrder: 0, schemaVersion: 2, effectJson: { kind: "condition.apply", name: "One concurrent Ward", description: "Apply exactly once", duration: { kind: "scene" } } });
    const sourceRef = `derived-ability:${ability.id}`;
    await recordCombatSourceResolutionInTransaction(tx, f.context, f.god, { participantId: f.heroId, sourceKind: "derived-ability", sourceRef, mode: "automatic-no-roll", governing: null, effectScaling: {}, reason: "Explicit authored automatic use" });
    await tx.update(initiative).set({ participationStatus: "active" }).where(eq(initiative.characterId, f.heroId));
    const id = await createActionDeclarationDraftInTransaction(tx, f.context, f.player, { ...completionDraft(f.heroId, f.defenderId), sourceKind: "derived-ability", sourceRef, actionKind: "ability-use", windowKind: "ordinary" });
    await lockActionDeclarationInTransaction(tx, f.context, f.player, id);
    return { f, id };
  });
  const { f, id } = prepared;
  const pending = await Promise.all(Array.from({ length: 4 }, () => db.transaction((tx) => commitActionDeclarationInTransaction(tx, f.context, f.player, id))));
  assert.equal(new Set(pending).size, 1);
  await db.transaction(async (tx) => {
    const state = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    assert.equal(state.participants.find(({ characterId }) => characterId === f.heroId)?.currentInitiative, 22);
    const commitments = state.pendingActions.filter(({ actorCharacterId, id }) => actorCharacterId === f.heroId && id !== f.pendingActionId);
    assert.equal(commitments.length, 1); assert.equal(commitments[0].originalInitiativeCost, 4);
    await persistInitiativeEngineInTransaction(tx, f.context, state, advanceInitiativeTimeline(state, 18));
    assert.equal((await loadInitiativeEngineInTransaction(tx, f.encounterId)).participants.find(({ characterId }) => characterId === f.heroId)?.currentInitiative, 18);
  });
  const plans = await Promise.all(Array.from({ length: 4 }, () => db.transaction((tx) => generateActionEffectPlanInTransaction(tx, f.context, f.god, id))));
  assert.equal(new Set(plans).size, 1);
  const applications = await Promise.all(Array.from({ length: 4 }, () => db.transaction((tx) => applyRoutineCombatConsequencesInTransaction(tx, f.context, f.player, id, plans[0]))));
  assert.ok(applications.every(({ status }) => status === "applied"));
  assert.equal((await db.select().from(characterDerivedAbilityUse).where(eq(characterDerivedAbilityUse.characterId, f.heroId))).length, 1);
  assert.equal((await db.select().from(campaignCharacterActiveCondition).where(and(eq(campaignCharacterActiveCondition.characterId, f.defenderId), eq(campaignCharacterActiveCondition.name, "One concurrent Ward")))).length, 1);
});

isolated("Pass 6 HP-gated passive ends below 50%, restores above it and preserves established state for unknown facts", async (tx, f) => {
  const [ability] = await tx.insert(derivedAbility).values({ name: "Healthy Guard", acquisitionType: "awarded", activationType: "passive", createdByUserId: f.godId }).returning();
  await tx.insert(campaignAllowedDerivedAbility).values({ campaignId: f.campaignId, derivedAbilityId: ability.id });
  await tx.insert(characterDerivedAbility).values({ characterId: f.heroId, derivedAbilityId: ability.id, acquisitionMethod: "awarded", acquiredByUserId: f.godId });
  await tx.insert(derivedAbilityEffect).values({ derivedAbilityId: ability.id, sortOrder: 0, schemaVersion: 2, effectJson: { kind: "condition.apply", name: "Healthy Guard", description: "While healthy", duration: { kind: "until-removed" } } });
  await tx.insert(derivedAbilityUseCondition).values({ derivedAbilityId: ability.id, conditionType: "state", conditionKey: "state.hp-percent", operator: "gte", numericValue: 50 });
  const facts = await readAbilityFactsInTransaction(tx, { ...f.context, participantId: f.heroId, requestedKeys: ["state.maximum-hp"] });
  const maximum = Number(facts.get("state.maximum-hp")?.value); assert.ok(maximum > 0);
  for (const [damageFraction, expectedField] of [[0.3, "created"], [0.6, "resolved"], [0.3, "created"]] as const) {
    await tx.update(campaignCharacterActiveHealth).set({ totalDamage: Math.floor(maximum * damageFraction) }).where(eq(campaignCharacterActiveHealth.characterId, f.heroId));
    assert.equal((await reconcileCharacterDerivedAbilityPassivesInTransaction(tx, f.heroId, f.godId))[expectedField].length, 1);
  }
  await tx.update(derivedAbilityUseCondition).set({ conditionKey: "custom.unknown-health" }).where(eq(derivedAbilityUseCondition.derivedAbilityId, ability.id));
  const pending = await reconcileCharacterDerivedAbilityPassivesInTransaction(tx, f.heroId, f.godId);
  assert.equal(pending.resolved.length, 0); assert.equal(pending.manualSteps.length, 1);
});

isolated("Pass 6 direct Creature attack edits affect the next action, never a locked source", async (tx, f) => {
  const first = await startAttack(tx, f, f.occurrences[0], f.heroId, true);
  await tx.update(member).set({ creatureSnapshotJson: { ...f.snapshot, attacks: f.snapshot.attacks.map((attack) => ({ ...attack, damage: "8", authoring: { ...attack.authoring, magical: true } })) } }).where(eq(member.characterId, f.occurrences[0]));
  const planId = await generateActionEffectPlanInTransaction(tx, f.context, f.god, first);
  const [original] = await tx.select().from(effect).where(eq(effect.planId, planId));
  assert.equal(storedIncomingResolution(original.authoredValueJson)?.input.effect.amount, 6);
  assert.equal(storedIncomingResolution(original.authoredValueJson)?.input.source.magical, false);
  await approveActionEffectPlanInTransaction(tx, f.context, f.god, planId); await applyActionEffectPlanInTransaction(tx, f.context, f.god, planId);
  const second = await result(tx, f, f.heroId, f.occurrences[0], true);
  assert.equal(second.resolution.input.effect.amount, 10); assert.equal(second.resolution.input.source.magical, true);
  assert.deepEqual((await tx.select().from(effect).where(eq(effect.id, original.id)))[0].authoredValueJson, original.authoredValueJson);
});

for (const limitation of ["direct-resource", "direct-limit", "npc-mana"] as const) isolated(`Pass 6 Creature Ability ${limitation} uses its supported authority or stops explicitly`, async (tx, f) => {
  const actorId = limitation === "npc-mana" ? f.defenderId : f.occurrences[0];
  const ability = { canonicalId: "p6-resource", abilityName: "Resource Ability", effects: [{ effectKey: "damage", schemaVersion: 2, effect: { kind: "health.damage", amount: 8, application: "localized" } }],
    authoring: { ...emptyCreatureAbilityAuthoring(), activationType: "activated", initiativeCost: 3, magical: true,
      costs: limitation === "direct-limit" ? [] : [{ costType: "mana", amount: 2, resourceKey: "Spellcraft", notes: "Authored Mana cost", sortOrder: 0 }],
      useLimits: limitation === "direct-limit" ? [{ maximumUses: 1, refreshScope: "scene", notes: "Once per scene", sortOrder: 0 }] : [] } };
  const snapshot = { ...f.snapshot, abilities: [ability] };
  if (limitation === "npc-mana") {
    const [direct] = await tx.select().from(member).where(eq(member.characterId, f.occurrences[0]));
    await tx.update(campaignCharacter).set({ npcKind: "creature" }).where(eq(campaignCharacter.id, actorId));
    await tx.insert(campaignCreatureNpcProfile).values({ characterId: actorId, creatureId: direct.creatureId!, baselineSnapshotJson: JSON.stringify(snapshot), currentSnapshotJson: JSON.stringify(snapshot) });
    await addLearnedCombatSpell(tx, { heroId: actorId, godId: f.godId });
  } else await tx.update(member).set({ creatureSnapshotJson: snapshot }).where(eq(member.characterId, actorId));
  await tx.update(initiative).set({ participationStatus: "active" }).where(eq(initiative.characterId, actorId));
  const target = f.occurrences[1];
  const id = await createActionDeclarationDraftInTransaction(tx, f.context, f.god, { ...completionDraft(actorId, target), sourceKind: "creature-ability", sourceRef: ability.canonicalId, actionKind: "ability-use", windowKind: "ordinary", sourcePayload: { effectSelections: { [`damage:${target}`]: { hitLocationNumber: 0, poolKey: "body" } } } });
  await lockActionDeclarationInTransaction(tx, f.context, f.god, id);
  if (limitation !== "npc-mana") {
    await assert.rejects(commitActionDeclarationInTransaction(tx, f.context, f.god, id), limitation === "direct-limit" ? /no persistent ledger/ : /explicit G.O.D. resource ruling/);
    return;
  }
  const mana = async () => (await readActiveManaInTransaction(tx, actorId)).pools.find(({ system }) => system === "Spellcraft")!.currentMana;
  const beforeMana = await mana(); assert.ok(beforeMana >= 2);
  const pending = await commitActionDeclarationInTransaction(tx, f.context, f.god, id);
  assert.equal(await commitActionDeclarationInTransaction(tx, f.context, f.god, id), pending); assert.equal(await mana(), beforeMana - 2);
  const state = await loadInitiativeEngineInTransaction(tx, f.encounterId);
  await persistInitiativeEngineInTransaction(tx, f.context, state, advanceInitiativeTimeline(state, 19));
  const planId = await generateActionEffectPlanInTransaction(tx, f.context, f.god, id);
  for (let retry = 0; retry < 2; retry++) assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.god, id, planId)).status, "applied");
  assert.equal(await mana(), beforeMana - 2);
});
