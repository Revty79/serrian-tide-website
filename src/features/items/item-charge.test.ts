import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { canMutateActiveHealth } from "@/features/active-state/authorization";

import {
  createItemChargeState,
  restoreItemCharges,
  restoreItemChargesFull,
  setItemCurrentCharges,
  spendItemCharges,
} from "./item-charge";
import { planOwnedItemInstancePersistence } from "./item-ownership";
import { copyItemRuntimeDefinition, validateItemRuntimeProfile } from "./item-runtime";

const service = readFileSync("src/features/items/item-charge-service.ts", "utf8");
const itemUseActions = readFileSync("src/app/characters/item-use-actions.ts", "utf8");
const itemUseDomain = readFileSync("src/features/items/item-use.ts", "utf8");
const itemUseDialog = readFileSync("src/app/characters/item-use-dialog.tsx", "utf8");
const chargePanel = readFileSync("src/app/characters/item-charge-panel.tsx", "utf8");
const characterSheet = readFileSync("src/app/characters/character-sheet.tsx", "utf8");
const characterEditor = readFileSync("src/app/characters/character-editor.tsx", "utf8");
const characterActions = readFileSync("src/app/characters/actions.ts", "utf8");
const creatureWorkspace = readFileSync("src/app/heavens/npcs/[npcId]/creature-npc-workspace.tsx", "utf8");
const creatureActions = readFileSync("src/app/heavens/npcs/actions.ts", "utf8");
const authorActions = readFileSync("src/app/heavens/items/actions.ts", "utf8");
const authorUi = readFileSync("src/app/heavens/items/item-workspace.tsx", "utf8");
const itemSchema = readFileSync("src/db/item-schema.ts", "utf8");
const mechanicalEffectSchema = readFileSync("src/features/mechanical-effects/models.ts", "utf8");

function chargeState(overrides: Partial<Parameters<typeof createItemChargeState>[0]> = {}) {
  return createItemChargeState({
    instanceId: 41,
    itemId: 9,
    itemName: "Wand of Echoes",
    maximumCharges: 10,
    currentCharges: 3,
    chargesPerUse: 1,
    equipmentState: "wielded",
    rechargeNotes: "Regains 1d4 Charges at sunrise.",
    definitionStatus: "charged",
    ...overrides,
  });
}

class SerializedChargeState {
  current: number;
  private tail = Promise.resolve();

  constructor(current: number, readonly maximum: number) {
    this.current = current;
  }

  mutate(resolve: (current: number) => number): Promise<number> {
    const operation = this.tail.then(() => {
      this.current = resolve(this.current);
      return this.current;
    });
    this.tail = operation.then(() => undefined, () => undefined);
    return operation;
  }
}

test("1-8: restore, Restore Full, and exact correction enforce bounded whole-number Charge rules", () => {
  assert.equal(restoreItemCharges(2, 10, 3), 5);
  assert.equal(restoreItemCharges(8, 10, 5), 10);
  assert.equal(restoreItemChargesFull(10), 10);
  assert.equal(setItemCurrentCharges(10, 0), 0);
  assert.equal(setItemCurrentCharges(10, 10), 10);
  assert.throws(() => setItemCurrentCharges(10, -1), /non-negative whole number/);
  assert.throws(() => setItemCurrentCharges(10, 11), /cannot exceed/);
  for (const value of [1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => restoreItemCharges(2, 10, value), /positive whole number/);
  }
});

