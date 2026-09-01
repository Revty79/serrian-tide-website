import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  adaptProgressiveSpellToMechanicalEffects,
  adaptSpellToMechanicalEffects,
  type SpellMechanicalEffectsAdapterResult,
} from "./mechanical-effects-adapter";
import type { EffectSelection, SpellContainer, SpellDocument } from "./models/spell";
import { parseSpellDocument } from "./spellDocumentCodec";
import {
  cloneContainerWithNewIds,
  createContainer,
  createEmptySpell,
  createModifierSelection,
} from "./utilities/spellFactory";

function effect(
  id: string,
  ruleId: string,
  quantity: number,
  options: Pick<EffectSelection, "description" | "healingScope"> = {},
): EffectSelection {
  return { id, ruleId, quantity, description: options.description ?? "", ...options };
}

function container(
  id: string,
  effects: EffectSelection[],
  children: SpellContainer[] = [],
): SpellContainer {
  return { ...createContainer("target"), id, effects, children };
}

function spellWith(...containers: SpellContainer[]): SpellDocument {
  return {
    ...createEmptySpell(),
    id: "spell-runtime-adapter",
    name: "Runtime Adapter Spell",
    frameworkSkillId: 1,
    sphere: "Water",
    containers,
  };
}

function requireValid(
  result: SpellMechanicalEffectsAdapterResult,
): Extract<SpellMechanicalEffectsAdapterResult, { valid: true }> {
  assert.equal(result.valid, true, result.valid ? undefined : JSON.stringify(result.issues));
  if (!result.valid) throw new Error("Expected a valid Spell Mechanical Effects adaptation.");
  return result;
}

test("Damage quantities 1 and 7 map directly to separate localized health.damage definitions", () => {
  const result = requireValid(adaptSpellToMechanicalEffects(spellWith(container("root", [
    effect("damage-one", "damage", 1),
    effect("damage-seven", "damage", 7),
  ]))));

  assert.deepEqual(result.effects.map(({ spellEffectId, definition }) => ({
    spellEffectId,
    effect: definition.effect,
  })), [
    {
      spellEffectId: "damage-one",
      effect: { kind: "health.damage", amount: 1, application: "localized" },
    },
    {
      spellEffectId: "damage-seven",
      effect: { kind: "health.damage", amount: 7, application: "localized" },
    },
  ]);
  assert.doesNotMatch(
    JSON.stringify(result.effects),
    /targetCharacterId|poolKey|hitLocation|anatomy/i,
  );
});

test("Healing quantity 7 maps to Full Body or Area only when the structured choice exists", () => {
  const result = requireValid(adaptSpellToMechanicalEffects(spellWith(container("root", [
    effect("heal-full", "healing", 7, { healingScope: "full-body" }),
    effect("heal-area", "healing", 7, { healingScope: "area" }),
  ]))));

  assert.deepEqual(result.effects.map(({ definition }) => definition.effect), [
    { kind: "health.heal", amount: 7, scope: "full-body" },
    { kind: "health.heal", amount: 7, scope: "area" },
  ]);
});

test("unconfigured legacy Healing remains Manual and keeps its authoritative amount", () => {
  const result = requireValid(adaptSpellToMechanicalEffects(spellWith(container("root", [
    effect("legacy-heal", "healing", 7),
  ]))));
  const translated = result.effects[0]!.definition.effect;

  assert.equal(translated.kind, "manual");
  if (translated.kind !== "manual") assert.fail("Expected unresolved Healing to remain Manual.");
  assert.match(translated.title, /Healing.*Unspecified/i);
  assert.match(translated.description, /Healing amount: 7/);
  assert.match(translated.description, /Full Body or Area/);
  assert.match(translated.description, /G\.O\.D\./);
});

test("known Buff, Knockdown, and Teleportation rules become descriptive Manual effects", () => {
  const result = requireValid(adaptSpellToMechanicalEffects(spellWith(container("root", [
    effect("buff", "buff", 2, { description: "Flavor says deal 999 damage." }),
    effect("knockdown", "knockdown", 1),
    effect("teleport", "teleportation", 1),
  ]))));

  assert.deepEqual(result.effects.map(({ definition }) => definition.effect.kind), [
    "manual",
    "manual",
    "manual",
  ]);
  const buff = result.effects[0]!.definition.effect;
  assert.equal(buff.kind, "manual");
  if (buff.kind !== "manual") assert.fail("Expected Buff to remain Manual.");
  assert.match(buff.title, /Buff/);
  assert.match(buff.description, /Quantity: 2/);
  assert.match(buff.description, /Rule definition:/);
  assert.match(buff.description, /Rule guidance:/);
  assert.match(buff.description, /not mechanically interpreted.*deal 999 damage/i);
});

