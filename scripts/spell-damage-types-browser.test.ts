import assert from "node:assert/strict";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { hashPassword } from "better-auth/crypto";
import { chromium, type Page } from "playwright-core";
import { createContainer, createEmptySpell, createModifierSelection } from "../src/features/spell-construction/utilities/spellFactory";
import { DAMAGE_TYPES } from "../src/features/damage-types/damage-types";
import { calculateSpell } from "../src/features/spell-construction/engine/calculateSpell";
import { parseSpellDocument } from "../src/features/spell-construction/spellDocumentCodec";

assert.equal(process.env.SERRIAN_SPELL_DAMAGE_DISPOSABLE, "true");
assert.match(process.env.DATABASE_URL ?? "", /^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_spell_damage_types_dev$/);
const port = Number(process.env.SPELL_DAMAGE_BROWSER_PORT), url = `http://localhost:${port}`;
assert.ok(port > 0);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const artifacts = path.resolve("artifacts/guidance/spell-damage-types"), user = "synthetic-spell-type-author", password = "Synthetic-Spell-Only-123!";
async function eventually(check: () => Promise<boolean>, message: string) {
  for (let i = 0; i < 180; i++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 250)); }
  throw new Error(message);
}
async function main() {
  await mkdir(artifacts, { recursive: true }); const log = createWriteStream(path.join(artifacts, "server.log"));
  let server: ChildProcess | null = null, browser: Awaited<ReturnType<typeof chromium.launch>> | null = null, page: Page | null = null;
  const errors: string[] = [];
  try {
    await pool.query('insert into "user"(id,name,email,email_verified,username,display_username) values($1,$1,$2,true,$1,$1)', [user, user + "@example.invalid"]);
    await pool.query("insert into account(id,issuer,account_id,provider_id,user_id,password,updated_at) values($1,'local:credential',$2,'credential',$2,$3,now())", [user + "-credential", user, await hashPassword(password)]);
    await pool.query("insert into user_role(user_id,role) values($1,'admin')", [user]);
    const seed = async (name: string, tier: number) => (await pool.query("insert into skill(name,classification,definition,created_by_user_id,primary_attribute,tier) values($1,'standard','Synthetic browser fixture',$2,'INT',$3) returning id", [name, user, tier])).rows[0].id as number;
    const root = await seed("Spellcraft", 1), sphere = await seed("Force", 2), id = await seed("Synthetic Typed Spell", 3);
    await pool.query("insert into skill_relationship(skill_id,related_skill_id,relationship_type) values($1,$2,'parent'),($3,$1,'parent')", [sphere, root, id]);
    const document = parseSpellDocument({ ...createEmptySpell(), name: "Synthetic Typed Spell", frameworkSkillId: sphere, sphere: "Force",
      modifiers: [createModifierSelection("progressive-spell")], containers: [{ ...createContainer(), id: "browser-target", rangeRuleId: "short", effects: [
        { id: "browser-fire", ruleId: "damage", quantity: 3, description: "First effect" },
        { id: "browser-cold", ruleId: "damage", quantity: 2, description: "Second effect" },
        { id: "browser-heal", ruleId: "healing", quantity: 1, healingScope: "full-body", description: "Healing" },
        { id: "browser-buff", ruleId: "buff", quantity: 1, description: "Narrative does not choose a modifier" },
      ] , durations: [{ id: "browser-duration", ruleId: "combat-step", quantity: 0 }] }] });
    await pool.query("insert into skill_extension(skill_id,extension_type,schema_version,data_json) values($1,'spell-construction',7,$2),($1,'synthetic-unrelated',42,' { \"untouched\": true } ')", [id, JSON.stringify(document)]);
    const read = async () => parseSpellDocument((await pool.query("select data_json from skill_extension where skill_id=$1 and extension_type='spell-construction'", [id])).rows[0].data_json);
    const unrelated = (await pool.query("select * from skill_extension where skill_id=$1 and extension_type='synthetic-unrelated'", [id])).rows[0];
    const baseline = calculateSpell(document);
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(port)], { windowsHide: true,
      env: { ...process.env, BETTER_AUTH_URL: url, SERRIAN_TEST_NEXT_DIST_DIR: ".next-spell-damage-types" }, stdio: ["ignore", "pipe", "pipe"] });
    server.stdout?.pipe(log); server.stderr?.pipe(log);
    await eventually(async () => { if (server?.exitCode !== null) throw new Error("Next exited"); try { return (await fetch(url)).status < 500; } catch { return false; } }, "Server did not start");
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
    page = await browser.newPage({ viewport: { width: 1365, height: 950 } }); const p = page; p.setDefaultTimeout(20000); p.on("pageerror", e => errors.push(e.message));
    await p.goto(url + "/login"); await p.locator('input[name="username"]').fill(user + "@example.invalid"); await p.locator('input[name="password"]').fill(password);
    await p.getByRole("button", { name: "Enter", exact: true }).click(); await p.waitForURL(u => !u.pathname.startsWith("/login"));
    async function open() {
      await p.goto(url + "/heavens/skills"); await p.getByRole("button", { name: "List View", exact: true }).click(); await p.locator("#skill-list-search").fill(document.name);
      await p.locator(".skill-library__row").filter({ hasText: document.name }).click();
      await p.locator(".skill-editor").getByRole("button", { name: "Construction", exact: true }).click();
    }
    async function save() {
      await p.locator(".skill-editor").getByRole("button", { name: "Save Skill", exact: true }).click();
      await eventually(async () => { const confirm = p.getByRole("button", { name: "Confirm Structural Change", exact: true }); if (await confirm.isVisible()) await confirm.click();
        return await p.locator(".skill-editor__feedback.is-success").count() > 0; }, "Spell save did not succeed");
    }
    await open(); const base = p.locator(".spell-builder__containers").first();
    const cards = base.locator(".spell-builder__selection"); assert.equal(await base.locator("[data-damage-type-control]").count(), 2);
    assert.equal(await cards.filter({ hasText: "Healing" }).locator("[data-damage-type-control]").count(), 0);
    const controls = base.locator("[data-damage-type-control]");
    assert.deepEqual(await controls.first().locator("select option").evaluateAll(options => options.map(o => (o as HTMLOptionElement).value).filter(Boolean)), [...DAMAGE_TYPES]);
    const summary = await p.locator(".spell-builder__summary").first().innerText();
    await save(); assert.equal((await read()).containers[0].effects[0].damageType, undefined, "legacy save stays unspecified");
    await controls.first().getByRole("combobox", { name: "Damage Type", exact: true }).selectOption("Fire");
    await controls.first().getByRole("combobox", { name: "Add damage type", exact: true }).selectOption("Supernatural");
    await controls.nth(1).getByRole("combobox", { name: "Damage Type", exact: true }).selectOption("Cold");
    assert.equal(await p.locator(".spell-builder__summary").first().innerText(), summary);
    await save(); const saved = await read(); assert.deepEqual(saved.containers[0].effects.map(e => e.damageType), ["Fire / Supernatural", "Cold", undefined, undefined]);
    assert.deepEqual(calculateSpell(saved), baseline); assert.equal(saved.id, document.id); assert.equal(saved.containers[0].id, document.containers[0].id);
    await open(); assert.deepEqual(await controls.first().getByRole("combobox", { name: "Damage Type", exact: true }).evaluateAll(selects => selects.map(s => (s as HTMLSelectElement).value)), ["Fire", "Supernatural"]);
    await p.getByRole("tab", { name: "Novice", exact: true }).click();
    const inherited = p.locator(".progressive-editor__structure [data-damage-type-control]").first();
    assert.deepEqual(await inherited.getByRole("combobox", { name: "Damage Type", exact: true }).evaluateAll(selects => selects.map(s => (s as HTMLSelectElement).value)), ["Fire", "Supernatural"]);
    await inherited.getByRole("combobox", { name: "Damage Type", exact: true }).first().selectOption("Cold");
    await save();
    const tier = (await read()).progressive.milestones.find(t => t.level === "Novice")!;
    assert.equal(tier.changes.length, 1); assert.equal(tier.changes[0].kind, "set-effect");
    if (tier.changes[0].kind !== "set-effect") throw new Error("Expected one effect metadata change");
    assert.deepEqual(tier.changes[0].effect, { ...saved.containers[0].effects[0], damageType: "Cold / Supernatural" });
    assert.deepEqual(calculateSpell(await read()), baseline);
    const buff = base.locator('.spell-builder__selection').filter({ has: p.getByText('Buff', { exact: true }) }).first();
    await buff.getByText('Runtime Effect / Combat Application', { exact: true }).click();
    await buff.getByLabel('Runtime application', { exact: true }).selectOption('modifier.apply');
    await buff.getByLabel('Label', { exact: true }).fill('Browser Strength');
    await buff.getByLabel('Amount', { exact: true }).fill('2');
    await buff.getByLabel('Harmfulness', { exact: true }).selectOption('false');
    await save();
    const modifier = (await read()).containers[0].effects[3].runtimeApplication!;
    assert.equal(modifier.effect.kind, 'modifier.apply'); assert.equal(modifier.durationSource, 'construction');
    assert.deepEqual(calculateSpell(await read()), baseline);
    await buff.getByLabel('Runtime application', { exact: true }).selectOption('condition.apply');
    await buff.getByLabel('Condition Name', { exact: true }).fill('Browser Mark');
    await buff.getByLabel('Description', { exact: true }).fill('Explicit recorded state');
    await buff.getByLabel('Harmfulness', { exact: true }).selectOption('true');
    await save();
    assert.equal((await read()).containers[0].effects[3].runtimeApplication!.effect.kind, 'condition.apply');
    await open();
    await buff.getByText('Runtime Effect / Combat Application', { exact: true }).click();
    assert.equal(await buff.getByLabel('Condition Name', { exact: true }).inputValue(), 'Browser Mark');
    await base.locator('summary[aria-label="Help for Damage Type"]').first().click();
    assert.match(await base.innerText(), /does not change Mana/);
    await p.screenshot({ path: path.join(artifacts, "desktop.png"), fullPage: true });
    await p.setViewportSize({ width: 390, height: 844 });
    const phoneLayout = await p.locator(".skill-editor__content").evaluate(editor => {
      const fields = Array.from(editor.querySelectorAll<HTMLElement>("[data-damage-type-control]")).map(control => control.parentElement!);
      const previousDisplay = fields.map(field => field.style.display);
      const withDamageTypes = editor.scrollWidth;
      fields.forEach(field => { field.style.display = "none"; });
      const withoutDamageTypes = editor.scrollWidth;
      fields.forEach((field, index) => { field.style.display = previousDisplay[index]; });
      return { availableWidth: editor.clientWidth, withDamageTypes, withoutDamageTypes };
    });
    assert.ok(phoneLayout.withDamageTypes <= phoneLayout.withoutDamageTypes + 1, "Damage Type fields must not widen the existing phone editor");
    await controls.first().scrollIntoViewIfNeeded(); await p.screenshot({ path: path.join(artifacts, "phone.png"), fullPage: true });
    await p.screenshot({ path: path.join(artifacts, "phone-field.png") });
    assert.ok(await p.evaluate(() => globalThis.document.documentElement.scrollWidth <= window.innerWidth + 1), "phone horizontal overflow");
    assert.deepEqual((await pool.query("select * from skill_extension where skill_id=$1 and extension_type='synthetic-unrelated'", [id])).rows[0], unrelated);
    assert.deepEqual(errors, []);
    await writeFile(path.join(artifacts, "report.json"), JSON.stringify({ passed: true, approvedTypes: DAMAGE_TYPES, savedTypes: saved.containers[0].effects.map(e => e.damageType ?? null), calculationUnchanged: true, runtimeAuthoring: ["Modifier saved", "Condition saved and reloaded", "construction duration", "explicit harmfulness"], widths: [1365, 390], phoneLayout, browserErrors: errors }, null, 2));
    console.log("PASS: shared 12 options, Damage-only multi-select, legacy and typed server saves, reload, Progressive inheritance and effect edit, calculation parity, unrelated extension preservation, desktop and phone.");
  } catch (error) {
    if (page) { await page.screenshot({ path: path.join(artifacts, "failure.png"), fullPage: true }).catch(() => {}); await writeFile(path.join(artifacts, "failure.txt"), await page.locator("body").innerText()); } throw error;
  } finally {
    if (browser) await browser.close();
    if (server?.pid) { if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); else server.kill("SIGTERM"); }
    log.end(); await pool.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
