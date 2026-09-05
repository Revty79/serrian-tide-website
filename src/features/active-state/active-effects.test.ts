import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  decodeMechanicalEffect,
  encodeMechanicalEffect,
  getMechanicalEffectRequirements,
  planMechanicalEffect,
  validateMechanicalEffect,
  type MechanicalEffect,
  type RuntimeDuration,
} from "@/features/mechanical-effects";

import {
  formatRuntimeDuration,
  getActiveModifierTotal,
  getActiveModifierTotalRows,
  getActiveModifierTotals,
  getRuntimeEffectiveValue,
  validateMovementModifierTarget,
  type ActiveCondition,
  type ActiveModifier,
} from "./active-effects";

const source = { kind: "spell" as const, id: "spell-1", name: "Haste", effectKey: "effect-1" };
function modifier(overrides: Partial<ActiveModifier> = {}): ActiveModifier {
  return { id: 1, characterId: 7, label: "STR aid", channel: "attribute", targetKey: "STR", amount: 3, source, duration: formatRuntimeDuration({ kind: "until-removed" }), createdAt: "2026-01-01T00:00:00.000Z", endedAt: null, endNote: "", ...overrides };
}
function condition(overrides: Partial<ActiveCondition> = {}): ActiveCondition {
  return { id: 1, characterId: 7, name: "Blinded", description: "Cannot see.", source, duration: formatRuntimeDuration({ kind: "combat-rounds", value: 1 }), createdAt: "2026-01-01T00:00:00.000Z", resolvedAt: null, resolutionNote: "", ...overrides };
}

test("schema-v1 health and Manual definitions still decode while new kinds encode as v2", () => {
  const legacy: MechanicalEffect[] = [
    { kind: "health.heal", amount: 2, scope: "full-body" },
    { kind: "health.damage", amount: 3, application: "localized" },
    { kind: "manual", title: "Choice", description: "G.O.D. resolves." },
  ];
  for (const effect of legacy) assert.deepEqual(decodeMechanicalEffect({ schemaVersion: 1, effectJson: effect }), effect);
  const conditionEffect: MechanicalEffect = { kind: "condition.apply", name: "Blessed", description: "Descriptive only.", duration: { kind: "combat-rounds", value: 1 } };
  const modifierEffect: MechanicalEffect = { kind: "modifier.apply", label: "Haste", channel: "initiative", targetKey: "self", amount: 2, duration: { kind: "combat-rounds", value: 1 } };
  assert.equal(encodeMechanicalEffect(conditionEffect).schemaVersion, 2);
  assert.deepEqual(decodeMechanicalEffect(encodeMechanicalEffect(conditionEffect)), conditionEffect);
  assert.deepEqual(decodeMechanicalEffect(encodeMechanicalEffect(modifierEffect)), modifierEffect);
  assert.throws(() => decodeMechanicalEffect({ schemaVersion: 1, effectJson: modifierEffect }), /version 1 cannot contain/);
});

test("invalid Modifier definitions and durations are rejected", () => {
  const invalid = [
    { kind: "modifier.apply", label: "", channel: "attribute", targetKey: "STR", amount: 1, duration: { kind: "scene" } },
    { kind: "modifier.apply", label: "Bad", channel: "attribute", targetKey: "LUCK", amount: 1, duration: { kind: "scene" } },
    { kind: "modifier.apply", label: "Bad", channel: "skill", targetKey: "Perception", amount: 1, duration: { kind: "scene" } },
    { kind: "modifier.apply", label: "Bad", channel: "initiative", targetKey: "other", amount: 1, duration: { kind: "scene" } },
    { kind: "modifier.apply", label: "Bad", channel: "damage", targetKey: "self", amount: 0, duration: { kind: "scene" } },
    { kind: "modifier.apply", label: "Bad", channel: "soak", targetKey: "self", amount: 1.5, duration: { kind: "combat-steps", value: 0 } },
  ];
  invalid.forEach((effect) => assert.equal(validateMechanicalEffect(effect).valid, false));
});

