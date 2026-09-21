import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { race } from "@/db/race-schema";
import { creature } from "@/db/creature-schema";
import { item, itemProperty, itemPower, itemPowerEffect, itemPowerConstruction, itemPowerSource, armorProfile, armorLocation, armorLocationReference } from "@/db/item-schema";
import { skillExtension } from "@/db/skill-schema";
import { createContainer, createEmptySpell } from "@/features/spell-construction/utilities/spellFactory";
import { validateItemPowers, type ItemPower } from "@/features/items/item-powers";
import { derivedAbility, derivedAbilityCost, derivedAbilityEffect, derivedAbilityUseCondition, characterDerivedAbility, characterDerivedAbilityUse, campaignAllowedDerivedAbility } from "@/db/derived-ability-schema";
import { recordCombatSourceResolutionInTransaction } from "@/features/tabletop-operations/combat-source-resolution-service";
import { campaignCharacter, campaignCharacterProfile, campaignCharacterAttribute, campaignCharacterActiveModifier,
  campaignCharacterActiveCondition, campaignCharacterItem, campaignCharacterItemEquipmentState, campaignCreatureNpcProfile } from "@/db/realm-schema";
import { campaignSessionEncounterParticipant as member, campaignSessionEncounterInitiativeParticipant as initiative,
  campaignSessionEncounterEffect as effect, campaignSessionEncounterEffectPlan as plan, campaignSessionEncounterResponderOpportunity as opportunity,
  campaignSessionEncounterActionDeclaration as declaration } from "@/db/tabletop-operations-schema";
import { createActionDeclarationDraftInTransaction, lockActionDeclarationInTransaction, commitActionDeclarationInTransaction } from "@/features/tabletop-operations/action-declaration-service";
import { generateActionEffectPlanInTransaction, applyRoutineCombatConsequencesInTransaction, ruleIncomingActionEffectInTransaction,
  approveActionEffectPlanInTransaction, applyActionEffectPlanInTransaction, readActionEffectWorkspaceInTransaction } from "@/features/tabletop-operations/action-effect-plan-service";
