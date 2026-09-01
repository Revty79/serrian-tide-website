import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { ActiveHealthAnatomy, ActiveHealthState } from "@/features/active-state/models";
import {
  adaptCreatureAbilityToMechanicalEffects,
  createCreatureAbilityEffect,
  type CreatureAbilityDefinition,
} from "@/features/creatures/creature-ability";
import {
  executeItemUseInTransaction,
  planItemUse,
  type ItemUseDefinition,
} from "@/features/items/item-use";
import type { ItemRuntimeProfile } from "@/features/items/item-runtime";
import {
  shouldPassiveEffectBeActive,
  validatePassiveItemEffect,
} from "@/features/items/equipment-state";
import {
  adaptSpellToMechanicalEffects,
} from "@/features/spell-construction/mechanical-effects-adapter";
import type {
  EffectSelection,
  SpellContainer,
  SpellDocument,
} from "@/features/spell-construction/models/spell";
import {
  createContainer,
  createEmptySpell,
} from "@/features/spell-construction/utilities/spellFactory";

import {
  MECHANICAL_EFFECT_SCHEMA_VERSION,
  planMechanicalEffect,
  validateMechanicalEffect,
  type MechanicalEffect,
} from ".";

const audit = readFileSync("docs/runtime-foundation/step-12-mechanical-effect-vocabulary-audit.md", "utf8");
const spellAdapter = readFileSync("src/features/spell-construction/mechanical-effects-adapter.ts", "utf8");
const creatureAdapter = readFileSync("src/features/creatures/creature-ability.ts", "utf8");
const effectModels = readFileSync("src/features/mechanical-effects/models.ts", "utf8");
const itemRuntime = readFileSync("src/features/items/item-use.ts", "utf8");
const spellRuntime = readFileSync("src/features/characters/character-spell-runtime.ts", "utf8");
const creatureRuntime = readFileSync("src/features/creatures/creature-ability-runtime.ts", "utf8");
const bridge = readFileSync("src/features/active-state/mechanical-effect-service.ts", "utf8");
const baseline = readFileSync("drizzle/0000_serrian_tide_baseline.sql", "utf8");
const itemSchema = readFileSync("src/db/item-schema.ts", "utf8");
const realmSchema = readFileSync("src/db/realm-schema.ts", "utf8");
const creatureSchema = readFileSync("src/db/creature-schema.ts", "utf8");

const anatomy: ActiveHealthAnatomy = {
  kind: "humanoid",
  totalMaximumHp: 50,
  maximumHpNote: null,
  pools: [{ key: "torso", name: "Torso", maximumHp: 30, percentage: 60, sortOrder: 0 }],
  hitLocations: [{ result: 8, name: "Torso", bodyParts: "Torso", poolKey: "torso", poolName: "Torso" }],
};

function healthState(totalDamage = 10): ActiveHealthState {
  return {
    characterId: 7,
    totalDamage,
    pools: [{ poolKey: "torso", poolNameSnapshot: "Torso", damage: Math.min(totalDamage, 4) }],
    injuries: [],
  };
}

const unlimitedProfile: ItemRuntimeProfile = {
  useMode: "unlimited",
  quantityPerUse: null,
  maximumCharges: null,
  chargesPerUse: null,
  rechargeNotes: "",
  activationLabel: "Use",
  useNotes: "",
};

function itemDefinition(effects: readonly MechanicalEffect[]): ItemUseDefinition {
  return {
    id: 9,
    name: "Audit Item",
    runtimeProfile: unlimitedProfile,
    effects: effects.map((effect, index) => ({
      id: index + 1,
      schemaVersion: MECHANICAL_EFFECT_SCHEMA_VERSION,
      effectJson: effect,
      sortOrder: index,
    })),
  };
}

function itemPlan(effects: readonly MechanicalEffect[]) {
  return planItemUse({
    definition: itemDefinition(effects),
    resource: { kind: "stack", quantity: 1 },
    requestedItemInstanceId: null,
    target: { characterId: 7, name: "Audit Target", anatomy, state: healthState() },
    effectSelections: {},
  });
}

