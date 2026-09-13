import assert from "node:assert/strict";
import type pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { saveMagazineCatalogInTransaction } from "../src/features/items/magazine-catalog-service";
import { digest, readCatalog, type Catalog } from "./weapon-catalog-repair";

export const magazineSpecs = [
  { itemId: 1, capacity: 30, name: "5.56 mm Rifle Magazine (30 rounds)" },
  { itemId: 2, capacity: 30, name: "9x19 mm Carbine Magazine (30 rounds)" },
  { itemId: 3, capacity: 15, name: "9mm Luger Magazine (15 rounds)" },
  { itemId: 108, capacity: 5, name: "Repeating Crossbow Magazine (5 bolts)" },
  { itemId: 61, capacity: 100, name: "Heavy Machine Gun Feed Box (100 rounds)" },
  { itemId: 82, capacity: 100, name: "Machine Gun Feed Box (100 rounds)" },
  { itemId: 130, capacity: 30, name: "Steam Rifle Magazine (30 rounds)" },
  { itemId: 134, capacity: 100, name: "Submachine Gun Drum (100 rounds)" },
  { itemId: 61, capacity: 500, name: "Heavy Machine Gun Belt Can (500 rounds)" },
] as const;

// Internal stores are weapon capacity, not separate swappable inventory items.
// The single-launch defaults resolve contradictory imported 15-round text under Brannan's delegated design decision.
export const internalFeedSpecs = [
  { itemId: 10, capacity: 1 }, { itemId: 16, capacity: 1 }, { itemId: 20, capacity: 1 },
  { itemId: 26, capacity: 2 }, { itemId: 42, capacity: 1 }, { itemId: 43, capacity: 1 },
  { itemId: 54, capacity: 1 }, { itemId: 55, capacity: 1 }, { itemId: 56, capacity: 1 },
  { itemId: 60, capacity: 1 }, { itemId: 63, capacity: 5 }, { itemId: 75, capacity: 6 },
  { itemId: 76, capacity: 1 }, { itemId: 77, capacity: 1 }, { itemId: 87, capacity: 1 },
  { itemId: 109, capacity: 6 }, { itemId: 112, capacity: 6 }, { itemId: 117, capacity: 1 },
  { itemId: 119, capacity: 5 }, { itemId: 123, capacity: 5 }, { itemId: 507, capacity: 1 },
] as const;
const loadingSpecs = [
  ...magazineSpecs.map((s) => ({ ...s, reloadType: "Magazine" })),
  ...internalFeedSpecs.map((s) => ({ ...s, name: "", reloadType: "Single" })),
].filter((s,index,all) => all.findIndex((other) => other.itemId === s.itemId) === index);

type Model = { weaponItemId: number; profileId: number; ammunitionItemId: number; canonicalId: string; name: string; capacity: number; existingItemId: number | null; linkNeeded: boolean };
export type MagazinePlan = { digest: string; models: Model[]; patches: { itemId: number; profileId: number; fields: Record<string, unknown> }[] };

export function magazineReview(catalog: Catalog): Catalog {
  const weapons = new Set<number>(loadingSpecs.map((s) => s.itemId));
  const profiles = catalog.profiles.filter((p) => weapons.has(Number(p.item_id)));
  const ids = new Set([...weapons, ...profiles.map((p) => Number(p.ammunition_item_id))]);
  return { ...catalog, items: catalog.items.filter((i) => ids.has(i.id)), profiles: catalog.profiles.filter((p) => ids.has(Number(p.item_id))),
    modes: [], mappings: [], magazines: [], magazineAmmo: [], weaponMagazines: [], skills: [], relationships: [] };
}