import { resolveDeclaredDefensesInTransaction, declareDefenseInterventionInTransaction } from "@/features/tabletop-operations/defense-intervention-service";
import { loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { advanceInitiativeTimeline } from "@/features/tabletop-operations/initiative-runtime";
import { readAbilityResponseChoicesInTransaction } from "@/features/tabletop-operations/ability-response-service";
import { readAbilityFactsInTransaction } from "@/features/ability-use-conditions/fact-service";
import { evaluateAbilityUseCondition } from "@/features/ability-use-conditions/facts";
import { readIncomingEffectEncounterTargetInTransaction } from "@/features/incoming-effects/incoming-effect-target-service";
import { storedIncomingResolution } from "@/features/incoming-effects/effect-proposal";
import { saveRaceNaturalProtectionInTransaction } from "@/features/races/race-natural-protection-service";
import { emptyCreatureAttackAuthoring, emptyCreatureAbilityAuthoring } from "@/features/creatures/creature-authoring";
import type { InteractionRule, InteractionRuleProfile } from "@/features/interaction-rules/interaction-rules";
import { completionServiceFixture, completionDraft } from "./fixtures/combat-completion-service-fixture";

if (process.env.SERRIAN_DISPOSABLE_COMBAT_COMPLETION !== "true") throw new Error("Use the disposable combat completion harness.");
after(() => pool.end());
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Fixture = Awaited<ReturnType<typeof fixture>>;
const rollback = new Error("PASS5_ROLLBACK");
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
  const [owned] = await tx.insert(item).values({ canonicalId: `P5-ARMOR-${crypto.randomUUID()}`.toUpperCase(), name: "Helmet", catalogScope: "equipment", equipmentGroup: "armor", recordType: "Armor", family: "Armor", category: "Armor", priceBasis: "unit", createdByUserId: f.godId }).returning();
  await tx.insert(armorProfile).values({ itemId: owned.id, baseSoak: amount, coverage: "Head" });
  await tx.insert(armorLocationReference).values({ locationCode: "0", locationName: "Head", sortOrder: 0 }).onConflictDoNothing();
  await tx.insert(armorLocation).values({ itemId: owned.id, locationCode: "0" });
  await tx.insert(campaignCharacterItem).values({ characterId: targetId, itemId: owned.id, quantity: 1, unitCostCredits: 0 });
  await tx.insert(campaignCharacterItemEquipmentState).values({ characterId: targetId, itemId: owned.id, state: "worn", quantity: 1 });
  return owned;
}
for (const [kind, percent, expected, status] of [["resistance", 50, 3, "resolved"], ["vulnerability", 50, 9, "resolved"], ["immunity", null, 0, "prevented"], ["absorption", 50, 0, "absorbed"]] as const) {
  isolated(`ordinary attack integrates ${kind} through an actual ActionEffectPlan`, async (tx, f) => {
    const profile = rules(kind, percent);
    await tx.update(member).set({ creatureSnapshotJson: { ...f.snapshot, core: { ...f.snapshot.core, interactionRules: { ...profile, rules: profile.rules.map((rule) => ({ ...rule, crImpact: "None" })) } } },
      localStateJson: { health: { totalDamage: 10, poolDamage: { body: 10 } } } }).where(eq(member.characterId, f.occurrences[0]));
    const id = await startAttack(tx, f), planId = await generateActionEffectPlanInTransaction(tx, f.context, f.god, id);
    const [row] = await tx.select().from(effect).where(eq(effect.planId, planId));
    const resolution = storedIncomingResolution(row.authoredValueJson)!;
    assert.equal(resolution.status, status); assert.equal(resolution.input.effect.amount, 6); assert.equal(resolution.finalEffect?.damage, expected);
    for (let retry = 0; retry < 2; retry++) assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.player, id, planId)).status, "applied");
    const [target] = await tx.select().from(member).where(eq(member.characterId, f.occurrences[0]));
    assert.equal((target.localStateJson as { health: { totalDamage: number } }).health.totalDamage, kind === "absorption" ? 7 : 10 + expected);
  });
}
for (const [material, magical, required, expected] of [["Silver", false, "silver", "resolved"], ["Steel", false, "silver", "prevented"], ["Steel", true, "magical", "resolved"], ["Steel", false, "magical", "prevented"]] as const) {
  isolated(`weapon Requirement ${required}: ${material}, Magical ${magical}`, async (tx, f) => {
    await tx.insert(itemProperty).values({ itemId: f.weaponId, propertyName: "Material", value: material });
    await tx.update(item).set({ isMagical: magical }).where(eq(item.id, f.weaponId));
    const [ancestry] = await tx.insert(race).values({ name: "Required Race", interactionRules: rules("requirement", null,
      required === "silver" ? { key: "material", kind: "item-property", propertyName: "Material", value: "Silver" } : { key: "magical", kind: "magical", magical: true }) }).returning();
    await tx.update(campaignCharacterProfile).set({ raceId: ancestry.id }).where(eq(campaignCharacterProfile.characterId, f.defenderId));
    const id = await startAttack(tx, f, f.heroId, f.defenderId);
    const planId = await generateActionEffectPlanInTransaction(tx, f.context, f.god, id);
    const [row] = await tx.select().from(effect).where(eq(effect.planId, planId));
    assert.equal(storedIncomingResolution(row.authoredValueJson)?.status, expected);
  });
}
isolated("worn, Race natural and temporary protection resolve once and plans survive all live edits", async (tx, f) => {
  const [ancestry] = await tx.insert(race).values({ name: "Protected Race", interactionRules: rules("resistance", 20) }).returning();
  await tx.update(campaignCharacterProfile).set({ raceId: ancestry.id }).where(eq(campaignCharacterProfile.characterId, f.defenderId));
  await saveRaceNaturalProtectionInTransaction(tx, ancestry.id, [{ key: "hide", name: "Hide", coverage: { kind: "all" }, naturalSoak: 1, sortOrder: 0 }]);
  const helmet = await armor(tx, f, f.defenderId);
  const [modifier] = await tx.insert(campaignCharacterActiveModifier).values({ characterId: f.defenderId, label: "Ward", modifierChannel: "soak", targetKey: "self", amount: 1, sourceKind: "god", sourceId: "p5", sourceName: "Ward", durationKind: "scene", durationLabel: "This scene" }).returning();
  const [material] = await tx.insert(itemProperty).values({ itemId: f.weaponId, propertyName: "Material", value: "Silver" }).returning();
  const id = await startAttack(tx, f, f.heroId, f.defenderId), planId = await generateActionEffectPlanInTransaction(tx, f.context, f.god, id);
  const [before] = await tx.select().from(effect).where(eq(effect.planId, planId));
  assert.equal(storedIncomingResolution(before.authoredValueJson)?.finalEffect?.damage, 2, "(6 - 1 worn) * .8 - 1 natural - 1 temporary");
  await tx.update(race).set({ interactionRules: rules("immunity") }).where(eq(race.id, ancestry.id));
  await saveRaceNaturalProtectionInTransaction(tx, ancestry.id, [{ key: "hide", name: "Hide", coverage: { kind: "all" }, naturalSoak: 9, sortOrder: 0 }]);
  await tx.update(armorProfile).set({ baseSoak: 9 }).where(eq(armorProfile.itemId, helmet.id));
  await tx.update(campaignCharacterActiveModifier).set({ amount: 9 }).where(eq(campaignCharacterActiveModifier.id, modifier.id));
  await tx.update(itemProperty).set({ value: "Steel" }).where(eq(itemProperty.id, material.id));
  assert.equal(await generateActionEffectPlanInTransaction(tx, f.context, f.god, id), planId);
  assert.deepEqual((await tx.select().from(effect).where(eq(effect.id, before.id)))[0], before);
  assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.player, id, planId)).status, "applied");
  const second = await startAttack(tx, f, f.heroId, f.defenderId), secondPlan = await generateActionEffectPlanInTransaction(tx, f.context, f.god, second);
  const [after] = await tx.select().from(effect).where(eq(effect.planId, secondPlan));
  assert.equal(storedIncomingResolution(after.authoredValueJson)?.status, "prevented");
  assert.equal(storedIncomingResolution(after.authoredValueJson)?.input.source.itemProperties?.[0].value, "Steel");
});
for (const direction of ["direct-character", "character-direct", "npc-character", "character-npc"] as const) isolated(`exact Creature source/target integration ${direction}`, async (tx, f) => {
  const [occurrence] = await tx.select().from(member).where(eq(member.characterId, f.occurrences[0]));
  await tx.update(campaignCharacter).set({ npcKind: "creature" }).where(eq(campaignCharacter.id, f.defenderId));
  await tx.insert(campaignCreatureNpcProfile).values({ characterId: f.defenderId, creatureId: occurrence.creatureId!, baselineSnapshotJson: JSON.stringify(f.snapshot), currentSnapshotJson: JSON.stringify(f.snapshot) });
  await tx.update(creature).set({ canonicalName: "Edited master", interactionRules: { ...rules("immunity"), rules: rules("immunity").rules.map((rule) => ({ ...rule, crImpact: "None" })) } }).where(eq(creature.id, occurrence.creatureId!));
  const creatureAttacks = direction === "direct-character" || direction === "npc-character";
  const actorId = direction === "direct-character" ? f.occurrences[0] : direction === "npc-character" ? f.defenderId : f.heroId;
  const targetId = creatureAttacks ? f.heroId : direction === "character-direct" ? f.occurrences[0] : f.defenderId;
  if (direction === "character-npc") await armor(tx, f, f.defenderId, 1);
  const id = await startAttack(tx, f, actorId, targetId, creatureAttacks), planId = await generateActionEffectPlanInTransaction(tx, f.context, f.god, id);
  const [row] = await tx.select().from(effect).where(eq(effect.planId, planId));
  const resolution = storedIncomingResolution(row.authoredValueJson)!;
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.finalEffect?.damage, direction === "character-npc" ? 5 : 6);
  assert.equal(resolution.input.target.ruleSource.kind, creatureAttacks ? "none" : "creature-snapshot");
});
isolated("unknown Magical Derived-style source requires a ruling with its original resolver calculation retained", async (tx, f) => {
  const profile = rules("requirement", null, { key: "magic", kind: "magical", magical: true });
  await tx.update(member).set({ creatureSnapshotJson: { ...f.snapshot, core: { ...f.snapshot.core, interactionRules: { ...profile, rules: profile.rules.map((rule) => ({ ...rule, crImpact: "None" })) } } } }).where(eq(member.characterId, f.occurrences[0]));
  const id = await startAttack(tx, f);
  const [locked] = await tx.select().from(declaration).where(eq(declaration.id, id));
  const snapshot = locked.lockedSnapshotJson as { authoredSource: { incomingSourceFacts: { magical: boolean | null } } };
  snapshot.authoredSource.incomingSourceFacts.magical = null; // explicit legacy unknown fact fixture
  await tx.update(declaration).set({ lockedSnapshotJson: snapshot }).where(eq(declaration.id, id));
  const planId = await generateActionEffectPlanInTransaction(tx, f.context, f.god, id), [row] = await tx.select().from(effect).where(eq(effect.planId, planId));
  assert.equal(row.status, "requires-god-ruling"); assert.equal(row.applicationSupported, false);
  const original = row.authoredValueJson;
  await ruleIncomingActionEffectInTransaction(tx, f.context, f.god, planId, row.id, { disposition: "damage", amount: 2, reason: "Explicit fixture G.O.D. outcome" });
  assert.deepEqual((await tx.select().from(effect).where(eq(effect.id, row.id)))[0].authoredValueJson, original);
  await approveActionEffectPlanInTransaction(tx, f.context, f.god, planId);
  for (let retry = 0; retry < 2; retry++) assert.equal(await applyActionEffectPlanInTransaction(tx, f.context, f.god, planId), "applied");
});
isolated("real Equipment, numeric, text, active condition and exact event providers", async (tx, f) => {
  const helmet = await armor(tx, f, f.heroId);
  const [weapon] = await tx.select().from(item).where(eq(item.id, f.weaponId));
  await tx.update(initiative).set({ movementMode: "Walk" }).where(and(eq(initiative.encounterId, f.encounterId), eq(initiative.characterId, f.heroId)));
  await tx.insert(campaignCharacterActiveCondition).values({ characterId: f.heroId, name: "Enraged", description: "Exact active condition", sourceKind: "god", sourceId: "p5", sourceName: "Ruling", durationKind: "scene", durationLabel: "This scene" });
  const keys = [`equipment.item:${helmet.canonicalId}:worn`, `equipment.item:${weapon.canonicalId}:wielded`, `equipment.item:${helmet.canonicalId}:equipped`, "state.condition:Enraged", "state.current-hp", "state.maximum-hp", "state.hp-percent"];
  const facts = await readAbilityFactsInTransaction(tx, { ...f.context, participantId: f.heroId, requestedKeys: keys });
  for (const key of keys.slice(0, 4)) assert.equal(facts.get(key)?.value, true);
  assert.equal(facts.get("state.hp-percent")?.value, Number(facts.get("state.current-hp")?.value) / Number(facts.get("state.maximum-hp")?.value) * 100);
  assert.equal(facts.get("state.movement-mode")?.value, "Walk");
  assert.equal(evaluateAbilityUseCondition({ conditionType: "state", conditionKey: "state.hp-percent", operator: "gte", numericValue: 50, textValue: null, notes: "", sortOrder: 0 }, facts), "satisfied");
  await tx.update(initiative).set({ participationStatus: "holding", currentInitiative: 21 }).where(and(eq(initiative.encounterId, f.encounterId), eq(initiative.characterId, f.defenderId)));
  await tx.update(initiative).set({ participationStatus: "active" }).where(and(eq(initiative.encounterId, f.encounterId), eq(initiative.characterId, f.heroId)));
  const id = await createActionDeclarationDraftInTransaction(tx, f.context, f.player, { ...completionDraft(f.heroId, f.defenderId), sourceKind: "weapon", weaponItemId: f.weaponId });
  await lockActionDeclarationInTransaction(tx, f.context, f.player, id); await commitActionDeclarationInTransaction(tx, f.context, f.player, id, { method: "entered", enteredTotal: 70 });
  const [window] = await tx.select().from(opportunity).where(eq(opportunity.declarationId, id));
  assert.ok(window);
  const eventFacts = await readAbilityFactsInTransaction(tx, { ...f.context, participantId: f.defenderId, opportunityId: window.id });
  for (const key of ["combat.action-declared", "combat.attack-declared", "combat.attack-targeted"]) assert.equal(eventFacts.get(key)?.value, true);
  assert.equal(eventFacts.has("made-up-event"), false);
  await assert.rejects(readAbilityFactsInTransaction(tx, { ...f.context, participantId: f.heroId, opportunityId: window.id }), /no longer open/);
  const [serial] = await tx.select().from(member).where(eq(member.characterId, f.occurrences[0]));
  await assert.rejects(readIncomingEffectEncounterTargetInTransaction(tx, { ...f.context, sceneId: f.sceneId + 999 }, f.occurrences[0]), /outside/);
  await assert.rejects(readIncomingEffectEncounterTargetInTransaction(tx, f.context, serial.participantId + 1000000), /outside/);
});
isolated("Passive Creature Abilities cannot be locked as activated actions", async (tx, f) => {
  await tx.update(member).set({ creatureSnapshotJson: { ...f.snapshot, abilities: [{ canonicalId: "p5-passive", abilityName: "Passive", effects: [], authoring: { ...emptyCreatureAbilityAuthoring(), activationType: "passive" } }] } }).where(eq(member.characterId, f.occurrences[0]));
  const id = await createActionDeclarationDraftInTransaction(tx, f.context, f.god, { ...completionDraft(f.occurrences[0], f.heroId), sourceKind: "creature-ability", sourceRef: "p5-passive", actionKind: "ability-use", windowKind: "ordinary" });
  await assert.rejects(lockActionDeclarationInTransaction(tx, f.context, f.god, id), /Passive/);
  assert.equal((await tx.select().from(plan).where(eq(plan.declarationId, id))).length, 0);
});