test("unknown rules and invalid quantities invalidate the whole adaptation instead of becoming executable", () => {
  const unknown = adaptSpellToMechanicalEffects(spellWith(container("root", [
    effect("corrupt", "not-a-real-rule", 1),
  ])));
  assert.equal(unknown.valid, false);
  assert.deepEqual(unknown.effects, []);
  if (unknown.valid) assert.fail("Unknown rule unexpectedly adapted.");
  assert.equal(unknown.issues[0]?.code, "unknown-effect-rule");

  for (const quantity of [0, Number.NaN, Number.POSITIVE_INFINITY]) {
    const invalid = adaptSpellToMechanicalEffects(spellWith(container("root", [
      effect("invalid-quantity", "damage", quantity),
    ])));
    assert.equal(invalid.valid, false);
    assert.deepEqual(invalid.effects, []);
    if (invalid.valid) assert.fail("Invalid quantity unexpectedly adapted.");
    assert.ok(invalid.issues.some(({ code }) => code === "invalid-effect-quantity"));
  }
});

test("effect identity, source metadata, container paths, and preorder traversal remain deterministic", () => {
  const nested = container("nested", [effect("nested-heal", "healing", 3, {
    healingScope: "area",
  })]);
  const spell = spellWith(
    container("first-root", [
      effect("first-damage", "damage", 1),
      effect("first-buff", "buff", 1),
    ], [nested]),
    container("second-root", [effect("second-damage", "damage", 2)]),
  );
  const result = requireValid(adaptSpellToMechanicalEffects(spell));

  assert.deepEqual(result.source, {
    kind: "spell",
    id: "spell-runtime-adapter",
    name: "Runtime Adapter Spell",
  });
  assert.deepEqual(result.effects.map(({ spellEffectId }) => spellEffectId), [
    "first-damage",
    "first-buff",
    "nested-heal",
    "second-damage",
  ]);
  assert.deepEqual(result.effects[2]!.containerPath, ["first-root", "nested"]);
  assert.equal(result.effects[2]!.containerId, "nested");
  assert.deepEqual(result.effects[0]!.definition.source, result.source);
});

test("duplicate effect occurrence IDs are corruption and never silently merge", () => {
  const result = adaptSpellToMechanicalEffects(spellWith(
    container("root", [effect("duplicate", "damage", 1)]),
    container("other-root", [effect("duplicate", "healing", 1, { healingScope: "area" })]),
  ));
  assert.equal(result.valid, false);
  assert.deepEqual(result.effects, []);
  if (result.valid) assert.fail("Duplicate identity unexpectedly adapted.");
  assert.ok(result.issues.some(({ code }) => code === "duplicate-effect-id"));
});

test("cloned effects receive one new stable identity that adaptation preserves with Healing Application", () => {
  const original = container("original", [
    effect("original-heal", "healing", 6, { healingScope: "area" }),
  ]);
  const cloned = cloneContainerWithNewIds(original);
  const clonedEffect = cloned.effects[0]!;
  assert.notEqual(clonedEffect.id, "original-heal");
  assert.equal(clonedEffect.healingScope, "area");

  const result = requireValid(adaptSpellToMechanicalEffects(spellWith(cloned)));
  assert.equal(result.effects[0]!.spellEffectId, clonedEffect.id);
});

test("schema v7 round-trips Healing Application and does not alter non-Healing effects", () => {
  const spell = spellWith(container("root", [
    effect("healing", "healing", 7, { healingScope: "full-body" }),
    effect("damage", "damage", 2),
  ]));
  const parsed = parseSpellDocument(JSON.stringify(spell));

  assert.equal(parsed.schemaVersion, 7);
  assert.equal(parsed.containers[0]!.effects[0]!.healingScope, "full-body");
  assert.equal("healingScope" in parsed.containers[0]!.effects[1]!, false);
  assert.deepEqual(parsed.containers[0]!.effects[1], spell.containers[0]!.effects[1]);
});

test("schema-v6 Healing decodes to v7 without inventing an application", () => {
  const legacy = spellWith(container("root", [effect("legacy", "healing", 5)]));
  legacy.schemaVersion = 6;
  const parsed = parseSpellDocument(JSON.stringify(legacy));

  assert.equal(parsed.schemaVersion, 7);
  assert.equal(parsed.containers[0]!.effects[0]!.healingScope, undefined);
  const result = requireValid(adaptSpellToMechanicalEffects(parsed));
  assert.equal(result.effects[0]!.definition.effect.kind, "manual");
});

