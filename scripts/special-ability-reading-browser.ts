import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type pg from "pg";
import type { Locator, Page } from "playwright-core";
import { syntheticToolbox } from "../src/features/special-abilities/v2-fixtures";
import { newMechanicsRule } from "../src/features/special-abilities/authoring";
import { parseSpecialAbilityMechanics } from "../src/features/special-abilities/codec";
import { capturePaperPdf } from "./character-paper-review";

/** No shared database or real content: called only by the disposable sheet harness. */
export async function rehearseSpecialAbilityReading(pool: pg.Pool, login: (id: string) => Promise<Page>, baseUrl: string, seed: number[]) {
  assert.equal(process.env.SERRIAN_SPECIAL_ABILITY_READ_ONLY, "true");
  assert.equal((await pool.query("select current_database() name")).rows[0].name, "serrian_character_sheet_dev");
  const output = path.resolve("artifacts/guidance/special-ability-pass-5");
  await mkdir(output, { recursive: true });
  const results: string[] = [];
  const insert = async (sql: string, values: unknown[] = []) => Number((await pool.query(sql, values)).rows[0].id);
  const characterId = seed[0];
  const campaignId = (await pool.query("select campaign_id from campaign_character where id=$1", [characterId])).rows[0].campaign_id;
  await pool.query("insert into campaign_allowed_system(campaign_id,system,sort_order) select $1,'Special Abilities',99 where not exists (select 1 from campaign_allowed_system where campaign_id=$1 and system='Special Abilities')", [campaignId]);
  const raceId = (await pool.query("select race_id from campaign_character_profile where character_id=$1", [characterId])).rows[0].race_id;
  const skillId = await insert("insert into skill(name,classification,tier,archived_at,archived_by_user_id) values('Synthetic archived target','standard',1,now(),'sheet-owner') returning id");
  const derivedId = await insert("insert into derived_ability(name,acquisition_type,activation_type,description,mechanical_effect) values('Synthetic Derived candidate','awarded','passive','Synthetic definition.','Manual.') returning id");
  const capability = { ...newMechanicsRule("capability"), title: "Synthetic always capability", description: "A readable racial capability definition.", when: { mode: "always" as const } };
  const gated = { ...capability, key: "gated", title: "Synthetic progression qualification", when: { mode: "requirements" as const, groups: [{ key: "g", conditions: [{ key: "c", kind: "self-progression" as const, operator: "gte" as const, requiredValue: 1 }] }] } };
  const manual = { ...newMechanicsRule("manual"), title: "Synthetic manual ruling", description: "A manual definition.", adjudication: "The G.O.D. determines the described case.", when: { mode: "always" as const } };
  const v2 = syntheticToolbox(skillId, derivedId);
  v2.rules[0].description = "Long resource definition. " + "This authored description explains the fictional reservoir without granting a current balance or spending it. ".repeat(32) + "END-LONG-RESOURCE.";
  const activation = v2.rules.find(rule => rule.kind === "activated")!;
  if (activation.kind !== "activated") throw new Error("Fixture");
  activation.costs.push({ key: "mana", kind: "mana", amount: { kind: "fixed", amount: 3 }, notes: "Definition only." });
  activation.effects.push({ key: "damage", effect: { kind: "health.damage", amount: 3, application: "area", timing: { mode: "over-time", frequency: "combat-rounds", applications: 2, firstApplication: "next-interval" } } });
  for (const kind of ["failure", "critical-success", "critical-failure", "manual"] as const) activation.outcomes.push({ key: kind, kind, description: `Synthetic ${kind} branch.`, effectKeys: ["damage"], adjudication: "Existing roll resolution determines the outcome.", limitations: "Definition only.", notes: "No effect is executed." });
  const missing = syntheticToolbox(2147483647, derivedId);
  for (const doc of [v2, missing, { schemaVersion: 1, rules: [capability, gated, manual] }]) parseSpecialAbilityMechanics(doc);
  const names = ["Synthetic Definition Only", "Synthetic Empty", "Synthetic Racial Zero", "Synthetic Toolbox", "Synthetic Missing Link", "Synthetic Invalid", "Synthetic Future", "Synthetic Unpossessed"];
  const documents = [null, { schemaVersion: 1, rules: [] }, { schemaVersion: 1, rules: [capability, gated, manual] }, v2, missing, "invalid", "future", v2];
  for (const [index, name] of names.entries()) {
    const id = await insert("insert into skill(name,classification,tier,definition) values($1,'Special Ability',1,$2) returning id", [name, `Ordinary Definition for ${name}. This remains readable.`]);
    const doc = documents[index];
    if (doc !== null) await pool.query("insert into skill_extension(skill_id,extension_type,schema_version,data_json) values($1,'special-ability-mechanics',$2,$3)", [id, doc === "future" ? 99 : doc === "invalid" ? 2 : typeof doc === "object" ? doc.schemaVersion : 1, doc === "invalid" ? "{" : doc === "future" ? '{"schemaVersion":99,"future":true}' : JSON.stringify(doc)]);
    if (index === 2) await pool.query("insert into race_skill_links(race_id,skill_id,link_type,value) values($1,$2,'Granted',0)", [raceId, id]);
    else if (index !== 7) await pool.query("insert into campaign_character_skill_allocation(character_id,skill_id,points) values($1,$2,3)", [characterId, id]);
    else await pool.query("insert into campaign_character_skill_allocation(character_id,skill_id,points) values($1,$2,3)", [seed[2], id]);
  }
  const assigner = await login("sheet-owner");
  await assigner.goto(`${baseUrl}/heavens/characters/${characterId}`);
  await assigner.getByRole("tab", { name: "Skills & Abilities", exact: true }).click();
  await assigner.getByRole("tab", { name: /^Special Abilities/ }).click();
  await assigner.getByRole("spinbutton", { name: "Synthetic Definition Only Points Invested", exact: true }).fill("0");
  await assigner.getByRole("button", { name: "Save Character", exact: true }).click();
  await assigner.getByText("G.O.D. changes were saved to the Character record.", { exact: true }).waitFor();
  await assigner.reload();
  await assigner.getByRole("tab", { name: "Skills & Abilities", exact: true }).click();
  await assigner.getByRole("tab", { name: /^Special Abilities/ }).click();
  const assignedRow = assigner.locator(".character-skill-row").filter({ has: assigner.getByRole("spinbutton", { name: "Synthetic Definition Only Points Invested", exact: true }) });
  assert.equal(await assignedRow.getByRole("spinbutton").inputValue(), "0");
  assert.match(await assignedRow.innerText(), /Assigned by G.O.D./);
  const grant = (await pool.query("select a.points,a.special_ability_granted from campaign_character_skill_allocation a join skill s on s.id=a.skill_id where a.character_id=$1 and s.name='Synthetic Definition Only'", [characterId])).rows[0];
  assert.deepEqual(grant, { points: 0, special_ability_granted: true });
  await assigner.close();
  results.push("G.O.D. editor retains zero-point possession through save and reload");
  // Active, frozen encounter: reads must not initialize combat or bypass Freeze.
  const sessionId = await insert("insert into campaign_session(campaign_id,title,sequence_number,status,started_at) values($1,'Synthetic reading Session',1,'active',now()) returning id", [campaignId]);
  const sceneId = await insert("insert into campaign_session_scene(session_id,campaign_id,title,sequence_number,status,started_at) values($1,$2,'Synthetic reading Scene',1,'active',now()) returning id", [sessionId, campaignId]);
  await pool.query("insert into campaign_session_roster(session_id,campaign_id,character_id) values($1,$2,$3)", [sessionId, campaignId, characterId]);
  await pool.query("insert into campaign_session_scene_member(scene_id,session_id,campaign_id,character_id) values($1,$2,$3,$4)", [sceneId, sessionId, campaignId, characterId]);
  const encounterId = await insert("insert into campaign_session_encounter(scene_id,session_id,campaign_id,title,sequence_number,status,started_at,frozen_at,freeze_revision) values($1,$2,$3,'Synthetic frozen inspection',1,'active',now(),now(),1) returning id", [sceneId, sessionId, campaignId]);
  await pool.query("insert into campaign_session_encounter_participant(encounter_id,scene_id,session_id,campaign_id,character_id) values($1,$2,$3,$4,$5)", [encounterId, sceneId, sessionId, campaignId, characterId]);
  const tables = (await pool.query("select table_name from information_schema.tables where table_schema='public' and (table_name='campaign_character' or starts_with(table_name,'campaign_character_') or starts_with(table_name,'character_derived_ability') or starts_with(table_name,'campaign_session') or starts_with(table_name,'item') or starts_with(table_name,'inventory_') or starts_with(table_name,'character_form')) order by table_name")).rows;
  const snapshot = async () => {
    const states: Record<string, unknown> = {};
    for (const { table_name: table } of tables) { assert.match(table, /^[a-z_]+$/); states[table] = (await pool.query(`select to_jsonb(t) body from "${table}" t order by to_jsonb(t)::text`)).rows; }
    return states;
  };
  const before = await snapshot();
  const page = await login("sheet-player");
  const reference = (page: Page) => page.getByRole("region", { name: "Special Ability mechanics", exact: true });
  async function expand(view: Locator) { await view.evaluate(element => element.querySelectorAll("details").forEach(detail => detail.open = true)); }
  async function check(view: Locator) {
    await view.waitFor();
    assert.equal(await view.locator(".special-ability-reference__ability").count(), 7);
    await expand(view);
    const text = await view.innerText();
    for (const expected of [...names.slice(0, 7), "Definition only", "contain no rules", "could not be read safely", "newer format", "Current Special Ability Score: 0", "Qualification not matched", "Manual / G.O.D.", "Archived", "reference unavailable", "END-LONG-RESOURCE", "Synthetic resource cost: 2", "Synthetic Derived candidate", "critical success", "Choice required"]) assert.ok(text.includes(expected), `Missing ${expected}`);
    assert.doesNotMatch(text, /provisional/i);
    assert.ok(!text.includes(names[7]));
    assert.doesNotMatch(text, /skill:2147483647|Current balance|remaining points/);
    assert.equal(await view.locator("button,input,select").count(), 0);
  }
  async function layout(page: Page, label: string) {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await expand(reference(page));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label} ${width}: horizontal overflow`);
      await reference(page).evaluate(element => element.querySelectorAll("details").forEach(detail => detail.open = false));
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(output, `${label}-${width}.png`), fullPage: true });
      const toolbox = reference(page).locator(".special-ability-reference__ability").filter({ has: page.locator("summary > strong", { hasText: "Synthetic Toolbox" }) });
      await toolbox.locator(":scope > summary").click();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(output, `${label}-detail-${width}.png`), fullPage: true });
    }
  }
  await page.goto(`${baseUrl}/realms/characters/${characterId}`);
  await page.getByRole("tab", { name: "Skills & Abilities", exact: true }).click();
  assert.equal(await reference(page).locator("details[open]").count(), 0, "Saved mechanics start collapsed");
  await check(reference(page)); await layout(page, "character"); results.push("Character all states, all families, local/exact references, progression, desktop and 390px");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByText("Print options", { exact: true }).click();
  await page.getByText(/^Ready:/).waitFor();
  const paper = page.locator(".paper-character-sheet");
  assert.equal(await paper.locator(".special-ability-reference").count(), 0, "Quick Print excludes detailed mechanics");
  await capturePaperPdf(page, "quick", { name: "Aerin Tidewalker", campaign: "The Ember Coast" }, output);
  await page.getByRole("button", { name: /^Custom Print/ }).click();
  await page.getByLabel("Standard front", { exact: true }).uncheck();
  await page.getByLabel("General back", { exact: true }).uncheck();
  await page.getByLabel("Special Ability reference", { exact: true }).check();
  assert.equal(await paper.locator(".special-ability-reference__ability").count(), 7);
  assert.equal(await paper.locator("button,input,select,details,summary").count(), 0);
  for (const theme of ["Universal", "Plain"]) {
    await page.getByLabel("Print theme", { exact: true }).selectOption(theme);
    await capturePaperPdf(page, `reference-${theme.toLowerCase()}`, { name: "Aerin Tidewalker", campaign: "The Ember Coast" }, output);
  }
  results.push("Quick Print and optional multiple-ability long-rule PDFs in Universal/Plain themes generated");
  await page.goto(`${baseUrl}/realms/tabletop?character=${characterId}`);
  await page.locator("#tabletop-tab-abilities").click();
  await check(reference(page)); await layout(page, "player-tabletop");
  await page.reload(); await check(reference(page));
  results.push("Player tabletop saved inspection, reload and mobile");
  await page.goto(`${baseUrl}/realms/characters/${seed[2]}`);
  assert.equal(await reference(page).count(), 0);
  assert.ok(!(await page.locator("body").innerText()).includes("Synthetic Unpossessed"));
  results.push("Player cannot inspect another Player's Character");
  const god = await login("sheet-owner");
  await god.goto(`${baseUrl}/heavens/tabletop?campaign=${campaignId}&session=${sessionId}`);
  await god.getByRole("button", { name: /^Roster & Prep/ }).click();
  await god.getByText("Inspect Special Ability mechanics", { exact: true }).click();
  await check(reference(god)); results.push("Campaign-owning G.O.D. Session roster inspection");
  await god.goto(`${baseUrl}/heavens/tabletop?combat=${encounterId}`);
  await god.getByText("Inspect Special Ability mechanics", { exact: true }).click();
  await check(reference(god)); await layout(god, "god-frozen-combat");
  const inspector = god.locator("details").filter({ has: god.getByRole("button", { name: "Refresh saved reference", exact: true }) }).first();
  assert.deepEqual(await inspector.getByRole("button").allTextContents(), ["Refresh saved reference"]);
  await god.context().setOffline(true);
  await god.getByRole("button", { name: "Refresh saved reference", exact: true }).click();
  await god.getByRole("alert").filter({ hasText: "saved Special Ability information is unavailable" }).waitFor();
  await god.context().setOffline(false);
  await god.getByRole("button", { name: "Refresh saved reference", exact: true }).click();
  await check(reference(god));
  await god.reload(); await god.getByText("Inspect Special Ability mechanics", { exact: true }).click(); await check(reference(god));
  results.push("Frozen G.O.D. combat read, mobile, reconnect/reload and no execution controls");
  await page.goto(`${baseUrl}/realms/tabletop?character=${characterId}&combat=${encounterId}`);
  await page.getByText("Inspect Special Ability mechanics", { exact: true }).click();
  await check(reference(page)); results.push("Frozen Player combat own-Character read");
  assert.deepEqual(await snapshot(), before, "Character/runtime/inventory/Derived/encounter state remains identical across all presentation reads");
  results.push(`Read-only snapshots unchanged across ${tables.length} tables`);
  await writeFile(path.join(output, "browser-results.json"), JSON.stringify({ results }, null, 2));
  for (const result of results) console.log(`PASS: ${result}`);
}
