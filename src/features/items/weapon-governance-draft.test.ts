import assert from "node:assert/strict";
import test from "node:test";
import { shouldApplyGovernanceRead } from "./weapon-governance-draft";

test("governance reads apply to the active clean scope", () => {
  assert.equal(shouldApplyGovernanceRead("item:1:weapon:", null, "item:1:weapon:"), true);
  assert.equal(shouldApplyGovernanceRead("item:1:weapon:", { profileKey: "item:1:weapon:", dirty: false }, "item:1:weapon:"), true);
});

test("dirty governance edits reject a same-scope background read", () => {
  assert.equal(shouldApplyGovernanceRead("item:1:weapon:", { profileKey: "item:1:weapon:", dirty: true }, "item:1:weapon:"), false);
});

test("a response for another Item or profile scope is stale", () => {
  assert.equal(shouldApplyGovernanceRead("item:2:weapon:", { profileKey: "item:2:weapon:", dirty: false }, "item:1:weapon:"), false);
  assert.equal(shouldApplyGovernanceRead("item:1:mode:4", { profileKey: "item:1:mode:4", dirty: false }, "item:1:weapon:"), false);
});