test("progressive change serialization preserves Healing Application", () => {
  const spell = spellWith(container("root", [effect("base", "damage", 1)]));
  spell.progressive.milestones.find(({ level }) => level === "Novice")!.changes = [{
    kind: "add-effect",
    containerId: "root",
    effect: effect("progressive-heal", "healing", 4, { healingScope: "area" }),
  }];
  const parsed = parseSpellDocument(JSON.stringify(spell));
  const change = parsed.progressive.milestones
    .find(({ level }) => level === "Novice")!.changes[0]!;

  assert.equal(change.kind, "add-effect");
  if (change.kind !== "add-effect") assert.fail("Expected an add-effect change.");
  assert.equal(change.effect.healingScope, "area");
});

test("progressive adaptation uses the existing resolver for tier additions and changed quantities", () => {
  const spell = spellWith(container("root", [effect("base-damage", "damage", 1)]));
  spell.modifiers = [createModifierSelection("progressive-spell")];
  spell.progressive.milestones.find(({ level }) => level === "Novice")!.changes = [{
    kind: "add-effect",
    containerId: "root",
    effect: effect("novice-heal", "healing", 4, { healingScope: "area" }),
  }];
  spell.progressive.milestones.find(({ level }) => level === "Master")!.changes = [{
    kind: "set-effect",
    containerId: "root",
    effect: effect("base-damage", "damage", 7),
  }];

  const apprentice = requireValid(adaptProgressiveSpellToMechanicalEffects(spell, "Apprentice"));
  const novice = requireValid(adaptProgressiveSpellToMechanicalEffects(spell, "Novice"));
  const master = requireValid(adaptProgressiveSpellToMechanicalEffects(spell, "Master"));
  assert.deepEqual(apprentice.effects.map(({ spellEffectId }) => spellEffectId), ["base-damage"]);
  assert.deepEqual(novice.effects.map(({ spellEffectId }) => spellEffectId), [
    "base-damage",
    "novice-heal",
  ]);
  assert.deepEqual(master.effects[0]!.definition.effect, {
    kind: "health.damage",
    amount: 7,
    application: "localized",
  });
  assert.equal(master.effects[0]!.spellEffectId, "base-damage");
});

test("malformed progressive additions that duplicate an inherited effect ID are rejected", () => {
  const spell = spellWith(container("root", [effect("shared-id", "damage", 1)]));
  spell.modifiers = [createModifierSelection("progressive-spell")];
  spell.progressive.milestones.find(({ level }) => level === "Novice")!.changes = [{
    kind: "add-effect",
    containerId: "root",
    effect: effect("shared-id", "buff", 1),
  }];

  const result = adaptProgressiveSpellToMechanicalEffects(spell, "Novice");
  assert.equal(result.valid, false);
  if (result.valid) assert.fail("Duplicate progressive identity unexpectedly adapted.");
  assert.ok(result.issues.some(({ code }) => code === "duplicate-effect-id"));
});

test("authoring and preview expose Healing Application only as structured Spell data", () => {
  const editor = readFileSync(
    "src/app/heavens/skills/spell/spell-container-editor.tsx",
    "utf8",
  );
  const preview = readFileSync("src/app/heavens/skills/spell-preview.tsx", "utf8");
  assert.match(editor, /effect\.ruleId === "healing"/);
  assert.match(editor, /Healing Application/);
  assert.match(editor, /Unspecified \/ Manual Resolution/);
  assert.match(editor, /Full Body/);
  assert.match(editor, /Area/);
  assert.match(preview, /selection\.healingScope/);
  assert.match(preview, /Application:/);
});

test("adapter is pure translation with no database, Mana, or Active Health mutation dependency", () => {
  const adapter = readFileSync(
    "src/features/spell-construction/mechanical-effects-adapter.ts",
    "utf8",
  );
  const mechanicalModels = readFileSync(
    "src/features/mechanical-effects/models.ts",
    "utf8",
  );
  assert.doesNotMatch(
    adapter,
    /spendActiveMana|spendCharacterMana|campaignCharacterActiveMana|apply.*Health|active-health-service|from ["']@\/db|\bdb\./i,
  );
  assert.doesNotMatch(adapter, /createStableId|targetCharacterId|poolKey|hitLocationNumber/);
  assert.match(mechanicalModels, /kind: "health\.heal"/);
  assert.match(mechanicalModels, /kind: "health\.damage"/);
  assert.match(mechanicalModels, /kind: "manual"/);
  assert.doesNotMatch(mechanicalModels, /mana\.spend|mana\.restore|buff\.apply/);
});
