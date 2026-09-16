import assert from "node:assert/strict";
import test from "node:test";

import { createContainer, createEmptySpell } from "@/features/spell-construction/utilities/spellFactory";
import { calculateSpell } from "@/features/spell-construction/engine/calculateSpell";
import { adaptSpellToMechanicalEffects } from "@/features/spell-construction/mechanical-effects-adapter";
import { parseSpellDocument } from "@/features/spell-construction/spellDocumentCodec";
import {
  copyItemPowers,
  formatItemPowerTrigger,
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
    source: null,
    customConstruction: null,
    effects: [],
    sortOrder: 0,
    ...overrides,
  };
}

const validChargePool = { hasWeaponProfile: true, hasChargePool: true };

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
  assert.throws(() => validateItemPowers({ powers: [power({ resourceCostKind: "shared-charges", resourceCostAmount: 1 })], hasWeaponProfile: true, hasChargePool: false }), /no Charge Pool/);
  assert.throws(() => validateItemPowers({ powers: [power({ resourceCostKind: "shared-charges", resourceCostAmount: 0 })], ...validChargePool }), /positive/);
});

test("consume-item costs and passive equipment requirements are validated", () => {
  assert.doesNotThrow(() => validateItemPowers({ powers: [power({ resourceCostKind: "consume-item", resourceCostAmount: 1 })], ...validChargePool }));
  assert.throws(() => validateItemPowers({ powers: [power({ trigger: "passive", resourceCostKind: "consume-item", resourceCostAmount: 1, requiredEquipmentState: "worn" })], ...validChargePool }), /only consume/);
  assert.throws(() => validateItemPowers({ powers: [power({ trigger: "passive" })], ...validChargePool }), /Equipment State/);
});

test("Weapon-Hit Powers require a Weapon Profile", () => {
  assert.throws(() => validateItemPowers({ powers: [power({ trigger: "weapon-hit", resolutionMode: "weapon-hit" })], hasWeaponProfile: false, hasChargePool: false }), /Weapon Profile/);
  assert.doesNotThrow(() => validateItemPowers({ powers: [power({ trigger: "weapon-hit", resolutionMode: "weapon-hit" })], ...validChargePool }));
});

test("fixed rolls, multiple effects, and canonical progressive source metadata remain authored on the Power", () => {
  const source = { sourceSkillId: 4, sourceSkillName: "Fireball", sourceExtensionType: "spell-construction" as const, sourceSchemaVersion: 1, fixedPowerLevel: "Master", archived: false };
  const effect = { kind: "manual" as const, title: "Narrative", description: "Describe the flare." };
  const result = validateItemPowers({ powers: [power({ resolutionMode: "fixed-roll", fixedRollTarget: 12, source, effects: [{ id: null, effect }, { id: null, effect: { kind: "health.damage", amount: 3, application: "localized" } }] })], ...validChargePool });
  assert.equal(result[0]!.fixedRollTarget, 12);
  assert.equal(result[0]!.effects.length, 2);
  assert.equal(result[0]!.source!.fixedPowerLevel, "Master");
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

test("custom Magic, canonical source metadata, and direct effects coexist on one Item", () => {
  const document = customConstruction("Artifact Surge");
  const powers = validateItemPowers({
    powers: [
      power({ name: "Custom", customConstruction: { document } }),
      power({ name: "Canonical", source: { sourceSkillId: 4, sourceSkillName: "Fireball", sourceExtensionType: "spell-construction", sourceSchemaVersion: 1, fixedPowerLevel: "Master", archived: false } }),
      power({ name: "Direct", effects: [{ id: null, effect: { kind: "manual", title: "Relic", description: "Resolve manually." } }] }),
    ],
    ...validChargePool,
  });
  assert.equal(powers.filter((entry) => entry.customConstruction).length, 1);
  assert.equal(powers.filter((entry) => entry.source).length, 1);
  assert.equal(powers.filter((entry) => entry.effects.length > 0).length, 1);
});