isolated("source properties freeze at lock before the target consequence is built", async (tx, f) => {
  await tx.insert(itemProperty).values({ itemId: f.weaponId, propertyName: "Material", value: "Silver" });
  const required = rules("requirement", null, { key: "silver", kind: "item-property", propertyName: "Material", value: "Silver" });
  await tx.update(member).set({ creatureSnapshotJson: { ...f.snapshot, core: { ...f.snapshot.core, interactionRules: { ...required, rules: required.rules.map((rule) => ({ ...rule, crImpact: "None" })) } } } }).where(eq(member.characterId, f.occurrences[0]));
  const id = await startAttack(tx, f);
  await tx.update(itemProperty).set({ value: "Steel" }).where(eq(itemProperty.itemId, f.weaponId));
  const planId = await generateActionEffectPlanInTransaction(tx, f.context, f.god, id);
  const [row] = await tx.select().from(effect).where(eq(effect.planId, planId));
  const result = storedIncomingResolution(row.authoredValueJson)!;
  assert.equal(result.status, "resolved"); assert.equal(result.input.source.itemProperties?.[0].value, "Silver");
});
isolated("Creature activated damage uses its own Initiative, actual State condition and Magical authoring", async (tx, f) => {
  const source = f.occurrences[0], target = f.occurrences[1];
  const condition = { conditionType: "state", conditionKey: "state.hp-percent", operator: "gt", numericValue: 50, textValue: null, notes: "", sortOrder: 0 };
  await tx.update(member).set({ creatureSnapshotJson: { ...f.snapshot, abilities: [{ canonicalId: "p5-damage", abilityName: "Authored damage", effects: [{ effectKey: "damage", schemaVersion: 2, effect: { kind: "health.damage", amount: 8, application: "localized" } }],
    authoring: { ...emptyCreatureAbilityAuthoring(), activationType: "activated", initiativeCost: 3, magical: true, useConditions: [condition] } }] } }).where(eq(member.characterId, source));
  const profile = rules("resistance", 50, { key: "magic", kind: "magical", magical: true });
  await tx.update(member).set({ creatureSnapshotJson: { ...f.snapshot, core: { ...f.snapshot.core, interactionRules: { ...profile, rules: profile.rules.map((rule) => ({ ...rule, crImpact: "None" })) } } } }).where(eq(member.characterId, target));
  await tx.update(initiative).set({ participationStatus: "active", currentInitiative: 22 }).where(eq(initiative.characterId, source));
  const id = await createActionDeclarationDraftInTransaction(tx, f.context, f.god, { ...completionDraft(source, target), sourceKind: "creature-ability", sourceRef: "p5-damage", actionKind: "ability-use", windowKind: "ordinary",
    sourcePayload: { effectSelections: { [`damage:${target}`]: { hitLocationNumber: 0, poolKey: "body" } } } });
  await lockActionDeclarationInTransaction(tx, f.context, f.god, id);
  await commitActionDeclarationInTransaction(tx, f.context, f.god, id);
  const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
  assert.equal(before.pendingActions.find((action) => action.actorCharacterId === source)!.originalInitiativeCost, 3);
  await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, 19));
  const planId = await generateActionEffectPlanInTransaction(tx, f.context, f.god, id);
  const [row] = await tx.select().from(effect).where(eq(effect.planId, planId));
  assert.equal(storedIncomingResolution(row.authoredValueJson)?.input.source.magical, true);
  assert.equal(storedIncomingResolution(row.authoredValueJson)?.finalEffect?.damage, 4);
  for (let i = 0; i < 2; i++) assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.god, id, planId)).status, "applied");
});
for (const activationType of ["reaction", "triggered"] as const) isolated(`server response window offers a Creature ${activationType} without spending, then commits only once`, async (tx, f) => {
  const target = f.occurrences[0];
  const ability = { canonicalId: "p5-reaction", abilityName: "Reactive Guard", effects: [], description: "Guard response", authoring: { ...emptyCreatureAbilityAuthoring(), activationType, initiativeCost: 2,
    useConditions: [{ conditionType: "event", conditionKey: "combat.attack-targeted", operator: null, numericValue: null, textValue: null, notes: "", sortOrder: 0 }] } };
  await tx.update(member).set({ creatureSnapshotJson: { ...f.snapshot, abilities: [ability] } }).where(eq(member.characterId, target));
  await tx.update(initiative).set({ participationStatus: "holding", currentInitiative: 21 }).where(eq(initiative.characterId, target));
  await tx.update(initiative).set({ participationStatus: "active" }).where(eq(initiative.characterId, f.heroId));
  const id = await createActionDeclarationDraftInTransaction(tx, f.context, f.player, { ...completionDraft(f.heroId, target), sourceKind: "weapon", weaponItemId: f.weaponId });
  await lockActionDeclarationInTransaction(tx, f.context, f.player, id); await commitActionDeclarationInTransaction(tx, f.context, f.player, id, { method: "entered", enteredTotal: 70 });
  const [window] = await tx.select().from(opportunity).where(and(eq(opportunity.declarationId, id), eq(opportunity.responderCharacterId, target)));
  const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
  const choices = await readAbilityResponseChoicesInTransaction(tx, f.context, f.god, target, window.id);
  assert.equal(choices[0].status, "eligible"); assert.equal(choices[0].initiativeCost, 2);
  assert.deepEqual(await loadInitiativeEngineInTransaction(tx, f.encounterId), before);
  await assert.rejects(readAbilityResponseChoicesInTransaction(tx, f.context, f.player, target, window.id), /own/);
  const command = { opportunityId: window.id, reactionType: "intervention" as const, protectedTargetCharacterId: target, sourceKind: "creature-ability" as const, sourceRef: "p5-reaction", intendedMechanicalPurpose: "Guard against this attack" };
  await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, 21));
  const reactionId = await declareDefenseInterventionInTransaction(tx, f.context, f.god, command);
  assert.equal(await declareDefenseInterventionInTransaction(tx, f.context, f.god, command), reactionId);
  const after = await loadInitiativeEngineInTransaction(tx, f.encounterId);
  assert.equal(after.participants.find((participant) => participant.characterId === target)!.currentInitiative, 19);
});

