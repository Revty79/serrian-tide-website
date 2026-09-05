import assert from "node:assert/strict";
import test from "node:test";

import type { CharacterAggregate } from "@/features/characters/models";

import {
  PLAYER_TABLETOP_HISTORY_LIMIT,
  assemblePlayerTabletopItems,
  boundPlayerCalledCheckWorkspace,
  boundPlayerRollHistory,
  resolvePlayerTabletopPresence,
  resolvePlayerTabletopSelection,
} from "./player-tabletop-console";

const characters = [
  { characterId: 11, characterName: "Iria", campaignId: 1, campaignName: "North Tide" },
  { characterId: 22, characterName: "Serr", campaignId: 2, campaignName: "Glass Coast" },
] as const;

test("selection has a safe no-Character state", () => {
  assert.deepEqual(resolvePlayerTabletopSelection([], null), { kind: "no-characters" });
});

test("multiple Characters always require explicit selection", () => {
  assert.deepEqual(resolvePlayerTabletopSelection(characters, null), { kind: "needs-selection" });
});

test("one Character may be redirected into explicit URL context", () => {
  assert.deepEqual(resolvePlayerTabletopSelection(characters.slice(0, 1), null), {
    kind: "single-available",
    characterId: 11,
  });
});

test("selection retains exact Campaign and Character identity", () => {
  assert.deepEqual(resolvePlayerTabletopSelection(characters, 22), {
    kind: "selected",
    character: characters[1],
  });
});

test("unassigned selection is unavailable without leaking a replacement", () => {
  assert.deepEqual(resolvePlayerTabletopSelection(characters, 99), { kind: "unavailable" });
});

test("no active Session never fabricates a hierarchy", () => {
  assert.deepEqual(resolvePlayerTabletopPresence({
    hasActiveSession: false,
    rostered: false,
    sceneMember: false,
    hasActiveEncounter: false,
    encounterParticipant: false,
  }).kind, "no-active-session");
});

test("an unrostered Character receives no live actions", () => {
  const state = resolvePlayerTabletopPresence({
    hasActiveSession: true,
    rostered: false,
    sceneMember: false,
    hasActiveEncounter: false,
    encounterParticipant: false,
  });
  assert.equal(state.kind, "active-session-unrostered");
  assert.equal(state.liveActionsAllowed, false);
});

test("a rostered Character without a Scene remains explicit", () => {
  assert.equal(resolvePlayerTabletopPresence({
    hasActiveSession: true,
    rostered: true,
    sceneMember: false,
    hasActiveEncounter: false,
    encounterParticipant: false,
  }).kind, "active-session-rostered");
});

test("an active Scene without an Encounter permits noncombat source use", () => {
  const state = resolvePlayerTabletopPresence({
    hasActiveSession: true,
    rostered: true,
    sceneMember: true,
    hasActiveEncounter: false,
    encounterParticipant: false,
  });
  assert.equal(state.kind, "active-scene");
  assert.equal(state.noncombatSourceUseAllowed, true);
});

test("an active Encounter is read-only and blocks standalone source use", () => {
  const state = resolvePlayerTabletopPresence({
    hasActiveSession: true,
    rostered: true,
    sceneMember: true,
    hasActiveEncounter: true,
    encounterParticipant: true,
  });
  assert.equal(state.kind, "active-encounter");
  assert.equal(state.noncombatSourceUseAllowed, false);
  assert.match(state.detail, /read-only/);
});

test("recent Roll history is descending and bounded", () => {
  const rolls = Array.from({ length: PLAYER_TABLETOP_HISTORY_LIMIT + 5 }, (_, index) => ({ id: index + 1 }));
  const result = boundPlayerRollHistory(rolls as never);
  assert.equal(result.length, PLAYER_TABLETOP_HISTORY_LIMIT);
  assert.equal(result[0]?.id, PLAYER_TABLETOP_HISTORY_LIMIT + 5);
  assert.equal(result.at(-1)?.id, 6);
});

test("pending Called Checks stay ahead of bounded history", () => {
  const calledChecks = [
    { id: 1, status: "resolved", issuedAt: "2026-01-03T00:00:00.000Z" },
    { id: 2, status: "pending", issuedAt: "2026-01-01T00:00:00.000Z" },
    { id: 3, status: "cancelled", issuedAt: "2026-01-04T00:00:00.000Z" },
  ];
  const view = boundPlayerCalledCheckWorkspace({ calledChecks, highLow: [], marker: true } as never, 2);
  assert.deepEqual(view?.calledChecks.map(({ id }) => id), [2, 3]);
});