export function planMagazineRepair(current: Catalog, reviewed: Catalog): MagazinePlan {
  const models: Model[] = [];
  const patches: MagazinePlan["patches"] = [];
  for (const spec of loadingSpecs) {
    const weapon = current.items.find((i) => i.id === spec.itemId);
    const profile = current.profiles.find((p) => p.item_id === spec.itemId);
    const oldWeapon = reviewed.items.find((i) => i.id === spec.itemId);
    const oldProfile = reviewed.profiles.find((p) => p.item_id === spec.itemId);
    assert.ok(weapon && oldWeapon && profile && oldProfile && !weapon.archived_at && profile.profile_record_type === "Weapon", `Missing/archived Weapon ${spec.itemId}.`);
    assert.equal(digest(weapon), digest(oldWeapon), `Weapon ${spec.itemId} changed since review.`);
    assert.ok(profile.reload_type === null || profile.reload_type === spec.reloadType, `Weapon ${spec.itemId} has a different authored loading choice; review it explicitly.`);
    const capacity = Number(oldProfile.capacity_rounds ?? spec.capacity);
    assert.ok(Number.isSafeInteger(capacity) && capacity > 0);
    const expected = { ...oldProfile };
    const fields: Record<string, unknown> = {};
    for (const [key,value] of Object.entries({ capacity_rounds: capacity, reload_type: spec.reloadType })) {
      if (oldProfile[key] === null) {
        assert.ok(profile[key] === null || profile[key] === value, `Weapon ${spec.itemId} ${key} changed since review.`);
        expected[key] = profile[key];
        if (profile[key] === null) fields[key] = value;
      }
    }
    expected.updated_at = profile.updated_at;
    assert.equal(digest(profile), digest(expected), `Profile ${profile.id} changed since review.`);
    const ammo = current.items.find((i) => i.id === profile.ammunition_item_id);
    const ammoProfile = current.profiles.find((p) => p.item_id === profile.ammunition_item_id);
    assert.ok(ammo && !ammo.archived_at && ammoProfile?.profile_record_type === "Ammunition" && String(ammoProfile.damage).trim() && Number.isFinite(Number(ammoProfile.damage)) && Number(ammoProfile.damage) >= 0 && ammoProfile.damage_type, `Weapon ${spec.itemId} needs active, usable ammunition.`);
    assert.equal(digest(ammo), digest(reviewed.items.find((i) => i.id === ammo.id)), "Ammunition definition changed since review.");
    assert.equal(digest(ammoProfile), digest(reviewed.profiles.find((p) => p.id === ammoProfile.id)), "Ammunition damage changed since review.");
    if (Object.keys(fields).length) patches.push({ itemId: spec.itemId, profileId: profile.id, fields });
    if (spec.reloadType === "Single") continue;

    for (const modelSpec of magazineSpecs.filter((s) => s.itemId === spec.itemId)) {
    const modelCapacity = modelSpec.capacity === spec.capacity ? capacity : modelSpec.capacity;
    const canonicalId = `MAG-WEAPON-${String(spec.itemId).padStart(4,"0")}${modelSpec.capacity === spec.capacity ? "" : `-${modelSpec.capacity}`}`;
    const ownedModel = current.items.find((i) => i.canonical_id === canonicalId);
    const compatible: Catalog["items"][number] | undefined = current.weaponMagazines.filter((l) => l.weapon_profile_id === profile.id).map((l) => current.items.find((i) => i.id === l.magazine_item_id))
      .find((i) => i && !i.archived_at && current.magazines.some((m) => m.item_id === i.id && m.capacity_rounds === modelCapacity)
        && current.magazineAmmo.some((a) => a.magazine_item_id === i.id && a.ammunition_item_id === ammo.id));
    const existing: Catalog["items"][number] | undefined = ownedModel ?? compatible;
    if (existing) {
      assert.ok(!existing.archived_at && current.magazines.some((m) => m.item_id === existing.id && Number(m.capacity_rounds) > 0)
        && current.magazineAmmo.some((a) => a.magazine_item_id === existing.id && a.ammunition_item_id === ammo.id), `Magazine ${existing.id} needs re-review; do not overwrite it.`);
      if (ownedModel) assert.equal(current.magazines.find((m) => m.item_id === existing.id)!.capacity_rounds, modelCapacity, "Purpose-built magazine capacity changed; review before reuse.");
    }
    const linkNeeded = !existing || !current.weaponMagazines.some((l) => l.weapon_profile_id === profile.id && l.magazine_item_id === existing.id);
    if (linkNeeded) models.push({ weaponItemId: spec.itemId, profileId: profile.id, ammunitionItemId: ammo.id, canonicalId,
      name: modelSpec.name.replace(String(modelSpec.capacity), String(modelCapacity)), capacity: modelCapacity, existingItemId: existing?.id ?? null, linkNeeded });
    }
  }
  return { digest: digest({ catalog: current, loadingSpecs, magazineSpecs }), models, patches };
}