async function derivedSource(tx: Tx, f: Fixture, event = false) {
  const [ability] = await tx.insert(derivedAbility).values({ name: "Pass 5 Ability", acquisitionType: "awarded", activationType: event ? "triggered" : "activated", createdByUserId: f.godId }).returning();
  await tx.insert(campaignAllowedDerivedAbility).values({ campaignId: f.campaignId, derivedAbilityId: ability.id });
  await tx.insert(characterDerivedAbility).values({ characterId: f.heroId, derivedAbilityId: ability.id, acquisitionMethod: "awarded", acquiredByUserId: f.godId });
  await tx.insert(derivedAbilityCost).values({ derivedAbilityId: ability.id, costType: "initiative", amount: 4 });
  await tx.insert(derivedAbilityEffect).values({ derivedAbilityId: ability.id, sortOrder: 0, schemaVersion: 2, effectJson: { kind: "health.damage", amount: 8, application: "localized" } });
  if (event) await tx.insert(derivedAbilityUseCondition).values({ derivedAbilityId: ability.id, conditionType: "event", conditionKey: "custom.omen" });
  const sourceRef = `derived-ability:${ability.id}`;
  await recordCombatSourceResolutionInTransaction(tx, f.context, f.god, { participantId: f.heroId, sourceKind: "derived-ability", sourceRef, mode: "automatic-no-roll", governing: null, effectScaling: {}, reason: "The authored damage activates without a Roll.", ...(event ? { useRequirementsReason: "The G.O.D. explicitly observes this custom omen." } : {}) });
  return { ability, sourceRef };
}
for (const incoming of ["resistance", "requirement", "immunity"] as const) for (const kind of ["item", "derived-ability"] as const) isolated(`${kind} structured damage passes through the same target resolver: ${incoming}`, async (tx, f) => {
  let sourceRef: string, selection: string;
  if (kind === "item") {
    await tx.update(item).set({ isMagical: true }).where(eq(item.id, f.weaponId));
    const [power] = await tx.insert(itemPower).values({ itemId: f.weaponId, name: "Authored blast", trigger: "activated", initiativeCost: 4, resolutionMode: "automatic", resourceCostKind: "none", sortOrder: 0 }).returning();
    const [row] = await tx.insert(itemPowerEffect).values({ itemPowerId: power.id, sortOrder: 0, schemaVersion: 2, effectJson: { kind: "health.damage", amount: 8, application: "localized" } }).returning();
    sourceRef = `item-power:${power.id}`; selection = `${sourceRef}:effect:${row.id}:target:${f.occurrences[0]}`;
  } else { sourceRef = (await derivedSource(tx, f)).sourceRef; selection = "0"; }
  const profile = rules(incoming, incoming === "resistance" ? 50 : null, { key: "effect", kind: "mechanical-effect-kind", effectKind: "health.damage" });
  await tx.update(member).set({ creatureSnapshotJson: { ...f.snapshot, core: { ...f.snapshot.core, interactionRules: { ...profile, rules: profile.rules.map((rule) => ({ ...rule, crImpact: "None" })) } } } }).where(eq(member.characterId, f.occurrences[0]));
  await tx.update(initiative).set({ participationStatus: "active" }).where(eq(initiative.characterId, f.heroId));
  const id = await createActionDeclarationDraftInTransaction(tx, f.context, f.player, { ...completionDraft(f.heroId, f.occurrences[0]), sourceKind: kind, sourceRef, actionKind: "ability-use", windowKind: "ordinary", sourcePayload: { effectSelections: { [selection]: { hitLocationNumber: 0, poolKey: "body" } } } });
  await lockActionDeclarationInTransaction(tx, f.context, f.player, id); await commitActionDeclarationInTransaction(tx, f.context, f.player, id);
  const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
  await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, 18));
  const planId = await generateActionEffectPlanInTransaction(tx, f.context, f.god, id);
  const [row] = await tx.select().from(effect).where(eq(effect.planId, planId));
  const result = storedIncomingResolution(row.authoredValueJson)!;
  assert.equal(result.input.source.sourceKind, kind); assert.equal(result.input.source.magical, kind === "item" ? true : null);
  assert.equal(result.finalEffect?.damage, incoming === "immunity" ? 0 : incoming === "requirement" ? 8 : 4);
  for (let retry = 0; retry < 2; retry++) assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.player, id, planId)).status, "applied");
  if (kind === "derived-ability") assert.equal((await tx.select().from(characterDerivedAbilityUse).where(eq(characterDerivedAbilityUse.characterId, f.heroId))).length, 1);
});
isolated("a Player cannot fabricate an Event; the explicit G.O.D. manual event remains usable", async (tx, f) => {
  const { sourceRef } = await derivedSource(tx, f, true);
  await tx.update(initiative).set({ participationStatus: "active" }).where(eq(initiative.characterId, f.heroId));
  const draft = { ...completionDraft(f.heroId, f.occurrences[0]), sourceKind: "derived-ability" as const, sourceRef, actionKind: "ability-use", windowKind: "ordinary" as const, sourcePayload: { eventKey: "custom.omen", effectSelections: { "0": { hitLocationNumber: 0, poolKey: "body" } } } };
  const id = await createActionDeclarationDraftInTransaction(tx, f.context, f.player, draft);
  await lockActionDeclarationInTransaction(tx, f.context, f.player, id);
  await assert.rejects(commitActionDeclarationInTransaction(tx, f.context, f.player, id), /client event key/i);
  assert.equal((await tx.select().from(characterDerivedAbilityUse).where(eq(characterDerivedAbilityUse.characterId, f.heroId))).length, 0);
  // The explicit manual event is chosen by the G.O.D. for a G.O.D.-controlled NPC;
  // the preceding Player rejection must not grant control over that Player.
  await tx.update(campaignCharacter).set({ isNpc: true, npcBuildMode: "detailed", playerUserId: f.godId }).where(eq(campaignCharacter.id, f.heroId));
  await commitActionDeclarationInTransaction(tx, f.context, f.god, id);
  const [receipt] = await tx.select().from(characterDerivedAbilityUse).where(eq(characterDerivedAbilityUse.characterId, f.heroId));
  assert.equal(receipt.eventKey, "custom.omen"); assert.equal(receipt.actorUserId, f.godId);
});

