import assert from "node:assert/strict";
import test from "node:test";
import type { CharacterDraft } from "./models";
import { creationAutosavePrefix, creationDraftContent, creationDraftFingerprint, encodeCreationAutosave, readCreationAutosaves, retireCreationAutosave,
  type CreationAutosaveScope } from "./character-creation-autosave";

function draft(): CharacterDraft {
  return { name: "Unfinished Character", npcRoleLabel: "", expectedCommerceVersion: 3,
    profile: { raceId: 1, age: null, sex: "", heightFeet: null, heightInches: null, weight: null, skinColor: "", eyeColor: "", hairColor: "", deity: "", definingMarks: "",
      personality: "", goals: "", secrets: "Private draft", backstory: "Unfinished story", motivations: "", fame: 0, experience: 0, totalExperience: 0, quintessence: 0,
      totalQuintessence: 0, hpMultiplierSteps: 0, baseMovementSteps: 0, baseMagicSteps: 0, fatePoints: null, creditsRemaining: 100 },
    attributes: { STR: 25, DEX: 25, CON: 25, INT: 25, WIS: 25, CHR: 25 },
    skillAllocations: [{ draftId: -1, skillId: 1, parentDraftId: null, points: 5 }, { draftId: -2, skillId: 2, parentDraftId: -1, points: 3 }],
    items: [{ itemId: 1, quantity: 2, unitCostCredits: 5 }], itemInstances: [{ draftId: -2_000_003, instanceId: null, itemId: 2, unitCostCredits: 9 }],
    currencyHoldings: [{ currencyId: 1, quantity: 4 }],
  };
}
class MemoryStorage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
const scope: CreationAutosaveScope = { viewerId: "player-one", characterId: 1, campaignId: 2, access: "player" };

test("creation autosave preserves the complete unfinished draft, exact temporary identities and active tab", () => {
  const value = draft(), before = structuredClone(value), storage = new MemoryStorage();
  const raw = encodeCreationAutosave(scope, value, value, "equipment", "2026-11-02T18:00:00.000Z");
  storage.setItem(creationAutosavePrefix(scope) + "tab-one", raw);
  const { entries, unreadable } = readCreationAutosaves(storage, scope);
  assert.equal(unreadable, 0); assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].value.draft, value);
  assert.equal(entries[0].value.tab, "equipment");
  assert.equal(entries[0].value.base, creationDraftFingerprint(value));
  assert.deepEqual(value, before);
});

test("recovery is isolated by account, Character, Campaign and permission scope", () => {
  const storage = new MemoryStorage(), raw = encodeCreationAutosave(scope, draft(), draft(), "story");
  storage.setItem(creationAutosavePrefix(scope) + "tab-one", raw);
  for (const foreign of [{ ...scope, viewerId: "player-two" }, { ...scope, characterId: 2 }, { ...scope, campaignId: 3 }, { ...scope, access: "owner" as const }]) {
    assert.equal(readCreationAutosaves(storage, foreign).entries.length, 0);
    storage.setItem(creationAutosavePrefix(foreign) + "wrong-payload", raw);
    assert.equal(readCreationAutosaves(storage, foreign).unreadable, 1);
  }
});

test("independent editor packets survive and acknowledgement cannot erase newer bytes", () => {
  const storage = new MemoryStorage(), key = creationAutosavePrefix(scope) + "tab-one", other = creationAutosavePrefix(scope) + "tab-two";
  const first = encodeCreationAutosave(scope, draft(), draft(), "identity", "2026-11-02T18:00:00.000Z");
  const second = encodeCreationAutosave(scope, draft(), { ...draft(), name: "Newer work" }, "story", "2026-11-02T18:00:01.000Z");
  storage.setItem(key, first); storage.setItem(other, second);
  const entries = readCreationAutosaves(storage, scope).entries;
  assert.deepEqual(entries.map(entry => entry.key), [other, key]);
  storage.setItem(key, second);
  retireCreationAutosave(storage, { key, raw: first });
  assert.equal(storage.getItem(key), second);
  retireCreationAutosave(storage, { key: other, raw: second });
  assert.equal(storage.getItem(other), null); assert.equal(storage.getItem(key), second);
});

test("an already committed draft is recognized despite new database identities and transaction version", () => {
  const submitted = draft(), saved = structuredClone(submitted);
  saved.expectedCommerceVersion = 4;
  saved.skillAllocations = [{ ...saved.skillAllocations[0], draftId: 100 }, { ...saved.skillAllocations[1], draftId: 101, parentDraftId: 100 }];
  saved.itemInstances = [{ ...saved.itemInstances[0], draftId: 200, instanceId: 200 }];
  assert.equal(creationDraftContent(submitted), creationDraftContent(saved));
  assert.notEqual(creationDraftFingerprint(submitted), creationDraftFingerprint(saved));
  saved.profile.backstory += " Added after the save.";
  assert.notEqual(creationDraftContent(submitted), creationDraftContent(saved));
});

test("invalid or cyclic recovery stays retained and cannot enter the editor", () => {
  const storage = new MemoryStorage(), key = creationAutosavePrefix(scope) + "broken";
  storage.setItem(key, "not JSON");
  assert.equal(readCreationAutosaves(storage, scope).unreadable, 1);
  assert.equal(storage.getItem(key), "not JSON");
  const invalid = draft(); invalid.skillAllocations[0].parentDraftId = -2;
  assert.throws(() => encodeCreationAutosave(scope, draft(), invalid, "skills"), /skill path/);
});
