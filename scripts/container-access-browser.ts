import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import type { Page } from "playwright-core";
import { pool } from "@/db";

export async function runContainerAccessBrowser({ page, player, base, f, backpackName, until }: {
  page: Page; player: Page; base: string; backpackName: string;
  f: { heroId: number; godId: string; campaignId: number; encounterId: number; backpackId: number; pouchId: number; a: number; pouch: number; exact: number; exactItemId: number; mag: number; gun: number };
  until: (check: () => Promise<boolean>, label: string) => Promise<void>;
}) {
  const artifacts = "artifacts/container-pass-four"; await mkdir(artifacts, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 }); await player.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/heavens/equipment`); await page.locator("#item-search").fill(backpackName); await page.locator(".skill-library__row").filter({ hasText: backpackName }).click();
  await page.getByLabel("Container closure", { exact: true }).selectOption("open-close");
  await page.getByLabel("Contained weight behavior", { exact: true }).selectOption("normal");
  for (const [label, value] of [["Retrieve Initiative", "2"], ["Stow Initiative", "2"], ["Open Initiative", "0"], ["Close Initiative", "0"]]) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("button", { name: "Save Item", exact: true }).click(); await page.getByText(`${backpackName} was saved.`, { exact: true }).waitFor();
  await page.reload(); await page.locator("#item-search").fill(backpackName); await page.locator(".skill-library__row").filter({ hasText: backpackName }).click();
  assert.equal(await page.getByLabel("Retrieve Initiative", { exact: true }).inputValue(), "2"); assert.equal(await page.getByLabel("Open Initiative", { exact: true }).inputValue(), "0");
  const inventory = async (target: Page, god = false) => { await target.goto(`${base}/${god ? "heavens" : "realms"}/characters/${f.heroId}`); await target.locator("#character-tab-equipment").click(); await target.getByText(/Carried weight:/).waitFor(); };
  const row = (target: Page, id: number) => target.locator(".character-owned-equipment__row").filter({ has: target.locator("small").filter({ hasText: new RegExp(`^Copy #${id}(?:\\s|$)`) }) });
  const parent = async (id: number) => (await pool.query("select container_instance_id from inventory_instance_location where instance_id=$1", [id])).rows[0]?.container_instance_id ?? null;
  async function move(id: number, destination: number | null, succeeds = true) {
    const entry = row(player, id); const button = entry.getByRole("button", { name: "Move", exact: true }); if (await button.count()) await button.click();
    await entry.getByLabel("Destination", { exact: true }).selectOption(String(destination ?? "loose")); await entry.getByRole("button", { name: "Move Item", exact: true }).click();
    if (succeeds) { await until(async () => await parent(id) === destination, "Player inventory move"); await player.getByRole("status").filter({ hasText: "Inventory location saved." }).waitFor(); }
  }
  async function custody(target: Page, operation: string, reason = "") {
    const entry = row(target, f.a), details = entry.locator(".inventory-custody > details"); if ((await details.getAttribute("open")) === null) await details.locator(":scope > summary").click();
    await entry.getByLabel("Inventory operation", { exact: true }).selectOption(operation);
    if (reason) await entry.getByLabel("Inventory ruling reason", { exact: true }).fill(reason);
    await entry.getByRole("button", { name: "Apply inventory operation", exact: true }).click();
    await target.getByRole("status").filter({ hasText: "Inventory custody/access saved." }).waitFor();
    await until(() => entry.getByRole("button", { name: "Apply inventory operation", exact: true }).isEnabled(), "custody controls refreshed");
  }
  await inventory(player); await move(f.exact, f.a, false); await player.getByRole("alert").filter({ hasText: /Open.*first/ }).waitFor();
  await custody(player, "open"); await move(f.exact, f.a); await move(f.exact, null); await move(f.exact, f.a);
  await custody(player, "close"); await move(f.exact, null, false); await player.getByRole("alert").filter({ hasText: /Open.*first/ }).waitFor(); await custody(player, "open");
  assert.match(await row(player, f.pouch).innerText(), new RegExp(`#${f.a}`));
  const weight = await player.locator(".inventory-physical-summary strong").innerText();
  await custody(player, "drop"); assert.notEqual(await player.locator(".inventory-physical-summary strong").innerText(), weight);
  await row(player, f.exact).getByText(/Unavailable:.*dropped/).waitFor(); assert.equal(await parent(f.exact), f.a);
  await custody(player, "recover"); assert.equal(await player.locator(".inventory-physical-summary strong").innerText(), weight);
  // Prepare a loaded attached assembly as fixture data; custody operations below must preserve it exactly.
  const ammoId = (await pool.query("select ammunition_item_id from weapon_profiles where item_id=(select item_id from campaign_character_item_instance where id=$1)", [f.gun])).rows[0].ammunition_item_id;
  await pool.query("update campaign_character_item_instance set loaded_rounds=3,loaded_ammunition_item_id=$2 where id=$1", [f.mag, ammoId]);
  await pool.query("insert into firearm_magazine_attachment(weapon_instance_id,magazine_instance_id,character_id,campaign_id,weapon_item_id,weapon_profile_id,magazine_item_id) select s.item_instance_id,$2,s.character_id,s.campaign_id,s.item_id,s.weapon_profile_id,m.item_id from campaign_character_firearm_state s cross join campaign_character_item_instance m where s.item_instance_id=$1 and m.id=$2", [f.gun, f.mag]);
  await inventory(player); await move(f.gun, f.a);
  const specialized = async () => ({ firearm: (await pool.query("select * from campaign_character_firearm_state where item_instance_id=$1", [f.gun])).rows,
    magazine: (await pool.query("select * from campaign_character_item_instance where id=$1", [f.mag])).rows, attachment: (await pool.query("select * from firearm_magazine_attachment where weapon_instance_id=$1", [f.gun])).rows });
  const loadedBefore = await specialized(); await custody(player, "drop"); await custody(player, "recover"); assert.deepEqual(await specialized(), loadedBefore);
  await inventory(page, true); await custody(page, "stolen", "Backpack taken intact in the Warehouse");
  await inventory(player); await row(player, f.gun).getByText(/Unavailable:.*stolen/).waitFor(); await row(player, f.pouch).getByText(/Unavailable:.*stolen/).waitFor();
  await player.screenshot({ path: `${artifacts}/stolen-contents.png`, fullPage: true });
  await inventory(page, true); await custody(page, "recover", "Recovered intact"); await inventory(player); assert.deepEqual(await specialized(), loadedBefore);
  console.log("PASS: authored access fields, Player stow/retrieve, closed errors, nesting, drop/recovery weight, stolen contents, magical pouch and loaded assembly preservation");
  await pool.query("update campaign_session_encounter set status='active',completed_at=null where id=$1", [f.encounterId]);
  await pool.query("update campaign_session_encounter_initiative_participant set participation_status='passed' where encounter_id=$1 and character_id<>$2", [f.encounterId, f.heroId]);
  const screen = (target: Page) => target.locator("[data-combat-screen]");
  async function combat(target: Page, god = false) {
    await target.goto(`${base}/${god ? "heavens" : "realms"}/tabletop?combat=${f.encounterId}${god ? "" : `&character=${f.heroId}`}`);
    await screen(target).waitFor(); await screen(target).getByText("Live", { exact: true }).waitFor();
    await until(() => screen(target).getByRole("button", { name: "Refresh", exact: true }).isEnabled(), "combat loaded");
  }
  await combat(page, true); if (await screen(page).getByRole("checkbox", { name: "Automatic flow", exact: true }).count()) await screen(page).getByRole("checkbox", { name: "Automatic flow", exact: true }).uncheck();
  await combat(player); await screen(player).getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: "Item", exact: true }).click();
  const handling = player.locator(".inventory-combat-handling"); await handling.locator(":scope > summary").click(); await handling.getByLabel("Inventory to handle", { exact: true }).selectOption(`copy:${f.exact}`);
  await handling.getByRole("button", { name: "Start handling", exact: true }).click();
  await until(async () => (await pool.query("select id from campaign_session_encounter_action_declaration where encounter_id=$1 and draft_json->>'actionKind'='combat-inventory'", [f.encounterId])).rowCount! > 0, "combat retrieve committed");
  assert.equal(await parent(f.exact), f.a); await handling.getByRole("status").filter({ hasText: /Handling #.*pending.*2 Initiative remaining/ }).waitFor();
  await player.screenshot({ path: `${artifacts}/pending-retrieval.png`, fullPage: true });
  async function advance(destination: number | null) {
    await screen(page).getByRole("button", { name: "Refresh", exact: true }).click();
    await until(() => screen(page).getByRole("button", { name: "Advance combat", exact: true }).isEnabled(), "handling timing advance");
    await screen(page).getByRole("button", { name: "Advance combat", exact: true }).click();
    await until(async () => await parent(f.exact) === destination, "combat handling completed");
    await handling.getByRole("button", { name: "Refresh handling", exact: true }).click();
  }
  await advance(null); await handling.getByRole("status").filter({ hasText: /Handling #.*resolved/ }).waitFor();
  await pool.query("update container_profiles set stow_initiative_cost=null where item_id=$1", [f.backpackId]);
  await handling.getByRole("button", { name: "Refresh handling", exact: true }).click(); await handling.getByLabel("Handling operation", { exact: true }).selectOption("stow");
  await handling.getByLabel("Inventory to handle", { exact: true }).selectOption(`copy:${f.exact}`); await handling.getByLabel("Stow destination", { exact: true }).selectOption(String(f.a));
  await handling.getByRole("button", { name: "Request handling cost", exact: true }).click(); await handling.getByText("Cost requested from G.O.D.", { exact: true }).waitFor();
  await screen(page).getByRole("region", { name: "Combatants", exact: true }).getByRole("button", { name: /^Build 10 Hero/ }).click();
  await screen(page).getByText("Player source rulings", { exact: true }).click(); await screen(page).getByRole("navigation", { name: "Player source rulings" }).getByRole("button", { name: "Item", exact: true }).click();
  const godHandling = page.locator(".inventory-combat-handling"); await godHandling.locator(":scope > summary").click();
  await godHandling.getByLabel("Handling Initiative ruling", { exact: true }).fill("2"); await godHandling.getByLabel("Handling ruling reason", { exact: true }).fill("G.O.D. rules two Initiative to stow this exact copy");
  await godHandling.getByRole("button", { name: /Approve handling cost/ }).click();
  await handling.getByRole("button", { name: "Refresh handling", exact: true }).click(); await handling.getByRole("button", { name: /Start approved handling/ }).click();
  await until(async () => (await pool.query("select count(*)::int n from campaign_session_encounter_action_declaration where encounter_id=$1 and draft_json->>'actionKind'='combat-inventory'", [f.encounterId])).rows[0].n === 2, "approved combat stow");
  await advance(f.a); assert.deepEqual(await specialized(), loadedBefore);
  await until(async () => (await handling.getByRole("status").filter({ hasText: /Handling #.*resolved/ }).count()) === 2, "both completed actions visible");
  await player.setViewportSize({ width: 390, height: 844 }); assert.ok(await player.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await player.screenshot({ path: `${artifacts}/combat-mobile.png`, fullPage: true });
  console.log("PASS: real combat retrieve, Initiative pending/completion, G.O.D. unresolved-cost approval, combat stow and 390px mobile view");
}
