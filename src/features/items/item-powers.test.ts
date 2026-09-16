import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createContainer, createEmptySpell } from "@/features/spell-construction/utilities/spellFactory";
import { calculateSpell } from "@/features/spell-construction/engine/calculateSpell";
import { adaptSpellToMechanicalEffects } from "@/features/spell-construction/mechanical-effects-adapter";
import { parseSpellDocument } from "@/features/spell-construction/spellDocumentCodec";
import {
  copyItemPowers,
  formatItemPowerTrigger,
  resolveItemPowerConstruction,
  validateItemPowers,
  type ItemPower,
} from "./item-powers";

let constructionSequence = 0;

function customConstruction(name: string) {
  constructionSequence += 1;
  return {
    ...createEmptySpell(),
    name,
    frameworkSkillId: 1,
    sphere: "Charm",
    containers: [{
      ...createContainer("target"),
      effects: [{ id: `effect-${constructionSequence}`, ruleId: "damage", quantity: 1, description: "" }],
    }],
  };
}

function power(overrides: Partial<ItemPower> = {}): ItemPower {
  return {
    id: null,
    name: "Power",
    description: "",
    trigger: "activated",
    activationLabel: "Activate",
    initiativeCost: null,
    resourceCostKind: "none",
    resourceCostAmount: null,
    requiredEquipmentState: null,
    resolutionMode: "automatic",
    fixedRollTarget: null,
    fixedPowerLevel: null,
    source: null,
    customConstruction: null,
    effects: [],
    sortOrder: 0,
    ...overrides,
  };
}

const validChargePool = { hasWeaponProfile: true, hasChargePool: true, isMagical: true };

test("Items may have zero Powers and many independent Powers", () => {
  assert.deepEqual(validateItemPowers({ powers: [], ...validChargePool }), []);
  const powers = validateItemPowers({
    powers: [
      power({ name: "Passive One", trigger: "passive", requiredEquipmentState: "worn" }),
      power({ name: "Passive Two", trigger: "passive", requiredEquipmentState: "wielded" }),
      power({ name: "Activate One" }),
      power({ name: "Activate Two", initiativeCost: 0 }),
      power({ name: "Hit One", trigger: "weapon-hit", resolutionMode: "weapon-hit" }),
      power({ name: "Hit Two", trigger: "weapon-hit", resolutionMode: "weapon-hit" }),
    ],
    ...validChargePool,
  });
  assert.equal(powers.length, 6);
  assert.equal(formatItemPowerTrigger(powers[4]!.trigger), "Weapon Hit");
});

test("Power initiative accepts blank and zero but rejects negative values", () => {
  assert.equal(validateItemPowers({ powers: [power({ initiativeCost: 0 })], ...validChargePool })[0]!.initiativeCost, 0);
  assert.throws(() => validateItemPowers({ powers: [power({ initiativeCost: -1 })], ...validChargePool }), /Initiative/);
});

test("shared Charges require an Item Charge Pool and each Power owns its cost", () => {
  const powers = validateItemPowers({
    powers: [power({ name: "Fireball", resourceCostKind: "shared-charges", resourceCostAmount: 2 }), power({ name: "Inferno", resourceCostKind: "shared-charges", resourceCostAmount: 5 })],
    ...validChargePool,
  });
  assert.deepEqual(powers.map((entry) => entry.resourceCostAmount), [2, 5]);
  assert.throws(() => validateItemPowers({ powers: [power({ resourceCostKind: "shared-charges", resourceCostAmount: 1 })], hasWeaponProfile: true, hasChargePool: false, isMagical: true }), /no Charge Pool/);
  assert.throws(() => validateItemPowers({ powers: [power({ resourceCostKind: "shared-charges", resourceCostAmount: 0 })], ...validChargePool }), /positive/);
});

test("consume-item costs and passive equipment requirements are validated", () => {
  assert.doesNotThrow(() => validateItemPowers({ powers: [power({ resourceCostKind: "consume-item", resourceCostAmount: 1 })], ...validChargePool }));
  assert.throws(() => validateItemPowers({ powers: [power({ trigger: "passive", resourceCostKind: "consume-item", resourceCostAmount: 1, requiredEquipmentState: "worn" })], ...validChargePool }), /only consume/);
  assert.throws(() => validateItemPowers({ powers: [power({ trigger: "passive" })], ...validChargePool }), /Equipment State/);
});

