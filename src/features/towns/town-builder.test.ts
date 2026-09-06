import assert from "node:assert/strict";
import test from "node:test";

import {
  compareTownNames,
  isEligibleTownNpc,
  matchesTownAssociationSearch,
  matchesTownPlaceSearch,
  matchesTownSearch,
  normalizeTownCoreValues,
  normalizeTownNpcAssociationValues,
  normalizeTownPlaceValues,
} from "./town-builder";

test("Town and place inputs normalize bounded authored text without adding settlement mechanics", () => {
  assert.deepEqual(normalizeTownCoreValues({
    campaignId: 4,
    name: "  Haven's Rest  ",
    category: "  Outpost  ",
    overview: "  A cliff settlement.  ",
    locationNotes: "  North road  ",
    godNotes: "  Hidden bell  ",
  }), {
    campaignId: 4,
    name: "Haven's Rest",
    category: "Outpost",
    overview: "A cliff settlement.",
    locationNotes: "North road",
    godNotes: "Hidden bell",
  });
  assert.equal(normalizeTownPlaceValues({
    townId: 2,
    campaignId: 4,
    name: " Old Bridge ",
    category: " Crossing ",
    description: " Stone bridge ",
    locationNotes: " East gate ",
    godNotes: " Unsafe at night ",
  }).name, "Old Bridge");
  assert.throws(() => normalizeTownCoreValues({ campaignId: 4, name: "", category: "Town", overview: "", locationNotes: "", godNotes: "" }), /Town name is required/);
});

test("Town NPC eligibility permits every active persistent same-Campaign variant and nothing else", () => {
  for (const npcKind of ["race", "creature"]) {
    for (const npcBuildMode of ["simple", "detailed"]) {
      assert.equal(isEligibleTownNpc({ campaignId: 3, isNpc: true, npcKind, npcBuildMode, archivedAt: null }, 3), true);
    }
  }
  assert.equal(isEligibleTownNpc({ campaignId: 3, isNpc: false, npcKind: "race", npcBuildMode: null, archivedAt: null }, 3), false);
  assert.equal(isEligibleTownNpc({ campaignId: 9, isNpc: true, npcKind: "race", npcBuildMode: "simple", archivedAt: null }, 3), false);
  assert.equal(isEligibleTownNpc({ campaignId: 3, isNpc: true, npcKind: "race", npcBuildMode: "simple", archivedAt: new Date() }, 3), false);
});

test("Town, place, Shop, and NPC searches cover their useful authored fields", () => {
  assert.equal(matchesTownSearch({ name: "Glasshaven", category: "City", overview: "Harbor walls", locationNotes: "Western coast" }, "harbor"), true);
  assert.equal(matchesTownPlaceSearch({ name: "Moon Shrine", category: "Temple", description: "Silver altar", locationNotes: "Hill" }, "silver"), true);
  assert.equal(matchesTownAssociationSearch({ name: "Mara", kind: "race", buildMode: "detailed", relationshipLabel: "Magistrate", note: "Knows the old road" }, "old road"), true);
  assert.equal(matchesTownAssociationSearch({ name: "Forge", category: "Armorer" }, "apothecary"), false);
});

test("Town association inputs and natural ordering are stable", () => {
  assert.equal(normalizeTownNpcAssociationValues({ townId: 1, campaignId: 2, npcCharacterId: 3, relationshipLabel: "  Scout  ", townNote: "  North watch  " }).relationshipLabel, "Scout");
  const records = [{ id: 3, name: "Gate 10" }, { id: 2, name: "gate 2" }, { id: 1, name: "Abbey" }];
  assert.deepEqual(records.sort(compareTownNames).map(({ name }) => name), ["Abbey", "gate 2", "Gate 10"]);
});