export async function applyMagazineRepair(client: pg.Client, reviewed: Catalog, expectedDigest: string, actorId: string) {
  assert.ok((await client.query("select role from user_role where user_id=$1", [actorId])).rows.some((r) => r.role === "admin"), "An explicitly selected administrator must authorize catalog repair.");
  const before = await readCatalog(client);
  const plan = planMagazineRepair(before, reviewed);
  assert.equal(plan.digest, expectedDigest, "Catalog or repair specifications changed after planning; no writes permitted.");
  for (const p of plan.patches) {
    assert.equal((await client.query("select count(*)::int n from campaign_character_firearm_state where weapon_profile_id=$1", [p.profileId])).rows[0].n, 0,
      `Weapon ${p.itemId} has initialized copies; review its loading transition without altering those copies.`);
  }
  const tx = drizzle(client) as unknown as Parameters<typeof saveMagazineCatalogInTransaction>[0];
  const createdItems: Catalog["items"] = [];
  const links: { weaponItemId: number; weaponProfileId: number; magazineItemId: number; ammunitionItemId: number; capacity: number }[] = [];
  for (const model of plan.models) {
    let modelId = model.existingItemId;
    if (modelId === null) {
      const weaponName = String(before.items.find((i) => i.id === model.weaponItemId)!.name);
      const row = (await client.query(`insert into items(canonical_id,name,catalog_scope,record_type,family,category,description,credits,price_basis,created_by_user_id,source_system,source_external_id)
        values($1,$2,'inventory','Magazine','Ammunition Equipment','Magazine',$3,null,'per magazine',$4,'magazine-catalog-repair-2026-09-13',$5) returning *`,
        [model.canonicalId,model.name,`Purpose-built detachable ammunition container for ${weaponName} (Item ${model.weaponItemId}). Capacity ${model.capacity}. Physical compatibility is limited to explicitly linked weapons. Price and Fill Initiative per Round await authoring.${[61,82].includes(model.weaponItemId) ? " Prepared belt boxes use the game's Magazine workflow; belt links and routing are not separate simulated resources." : model.weaponItemId === 130 ? " Fictional projectile magazine; pressure supply remains a separate G.O.D. ruling." : ""}`,actorId,`${model.weaponItemId}:${model.capacity}`])).rows[0];
      modelId = row.id;
      createdItems.push(JSON.parse(JSON.stringify(row)));
      await saveMagazineCatalogInTransaction(tx, modelId!, { capacityRounds: model.capacity, fillInitiativeCostPerRound: null,
        ammunition: [{ id: model.ammunitionItemId, name: String(before.items.find((i) => i.id === model.ammunitionItemId)!.name) }] });
    }
    assert.ok(modelId !== null);
    const oldLinks = (await client.query("select i.id,i.name from weapon_magazines wm join items i on i.id=wm.magazine_item_id where wm.weapon_profile_id=$1",[model.profileId])).rows;
    await saveMagazineCatalogInTransaction(tx, model.weaponItemId, null, [...oldLinks, { id: modelId, name: model.name }]);
    links.push({ weaponItemId: model.weaponItemId, weaponProfileId: model.profileId, magazineItemId: modelId, ammunitionItemId: model.ammunitionItemId, capacity: model.capacity });
  }
  for (const patch of plan.patches) {
    const fields = Object.entries(patch.fields);
    assert.ok(fields.every(([key]) => ["capacity_rounds", "reload_type"].includes(key)));
    await client.query(`update weapon_profiles set ${fields.map(([key],i) => `${key}=$${i+2}`).join(",")},updated_at=now() where id=$1`, [patch.profileId,...fields.map(([,v]) => v)]);
  }
  const after = await readCatalog(client);
  const expected = structuredClone(before);
  expected.items.push(...createdItems); expected.items.sort((a,b) => a.id-b.id);
  for (const model of links) {
    expected.weaponMagazines.push({ weapon_profile_id: model.weaponProfileId, magazine_item_id: model.magazineItemId });
    if (createdItems.some((i) => i.id === model.magazineItemId)) {
      expected.magazines.push({ item_id: model.magazineItemId, capacity_rounds: model.capacity, fill_initiative_cost_per_round: null });
      expected.magazineAmmo.push({ magazine_item_id: model.magazineItemId, ammunition_item_id: model.ammunitionItemId });
    }
  }
  expected.magazines.sort((a,b) => Number(a.item_id)-Number(b.item_id));
  expected.magazineAmmo.sort((a,b) => Number(a.magazine_item_id)-Number(b.magazine_item_id) || Number(a.ammunition_item_id)-Number(b.ammunition_item_id));
  expected.weaponMagazines.sort((a,b) => Number(a.weapon_profile_id)-Number(b.weapon_profile_id) || Number(a.magazine_item_id)-Number(b.magazine_item_id));
  for (const patch of plan.patches) Object.assign(expected.profiles.find((p) => p.id === patch.profileId)!, patch.fields,
    { updated_at: after.profiles.find((p) => p.id === patch.profileId)!.updated_at });
  assert.equal(digest(after), digest(expected), "Unexpected catalog mutation; roll back.");
  const retry = planMagazineRepair(after, reviewed);
  assert.equal(retry.models.length + retry.patches.length, 0, "Magazine repair is not idempotent.");
  return { before, after, plan, createdItems, links };
}