isolated("historical plans without incoming snapshots remain readable and apply their stored result", async (tx, f) => {
  const id = await startAttack(tx, f), planId = await generateActionEffectPlanInTransaction(tx, f.context, f.god, id);
  const [row] = await tx.select().from(effect).where(eq(effect.planId, planId));
  const oldAuthored = { ...(row.authoredValueJson as Record<string, unknown>) };
  for (const key of Object.keys(oldAuthored).filter((key) => key.startsWith("incoming"))) delete oldAuthored[key];
  await tx.update(effect).set({ authoredValueJson: oldAuthored }).where(eq(effect.id, row.id));
  const [saved] = await tx.select().from(plan).where(eq(plan.id, planId));
  const historicalSource = { ...(saved.sourceSnapshotJson as Record<string, unknown>) }; delete historicalSource.incomingSourceFacts;
  await tx.update(plan).set({ sourceSnapshotJson: historicalSource }).where(eq(plan.id, planId));
  const immune = rules("immunity");
  await tx.update(member).set({ creatureSnapshotJson: { ...f.snapshot, core: { ...f.snapshot.core, interactionRules: { ...immune, rules: immune.rules.map((rule) => ({ ...rule, crImpact: "None" })) } } } }).where(eq(member.characterId, f.occurrences[0]));
  const view = (await readActionEffectWorkspaceInTransaction(tx, f.context)).plans.find((entry) => entry.id === planId)!;
  assert.equal(storedIncomingResolution(view.effects[0].authoredValue), null);
  assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.player, id, planId)).status, "applied");
  const [target] = await tx.select().from(member).where(eq(member.characterId, f.occurrences[0]));
  assert.equal((target.localStateJson as { health: { totalDamage: number } }).health.totalDamage, 6);
  assert.deepEqual((await tx.select().from(effect).where(eq(effect.id, row.id)))[0].authoredValueJson, oldAuthored);
});
isolated("ambiguous condition harmfulness requires a G.O.D. decision when target Immunity can matter", async (tx, f) => {
  const { ability, sourceRef } = await derivedSource(tx, f);
  await tx.update(derivedAbilityEffect).set({ effectJson: { kind: "condition.apply", name: "Structured mark", description: "Harmfulness is unauthored", duration: { kind: "scene" } } }).where(eq(derivedAbilityEffect.derivedAbilityId, ability.id));
  const immune = rules("immunity", null, { key: "condition", kind: "condition-name", conditionName: "Structured mark" }); immune.rules[0].scope = "condition";
  await tx.update(member).set({ creatureSnapshotJson: { ...f.snapshot, core: { ...f.snapshot.core, interactionRules: { ...immune, rules: immune.rules.map((rule) => ({ ...rule, crImpact: "None" })) } } } }).where(eq(member.characterId, f.occurrences[0]));
  await tx.update(initiative).set({ participationStatus: "active" }).where(eq(initiative.characterId, f.heroId));
  const id = await createActionDeclarationDraftInTransaction(tx, f.context, f.player, { ...completionDraft(f.heroId, f.occurrences[0]), sourceKind: "derived-ability", sourceRef, actionKind: "ability-use", windowKind: "ordinary" });
  await lockActionDeclarationInTransaction(tx, f.context, f.player, id); await commitActionDeclarationInTransaction(tx, f.context, f.player, id);
  const before = await loadInitiativeEngineInTransaction(tx, f.encounterId); await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, 18));
  const planId = await generateActionEffectPlanInTransaction(tx, f.context, f.god, id), [row] = await tx.select().from(effect).where(eq(effect.planId, planId));
  assert.equal(row.status, "requires-god-ruling"); assert.equal(row.applicationSupported, false);
  assert.equal(storedIncomingResolution(row.authoredValueJson)?.input.effect.harmful, null);
  await ruleIncomingActionEffectInTransaction(tx, f.context, f.god, planId, row.id, { disposition: "prevent", reason: "G.O.D. confirms this mark is harmful and prevented by Immunity." });
  await approveActionEffectPlanInTransaction(tx, f.context, f.god, planId); await applyActionEffectPlanInTransaction(tx, f.context, f.god, planId);
  const [target] = await tx.select().from(member).where(eq(member.characterId, f.occurrences[0]));
  assert.equal(((target.localStateJson as { conditions?: unknown[] }).conditions ?? []).length, 0);
});