function spellEffect(id: string, ruleId: string, quantity = 1, healingScope?: "full-body" | "area"): EffectSelection {
  return { id, ruleId, quantity, description: "", ...(healingScope ? { healingScope } : {}) };
}

function spellWith(...effects: EffectSelection[]): SpellDocument {
  const root: SpellContainer = { ...createContainer("target"), id: "audit-container", effects };
  return {
    ...createEmptySpell(),
    id: "step-12-audit-spell",
    name: "Step 12 Audit Spell",
    frameworkSkillId: 1,
    sphere: "Water",
    containers: [root],
  };
}

function ability(update: Partial<CreatureAbilityDefinition> = {}): CreatureAbilityDefinition {
  return {
    canonicalId: "ABL-AUDIT",
    abilityName: "Audit Ability",
    abilityType: "Supernatural",
    activation: "Active",
    requirements: "",
    usesRecharge: "",
    description: "",
    mechanicalEffect: "",
    notes: "",
    sortOrder: 0,
    crImpact: "None",
    effects: [],
    ...update,
  };
}

function requireValidSpell(spell: SpellDocument) {
  const result = adaptSpellToMechanicalEffects(spell);
  assert.equal(result.valid, true, result.valid ? undefined : JSON.stringify(result.issues));
  if (!result.valid) throw new Error("Expected a valid Spell adaptation.");
  return result;
}

test("12.1 the existing five Mechanical Effect kinds remain valid", () => {
  const effects: MechanicalEffect[] = [
    { kind: "health.damage", amount: 2, application: "localized" },
    { kind: "health.heal", amount: 2, scope: "full-body" },
    { kind: "condition.apply", name: "Poisoned", description: "No hidden mechanics.", duration: { kind: "until-removed", value: null } },
    { kind: "modifier.apply", label: "Slowed", channel: "initiative", targetKey: "self", amount: -1, duration: { kind: "scene", value: null } },
    { kind: "manual", title: "Resolve", description: "Resolve at the table." },
  ];
  assert.equal(effects.every((effect) => validateMechanicalEffect(effect).valid), true);
  assert.equal(MECHANICAL_EFFECT_SCHEMA_VERSION, 2);
});

test("12.2 unknown Mechanical Effect kinds remain invalid", () => {
  assert.equal(validateMechanicalEffect({ kind: "mana.restore", amount: 5 }).valid, false);
  assert.equal(validateMechanicalEffect({ kind: "forced-move", distance: 10 }).valid, false);
});

test("12.3 Manual remains a first-class non-mutating plan", () => {
  const planned = planMechanicalEffect({ effect: { kind: "manual", title: "Choice", description: "The G.O.D. chooses." } });
  assert.equal(planned.status, "manual");
  assert.equal(planned.healthResult, null);
  assert.deepEqual(planned.issues, []);
});

test("12.4 no legacy source text is parsed into mechanics", () => {
  assert.doesNotMatch(spellAdapter, /parse.*description|description.*parse/i);
  assert.match(spellAdapter, /not mechanically interpreted/);
  assert.doesNotMatch(creatureAdapter, /parse.*mechanicalEffect|mechanicalEffect.*parse/i);
  assert.doesNotMatch(itemRuntime, /parse.*description|description.*parse/i);
});

test("12.5 Creature legacy Abilities remain one temporary Manual effect", () => {
  const result = adaptCreatureAbilityToMechanicalEffects(ability({ mechanicalEffect: "Deal 9 damage each round after a resistance test." }));
  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.deepEqual(result.effects.map(({ definition }) => definition.effect.kind), ["manual"]);
  assert.equal(result.effects[0]?.compatibilityFallback, true);
});

test("12.6 generic Spell Buff remains Manual", () => {
  const result = requireValidSpell(spellWith(spellEffect("buff", "buff", 3)));
  assert.equal(result.effects[0]?.definition.effect.kind, "manual");
});

test("12.7 Knockdown remains Manual", () => {
  const result = requireValidSpell(spellWith(spellEffect("knockdown", "knockdown")));
  assert.equal(result.effects[0]?.definition.effect.kind, "manual");
});

