import type { Catalog } from "./weapon-catalog-repair";
import { auditCatalog, digest } from "./weapon-catalog-repair";
import { isFirearmWeaponType, isSupportedAmmunitionWeaponType } from "../src/features/items/firearm-classification";

type Patch = { table: "weapon_profiles" | "weapon_firing_modes" | "magazine_profiles"; idColumn: "id" | "item_id"; id: number; name: string; field: string; before: unknown; after: number | string | boolean; reason: string };
const physicalMelee = new Set(["Knife", "Knife / Blade", "Axe", "Club", "Blunt / Close Weapon", "Mace", "Hammer", "Sword", "Staff", "Polearm"]);
const specialMelee = /laser|pulse|gravity|chainsaw|stun|rocket|throwing|harpoon|javelin|brass knuckles/i;
const heavy = /greatsword|poleaxe|halberd|glaive|spetum|partisan|lucerne|sledgehammer|scythe|cannon|mortar|heavy machine|refrigerator door|traffic sign/i;

export function planCombatFlowCatalog(catalog: Catalog) {
  const patches: Patch[] = [];
  const notes: { itemId: number; name: string; issues: string[] }[] = [];
  const audit = auditCatalog(catalog);
  const fill = (table: Patch["table"], id: number, name: string, row: Record<string, unknown>, field: string, after: Patch["after"], reason: string) => {
    if (row[field] !== null) return;
    patches.push({ table, idColumn: table === "magazine_profiles" ? "item_id" : "id", id, name, field, before: null, after, reason });
  };
  for (const p of catalog.profiles.filter((p) => p.profile_record_type === "Weapon")) {
    const item = catalog.items.find((i) => i.id === p.item_id);
    if (!item || item.archived_at || item.catalog_scope !== "equipment") continue;
    const name = String(item.name), type = String(p.weapon_type), id = Number(p.id);
    const rowAudit = audit.find((entry) => entry.profileId === id)!;
    const issues: string[] = [];
    const draw = heavy.test(name) ? 3 : ["Two-Handed", "Versatile"].includes(String(p.handedness)) ? 2 : 1;
    fill("weapon_profiles", id, name, p, "draw_initiative_cost", draw, "Editable handling baseline: small one-handed 1, standard two-handed/versatile 2, large or cumbersome 3.");
    const modes = catalog.modes.filter((m) => m.weapon_profile_id === id);
    const supported = isSupportedAmmunitionWeaponType(type);
    const ordinary = physicalMelee.has(type) && !specialMelee.test(name) && !modes.length && p.ammunition_item_id === null;
    if (ordinary && rowAudit.defaultGovernanceValid) {
      const attack = ["Knife", "Knife / Blade", "Blunt / Close Weapon"].includes(type) ? 4
        : type === "Sword" && p.handedness === "Two-Handed" ? heavy.test(name) ? 10 : 8
          : type === "Polearm" || ["Axe", "Hammer"].includes(type) && p.handedness === "Two-Handed" ? 8 : 6;
      fill("weapon_profiles", id, name, p, "initiative_cost", attack, "Editable ordinary melee baseline: light 4, standard 6, heavy/polearm 8, greatsword 10. Existing attack costs preserved.");
    } else if (!supported) issues.push("Special, thrown, or unresolved governing-Skill behavior needs review; drawing does not certify its attack workflow.");
    if (!rowAudit.defaultGovernanceValid) issues.push("No valid approved default Skill path; exact governing Skill needs authoring.");
    if (supported) {
      if (p.capacity_rounds === null || p.reload_type === null || !rowAudit.ammunition?.definitionValid) issues.push("Capacity, loading type, or exact ammunition definition is incomplete.");
      const legacy = /^(\d+(?:\.\d+)?)(?: per (?:round|shell))?$/.exec(String(p.reload_initiative).trim());
      if (legacy && Number(legacy[1]) > 0) fill("weapon_profiles", id, name, p, "reload_initiative_cost", Number(legacy[1]), "Copied explicit legacy Reload Initiative into structured loading timing; Single loading charges per inserted round.");
      else if (p.reload_initiative_cost === null) issues.push("No unambiguous authored loading cost.");
      fill("weapon_profiles", id, name, p, "unload_initiative_cost", 1, "Editable baseline: one Initiative for the supported unload operation.");
      if (modes.length > 1) fill("weapon_profiles", id, name, p, "firing_mode_change_initiative_cost", 1, "Editable baseline: one Initiative to change firing mode.");
      if (!modes.length) issues.push("No firing mode.");
      if (isFirearmWeaponType(type)) for (const mode of modes) {
        const normalized = String(mode.normalized_name).trim().toLowerCase();
        if (!["single", "semi", "semi-auto"].includes(normalized)) {
          if ([mode.base_cycling_initiative_cost, mode.base_recoil_reset_initiative_cost, mode.delivery_cadence, mode.rounds_per_cadence].some((value) => value === null)) issues.push(`${mode.name}: firing rate/recovery settings need an explicit choice.`);
          continue;
        }
        const label = `${name} / ${mode.name}`, semi = normalized !== "single";
        fill("weapon_firing_modes", Number(mode.id), label, mode, "base_cycling_initiative_cost", semi ? 0.5 : 1, "Editable recovery baseline matching existing authored semi/single examples.");
        fill("weapon_firing_modes", Number(mode.id), label, mode, "base_recoil_reset_initiative_cost", semi ? 0.5 : 1, "Editable recovery baseline matching existing authored semi/single examples.");
        fill("weapon_firing_modes", Number(mode.id), label, mode, "delivery_cadence", "per-trigger", "Existing Single/Semi mode and one-shot-per-trigger catalog rate.");
        fill("weapon_firing_modes", Number(mode.id), label, mode, "rounds_per_cadence", 1, "Existing Single/Semi mode and one-shot-per-trigger catalog rate.");
        const changed = patches.some((patch) => patch.table === "weapon_firing_modes" && patch.id === Number(mode.id));
        if (changed && mode.mechanics_review_required === true) patches.push({ table: "weapon_firing_modes", idColumn: "id", id: Number(mode.id), name: label,
          field: "mechanics_review_required", before: true, after: false, reason: "All four Single/Semi mechanics have explicit saved values after this fill." });
      }
    }
    if (issues.length) notes.push({ itemId: Number(item.id), name, issues });
  }
  for (const magazine of catalog.magazines) {
    const item = catalog.items.find((i) => i.id === magazine.item_id);
    if (!item || item.archived_at) continue;
    fill("magazine_profiles", Number(magazine.item_id), String(item.name), magazine, "fill_initiative_cost_per_round", 1, "Editable baseline: one Initiative per inserted cartridge or bolt. No free rounds; existing zero costs preserved.");
  }
  // Explicit user correction on 14 September; committed attack snapshots remain immutable.
  const m4 = catalog.items.find((item) => item.id === 1045 && item.name === "M4 Carbine" && !item.archived_at);
  const m4Profile = m4 && catalog.profiles.find((profile) => profile.item_id === m4.id);
  const burst = m4Profile && catalog.modes.find((mode) => mode.weapon_profile_id === m4Profile.id && mode.name === "3rd Burst");
  if (burst?.rounds_per_cadence === 2) patches.push({ table: "weapon_firing_modes", idColumn: "id", id: Number(burst.id), name: "M4 Carbine / 3rd Burst",
    field: "rounds_per_cadence", before: 2, after: 3, reason: "Brannan explicitly confirmed this mode should fire three rounds per trigger on 14 September 2026." });
  return { sourceDigest: digest(catalog), patches, notes, digest: digest({ catalog, patches }) };
}