isolated("Derived passive conditions use real facts and retain established state while a fact is unknown", async (tx, f) => {
  const { reconcileCharacterDerivedAbilityPassivesInTransaction } = await import("@/features/derived-abilities/character-derived-ability-service");
  const [ability] = await tx.insert(derivedAbility).values({ name: "Conditional passive", acquisitionType: "awarded", activationType: "passive", createdByUserId: f.godId }).returning();
  await tx.insert(campaignAllowedDerivedAbility).values({ campaignId: f.campaignId, derivedAbilityId: ability.id });
  await tx.insert(characterDerivedAbility).values({ characterId: f.heroId, derivedAbilityId: ability.id, acquisitionMethod: "awarded", acquiredByUserId: f.godId });
  await tx.insert(derivedAbilityEffect).values({ derivedAbilityId: ability.id, sortOrder: 0, schemaVersion: 2, effectJson: { kind: "condition.apply", name: "Passive guard", description: "While wielding", duration: { kind: "until-removed" } } });
  await tx.insert(derivedAbilityUseCondition).values({ derivedAbilityId: ability.id, conditionType: "equipment", conditionKey: "equipment.weapon-wielded", operator: "possessed" });
  assert.equal((await reconcileCharacterDerivedAbilityPassivesInTransaction(tx, f.heroId, f.godId)).created.length, 1);
  await tx.update(derivedAbilityUseCondition).set({ conditionKey: "custom.unknown-gear" }).where(eq(derivedAbilityUseCondition.derivedAbilityId, ability.id));
  const pending = await reconcileCharacterDerivedAbilityPassivesInTransaction(tx, f.heroId, f.godId);
  assert.equal(pending.manualSteps.length, 1); assert.equal(pending.resolved.length, 0);
  await tx.update(derivedAbilityUseCondition).set({ conditionType: "state", conditionKey: "state.condition:Absent" }).where(eq(derivedAbilityUseCondition.derivedAbilityId, ability.id));
  assert.equal((await reconcileCharacterDerivedAbilityPassivesInTransaction(tx, f.heroId, f.godId)).resolved.length, 1);
});

