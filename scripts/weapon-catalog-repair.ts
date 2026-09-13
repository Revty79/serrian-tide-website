import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type pg from "pg";
import { validateCanonicalSkillPath, type CanonicalSkillDefinition, type CanonicalSkillParentRelationship } from "../src/features/items/weapon-skill-governance";
import { isSupportedAmmunitionWeaponType, isFirearmWeaponType } from "../src/features/items/firearm-classification";

type Row = Record<string, unknown> & { id: number };
export type Catalog = {
  items: Row[]; profiles: Row[]; modes: Row[]; mappings: Row[];
  magazines: Record<string, unknown>[]; magazineAmmo: Record<string, unknown>[]; weaponMagazines: Record<string, unknown>[];
  skills: (CanonicalSkillDefinition & { definition: string; archivedAt: string | null })[];
  relationships: CanonicalSkillParentRelationship[];
};
export const repairNotes = "2026-09-13 catalog repair: reviewed item form and exact canonical Skill ancestry. Family governance only; does not authorize unsupported special mechanics.";

// These are ITEM identities from Ember's proposal, never profile identities.
export const proposals: Record<number, number[]> = {
  120: [17,24,37,39,48,51,66,101,107,115,116],
  121: [7,12,57,384,412],
  122: [14,19,21,25,62,81,94,131,136,137,146,359,366,425,433,459,470,586],
  124: [6,9,33,74,110,132,150,373,386,398,428,453,498,562,565,577,581,582,585,588,591,592,816],
  125: [50,151,438,480], 126: [80,86], 128: [58,65,69,114,126,148,391,411,454],
  129: [49,53,79,91,98,127,473], 130: [11,104,111,563], 59: [476], 60: [423,452],
  62: [40], 64: [38,85,153,575], 65: [83], 67: [1,2,63,75,87,109,123],
  68: [10,119], 69: [134], 70: [61,82], 135: [3,26,42,43,54],
  134: [20,117], 133: [55,60,76,108], 74: [52], 75: [113], 78: [13,35],
  137: [120], 138: [121], 139: [147], 141: [142], 142: [140,144], 143: [141,143],
};
export const deferred: Record<number, string> = {
  13: "Thrown-only delivery and recovery are unsupported; do not expose throwing as melee proficiency.",
  35: "Thrown energy disc needs delivery, recovery and energy rules.",
  52: "Grenade-launcher delivery and area payload mechanics need separate runtime support.",
  58: "Description explicitly says ranged use; Spears is a melee path. Confirm thrusting versus throwing.",
  65: "Description explicitly says thrown javelin; Spears is a melee path. Confirm intended uses.",
  113: "Rocket-launcher delivery and area payload mechanics need separate runtime support.",
  114: "Propelled one-use spear is not established as a melee thrusting weapon.",
  120: "Sling ammunition delivery is unsupported; keep the proposed Sling path pending.",
  121: "Slingshot ammunition delivery is unsupported; keep the proposed Slingshots path pending.",
  140: "Thrown Axes must not grant ordinary melee eligibility; use-specific governance/delivery is pending.",
  141: "Thrown Blades must not grant ordinary melee eligibility; use-specific governance/delivery is pending.",
  142: "Thrown Spears must not grant ordinary melee eligibility; use-specific governance/delivery is pending.",
  143: "Thrown Blades must not grant ordinary melee eligibility; use-specific governance/delivery is pending.",
  144: "Thrown Axes must not grant ordinary melee eligibility; use-specific governance/delivery is pending.",
  147: "Blowgun ammunition delivery and its prose damage override are unsupported.",
  386: "Fire Poker: clarify striking versus point use before choosing Clubs or a thrusting path.",
  565: "Brick: confirm improvised striking versus throwing; solid object is not automatically club technique.",
  577: "Laptop: ordinary-function description does not establish a canonical club-like combat technique.",
  582: "Refrigerator Door: unwieldy smash use needs an improvised-weapon ruling, not automatic Clubs.",
  591: "Toilet Lid: confirm the intended improvised combat technique.",
  592: "Traffic Sign: description says swung like a blade; reconcile that with proposed Clubs.",
  816: "Chair: ordinary-function description does not establish a canonical club-like combat technique.",
};
const projectileSettings: Record<number, Record<string, unknown>> = {
  20: { capacity_rounds: 1, reload_type: "Single", reload_initiative_cost: 1 },
  55: { capacity_rounds: 1, reload_type: "Single", reload_initiative_cost: 3 },
  60: { capacity_rounds: 1, reload_type: "Single", reload_initiative_cost: 6 },
  76: { capacity_rounds: 1, reload_type: "Single", reload_initiative_cost: 4 },
  77: { capacity_rounds: 1, reload_type: "Single", reload_initiative_cost: 1 },
  108: { capacity_rounds: 5, reload_type: "Magazine", reload_initiative_cost: 2 },
  117: { capacity_rounds: 1, reload_type: "Single", reload_initiative_cost: 1 },
};
// Brannan authorized specific ammunition authoring, but not a damage/price rebalance.
export const ammunitionSpecs: Record<number, { name: string; type: string; description: string }> = {
  10: { name: "Blunderbuss Shot Charge", type: "Shot Charge", description: "A complete ammunition charge for the catalog Blunderbuss." },
  26: { name: "Derringer Cartridge", type: "Cartridge", description: "A cartridge for the catalog Derringer Pistol; no real-world caliber is implied." },
  54: { name: "Hand Cannon Ball Charge", type: "Ball Charge", description: "A complete ball charge for the catalog Hand Cannon." },
  56: { name: "Hand Mortar Projectile", type: "Projectile", description: "A projectile for the catalog Hand Mortar. Payload and blast behavior remain unconfirmed; this definition does not grant area damage." },
  61: { name: "Heavy Machine Gun Cartridge", type: "Cartridge", description: "A cartridge for the catalog Heavy Machine Gun; no belt or magazine compatibility is implied." },
  63: { name: "Hunting Rifle Cartridge", type: "Cartridge", description: "A cartridge for the catalog Hunting Rifle; no real-world caliber is implied." },
  75: { name: "Lever-Action Rifle Cartridge", type: "Cartridge", description: "A cartridge for the catalog Lever-Action Rifle; no real-world caliber is implied." },
  82: { name: "Machine Gun Cartridge", type: "Cartridge", description: "A cartridge for the catalog Machine Gun; no belt or magazine compatibility is implied." },
  123: { name: "Sniper Rifle Cartridge", type: "Cartridge", description: "A cartridge for the catalog Sniper Rifle; no real-world caliber is implied." },
  130: { name: "Steam Rifle Projectile", type: "Projectile", description: "A projectile for the catalog pressurized Steam Rifle. Pressure supply and loading mechanism remain unconfirmed." },
  134: { name: "Submachine Gun Cartridge", type: "Cartridge", description: "A handgun-class cartridge for the catalog Submachine Gun; no real-world caliber is implied." },
  507: { name: "Whaling Gun Harpoon", type: "Harpoon", description: "A tethered harpoon projectile for the catalog Whaling Gun. Tether handling requires a G.O.D. ruling and is not automated by this definition." },
};
const ammoCanonicalId = (id: number) => `AMMO-WEAPON-${String(id).padStart(4, "0")}`;
export type RepairPlan = {
  digest: string;
  additions: { itemId: number; profileId: number; name: string; endpointSkillId: number; path: number[] }[];
  patches: { itemId: number; profileId: number; name: string; fields: Record<string, unknown> }[];
  ammunition: { weaponItemId: number; weaponProfileId: number; name: string; canonicalId: string; existingItemId: number | null }[];
};

