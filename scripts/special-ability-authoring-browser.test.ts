import assert from "node:assert/strict";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { hashPassword } from "better-auth/crypto";
import { chromium, type Page, type Locator } from "playwright-core";
import { createEmptySpell } from "../src/features/spell-construction/utilities/spellFactory";
import { checkToolboxAuthoring } from "./special-ability-toolbox-browser";

assert.equal(process.env.SERRIAN_MECHANICS_DISPOSABLE, "true");
assert.match(process.env.DATABASE_URL ?? "", /^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_mechanics_authoring_dev$/);
const port = Number(process.env.MECHANICS_BROWSER_PORT), url = `http://localhost:${port}`;
assert.ok(port > 0);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const artifacts = path.resolve("artifacts/guidance/special-ability-pass-4"), distName = ".next-special-ability-authoring", dist = path.resolve(distName);
const user = "synthetic-mechanics-author", password = "Synthetic-Mechanics-Only-123!", type = "special-ability-mechanics";
async function eventually(check: () => Promise<boolean>, message: string) {
  for (let i = 0; i < 120; i++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 250)); }
  throw new Error(message);
}
async function seedSkill(name: string, standard = false) {
  return (await pool.query("insert into skill(name,classification,definition,created_by_user_id,primary_attribute,tier) values($1,$2,'Synthetic definition only.',$3,$4,$5) returning id", [name, standard ? "standard" : "special ability", user, standard ? "STR" : null, standard ? 1 : null])).rows[0].id as number;
}
async function extension(id: number, family = type) { return (await pool.query("select * from skill_extension where skill_id=$1 and extension_type=$2", [id, family])).rows[0]; }
async function store(id: number, family: string, version: number, data: string) { await pool.query("insert into skill_extension(skill_id,extension_type,schema_version,data_json) values($1,$2,$3,$4)", [id, family, version, data]); }
const rule = { key: "saved-rule", kind: "capability", domain: "other", title: "Synthetic historical capability", description: "Synthetic history.", when: { mode: "always" }, limitations: "", notes: "", references: [] };

