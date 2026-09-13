import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { auditCatalog, deferred, digest, planRepair, proposals, type Catalog } from "./weapon-catalog-repair";

const reviewed: Catalog = JSON.parse(readFileSync("artifacts/weapon-catalog-repair/reviewed-catalog.json", "utf8"));

test("reviewed live identities resolve by item_id and all 105 proposed paths validate", () => {
  const plan = planRepair(reviewed, reviewed);
  assert.equal(plan.additions.length, 105);
  assert.equal(plan.patches.length, 6);
  assert.equal(plan.additions.find((p) => p.itemId === 3)?.profileId, 224);
  assert.equal(plan.additions.find((p) => p.itemId === 62)?.profileId, 230);
  assert.equal(Object.values(proposals).flat().length, 127);
  assert.equal(Object.keys(deferred).length, 22);
  for (const entry of plan.additions) assert.ok(entry.path.at(-1) === entry.endpointSkillId && entry.path.length >= 2);
  assert.equal(plan.additions.find((p) => p.itemId === 40)?.endpointSkillId, 62);
  assert.equal(plan.additions.find((p) => p.itemId === 79)?.endpointSkillId, 129);
  assert.equal(plan.additions.find((p) => p.itemId === 132)?.endpointSkillId, 124);
});

test("only confirmed empty projectile columns change; Longbow's newer cost 2 is preserved", () => {
  const plan = planRepair(reviewed, reviewed);
  assert.ok(!plan.patches.some((p) => p.itemId === 77));
  assert.equal(reviewed.profiles.find((p) => p.item_id === 77)?.reload_initiative_cost, 2);
  assert.deepEqual(plan.patches.find((p) => p.itemId === 108)?.fields, { capacity_rounds: 5, reload_type: "Magazine", reload_initiative_cost: 2 });
  assert.ok(plan.patches.every((p) => Object.keys(p.fields).length === 3));
  assert.ok(plan.additions.every((p) => !deferred[p.itemId]));
});

for (const [label, mutate] of [
  ["description", (c: Catalog) => { c.items.find((i) => i.id === 3)!.description = "Different mechanism"; }],
  ["profile identity", (c: Catalog) => { c.profiles.find((p) => p.item_id === 3)!.id = 900000; }],
  ["skill definition", (c: Catalog) => { c.skills.find((s) => s.id === 135)!.definition = "Different meaning"; }],
  ["skill ancestry", (c: Catalog) => { c.relationships.pop(); }],
  ["authored cost", (c: Catalog) => { c.profiles.find((p) => p.item_id === 20)!.reload_initiative_cost = 9; }],
  ["existing mapping", (c: Catalog) => { c.mappings[0].notes = "Human changed this"; }],
  ["archive state", (c: Catalog) => { c.items.find((i) => i.id === 3)!.archived_at = "2026-09-13"; }],
] as const) test(`stale ${label} blocks repair without mutating the supplied catalog`, () => {
  const current = structuredClone(reviewed);
  mutate(current);
  const before = digest(current);
  assert.throws(() => planRepair(current, reviewed));
  assert.equal(digest(current), before);
});

test("new unrelated governance is preserved and requires review rather than replacement", () => {
  const c = structuredClone(reviewed);
  c.mappings.push({ id: 99999, weapon_profile_id: 224, firing_mode_id: null, endpoint_skill_id: 67, review_state: "approved" });
  assert.throws(() => planRepair(c, reviewed), /different governance/);
});

test("audit distinguishes valid ammunition definitions from appropriateness and runtime support", () => {
  const audit = auditCatalog(reviewed);
  assert.equal(audit.length, 204);
  assert.equal(audit.filter((p) => p.defaultGovernanceValid).length, 6);
  assert.equal(audit.find((p) => p.itemId === 507)?.ammunition?.appropriateness, "unresolved-generic-cartridge");
  assert.equal(audit.find((p) => p.itemId === 59)?.ammunition?.definitionValid, false);
  assert.equal(audit.find((p) => p.itemId === 120)?.runtime, "unsupported-ammunition-family");
  assert.ok(audit.every((p) => !p.gameplayVerified));
});