test("9-13: stable instances and Equipment State remain independent across every Charge mutation", () => {
  const wandA = chargeState({ instanceId: 41, currentCharges: 3, equipmentState: "wielded" });
  const wandB = chargeState({ instanceId: 42, currentCharges: 8, equipmentState: "inactive" });
  const restoredA = { ...wandA, currentCharges: restoreItemCharges(wandA.currentCharges, 10, 4) };
  assert.equal(restoredA.currentCharges, 7);
  assert.equal(wandB.currentCharges, 8);
  assert.equal(restoredA.equipmentState, "wielded");
  assert.equal(({ ...wandA, currentCharges: restoreItemChargesFull(10) }).equipmentState, "wielded");
  assert.equal(({ ...wandA, currentCharges: setItemCurrentCharges(10, 5) }).equipmentState, "wielded");
  assert.notEqual(wandA.instanceId, wandB.instanceId);
  assert.match(service, /\.set\(\{\s*currentCharges: next,\s*updatedAt: new Date\(\),\s*\}\)/);
  assert.doesNotMatch(service, /\.set\(\{[^}]*equipmentState/);
  assert.doesNotMatch(service, /\.set\(\{[^}]*(unitCostCredits|acquiredAt)/);
});

test("14-19: Item Use delegates Charge spending and keeps resource plus effects in its caller-owned transaction", () => {
  assert.match(itemUseActions, /spendItemChargesInTransaction\(tx,/);
  assert.match(itemUseActions, /executeCharacterItemUseInCallerTransaction/);
  assert.match(itemUseActions, /db\.transaction\(\(tx\) => executeCharacterItemUseInCallerTransaction/);
  assert.match(itemUseActions, /executeItemUseInTransaction\(async \(execute\) => execute/);
  assert.match(itemUseActions, /spendItemChargesInTransaction[\s\S]*persistPlannedMechanicalEffectInTransaction/);
  assert.doesNotMatch(itemUseActions, /\.set\(\{\s*currentCharges:/);
  assert.equal(spendItemCharges(5, 2), 3);
  assert.throws(() => spendItemCharges(1, 2), /enough Charges/);
  assert.doesNotMatch(service, /reconcileItemPassiveEffectsInTransaction/);
  assert.doesNotMatch(itemUseActions, /equipmentState: resource\.after/);
});

test("18: a fake Item Use transaction rolls Charge spending back when effect persistence fails", async () => {
  const persisted = { charges: 5, damage: 0, equipmentState: "wielded" };
  async function transaction(operation: () => Promise<void>) {
    const before = { ...persisted };
    try {
      await operation();
    } catch (error) {
      Object.assign(persisted, before);
      throw error;
    }
  }
  await assert.rejects(transaction(async () => {
    persisted.charges = spendItemCharges(persisted.charges, 2);
    persisted.damage = 4;
    throw new Error("effect persistence failed");
  }), /effect persistence failed/);
  assert.deepEqual(persisted, { charges: 5, damage: 0, equipmentState: "wielded" });
});

test("20-23: serialized Charge mutations prevent overspend and lost spend/recharge updates", async () => {
  const spends = new SerializedChargeState(3, 10);
  const settledSpends = await Promise.allSettled([
    spends.mutate((current) => spendItemCharges(current, 2)),
    spends.mutate((current) => spendItemCharges(current, 2)),
  ]);
  assert.equal(settledSpends.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(spends.current, 1);

  const mixed = new SerializedChargeState(5, 10);
  await Promise.all([
    mixed.mutate((current) => spendItemCharges(current, 2)),
    mixed.mutate((current) => restoreItemCharges(current, mixed.maximum, 4)),
  ]);
  assert.equal(mixed.current, 7);

  const restores = new SerializedChargeState(2, 10);
  await Promise.all([
    restores.mutate((current) => restoreItemCharges(current, restores.maximum, 3)),
    restores.mutate((current) => restoreItemCharges(current, restores.maximum, 4)),
  ]);
  assert.equal(restores.current, 9);
  const characterLock = service.indexOf("lockEquipmentStateCharacterInTransaction(tx, identity.characterId)");
  const instanceLock = service.indexOf('query.for("update", { of: campaignCharacterItemInstance })');
  assert.ok(characterLock >= 0 && instanceLock > characterLock);
});

test("24-30: template Maximum edits preserve history and expose controlled normalization", () => {
  const original = chargeState({ currentCharges: 8, maximumCharges: 10 });
  const increased = chargeState({ currentCharges: original.currentCharges, maximumCharges: 12 });
  assert.equal(increased.currentCharges, 8);
  assert.equal(increased.isAboveCurrentMaximum, false);
  const reduced = chargeState({ currentCharges: original.currentCharges, maximumCharges: 6 });
  assert.equal(reduced.currentCharges, 8);
  assert.equal(reduced.isAboveCurrentMaximum, true);
  assert.equal(spendItemCharges(reduced.currentCharges, 2), 6);
  assert.equal(restoreItemCharges(reduced.currentCharges, 6, 3), 8);
  assert.equal(restoreItemChargesFull(6), 6);
  assert.equal(setItemCurrentCharges(6, 5), 5);
  assert.match(chargePanel, /above the current template Maximum/);
});

test("31-34: zero Charges preserve ownership and Equipment State without passive reconciliation", () => {
  const zero = chargeState({ currentCharges: setItemCurrentCharges(10, 0), equipmentState: "equipped" });
  assert.equal(zero.currentCharges, 0);
  assert.equal(zero.instanceId, 41);
  assert.equal(zero.equipmentState, "equipped");
  assert.throws(() => spendItemCharges(zero.currentCharges, 1), /enough Charges/);
  assert.doesNotMatch(service, /reconcileItemPassiveEffectsInTransaction/);
  assert.doesNotMatch(service, /delete\(campaignCharacterItemInstance\)/);
});

test("35-38: recharge text persists and copies, but is never parsed or scheduled", () => {
  const rechargeNotes = "Regains 1d4 Charges at sunrise.";
  const validation = validateItemRuntimeProfile({
    useMode: "charges",
    quantityPerUse: null,
    maximumCharges: 10,
    chargesPerUse: 1,
    rechargeNotes,
    activationLabel: "Use",
    useNotes: "",
  });
  assert.equal(validation.valid, true);
  if (!validation.valid) return;
  assert.equal(validation.profile.rechargeNotes, rechargeNotes);
  const parent = { isMagical: true, runtimeProfile: validation.profile, effects: [] };
  const variant = copyItemRuntimeDefinition(parent);
  variant.runtimeProfile.rechargeNotes = "Ley nexus only.";
  assert.equal(parent.runtimeProfile.rechargeNotes, rechargeNotes);
  assert.equal(restoreItemCharges(2, 10, 3), 5);
  assert.match(itemSchema, /rechargeNotes: text\("recharge_notes"\)/);
  assert.doesNotMatch(service, /(sunrise|setInterval|setTimeout|cron|1d4|Math\.random)/i);
  assert.match(authorUi, /Recharge rules are descriptive[\s\S]*does not roll, schedule, or detect/i);
});

test("39-43: Player and G.O.D. Charge authorization retains Character, Campaign, and instance identity boundaries", () => {
  const ownPc = { playerUserId: "player-a", campaignOwnerUserId: "god-a", isNpc: false, isCampaignMember: true };
  const otherPc = { ...ownPc, playerUserId: "player-b" };
  const npc = { ...ownPc, playerUserId: "", isNpc: true };
  assert.equal(canMutateActiveHealth({ userId: "player-a", roles: ["player"] }, ownPc), true);
  assert.equal(canMutateActiveHealth({ userId: "player-a", roles: ["player"] }, otherPc), false);
  assert.equal(canMutateActiveHealth({ userId: "god-a", roles: ["god"] }, npc), true);
  assert.equal(canMutateActiveHealth({ userId: "god-b", roles: ["god"] }, npc), false);
  assert.match(service, /eq\(campaignCharacterItemInstance\.id, identity\.instanceId\)[\s\S]*eq\(campaignCharacterItemInstance\.characterId, identity\.characterId\)[\s\S]*eq\(campaignCharacterItemInstance\.itemId, identity\.itemId\)/);
  assert.match(service, /canMutateActiveHealth/);
});

test("44-45: current non-charged definitions are surfaced and rejected without magical assumptions", () => {
  const mismatch = chargeState({
    maximumCharges: null,
    chargesPerUse: null,
    definitionStatus: "definition-mismatch",
  });
  assert.equal(mismatch.definitionStatus, "definition-mismatch");
  assert.match(service, /current Item definition no longer uses Charges/);
  assert.doesNotMatch(service, /isMagical/);
  assert.match(authorActions, /charged Item has owned instances[\s\S]*no automatic stack conversion or data deletion/);
});

test("46-48: ordinary Character and Creature saves preserve existing stable instance state", () => {
  const persisted = { draftId: 41, instanceId: 41, itemId: 9, unitCostCredits: 75 };
  assert.deepEqual(planOwnedItemInstancePersistence({ existingInstanceIds: [41], drafts: [persisted] }), {
    removedInstanceIds: [],
    newInstances: [],
  });
  for (const source of [characterActions, creatureActions]) {
    assert.match(source, /planOwnedItemInstancePersistence/);
    assert.match(source, /currentCharges: validateCurrentItemCharges/);
    assert.match(source, /acquiredAt:/);
  }
  assert.match(characterEditor, /currentCharges: charges\.get\(entry\.id\) \?\? entry\.currentCharges/);
  assert.match(creatureWorkspace, /currentCharges: charges\.get\(entry\.instanceId\) \?\? entry\.currentCharges/);
});

test("49-52: shared Character and Creature UI exposes current state, recharge notes, and Item Use state", () => {
  assert.match(characterSheet, /<ItemChargePanel/);
  assert.match(characterSheet, /Above current template maximum/);
  assert.match(chargePanel, /entry\.currentCharges\} \/ \{entry\.maximumCharges/);
  assert.match(chargePanel, /Recharge Rule \/ Notes/);
  assert.match(chargePanel, /Restore Charges/);
  assert.match(chargePanel, /Restore Full/);
  assert.match(chargePanel, /Set Current Charges/);
  assert.match(creatureWorkspace, /<ItemChargePanel/);
  assert.match(creatureWorkspace, /Above current template maximum/);
  assert.match(itemUseDomain, /maximumCharges[\s\S]*exceedsCurrentMaximum/);
  assert.match(itemUseDialog, /resourceSummary\(preparation\)/);
  assert.match(itemUseDialog, /Recharge rule:/);
});

test("Step 10 scope keeps Mechanical Effect vocabulary/version and migrations outside the Charge domain", () => {
  assert.match(mechanicalEffectSchema, /MECHANICAL_EFFECT_SCHEMA_VERSION\s*=\s*2/);
  assert.doesNotMatch(mechanicalEffectSchema, /(item\.recharge|charges\.restore|resource\.restore)/);
  assert.doesNotMatch(service, /(charge_history|recharge_history|charge_transaction_log)/);
});
