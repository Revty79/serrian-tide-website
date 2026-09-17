import assert from "node:assert/strict";
import test from "node:test";

import { adaptSpellToMechanicalEffects } from "./mechanical-effects-adapter";
import { analyzeSpellTargetGroups } from "./spell-target-groups";
import type { EffectSelection, SpellContainer, SpellDocument } from "./models/spell";
import { createContainer, createEmptySpell } from "./utilities/spellFactory";

function effect(id: string, ruleId = "damage"): EffectSelection {
  return { id, ruleId, quantity: 2, description: "" };
}

function spellWith(...containers: SpellContainer[]): SpellDocument {
  return { ...createEmptySpell(), id: "shared-target-groups", name: "Shared Target Groups", frameworkSkillId: 1, containers };
}

function groupsFor(spell: SpellDocument) {
  const adapted = adaptSpellToMechanicalEffects(spell);
  assert.equal(adapted.valid, true, adapted.valid ? undefined : JSON.stringify(adapted.issues));
  if (!adapted.valid) throw new Error("Expected valid spell effects.");
  return analyzeSpellTargetGroups(spell, adapted.effects).groups;
}

test("shared analysis exposes self-target metadata", () => {
  const self = { ...createContainer("target"), id: "self", rangeRuleId: "self", effects: [effect("self-damage")] };
  const [group] = groupsFor(spellWith(self));
  assert.deepEqual(group, {
    id: "self",
    kind: "target",
    containerPath: ["self"],
    label: "Target container",
    rangeLabel: "Self",
    shapeLabel: null,
    capacity: 1,
    selfTargeted: true,
    automaticEffectIds: ["self-damage"],
  });
});

test("shared analysis preserves ordinary capacity and multiple authored groups", () => {
  const first = { ...createContainer("target"), id: "first", multiTarget: { ruleId: "multi-target", additionalTargets: 2 }, effects: [effect("first-effect")] };
  const second = { ...createContainer("aoe"), id: "second", shape: { id: "shape", ruleId: "sphere", quantity: 1 }, effects: [effect("second-effect")] };
  const groups = groupsFor(spellWith(first, second));
  assert.equal(groups.length, 2);
  assert.equal(groups[0]?.capacity, 3);
  assert.deepEqual(groups.map(({ id, kind, containerPath, automaticEffectIds }) => ({ id, kind, containerPath, automaticEffectIds })), [
    { id: "first", kind: "target", containerPath: ["first"], automaticEffectIds: ["first-effect"] },
    { id: "second", kind: "aoe", containerPath: ["second"], automaticEffectIds: ["second-effect"] },
  ]);
});

test("nearest authored container owns nested Magic effects", () => {
  const nested = { ...createContainer("target"), id: "nested", effects: [effect("nested-effect")] };
  const outer = { ...createContainer("target"), id: "outer", effects: [effect("outer-effect")], children: [nested] };
  const groups = groupsFor(spellWith(outer));
  assert.deepEqual(groups.map(({ id, automaticEffectIds }) => ({ id, automaticEffectIds })), [
    { id: "outer", automaticEffectIds: ["outer-effect"] },
    { id: "nested", automaticEffectIds: ["nested-effect"] },
  ]);
});