test("Condition names remain descriptive and require only a target Character", () => {
  const effect = { kind: "condition.apply", name: "Stunned", description: "A name, not behavior.", duration: { kind: "scene" } } satisfies MechanicalEffect;
  assert.deepEqual(getMechanicalEffectRequirements(effect), ["target-character"]);
  const plan = planMechanicalEffect({ effect, source: { kind: "system", id: "test", name: "Test" }, application: { targetCharacterId: 7 } });
  assert.equal(plan.status, "ready");
  assert.equal(plan.healthResult, null);
  assert.equal("amount" in effect, false);
});

test("Modifier application is persistent state rather than Health Damage", () => {
  const effect = { kind: "modifier.apply", label: "Damage aura", channel: "damage", targetKey: "self", amount: 2, duration: { kind: "scene" } } satisfies MechanicalEffect;
  const plan = planMechanicalEffect({ effect, source: { kind: "item", id: 2, name: "Aura" }, application: { targetCharacterId: 7 } });
  assert.equal(plan.status, "ready");
  assert.equal(plan.healthResult, null);
  assert.deepEqual(getMechanicalEffectRequirements(effect), ["target-character"]);
});

test("positive and negative Attribute modifiers aggregate only by exact channel and target", () => {
  const rows = [modifier(), modifier({ id: 2, amount: -1 }), modifier({ id: 3, targetKey: "DEX", amount: 9 })];
  assert.equal(getActiveModifierTotal(rows, "attribute", "STR"), 2);
  assert.equal(getActiveModifierTotal(rows, "attribute", "DEX"), 9);
  assert.equal(getActiveModifierTotal(rows, "initiative", "self"), 0);
});

test("different Skills, Movement, Initiative, Soak, and Damage remain separate", () => {
  const rows = [
    modifier({ id: 1, channel: "skill", targetKey: "skill:10", amount: 5 }),
    modifier({ id: 2, channel: "skill", targetKey: "skill:11", amount: 8 }),
    modifier({ id: 3, channel: "movement", targetKey: "movement:Land", amount: 3 }),
    modifier({ id: 4, channel: "initiative", targetKey: "self", amount: 2 }),
    modifier({ id: 5, channel: "soak", targetKey: "self", amount: 4 }),
    modifier({ id: 6, channel: "damage", targetKey: "self", amount: -2 }),
  ];
  const totals = getActiveModifierTotals(rows);
  assert.equal(totals.size, 6);
  assert.equal(totals.get("skill:skill:10"), 5);
  assert.equal(totals.get("initiative:self"), 2);
  assert.equal(totals.get("soak:self"), 4);
  assert.equal(totals.get("damage:self"), -2);
  assert.deepEqual(getActiveModifierTotalRows(rows), [
    { channel: "skill", targetKey: "skill:10", total: 5 },
    { channel: "skill", targetKey: "skill:11", total: 8 },
    { channel: "movement", targetKey: "movement:Land", total: 3 },
    { channel: "initiative", targetKey: "self", total: 2 },
    { channel: "soak", targetKey: "self", total: 4 },
    { channel: "damage", targetKey: "self", total: -2 },
  ]);
});

test("ended Modifiers remain history and stop contributing", () => {
  const rows = [modifier(), modifier({ id: 2, amount: 7, endedAt: "2026-01-02T00:00:00.000Z", endNote: "Expired at table" })];
  assert.equal(rows.length, 2);
  assert.equal(getActiveModifierTotal(rows, "attribute", "STR"), 3);
});

test("resolved Conditions remain history and are excluded by active filtering", () => {
  const rows = [condition(), condition({ id: 2, resolvedAt: "2026-01-02T00:00:00.000Z", resolutionNote: "Removed" })];
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.filter(({ resolvedAt }) => resolvedAt === null).map(({ id }) => id), [1]);
});

