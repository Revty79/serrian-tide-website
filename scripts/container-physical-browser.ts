import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { hashPassword } from "better-auth/crypto";
import { chromium, type Page } from "playwright-core";
import { pool } from "@/db";

async function until(check: () => Promise<boolean>, label: string) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 150)); }
  throw new Error(`Timed out: ${label}`);
}
type Fixture = { godId: string; heroId: number; campaignId: number; encounterId: number; backpackId: number; pouchId: number; suppliesId: number; exactItemId: number; a: number; b: number; pouch: number; exact: number; mag: number; gun: number };
export async function runContainerPhysicalBrowser(f: Fixture) {
  assert.match(process.env.DATABASE_URL ?? "", /^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_containment_dev$/);
  const listener = createServer(); await new Promise<void>(resolve => listener.listen(0, "127.0.0.1", resolve));
  const address = listener.address(); assert.ok(address && typeof address === "object"); const port = address.port;
  await new Promise<void>(resolve => listener.close(() => resolve()));
  const base = `http://localhost:${port}`, artifacts = "artifacts/container-pass-two", password = "Container-Disposable-Fixture-Only!";
  const originalTsconfig = await readFile("tsconfig.json", "utf8");
  const playerId = `container-browser-player-${crypto.randomUUID()}`;
  await pool.query('insert into "user"(id,name,email) values($1,\'Container Player\',$2)', [playerId, `${playerId}@example.invalid`]);
  await pool.query("insert into user_role(user_id,role) values($1,'player')", [playerId]);
  await pool.query("insert into campaign_player(campaign_id,user_id) values($1,$2)", [f.campaignId, playerId]);
  await pool.query("update campaign_character set player_user_id=$1 where id=$2", [playerId, f.heroId]);
  await pool.query("update campaign_character_profile set creation_completed_at=now() where character_id=$1", [f.heroId]);
  for (const attribute of ["STR", "DEX", "CON", "INT", "WIS", "CHR"]) await pool.query("insert into campaign_character_attribute(character_id,attribute_key,value) values($1,$2,30) on conflict(character_id,attribute_key) do nothing", [f.heroId, attribute]);
  const backpackName = `Browser Backpack ${f.heroId}`;
  await pool.query("update items set name=$1 where id=$2", [backpackName, f.backpackId]);
  for (const id of [f.godId, playerId]) await pool.query("insert into account(id,issuer,account_id,provider_id,user_id,password,updated_at) values($1,'local:credential',$2,'credential',$2,$3,now())", [`${id}-credential`, id, await hashPassword(password)]);
  await mkdir(artifacts, { recursive: true });
  const environment: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "development", BETTER_AUTH_URL: base, BETTER_AUTH_SECRET: "container-disposable-browser-only-secret", NEXT_TELEMETRY_DISABLED: "1", SERRIAN_TEST_NEXT_DIST_DIR: ".next-container-physical-browser" };
  delete environment.NODE_TEST_CONTEXT;
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(port)], { windowsHide: true, stdio: "pipe", env: environment });
  let logs = "", browser: Awaited<ReturnType<typeof chromium.launch>> | undefined, page: Page | undefined;
  server.stdout.on("data", chunk => { logs += String(chunk); }); server.stderr.on("data", chunk => { logs += String(chunk); });
  const errors: string[] = [];
  try {
    await until(async () => { if (server.exitCode !== null) throw new Error(logs); try { return (await fetch(`${base}/login`)).ok; } catch { return false; } }, "Next start");
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
    async function login(id: string) {
      const context = await browser!.newContext({ viewport: { width: 1440, height: 1000 } });
      const response = await context.request.post(`${base}/api/auth/sign-in/email`, { headers: { origin: base }, data: { email: `${id}@example.invalid`, password } });
      assert.ok(response.ok(), await response.text());
      const page = await context.newPage(); page.setDefaultTimeout(25_000); page.setDefaultNavigationTimeout(120_000);
      page.on("pageerror", error => errors.push(error.message)); return page;
    }
    page = await login(f.godId);
    const openEquipment = async (target: Page, path: string) => { await target.goto(`${base}${path}`); await target.locator("#character-tab-equipment").click(); await target.getByText(/Carried weight:/).waitFor(); };
    await openEquipment(page, `/heavens/characters/${f.heroId}`);
    const row = (name: string, copy?: number) => page!.locator(".character-owned-equipment__row").filter({ has: copy ? page!.locator("small").filter({ hasText: new RegExp(`^Copy #${copy}(?:\\s|$)`) }) : page!.getByText(name, { exact: true }) });
    const openMove = async (name: string, copy?: number) => { const entry = row(name, copy); if (await entry.getByRole("button", { name: "Move", exact: true }).count()) await entry.getByRole("button", { name: "Move", exact: true }).click(); return entry; };
    const moveStack = async (from: number | null, to: number | null, quantity: number) => {
      const entry = await openMove("Supplies"); await entry.getByLabel("From", { exact: true }).selectOption(String(from ?? "loose"));
      await entry.getByLabel("Destination", { exact: true }).selectOption(String(to ?? "loose")); await entry.getByLabel("Quantity to move", { exact: true }).fill(String(quantity));
      await entry.getByRole("button", { name: "Move Item", exact: true }).click();
      await until(async () => !(await entry.getByRole("button", { name: "Moving…", exact: true }).count()), "stack mutation complete");
    };
    const moveCopy = async (id: number, to: number | null) => {
      const entry = await openMove("", id); await entry.getByLabel("Destination", { exact: true }).selectOption(String(to ?? "loose")); await entry.getByRole("button", { name: "Move Item", exact: true }).click();
      await until(async () => { const location = (await pool.query("select container_instance_id from inventory_instance_location where instance_id=$1", [id])).rows[0]; return (location?.container_instance_id ?? null) === to; }, "exact mutation persisted");
      await until(async () => !(await entry.getByRole("button", { name: "Moving…", exact: true }).count()), "exact controls available");
    };
    await page.getByText("Magazine & Firearm Setup", { exact: true }).click();
    await moveCopy(f.mag, f.a);
    const magazineSetup = page.locator(".magazine-panel fieldset").filter({ hasText: `Copy #${f.mag}` });
    const firearmSetup = page.getByRole("region", { name: "Firearm equipment setup" });
    const magazineOption = firearmSetup.getByLabel("Prepared magazine").locator(`option[value="${f.mag}"]`);
    await until(async () => (await magazineOption.getAttribute("disabled")) !== null, "contained magazine is unavailable for setup");
    assert.match(await magazineOption.innerText(), /contained: move to Loose/);
    await magazineSetup.getByText("Move this magazine to Loose in Inventory before filling or emptying it.", { exact: true }).waitFor();
    assert.equal(await magazineSetup.getByRole("button", { name: "Add rounds", exact: true }).isDisabled(), true);
    await moveCopy(f.mag, null);
    await until(async () => (await magazineOption.getAttribute("disabled")) === null, "retrieved magazine is available without reload");
    await until(async () => !(await magazineSetup.getByRole("button", { name: "Add rounds", exact: true }).isDisabled()), "retrieved magazine may be filled");
    await moveCopy(f.gun, f.a);
    await firearmSetup.getByText("Move this firearm to Loose in Inventory before loading, unloading, or changing its magazine.", { exact: true }).waitFor();
    await firearmSetup.screenshot({ path: `${artifacts}/specialized-setup.png` });
    await moveCopy(f.gun, null);
    console.log("PASS: contained specialized copies show unavailable controls; retrieval refreshes them without reload");
    await moveStack(null, f.a, 4);
    await until(async () => (await pool.query("select quantity from inventory_stack_location where character_id=$1 and item_id=$2 and container_instance_id=$3", [f.heroId, f.suppliesId, f.a])).rows[0]?.quantity === 4, "partial stack persisted");
    await moveStack(null, f.b, 3);
    await moveStack(null, f.pouch, 2);
    await moveCopy(f.pouch, f.a); await moveCopy(f.exact, f.a); await moveCopy(f.exact, null);
    await row("", f.a).getByText(`Contents of ${backpackName} #${f.a} (2)`, { exact: true }).click();
    await row("", f.a).getByText(`Contents of Belt Pouch #${f.pouch} (1)`, { exact: true }).click();
    assert.match(await row("Supplies").innerText(), new RegExp(`${backpackName} #${f.a} → Belt Pouch #${f.pouch}`));
    const before = (await pool.query("select * from inventory_stack_location where character_id=$1 order by container_instance_id", [f.heroId])).rows;
    await moveStack(null, f.pouch, 4);
    await page.getByRole("alert").filter({ hasText: /weight capacity/ }).waitFor();
    assert.deepEqual((await pool.query("select * from inventory_stack_location where character_id=$1 order by container_instance_id", [f.heroId])).rows, before);
    await page.screenshot({ path: `${artifacts}/god-desktop.png`, fullPage: true });
    await page.reload(); await page.locator("#character-tab-equipment").click(); await page.getByText(/Carried weight:/).waitFor();
    assert.match(await row("Supplies").innerText(), /11 × Loose/);
    console.log("PASS: G.O.D. partial stack moves, separate backpacks, exact move/return, nesting, overload rejection and reload persistence");
    const player = await login(playerId); await openEquipment(player, `/realms/characters/${f.heroId}`);
    assert.equal(await player.locator(".character-owned-equipment").getByRole("button", { name: /Add Items|Remove/ }).count(), 0);
    const supplies = player.locator(".character-owned-equipment__row").filter({ has: player.getByText("Supplies", { exact: true }) });
    await supplies.getByRole("button", { name: "Move", exact: true }).click(); await supplies.getByLabel("From", { exact: true }).selectOption(String(f.b));
    await supplies.getByLabel("Destination", { exact: true }).selectOption("loose"); await supplies.getByLabel("Quantity to move", { exact: true }).fill("1"); await supplies.getByRole("button", { name: "Move Item", exact: true }).click();
    await until(async () => (await pool.query("select quantity from inventory_stack_location where character_id=$1 and item_id=$2 and container_instance_id=$3", [f.heroId, f.suppliesId, f.b])).rows[0]?.quantity === 2, "Player move persisted");
    await player.setViewportSize({ width: 390, height: 844 });
    assert.equal(await player.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await player.screenshot({ path: `${artifacts}/player-mobile.png`, fullPage: true });
    await player.reload(); await player.locator("#character-tab-equipment").click(); await player.getByText(/Carried weight:/).waitFor();
    assert.match(await supplies.innerText(), /12 × Loose/);
    await pool.query("update campaign_session_encounter set status='active',completed_at=null where id=$1", [f.encounterId]);
    await player.reload(); await player.locator("#character-tab-equipment").click(); await player.getByText(/Container handling and Initiative rules are not implemented yet/).waitFor();
    assert.equal(await supplies.getByRole("button", { name: "Move", exact: true }).isDisabled(), true);
    console.log("PASS: Player organization without Add/Remove privileges, phone layout, persistence and active-combat explanation");
    await page.goto(`${base}/heavens/equipment`);
    await page.locator("#item-search").fill(backpackName);
    await page.locator(".skill-library__row").filter({ hasText: backpackName }).click();
    assert.equal(await page.getByLabel("Is Container", { exact: false }).isChecked(), true);
    await page.getByLabel("Contents weight capacity (lb)", { exact: true }).fill("31");
    await page.getByLabel("Allow nested containers", { exact: true }).uncheck();
    await page.getByLabel("Allowed content categories", { exact: true }).fill("Fixture");
    await page.getByLabel("Allowed content record types", { exact: true }).fill("Item");
    await page.getByLabel("External volume (L)", { exact: true }).fill("11");
    await page.getByRole("button", { name: "Save Item", exact: true }).click(); await page.getByText(`${backpackName} was saved.`, { exact: true }).waitFor();
    await page.reload(); await page.locator("#item-search").fill(backpackName); await page.locator(".skill-library__row").filter({ hasText: backpackName }).click();
    assert.equal(await page.getByLabel("Contents weight capacity (lb)", { exact: true }).inputValue(), "31");
    assert.equal(await page.getByLabel("External volume (L)", { exact: true }).inputValue(), "11");
    assert.equal(await page.getByLabel("Allow nested containers", { exact: true }).isChecked(), false);
    assert.equal(await page.getByLabel("Allowed content categories", { exact: true }).inputValue(), "Fixture");
    assert.equal(await page.getByLabel("Allowed content record types", { exact: true }).inputValue(), "Item");
    assert.equal(await page.getByLabel("Contained weight behavior", { exact: true }).inputValue(), "normal");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Help for Contents weight capacity (lb)", exact: true }).count();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `${artifacts}/authoring-mobile.png`, fullPage: true });
    const { runContainerMagicBrowser } = await import("./container-magic-browser");
    await runContainerMagicBrowser({ page, player, base, f, backpackName, until });
    assert.deepEqual(errors, []);
    console.log("PASS: physical Item authoring save/reload, narrow layout and zero browser page errors");
  } catch (error) {
    if (page) await page.screenshot({ path: `${artifacts}/failure.png`, fullPage: true }).catch(() => undefined);
    throw error;
  } finally {
    if (browser) await browser.close();
    if (server.pid && server.exitCode === null) {
      if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); else server.kill("SIGTERM");
      await new Promise<void>(resolve => { if (server.exitCode !== null) resolve(); else server.once("exit", () => resolve()); });
    }
    await writeFile(`${artifacts}/server.log`, logs);
    const current = JSON.parse(await readFile("tsconfig.json", "utf8"));
    current.include = current.include.filter((entry: string) => !entry.startsWith(".next-container-physical-browser/"));
    if (JSON.stringify(current) === JSON.stringify(JSON.parse(originalTsconfig))) await writeFile("tsconfig.json", originalTsconfig);
  }
}
