import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { digest, type Catalog } from "./weapon-catalog-repair";
import { planMagazineRepair } from "./magazine-catalog-repair";
const source: Catalog = JSON.parse(readFileSync("artifacts/magazine-catalog-repair/reviewed-targets.json","utf8"));

test("nine magazine/container models and 21 profile fills retain exact weapon and ammunition identities", () => {
  const plan = planMagazineRepair(source,source);
  assert.equal(plan.models.length,9); assert.equal(plan.patches.length,21);
  assert.equal(plan.models.find((m) => m.weaponItemId === 2)?.ammunitionItemId,156);
  assert.equal(plan.models.find((m) => m.weaponItemId === 3)?.profileId,224);
  assert.deepEqual(plan.models.filter((m) => m.weaponItemId === 61).map((m) => m.capacity),[100,500]);
  assert.equal(new Set(plan.models.map((m) => m.canonicalId)).size,9);
  for (const id of [63,123]) {
    assert.deepEqual(plan.patches.find((p) => p.itemId === id)?.fields,{ capacity_rounds: 5,reload_type: "Single" });
    assert.ok(!plan.models.some((m) => m.weaponItemId === id));
  }
  for (const id of [77,112]) assert.ok(!plan.patches.some((p) => p.itemId === id));
});

for (const [label,change] of [
  ["weapon description",(c: Catalog) => { c.items.find((i) => i.id === 2)!.description="Changed"; }],
  ["ammunition",(c: Catalog) => { c.profiles.find((p) => p.item_id === 2)!.ammunition_item_id=155; }],
  ["authored loading decision",(c: Catalog) => { c.profiles.find((p) => p.item_id === 2)!.reload_type="Single"; }],
  ["archived weapon",(c: Catalog) => { c.items.find((i) => i.id === 2)!.archived_at="2026-09-13"; }],
  ["ammo damage",(c: Catalog) => { c.profiles.find((p) => p.item_id === 156)!.damage="99"; }],
] as const) test(`${label} drift blocks repair without modifying the input`,() => {
  const current=structuredClone(source); change(current); const before=digest(current);
  assert.throws(() => planMagazineRepair(current,source)); assert.equal(digest(current),before);
});
