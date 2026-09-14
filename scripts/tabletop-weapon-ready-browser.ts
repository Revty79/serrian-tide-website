import assert from "node:assert/strict";
import path from "node:path";
import type { Browser } from "playwright-core";
import type pg from "pg";
import { db } from "@/db";
import { addScreenFirearm, screenFixture, SCREEN_PASSWORD } from "./fixtures/combat-screens-browser-fixture";

export async function runTabletopWeaponReadyBrowser(browser: Browser, base: string, pool: pg.Pool, artifacts: string) {
  const f = await db.transaction((tx) => screenFixture(tx, "tabletop-ready"));
  const gun = await db.transaction((tx) => addScreenFirearm(tx, f));
  await pool.query("update campaign_session_encounter set status='completed',completed_at=now() where id=$1", [f.encounterId]);
  await pool.query("delete from campaign_character_item_equipment_state where character_id=$1 and item_id=$2", [f.heroId, f.weaponId]);
  await pool.query("update campaign_character_item_instance set equipment_state='inactive' where id=$1", [gun.instance.id]);
  await pool.query("update weapon_profiles set draw_initiative_cost=0.5 where item_id=$1", [f.weaponId]);
  const player = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const god = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  async function eventually(check: () => Promise<boolean>, message: string) {
    for (let i = 0; i < 200; i++) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 200)); }
    throw new Error(message);
  }
  async function scalar(sql: string, args: unknown[]) { return Object.values((await pool.query(sql, args)).rows[0] ?? {})[0]; }
  try {
    for (const [page, id] of [[player, f.playerId], [god, f.godId]] as const) {
      page.setDefaultTimeout(45_000);
      page.on("pageerror", (error) => errors.push(error.message));
      assert.equal((await page.request.post(`${base}/api/auth/sign-in/email`, { headers: { Origin: base }, data: { email: `${id}@example.invalid`, password: SCREEN_PASSWORD } })).status(), 200);
    }
    const url = `${base}/realms/tabletop?character=${f.heroId}&tab=equipment`;
    await player.goto(url);
    const equipment = player.getByRole("region", { name: "Equipment State", exact: true });
    await equipment.getByRole("button", { name: "Ready weapon Fixture Shortsword", exact: true }).click();
    await eventually(async () => await scalar("select quantity from campaign_character_item_equipment_state where character_id=$1 and item_id=$2 and state='wielded'", [f.heroId, f.weaponId]) === 1, "Tabletop did not wield the sword");
    await equipment.getByRole("button", { name: `Ready weapon Screen Pistol copy ${gun.instance.id}`, exact: true }).click();
    await eventually(async () => await scalar("select equipment_state from campaign_character_item_instance where id=$1", [gun.instance.id]) === "wielded", "Tabletop did not wield the exact gun copy");
    assert.equal(Number(await scalar("select loaded_rounds from campaign_character_firearm_state where item_instance_id=$1", [gun.instance.id])), 3);
    await equipment.getByRole("button", { name: "Decrease Wielded Fixture Shortsword", exact: true }).click();
    await eventually(async () => Number(await scalar("select quantity from campaign_character_item_equipment_state where character_id=$1 and item_id=$2 and state='wielded'", [f.heroId, f.weaponId]) ?? 0) === 0, "Sword did not stow");
    // Reopen only this disposable fixture to exercise the combat path.
    await pool.query("update campaign_session_encounter set status='active',completed_at=null where id=$1", [f.encounterId]);
    await player.reload();
    const preparation = player.getByRole("region", { name: "Combat weapon preparation", exact: true });
    await preparation.getByRole("combobox", { name: /^Melee weapon/ }).selectOption(`${f.weaponId}:stack`);
    await preparation.getByRole("button", { name: "Draw weapon", exact: true }).click();
    await eventually(async () => Number(await scalar("select count(*) from campaign_session_encounter_action_declaration where encounter_id=$1 and draft_json->>'actionKind'='combat-melee-draw'", [f.encounterId])) === 1, "Tabletop draw did not commit");
    await preparation.getByText("Action underway: 0.5 Initiative remaining.", { exact: true }).waitFor();
    assert.equal(Number(await scalar("select quantity from campaign_character_item_equipment_state where character_id=$1 and item_id=$2 and state='wielded'", [f.heroId, f.weaponId]) ?? 0), 0);
    assert.equal(await equipment.getByRole("button", { name: "Ready weapon Fixture Shortsword", exact: true }).isDisabled(), true);
    await preparation.locator("summary").filter({ hasText: "Screen Pistol" }).click();
    await preparation.getByText("Loaded and ready. Open the encounter to choose a target and fire.", { exact: true }).waitFor();
    for (const width of [1440, 390, 320]) {
      await player.setViewportSize({ width, height: 1000 });
      assert.equal(await player.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, `Weapon preparation overflows at ${width}`);
      await player.screenshot({ path: path.join(artifacts, `weapon-ready-${width}.png`), fullPage: true });
    }
    await god.goto(`${base}/heavens/tabletop?combat=${f.encounterId}`);
    const combat = god.locator("[data-combat-screen]");
    await combat.getByText("Live", { exact: true }).waitFor();
    await combat.getByRole("checkbox", { name: "Automatic flow", exact: true }).uncheck();
    await combat.getByRole("button", { name: "Advance combat", exact: true }).click();
    await eventually(async () => await scalar("select quantity from campaign_character_item_equipment_state where character_id=$1 and item_id=$2 and state='wielded'", [f.heroId, f.weaponId]) === 1, "Draw did not finish through the encounter timeline");
    await eventually(async () => await preparation.getByRole("combobox", { name: /^Melee weapon/ }).locator("option").count() === 1, "Tabletop did not receive draw completion");
    await player.goto(`${base}/realms/tabletop?character=${f.heroId}&combat=${f.encounterId}`);
    await player.getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: "Attack", exact: true }).click();
    await player.getByRole("combobox", { name: /^Attack source/ }).selectOption({ label: "Fixture Shortsword" });
    assert.equal(Number(await scalar("select count(*) from campaign_session_roll where encounter_id=$1", [f.encounterId])), 0);
    assert.deepEqual(errors, []);
  } catch (error) {
    await player.screenshot({ path: path.join(artifacts, "weapon-ready-failure.png"), fullPage: true });
    console.error(await player.locator("main").innerText());
    throw error;
  } finally { await player.close(); await god.close(); }
}
