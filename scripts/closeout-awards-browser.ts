import assert from "node:assert/strict";
import path from "node:path";
import type { Browser } from "playwright-core";
import type pg from "pg";
import type { closeoutAwardsFixture } from "./fixtures/closeout-awards-fixture";
import { SCREEN_PASSWORD } from "./fixtures/combat-screens-browser-fixture";

export async function runCloseoutAwardsBrowser(browser: Browser, base: string, pool: pg.Pool, f: Awaited<ReturnType<typeof closeoutAwardsFixture>>, artifacts: string) {
  const god = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const player = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors: string[] = [];
  try {
    for (const page of [god, player]) { page.setDefaultTimeout(45_000); page.on("pageerror", (error) => errors.push(error.message)); }
    async function eventually(check: () => Promise<boolean>, message: string) {
      for (let i = 0; i < 180; i++) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 200)); }
      throw new Error(message);
    }
    async function balances() { return (await pool.query("select experience,fame,quintessence,total_experience,total_quintessence from campaign_character_profile where character_id=$1", [f.heroId])).rows[0]; }
    const initial = await balances();
    for (const [page, id] of [[god, f.godId], [player, f.playerId]] as const) {
      assert.equal((await page.request.post(`${base}/api/auth/sign-in/email`, { headers: { Origin: base }, data: { email: `${id}@example.invalid`, password: SCREEN_PASSWORD } })).status(), 200);
    }
    await player.goto(`${base}/realms/tabletop?character=${f.heroId}&tab=history`);
    await god.goto(`${base}/heavens/tabletop?campaign=${f.campaignId}&session=${f.sessionId}&scene=${f.sceneId}&workspace=scenes`);
    await god.getByRole("button", { name: "Complete Scene", exact: true }).click();
    const dialog = god.getByRole("dialog");
    for (const label of ["Rowan XP", "Rowan Fame", "Rowan Quintessence"]) assert.equal(await dialog.getByLabel(label, { exact: true }).inputValue(), "");
    await dialog.getByLabel("Rowan XP", { exact: true }).fill("12.5");
    await dialog.getByLabel("Rowan Fame", { exact: true }).fill("2");
    await dialog.getByLabel("Rowan Quintessence", { exact: true }).fill("3");
    await dialog.getByLabel("Award note", { exact: true }).fill("Resolved the warehouse dispute.");
    assert.deepEqual(await balances(), initial);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.deepEqual(await balances(), initial);
    await god.getByRole("button", { name: "Complete Scene", exact: true }).click();
    assert.equal(await dialog.getByLabel("Rowan XP", { exact: true }).inputValue(), "12.5");
    await dialog.getByLabel("Rowan XP", { exact: true }).fill("-1");
    await dialog.getByRole("button", { name: "Complete Scene", exact: true }).click();
    await dialog.getByRole("alert").filter({ hasText: "nonnegative" }).waitFor();
    assert.deepEqual(await balances(), initial);
    await dialog.getByLabel("Rowan XP", { exact: true }).fill("12.5");
    for (const width of [1440, 390, 320]) {
      await god.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      assert.equal(await dialog.evaluate((node) => node.scrollWidth > node.clientWidth), false, `Award dialog overflows at ${width}`);
      assert.equal(await god.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, `G.O.D. page overflows at ${width}`);
      await dialog.getByLabel("Rowan XP", { exact: true }).scrollIntoViewIfNeeded();
      await god.screenshot({ path: path.join(artifacts, `closeout-awards-${width}.png`), caret: "initial" });
    }
    await dialog.getByRole("button", { name: "Complete Scene", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await eventually(async () => (await balances()).experience === 22.5, "Scene awards did not reach the Character");
    await god.getByRole("region", { name: "Scene award history", exact: true }).waitFor();
    await eventually(async () => (await player.getByRole("region", { name: "Scene & Session awards", exact: true }).innerText()).includes("12.5 XP"), "Player did not receive Scene award history");
    await god.getByRole("button", { name: "Reopen Scene", exact: true }).click();
    await dialog.getByRole("button", { name: "Reopen Scene", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await god.getByRole("button", { name: "Complete Scene", exact: true }).click();
    assert.equal(await dialog.getByRole("spinbutton").count(), 0);
    await dialog.getByText("Previously recorded awards will not be issued again.").waitFor();
    await dialog.getByRole("button", { name: "Complete Scene", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal((await balances()).experience, 22.5);

    await god.setViewportSize({ width: 1440, height: 1000 });
    await god.getByRole("navigation", { name: "Session workspace", exact: true }).getByRole("button", { name: "Closeout", exact: true }).click();
    await god.getByRole("button", { name: "Finalize Session", exact: true }).click();
    await dialog.getByLabel("Rowan XP", { exact: true }).fill("7");
    await dialog.getByLabel("Rowan Fame", { exact: true }).fill("1");
    await dialog.getByLabel("Rowan Quintessence", { exact: true }).fill("2");
    await dialog.getByRole("button", { name: "Finalize Session", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await eventually(async () => (await balances()).experience === 29.5, "Session award did not apply");
    const final = await balances();
    assert.equal(final.fame, 5); assert.equal(final.quintessence, 9);
    assert.equal(final.total_experience, initial.total_experience); assert.equal(final.total_quintessence, initial.total_quintessence);
    await god.getByRole("button", { name: "Reopen Session", exact: true }).click();
    await dialog.getByRole("button", { name: "Reopen Session", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await god.getByRole("button", { name: "Finalize Session", exact: true }).click();
    assert.equal(await dialog.getByRole("spinbutton").count(), 0);
    await dialog.getByRole("button", { name: "Finalize Session", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.deepEqual(await balances(), final);
    await eventually(async () => (await player.getByRole("region", { name: "Scene & Session awards", exact: true }).innerText()).includes("7 XP"), "Player did not receive Session award history");
    await player.locator("#tabletop-award-history").scrollIntoViewIfNeeded();
    assert.equal(await player.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    await player.screenshot({ path: path.join(artifacts, "closeout-awards-player-390.png"), caret: "initial" });
    assert.equal(Number((await pool.query("select count(*) from tabletop_closeout_award_decision where session_id=$1", [f.sessionId])).rows[0].count), 2);
    assert.deepEqual(errors, []);
    console.log("Closeout awards browser: blank manual fields, cancel, invalid amount, Scene/Session grants, reopen protection, Player history, desktop/mobile passed.");
  } catch (error) {
    await god.screenshot({ path: path.join(artifacts, "failure-closeout-god.png"), fullPage: true }).catch(() => undefined);
    await player.screenshot({ path: path.join(artifacts, "failure-closeout-player.png"), fullPage: true }).catch(() => undefined);
    throw error;
  } finally { await god.close(); await player.close(); }
}
