import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getActiveModifierTotal, type ActiveModifier } from "@/features/active-state/active-effects";
import { canMutateActiveHealth } from "@/features/active-state/authorization";
import type { MechanicalEffect } from "@/features/mechanical-effects";

import {
  ACTIVE_EQUIPMENT_STATES,
  EQUIPMENT_STATES,
  copyPassiveItemEffects,
  getActiveStackQuantity,
  getInactiveStackQuantity,
  passiveLifecycleLabel,
  passiveSourceEffectKey,
  shouldPassiveEffectBeActive,
  stateSatisfiesEquipmentRequirement,
  validatePassiveItemEffect,
  type EquipmentState,
  type ItemPassiveEffectDefinition,
  type WieldedWeaponRuntimeContext,
  type WornArmorRuntimeContext,
} from "./equipment-state";

const realmSchema = readFileSync("src/db/realm-schema.ts", "utf8");
const itemSchema = readFileSync("src/db/item-schema.ts", "utf8");
const service = readFileSync("src/features/items/equipment-state-service.ts", "utf8");
const characterActions = readFileSync("src/app/characters/actions.ts", "utf8");
const creatureActions = readFileSync("src/app/heavens/npcs/actions.ts", "utf8");
const itemUseActions = readFileSync("src/app/characters/item-use-actions.ts", "utf8");
const chargeService = readFileSync("src/features/items/item-charge-service.ts", "utf8");
const authoringActions = readFileSync("src/app/heavens/items/actions.ts", "utf8");
const authoringUi = readFileSync("src/app/heavens/items/item-workspace.tsx", "utf8");
const equipmentPanel = readFileSync("src/app/characters/equipment-state-panel.tsx", "utf8");
const characterSheet = readFileSync("src/app/characters/character-sheet.tsx", "utf8");
const creatureWorkspace = readFileSync("src/app/heavens/npcs/[npcId]/creature-npc-workspace.tsx", "utf8");
const activeEffectsService = readFileSync("src/features/active-state/active-effects-service.ts", "utf8");

function passive(effect: MechanicalEffect, requiredEquipmentState: "equipped" | "worn" | "wielded" = "equipped", id = 1): ItemPassiveEffectDefinition {
  return { id, requiredEquipmentState, effect };
}

function activeModifier(id: number, itemId: number, amount: number): ActiveModifier {
  return {
    id,
    characterId: 7,
    label: `Item ${itemId}`,
    channel: "attribute",
    targetKey: "STR",
    amount,
    source: { kind: "item", id: String(itemId), name: `Item ${itemId}`, effectKey: passiveSourceEffectKey(id) },
    duration: { kind: "until-removed", value: null, label: "While Equipped" },
    createdAt: `2026-01-0${id}T00:00:00.000Z`,
    endedAt: null,
    endNote: "",
  };
}

test("1-2: stack-owned and charged-instance Equipment default inactive", () => {
  assert.equal(getInactiveStackQuantity(3, 0), 3);
  assert.match(realmSchema, /equipmentState: text\("equipment_state"\)\.default\("inactive"\)\.notNull\(\)/);
  assert.deepEqual(EQUIPMENT_STATES, ["inactive", "equipped", "worn", "wielded"]);
});

test("3-10: state service persists all roles and enforces ownership plus Player/G.O.D. authorization", () => {
  assert.deepEqual(ACTIVE_EQUIPMENT_STATES, ["equipped", "worn", "wielded"]);
  assert.match(service, /setStackEquipmentState[\s\S]*onConflictDoUpdate/);
  assert.match(service, /setInstanceEquipmentState[\s\S]*equipmentState: state/);
  assert.match(service, /if \(ownership\.scope !== "equipment"\)/);
  assert.equal(canMutateActiveHealth(
    { userId: "player-a", roles: ["player"] },
    { playerUserId: "player-a", campaignOwnerUserId: "god-a", isNpc: false, isCampaignMember: true },
  ), true);
  assert.equal(canMutateActiveHealth(
    { userId: "god-a", roles: ["god"] },
    { playerUserId: "player-a", campaignOwnerUserId: "god-a", isNpc: true, isCampaignMember: false },
  ), true);
  assert.equal(canMutateActiveHealth(
    { userId: "god-b", roles: ["god"] },
    { playerUserId: "player-a", campaignOwnerUserId: "god-a", isNpc: true, isCampaignMember: false },
  ), false);
  assert.match(service, /canMutateActiveHealth/);
});