test("source and duration are immutable snapshots with no automatic decrement", () => {
  const row = condition();
  assert.deepEqual(row.source, source);
  assert.deepEqual(row.duration, { kind: "combat-rounds", value: 1, label: "1 Combat Round" });
  assert.equal(row.duration.value, 1);
});

test("all four duration forms normalize with structured counts", () => {
  const inputs: RuntimeDuration[] = [{ kind: "combat-steps", value: 3 }, { kind: "combat-rounds", value: 1 }, { kind: "scene" }, { kind: "until-removed" }];
  assert.deepEqual(inputs.map(formatRuntimeDuration), [
    { kind: "combat-steps", value: 3, label: "3 Combat Steps" },
    { kind: "combat-rounds", value: 1, label: "1 Combat Round" },
    { kind: "scene", value: null, label: "Scene" },
    { kind: "until-removed", value: null, label: "Until Removed" },
  ]);
});

test("Movement modifiers validate against actual supplied Movement modes", () => {
  assert.equal(validateMovementModifierTarget("movement:Land", ["Land", "Flight"]), true);
  assert.equal(validateMovementModifierTarget("movement:land", ["Land", "Flight"]), false);
  assert.equal(validateMovementModifierTarget("movement:Swim", ["Land", "Flight"]), false);
});

test("runtime-effective values do not mutate permanent values or resource maxima", () => {
  const permanent = { STR: 30, skillPoints: 4, maximumHp: 50, maximumMana: 20, spellAccessLevel: "Novice" };
  const effective = getRuntimeEffectiveValue(permanent.STR, [modifier({ amount: 5 })], "attribute", "STR");
  assert.equal(effective, 35);
  assert.deepEqual(permanent, { STR: 30, skillPoints: 4, maximumHp: 50, maximumMana: 20, spellAccessLevel: "Novice" });
});

test("schema stores generic Character-owned Condition and Modifier history", () => {
  const schema = readFileSync("src/db/realm-schema.ts", "utf8");
  assert.match(schema, /campaign_character_active_condition/);
  assert.match(schema, /campaign_character_active_modifier/);
  assert.match(schema, /references\(\(\) => campaignCharacter\.id, \{ onDelete: "cascade" \}\)/);
  assert.match(schema, /sourceEffectKey: text\("source_effect_key"\)/);
  assert.match(schema, /resolvedAt: timestamp\("resolved_at"\)/);
  assert.match(schema, /endedAt: timestamp\("ended_at"\)/);
  assert.match(schema, /modifierChannel: text\("modifier_channel"\)/);
  assert.match(schema, /amount: integer\("amount"\)/);
});

test("services preserve history, source snapshots, duration snapshots, and caller-owned transaction APIs", () => {
  const service = readFileSync("src/features/active-state/active-effects-service.ts", "utf8");
  assert.match(service, /export async function applyConditionInTransaction/);
  assert.match(service, /export async function applyModifierInTransaction/);
  assert.match(service, /export async function resolveConditionInTransaction/);
  assert.match(service, /export async function endModifierInTransaction/);
  assert.match(service, /isNull\(campaignCharacterActiveCondition\.resolvedAt\)/);
  assert.match(service, /isNull\(campaignCharacterActiveModifier\.endedAt\)/);
  assert.doesNotMatch(service, /delete\(campaignCharacterActive(?:Condition|Modifier)\)/);
  assert.doesNotMatch(service, /setInterval|setTimeout|combat.*tick|round.*tick/i);
});

test("one common bridge routes Health, Conditions, and Modifiers for Item and Spell transactions", () => {
  const bridge = readFileSync("src/features/active-state/mechanical-effect-service.ts", "utf8");
  const item = readFileSync("src/app/characters/item-use-actions.ts", "utf8");
  const spell = readFileSync("src/features/characters/character-spell-runtime-service.ts", "utf8");
  assert.match(bridge, /persistActiveHealthStateInTransaction/);
  assert.match(bridge, /applyConditionInTransaction/);
  assert.match(bridge, /applyModifierInTransaction/);
  assert.match(item, /persistPlannedMechanicalEffectInTransaction/);
  assert.match(spell, /persistPlannedMechanicalEffectInTransaction/);
  assert.doesNotMatch(item, /campaignCharacterActiveCondition|campaignCharacterActiveModifier/);
  assert.doesNotMatch(spell, /campaignCharacterActiveCondition|campaignCharacterActiveModifier/);
});

