import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ammunitionSpecs, auditCatalog, deferred, proposals, type Catalog } from "./weapon-catalog-repair";
import { isFirearmWeaponType, isSupportedAmmunitionWeaponType } from "../src/features/items/firearm-classification";

async function main() {
  const receiptPath = process.argv[2];
  assert.ok(receiptPath && path.resolve(receiptPath).startsWith(path.resolve("artifacts/weapon-catalog-repair") + path.sep) && /^applied-\d+\.json$/.test(path.basename(receiptPath)), "Supply a committed repair receipt from artifacts/weapon-catalog-repair.");
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  const catalog: Catalog = JSON.parse(await readFile("artifacts/weapon-catalog-repair/reviewed-catalog.json", "utf8"));
  catalog.items.push(...receipt.itemsCreated);
  catalog.profiles.push(...receipt.ammunitionProfilesCreated);
  catalog.mappings.push(...receipt.additions.map((a: { record: Catalog["mappings"][number] }) => a.record));
  for (const row of receipt.profileChanges) Object.assign(catalog.profiles.find((p) => p.id === row.profileId)!, row.after);
  for (const row of receipt.ammunitionLinks) catalog.profiles.find((p) => p.id === row.weaponProfileId)!.ammunition_item_id = row.ammunitionItemId;
  const audit = auditCatalog(catalog);
  const name = (id: unknown) => catalog.items.find((i) => i.id === id)?.name ?? id;
  const cell = (value: unknown) => value === null || value === undefined || value === "" ? "**TBD**" : String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
  const table = (headers: string[], rows: unknown[][]) => ["| " + headers.join(" | ") + " |", "| " + headers.map(() => "---").join(" | ") + " |", ...rows.map((r) => "| " + r.map(cell).join(" | ") + " |")].join("\n");
  const weapons = catalog.profiles.filter((p) => p.profile_record_type === "Weapon").sort((a,b) => Number(a.item_id)-Number(b.item_id));
  const ranged = weapons.filter((p) => isSupportedAmmunitionWeaponType(String(p.weapon_type)));
  const other = weapons.filter((p) => !isSupportedAmmunitionWeaponType(String(p.weapon_type)));
  const lines = [
    "# Weapon catalog repair and correction list",
    "",
    `Recorded ${receipt.verifiedAt}. Database: **localhost:5432/serrian_tide_dev**. Production was not accessed.`,
    "",
    "## What changed",
    "",
    "- Added 105 approved default Skill mappings, validated through the current exact canonical ancestry. Existing six mappings are unchanged.",
    "- Filled capacity, loading type and confirmed preparation cost on six bow/crossbow profiles: 18 previously blank fields. Longbow's newer authored values, including preparation cost 2, are preserved.",
    "- Created 12 weapon-specific ammunition Items and 12 Ammunition profiles; changed the corresponding 12 weapon ammunition links away from generic Item 163. All retain the previous 8 Piercing damage and 1-credit price. These are user-authorized catalog identities, not asserted real-world calibers or a damage rebalance.",
    "- No magazine Items created. No costs guessed. No Skill definitions, allocations, owned stock, loaded copies, encounters or history changed. Full backup decoded before the transaction; protected rows checked by count and digest.",
    `- ${audit.filter((a) => a.defaultGovernanceValid).length} of 204 weapons now have approved valid default paths; ${audit.filter((a) => !a.defaultGovernanceValid).length} still need review. This is **not** a claim that 111 weapons are gameplay-ready.`,
    "",
    `Exact receipt: [${path.basename(receiptPath)}](../../${receiptPath.replaceAll("\\", "/")}). It records every inserted mapping ID, before/after profile values, created Item/profile IDs and preservation checks.`,
    `Backup: \`${receipt.backup.path}\`; SHA-256 \`${receipt.backup.sha256}\`. Full archive decode passed; a full restore rehearsal was not performed.`,
    "",
    "## Fill In These Values",
    "",
    "**TBD means unconfirmed, not zero.** Edit the Equipment catalog in Heavens > Equipment > Weapon / Ammunition. Keep this checklist as the decision record. Listed legacy values below are evidence for your review, not automatically approved rules. A sole firing mode does not need a mode-change cost. Magazine fill is separate from weapon reload/swap.",
    "",
    "### Firearms, Bows and Crossbows",
    "",
    "Bow shot cost includes nock/draw/release; Crossbow release and firearm trigger cost are 1. Draw means drawing a stowed weapon, not drawing a bowstring. Readiness choices are draw-is-ready or separate-ready-action. Single loading means inserting rounds individually, not capacity one.",
    "",
    table(["Item / Profile", "Weapon", "Capacity", "Load Type", "Readiness", "Draw", "Ready", "Load / Nock-Draw-Shoot", "Unload", "Change Mode", "Legacy Capacity / Reload"], ranged.map((p) => [ `${p.item_id} / ${p.id}`, name(p.item_id), p.capacity_rounds, p.reload_type, p.readiness_mode, p.draw_initiative_cost, p.ready_initiative_cost, p.reload_initiative_cost, p.unload_initiative_cost, catalog.modes.filter((m) => m.weapon_profile_id === p.id).length > 1 ? p.firing_mode_change_initiative_cost : "N/A: sole mode", `${p.capacity || "blank"} / ${p.reload_initiative || "blank"}` ])),
    "",
    "### Firearm Mode Costs",
    "",
    "Complete every TBD cell. Cadence choices are per-trigger or sustained-per-initiative; rounds are whole cartridges. Cycling and recoil costs accept decimals. Bow/crossbow Single mode uses its dedicated one-projectile runtime timing and does not require these firearm mechanics; existing mode identities and fields were not rewritten.",
    "",
    table(["Item", "Weapon", "Mode ID / Name", "Cycling", "Recoil Reset", "Cadence", "Rounds / Cadence"], ranged.filter((p) => isFirearmWeaponType(String(p.weapon_type))).flatMap((p) => catalog.modes.filter((m) => m.weapon_profile_id === p.id).map((m) => [p.item_id, name(p.item_id), `${m.id} / ${m.name}`, m.base_cycling_initiative_cost, m.base_recoil_reset_initiative_cost, m.delivery_cadence, m.rounds_per_cadence]))),
    "",
    "### Other Attack Costs and Family Review",
    "",
    "An Initiative cost alone does not implement throwing/recovery, explosives/area effects, control, energy-charge delivery, or other special mechanics. Ordinary melee attacks use the weapon's positive structured attack cost. Every weapon outside the supported firearm/bow/crossbow family is listed here so no missing cost disappears from the audit.",
    "",
    table(["Item / Profile", "Weapon", "Attack Initiative", "Approved Default Skill", "Open Review"], other.map((p) => { const a = audit.find((a) => a.profileId === p.id)!; return [`${p.item_id} / ${p.id}`,name(p.item_id),p.initiative_cost,a.approvedPaths.filter((m) => m.modeId === null).map((m) => `${m.endpoint}: ${catalog.skills.find((s) => s.id === m.endpoint)?.name}`).join(", "), a.proposalDeferred ?? (p.damage_source === "Ammunition" ? "Unsupported ammunition delivery" : "Any special/control/energy effects remain separate rulings")]; })),
    "",
    "## Ammunition Authored",
    "",
    "These definitions belong in Inventory with an Ammunition profile. Owned generic rounds were not converted, exchanged or granted. New inventory must be acquired normally. None of the affected guns had initialized copies at application; the repair refuses a changed link if one has appeared.",
    "",
    table(["Weapon Item", "Weapon", "New Ammo Item / Profile", "Ammunition", "Damage", "Credits"], receipt.ammunitionLinks.map((r: { weaponItemId: number; ammunitionItemId: number }) => { const p = catalog.profiles.find((p) => p.item_id === r.ammunitionItemId)!; return [r.weaponItemId,name(r.weaponItemId),`${r.ammunitionItemId} / ${p.id}`,name(r.ammunitionItemId),`${p.damage} ${p.damage_type}`,catalog.items.find((i) => i.id === r.ammunitionItemId)!.credits]; })),
    "",
    ...Object.entries(ammunitionSpecs).filter(([id]) => [56,130,507].includes(Number(id))).map(([id,s]) => `- Item ${id}: ${s.description} The retained damage is still a balance-review value, not approval of additional effects.`),
    "- Harpoon Gun 59 still has no ammunition link. Its launcher mechanism and exact projectile specification remain separate from Whaling Gun 507; do not infer interchangeability.",
    "- Flintlock Pistol 43 links to Musket Ball 166 (10 Piercing), while its prose says 6. The current firearm attack reads linked ammunition damage; it does not execute this prose override. Choose a dedicated 6-damage load or an explicit supported output-override implementation before treating the prose as active.",
    "",
    "## Magazines and Loading Decisions",
    "",
    table(["Magazine Item", "Model", "Capacity", "Fill Initiative / Round", "Ammo Items", "Physical Weapon Profiles"], catalog.magazines.map((m) => [m.item_id,name(m.item_id),m.capacity_rounds,m.fill_initiative_cost_per_round,catalog.magazineAmmo.filter((a) => a.magazine_item_id === m.item_id).map((a) => a.ammunition_item_id).join(", "),catalog.weaponMagazines.filter((w) => w.magazine_item_id === m.item_id).map((w) => w.weapon_profile_id).join(", ")])),
    "",
    "- **Confirmed revolver decision:** .357 Revolver 112 retains six-round capacity and Single loading. Insert individual rounds; firing does not require a reload after each shot. Existing draw 2, ready 2, reload 4, unload 2 and Single mode 1/1 remain unchanged. Drum 1022 stays in the catalog with explicit fill cost 0, but is not enabled as a swappable magazine.",
    "- Rifle 1, Carbine 2 and Luger 3 need exact detachable models. Provide each model's capacity, price, fill cost and weapon fit; existing ammo links are 155,156,156 respectively. Model 1021 remains five rounds, with no confirmed fit; it was not resized to 30 or linked by caliber alone.",
    "- Repeating Crossbow 108 uses Magazine, capacity 5, swap cost 2. Provide a five-bolt model's price and fill cost; no owned magazine is manufactured. Its exact physical link and Bolt 159 compatibility can then be authored together.",
    "- Hand Cannon 54 says single-shot but legacy capacity/mode says 15/Semi-Auto. Cannon 16 and Hand Mortar 56 also have suspicious 15/Semi-Auto entries. Confirm capacity and mechanism before filling structured fields.",
    "- Confirm internal, detachable, belt or other feed for remaining guns. Current runtime supports Single insertion and exact detachable magazines, not an automatically inferred belt/pressure/energy system.",
    "",
    "## Deferred Proposed Mappings",
    "",
    table(["Item", "Weapon", "Proposed Skill", "Why Deferred"], Object.entries(deferred).map(([id,reason]) => [id,name(Number(id)),Object.entries(proposals).find(([,ids]) => ids.includes(Number(id)))?.[0],reason])),
    "",
    "The other 71 originally unassigned unusual/control/tool/energy/explosive records remain intentionally unassigned. Their complete item-level status is in the receipt's catalogAudit and the cost/review tables above. No blanket CQB paths or thrown-as-melee approvals were added.",
    "",
    "## Validation Boundary",
    "",
    "The repair test loads a sanitized copy of the reviewed catalog into a disposable migrated database, applies all repairs, reads every new mapping through the authoritative governance service, checks exact ancestry/mode inheritance, retries with zero changes, rejects stale/unauthorized requests, and rolls back a simulated mid-repair failure. Broader service results are recorded in COMBAT-RESUME.md after execution.",
    "",
    "These checks do not certify a live weapon with TBD fields as usable. Gameplay fixtures and human acceptance are distinct from catalog authoring. No shared DEV encounter was driven or rewritten for verification.",
    "",
    "## Repeatable Commands",
    "",
    "```powershell",
    "node --import tsx scripts/repair-weapon-catalog-dev.ts --plan",
    "node --import tsx scripts/repair-weapon-catalog-dev.ts --apply <reviewed-plan-digest> <administrator-user-id>",
    "node --import tsx --test scripts/weapon-catalog-repair.test.ts",
    "$env:COMBAT_COMPLETION_CASE_FILTER='weapon-catalog-repair'",
    "npm.cmd run validate:combat-completion-db",
    "```",
    "",
    "The reviewed snapshot is immutable and capture uses exclusive creation. Re-running a completed repair is a no-op. Later human catalog changes require re-review, never restoring the old snapshot. No schema migration is introduced; the existing 50 migration hashes were verified.",
    "",
  ];
  await writeFile("docs/reports/weapon-catalog-corrections-2026-09-13.md", lines.join("\n"));
  console.log("Wrote docs/reports/weapon-catalog-corrections-2026-09-13.md");
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