test("12.8 forced movement remains Manual", () => {
  const result = requireValidSpell(spellWith(spellEffect("push", "push"), spellEffect("pull", "pull")));
  assert.deepEqual(result.effects.map(({ definition }) => definition.effect.kind), ["manual", "manual"]);
});

test("12.9 ongoing round-based Damage remains Manual without ticking infrastructure", () => {
  const result = adaptCreatureAbilityToMechanicalEffects(ability({ mechanicalEffect: "Take 3 Damage each round while nearby." }));
  assert.equal(result.valid, true);
  if (result.valid) assert.equal(result.effects[0]?.definition.effect.kind, "manual");
  assert.doesNotMatch([itemRuntime, spellRuntime, creatureRuntime].join("\n"), /tickMechanicalEffect|advanceEffectRound/);
});

test("12.10 regeneration remains Manual without timing or death infrastructure", () => {
  const result = adaptCreatureAbilityToMechanicalEffects(ability({ abilityName: "Head Regrowth", description: "Regrows one head later." }));
  assert.equal(result.valid, true);
  if (result.valid) assert.equal(result.effects[0]?.definition.effect.kind, "manual");
});

test("12.11 form and anatomy effects remain Manual", () => {
  const result = adaptCreatureAbilityToMechanicalEffects(ability({ abilityName: "Incorporeal Form", mechanicalEffect: "Ordinary hit locations do not apply." }));
  assert.equal(result.valid, true);
  if (result.valid) assert.equal(result.effects[0]?.definition.effect.kind, "manual");
});

test("12.12 action-economy effects remain Manual", () => {
  const result = adaptCreatureAbilityToMechanicalEffects(ability({ abilityName: "Multiple Heads", mechanicalEffect: "Allows repeated bite pressure; exact actions unresolved." }));
  assert.equal(result.valid, true);
  if (result.valid) assert.equal(result.effects[0]?.definition.effect.kind, "manual");
});

test("12.13 Item automatic Health still plans through the common bridge", () => {
  const planned = itemPlan([{ kind: "health.heal", amount: 4, scope: "full-body" }]);
  assert.equal(planned.ready, true);
  assert.equal(planned.initialHealth.totalDamage, 10);
  assert.equal(planned.finalHealth.totalDamage, 6);
});

test("12.14 Item Condition and Modifier effects still plan without mutating Health", () => {
  const planned = itemPlan([
    { kind: "condition.apply", name: "Shielded", description: "", duration: { kind: "scene", value: null } },
    { kind: "modifier.apply", label: "Strong", channel: "attribute", targetKey: "STR", amount: 1, duration: { kind: "scene", value: null } },
  ]);
  assert.equal(planned.ready, true);
  assert.deepEqual(planned.effects.map(({ plan }) => plan.status), ["ready", "ready"]);
  assert.equal(planned.finalHealth.totalDamage, planned.initialHealth.totalDamage);
});

test("12.15 Spell Health mappings remain objective and unchanged", () => {
  const result = requireValidSpell(spellWith(
    spellEffect("damage", "damage", 3),
    spellEffect("healing", "healing", 2, "full-body"),
  ));
  assert.deepEqual(result.effects.map(({ definition }) => definition.effect.kind), ["health.damage", "health.heal"]);
});

test("12.16 unsupported Spell consequences remain explicit Manual effects", () => {
  const result = requireValidSpell(spellWith(
    spellEffect("counter", "counter-cancel"),
    spellEffect("transfer", "transfer-life-force"),
    spellEffect("teleport", "teleportation"),
  ));
  assert.deepEqual(result.effects.map(({ definition }) => definition.effect.kind), ["manual", "manual", "manual"]);
});

test("12.17 Creature Ability structured effects still use the shared contract", () => {
  const structured = createCreatureAbilityEffect("poisoned", {
    kind: "condition.apply",
    name: "Poisoned",
    description: "The prerequisite was resolved manually.",
    duration: { kind: "until-removed", value: null },
  }, 0);
  const result = adaptCreatureAbilityToMechanicalEffects(ability({ effects: [structured], mechanicalEffect: "Legacy poison prose." }));
  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.deepEqual(result.effects.map(({ definition }) => definition.effect.kind), ["condition.apply"]);
  assert.equal(result.source.kind, "creature-ability");
});