async function main() {
  await mkdir(artifacts, { recursive: true });
  const log = createWriteStream(path.join(artifacts, "server.log"));
  let server: ChildProcess | null = null, browser: Awaited<ReturnType<typeof chromium.launch>> | null = null, page: Page | null = null;
  const checks: string[] = [], errors: string[] = [];
  try {
    await pool.query('insert into "user"(id,name,email,email_verified,username,display_username) values($1,$1,$2,true,$1,$1)', [user, user + "@example.invalid"]);
    await pool.query("insert into account(id,issuer,account_id,provider_id,user_id,password,updated_at) values($1,'local:credential',$2,'credential',$2,$3,now())", [user + "-credential", user, await hashPassword(password)]);
    await pool.query("insert into user_role(user_id,role) values($1,'admin')", [user]);
    const ability = await seedSkill("Synthetic Author Ability"), ordinary = await seedSkill("Synthetic Ordinary Skill", true), target = await seedSkill("Synthetic Skill Reference");
    const derived = (await pool.query("insert into derived_ability(name,created_by_user_id) values('Synthetic Derived Reference',$1) returning id", [user])).rows[0].id;
    const archived = await seedSkill("Synthetic Archived Reference");
    await pool.query("update skill set archived_at=now(),archived_by_user_id=$1 where id=$2", [user, archived]);
    const future = await seedSkill("Synthetic Future Ability"), invalid = await seedSkill("Synthetic Invalid Ability"), history = await seedSkill("Synthetic Historical Ability");
    await store(future, type, 99, ' { "schemaVersion":99, "futureRule":true } ');
    await store(invalid, type, 1, '{');
    await store(history, type, 1, JSON.stringify({ schemaVersion: 1, rules: [{ ...rule, references: [{ kind: "skill", skillId: archived }], when: { mode: "requirements", groups: [{ key: "saved-group", conditions: [{ key: "saved-progress", kind: "self-progression", operator: "gte", requiredValue: 12 }] }] } }] }));
    await store(ability, "synthetic-future-family", 9, ' { "keep" : "exact bytes" } ');
    const spell = createEmptySpell(); await store(ability, "spell-construction", spell.schemaVersion, JSON.stringify(spell));
    const untouched = await extension(ability, "synthetic-future-family"), originalSpell = await extension(ability, "spell-construction"), originalFuture = await extension(future);
    assert.equal(path.dirname(dist), process.cwd()); assert.equal(path.basename(dist), distName);
    await rm(dist, { recursive: true, force: true });
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(port)], { windowsHide: true,
      env: { ...process.env, BETTER_AUTH_URL: url, SERRIAN_TEST_NEXT_DIST_DIR: distName }, stdio: ["ignore", "pipe", "pipe"] });
    server.stdout?.pipe(log); server.stderr?.pipe(log);
    await eventually(async () => { if (server?.exitCode !== null) throw new Error("Next exited"); try { return (await fetch(url)).status < 500; } catch { return false; } }, "Server did not start");
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
    page = await browser.newPage({ viewport: { width: 1365, height: 950 } });
    page.on("pageerror", error => errors.push(error.message));
    page.setDefaultTimeout(15000);
    await page.goto(url + "/login"); await page.locator('input[name="username"]').fill(user + "@example.invalid"); await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: "Enter", exact: true }).click(); await page.waitForURL(current => !current.pathname.startsWith("/login"));
    await page.goto(url + "/heavens/skills");
    const p = page;
    const editor = p.locator(".skill-editor");
    async function open(name: string) {
      await p.getByRole("button", { name: "List View", exact: true }).click();
      await p.locator("#skill-list-search").fill(name);
      await p.locator(".skill-library__row").filter({ hasText: name }).click();
      await editor.getByRole("heading", { name, exact: true }).waitFor();
    }
    const tab = (name: string) => editor.getByRole("button", { name, exact: true });
    const mechanics = p.locator(".mechanics-editor");
    async function save() {
      await tab("Save Skill").click();
      await eventually(async () => {
        const confirm = p.getByRole("button", { name: "Confirm Structural Change", exact: true });
        if (await confirm.count() && await confirm.isVisible()) await confirm.click();
        return await p.locator(".skill-editor__feedback.is-success").count() > 0;
      }, "Skill save failed: " + await editor.innerText());
    }
    await open("Synthetic Ordinary Skill"); assert.equal(await tab("Special Ability Mechanics").count(), 0);
    await open("Synthetic Author Ability"); await tab("Special Ability Mechanics").click();
    assert.match(await mechanics.innerText(), /Definition only/); assert.equal(await extension(ability), undefined);
    await mechanics.getByRole("button", { name: "Add Structured Mechanics", exact: true }).click(); assert.equal(await extension(ability), undefined);
    await save(); assert.deepEqual(JSON.parse((await extension(ability)).data_json).rules, []);
    checks.push("classification gating; opening does not attach; deliberate empty attachment persists");
    await mechanics.getByRole("button", { name: "Add Capability Rule", exact: true }).click();
    await tab("Save Skill").click();
    await p.locator(".skill-editor__feedback.is-error").filter({ hasText: "nonblank" }).waitFor();
    assert.deepEqual(JSON.parse((await extension(ability)).data_json).rules, []);
    const card = (title: string) => mechanics.locator("[data-rule-key]").filter({ has: p.getByRole("heading", { name: title, exact: true }) });
    let capability = mechanics.locator("[data-rule-key]").first();
    await capability.getByLabel("Rule Title", { exact: true }).fill("Synthetic Capability");
    await capability.getByLabel("Rule Description", { exact: true }).fill("Synthetic description without automatic effects.");
    await capability.getByLabel("Capability Domain", { exact: true }).selectOption("communication");
    await capability.getByLabel("Applies When", { exact: true }).selectOption("always");
    await capability.getByLabel("Limitations", { exact: true }).fill("Synthetic limitation.");
    await capability.getByLabel("Notes", { exact: true }).fill("Synthetic author note.");
    await capability.getByRole("button", { name: "Add Skill Reference", exact: true }).click();
    await capability.getByLabel("Selected Skill", { exact: true }).selectOption(String(target));
    await capability.getByRole("button", { name: "Add Derived Ability Reference", exact: true }).click();
    await capability.getByLabel("Selected Derived Ability", { exact: true }).selectOption(String(derived));
    const capabilityKey = await capability.getAttribute("data-rule-key");
    await mechanics.getByRole("button", { name: "Add Manual / G.O.D. Rule", exact: true }).click();
    const manual = mechanics.locator("[data-rule-key]").last();
    await manual.getByLabel("Rule Title", { exact: true }).fill("Synthetic Manual");
    await manual.getByLabel("Rule Description", { exact: true }).fill("A synthetic authored manual mechanic.");
    await manual.getByLabel("G.O.D. Determination", { exact: true }).fill("Determine the synthetic context.");
    await manual.getByRole("button", { name: "Add Way to Qualify", exact: true }).click();
    const group = manual.locator("[data-group-key]").first();
    async function addCondition(group: Locator, kind: string) {
      await group.getByLabel("New condition type", { exact: true }).selectOption(kind);
      await group.getByRole("button", { name: "Add Condition", exact: true }).click();
      return group.locator("[data-condition-key]").last();
    }
    let condition = await addCondition(group, "skill-possession");
    await condition.getByLabel("Selected Skill", { exact: true }).selectOption(String(target));
    assert.equal(await condition.locator(`option[value="${archived}"]`).count(), 0);
    await condition.getByLabel("Possession", { exact: true }).selectOption("not-possessed");
    condition = await addCondition(group, "derived-ability-possession"); await condition.getByLabel("Selected Derived Ability", { exact: true }).selectOption(String(derived));
    condition = await addCondition(group, "manual"); await condition.getByLabel("Manual condition", { exact: true }).fill("Synthetic AND condition.");
    await manual.getByRole("button", { name: "Add Way to Qualify", exact: true }).click();
    const groupTwo = manual.locator("[data-group-key]").last();
    condition = await addCondition(groupTwo, "manual"); await condition.getByLabel("Manual condition", { exact: true }).fill("Synthetic OR alternative.");
    const identity = await manual.locator("[data-condition-key]").evaluateAll(rows => rows.map(row => row.getAttribute("data-condition-key")));
    await group.locator("[data-condition-key]").nth(1).getByRole("button", { name: "Move Condition Up", exact: true }).click();
    await groupTwo.getByRole("button", { name: "Move Way Up", exact: true }).click();
    capability = card("Synthetic Capability"); await capability.getByLabel("Rule Title", { exact: true }).fill("Synthetic Capability Renamed");
    await card("Synthetic Capability Renamed").getByRole("button", { name: "Move Rule Down", exact: true }).click();
    await save();
    const saved = JSON.parse((await extension(ability)).data_json);
    assert.equal(saved.rules[1].key, capabilityKey);
    assert.deepEqual(saved.rules[0].when.groups.flatMap((g: { conditions: { key: string }[] }) => g.conditions.map(c => c.key)).sort(), identity.sort());
    assert.deepEqual(await extension(ability, "synthetic-future-family"), untouched); assert.deepEqual(await extension(ability, "spell-construction"), originalSpell);
    await mechanics.getByRole("heading", { name: "Special Ability Mechanics", exact: true }).scrollIntoViewIfNeeded();
    await p.screenshot({ path: path.join(artifacts, "desktop-editor.png"), fullPage: true });
    checks.push("Capability and Manual authoring; AND/OR groups; typed pickers; archived discovery exclusion; stable keys through rename/reorder; independent extensions");
    await tab("Preview").click(); await editor.getByRole("heading", { name: "Special Ability Mechanics Preview", exact: true }).waitFor();
    assert.match(await editor.innerText(), /No Character has been evaluated/); assert.match(await editor.innerText(), /Synthetic Skill Reference/);
    await p.screenshot({ path: path.join(artifacts, "desktop-preview.png"), fullPage: true });
    await p.setViewportSize({ width: 390, height: 844 }); await tab("Special Ability Mechanics").click();
    await mechanics.getByRole("button", { name: "Edit Rule", exact: true }).first().click();
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "Mobile page overflow");
    await p.screenshot({ path: path.join(artifacts, "mobile-editor.png"), fullPage: true });
    await mechanics.locator("[data-group-key]").first().scrollIntoViewIfNeeded();
    await p.screenshot({ path: path.join(artifacts, "mobile-conditions-viewport.png") });
    checks.push("definition-only preview; desktop 1365px and mobile 390px layout without horizontal overflow");
    // Archive a newly selected target after discovery: the server must reject it.
    await pool.query("update derived_ability set archived_at=now(),archived_by_user_id=$1 where id=$2", [user, derived]);
    const raceTarget = await seedSkill("Synthetic Late Archive Reference");
    await tab("Preview").click(); await tab("Special Ability Mechanics").click();
    const expandedManual = card("Synthetic Manual");
    if (await expandedManual.getByRole("button", { name: "Edit Rule", exact: true }).count()) await expandedManual.getByRole("button", { name: "Edit Rule", exact: true }).click();
    await expandedManual.getByRole("button", { name: "Add Skill Reference", exact: true }).click();
    await expandedManual.getByLabel("Selected Skill", { exact: true }).last().selectOption(String(raceTarget));
    await pool.query("update skill set archived_at=now(),archived_by_user_id=$1 where id=$2", [user, raceTarget]);
    await tab("Save Skill").click(); await p.locator(".skill-editor__feedback.is-error").filter({ hasText: "Archived reference" }).waitFor();
    assert.equal(await expandedManual.getByLabel("Selected Skill", { exact: true }).last().inputValue(), String(raceTarget));
    await expandedManual.getByRole("button", { name: "Remove Reference", exact: true }).last().click(); await save();
    checks.push("server rejects newly archived selection and preserves the draft; retained archived Derived references remain saveable");
    // Concurrent core writer cannot be overwritten; reload is a deliberate discard.
    await pool.query("update skill set definition='Synthetic concurrent definition.',updated_at=now() where id=$1", [ability]);
    await tab("Core Details").click(); await editor.getByLabel("Definition", { exact: true }).fill("Synthetic unsaved local work.");
    await tab("Save Skill").click(); await p.locator(".skill-editor__feedback.is-error").filter({ hasText: "Reload" }).waitFor();
    assert.equal(await editor.getByLabel("Definition", { exact: true }).inputValue(), "Synthetic unsaved local work.");
    await tab("Review Reload of Saved Skill").click(); await p.getByRole("button", { name: "Keep Editing", exact: true }).click();
    assert.equal(await editor.getByLabel("Definition", { exact: true }).inputValue(), "Synthetic unsaved local work.");
    await tab("Review Reload of Saved Skill").click(); await p.getByRole("button", { name: "Discard Changes", exact: true }).click();
    await eventually(async () => await editor.getByLabel("Definition", { exact: true }).inputValue() === "Synthetic concurrent definition.", "Reload did not load saved data");
    checks.push("stale revision rejected; draft retained; explicit reload confirmation with Keep Editing");
    await open("Synthetic Historical Ability"); await tab("Special Ability Mechanics").click(); await mechanics.getByRole("button", { name: "Edit Rule", exact: true }).click();
    assert.match(await mechanics.innerText(), /purchased-point interpretation not yet finalized/); assert.match(await mechanics.innerText(), /Archived reference retained/);
    assert.equal(await mechanics.locator('input[type="number"],option[value="self-progression"]').count(), 0);
    await save(); assert.equal(JSON.parse((await extension(history)).data_json).rules[0].when.groups[0].conditions[0].requiredValue, 12);
    for (const name of ["Synthetic Future Ability", "Synthetic Invalid Ability"]) {
      await open(name); await tab("Special Ability Mechanics").click();
      assert.equal(await mechanics.getByRole("button", { name: "Add Capability Rule", exact: true }).count(), 0);
      assert.match(await mechanics.innerText(), /preserv/);
      await tab("Core Details").click(); await editor.getByLabel("Definition", { exact: true }).fill("Synthetic safe core update."); await save();
    }
    assert.deepEqual(await extension(future), originalFuture); assert.equal((await extension(invalid)).data_json, "{");
    checks.push("provisional progression read-only; retained archived labels; invalid and future bytes preserved on core saves");
    await open("Synthetic Author Ability"); await tab("Special Ability Mechanics").click();
    await mechanics.locator("[data-rule-key]").first().getByRole("button", { name: "Remove Rule", exact: true }).click();
    await mechanics.getByRole("button", { name: "Confirm Remove Rule", exact: true }).click(); await save();
    assert.equal(JSON.parse((await extension(ability)).data_json).rules.length, 1);
    await tab("Core Details").click(); await editor.getByLabel("Primary Attribute", { exact: true }).selectOption("STR"); await editor.getByLabel("Tier", { exact: true }).fill("1");
    assert.match(await editor.innerText(), /Mechanics remain attached/); await tab("Special Ability Mechanics").click();
    assert.ok(await mechanics.getByRole("button", { name: "Add Capability Rule", exact: true }).isDisabled());
    await mechanics.getByRole("button", { name: "Detach Mechanics", exact: true }).click(); await mechanics.getByRole("button", { name: "Keep Mechanics", exact: true }).click();
    assert.ok(await extension(ability));
    await mechanics.getByRole("button", { name: "Detach Mechanics", exact: true }).click(); await mechanics.getByRole("button", { name: "Confirm Detach Mechanics", exact: true }).click();
    await save(); assert.equal(await extension(ability), undefined);
    assert.deepEqual(await extension(ability, "synthetic-future-family"), untouched); assert.deepEqual(await extension(ability, "spell-construction"), originalSpell);
    assert.equal(await extension(ordinary), undefined);
    checks.push("rule removal; classification-change warning; deliberate detach and cancel; Spell Construction/unknown bytes survive");
    const toolbox = await seedSkill("Synthetic Toolbox Ability");
    const toolboxDerived = (await pool.query("insert into derived_ability(name,created_by_user_id) values('Synthetic Toolbox Derived',$1) returning id", [user])).rows[0].id;
    await store(toolbox, type, 1, JSON.stringify({ schemaVersion: 1, rules: [rule] }));
    await store(toolbox, "spell-construction", spell.schemaVersion, JSON.stringify(spell));
    await store(toolbox, "synthetic-future-family", 9, ' { "keep" : "exact v2 bytes" } ');
    const toolboxSpell = await extension(toolbox, "spell-construction"), toolboxUnknown = await extension(toolbox, "synthetic-future-family");
    await open("Synthetic Toolbox Ability"); await tab("Special Ability Mechanics").click();
    checks.push(...await checkToolboxAuthoring({ page: p, targetId: target, derivedId: toolboxDerived, artifacts, save, read: () => extension(toolbox) }));
    assert.deepEqual(await extension(toolbox, "spell-construction"), toolboxSpell); assert.deepEqual(await extension(toolbox, "synthetic-future-family"), toolboxUnknown);
    assert.deepEqual(errors, []);
    await writeFile(path.join(artifacts, "report.json"), JSON.stringify({ checks, browserErrors: errors, widths: [1365, 390], database: "disposable only" }, null, 2));
    console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
  } catch (error) {
    if (page) { await page.screenshot({ path: path.join(artifacts, "failure.png"), fullPage: true }).catch(() => {}); await writeFile(path.join(artifacts, "failure.txt"), await page.locator("body").innerText()); }
    throw error;
  } finally {
    if (browser) await browser.close();
    if (server?.pid) {
      if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
      else server.kill("SIGTERM");
    }
    log.end(); await pool.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