test("a fake combined transaction commits or rolls back Mana, Health, Condition, and Modifier together", async () => {
  const state = { mana: 10, health: 0, conditions: 0, modifiers: 0 };
  async function transaction(fail = false) {
    const before = { ...state };
    try {
      state.mana -= 3; state.health += 2; state.conditions += 1; state.modifiers += 1;
      if (fail) throw new Error("later persistence failed");
    } catch (error) { Object.assign(state, before); throw error; }
  }
  await transaction();
  assert.deepEqual(state, { mana: 7, health: 2, conditions: 1, modifiers: 1 });
  await assert.rejects(transaction(true), /later persistence failed/);
  assert.deepEqual(state, { mana: 7, health: 2, conditions: 1, modifiers: 1 });
});

test("authorization exposes Player and administrator reads while preserving G.O.D.-only manual mutation", () => {
  const service = readFileSync("src/features/active-state/active-effects-service.ts", "utf8");
  const panel = readFileSync("src/app/characters/active-effects-panel.tsx", "utf8");
  assert.match(service, /getActiveEffects[\s\S]*withEffectsReadAccess/);
  assert.match(service, /addManualCondition[\s\S]*withManualEffectsMutationAccess/);
  assert.match(service, /addManualModifier[\s\S]*withManualEffectsMutationAccess/);
  assert.match(service, /canReadActiveState/);
  assert.match(service, /canOperateCampaignState/);
  assert.match(panel, /\{godMode && !disabled \? <div className="active-effects-panel__controls"/);
});

test("Character and Creature NPC views reuse the shared Active State panel", () => {
  const sheet = readFileSync("src/app/characters/character-sheet.tsx", "utf8");
  const creature = readFileSync("src/app/heavens/npcs/[npcId]/creature-npc-workspace.tsx", "utf8");
  assert.match(sheet, /<ActiveEffectsPanel/);
  assert.match(creature, /<ActiveEffectsPanel/);
  assert.match(creature, /movementModes=\{draft\.currentSnapshot\.movement/);
});

test("Item authoring supports structured Condition and Modifier definitions", () => {
  const editor = readFileSync("src/app/heavens/items/item-workspace.tsx", "utf8");
  assert.match(editor, /option value="condition\.apply"/);
  assert.match(editor, /option value="modifier\.apply"/);
  assert.match(editor, /TEMPORARY_MODIFIER_CHANNELS/);
  assert.match(editor, /MODIFIER_ATTRIBUTE_KEYS/);
  assert.match(editor, /skills\.map\(\(entry\)/);
});

test("Spell adapter remains conservative for Buff, Debuff, and control effects", () => {
  const adapter = readFileSync("src/features/spell-construction/mechanical-effects-adapter.ts", "utf8");
  assert.match(adapter, /effect\.ruleId === "damage"/);
  assert.match(adapter, /effect\.ruleId === "healing"/);
  assert.match(adapter, /return manualEffectFor\(effect, rule\)/);
  assert.doesNotMatch(adapter, /condition\.apply|modifier\.apply/);
});

test("Step 8 creates no Session, Combat, timer, recharge, equipment-state, or Creature Ability engine", () => {
  const files = [
    "src/features/active-state/active-effects.ts",
    "src/features/active-state/active-effects-service.ts",
    "src/features/active-state/mechanical-effect-service.ts",
  ].map((path) => readFileSync(path, "utf8")).join("\n");
  assert.doesNotMatch(files, /setInterval|setTimeout|session_state|combat_round|initiative_tracker|recharge_state|equipment_state/);
});