export function digest(value: unknown): string {
  function stable(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(stable);
    if (input && typeof input === "object") return Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]));
    return input;
  }
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

export async function readCatalog(client: pg.Client): Promise<Catalog> {
  const rows = async (sql: string) => JSON.parse(JSON.stringify((await client.query(sql)).rows));
  return {
    items: await rows("select * from items where id in(select item_id from weapon_profiles union select item_id from magazine_profiles) order by id"),
    profiles: await rows("select * from weapon_profiles order by id"),
    modes: await rows("select * from weapon_firing_modes order by id"),
    mappings: await rows("select * from weapon_skill_path_mappings order by id"),
    magazines: await rows("select * from magazine_profiles order by item_id"),
    magazineAmmo: await rows("select * from magazine_ammunition order by magazine_item_id,ammunition_item_id"),
    weaponMagazines: await rows("select * from weapon_magazines order by weapon_profile_id,magazine_item_id"),
    skills: await rows('select id,name,classification,tier,primary_attribute "primaryAttribute",secondary_attribute "secondaryAttribute",definition,archived_at "archivedAt" from skill order by id'),
    relationships: await rows('select id,skill_id "skillId",related_skill_id "relatedSkillId",relationship_type "relationshipType",sort_order "sortOrder" from skill_relationship order by id'),
  };
}