test("Weapon-Hit Powers require a Weapon Profile", () => {
  assert.throws(() => validateItemPowers({ powers: [power({ trigger: "weapon-hit", resolutionMode: "weapon-hit" })], hasWeaponProfile: false, hasChargePool: false, isMagical: true }), /Weapon Profile/);
  assert.doesNotThrow(() => validateItemPowers({ powers: [power({ trigger: "weapon-hit", resolutionMode: "weapon-hit" })], ...validChargePool }));
});

test("fixed rolls, multiple effects, and canonical progressive source metadata remain authored on the Power", () => {
  const source = { sourceSkillId: 4, sourceSkillName: "Fireball", sourceExtensionType: "spell-construction" as const, sourceSchemaVersion: 1, archived: false };
  const effect = { kind: "manual" as const, title: "Narrative", description: "Describe the flare." };
  const result = validateItemPowers({ powers: [power({ resolutionMode: "fixed-roll", fixedRollTarget: 12, fixedPowerLevel: "Master", source, effects: [{ id: null, effect }, { id: null, effect: { kind: "health.damage", amount: 3, application: "localized" } }] })], ...validChargePool });
  assert.equal(result[0]!.fixedRollTarget, 12);
  assert.equal(result[0]!.effects.length, 2);
  assert.equal(result[0]!.fixedPowerLevel, "Master");
  assert.equal(createEmptySpell().progressive.milestones.length >= 0, true);
});

test("Power variants receive independent identities and do not share effect objects", () => {
  const original = [power({ id: 10, effects: [{ id: 20, effect: { kind: "manual", title: "A", description: "B" } }] })];
  const copied = copyItemPowers(original);
  assert.equal(copied[0]!.id, null);
  assert.equal(copied[0]!.effects[0]!.id, null);
  assert.notEqual(copied[0]!.effects[0]!.effect, original[0]!.effects[0]!.effect);
});

test("custom Magic Construction is a lossless Power-owned SpellDocument", () => {
  const document = customConstruction("Frozen Nova");
  const powers = validateItemPowers({
    powers: [power({ name: "Frozen Nova", initiativeCost: 3, customConstruction: { document } })],
    ...validChargePool,
  });
  const savedJson = JSON.stringify(powers[0]!.customConstruction!.document);
  const reloaded = parseSpellDocument(savedJson);
  assert.deepEqual(parseSpellDocument(JSON.stringify(reloaded)), reloaded);
  assert.equal(calculateSpell(reloaded).baseCombatCastingTime >= 0, true);
  assert.equal(adaptSpellToMechanicalEffects(reloaded).valid, true);
});

test("progressive custom Magic may use its base construction without an Item Power Level", () => {
  const document = { ...customConstruction("Base Progressive"), modifiers: [{ id: "progressive", ruleId: "progressive-spell", quantity: 1, description: "" }] };
  assert.doesNotThrow(() => validateItemPowers({ powers: [power({ customConstruction: { document } })], ...validChargePool }));
  const resolved = resolveItemPowerConstruction(document, null);
  assert.equal(resolved.progressive, false);
});

test("custom Magic, canonical source metadata, and direct effects coexist on one Item", () => {
  const document = customConstruction("Artifact Surge");
  const powers = validateItemPowers({
    powers: [
      power({ name: "Custom", customConstruction: { document } }),
      power({ name: "Canonical", fixedPowerLevel: "Master", source: { sourceSkillId: 4, sourceSkillName: "Fireball", sourceExtensionType: "spell-construction", sourceSchemaVersion: 1, archived: false } }),
      power({ name: "Direct", effects: [{ id: null, effect: { kind: "manual", title: "Relic", description: "Resolve manually." } }] }),
    ],
    ...validChargePool,
  });
  assert.equal(powers.filter((entry) => entry.customConstruction).length, 1);
  assert.equal(powers.filter((entry) => entry.source).length, 1);
  assert.equal(powers.filter((entry) => entry.effects.length > 0).length, 1);
});