for (const activationType of ["reaction", "triggered"] as const) isolated(`Player Derived ${activationType} uses its real event, Initiative and retained use ledger once`, async (tx, f) => {
  const { ability, sourceRef } = await derivedSource(tx, f);
  await tx.update(derivedAbility).set({ activationType }).where(eq(derivedAbility.id, ability.id));
  await tx.insert(derivedAbilityUseCondition).values({ derivedAbilityId: ability.id, conditionType: "event", conditionKey: "combat.attack-targeted" });
  const source = f.occurrences[0];
  await tx.update(initiative).set({ participationStatus: "holding", currentInitiative: 21 }).where(eq(initiative.characterId, f.heroId));
  await tx.update(initiative).set({ participationStatus: "active", currentInitiative: 22 }).where(eq(initiative.characterId, source));
  const id = await createActionDeclarationDraftInTransaction(tx, f.context, f.god, { ...completionDraft(source, f.heroId), sourceKind: "creature-attack", sourceRef: "fixture-shortsword" });
  await lockActionDeclarationInTransaction(tx, f.context, f.god, id); await commitActionDeclarationInTransaction(tx, f.context, f.god, id, { method: "entered", enteredTotal: 70 });
  const [window] = await tx.select().from(opportunity).where(and(eq(opportunity.declarationId, id), eq(opportunity.responderCharacterId, f.heroId)));
  const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
  await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, 21));
  const choices = await readAbilityResponseChoicesInTransaction(tx, f.context, f.player, f.heroId, window.id);
  assert.equal(choices.find((choice) => choice.ref === sourceRef)?.status, "eligible");
  assert.equal((await tx.select().from(characterDerivedAbilityUse).where(eq(characterDerivedAbilityUse.characterId, f.heroId))).length, 0);
  const command = { opportunityId: window.id, reactionType: "intervention" as const, protectedTargetCharacterId: f.heroId, sourceKind: "derived-ability" as const, derivedAbilityId: ability.id, sourceRef, intendedMechanicalPurpose: "Authored reaction response" };
  const reaction = await declareDefenseInterventionInTransaction(tx, f.context, f.player, command);
  assert.equal(await declareDefenseInterventionInTransaction(tx, f.context, f.player, command), reaction);
  assert.equal((await tx.select().from(characterDerivedAbilityUse).where(eq(characterDerivedAbilityUse.characterId, f.heroId))).length, 1);
  assert.equal((await loadInitiativeEngineInTransaction(tx, f.encounterId)).participants.find((participant) => participant.characterId === f.heroId)!.currentInitiative, 17);
});