export function planRepair(current: Catalog, reviewed: Catalog): RepairPlan {
  // The reviewed source is immutable. A changed definition/ancestry needs another human-readable review.
  assert.equal(digest(current.skills), digest(reviewed.skills), "Skill definitions changed since review.");
  assert.equal(digest(current.relationships), digest(reviewed.relationships), "Skill ancestry changed since review.");
  const additions: RepairPlan["additions"] = [];
  const patches: RepairPlan["patches"] = [];
  const ammunition: RepairPlan["ammunition"] = [];
  for (const collection of ["items", "profiles"] as const) {
    const matches = (r: Row) => collection === "items" ? r.id === 163 : r.item_id === 163;
    assert.equal(digest(current[collection].find(matches)), digest(reviewed[collection].find(matches)), "Generic ammunition source changed; review balance before copying.");
  }
  const activeSkills = current.skills.filter((s) => !s.archivedAt);
  const candidates = Object.entries(proposals).flatMap(([endpoint, items]) => items.filter((id) => !deferred[id]).map((id) => ({ id, endpoint: Number(endpoint) })));
  assert.equal(new Set(candidates.map((c) => c.id)).size, candidates.length, "Duplicate item proposal.");
  for (const id of new Set([...candidates.map((c) => c.id), ...Object.keys(projectileSettings).map(Number), ...Object.keys(ammunitionSpecs).map(Number)])) {
    const item = current.items.find((i) => i.id === id);
    const oldItem = reviewed.items.find((i) => i.id === id);
    assert.ok(item && oldItem && !item.archived_at, `Missing/archived Item ${id}.`);
    assert.equal(digest(item), digest(oldItem), `Item ${id} changed since review.`);
    const profile = current.profiles.find((p) => p.item_id === id);
    const oldProfile = reviewed.profiles.find((p) => p.item_id === id);
    assert.ok(profile && oldProfile && profile.profile_record_type === "Weapon", `Missing Weapon profile for Item ${id}.`);
    const expected = { ...oldProfile };
    const spec = ammunitionSpecs[id];
    if (spec) {
      assert.equal(oldProfile.ammunition_item_id, 163, `Item ${id} did not use the reviewed generic cartridge.`);
      const ammoItem = current.items.find((i) => i.canonical_id === ammoCanonicalId(id));
      if (ammoItem) {
        const ammoProfile = current.profiles.find((p) => p.item_id === ammoItem.id);
        assert.ok(!ammoItem.archived_at && ammoItem.name === spec.name && ammoItem.record_type === "Ammunition" && ammoItem.credits === 1 && ammoProfile?.profile_record_type === "Ammunition" && Number(ammoProfile.damage) === 8 && ammoProfile.damage_type === "Piercing", `Specific ammunition for Item ${id} differs; preserve and re-review.`);
      }
      assert.ok(profile.ammunition_item_id === 163 || (ammoItem && profile.ammunition_item_id === ammoItem.id), `Item ${id} ammunition changed since review.`);
      expected.ammunition_item_id = profile.ammunition_item_id;
      if (!ammoItem || profile.ammunition_item_id !== ammoItem.id) ammunition.push({ weaponItemId: id, weaponProfileId: profile.id, name: spec.name, canonicalId: ammoCanonicalId(id), existingItemId: ammoItem?.id ?? null });
    }
    const fields: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(projectileSettings[id] ?? {})) {
      if (oldProfile[field] === null) {
        assert.ok(profile[field] === null || profile[field] === value, `Item ${id} ${field} changed since review.`);
        expected[field] = profile[field];
        if (profile[field] === null) fields[field] = value;
      }
    }
    expected.updated_at = profile.updated_at;
    assert.equal(digest(profile), digest(expected), `Weapon profile for Item ${id} changed since review.`);
    if (Object.keys(fields).length) patches.push({ itemId: id, profileId: profile.id, name: String(item.name), fields });
    const candidate = candidates.find((c) => c.id === id);
    if (!candidate) continue;
    const path = validateCanonicalSkillPath(candidate.endpoint, activeSkills, current.relationships);
    assert.ok(path.valid, `Invalid canonical path for Item ${id}: ${JSON.stringify(path.problems)}`);
    const existing = current.mappings.filter((m) => m.weapon_profile_id === profile.id);
    if (existing.length) {
      assert.ok(existing.some((m) => m.firing_mode_id === null && m.endpoint_skill_id === candidate.endpoint && m.review_state === "approved"), `Item ${id} now has different governance; preserve it and re-review.`);
    } else {
      additions.push({ itemId: id, profileId: profile.id, name: String(item.name), endpointSkillId: candidate.endpoint, path: path.rootToEndpoint.map((node) => node.id) });
    }
  }
  for (const existing of reviewed.mappings) assert.equal(digest(current.mappings.find((m) => m.id === existing.id)), digest(existing), `Existing mapping ${existing.id} changed; re-review.`);
  return { digest: digest(current), additions: additions.sort((a,b) => a.itemId-b.itemId), patches: patches.sort((a,b) => a.itemId-b.itemId), ammunition: ammunition.sort((a,b) => a.weaponItemId-b.weaponItemId) };
}