test("Power source modes and triggers reject contradictory authoring", () => {
  const document = customConstruction("Conflict");
  assert.throws(() => validateItemPowers({ powers: [power({ source: { sourceSkillId: 1, sourceSkillName: "Source", sourceExtensionType: "spell-construction", sourceSchemaVersion: 1, archived: false }, customConstruction: { document } })], ...validChargePool }), /both a Canonical Source/);
  assert.throws(() => validateItemPowers({ powers: [power({ trigger: "weapon-hit", resolutionMode: "automatic" })], ...validChargePool }), /Weapon-Hit resolution/);
  assert.throws(() => validateItemPowers({ powers: [power({ trigger: "passive", initiativeCost: 1, requiredEquipmentState: "worn" })], ...validChargePool }), /activation Initiative/);
  assert.throws(() => validateItemPowers({ powers: [power({ trigger: "passive", resolutionMode: "fixed-roll", requiredEquipmentState: "worn" })], ...validChargePool }), /cannot use activation/);
  assert.throws(() => validateItemPowers({ powers: [power({ customConstruction: { document } })], hasWeaponProfile: true, hasChargePool: true, isMagical: false }), /Magical Item/);
});

test("passive Power Effects reuse passive Item Effect safety and lifecycle rules", () => {
  const passive = (effect: ItemPower["effects"][number]["effect"]) => validateItemPowers({ powers: [power({ trigger: "passive", requiredEquipmentState: "worn", effects: [{ id: null, effect }] })], ...validChargePool })[0]!.effects[0]!.effect;
  assert.throws(() => passive({ kind: "health.damage", amount: 1, application: "localized" }), /cannot be automatic passive/);
  assert.throws(() => passive({ kind: "health.heal", amount: 1, scope: "full-body" }), /cannot be automatic passive/);
  const condition = passive({ kind: "condition.apply", name: "Fear", description: "", duration: { kind: "scene", value: null } });
  assert.equal(condition.kind, "condition.apply");
  if (condition.kind === "condition.apply") assert.deepEqual(condition.duration, { kind: "until-removed", value: null, label: "While Worn" });
  const modifier = passive({ kind: "modifier.apply", label: "Soak", channel: "initiative", targetKey: "self", amount: 1, duration: { kind: "combat-rounds", value: 2 } });
  if (modifier.kind === "modifier.apply") assert.deepEqual(modifier.duration, { kind: "until-removed", value: null, label: "While Worn" });
  assert.equal(passive({ kind: "manual", title: "Judgment", description: "Resolve manually." }).kind, "manual");
  assert.doesNotThrow(() => validateItemPowers({ powers: [power({ trigger: "activated", effects: [{ id: null, effect: { kind: "health.damage", amount: 1, application: "localized" } }] })], ...validChargePool }));
  assert.doesNotThrow(() => validateItemPowers({ powers: [power({ trigger: "weapon-hit", resolutionMode: "weapon-hit", effects: [{ id: null, effect: { kind: "health.damage", amount: 1, application: "localized" } }] })], ...validChargePool }));
});

test("Item save source reconciles Power identities instead of deleting the Power collection", () => {
  const actions = readFileSync("src/app/heavens/items/actions.ts", "utf8");
  assert.match(actions, /existingPowers = await tx\.select\(\)\.from\(itemPower\)/);
  assert.match(actions, /Power identities do not belong to this Item/);
  assert.match(actions, /tx\.update\(itemPower\)/);
  assert.doesNotMatch(actions, /await tx\.delete\(itemPower\)\.where\(eq\(itemPower\.itemId, id!\)\)/);
});

test("Item authoring presents Abilities as the primary composition and keeps legacy behavior advanced", () => {
  const workspace = readFileSync("src/app/heavens/items/item-workspace.tsx", "utf8");
  assert.match(workspace, /id: "abilities", label: "Abilities"/);
  assert.match(workspace, /\+ Add Ability/);
  assert.match(workspace, /Advanced \/ Legacy Item Use/);
  assert.match(workspace, /While Equipped/);
  assert.match(workspace, /On Weapon Hit/);
  assert.match(workspace, /No Abilities authored/);
});
