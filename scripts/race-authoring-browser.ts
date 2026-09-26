import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { hashPassword } from "better-auth/crypto";
import { chromium, type Page } from "playwright-core";
import { pool } from "@/db";
import { RACE_SIZE_OPTIONS } from "@/db/race-schema";
import { checkGuidanceWorkspaces, checkRaceFieldGuidance } from "./guidance-browser-checks";
import { checkRaceAnatomyBrowser } from "./race-anatomy-browser";
import { checkRaceNaturalAttacksBrowser } from "./race-natural-attacks-browser";
import { checkRaceFormsBrowser } from "./race-forms-browser";
import { checkRaceFormPreviewBrowser } from "./race-form-preview-browser";
import { checkRaceFormMechanicsBrowser } from "./race-form-mechanics-browser";

async function until(check: () => Promise<boolean>, label: string) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 150)); }
  throw new Error(`Timed out: ${label}`);
}
export async function runRaceAuthoringBrowser({ parentId, actorUserId, characterId }: { parentId: number; actorUserId: string; characterId: number }) {
  assert.equal(process.env.SERRIAN_DISPOSABLE_RACE_AUTHORING, "true");
  const listener = createServer(); await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const address = listener.address(); assert.ok(address && typeof address === "object"); const port = address.port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  const base = `http://localhost:${port}`, artifacts = "artifacts/race-authoring", password = "Race-Authoring-Fixture-Only!";
  const tsconfig = await readFile("tsconfig.json", "utf8");
  for (const id of [actorUserId, "race-player"]) await pool.query("insert into account(id,issuer,account_id,provider_id,user_id,password,updated_at) values($1,'local:credential',$2,'credential',$2,$3,now())", [`${id}-credential`, id, await hashPassword(password)]);
  await mkdir(artifacts, { recursive: true });
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(port)], { windowsHide: true, stdio: "pipe", env: {
    ...process.env, NODE_ENV: "development", BETTER_AUTH_URL: base, BETTER_AUTH_SECRET: "race-authoring-disposable-browser-only-secret", NEXT_TELEMETRY_DISABLED: "1", SERRIAN_TEST_NEXT_DIST_DIR: ".next-race-authoring-browser",
  } });
  let logs = "", browser: Awaited<ReturnType<typeof chromium.launch>> | undefined, page: Page | undefined;
  server.stdout.on("data", (chunk) => { logs += String(chunk); }); server.stderr.on("data", (chunk) => { logs += String(chunk); });
  try {
    await until(async () => { if (server.exitCode !== null) throw new Error(logs); try { return (await fetch(`${base}/login`)).ok; } catch { return false; } }, "Next start");
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const login = await context.request.post(`${base}/api/auth/sign-in/email`, { headers: { origin: base }, data: { email: `${actorUserId}@example.invalid`, password } });
    assert.ok(login.ok(), await login.text());
    page = await context.newPage(); page.setDefaultTimeout(35_000); page.setDefaultNavigationTimeout(120_000);
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    let cloneRequest: { action: string; body: string } | undefined;
    page.on("request", (request) => { const action = request.headers()["next-action"], body = request.postData(); if (action && body?.includes("Browser Variant")) cloneRequest = { action, body }; });
    const tab = async (name: string) => page!.getByRole("button", { name, exact: true }).click();
    const open = async (id: number, name: string) => {
      await page!.locator("#race-search").fill(name);
      await page!.locator(".skill-library__row").filter({ hasText: name }).click();
      await page!.locator(".skill-editor__header").getByText(`RACE ${id}`, { exact: true }).waitFor();
    };
    const save = async (name: string) => { await tab("Save Race"); await page!.getByText(`${name} was saved.`, { exact: true }).waitFor(); };
    await page.goto(`${base}/heavens/races`);
    await tab("New Race"); await tab("Variants");
    await page.getByText("Save this Race before creating variants.", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Clone as Variant", exact: true }).count(), 0);
    await open(parentId, "Variant Authoring Parent");
    const originalDescription = (await pool.query("select legacy_description from races where id=$1", [parentId])).rows[0].legacy_description;
    assert.equal(await page.getByLabel("Description", { exact: true }).inputValue(), originalDescription);
    assert.equal(await page.getByText("Legacy Description", { exact: true }).count(), 0);
    await page.getByLabel("Description", { exact: true }).fill("A coastal people known for their memory and long sea journeys.");
    await save("Variant Authoring Parent");
    await page.reload(); await open(parentId, "Variant Authoring Parent");
    assert.equal(await page.getByLabel("Description", { exact: true }).inputValue(), "A coastal people known for their memory and long sea journeys.");
    await tab("Preview");
    await page.locator(".race-preview").getByText("A coastal people known for their memory and long sea journeys.", { exact: true }).waitFor();
    await tab("Overview");
    console.log("PASS: existing Race description is editable in Overview, saves/reloads and appears in Preview");
    assert.equal(await page.getByLabel("Base Magic", { exact: true }).count(), 0);
    for (const size of RACE_SIZE_OPTIONS) {
      await page.locator(".race-form-grid").getByLabel(/^Size/).selectOption(size);
      await save("Variant Authoring Parent");
      await until(async () => (await pool.query("select size from races where id=$1", [parentId])).rows[0].size === size, `saved ${size}`);
    }
    await tab("Mechanics");
    assert.equal(await page.getByLabel("Base Magic", { exact: true }).inputValue(), "3");
    assert.deepEqual(await page.getByLabel("Movement Mode", { exact: true }).evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value)), ["Land", "Swim"]);
    assert.deepEqual(await page.getByLabel("Base Movement", { exact: true }).evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value)), ["3", "2.5"]);
    assert.deepEqual(await page.getByLabel("Notes", { exact: true }).evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value)), ["Walk safely", "Water only"]);
    const natural = page.getByRole("region", { name: "Natural Protection", exact: true });
    assert.equal(await natural.getByLabel("Natural Armor", { exact: true }).count(), 0);
    assert.deepEqual(await natural.getByLabel("Soak", { exact: true }).evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value)), ["2", "0.5"]);
    await checkRaceFieldGuidance(page);
    await page.getByLabel("Base Magic", { exact: true }).fill("3.5");
    await page.getByLabel("Base Movement", { exact: true }).nth(1).fill("4.5");
    await page.getByLabel("Notes", { exact: true }).nth(1).fill("Updated Swim notes");
    await save("Variant Authoring Parent");
    await page.reload(); await open(parentId, "Variant Authoring Parent"); await tab("Mechanics");
    assert.equal(await page.getByLabel("Base Magic", { exact: true }).inputValue(), "3.5");
    assert.equal(await page.getByLabel("Base Movement", { exact: true }).nth(1).inputValue(), "4.5");
    assert.equal(await page.getByLabel("Notes", { exact: true }).nth(1).inputValue(), "Updated Swim notes");
    assert.deepEqual((await pool.query("select max_value from race_attribute_caps where race_id=$1 order by sort_order", [parentId])).rows.map(({ max_value }) => max_value), [40, 41, 42, 43, 44, 45]);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await natural.screenshot({ path: `${artifacts}/natural-protection-${width}.png` });
    }
    console.log("PASS: real save/reload preserves every Size, caps, Base Magic, movement notes and single-Soak authoring on desktop/phone");
    const anatomySave = await checkRaceAnatomyBrowser(page, parentId, save, open);

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByLabel("Base Magic", { exact: true }).fill("99"); await tab("Variants");
    await page.getByLabel("Variant Name", { exact: true }).fill("Browser Variant"); await tab("Clone as Variant");
    await page.getByText(/clone the last saved Race definition/).waitFor();
    assert.equal((await pool.query("select count(*)::int n from races where parent_race_id=$1", [parentId])).rows[0].n, 0);
    await tab("Keep Editing"); await tab("Mechanics"); assert.equal(await page.getByLabel("Base Magic", { exact: true }).inputValue(), "99");
    await tab("Variants"); await page.getByLabel("Variant Name", { exact: true }).fill("Browser Variant"); await tab("Clone as Variant"); await tab("Discard Changes");
    await page.getByText("Browser Variant was created as a variant.", { exact: true }).waitFor();
    const copy = (await pool.query("select * from races where name='Browser Variant'")).rows[0]; assert.ok(copy); assert.equal(copy.parent_race_id, parentId); assert.equal(copy.base_magic, 3.5);
    assert.ok(cloneRequest); const successfulClone = { ...cloneRequest };
    assert.deepEqual(copy.anatomy_json, (await pool.query("select anatomy_json from races where id=$1", [parentId])).rows[0].anatomy_json);
    await tab("Mechanics"); await page.getByLabel("Base Magic", { exact: true }).fill("4"); await tab("Variants");
    await page.getByRole("region", { name: "Race Variants" }).getByRole("button", { name: "Variant Authoring Parent", exact: true }).click();
    await page.getByText("Leave this Race draft and discard the unsaved changes?", { exact: true }).waitFor();
    await tab("Keep Editing"); await tab("Mechanics"); assert.equal(await page.getByLabel("Base Magic", { exact: true }).inputValue(), "4");
    await save("Browser Variant");
    assert.equal((await pool.query("select base_magic from races where id=$1", [parentId])).rows[0].base_magic, 3.5);
    await tab("Variants"); await page.getByRole("region", { name: "Race Variants" }).getByRole("button", { name: "Variant Authoring Parent", exact: true }).click();
    await page.locator(".skill-editor__header").getByText(`RACE ${parentId}`, { exact: true }).waitFor(); await tab("Variants");
    const child = page.getByRole("region", { name: "Race Variants" }).getByRole("button", { name: /Browser Variant/ });
    assert.equal(await child.count(), 1); await child.click();
    await page.locator(".skill-editor__header").getByText(`RACE ${copy.id}`, { exact: true }).waitFor(); await tab("Mechanics");
    assert.equal(await page.getByLabel("Base Magic", { exact: true }).inputValue(), "4");
    await page.getByLabel("Base Magic", { exact: true }).fill("12"); await tab("New Race");
    await tab("Keep Editing"); assert.equal(await page.getByLabel("Base Magic", { exact: true }).inputValue(), "12");
    await tab("New Race"); await tab("Discard Changes"); await page.getByText("NEW RACE DRAFT", { exact: true }).waitFor();
    await open(parentId, "Variant Authoring Parent"); await tab("Variants");
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole("region", { name: "Race Variants" }).screenshot({ path: `${artifacts}/variants-phone.png` });
    console.log("PASS: saved-only cloning, Keep Editing/discard decisions, direct variant navigation and independent saves");
    await page.goto(`${base}/realms/characters/${characterId}`);
    await page.locator("#character-tab-attributes").click();
    await page.getByRole("heading", { name: "Race Hit Locations", exact: true }).waitFor();
    await page.locator(".character-hit-chart__locations").getByText("Tail", { exact: true }).waitFor();
    assert.equal(await page.locator(".character-hit-chart svg").count(), 0);
    await page.reload(); await page.locator("#character-tab-attributes").click(); await page.locator(".character-hit-chart__locations").getByText("Tail", { exact: true }).waitFor();
    console.log("PASS: actual Character sheet uses persisted Race tail anatomy after reload without humanoid artwork");
    await checkGuidanceWorkspaces(page, base);

    const player = await browser.newContext();
    const playerLogin = await player.request.post(`${base}/api/auth/sign-in/email`, { headers: { origin: base }, data: { email: "race-player@example.invalid", password } }); assert.ok(playerLogin.ok());
    const count = (await pool.query("select count(*)::int n from races")).rows[0].n;
    const replay = async (request: typeof context.request) => request.post(`${base}/heavens/races`, { headers: { origin: base, "next-action": successfulClone.action, "content-type": "text/plain;charset=UTF-8" }, data: successfulClone.body });
    await replay(player.request); assert.equal((await pool.query("select count(*)::int n from races")).rows[0].n, count);
    const anatomyBefore = (await pool.query("select anatomy_json,updated_at from races where id=$1", [parentId])).rows[0];
    await player.request.post(`${base}/heavens/races`, { headers: { origin: base, "next-action": anatomySave.action, "content-type": "text/plain;charset=UTF-8" }, data: anatomySave.body });
    assert.deepEqual((await pool.query("select anatomy_json,updated_at from races where id=$1", [parentId])).rows[0], anatomyBefore);
    await pool.query("delete from user_role where user_id=$1", [actorUserId]);
    await replay(context.request); assert.equal((await pool.query("select count(*)::int n from races")).rows[0].n, count);
    await pool.query("insert into user_role(user_id,role) values($1,'god')", [actorUserId]);
    await checkRaceNaturalAttacksBrowser(page, base);
    await checkRaceFormsBrowser(page, base);
    await checkRaceFormMechanicsBrowser(page, base);
    await checkRaceFormPreviewBrowser(page, base, actorUserId, characterId);
    assert.deepEqual(errors, []);
    console.log("PASS: Player and revoked-role replay cannot clone; no browser JavaScript errors");
  } catch (error) {
    if (page) await page.screenshot({ path: `${artifacts}/failure.png`, fullPage: true }).catch(() => undefined);
    throw error;
  } finally {
    if (browser) await browser.close();
    if (server.pid && server.exitCode === null) {
      if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); else server.kill("SIGTERM");
      await new Promise<void>((resolve) => { if (server.exitCode !== null) resolve(); else server.once("exit", () => resolve()); });
    }
    await writeFile(`${artifacts}/server.log`, logs);
    // Next only adds this test server's generated-type paths; retain unrelated edits.
    const current = await readFile("tsconfig.json", "utf8");
    const parsed = JSON.parse(current), original = JSON.parse(tsconfig);
    parsed.include = parsed.include.filter((entry: string) => !entry.startsWith(".next-race-authoring-browser/"));
    if (JSON.stringify(parsed) === JSON.stringify(original)) await writeFile("tsconfig.json", tsconfig);
  }
}
