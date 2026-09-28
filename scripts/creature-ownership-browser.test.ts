import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { hashPassword } from "better-auth/crypto";
import { chromium } from "playwright-core";
import { pool } from "@/db";

assert.equal(process.env.SERRIAN_OWNERSHIP_DISPOSABLE, "true");
assert.match(process.env.DATABASE_URL ?? "", /^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_creature_ownership_dev$/);
const artifacts = path.resolve("artifacts/guidance/creature-ownership");
async function until(check: () => Promise<boolean>, label: string) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out: ${label}`);
}
async function main() {
  await mkdir(artifacts, { recursive: true });
  const tsconfig = await readFile("tsconfig.json"), nextEnv = await readFile("next-env.d.ts");
  const listener = createServer(); await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const address = listener.address(); assert.ok(address && typeof address === "object");
  const port = address.port; await new Promise<void>((resolve) => listener.close(() => resolve()));
  const base = `http://localhost:${port}`, userId = "ownership-god", password = "Ownership-Browser-Only!";
  let server: ChildProcess | null = null, browser: Awaited<ReturnType<typeof chromium.launch>> | null = null, serverLog = "";
  const errors: string[] = [];
  try {
    await pool.query('update "user" set email_verified=true,username=$1,display_username=$1 where id=$1', [userId]);
    await pool.query("insert into account(id,issuer,account_id,provider_id,user_id,password,updated_at) values($1,'local:credential',$2,'credential',$2,$3,now())", [`${userId}-credential`, userId, await hashPassword(password)]);
    const campaign = (await pool.query("select id from campaign where name='Ownership Campaign'")).rows[0].id;
    const ownerA = (await pool.query("select id from campaign_character where campaign_id=$1 and name='Owner A'", [campaign])).rows[0].id;
    const ownerB = (await pool.query("select id from campaign_character where campaign_id=$1 and name='Owner B'", [campaign])).rows[0].id;
    const source = (await pool.query("select id from creatures where canonical_name='Ownership Horse'")).rows[0].id;
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(port)], { cwd: process.cwd(), env: { ...process.env, BETTER_AUTH_URL: base, NEXT_TELEMETRY_DISABLED: "1", SERRIAN_TEST_NEXT_DIST_DIR: ".next-creature-ownership-browser" }, stdio: "pipe", windowsHide: true });
    server.stdout?.on("data", (chunk) => { serverLog += String(chunk); }); server.stderr?.on("data", (chunk) => { serverLog += String(chunk); });
    await until(async () => { if (server?.exitCode !== null) throw new Error("Next exited before startup."); try { return (await fetch(`${base}/login`)).ok; } catch { return false; } }, "Next startup");
    browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
    const context = await browser.newContext({ viewport: { width: 1365, height: 1000 }, hasTouch: true });
    const page = await context.newPage(); page.setDefaultTimeout(40_000); page.setDefaultNavigationTimeout(180_000);
    page.on("pageerror", (error) => errors.push(error.message));
    const auth = await context.request.post(`${base}/api/auth/sign-in/email`, { headers: { Origin: base }, data: { email: `${userId}@example.invalid`, password } }); assert.equal(auth.status(), 200);
    await page.goto(`${base}/heavens/npcs?campaign=${campaign}`);
    await page.locator(".npcs-card").first().waitFor();
    for (const name of ["Browser Star", "Browser Comet"]) {
      await page.getByRole("button", { name: "Create NPC", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Choose a source and build depth" });
      await dialog.getByRole("radio", { name: "Creature", exact: true }).check();
      await dialog.getByRole("combobox", { name: /^Source Master/ }).selectOption(String(source));
      await dialog.getByLabel("NPC Name", { exact: true }).fill(name);
      await dialog.getByLabel("Role / Label", { exact: true }).fill("Starting companion");
      await dialog.getByLabel("Owning Character", { exact: true }).selectOption(String(ownerA));
      await dialog.getByLabel("Notes", { exact: true }).fill("Gift at the old bridge");
      if (name === "Browser Star") {
        await dialog.getByLabel("Help for Owning Character").click();
        assert.equal(await dialog.getByLabel("Owning Character", { exact: true }).inputValue(), String(ownerA));
        await page.screenshot({ path: path.join(artifacts, "create-desktop.png"), fullPage: true });
        await page.setViewportSize({ width: 390, height: 844 });
        await dialog.getByRole("button", { name: "Create Simple NPC", exact: true }).scrollIntoViewIfNeeded();
        const bounds = await dialog.boundingBox(); assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 391);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
        await page.screenshot({ path: path.join(artifacts, "create-phone.png"), fullPage: true });
      }
      await dialog.getByRole("button", { name: "Create Simple NPC", exact: true }).click();
      await page.getByRole("heading", { name, exact: true }).waitFor();
    }
    const created = (await pool.query("select id,name,owner_character_id from campaign_character where campaign_id=$1 and name in ('Browser Star','Browser Comet') order by name", [campaign])).rows;
    assert.equal(created.length, 2); assert.notEqual(created[0].id, created[1].id);
    assert.ok(created.every((row) => row.owner_character_id === ownerA));
    const id = created.find((row) => row.name === "Browser Star")!.id;
    await pool.query("insert into campaign_character_active_health(character_id,total_damage) values($1,11)", [id]);
    const snapshot = async () => (await pool.query("select * from campaign_creature_npc_profile where character_id=$1", [id])).rows;
    const before = await snapshot();
    const card = page.locator(".npcs-card").filter({ has: page.getByText("Browser Star", { exact: true }) });
    for (const owner of [String(ownerB), ""]) {
      await card.getByRole("button", { name: "Change Owner", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Owner of Browser Star" });
      await dialog.getByLabel("Owning Character", { exact: true }).selectOption(owner);
      await dialog.getByLabel("Help for Owning Character").click();
      await page.screenshot({ path: path.join(artifacts, owner ? "transfer-phone.png" : "unassign-phone.png"), fullPage: true });
      await dialog.getByRole("button", { name: "Save Ownership", exact: true }).click();
      await until(async () => !await dialog.isVisible(), "Ownership dialog saved");
      await card.getByText(owner ? /Owner: Owner B/ : "Owner: Unassigned", { exact: !owner }).waitFor();
      assert.equal((await pool.query("select owner_character_id from campaign_character where id=$1", [id])).rows[0].owner_character_id, owner ? ownerB : null);
      assert.equal((await pool.query("select total_damage from campaign_character_active_health where character_id=$1", [id])).rows[0].total_damage, 11);
      assert.deepEqual(await snapshot(), before);
    }
    await page.reload(); await card.getByText("Owner: Unassigned", { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log("PASS: authenticated NPC creation, two individual owners, phone help/scrolling, transfer and unassignment, persisted damage/notes, reload; no browser errors.");
  } catch (error) {
    const page = browser?.contexts()[0]?.pages()[0];
    if (page) { await page.screenshot({ path: path.join(artifacts, "failure.png"), fullPage: true }).catch(() => undefined); await writeFile(path.join(artifacts, "failure.txt"), await page.locator("body").innerText().catch(() => "")); }
    throw error;
  } finally {
    if (browser) await browser.close();
    if (server && server.exitCode === null) { server.kill(); await new Promise<void>((resolve) => { const timer = setTimeout(resolve, 3000); server!.once("exit", () => { clearTimeout(timer); resolve(); }); }); }
    await writeFile(path.join(artifacts, "server.log"), serverLog);
    await pool.end(); await writeFile("tsconfig.json", tsconfig); await writeFile("next-env.d.ts", nextEnv);
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