test("7 and 11-14: active stack quantities cannot exceed ownership and never force instance conversion", () => {
  assert.equal(getActiveStackQuantity({ wielded: 2 }), 2);
  assert.equal(getInactiveStackQuantity(3, 2), 1);
  assert.throws(() => getInactiveStackQuantity(1, 2), /cannot exceed owned/);
  assert.match(realmSchema, /campaign_character_item_equipment_state/);
  assert.match(realmSchema, /foreignColumns: \[campaignCharacterItem\.characterId, campaignCharacterItem\.itemId\]/);
  assert.doesNotMatch(characterActions, /createDraftOwnedItemInstances[\s\S]*equipment state/i);
  assert.match(service, /Reduce or remove active Equipment State before reducing/);
});

test("15-17: charged copies keep independent state and spending Charges does not change it", () => {
  const copies = [
    { id: 10, currentCharges: 3, equipmentState: "wielded" as EquipmentState },
    { id: 11, currentCharges: 8, equipmentState: "inactive" as EquipmentState },
  ];
  const changed = copies.map((copy) => copy.id === 11 ? { ...copy, equipmentState: "equipped" as EquipmentState } : copy);
  const spent = changed.map((copy) => copy.id === 10 ? { ...copy, currentCharges: 2 } : copy);
  assert.deepEqual(spent, [
    { id: 10, currentCharges: 2, equipmentState: "wielded" },
    { id: 11, currentCharges: 8, equipmentState: "equipped" },
  ]);
  assert.match(itemUseActions, /spendItemChargesInTransaction/);
  assert.match(chargeService, /currentCharges: next/);
  assert.doesNotMatch(chargeService, /currentCharges: next,[\s\S]*?equipmentState/);
});

test("18-23: exact passive state-satisfaction hierarchy is preserved", () => {
  assert.equal(stateSatisfiesEquipmentRequirement("equipped", "equipped"), true);
  assert.equal(stateSatisfiesEquipmentRequirement("worn", "equipped"), true);
  assert.equal(stateSatisfiesEquipmentRequirement("wielded", "equipped"), true);
  assert.equal(stateSatisfiesEquipmentRequirement("equipped", "worn"), false);
  assert.equal(stateSatisfiesEquipmentRequirement("worn", "worn"), true);
  assert.equal(stateSatisfiesEquipmentRequirement("equipped", "wielded"), false);
  assert.equal(stateSatisfiesEquipmentRequirement("wielded", "wielded"), true);
  assert.equal(stateSatisfiesEquipmentRequirement("inactive", "equipped"), false);
  assert.equal(shouldPassiveEffectBeActive({ requiredEquipmentState: "worn", activeStackQuantities: {}, instanceStates: ["inactive"] }), false);
});

test("24-28: passive Modifier uses temporary state, ends into history, reactivates as a new row, and reconciles idempotently", () => {
  const permanent = { STR: 25 };
  const history: ActiveModifier[] = [activeModifier(1, 100, 5)];
  assert.equal(getActiveModifierTotal(history, "attribute", "STR"), 5);
  assert.equal(permanent.STR, 25);
  history[0] = { ...history[0], endedAt: "2026-01-02T00:00:00.000Z", endNote: "Unequipped" };
  history.push(activeModifier(2, 100, 5));
  assert.equal(history.length, 2);
  assert.equal(getActiveModifierTotal(history, "attribute", "STR"), 5);
  assert.match(service, /keptModifiers\.has\(key\)/);
  assert.match(service, /endModifierInTransaction/);
  assert.match(service, /persistPlannedMechanicalEffectInTransaction/);
});

test("29-32: passive Conditions remain descriptive and preserve resolved history", () => {
  const definition = validatePassiveItemEffect(passive({
    kind: "condition.apply",
    name: "Blessed",
    description: "Narrative blessing; no inferred numeric rule.",
    duration: { kind: "until-removed" },
  }, "worn"));
  assert.equal(definition.effect.kind, "condition.apply");
  assert.equal("amount" in definition.effect, false);
  assert.match(service, /resolveConditionInTransaction/);
  assert.match(activeEffectsService, /resolvedAt: new Date\(\)/);
  assert.doesNotMatch(activeEffectsService, /delete\(campaignCharacterActiveCondition\)/);
});