export async function applyRepair(client: pg.Client, reviewed: Catalog, expectedDigest: string, actorId: string) {
  const roles = (await client.query("select role from user_role where user_id=$1", [actorId])).rows;
  assert.ok(roles.some((r) => r.role === "admin"), "An explicitly selected administrator must authorize this maintenance pass.");
  const before = await readCatalog(client);
  assert.equal(digest(before), expectedDigest, "Catalog changed after planning; no writes permitted.");
  const plan = planRepair(before, reviewed);
  const inserted: Row[] = [];
  const createdItems: Row[] = [];
  const createdProfiles: Row[] = [];
  const ammunitionLinks: { weaponItemId: number; weaponProfileId: number; ammunitionItemId: number }[] = [];
  // A changed canonical link would reject an already-loaded generic round. Never strand one.
  for (const row of plan.ammunition) {
    assert.equal((await client.query("select count(*)::int n from campaign_character_firearm_state where weapon_profile_id=$1", [row.weaponProfileId])).rows[0].n, 0, `Item ${row.weaponItemId} has initialized copies; ammunition transition needs explicit review.`);
    assert.equal(before.weaponMagazines.filter((m) => m.weapon_profile_id === row.weaponProfileId).length, 0, "Existing magazine compatibility requires a separate reviewed ammunition transition.");
  }
  for (const row of plan.ammunition) {
    let ammunitionItemId = row.existingItemId;
    const spec = ammunitionSpecs[row.weaponItemId];
    if (ammunitionItemId === null) {
      const created = (await client.query(`insert into items(canonical_id,name,catalog_scope,record_type,family,category,description,credits,price_basis,created_by_user_id,source_system,source_external_id)
        values($1,$2,'inventory','Ammunition','Ammunition','Ammunition',$3,1,'per round',$4,'weapon-catalog-repair-2026-09-13',$5) returning *`, [row.canonicalId,row.name,spec.description,actorId,String(row.weaponItemId)])).rows[0];
      createdItems.push(created);
      ammunitionItemId = created.id;
      createdProfiles.push((await client.query(`insert into weapon_profiles(item_id,profile_record_type,weapon_type,damage_source,damage,damage_type,compatibility,rules_text)
        values($1,'Ammunition',$2,'Ammunition','8','Piercing',$3,$4) returning *`, [ammunitionItemId,spec.type,`Item ${row.weaponItemId}: ${before.items.find((i) => i.id === row.weaponItemId)!.name}`, "Specific ammunition identity authorized by Brannan on 2026-09-13. Retains previous Firearm Cartridge damage (8 Piercing) and price (1 credit per round), pending balance review. No additional area, tether, control or pressure effect is automated."])).rows[0]);
    }
    assert.ok(ammunitionItemId !== null);
    await client.query("update weapon_profiles set ammunition_item_id=$2,updated_at=now() where id=$1", [row.weaponProfileId,ammunitionItemId]);
    ammunitionLinks.push({ weaponItemId: row.weaponItemId, weaponProfileId: row.weaponProfileId, ammunitionItemId });
  }
  for (const row of plan.additions) {
    inserted.push((await client.query(`insert into weapon_skill_path_mappings
      (weapon_profile_id,firing_mode_id,endpoint_skill_id,review_state,notes,sort_order,updated_by_user_id)
      values($1,null,$2,'approved',$3,0,$4) returning *`, [row.profileId,row.endpointSkillId,repairNotes,actorId])).rows[0]);
  }
  for (const row of plan.patches) {
    const fields = Object.entries(row.fields);
    assert.ok(fields.every(([key]) => ["capacity_rounds", "reload_type", "reload_initiative_cost"].includes(key)));
    await client.query(`update weapon_profiles set ${fields.map(([key], index) => `${key}=$${index+2}`).join(",")}, updated_at=now() where id=$1`, [row.profileId, ...fields.map(([, value]) => value)]);
  }
  const after = await readCatalog(client);
  const expected = structuredClone(before);
  expected.items.push(...JSON.parse(JSON.stringify(createdItems)));
  expected.profiles.push(...JSON.parse(JSON.stringify(createdProfiles)));
  expected.items.sort((a,b) => a.id-b.id);
  expected.profiles.sort((a,b) => a.id-b.id);
  for (const link of ammunitionLinks) Object.assign(expected.profiles.find((p) => p.id === link.weaponProfileId)!, { ammunition_item_id: link.ammunitionItemId, updated_at: after.profiles.find((p) => p.id === link.weaponProfileId)!.updated_at });
  expected.mappings.push(...JSON.parse(JSON.stringify(inserted)));
  expected.mappings.sort((a,b) => a.id-b.id);
  for (const patch of plan.patches) {
    const row = expected.profiles.find((p) => p.id === patch.profileId)!;
    Object.assign(row, patch.fields, { updated_at: after.profiles.find((p) => p.id === patch.profileId)!.updated_at });
  }
  assert.equal(digest(after), digest(expected), "Unexpected catalog mutation; rollback required.");
  const retry = planRepair(after, reviewed);
  assert.equal(retry.additions.length + retry.patches.length + retry.ammunition.length, 0, "Repair is not idempotent.");
  return { plan, before, after, inserted, createdItems, createdProfiles, ammunitionLinks };
}

