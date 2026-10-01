import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { hashPassword } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { chromium } from "playwright-core";
import { DAMAGE_TYPES } from "../src/features/damage-types/damage-types";
import { APPEARANCE_PRESETS, getAppearanceCssVariables } from "../src/features/appearance/appearance";

async function freePort() {
  const listener = createServer();
  await new Promise<void>((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const address = listener.address();
  assert.ok(address && typeof address === "object");
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

test("Damage type dropdowns save approved multi-type attacks and armor with guarded legacy values", { timeout: 300_000 }, async () => {
  const parent = path.resolve(tmpdir());
  const root = path.resolve(await mkdtemp(path.join(parent, "serrian-damage-types-")));
  assert.equal(path.dirname(root), parent);
  assert.ok(path.basename(root).startsWith("serrian-damage-types-"));
  const data = path.join(root, "data");
  const bin = process.env.SERRIAN_TEST_POSTGRES_BIN ?? "C:/Program Files/PostgreSQL/18/bin";
  const exe = (name: string) => path.join(bin, `${name}${process.platform === "win32" ? ".exe" : ""}`);
  const databasePort = await freePort();
  const appPort = await freePort();
  const baseUrl = `http://localhost:${appPort}`;
  const databaseUrl = `postgresql://postgres@127.0.0.1:${databasePort}/serrian_damage_types_dev`;
  const distName = `.next-damage-types-${appPort}`;
  const distPath = path.resolve(distName);
  assert.equal(path.dirname(distPath), process.cwd());
  const tsconfigPath = path.resolve("tsconfig.json");
  const tsconfigBefore = await readFile(tsconfigPath);
  const artifacts = path.resolve("artifacts/guidance/damage-types");
  await mkdir(artifacts, { recursive: true });
  let started = false;
  let pool: pg.Pool | null = null;
  let server: ChildProcess | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    execFileSync(exe("initdb"), ["--auth=trust", "--encoding=UTF8", "--no-locale", "--username=postgres", "-D", data], { stdio: "pipe", windowsHide: true });
    execFileSync(exe("pg_ctl"), ["-D", data, "-l", path.join(root, "postgres.log"), "-o", `-p ${databasePort} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore", windowsHide: true });
    started = true;
    pool = new pg.Pool({ connectionString: `postgresql://postgres@127.0.0.1:${databasePort}/postgres` });
    await pool.query("create database serrian_damage_types_dev");
    await pool.end();
    pool = new pg.Pool({ connectionString: databaseUrl });
    await migrate(drizzle(pool), { migrationsFolder: path.resolve("drizzle") });
    const userId = "item-tag-browser-god", password = "Item-Tag-Browser-Only!", email = "item-tag-browser@example.invalid";
    await pool.query('insert into "user"(id,name,email,email_verified,username,display_username) values($1,$1,$2,true,$1,$1)', [userId, email]);
    await pool.query("insert into account(id,issuer,account_id,provider_id,user_id,password,updated_at) values($1,'local:credential',$2,'credential',$2,$3,now())", [`${userId}-credential`, userId, await hashPassword(password)]);
    await pool.query("insert into user_role(user_id,role) values($1,'god')", [userId]);
    const environment: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: databaseUrl, BETTER_AUTH_URL: baseUrl, SERRIAN_TEST_NEXT_DIST_DIR: distName, NEXT_TELEMETRY_DISABLED: "1" };
    delete environment.NODE_TEST_CONTEXT;
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(appPort)], { env: environment, stdio: "inherit", windowsHide: true });
    const deadline = Date.now() + 90_000;
    let ready = false;
    while (Date.now() < deadline) {
      assert.equal(server.exitCode, null, "The test app must stay running");
      try { if ((await fetch(baseUrl)).ok) { ready = true; break; } } catch { /* Starting. */ }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.ok(ready, "The test app must become ready");
    browser = await chromium.launch({ executablePath: process.env.SERRIAN_TEST_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${baseUrl}/login`);
    await page.getByLabel("Username or Email").fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: /^Enter$/ }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));

    const button = (name: string) => page.getByRole("button", { name, exact: true });
    for (const scope of ["equipment", "inventory"] as const) {
      const name = `Damage dropdown ${scope}`;
      await page.goto(`${baseUrl}/heavens/${scope}`);
      await button(scope === "equipment" ? "New Equipment" : "New Item").click();
      await page.getByLabel("Name", { exact: true }).fill(name);
      await button("Weapon / Ammunition").click();
      await button("Add Weapon / Ammunition Profile").click();
      const selector = page.getByLabel("Damage Type", { exact: true });
      assert.deepEqual(await selector.locator("option").allTextContents(), ["Unspecified", ...DAMAGE_TYPES]);
      await selector.selectOption("Ballistic");
      await page.getByLabel("Add damage type", { exact: true }).selectOption("Fire");
      await button("Save Item").click();
      await page.getByText(`${name} was saved.`, { exact: true }).waitFor();
      const weapon: { id: number; item_id: number; damage_type: string } = (await pool.query("select w.* from weapon_profiles w join items i on i.id=w.item_id where i.name=$1", [name])).rows[0];
      assert.equal(weapon.damage_type, "Ballistic / Fire");
      await page.reload();
      await page.locator(".skill-library__row").filter({ hasText: name }).click();
      await button("Weapon / Ammunition").click();
      assert.deepEqual(await page.getByLabel("Damage Type", { exact: true }).evaluateAll(elements => elements.map(element => (element as HTMLSelectElement).value)), ["Ballistic", "Fire"]);
      await button("Remove Fire damage type").click();
      await button("Save Item").click();
      await page.getByText(`${name} was saved.`, { exact: true }).waitFor();
      assert.equal((await pool.query("select damage_type from weapon_profiles where id=$1", [weapon.id])).rows[0].damage_type, "Ballistic");

      // Tamper with the actual server-action payload, bypassing the approved UI list.
      await page.route("**/heavens/**", async route => {
        const request = route.request();
        if (request.method() === "POST" && request.headers()["next-action"] && request.postData()?.includes('"damageType":"Cold"')) {
          await route.continue({ postData: request.postData()!.replaceAll('"damageType":"Cold"', '"damageType":"pow damage"') });
        } else await route.continue();
      });
      await page.getByLabel("Damage Type", { exact: true }).selectOption("Cold");
      await button("Save Item").click();
      await page.locator(".skill-editor__feedback").filter({ hasText: "unapproved" }).waitFor();
      assert.equal((await pool.query("select damage_type from weapon_profiles where id=$1", [weapon.id])).rows[0].damage_type, "Ballistic");
      await page.unrouteAll();
      await page.getByLabel("Damage Type", { exact: true }).selectOption("Ballistic");
      if (scope === "equipment") {
        await button("Armor").click(); await button("Add Armor Profile").click(); await button("Add Modifier").click();
        await page.getByLabel("Damage Type", { exact: true }).selectOption("Ballistic");
        await page.getByLabel("Add damage type", { exact: true }).selectOption("Fire");
        await page.getByLabel("Modifier", { exact: true }).fill("+2");
        await button("Save Item").click(); await page.getByText(`${name} was saved.`, { exact: true }).waitFor();
        assert.equal((await pool.query("select damage_type from item_armor_damage_modifiers where item_id=$1", [weapon.item_id])).rows[0].damage_type, "Ballistic / Fire");
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator("[data-damage-type-control]").first().evaluate(el => el.scrollIntoView({ block: "center" }));
        await page.waitForTimeout(300); // Let the existing in-place scroll restoration settle before capturing.
        await page.locator("[data-damage-type-control]").first().screenshot({ path: path.join(artifacts, "armor-phone.png") });
        for (const select of await page.locator("[data-damage-type-control] select").all()) {
          assert.equal(await select.evaluate(el => { const rect = el.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth; }), true);
        }
        const selectorStyle = async () => page.getByLabel("Damage Type", { exact: true }).first().evaluate(el => {
          const select = getComputedStyle(el), option = getComputedStyle(el.querySelector("option")!);
          return { background: select.backgroundColor, color: select.color, optionBackground: option.backgroundColor, optionColor: option.color };
        });
        const normalStyle = await selectorStyle();
        const alternate = getAppearanceCssVariables(APPEARANCE_PRESETS.classic);
        await page.locator(".item-section").evaluate((el, variables) => {
          el.setAttribute("data-appearance-theme-scope", "");
          for (const [key, value] of Object.entries(variables)) (el as HTMLElement).style.setProperty(key, value);
        }, alternate);
        await page.waitForTimeout(250); // Wait for the shared control color transition.
        const alternateStyle = await selectorStyle();
        assert.notDeepEqual(normalStyle, alternateStyle, "The selector must follow the scoped appearance colors.");
        assert.notEqual(alternateStyle.background, alternateStyle.color);
        assert.notEqual(alternateStyle.optionBackground, alternateStyle.optionColor);
        await page.locator(".item-section").evaluate(el => { el.removeAttribute("data-appearance-theme-scope"); el.removeAttribute("style"); });
        await page.setViewportSize({ width: 1280, height: 900 });
      }
      // Existing unresolved values remain visible and survive unrelated edits.
      await pool.query("update weapon_profiles set damage_type='Special' where id=$1", [weapon.id]);
      await page.reload(); await page.locator(".skill-library__row").filter({ hasText: name }).click(); await button("Weapon / Ammunition").click();
      assert.equal(await page.getByLabel("Damage Type", { exact: true }).inputValue(), "Special");
      await page.getByRole("alert").filter({ hasText: "saved value needs review" }).waitFor();
      await page.getByLabel("Damage", { exact: true }).fill("3");
      await button("Save Item").click(); await page.getByText(`${name} was saved.`, { exact: true }).waitFor();
      assert.equal((await pool.query("select damage_type from weapon_profiles where item_id=$1", [weapon.item_id])).rows[0].damage_type, "Special");
    }
    // Shared Race/Form attack controls and defense controls use the same multi-type list.
    await page.goto(`${baseUrl}/heavens/races`); await button("New Race").click();
    await page.getByLabel("Name", { exact: true }).fill("Damage dropdown race");
    await button("Natural Attacks").click(); await button("Add Natural Attack").click();
    await page.getByLabel("Attack Name", { exact: true }).fill("Flame claw");
    await page.getByLabel("Damage Type", { exact: true }).selectOption("Slashing");
    await page.getByLabel("Add damage type", { exact: true }).selectOption("Fire");
    await button("Save Race").click(); await page.getByText("Damage dropdown race was saved.", { exact: true }).waitFor();
    assert.equal((await pool.query("select a.damage_type from race_natural_attacks a join races r on r.id=a.race_id where r.name='Damage dropdown race'")).rows[0].damage_type, "Slashing / Fire");
    await button("Mechanics").click(); await button("Add Interaction Rule").click();
    await page.getByLabel("Rule Name", { exact: true }).fill("Thermal defense");
    await page.getByLabel("Rule Type", { exact: true }).selectOption("resistance");
    await page.getByLabel("Amount (%)", { exact: true }).fill("25");
    await page.getByLabel("Damage Type", { exact: true }).selectOption("Fire");
    await page.getByLabel("Add damage type", { exact: true }).selectOption("Cold");
    await button("Save Race").click(); await page.getByText("Damage dropdown race was saved.", { exact: true }).waitFor();
    const defense = (await pool.query("select interaction_rules_json from races where name='Damage dropdown race'")).rows[0].interaction_rules_json;
    assert.equal(defense.rules[0].conditions[0].damageType, "Fire / Cold");

    await page.goto(`${baseUrl}/heavens/creatures`); await button("New Creature").click();
    await page.getByLabel("Canonical Name", { exact: true }).fill("Damage dropdown creature");
    await button("Combat").click(); await button("Add Attack").click();
    const attack = page.getByRole("region", { name: "Attack authoring", exact: true });
    await attack.getByLabel("Attack Name", { exact: true }).fill("Flame claw");
    await attack.getByLabel("Damage Type", { exact: true }).selectOption("Slashing");
    await attack.getByLabel("Add damage type", { exact: true }).selectOption("Fire");
    await button("Save Creature").click(); await page.getByText("Damage dropdown creature was saved.", { exact: true }).waitFor();
    assert.equal((await pool.query("select a.damage_type from creature_attacks a join creatures c on c.id=a.creature_id where c.canonical_name='Damage dropdown creature'")).rows[0].damage_type, "Slashing / Fire");
    await page.setViewportSize({ width: 390, height: 844 });
    await attack.screenshot({ path: path.join(artifacts, "creature-phone.png") });
    assert.deepEqual(errors, []);
    console.log("PASS: approved dropdowns, multiple types, removal, reload, server rejection, retained legacy values, armor and mobile controls");
  } finally {
    if (browser) await browser.close();
    if (server?.pid && server.exitCode === null) {
      if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
      else { server.kill(); await new Promise<void>((resolve) => server!.once("exit", () => resolve())); }
    }
    if (pool) await pool.end();
    if (started && existsSync(path.join(data, "postmaster.pid"))) execFileSync(exe("pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"], { stdio: "ignore", windowsHide: true });
    assert.equal(existsSync(path.join(data, "postmaster.pid")), false);
    await rm(root, { recursive: true, force: true });
    await rm(distPath, { recursive: true, force: true });
    await writeFile(tsconfigPath, tsconfigBefore);
  }
});