test("exact owned Item copies stay separate while stack quantity remains aggregate", () => {
  const unlimited = {
    useMode: "unlimited" as const,
    quantityPerUse: null,
    maximumCharges: null,
    chargesPerUse: null,
    rechargeNotes: "",
    activationLabel: "Use",
    useNotes: "",
  };
  const charged = {
    useMode: "charges" as const,
    quantityPerUse: null,
    maximumCharges: 3,
    chargesPerUse: 1,
    rechargeNotes: "Camp",
    activationLabel: "Trigger",
    useNotes: "",
  };
  const aggregate = {
    items: [{ itemId: 1, name: "Bandage", category: "Aid", quantity: 4 }],
    itemInstances: [
      { id: 101, itemId: 2, name: "Signal Wand", category: "Tool", currentCharges: 2, runtimeProfile: charged },
      { id: 102, itemId: 2, name: "Signal Wand", category: "Tool", currentCharges: 1, runtimeProfile: charged },
    ],
    authorizedItems: [
      { id: 1, description: "Cloth", runtimeProfile: unlimited, isFirearm: false },
      { id: 2, description: "Light", runtimeProfile: charged, isFirearm: false },
    ],
  } as unknown as CharacterAggregate;
  const result = assemblePlayerTabletopItems({
    aggregate,
    equipment: {
      characterId: 9,
      stacks: [{ itemId: 1, itemName: "Bandage", equipmentGroup: "", ownedQuantity: 4, equippedQuantity: 0, wornQuantity: 0, wieldedQuantity: 0, inactiveQuantity: 4 }],
      instances: [
        { instanceId: 101, itemId: 2, itemName: "Signal Wand", equipmentGroup: "", currentCharges: 2, state: "equipped" },
        { instanceId: 102, itemId: 2, itemName: "Signal Wand", equipmentGroup: "", currentCharges: 1, state: "inactive" },
      ],
      wornArmor: [],
      wieldedWeapons: [],
      activeManualPassives: [],
    },
    charges: { characterId: 9, instances: [] },
    effectDetails: [],
    firearmStates: [],
  });
  assert.deepEqual(result.map(({ ownershipKey }) => ownershipKey).sort(), ["instance:101", "instance:102", "stack:1"]);
  assert.equal(result.find(({ ownershipKey }) => ownershipKey === "stack:1")?.quantity, 4);
});

test("aggregate firearms are labeled legacy and never receive fabricated readiness", () => {
  const runtimeProfile = { useMode: "none" as const, quantityPerUse: null, maximumCharges: null, chargesPerUse: null, rechargeNotes: "", activationLabel: "Use", useNotes: "" };
  const aggregate = {
    items: [{ itemId: 7, name: "Old Pistol", category: "Weapon", quantity: 2 }],
    itemInstances: [],
    authorizedItems: [{ id: 7, description: "", runtimeProfile, isFirearm: true }],
  } as unknown as CharacterAggregate;
  const [item] = assemblePlayerTabletopItems({
    aggregate,
    equipment: { characterId: 1, stacks: [], instances: [], wornArmor: [], wieldedWeapons: [], activeManualPassives: [] },
    charges: { characterId: 1, instances: [] },
    effectDetails: [],
    firearmStates: [],
  });
  assert.equal(item?.legacyAggregateFirearm, true);
  assert.equal(item?.firearmState, null);
  assert.equal(item?.canUseSafely, false);
});

test("manual Item mechanics are displayed but cannot be self-approved", () => {
  const runtimeProfile = { useMode: "unlimited" as const, quantityPerUse: null, maximumCharges: null, chargesPerUse: null, rechargeNotes: "", activationLabel: "Use", useNotes: "" };
  const aggregate = {
    items: [{ itemId: 8, name: "Oracle Card", category: "Relic", quantity: 1 }],
    itemInstances: [],
    authorizedItems: [{ id: 8, description: "", runtimeProfile, isFirearm: false }],
  } as unknown as CharacterAggregate;
  const [item] = assemblePlayerTabletopItems({
    aggregate,
    equipment: { characterId: 1, stacks: [], instances: [], wornArmor: [], wieldedWeapons: [], activeManualPassives: [] },
    charges: { characterId: 1, instances: [] },
    effectDetails: [{ itemId: 8, effectSummaries: ["G.O.D. chooses a sign"], requiresGodRuling: true }],
    firearmStates: [],
  });
  assert.equal(item?.requiresGodRuling, true);
  assert.equal(item?.canUseSafely, false);
});