for (const kind of ["custom", "canonical"] as const) isolated(`${kind} construction-backed Item Ability rejects a mundane Item and freezes Magical true`, async (tx, f) => {
  const document = { ...createEmptySpell(), name: "No name-based magic inference", castingSystem: "Spellcraft" as const, sphere: "Force", frameworkSkillId: f.skillId,
    containers: [{ ...createContainer("target"), id: "magic-target", effects: [{ id: "magic-damage", ruleId: "damage", quantity: 2, description: "" }] }] };
  const authored: ItemPower = { id: null, name: "Construction", description: "", trigger: "activated", activationLabel: "", initiativeCost: 4,
    resourceCostKind: "none", resourceCostAmount: null, requiredEquipmentState: null, resolutionMode: "automatic", fixedRollTarget: null,
    fixedPowerLevel: null, effects: [], sortOrder: 0,
    customConstruction: kind === "custom" ? { document } : null,
    source: kind === "canonical" ? { sourceSkillId: f.skillId, sourceSkillName: "Canonical", sourceExtensionType: "spell-construction", sourceSchemaVersion: 1, archived: false } : null };
  assert.throws(() => validateItemPowers({ powers: [authored], isMagical: false, hasWeaponProfile: true, hasChargePool: false }), /Magical Item/);
  assert.equal(validateItemPowers({ powers: [authored], isMagical: true, hasWeaponProfile: true, hasChargePool: false }).length, 1);
  const [power] = await tx.insert(itemPower).values({ itemId: f.weaponId, name: authored.name, trigger: "activated", initiativeCost: 4, resolutionMode: "automatic", resourceCostKind: "none", sortOrder: 0 }).returning();
  if (kind === "custom") await tx.insert(itemPowerConstruction).values({ itemPowerId: power.id, schemaVersion: 1, documentJson: JSON.stringify(document) });
  else {
    await tx.insert(skillExtension).values({ skillId: f.skillId, extensionType: "spell-construction", schemaVersion: 1, dataJson: JSON.stringify(document) });
    await tx.insert(itemPowerSource).values({ itemPowerId: power.id, sourceKind: "spell-construction", sourceSkillId: f.skillId, sourceExtensionType: "spell-construction", sourceSchemaVersion: 1 });
  }
  const target = f.occurrences[0], sourceRef = `item-power:${power.id}`;
  const required = rules("requirement", null, { key: "magic", kind: "magical", magical: true });
  await tx.update(member).set({ creatureSnapshotJson: { ...f.snapshot, core: { ...f.snapshot.core, interactionRules: { ...required, rules: required.rules.map((rule) => ({ ...rule, crImpact: "None" })) } } } }).where(eq(member.characterId, target));
  await tx.update(initiative).set({ participationStatus: "active" }).where(eq(initiative.characterId, f.heroId));
  const id = await createActionDeclarationDraftInTransaction(tx, f.context, f.player, { ...completionDraft(f.heroId, target), sourceKind: "item", sourceRef,
    actionKind: "ability-use", windowKind: "ordinary", sourcePayload: { selections: { targetGroups: { "magic-target": [target] } },
      effectSelections: { [`${sourceRef}:magic:magic-damage:target:${target}`]: { hitLocationNumber: 0, poolKey: "body" } } } });
  await assert.rejects(lockActionDeclarationInTransaction(tx, f.context, f.player, id), /Magical Item/);
  await tx.update(item).set({ isMagical: true }).where(eq(item.id, f.weaponId));
  await lockActionDeclarationInTransaction(tx, f.context, f.player, id);
  const [locked] = await tx.select().from(declaration).where(eq(declaration.id, id));
  assert.equal((locked.lockedSnapshotJson as { authoredSource: { incomingSourceFacts: { magical: boolean } } }).authoredSource.incomingSourceFacts.magical, true);
  await commitActionDeclarationInTransaction(tx, f.context, f.player, id);
  await tx.update(item).set({ isMagical: false }).where(eq(item.id, f.weaponId));
  const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
  await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, 18));
  const planId = await generateActionEffectPlanInTransaction(tx, f.context, f.god, id);
  const [row] = await tx.select().from(effect).where(eq(effect.planId, planId));
  const result = storedIncomingResolution(row.authoredValueJson)!;
  assert.equal(result.input.source.magical, true); assert.equal(result.status, "resolved"); assert.ok(result.finalEffect!.damage > 0);
});
