import assert from "node:assert/strict";
import test from "node:test";

import {
  assertExactConfirmation,
  assertPermanentDeletionEnabled,
  assertSharedRootManager,
  canManageOwnedRoot,
  canManageSharedRoot,
  isPermanentDeletionEnabled,
  isProtectedSharedRoot,
  normalizeLifecycleReason,
  parseLifecycleTarget,
} from "./policy";

const ownerGod = { userId: "owner", roles: ["god"] } as const;
const otherGod = { userId: "other", roles: ["god"] } as const;
const administrator = { userId: "administrator", roles: ["admin"] } as const;
const player = { userId: "player", roles: ["player"] } as const;

test("permanent deletion is enabled outside production", () => {
  assert.equal(isPermanentDeletionEnabled({ NODE_ENV: "development" }), true);
  assert.equal(isPermanentDeletionEnabled({ NODE_ENV: "test" }), true);
});

test("production permanent deletion defaults off and only exact true enables it", () => {
  for (const configured of [undefined, "", "TRUE", "True", "1", " true "]) {
    assert.equal(isPermanentDeletionEnabled({
      NODE_ENV: "production",
      SERRIAN_TIDE_ENABLE_PERMANENT_DELETION: configured,
    }), false);
  }
  assert.equal(isPermanentDeletionEnabled({
    NODE_ENV: "production",
    SERRIAN_TIDE_ENABLE_PERMANENT_DELETION: "true",
  }), true);
  assert.throws(
    () => assertPermanentDeletionEnabled({ NODE_ENV: "production" }),
    /disabled in production by recovery protection/,
  );
});

test("Campaign and Character roots are managed by their owner or an administrator", () => {
  assert.equal(canManageOwnedRoot(ownerGod, "owner"), true);
  assert.equal(canManageOwnedRoot(administrator, "owner"), true);
  assert.equal(canManageOwnedRoot(otherGod, "owner"), false);
  assert.equal(canManageOwnedRoot(player, "player"), false);
});

test("shared roots require explicit user authorship and creator or administrator", () => {
  const authored = { createdByUserId: "owner", sourceSystem: null };
  assert.equal(canManageSharedRoot(ownerGod, authored), true);
  assert.equal(canManageSharedRoot(administrator, authored), true);
  assert.equal(canManageSharedRoot(otherGod, authored), false);
  assert.equal(canManageSharedRoot(player, authored), false);
});

test("canonical, imported, and ambiguous legacy shared roots stay protected", () => {
  assert.equal(isProtectedSharedRoot({
    createdByUserId: "owner",
    sourceSystem: "STANDALONE",
  }), true);
  assert.equal(isProtectedSharedRoot({
    createdByUserId: null,
    sourceSystem: null,
  }), true);
  assert.throws(
    () => assertSharedRootManager(administrator, {
      createdByUserId: null,
      sourceSystem: null,
    }, "Skill"),
    /ambiguous legacy ownership/,
  );
});

test("target, reason, and typed-name inputs are validated exactly", () => {
  assert.deepEqual(parseLifecycleTarget({ entityKind: "campaign", entityId: 7 }), {
    entityKind: "campaign",
    entityId: 7,
  });
  assert.throws(
    () => parseLifecycleTarget({ entityKind: "campaign", entityId: 0 }),
    /saved lifecycle record/,
  );
  assert.equal(normalizeLifecycleReason("  retired  "), "retired");
  assert.throws(() => normalizeLifecycleReason("x".repeat(1001)), /1,000/);
  assert.doesNotThrow(() => assertExactConfirmation("Ashfall", "Ashfall"));
  assert.throws(() => assertExactConfirmation("Ashfall", "ashfall"), /exact name/);
});
