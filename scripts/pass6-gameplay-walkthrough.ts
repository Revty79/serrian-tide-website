import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { race } from "@/db/race-schema";
import { item, armorProfile, armorLocation, armorLocationReference } from "@/db/item-schema";
import { campaignCharacter, campaignCharacterProfile, campaignCharacterItem, campaignCharacterItemEquipmentState, campaignCreatureNpcProfile } from "@/db/realm-schema";
import { derivedAbility, derivedAbilityCost, derivedAbilityEffect, characterDerivedAbility, characterDerivedAbilityUse, campaignAllowedDerivedAbility } from "@/db/derived-ability-schema";
import { campaignSessionEncounterParticipant as member, campaignSessionEncounterInitiativeParticipant as initiative, campaignSessionEncounterActionDeclaration as declaration,
  campaignSessionEncounterResponderOpportunity as opportunity, campaignSessionEncounterEffect as effect, campaignSessionEncounterFirearmAttack as firearm, campaignSessionRoll } from "@/db/tabletop-operations-schema";
import { createActionDeclarationDraftInTransaction, lockActionDeclarationInTransaction, commitActionDeclarationInTransaction } from "@/features/tabletop-operations/action-declaration-service";
import { generateActionEffectPlanInTransaction, applyRoutineCombatConsequencesInTransaction, approveActionEffectPlanInTransaction, applyActionEffectPlanInTransaction, ruleIncomingActionEffectInTransaction } from "@/features/tabletop-operations/action-effect-plan-service";
import { resolveDeclaredDefensesInTransaction, declareDefenseInterventionInTransaction } from "@/features/tabletop-operations/defense-intervention-service";
import { readAbilityResponseChoicesInTransaction } from "@/features/tabletop-operations/ability-response-service";
import { loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction, passParticipantInitiativeInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { advanceInitiativeTimeline } from "@/features/tabletop-operations/initiative-runtime";
import { recordCombatSourceResolutionInTransaction } from "@/features/tabletop-operations/combat-source-resolution-service";
import { createPlayerCombatRulingRequestInTransaction, ruleOnPlayerCombatRequestInTransaction } from "@/features/tabletop-operations/player-combat-ruling-service";
import { declareFirearmAttackInTransaction, fireFirearmAttackInTransaction } from "@/features/tabletop-operations/firearm-attack-service";
import { readActiveManaInTransaction } from "@/features/active-state/active-mana-service";
import { emptyCreatureAbilityAuthoring, emptyCreatureAttackAuthoring } from "@/features/creatures/creature-authoring";
import { storedIncomingResolution } from "@/features/incoming-effects/effect-proposal";
import type { InteractionRule } from "@/features/interaction-rules/interaction-rules";
import { screenFixture, addScreenSpell, addScreenFirearm } from "./fixtures/combat-screens-browser-fixture";
import { completionDraft } from "./fixtures/combat-completion-service-fixture";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const rule = (ruleType: InteractionRule["ruleType"], percentage: number | null, conditions: InteractionRule["conditions"]): InteractionRule => ({ key: "walkthrough", name: `Walkthrough ${ruleType}`, ruleType, percentage, scope: "damage", match: "ALL", conditions, crImpact: "None", sortOrder: 0, notes: "PRIVATE_WALKTHROUGH_RULE" });

export async function createPass6Walkthrough() {
  return db.transaction(async (tx) => {
    const f = await screenFixture(tx, "pass6-walkthrough");
    const learned = await addScreenSpell(tx, f), gun = await addScreenFirearm(tx, f);
    const snapshot = { ...f.creatureSnapshot, core: { ...f.creatureSnapshot.core, hpMultiplierSteps: 0, baseMovementSteps: 0, baseMagicSteps: 0 },
      attributes: [{ attributeKey: "CON", value: 60 }], movement: [{ movementMode: "Walk", movementValue: 2 }],
      hpPools: [{ canonicalId: "body", poolName: "Body", maximumHp: 60, hpPercentage: 100, sortOrder: 0 }],
      hitLocations: Array.from({ length: 10 }, (_,number) => ({ hitLocationNumber: number, locationName: "Body", bodyPartsIncluded: "Body", hpPoolCanonicalId: "body", naturalArmor: "0", soak: "0", sortOrder: number })),
      attacks: f.creatureSnapshot.attacks.map((attack) => ({ ...attack, authoring: { ...emptyCreatureAttackAuthoring(), initiativeCost: 4, magical: false } })) };
    for (const id of f.occurrences) await tx.update(member).set({
      creatureSnapshotJson: { ...snapshot, core: { ...snapshot.core, interactionRules: { schemaVersion: 1, rules: [rule(id === f.occurrences[0] ? "requirement" : "absorption", id === f.occurrences[0] ? null : 50, [{ key: "magic", kind: "magical", magical: true }])] } } },
      localStateJson: { health: { totalDamage: 12, poolDamage: { body: 12 } } },
    }).where(eq(member.characterId, id));
    const npcSnapshot = { ...snapshot, core: { ...snapshot.core, interactionRules: { schemaVersion: 1, rules: [rule("requirement", null, [{ key: "magic", kind: "magical", magical: true }])] } },
      hitLocations: snapshot.hitLocations.map((location) => ({ ...location, locationName: location.hitLocationNumber === 0 ? "Head" : "Body", naturalArmor: "2", soak: "1" })),
      abilities: [{ canonicalId: "walkthrough-reaction", abilityName: "Watchful Guard", effects: [], authoring: { ...emptyCreatureAbilityAuthoring(), activationType: "reaction", initiativeCost: 2,
        useConditions: [{ conditionType: "event", conditionKey: "combat.attack-targeted", operator: null, numericValue: null, textValue: null, notes: "", sortOrder: 0 }] } }] };
    await tx.update(campaignCharacter).set({ npcKind: "creature" }).where(eq(campaignCharacter.id, f.defenderId));
    await tx.insert(campaignCreatureNpcProfile).values({ characterId: f.defenderId, creatureId: f.templateId, baselineSnapshotJson: JSON.stringify(npcSnapshot), currentSnapshotJson: JSON.stringify(npcSnapshot) });
    const [armor] = await tx.insert(item).values({ canonicalId: `P6-WORN-${crypto.randomUUID()}`.toUpperCase(), name: "Watchman's helmet", catalogScope: "equipment", equipmentGroup: "armor", recordType: "Armor", family: "Armor", category: "Armor", priceBasis: "unit", createdByUserId: f.godId }).returning();
    await tx.insert(armorProfile).values({ itemId: armor.id, baseSoak: 1, coverage: "Head" });
    await tx.insert(armorLocationReference).values({ locationCode: "0", locationName: "Head", sortOrder: 0 }).onConflictDoNothing();
    await tx.insert(armorLocation).values({ itemId: armor.id, locationCode: "0" });
    await tx.insert(campaignCharacterItem).values({ characterId: f.defenderId, itemId: armor.id, quantity: 1, unitCostCredits: 0 });
    await tx.insert(campaignCharacterItemEquipmentState).values({ characterId: f.defenderId, itemId: armor.id, state: "worn", quantity: 1 });
    const [profile] = await tx.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, f.heroId));
    await tx.update(race).set({ interactionRules: { schemaVersion: 1, rules: [{ ...rule("resistance", 25, [{ key: "slash", kind: "damage-type", damageType: "Slashing" }]), crImpact: undefined }] } }).where(eq(race.id, profile.raceId!));
    await tx.update(initiative).set({ participationStatus: "active" }).where(eq(initiative.characterId, f.occurrences[0]));
    await tx.update(initiative).set({ participationStatus: "holding", currentInitiative: 21 }).where(eq(initiative.characterId, f.defenderId));
    const [ability] = await tx.insert(derivedAbility).values({ name: "Watcher's Mark", acquisitionType: "awarded", activationType: "activated", createdByUserId: f.godId }).returning();
    await tx.insert(campaignAllowedDerivedAbility).values({ campaignId: f.campaignId, derivedAbilityId: ability.id });
    await tx.insert(characterDerivedAbility).values({ characterId: f.heroId, derivedAbilityId: ability.id, acquisitionMethod: "awarded", acquiredByUserId: f.godId });
    await tx.insert(derivedAbilityCost).values({ derivedAbilityId: ability.id, costType: "initiative", amount: 3 });
    await tx.insert(derivedAbilityEffect).values({ derivedAbilityId: ability.id, sortOrder: 0, schemaVersion: 2, effectJson: { kind: "condition.apply", name: "Watched", description: "Visible mark", duration: { kind: "scene" } } });
    await recordCombatSourceResolutionInTransaction(tx, f.context, f.god, { participantId: f.heroId, sourceKind: "derived-ability", sourceRef: `derived-ability:${ability.id}`, mode: "automatic-no-roll", governing: null, effectScaling: {}, reason: "The authored mark needs no Roll." });
    return { ...f, learned, gun, ability };
  });
}
type Fixture = Awaited<ReturnType<typeof createPass6Walkthrough>>;

