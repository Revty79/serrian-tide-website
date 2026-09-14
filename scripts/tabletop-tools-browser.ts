import assert from "node:assert/strict";
import path from "node:path";
import type { Browser } from "playwright-core";
import type pg from "pg";
import type { tabletopToolsFixture } from "./fixtures/tabletop-tools-fixture";
import { SCREEN_PASSWORD } from "./fixtures/combat-screens-browser-fixture";

export async function runTabletopToolsBrowser(browser: Browser, base: string, pool: pg.Pool, f: Awaited<ReturnType<typeof tabletopToolsFixture>>, artifacts: string) {
  const player = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const god = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  try {
  for (const page of [player, god]) {
    page.setDefaultTimeout(45_000);
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  }
  async function eventually(check: () => Promise<boolean>, message: string) {
    for (let i = 0; i < 180; i++) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 200)); }
    throw new Error(message);
  }
  async function scalar(sql: string, params: unknown[]) { return Object.values((await pool.query(sql, params)).rows[0] ?? {})[0]; }
  for (const [page, id] of [[player, f.playerId], [god, f.godId]] as const) {
    assert.equal((await page.request.post(`${base}/api/auth/sign-in/email`, { headers: { Origin: base }, data: { email: `${id}@example.invalid`, password: SCREEN_PASSWORD } })).status(), 200);
  }
  await player.goto(`${base}/realms/tabletop?character=${f.heroId}&tab=equipment`);
  const equipment = player.getByRole("region", { name: "Equipment State", exact: true });
  await equipment.getByRole("button", { name: "Increase Worn Travel Coat", exact: true }).click();
  await eventually(async () => await scalar("select quantity from campaign_character_item_equipment_state where character_id=$1 and item_id=$2 and state='worn'", [f.heroId, f.coat.id]) === 1, "Coat did not become worn");
  await equipment.getByRole("button", { name: "Increase Worn Practice Armor", exact: true }).click();
  await eventually(async () => await scalar("select quantity from campaign_character_item_equipment_state where character_id=$1 and item_id=$2 and state='worn'", [f.heroId, f.armor.id]) === 1, "Armor did not become worn");
  await equipment.getByRole("button", { name: "Decrease Worn Travel Coat", exact: true }).click();
  await eventually(async () => Number(await scalar("select quantity from campaign_character_item_equipment_state where character_id=$1 and item_id=$2 and state='worn'", [f.heroId, f.coat.id]) ?? 0) === 0, "Coat did not come off");
  const magazines = player.getByRole("region", { name: "Magazine inventory", exact: true });
  await magazines.getByRole("button", { name: "Fill to capacity", exact: true }).click();
  await eventually(async () => await scalar("select loaded_rounds from campaign_character_item_instance where id=$1", [f.magazineCopy.id]) === 6, "Magazine did not fill");
  const firearm = player.getByRole("region", { name: "Firearm equipment setup", exact: true });
  await eventually(async () => /6\/6/.test(await firearm.getByLabel("Prepared magazine").innerText()), "Weapon did not receive updated magazine contents");
  await firearm.getByLabel("Prepared magazine").selectOption(String(f.magazineCopy.id));
  await firearm.getByRole("button", { name: "Attach magazine", exact: true }).click();
  await eventually(async () => await scalar("select magazine_instance_id from firearm_magazine_attachment where weapon_instance_id=$1", [f.firearm.id]) === f.magazineCopy.id, "Magazine did not attach");
  await eventually(async () => magazines.getByRole("button", { name: "Empty magazine", exact: true }).isDisabled(), "Attached magazine remained editable");
  await firearm.getByText("Next: Loaded and ready.", { exact: true }).waitFor();
  assert.equal(await firearm.getByRole("button", { name: "Ready firearm", exact: true }).count(), 0);
  for (const width of [1440, 390, 320]) {
    await player.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    assert.equal(await player.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, `Equipment overflow at ${width}`);
    await player.evaluate(() => window.scrollTo(0, 0));
    await player.screenshot({ path: path.join(artifacts, `equipment-tools-${width}.png`), fullPage: true, caret: "initial" });
  }
  await firearm.getByRole("button", { name: "Remove magazine", exact: true }).click();
  await eventually(async () => magazines.getByRole("button", { name: "Empty magazine", exact: true }).isEnabled(), "Detached magazine did not become editable");
  await magazines.getByRole("button", { name: "Empty magazine", exact: true }).click();
  await eventually(async () => await scalar("select quantity from campaign_character_item where character_id=$1 and item_id=$2", [f.heroId, f.ammoId]) === 18, "Magazine rounds were not conserved");
  const potion = player.locator("article").filter({ has: player.getByRole("heading", { name: "Healing Draught", exact: true }) });
  await potion.getByRole("button", { name: "Drink", exact: true }).click();
  await player.getByRole("dialog").getByRole("button", { name: "Confirm Drink", exact: true }).click();
  await player.getByRole("dialog").getByRole("button", { name: "Done", exact: true }).click();
  assert.equal(await scalar("select quantity from campaign_character_item where character_id=$1 and item_id=$2", [f.heroId, f.potion.id]), 2);

  await god.goto(`${base}/heavens/tabletop?campaign=${f.campaignId}&session=${f.sessionId}&workspace=requests`);
  await player.getByRole("tab", { name: "Spells", exact: true }).click();
  await player.getByRole("button", { name: "Request Wayfinder Passage", exact: true }).click();
  const cast = player.getByRole("dialog");
  await cast.getByLabel("Intent / circumstances").fill("Cross to the far landing unseen.");
  await cast.getByRole("button", { name: "Request G.O.D. ruling", exact: true }).click();
  await cast.waitFor({ state: "hidden" });
  await player.getByRole("tab", { name: /^Alerts/ }).click();
  const requestId = Number(await scalar("select id from tabletop_source_use_request where character_id=$1 order by id desc limit 1", [f.heroId]));
  assert.ok(requestId > 0);
  const godRequest = god.locator("article").filter({ has: god.locator(`#source-use-title-${requestId}`) });
  await godRequest.waitFor();
  const ruling = "The passage reaches the far landing without alerting the guards.";
  await godRequest.getByLabel(`G.O.D. ruling for request #${requestId}`).fill(ruling);
  assert.equal(Number(await scalar("select mana_spent from campaign_character_active_mana where character_id=$1", [f.heroId]) ?? 0), 0);
  await godRequest.getByRole("button", { name: "Approve", exact: true }).click();
  const playerRequest = player.locator("article").filter({ has: player.locator(`#source-use-title-${requestId}`) });
  await playerRequest.getByRole("button", { name: "Confirm use", exact: true }).waitFor();
  assert.equal(Number(await scalar("select mana_spent from campaign_character_active_mana where character_id=$1", [f.heroId]) ?? 0), 0);
  assert.ok((await playerRequest.innerText()).includes(ruling));
  for (const width of [1440, 390, 320]) {
    await player.setViewportSize({ width, height: 844 });
    assert.equal(await player.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, `Requests overflow at ${width}`);
    await player.evaluate(() => window.scrollTo(0, 0));
    await player.screenshot({ path: path.join(artifacts, `source-request-${width}.png`), fullPage: true, caret: "initial" });
  }
  await playerRequest.getByRole("button", { name: "Confirm use", exact: true }).click();
  await eventually(async () => await scalar("select status from tabletop_source_use_request where id=$1", [requestId]) === "completed", "Approved Spell did not complete");
  assert.ok(Number(await scalar("select mana_spent from campaign_character_active_mana where character_id=$1", [f.heroId])) > 0);
  await player.getByRole("tab", { name: "History", exact: true }).click();
  await player.locator(`#source-use-title-${requestId}`).waitFor();

  await player.getByRole("tab", { name: "Equipment", exact: true }).click();
  const tonic = player.locator("article").filter({ has: player.getByRole("heading", { name: "Wayfinder Tonic", exact: true }) });
  await tonic.getByRole("button", { name: "Request use", exact: true }).click();
  await player.getByRole("dialog").getByLabel("Intent / circumstances").fill("Find a route through the warehouse.");
  await player.getByRole("dialog").getByRole("button", { name: "Request G.O.D. ruling", exact: true }).click();
  await player.getByRole("dialog").waitFor({ state: "hidden" });
  const tonicId = Number(await scalar("select id from tabletop_source_use_request where character_id=$1 order by id desc limit 1", [f.heroId]));
  const godTonic = god.locator("article").filter({ has: god.locator(`#source-use-title-${tonicId}`) });
  await godTonic.getByLabel(`G.O.D. ruling for request #${tonicId}`).fill("No viable path from here.");
  await godTonic.getByRole("button", { name: "Reject", exact: true }).click();
  await eventually(async () => await scalar("select status from tabletop_source_use_request where id=$1", [tonicId]) === "rejected", "Item rejection did not persist");
  assert.equal(await scalar("select quantity from campaign_character_item where character_id=$1 and item_id=$2", [f.heroId, f.manualItem.id]), 3);

  await god.getByRole("navigation", { name: "Session workspace", exact: true }).getByRole("button", { name: /^Called Checks/ }).click();
  const compose = god.locator(".called-check-compose--check");
  assert.equal(await compose.getByLabel("Roll method").count(), 0);
  await compose.getByRole("combobox", { name: /^Attribute/ }).selectOption("DEX");
  await compose.getByLabel("Rowan", { exact: false }).check();
  await compose.getByLabel("Purpose", { exact: true }).fill("Player chooses physical or digital");
  await compose.getByRole("button", { name: "Issue Called Check", exact: true }).click();
  await player.getByRole("tab", { name: /^Alerts/ }).click();
  await player.getByRole("link", { name: "Open roll", exact: true }).click();
  const called = player.locator("article").filter({ hasText: "Player chooses physical or digital" });
  await called.getByLabel("Percentile result").fill("00");
  await called.getByRole("button", { name: "Record Physical Result", exact: true }).click();
  await eventually(async () => await scalar("select result_total from campaign_session_roll where label=$1 and campaign_id=$2", ["Player chooses physical or digital", f.campaignId]) === 100, "Physical 00 was not recorded as 100");
  await compose.getByLabel("Purpose", { exact: true }).fill("Player chooses digital");
  await compose.getByRole("button", { name: "Issue Called Check", exact: true }).click();
  const digital = player.locator("article").filter({ hasText: "Player chooses digital" });
  await digital.getByRole("combobox", { name: /^Roll method/ }).selectOption("digital");
  assert.equal(await digital.getByLabel("Percentile result").count(), 0);
  await digital.getByRole("button", { name: "Roll Percentile", exact: true }).click();
  await eventually(async () => await scalar("select method from campaign_session_roll where label=$1 and campaign_id=$2", ["Player chooses digital", f.campaignId]) === "random", "Digital choice was not used");
  assert.deepEqual(errors, []);
  console.log("Tabletop tools browser: clothing, armor, magazines, ready weapon, potion, Player/G.O.D. Spell approval, Item rejection, physical/digital rolls, mobile widths passed.");
  } catch (error) {
    await player.screenshot({ path: path.join(artifacts, "failure-tools-player.png"), fullPage: true, caret: "initial" }).catch(() => undefined);
    await god.screenshot({ path: path.join(artifacts, "failure-tools-god.png"), fullPage: true, caret: "initial" }).catch(() => undefined);
    throw error;
  } finally {
    await player.close();
    await god.close();
  }
}