test("12.18 passive Item reconciliation remains restricted and state-driven", () => {
  const passive = validatePassiveItemEffect({
    id: 4,
    requiredEquipmentState: "worn",
    effect: { kind: "modifier.apply", label: "Ward", channel: "soak", targetKey: "self", amount: 1, duration: { kind: "until-removed", value: null } },
  });
  assert.equal(passive.effect.kind, "modifier.apply");
  assert.equal(shouldPassiveEffectBeActive({ requiredEquipmentState: "worn", activeStackQuantities: { worn: 1 }, instanceStates: [] }), true);
  assert.throws(() => validatePassiveItemEffect({
    id: 5,
    requiredEquipmentState: "worn",
    effect: { kind: "health.heal", amount: 1, scope: "full-body" },
  }), /cannot be automatic passive/);
});

test("12.19 source metadata remains intact across Item, Spell, and Creature paths", () => {
  assert.deepEqual(itemPlan([{ kind: "health.heal", amount: 1, scope: "full-body" }]).source, { kind: "item", id: 9, name: "Audit Item" });
  assert.deepEqual(requireValidSpell(spellWith(spellEffect("damage", "damage"))).source, { kind: "spell", id: "step-12-audit-spell", name: "Step 12 Audit Spell" });
  assert.deepEqual(adaptCreatureAbilityToMechanicalEffects(ability({ mechanicalEffect: "Resolve." })).source, { kind: "creature-ability", id: "ABL-AUDIT", name: "Audit Ability" });
  assert.match(bridge, /source: plan\.source/);
});

test("12.20 caller-owned transaction rollback remains intact", async () => {
  const planned = itemPlan([
    { kind: "health.heal", amount: 2, scope: "full-body" },
    { kind: "condition.apply", name: "Rested", description: "", duration: { kind: "scene", value: null } },
  ]);
  const committed = { quantity: 1, effects: 0 };
  await assert.rejects(executeItemUseInTransaction(async (operation) => {
    const working = structuredClone(committed);
    try {
      const result = await operation({
        loadAndPlan: async () => planned,
        consumeResource: async () => { working.quantity = 1; },
        applyAutomaticEffect: async () => {
          working.effects += 1;
          if (working.effects === 2) throw new Error("simulated later persistence failure");
        },
      });
      Object.assign(committed, working);
      return result;
    } catch (error) {
      throw error;
    }
  }), /simulated later persistence failure/);
  assert.deepEqual(committed, { quantity: 1, effects: 0 });
});

test("Step 12 audit and Step 13 inventory are source-grounded and add no schema vocabulary", () => {
  assert.match(audit, /all 1,007 checked-in Items/);
  assert.match(audit, /all 62 construction rules/);
  assert.match(audit, /all 45 checked-in Creature Ability definitions/);
  assert.match(audit, /No new Mechanical Effect kind is approved/);
  assert.doesNotMatch(effectModels, /mana\.restore|condition\.resolve|modifier\.end|charge\.restore/);

  for (const table of [
    "item_runtime_profiles",
    "item_effects",
    "item_passive_effects",
    "campaign_character_item_instance",
    "campaign_character_item_equipment_state",
    "campaign_character_active_mana",
    "campaign_character_active_condition",
    "campaign_character_active_modifier",
    "creature_ability_effects",
  ]) {
    assert.doesNotMatch(baseline, new RegExp(`CREATE TABLE "${table}"`));
  }
  assert.match(itemSchema, /"item_runtime_profiles"/);
  assert.match(itemSchema, /"item_effects"/);
  assert.match(itemSchema, /"item_passive_effects"/);
  assert.match(realmSchema, /"campaign_character_item_instance"/);
  assert.match(realmSchema, /"campaign_character_item_equipment_state"/);
  assert.match(realmSchema, /"campaign_character_active_mana"/);
  assert.match(realmSchema, /"campaign_character_active_condition"/);
  assert.match(realmSchema, /"campaign_character_active_modifier"/);
  assert.match(creatureSchema, /"creature_ability_effects"/);
});
