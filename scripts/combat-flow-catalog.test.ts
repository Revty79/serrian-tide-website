import assert from "node:assert/strict";
import test from "node:test";
import { planCombatFlowCatalog } from "./combat-flow-catalog";
import type { Catalog } from "./weapon-catalog-repair";

const catalog: Catalog = { items: [], profiles: [], modes: [], mappings: [], magazines: [], magazineAmmo: [], weaponMagazines: [], skills: [], relationships: [] };
for (const id of [1, 2, 3, 6, 61, 77, 82, 112, 134, 1045]) {
  catalog.items.push({ id, name: id === 1045 ? "M4 Carbine" : `Weapon ${id}`, catalog_scope: "equipment", archived_at: null });
  catalog.profiles.push({ id, item_id: id, profile_record_type: "Weapon", weapon_type: id === 6 ? "Club" : "Firearm", handedness: "Two-Handed",
    draw_initiative_cost: [1, 2, 77, 112, 1045].includes(id) ? 2 : null, initiative_cost: null, ammunition_item_id: null,
    capacity_rounds: 6, reload_type: "Single", reload_initiative: "1 per round", reload_initiative_cost: null, unload_initiative_cost: null, firing_mode_change_initiative_cost: null });
  if (id !== 6) catalog.modes.push({ id, weapon_profile_id: id, name: [61, 82, 134].includes(id) ? "Full-Auto" : "Single",
    normalized_name: [61, 82, 134].includes(id) ? "full-auto" : "single", base_cycling_initiative_cost: null,
    base_recoil_reset_initiative_cost: null, delivery_cadence: null, rounds_per_cadence: null, mechanics_review_required: true });
}
catalog.modes.push({ id: 2000, weapon_profile_id: 1045, name: "3rd Burst", normalized_name: "3rd burst", base_cycling_initiative_cost: 1.5,
  base_recoil_reset_initiative_cost: 1.5, delivery_cadence: "per-trigger", rounds_per_cadence: 2, mechanics_review_required: false });
catalog.items.push({ id: 3000, name: "Magazine", catalog_scope: "equipment", archived_at: null });
catalog.magazines.push({ item_id: 3000, fill_initiative_cost_per_round: null });
catalog.skills.push(...[{ id: 1, name: "Combat", tier: 1 }, { id: 2, name: "Clubs", tier: 2 }].map((skill) => ({ ...skill,
  classification: "standard", primaryAttribute: "DEX", secondaryAttribute: null, definition: "Fixture", archivedAt: null })));
catalog.relationships.push({ id: 1, skillId: 2, relatedSkillId: 1, relationshipType: "parent", sortOrder: 0 });
catalog.mappings.push({ id: 1, weapon_profile_id: 6, firing_mode_id: null, endpoint_skill_id: 2, review_state: "approved" });

test("catalog preparation fills only missing values except the exact authorized M4 burst correction", () => {
  const original = structuredClone(catalog);
  const plan = planCombatFlowCatalog(catalog);
  assert.deepEqual(catalog, original);
  assert.ok(plan.patches.length > 0);
  assert.equal(plan.patches.find((patch) => patch.table === "weapon_profiles" && patch.id === 6 && patch.field === "initiative_cost")?.after, 6);
  const unreviewed = structuredClone(catalog);
  unreviewed.mappings[0].review_state = "needs-review";
  assert.ok(!planCombatFlowCatalog(unreviewed).patches.some((patch) => patch.table === "weapon_profiles" && patch.id === 6 && patch.field === "initiative_cost"));
  for (const patch of plan.patches) {
    assert.ok(patch.before === null || patch.field === "mechanics_review_required" && patch.before === true
      || patch.name === "M4 Carbine / 3rd Burst" && patch.field === "rounds_per_cadence" && patch.before === 2 && patch.after === 3);
    if (typeof patch.after === "number") assert.ok(Number.isFinite(patch.after) && patch.after > 0);
    assert.ok(!["readiness_mode", "ready_initiative_cost", "ammunition_item_id", "capacity_rounds"].includes(patch.field));
  }
  for (const itemId of [1, 2, 77, 112, 1045]) {
    const profile = catalog.profiles.find((p) => p.item_id === itemId)!;
    assert.ok(!plan.patches.some((patch) => patch.table === "weapon_profiles" && patch.id === profile.id && patch.field === "draw_initiative_cost"));
  }
  for (const itemId of [61, 82, 134]) {
    const profile = catalog.profiles.find((p) => p.item_id === itemId)!;
    assert.ok(plan.notes.find((entry) => entry.itemId === itemId)?.issues.some((issue) => issue.includes("explicit choice")));
    assert.ok(!plan.patches.some((patch) => patch.table === "weapon_firing_modes" && catalog.modes.find((mode) => mode.id === patch.id)?.weapon_profile_id === profile.id));
  }
});

test("a fully applied catalog produces no repeat writes and preserves all unrelated fields", () => {
  const after = structuredClone(catalog);
  const plan = planCombatFlowCatalog(after);
  for (const patch of plan.patches) {
    const rows = patch.table === "weapon_profiles" ? after.profiles : patch.table === "weapon_firing_modes" ? after.modes : after.magazines;
    rows.find((row) => row[patch.idColumn] === patch.id)![patch.field] = patch.after;
  }
  assert.equal(planCombatFlowCatalog(after).patches.length, 0);
  assert.deepEqual(after.items, catalog.items);
  assert.deepEqual(after.skills, catalog.skills);
  assert.deepEqual(after.relationships, catalog.relationships);
  assert.deepEqual(after.mappings, catalog.mappings);
  assert.deepEqual(after.weaponMagazines, catalog.weaponMagazines);
  assert.deepEqual(after.magazineAmmo, catalog.magazineAmmo);
});
