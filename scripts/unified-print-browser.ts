import assert from "node:assert/strict";
import type pg from "pg";
import type {Page} from "playwright-core";
import {PRINT_SYSTEMS, PRINT_THEMES, PRINT_BOOKS} from "../src/features/characters/character-print-options";
import {createEmptySpell} from "../src/features/spell-construction/utilities/spellFactory";
import {capturePaperPdf} from "./character-paper-review";

/** Fixture writes are confined to the existing disposable database. */
export async function rehearseUnifiedPrinting(pool: pg.Pool, login: (id: string) => Promise<Page>, baseUrl: string, seed: number[]) {
  assert.equal((await pool.query("select current_database() name")).rows[0].name, "serrian_character_sheet_dev");
  const insert = async (sql: string, values: unknown[] = []) => Number((await pool.query(sql, values)).rows[0].id);
  const campaign = (await pool.query("select campaign_id from campaign_character where id=$1", [seed[0]])).rows[0].campaign_id;
  for (const system of [...PRINT_SYSTEMS, "Special Abilities", "Derived Abilities"]) await pool.query("insert into campaign_allowed_system(campaign_id,system) values($1,$2) on conflict do nothing", [campaign, system]);
  const special = await insert("insert into skill(name,classification,tier,definition) values('Demo special sense','Special Ability',1,'Recognize the marked beacon while it is in sight. Does not work through walls. No roll is recorded for this passive demonstration.') returning id");
  const derived = await insert("insert into derived_ability(name,acquisition_type,activation_type,description,mechanical_effect) values('Demo steady resolve','awarded','activated','A deliberate moment of composure.','Use only after the stated event; this demonstration grants no unrecorded bonus.') returning id");
  await pool.query("insert into campaign_allowed_derived_ability(campaign_id,derived_ability_id) values($1,$2)", [campaign, derived]);
  await pool.query("insert into derived_ability_cost(derived_ability_id,cost_type,resource_key,amount,notes) values($1,'resource','Fate',1,'Recorded demo cost')", [derived]);
  await pool.query("insert into derived_ability_use_limit(derived_ability_id,maximum_uses,refresh_scope,notes) values($1,2,'session','Recorded demo limit')", [derived]);
  const roots = ["Spellcraft", "Talismanism", "Faith", "Psionic Focus", "Resonant Performance"];
  const supports = ["Channeling", "Channeling", "Devotion", "Psionic Channeling", "Resonance Attunement"];
  const skills: Array<{root: number; support: number; power: number}> = [];
  for (const [i, system] of PRINT_SYSTEMS.entries()) {
    const ensure = async (name: string, classification: string) => (await pool.query("select id from skill where name=$1 order by id limit 1", [name])).rows[0]?.id ??
      await insert("insert into skill(name,classification,tier,primary_attribute,definition) values($1,$2,1,'INT',$3) returning id", [name, classification, `Saved ${name} support/access skill. Disposable print fixture.`]);
    const root = await ensure(roots[i], "magic access");
    const support = await ensure(supports[i], "standard");
    const power = await insert("insert into skill(name,classification,tier,primary_attribute,definition) values($1,'magic',2,'INT',$2) returning id", [`Demo ${system} practice`, `Recorded ${system} technique without a construction document. Requires the marked focus; ends when concentration is broken. No additional range or timing is recorded. END-${i}-RECORDED.`]);
    await pool.query("insert into skill_relationship(skill_id,related_skill_id,relationship_type) values($1,$2,'parent')", [power, root]);
    skills.push({root, support, power});
  }
  const fixtures: Array<{id: number; name: string; systems: typeof PRINT_SYSTEMS[number][]}> = [];
  for (let i = 0; i < 6; i++) {
    const systems = i < 5 ? [PRINT_SYSTEMS[i]] : [...PRINT_SYSTEMS];
    const name = i < 5 ? `${systems[0]} practitioner — DEMO` : "Mixed practitioner — DEMO";
    const id = await insert("insert into campaign_character(campaign_id,player_user_id,name) values($1,'sheet-player',$2) returning id", [campaign, name]);
    const source = i === 5 ? seed[1] : seed[0];
    await pool.query("insert into campaign_character_profile select (jsonb_populate_record(null::campaign_character_profile,to_jsonb(p)||jsonb_build_object('character_id',$1::int))).* from campaign_character_profile p where character_id=$2", [id, source]);
    await pool.query("insert into campaign_character_attribute(character_id,attribute_key,value) select $1,attribute_key,value from campaign_character_attribute where character_id=$2", [id, source]);
    await pool.query("insert into campaign_character_item(character_id,item_id,quantity,unit_cost_credits) select $1,item_id,quantity,unit_cost_credits from campaign_character_item where character_id=$2", [id, source]);
    await pool.query("insert into campaign_character_skill_allocation(character_id,skill_id,points) select $1,skill_id,points from campaign_character_skill_allocation where character_id=$2", [id, seed[0]]);
    await pool.query("insert into campaign_character_skill_allocation(character_id,skill_id,points) values($1,$2,1)", [id, special]);
    await pool.query("insert into character_derived_ability(character_id,derived_ability_id,acquisition_method) values($1,$2,'awarded')", [id, derived]);
    const supportIds = new Set<number>();
    for (const system of systems) {
      const index = PRINT_SYSTEMS.indexOf(system);
      const spec = skills[index];
      const allocation = await insert("insert into campaign_character_skill_allocation(character_id,skill_id,points) values($1,$2,12) returning id", [id, spec.root]);
      if (!supportIds.has(spec.support)) await pool.query("insert into campaign_character_skill_allocation(character_id,skill_id,points) values($1,$2,15)", [id, spec.support]);
      supportIds.add(spec.support);
      await pool.query("insert into campaign_character_skill_allocation(character_id,skill_id,parent_allocation_id,points) values($1,$2,$3,8)", [id, spec.power, allocation]);
      const spell = createEmptySpell();
      spell.name = `Demo ${system} constructed power`; spell.castingSystem = system; spell.frameworkSkillId = spec.root;
      spell.description = `Recorded ${system} demonstration. ` + "The scene description does not expand its structured effect. ".repeat(i === 5 ? 45 : 1) + `END-${index}-CONSTRUCTED.`;
      spell.notes = "Requires the engraved focus; concentration must be maintained.";
      spell.containers[0].effects = [{id: `unified-${id}-${index}`, ruleId: "healing", quantity: 2, description: "A recorded restorative effect.", healingScope: "full-body"}];
      await pool.query("insert into campaign_character_spell_document(character_id,document_id,name,tradition,document_json,in_spellbook) values($1,$2,$3,$4,$5,true)", [id, spell.id, spell.name, spell.tradition, JSON.stringify(spell)]);
    }
    fixtures.push({id, name, systems});
  }
  const tables = (await pool.query("select table_name from information_schema.tables where table_schema='public' and (table_name='campaign_character' or starts_with(table_name,'campaign_character_') or starts_with(table_name,'character_derived_ability')) order by table_name")).rows;
  const snapshot = async () => Promise.all(tables.map(async ({table_name: table}) => {assert.match(table, /^[a-z_]+$/); return (await pool.query(`select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]'::jsonb) value from "${table}" r`)).rows[0].value;}));
  const before = await snapshot();
  const page = await login("sheet-player");
  await page.addInitScript("window.print = () => {document.documentElement.dataset.paperPrintCalls = String(Number(document.documentElement.dataset.paperPrintCalls || 0) + 1)}");
  async function open(id: number) {
    await page.goto(`${baseUrl}/realms/characters/${id}`);
    await page.getByText("Print options", {exact: true}).click();
    await page.getByText(/^Ready:/).waitFor();
    await page.getByRole("button", {name: /^Custom Print/}).click();
  }
  for (const fixture of fixtures) {
    await open(fixture.id);
    await page.getByLabel("General back", {exact: true}).uncheck();
    for (const system of fixture.systems) {
      await page.getByLabel(`${system} back`, {exact: true}).check();
      await page.getByLabel(`${PRINT_BOOKS[system]} — ${system}`, {exact: true}).check();
    }
    const root = page.locator(".paper-character-sheet");
    if (fixture.systems.length === 5) {
      const body = () => root.locator("[data-print-section]").evaluateAll(elements => elements.map(element => Array.from(element.children).filter(child => !child.classList.contains("paper-sheet-masthead")).map(child => child.textContent).join("")));
      const expected = await body();
      for (const theme of PRINT_THEMES) {
        await page.getByLabel("Print theme", {exact: true}).selectOption(theme);
        assert.deepEqual(await body(), expected, "Mixed-build powers, resources, ability costs and inventories must agree across every theme");
      }
      await page.getByLabel("Print theme", {exact: true}).selectOption("Universal");
    }
    for (const system of fixture.systems) {
      const back = root.locator(`[data-print-section="back-${system}"]`);
      for (const title of ["Ordinary skills", "Special Abilities", "Derived Abilities", "Owned inventory"]) assert.equal(await back.getByRole("heading", {name: title, exact: true, includeHidden: true}).count(), 1, `${system}: ${title}`);
      assert.ok((await back.textContent())?.includes("Demo special sense"));
      assert.ok((await back.textContent())?.includes("Demo steady resolve"));
      assert.ok((await back.textContent())?.includes("2 use(s) / session"));
      const specialEntry = back.locator(".paper-ability-brief").filter({hasText: "Demo special sense"});
      assert.ok(!(await specialEntry.textContent())?.includes("%"), "Nonrolling abilities must not gain a fabricated target");
      const book = root.locator(`[data-print-section="book-${system}"]`);
      assert.equal(await book.locator(".paper-spell").count(), 1);
      for (const name of [roots[PRINT_SYSTEMS.indexOf(system)], supports[PRINT_SYSTEMS.indexOf(system)], `Demo ${system} practice`]) assert.ok((await book.textContent())?.includes(name), `${system}: lost ${name}`);
    }
    await page.getByRole("button", {name: "Print / Save as PDF", exact: true}).click();
    await page.waitForFunction(() => document.documentElement.dataset.paperPrintCalls === "1");
    await capturePaperPdf(page, fixture.systems.length === 5 ? "mixed-build" : `system-${fixture.systems[0].toLowerCase().replaceAll(" ", "-")}`, {name: fixture.name, campaign: "The Lantern Coast — DEMO"});
    // Every independently selected book also renders without front/back pages.
    await page.getByLabel("Standard front", {exact: true}).uncheck();
    for (const system of fixture.systems) await page.getByLabel(`${system} back`, {exact: true}).uncheck();
    assert.equal(await root.locator("[data-print-section]").count(), fixture.systems.length);
    await capturePaperPdf(page, fixture.systems.length === 5 ? "mixed-books-only" : `book-only-${fixture.systems[0].toLowerCase().replaceAll(" ", "-")}`, {name: fixture.name, campaign: "The Lantern Coast — DEMO"});
  }
  await open(seed[0]);
  const contents = async () => page.locator("[data-print-section]").evaluateAll(elements => elements.map(element => Array.from(element.children).filter(child => !child.classList.contains("paper-sheet-masthead")).map(child => child.textContent).join("")));
  const baseline = await contents();
  for (const theme of PRINT_THEMES) {
    await page.getByLabel("Print theme", {exact: true}).selectOption(theme);
    await page.getByLabel("Presentation headings", {exact: true}).selectOption("genre");
    assert.deepEqual(await contents(), baseline, "Themes/headings must not alter mechanical data");
    await capturePaperPdf(page, `theme-${theme.toLowerCase().replaceAll(" ", "-")}`, {name: "Mara Reed — DEMO A", campaign: "The Lantern Coast — DEMO"});
  }
  await page.setViewportSize({width: 390, height: 844});
  await page.locator('[data-field-guidance="Print theme"] summary').click();
  assert.ok(await page.locator(".character-print-center").evaluate(element => element.scrollWidth <= element.clientWidth + 1));
  await page.screenshot({path: "docs/samples/unified-character-printing/print-options-mobile.png", fullPage: true});
  assert.deepEqual(await snapshot(), before, "All print combinations must remain read-only");
  console.log("PASS: five supernatural systems, mixed build, non-construction powers, every back includes both ability types and inventory, standalone books, all eight themes, mobile, read-only snapshots");
}