export function auditCatalog(catalog: Catalog) {
  const skills = catalog.skills.filter((s) => !s.archivedAt);
  return catalog.profiles.filter((p) => p.profile_record_type === "Weapon").map((p) => {
    const i = catalog.items.find((i) => i.id === p.item_id)!;
    const mappings = catalog.mappings.filter((m) => m.weapon_profile_id === p.id);
    const valid = mappings.filter((m) => m.review_state === "approved" && validateCanonicalSkillPath(Number(m.endpoint_skill_id), skills, catalog.relationships).valid);
    const ammo = catalog.profiles.find((a) => a.item_id === p.ammunition_item_id);
    const ammoItem = catalog.items.find((a) => a.id === p.ammunition_item_id);
    const ammunition = p.damage_source === "Ammunition";
    const supported = isSupportedAmmunitionWeaponType(String(p.weapon_type));
    const missing = supported ? ["capacity_rounds","reload_type","readiness_mode","draw_initiative_cost","ready_initiative_cost","reload_initiative_cost","unload_initiative_cost"].filter((f) => p[f] === null) : p.initiative_cost === null ? ["initiative_cost"] : [];
    const modes = catalog.modes.filter((m) => m.weapon_profile_id === p.id);
    return {
      itemId: i.id, profileId: p.id, name: i.name, weaponType: p.weapon_type,
      runtime: supported ? "supported-ammunition-family" : ammunition ? "unsupported-ammunition-family" : "ordinary-attack-only-special-or-thrown-use-not-certified",
      approvedPaths: valid.map((m) => ({ mappingId: m.id, modeId: m.firing_mode_id, endpoint: m.endpoint_skill_id })),
      defaultGovernanceValid: valid.some((m) => m.firing_mode_id === null),
      proposalDeferred: deferred[i.id] ?? (Object.values(proposals).flat().includes(i.id) || valid.length ? null : "Mechanism / intended-use / governing-path review required."),
      ammunition: ammunition ? { itemId: p.ammunition_item_id, name: ammoItem?.name ?? null, definitionValid: Boolean(ammo && ammo.profile_record_type === "Ammunition" && ammoItem && !ammoItem.archived_at && String(ammo.damage).trim() && Number.isFinite(Number(ammo.damage)) && Number(ammo.damage) >= 0 && ammo.damage_type), appropriateness: p.ammunition_item_id === 163 ? "unresolved-generic-cartridge" : [43,59,147].includes(i.id) ? "missing-link-or-output-override-review" : "catalog-link-not-runtime-certification" } : null,
      missingFields: missing,
      firingModeProblems: isFirearmWeaponType(String(p.weapon_type)) ? modes.length ? modes.filter((m) => m.mechanics_review_required).map((m) => `Mode ${m.id} ${m.name}: mechanics review required`) : ["No firing modes"] : [],
      magazineLinks: catalog.weaponMagazines.filter((m) => m.weapon_profile_id === p.id),
      rulesRequiringReview: /override|control|restrain|incapacitat/i.test(String(p.rules_text)) ? p.rules_text : null,
      gameplayVerified: false,
    };
  });
}
