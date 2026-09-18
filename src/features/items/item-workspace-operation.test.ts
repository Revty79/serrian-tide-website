import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createItemWorkspaceOperationGuard } from "./item-workspace-operation";

const workspace = readFileSync("src/app/heavens/items/item-workspace.tsx", "utf8");

test("an active Governing Skill Path save blocks Item save and variant creation", () => {
  const guard = createItemWorkspaceOperationGuard();
  const pathSave = guard.begin("governance-save");
  assert.ok(pathSave);
  assert.equal(guard.begin("item-save"), null);
  assert.equal(guard.begin("variant-create"), null);
  assert.equal(guard.active()?.id, pathSave.id);
});

test("an active Item save blocks a Governing Skill Path save", () => {
  const guard = createItemWorkspaceOperationGuard();
  const itemSave = guard.begin("item-save");
  assert.ok(itemSave);
  assert.equal(guard.begin("governance-save"), null);
});

test("a failed save releases its lock for a retry while stale completion cannot clear a newer operation", () => {
  const guard = createItemWorkspaceOperationGuard();
  const failedSave = guard.begin("item-save");
  assert.ok(failedSave);
  assert.equal(guard.finish(failedSave), true);
  const retry = guard.begin("item-save");
  assert.ok(retry);
  assert.equal(guard.finish(failedSave), false);
  assert.equal(guard.active()?.id, retry.id);
  assert.equal(guard.finish(retry), true);
});

test("an active variant creation blocks duplicate cloning and other record-changing operations", () => {
  const guard = createItemWorkspaceOperationGuard();
  const creation = guard.begin("variant-create");
  assert.ok(creation);
  assert.equal(guard.begin("variant-create"), null);
  assert.equal(guard.begin("item-save"), null);
  assert.equal(guard.finish(creation), true);
  assert.ok(guard.begin("variant-create"));
});

test("workspace handlers block conflicting draft replacement and await guarded variant creation", () => {
  assert.match(workspace, /function change\(next: ItemDraft\) \{\s+if \(operationBlocked\(\)\) return;/);
  assert.match(workspace, /onGovernanceChanged=.*operationBlocked\(\)/);
  assert.match(workspace, /async function requestVariantCreation\(variantName: string\): Promise<boolean>/);
  assert.match(workspace, /return createVariantNow\(draft\.id, variantName\);/);
  assert.match(workspace, /else if \(next\.kind === "variant"\) await createVariantNow\(next\.parentId, next\.variantName\);/);
  assert.match(workspace, /if \(hasUnsavedWork\) \{\s+setPending\(\{ kind: "variant", parentId: draft\.id, variantName \}\);\s+return false;/);
});