export async function runPass6Walkthrough(f: Fixture, observe: (step: string) => Promise<void>, freezeAndResume: () => Promise<void>) {
  const completed: number[] = [];
  async function start(tx: Tx, draft: ReturnType<typeof completionDraft>, actor = f.player as typeof f.player | typeof f.god, roll = true) {
    const id = await createActionDeclarationDraftInTransaction(tx, f.context, actor, draft);
    await lockActionDeclarationInTransaction(tx, f.context, actor, id);
    const pending = await commitActionDeclarationInTransaction(tx, f.context, actor, id, roll ? { method: "entered", enteredTotal: 70 } : undefined);
    assert.equal(await commitActionDeclarationInTransaction(tx, f.context, actor, id, roll ? { method: "entered", enteredTotal: 70 } : undefined), pending);
    return id;
  }
  async function finish(ids: number[], point: number, rolled = true) {
    await db.transaction(async (tx) => {
      if (rolled) for (const id of ids) await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, id);
      const state = await loadInitiativeEngineInTransaction(tx, f.encounterId);
      await persistInitiativeEngineInTransaction(tx, f.context, state, advanceInitiativeTimeline(state, point));
      for (const id of ids) {
        const planId = await generateActionEffectPlanInTransaction(tx, f.context, f.god, id);
        const rows = await tx.select().from(effect).where(eq(effect.planId, planId));
        assert.ok(rows.length);
        for (let retry = 0; retry < 2; retry++) assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.god, id, planId)).status, "applied");
        completed.push(planId);
      }
    });
  }
  const opening = await db.transaction(async (tx) => {
    const attack = await start(tx, { ...completionDraft(f.heroId, f.defenderId), sourceKind: "weapon", weaponItemId: f.weaponId });
    const creatureAttack = await start(tx, { ...completionDraft(f.occurrences[0], f.heroId), sourceKind: "creature-attack", sourceRef: "fixture-shortsword" }, f.god);
    const [window] = await tx.select().from(opportunity).where(and(eq(opportunity.declarationId, attack), eq(opportunity.responderCharacterId, f.defenderId)));
    assert.ok(window);
    const choices = await readAbilityResponseChoicesInTransaction(tx, f.context, f.god, f.defenderId, window.id);
    assert.equal(choices.find(({ ref }) => ref === "walkthrough-reaction")?.status, "eligible");
    assert.equal((await loadInitiativeEngineInTransaction(tx, f.encounterId)).participants.find(({ characterId }) => characterId === f.defenderId)?.currentInitiative, 21);
    return [attack, creatureAttack];
  });
  await observe("Opening attacks and optional Reaction");
  await db.transaction(async (tx) => {
    const state = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    await persistInitiativeEngineInTransaction(tx, f.context, state, advanceInitiativeTimeline(state, 21));
    const [window] = await tx.select().from(opportunity).where(and(eq(opportunity.declarationId, opening[0]), eq(opportunity.responderCharacterId, f.defenderId)));
    await declareDefenseInterventionInTransaction(tx, f.context, f.god, { opportunityId: window.id, reactionType: "no-reaction", sourceKind: "none", protectedTargetCharacterId: f.defenderId, intendedMechanicalPurpose: "The sentry chooses to let this attack pass." });
    await passParticipantInitiativeInTransaction(tx, f.context, f.defenderId);
  });
  await finish(opening, 18);
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(effect).where(eq(effect.planId, completed[0]));
    const incoming = storedIncomingResolution(rows[0].authoredValueJson)!;
    assert.equal(incoming.status, "prevented"); assert.equal(incoming.input.target.protection.worn[0].baseSoak, 1); assert.equal(incoming.input.target.protection.natural[0].armor, 2);
    const [hit] = await tx.select().from(effect).where(eq(effect.planId, completed[1]));
    assert.equal(storedIncomingResolution(hit.authoredValueJson)?.finalEffect?.damage, 5, "Creature base 4 + 2 Roll damage, reduced by 25%, rounded once");
    await passParticipantInitiativeInTransaction(tx, f.context, f.occurrences[0]);
  });
  await observe("Requirement prevented the sword; Race Resistance reduced the Creature hit");
  await freezeAndResume();
  const spellId = await db.transaction(async (tx) => start(tx, { ...completionDraft(f.heroId, f.occurrences[1]), sourceKind: "spell", sourceRef: `catalog:${f.learned.allocation.id}`, actionKind: "spell-cast", windowKind: "ordinary",
    sourcePayload: { selections: { targetGroups: { "bolt-target": [f.occurrences[1]] }, applications: {} } } }));
  const [cast] = await db.select().from(declaration).where(eq(declaration.id, spellId));
  const spellCost = (cast.lockedSnapshotJson as { initiativeCost: number }).initiativeCost;
  const manaAfter = await db.transaction((tx) => readActiveManaInTransaction(tx, f.heroId));
  await finish([spellId], 18 - spellCost);
  const [spellEffect] = await db.select().from(effect).where(eq(effect.planId, completed[2]));
  assert.equal(storedIncomingResolution(spellEffect.authoredValueJson)?.status, "absorbed");
  await observe("Spell is Magical and becomes same-pool Absorption healing");
  const shot = await db.transaction(async (tx) => {
    const { campaignCharacterFirearmState } = await import("@/db/tabletop-operations-schema");
    const [gunState] = await tx.select().from(campaignCharacterFirearmState).where(eq(campaignCharacterFirearmState.itemInstanceId, f.gun.instance.id));

    const request = await createPlayerCombatRulingRequestInTransaction(tx, f.context, { userId: f.playerId, characterId: f.heroId }, { requestType: "weapon-distance", sourceKind: "weapon", sourceRef: `instance:${f.gun.instance.id}`, sourceInstanceId: f.gun.instance.id, targetParticipantId: f.occurrences[0], intent: "Measure the shot", requestedTiming: "before firing", blockedReason: "Distance confirmation", frozenRequest: { attackMode: "ranged", distance: 25, unit: "feet", firingModeId: gunState.selectedFiringModeId }, idempotencyKey: crypto.randomUUID().replaceAll("-", "") });
    await ruleOnPlayerCombatRequestInTransaction(tx, f.context, f.godId, request.requestId, { status: "approved", response: "25 feet confirmed", ruling: { distance: 25, unit: "feet" } });
    const result = await declareFirearmAttackInTransaction(tx, f.context, f.player, { actorParticipantId: f.heroId, targetParticipantId: f.occurrences[0], itemInstanceId: f.gun.instance.id, firingModeId: gunState.selectedFiringModeId!, rangeDistance: 25, rangeUnit: "feet", distanceRulingRequestId: request.requestId, aimInitiative: 0, firingDurationInitiative: 1, calledShot: { declared: false, objective: "", locationNumber: null, penalty: null, reason: "" }, idempotencyKey: crypto.randomUUID(), roll: { method: "entered", enteredTotal: 70 } });
    const [attack] = await tx.select().from(firearm).where(eq(firearm.id, result.attackId));
    await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, attack.triggerDeclarationId);
    const state = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    await persistInitiativeEngineInTransaction(tx, f.context, state, advanceInitiativeTimeline(state, state.runtime.timelineInitiative - 1));
    return { attack, fired: await fireFirearmAttackInTransaction(tx, f.context, f.player, attack.id, { method: "random" }) };
  });
  await observe("Projectile Magical inheritance needs a G.O.D. ruling");
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(effect).where(eq(effect.planId, shot.fired.effectPlanId!));
    assert.equal(storedIncomingResolution(row.authoredValueJson)?.status, "requires-god-ruling");
    await ruleIncomingActionEffectInTransaction(tx, f.context, f.god, row.planId, row.id, { disposition: "damage", amount: 2, reason: "PRIVATE_WALKTHROUGH_RULING: this one shot deals 2; inheritance remains undecided." });
    await approveActionEffectPlanInTransaction(tx, f.context, f.god, row.planId);
    for (let retry = 0; retry < 2; retry++) assert.equal(await applyActionEffectPlanInTransaction(tx, f.context, f.god, row.planId), "applied");
    assert.equal((await fireFirearmAttackInTransaction(tx, f.context, f.player, shot.attack.id, { method: "random" })).rollId, shot.fired.rollId);
    completed.push(row.planId);
  });
  const abilityId = await db.transaction(async (tx) => start(tx, { ...completionDraft(f.heroId, f.occurrences[1]), sourceKind: "derived-ability", sourceRef: `derived-ability:${f.ability.id}`, actionKind: "ability-use", windowKind: "ordinary" }, f.player, false));
  const current = await db.transaction((tx) => loadInitiativeEngineInTransaction(tx, f.encounterId));
  await finish([abilityId], current.runtime.timelineInitiative - 3, false);
  assert.equal((await db.select().from(characterDerivedAbilityUse).where(eq(characterDerivedAbilityUse.characterId, f.heroId))).length, 1);
  assert.equal((await db.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.encounterId, f.encounterId))).length, 4);
  assert.deepEqual(await db.transaction((tx) => readActiveManaInTransaction(tx, f.heroId)), manaAfter);
  await observe("Ability applies one condition and one use receipt; all five actions complete");
  return completed;
}
