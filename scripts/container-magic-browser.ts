import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import type { Page } from "playwright-core";
import { pool } from "@/db";

export async function runContainerMagicBrowser({ page, player, base, f, backpackName, until }: {
  page: Page; player: Page; base: string; backpackName: string;
  f: { heroId: number; godId: string; campaignId: number; encounterId: number; backpackId: number; pouchId: number; a: number; pouch: number; exact: number; exactItemId: number };
  until: (check: () => Promise<boolean>, label: string) => Promise<void>;
}) {
  const artifacts = "artifacts/container-pass-three"; await mkdir(artifacts, { recursive: true });
  await pool.query("update campaign_session_encounter set status='completed',completed_at=now() where id=$1", [f.encounterId]);
  await pool.query("update items set is_magical=true where id=$1", [f.exactItemId]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  async function edit(name: string) {
    await page.goto(`${base}/heavens/equipment`); await page.locator("#item-search").fill(name);
    await page.locator(".skill-library__row").filter({ hasText: name }).click();
  }
  async function save(name: string) {
    await page.getByRole("button", { name: "Save Item", exact: true }).click(); await page.getByText(`${name} was saved.`, { exact: true }).waitFor();
  }
  const select = (label: string, value: string) => page.getByLabel(label, { exact: true }).selectOption(value);
  await edit(backpackName);
  await select("Weight capacity mode", "unlimited"); await select("Volume capacity mode", "unlimited");
  assert.equal(await page.getByLabel("Contents weight capacity (lb)", { exact: true }).count(), 0);
  assert.equal(await page.getByLabel("Internal volume capacity (L)", { exact: true }).count(), 0);
  await select("Contained weight behavior", "contents-weightless"); await select("Magical content restriction", "mundane-only");
  await page.getByLabel("Allow nested containers", { exact: true }).check(); await page.getByLabel("Allowed content categories", { exact: true }).fill(""); await page.getByLabel("Allowed content record types", { exact: true }).fill("");
  await save(backpackName); await edit(backpackName);
  assert.equal(await page.getByLabel("Magical content restriction", { exact: true }).inputValue(), "mundane-only");
  const inventory = async (target: Page, god = true) => { await target.goto(`${base}/${god ? "heavens" : "realms"}/characters/${f.heroId}`); await target.locator("#character-tab-equipment").click(); await target.getByText(/Carried weight:/).waitFor(); };
  const row = (target: Page, copy: number) => target.locator(".character-owned-equipment__row").filter({ has: target.locator("small").filter({ hasText: new RegExp(`^Copy #${copy}(?:\\s|$)`) }) });
  async function move(target: Page, copy: number, destination: number | null) {
    const entry = row(target, copy); await entry.getByRole("button", { name: "Move", exact: true }).click();
    await entry.getByLabel("Destination", { exact: true }).selectOption(String(destination ?? "loose")); await entry.getByRole("button", { name: "Move Item", exact: true }).click();
  }
  await inventory(page); await move(page, f.exact, f.a); await page.getByRole("alert").filter({ hasText: /mundane Items only/ }).waitFor();
  assert.equal((await pool.query("select * from inventory_instance_location where instance_id=$1", [f.exact])).rowCount, 0);
  await edit(backpackName); await select("Magical content restriction", "any"); await save(backpackName);
  const pouchName = `Time Pouch ${f.heroId}`;
  await pool.query("update items set name=$1 where id=$2", [pouchName, f.pouchId]);
  await edit(pouchName); await select("Weight capacity mode", "unlimited"); await select("Volume capacity mode", "unlimited");
  await select("Contained weight behavior", "contents-weightless"); await select("Time inside", "suspended"); await page.getByLabel("Living contents allowed", { exact: true }).check(); await save(pouchName);
  await inventory(page); await move(page, f.exact, f.a);
  await until(async () => (await pool.query("select container_instance_id from inventory_instance_location where instance_id=$1", [f.exact])).rows[0]?.container_instance_id === f.a, "unrestricted magical move");
  const contents = row(page, f.a).locator("details.inventory-container-contents").first(); await contents.locator(":scope > summary").click();
  await contents.getByText(/Loaded container weight: 3 lb/).waitFor();
  const nested = contents.locator("details.inventory-container-contents"); await nested.locator(":scope > summary").click(); await nested.getByText(/Time inside: suspended/).waitFor();
  await page.screenshot({ path: `${artifacts}/nested-magic-desktop.png`, fullPage: true });
  await inventory(player, false); await move(player, f.exact, null);
  await until(async () => (await pool.query("select * from inventory_instance_location where instance_id=$1", [f.exact])).rowCount === 0, "Player magical inventory move");
  await player.reload(); await player.locator("#character-tab-equipment").click(); await player.getByText(/Carried weight:/).waitFor();
  await player.setViewportSize({ width: 390, height: 844 }); assert.ok(await player.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await player.screenshot({ path: `${artifacts}/player-mobile.png`, fullPage: true });

  const flaskName = `Source Flask ${f.heroId}`;
  const flaskId = (await pool.query("insert into items(canonical_id,name,catalog_scope,equipment_group,record_type,family,category,price_basis,weight,weight_unit,volume_l,longest_dimension_cm,created_by_user_id) values($1,$2,'equipment','general','Item','Fixture','Fixture','unit',1,'lb',1,10,$3) returning id", [`MAGIC-${crypto.randomUUID()}`.toUpperCase(), flaskName, f.godId])).rows[0].id;
  await edit(flaskName); await page.getByLabel("Is Container", { exact: false }).check();
  await select("Container classification", "flask"); await select("Weight capacity mode", "unlimited"); await select("Volume capacity mode", "unlimited");
  await select("Contained weight behavior", "fixed");
  await page.getByRole("button", { name: "Save Item", exact: true }).click(); await page.getByText("Author a fixed external weight.", { exact: true }).waitFor();
  await page.getByLabel("Fixed external weight (lb)", { exact: true }).fill("2"); await page.getByLabel("Bulk substance source", { exact: true }).check(); await select("Source mode", "infinite");
  await page.getByLabel("Substance identity", { exact: true }).fill("water"); await page.getByLabel("Substance name", { exact: true }).fill("Water");
  await save(flaskName); await edit(flaskName); assert.equal(await page.getByLabel("Source mode", { exact: true }).inputValue(), "infinite");
  assert.equal(await page.getByLabel("Substance name", { exact: true }).inputValue(), "Water"); assert.equal(await page.getByLabel("Maximum substance quantity", { exact: true }).count(), 0);
  await page.setViewportSize({ width: 390, height: 844 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: `${artifacts}/source-authoring-mobile.png`, fullPage: true });
  const copyId = (await pool.query("insert into campaign_character_item_instance(character_id,item_id,current_charges,unit_cost_credits) values($1,$2,0,0) returning id", [f.heroId, flaskId])).rows[0].id;
  await inventory(player, false); const flask = row(player, copyId); await flask.getByText(/Substance: Water/).click();
  await flask.getByLabel("Substance quantity (L)", { exact: true }).fill("20"); await flask.getByRole("button", { name: "Apply substance change" }).click(); await player.getByRole("status").filter({ hasText: "Drew 20 L Water." }).waitFor();
  assert.equal((await pool.query("select * from inventory_container_substance where instance_id=$1", [copyId])).rowCount, 0);
  await player.reload(); await player.locator("#character-tab-equipment").click(); await row(player, copyId).getByText(/Substance: Water.*Infinite source/).waitFor();
  assert.ok(await player.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await player.screenshot({ path: `${artifacts}/infinite-source-mobile.png`, fullPage: true });
  console.log("PASS: magical authoring, client validation, restrictions, nested magic, suspended time, Player/G.O.D. movement, infinite source draw, reload and 390px layout");
}