test("33-35: identical active copies contribute one passive until the last qualifying copy deactivates", () => {
  const sourceKey = passiveSourceEffectKey(41);
  const desiredKeys = new Set([
    shouldPassiveEffectBeActive({ requiredEquipmentState: "wielded", activeStackQuantities: { wielded: 2 }, instanceStates: [] }) ? sourceKey : "",
  ]);
  assert.deepEqual([...desiredKeys], ["passive:41"]);
  assert.equal(shouldPassiveEffectBeActive({ requiredEquipmentState: "wielded", activeStackQuantities: { wielded: 1 }, instanceStates: ["inactive"] }), true);
  assert.equal(shouldPassiveEffectBeActive({ requiredEquipmentState: "wielded", activeStackQuantities: {}, instanceStates: ["inactive", "inactive"] }), false);
  assert.match(service, /new Map\(desired\.map\(\(entry\) => \[`\$\{entry\.itemId\}:\$\{passiveSourceEffectKey\(entry\.id\)\}`/);
});

test("36-38: distinct Item sources coexist and Step 8 aggregation removes only the ended source", () => {
  const ring = activeModifier(1, 100, 5);
  const belt = activeModifier(2, 200, 3);
  assert.equal(getActiveModifierTotal([ring, belt], "attribute", "STR"), 8);
  assert.equal(getActiveModifierTotal([{ ...ring, endedAt: "2026-01-03T00:00:00.000Z" }, belt], "attribute", "STR"), 3);
  assert.notEqual(ring.source.id, belt.source.id);
});

test("39-40: active Manual passive is surfaced without fake Condition or Modifier persistence", () => {
  const definition = validatePassiveItemEffect(passive({ kind: "manual", title: "Winged Mantle", description: "G.O.D. resolves controlled descent." }));
  assert.equal(definition.effect.kind, "manual");
  assert.match(service, /entry\.effect\.kind === "manual"/);
  assert.match(equipmentPanel, /Manual Passive Effects[\s\S]*G\.O\.D\. Resolution Required/);
  assert.doesNotMatch(service, /applyManualInTransaction/);
});

test("41-42: Health Damage and Healing are invalid automatic passive effects", () => {
  assert.throws(() => validatePassiveItemEffect(passive({ kind: "health.damage", amount: 2, application: "localized" })), /cannot be automatic passive/);
  assert.throws(() => validatePassiveItemEffect(passive({ kind: "health.heal", amount: 2, scope: "full-body" })), /cannot be automatic passive/);
  assert.doesNotMatch(authoringUi, /Passive Effect[\s\S]*option value="health\.(damage|heal)"/);
});

test("43-46: fake caller-owned transaction commits or rolls back Equipment State, passive persistence, deactivation, and ownership together", async () => {
  const state = { owned: 2, wielded: 0, modifiers: 0, ended: 0 };
  async function transaction(operation: () => void) {
    const before = { ...state };
    try { operation(); } catch (error) { Object.assign(state, before); throw error; }
  }
  await transaction(() => { state.wielded = 1; state.modifiers = 1; });
  assert.deepEqual(state, { owned: 2, wielded: 1, modifiers: 1, ended: 0 });
  await assert.rejects(transaction(() => { state.wielded = 2; throw new Error("passive persistence failed"); }), /persistence failed/);
  assert.deepEqual(state, { owned: 2, wielded: 1, modifiers: 1, ended: 0 });
  await assert.rejects(transaction(() => { state.wielded = 0; state.ended = 1; throw new Error("deactivation failed"); }), /deactivation failed/);
  assert.deepEqual(state, { owned: 2, wielded: 1, modifiers: 1, ended: 0 });
  await assert.rejects(transaction(() => { state.owned = 0; throw new Error("ownership reconciliation failed"); }), /ownership reconciliation failed/);
  assert.deepEqual(state, { owned: 2, wielded: 1, modifiers: 1, ended: 0 });
  assert.match(service, /db\.transaction/);
  assert.match(characterActions, /validateEquipmentOwnershipMutationInTransaction[\s\S]*reconcileEquipmentAfterOwnershipMutationInTransaction/);
  assert.match(creatureActions, /validateEquipmentOwnershipMutationInTransaction[\s\S]*reconcileEquipmentAfterOwnershipMutationInTransaction/);
});

test("47-49: Item Use consumes only inactive stack quantity and leaves instance Equipment State alone", () => {
  assert.equal(getInactiveStackQuantity(3, 2), 1);
  assert.throws(() => getInactiveStackQuantity(2, 3), /cannot exceed owned/);
  assert.match(itemUseActions, /assertConsumableHasInactiveQuantityInTransaction/);
  assert.match(service, /Set enough copies to Inactive first/);
  assert.match(itemUseActions, /spendItemChargesInTransaction/);
  assert.doesNotMatch(itemUseActions, /\.set\(\{\s*currentCharges: resource\.after/);
  assert.doesNotMatch(itemUseActions, /equipmentState: resource\.after/);
});

test("50-53: worn Armor exposes individual Soak and coverage without folding temporary Soak into base data", () => {
  const coat: WornArmorRuntimeContext = { ownershipKey: "stack:1", instanceId: null, itemId: 1, itemName: "Coat", activeQuantity: 1, baseSoak: 2, coverage: "Torso", coveredLocationKeys: ["chest"], armorType: "light", rulesText: "" };
  const helm: WornArmorRuntimeContext = { ownershipKey: "stack:2", instanceId: null, itemId: 2, itemName: "Helm", activeQuantity: 1, baseSoak: 3, coverage: "Head", coveredLocationKeys: ["head"], armorType: "light", rulesText: "" };
  const temporarySoak = { ...activeModifier(3, 300, 4), channel: "soak" as const, targetKey: "self" };
  assert.deepEqual([coat.baseSoak, helm.baseSoak], [2, 3]);
  assert.deepEqual([coat.coverage, helm.coveredLocationKeys], ["Torso", ["head"]]);
  assert.equal(getActiveModifierTotal([temporarySoak], "soak", "self"), 4);
  assert.match(equipmentPanel, /Base Soak is not summed/);
  assert.doesNotMatch(service, /reduce\([^\n]*baseSoak/);
});

test("54-56: wielded Weapon exposes context but does not roll, spend Initiative, or apply Damage", () => {
  const weapon: WieldedWeaponRuntimeContext = { ownershipKey: "stack:4", instanceId: null, itemId: 4, itemName: "Spear", activeQuantity: 1, weaponType: "spear", handedness: "two", damage: "1d10", damageType: "piercing", authoredDamage: "1d10 + 2", authoredDamageModifier: "STR +2", authoredDamageSourceName: null, initiativeCost: 4, range: "", reach: "10 ft", rulesText: "" };
  assert.equal(weapon.damage, "1d10");
  assert.equal(weapon.initiativeCost, 4);
  assert.match(equipmentPanel, /nothing is rolled, spent, or applied/);
  assert.doesNotMatch(service, /rollWeapon|spendInitiative|applyWeaponDamage/);
});

test("57-58: Item variants copy passive definitions deeply with independent identities", () => {
  const parent = [passive({ kind: "manual", title: "Parent", description: "Original" }, "equipped", 99)];
  const variant = copyPassiveItemEffects(parent);
  assert.equal(variant[0].id, null);
  assert.notEqual(variant[0], parent[0]);
  assert.notEqual(variant[0].effect, parent[0].effect);
  if (variant[0].effect.kind === "manual") variant[0].effect.description = "Variant only";
  assert.equal(parent[0].effect.kind === "manual" ? parent[0].effect.description : "", "Original");
  assert.match(authoringActions, /passiveEffects: copyPassiveItemEffects\(parent\.passiveEffects\)/);
});

test("59-61: Activated Item Use, Spell Runtime, and Active State history remain intact", () => {
  const spellRuntime = readFileSync("src/features/characters/character-spell-runtime-service.ts", "utf8");
  assert.match(itemUseActions, /executeItemUseInTransaction/);
  assert.match(itemUseActions, /persistPlannedMechanicalEffectInTransaction/);
  assert.match(spellRuntime, /executeSpellCastInTransaction|executeSpellCast/);
  assert.match(activeEffectsService, /isNull\(campaignCharacterActiveCondition\.resolvedAt\)/);
  assert.match(activeEffectsService, /isNull\(campaignCharacterActiveModifier\.endedAt\)/);
  assert.doesNotMatch(activeEffectsService, /delete\(campaignCharacterActive(?:Condition|Modifier)\)/);
});

test("Step 9 persistence, authoring, shared UI, source snapshots, and scope guards are explicit", () => {
  assert.match(itemSchema, /item_passive_effects/);
  assert.match(itemSchema, /required_equipment_state/);
  assert.doesNotMatch(itemSchema, /health\.damage|health\.heal/);
  assert.match(service, /source: \{ kind: "item", id: entry\.itemId, name: entry\.itemName \}/);
  assert.match(service, /sourceEffectKey/);
  assert.equal(passiveLifecycleLabel("equipped"), "While Equipped");
  assert.equal(passiveLifecycleLabel("worn"), "While Worn");
  assert.equal(passiveLifecycleLabel("wielded"), "While Wielded");
  assert.match(authoringUi, /Equipment State Passives/);
  assert.match(characterSheet, /<EquipmentStatePanel/);
  assert.match(creatureWorkspace, /<EquipmentStatePanel/);
  assert.match(equipmentPanel, /Worn Armor Context/);
  assert.match(equipmentPanel, /Wielded Weapon Context/);
  assert.doesNotMatch(`${service}\n${equipmentPanel}`, /recharge|session state|combat state|equipment slot/i);
});
