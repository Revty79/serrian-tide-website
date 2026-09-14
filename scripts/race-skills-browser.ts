import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { hashPassword } from "better-auth/crypto";
import type pg from "pg";
import { chromium } from "playwright-core";

export async function runRaceSkillsBrowser(input: {
  connectionString: string; port: number; client: pg.Client;
  raceId: number; root: number; rootB: number; leaf: number; gift: number;
}) {
  const connection = new URL(input.connectionString);
  assert.ok(connection.hostname === "127.0.0.1" && connection.pathname === "/serrian_race_skills_dev" && connection.port !== "5432");
  const base = `http://localhost:${input.port}`;
  const id = `race-browser-${Date.now()}`;
  const email = `${id}@example.invalid`;
  const password = "Race-Browser-Fixture-Only!";
  await input.client.query(`insert into "user"(id,name,email,email_verified,username,display_username) values($1,'Race Browser',$2,true,$1,$1)`, [id, email]);
  await input.client.query("insert into user_role(user_id,role) values($1,'god')", [id]);
  await input.client.query("insert into account(id,issuer,account_id,provider_id,user_id,password,updated_at) values($1,'local:credential',$1,'credential',$1,$2,now())", [id, await hashPassword(password)]);
  await input.client.query("delete from race_skill_links where race_id=$1", [input.raceId]);
  const artifact = "artifacts/race-skill-cleanup/browser";
  await mkdir(artifact, { recursive: true });
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(input.port)], {
    windowsHide: true, stdio: "pipe", env: { ...process.env, DATABASE_URL: input.connectionString,
      BETTER_AUTH_URL: base, BETTER_AUTH_SECRET: "disposable-race-skills-browser-secret-not-for-real-use", NEXT_TELEMETRY_DISABLED: "1", SERRIAN_TEST_NEXT_DIST_DIR: ".next-realms-campaign-browser" },
  });
  let logs = "";
  server.stdout.on("data", (chunk) => { logs += String(chunk); });
  server.stderr.on("data", (chunk) => { logs += String(chunk); });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 180; attempt++) {
      if (server.exitCode !== null) throw new Error(logs);
      try { if ((await fetch(base)).status < 500) { ready = true; break; } } catch { /* Wait for startup. */ }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(ready, logs);
    browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      const login = await context.request.post(`${base}/api/auth/sign-in/email`, { headers: { origin: base }, data: { email, password } });
      assert.ok(login.ok(), await login.text());
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${base}/heavens/races`);
      await page.getByRole("button", { name: /Race Skills Browser Fixture/ }).click();
      await page.getByRole("button", { name: "Skills & Abilities", exact: true }).click();
      const picker = page.locator(".race-skill-picker");
      await picker.getByLabel("Search", { exact: true }).fill("Deep Specialty");
      await page.waitForFunction((rootId) => Boolean(document.querySelector(`.race-skill-picker option[value="${rootId}"]`)), input.root);
      const matches = picker.getByLabel("Matching Skills");
      assert.deepEqual(await matches.locator("option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value)), ["", String(input.root), String(input.rootB)]);
      await matches.selectOption(String(input.root));
      await picker.getByRole("button", { name: "Add Link" }).click();
      if (width === 1440) {
        await input.client.query("update skill set tier=2 where id=$1", [input.root]);
        await page.getByRole("button", { name: "Save Race", exact: true }).click();
        await page.getByText(/cannot be assigned to a Race/).waitFor();
        assert.equal((await input.client.query("select count(*)::int count from race_skill_links where race_id=$1", [input.raceId])).rows[0].count, 0);
        await input.client.query("update skill set tier=1 where id=$1", [input.root]);
      }
      await picker.getByLabel("Search", { exact: true }).fill("Race Test Gift");
      await page.waitForFunction((giftId) => Boolean(document.querySelector(`.race-skill-picker option[value="${giftId}"]`)), input.gift);
      await matches.selectOption(String(input.gift));
      await picker.getByLabel("Link Type").selectOption("Granted");
      await picker.getByRole("button", { name: "Add Link" }).click();
      await page.getByRole("button", { name: "Save Race", exact: true }).click();
      await page.getByText("Race Skills Browser Fixture was saved.", { exact: true }).waitFor();
      assert.deepEqual((await input.client.query("select skill_id from race_skill_links where race_id=$1 order by skill_id", [input.raceId])).rows.map((row) => row.skill_id), [input.root, input.gift]);
      const bounds = await picker.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: window.innerWidth, documentWidth: document.documentElement.scrollWidth };
      });
      assert.ok(bounds.left >= 0 && bounds.right <= width && bounds.documentWidth <= width, JSON.stringify(bounds));
      await page.screenshot({ path: `${artifact}/${width}.png`, fullPage: true });
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally {
    if (browser) await browser.close();
    if (server.pid && server.exitCode === null) {
      if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
      else server.kill("SIGTERM");
      await new Promise<void>((resolve) => { if (server.exitCode !== null) resolve(); else server.once("exit", () => resolve()); });
    }
    await writeFile(`${artifact}/server.log`, logs);
  }
}
