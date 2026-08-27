import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("Inventory Ammunition exposes its damage profile without becoming Equipment", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/app/heavens/items/item-workspace.tsx"),
    "utf8",
  );

  assert.match(source, /label: "Weapon \/ Ammunition"/);
  assert.match(source, />Add Weapon \/ Ammunition Profile<\/button>/);
  assert.match(source, /Ammunition Damage & Mechanics/);
  assert.equal(
    source.includes('scope === "inventory" && (tab.id === "weapon"'),
    false,
  );
  assert.equal(
    source.includes('activeTab === "weapon" && scope === "equipment"'),
    false,
  );
  assert.equal(
    source.includes('core: { ...draft.core, equipmentGroup: "weapon" }, weaponProfile'),
    false,
  );
});
