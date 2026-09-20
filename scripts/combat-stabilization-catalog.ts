import assert from "node:assert/strict";
import { planCombatFlowCatalog } from "./combat-flow-catalog";
import { digest, type Catalog } from "./weapon-catalog-repair";
import { validateCanonicalSkillPath } from "../src/features/items/weapon-skill-governance";

/** Small, reviewable authoring batch authorized by Brannan on 19 September.
 * These are editable catalog proposals, never implicit runtime defaults. */
export function planCombatStabilizationCatalog(catalog: Catalog) {
  const melee = new Set([6, 14, 19, 25, 62, 66, 78, 118, 131, 135, 146, 154, 425, 459]);
  const selected = new Set([...melee, 77]);
  const baseline = planCombatFlowCatalog(catalog);
  const profileIds = new Set(catalog.profiles.filter((p) => selected.has(Number(p.item_id))).map((p) => p.id));
  const patches = baseline.patches.filter((p) => p.table === "weapon_profiles" && profileIds.has(p.id));
  const shortsword = patches.find((p) => p.name === "Shortsword" && p.field === "initiative_cost");
  if (shortsword) { shortsword.after = 4; shortsword.reason = "Provisional short, one-handed blade timing: 4 Initiative, matching existing Shortsword encounter examples."; }
  const mappings: { profileId: number; name: string; endpointSkillId: number; notes: string; updatedByUserId: string }[] = [];
  for (const profile of catalog.profiles.filter((p) => selected.has(Number(p.item_id)))) {
    const item = catalog.items.find((i) => i.id === profile.item_id)!;
    assert.equal(item.catalog_scope, "equipment");
    const fill = (field: string, after: string | number, reason: string) => {
      if (profile[field] === null && !patches.some((p) => p.id === profile.id && p.field === field)) patches.push({ table: "weapon_profiles", idColumn: "id", id: profile.id, name: String(item.name), field, before: null, after, reason });
    };
    fill("range_mode", melee.has(item.id) ? "melee" : "ranged", "Explicit default use for this reviewed weapon; melee requires no measured distance.");
    if (item.id === 77) {
      // Existing prose says 120 ft. Treat that as Long for this provisional authoring batch.
      for (const [field, value] of Object.entries({ distance_unit: "feet", short_range_distance: 30, medium_range_distance: 60, long_range_distance: 120 })) {
        fill(field, value, "Provisional Longbow bands 30/60/120 feet; existing 120-foot prose retained. Review and edit in Heavens.");
      }
    }
    if (item.id === 154) {
      assert.equal(item.name, "Wooden Stake");
      const path = validateCanonicalSkillPath(122, catalog.skills.filter((s) => !s.archivedAt), catalog.relationships);
      assert.equal(path.valid, true, "Short Blades ancestry must remain valid.");
      const existing = catalog.mappings.filter((m) => m.weapon_profile_id === profile.id);
      if (!existing.length) {
        const author = catalog.mappings.find((m) => m.weapon_profile_id === 239)?.updated_by_user_id;
        assert.equal(typeof author, "string");
        mappings.push({ profileId: profile.id, name: String(item.name), endpointSkillId: 122, updatedByUserId: String(author),
          notes: "Provisional 2026-09-19 combat audit choice authorized by Brannan: Wooden Stake uses Melee Weapons > Bladed Weapons > Short Blades for its authored close-quarters piercing use. Editable pending human review." });
      }
      fill("initiative_cost", 4, "Provisional light piercing melee attack: 4 Initiative.");
    }
  }
  return { sourceDigest: digest(catalog), patches, mappings, notes: baseline.notes, digest: digest({ catalog, patches, mappings }) };
}
