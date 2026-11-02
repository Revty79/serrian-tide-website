import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type pg from "pg";
import type { Page } from "playwright-core";
import { SPREADSHEET_SHEETS } from "../src/features/characters/spreadsheet-character";

/** Runs only inside the newly owned character-sheet fixture; no .env or shared target. */
export async function rehearseSpreadsheetPrinting(pool: pg.Pool, login: (id: string) => Promise<Page>, baseUrl: string, characters: number[]) {
  assert.equal((await pool.query("select current_database() name")).rows[0].name, "serrian_character_sheet_dev");
  const characterId = characters[0];
  const campaignId = (await pool.query("select campaign_id from campaign_character where id=$1", [characterId])).rows[0].campaign_id;
  for (const system of ["Talismanism", "Faith", "Psyonics", "Bardic Resonance", "Special Abilities", "Derived Abilities"]) await pool.query("insert into campaign_allowed_system(campaign_id,system) values($1,$2) on conflict do nothing", [campaignId, system]);
  const roots = ["Spellcraft", "Talismanism", "Faith", "Psionic Focus", "Resonant Performance"];
  for (const [index, name] of roots.entries()) {
    let root = (await pool.query("select id from skill where name=$1 order by id limit 1", [name])).rows[0]?.id;
    if (!root) root = (await pool.query("insert into skill(name,classification,tier,primary_attribute,definition) values($1,'standard',1,'INT','Disposable print fixture') returning id", [name])).rows[0].id;
    let allocation = (await pool.query("select id from campaign_character_skill_allocation where character_id=$1 and skill_id=$2", [characterId, root])).rows[0]?.id;
    if (!allocation) allocation = (await pool.query("insert into campaign_character_skill_allocation(character_id,skill_id,points) values($1,$2,$3) returning id", [characterId, root, 10 + index])).rows[0].id;
    const branch = (await pool.query("insert into skill(name,classification,tier,primary_attribute,definition) values($1,'magic',2,'INT','Printed branch') returning id", [index < 3 ? "Fire" : index === 3 ? "Telepathy" : "Joy"])).rows[0].id;
    await pool.query("insert into skill_relationship(skill_id,related_skill_id,relationship_type) values($1,$2,'parent')", [branch, root]);
    const parent = (await pool.query("insert into campaign_character_skill_allocation(character_id,skill_id,parent_allocation_id,points) values($1,$2,$3,$4) returning id", [characterId, branch, allocation, 12 + index])).rows[0].id;
    const power = (await pool.query("insert into skill(name,classification,tier,primary_attribute,definition) values($1,'magic',3,'INT','Description-only technique') returning id", [`Recorded ${name} technique`])).rows[0].id;
    await pool.query("insert into skill_relationship(skill_id,related_skill_id,relationship_type) values($1,$2,'parent')", [power, branch]);
    await pool.query("insert into campaign_character_skill_allocation(character_id,skill_id,parent_allocation_id,points) values($1,$2,$3,8)", [characterId, power, parent]);
  }
  const special = (await pool.query("insert into skill(name,classification,tier,definition) values('Beacon Sense','Special Ability',1,'A passive ability without a governing attribute.') returning id")).rows[0].id;
  await pool.query("insert into campaign_character_skill_allocation(character_id,skill_id,points) values($1,$2,5)", [characterId, special]);
  const derived = (await pool.query("insert into derived_ability(name,acquisition_type,activation_type,description,mechanical_effect) values('Steady Resolve','awarded','activated','Disposable print fixture.','Retain the authored tabletop ruling.') returning id")).rows[0].id;
  await pool.query("insert into campaign_allowed_derived_ability(campaign_id,derived_ability_id) values($1,$2)", [campaignId, derived]);
  await pool.query("insert into character_derived_ability(character_id,derived_ability_id,acquisition_method) values($1,$2,'awarded')", [characterId, derived]);
  const revolver = (await pool.query("insert into items(canonical_id,name,catalog_scope,equipment_group,record_type,family,category,price_basis,credits) values('PRINT-REVOLVER','Print Revolver','equipment','weapon','Weapon','Firearms','Handguns','unit',0) returning id")).rows[0].id;
  await pool.query("insert into campaign_inventory_item(campaign_id,item_id,sort_order) select $1,$2,coalesce(max(sort_order),-1)+1 from campaign_inventory_item where campaign_id=$1", [campaignId, revolver]);
  await pool.query("insert into item_runtime_profiles(item_id,use_mode,activation_label) values($1,'none','Use')", [revolver]);
  const revolverProfile = (await pool.query("insert into weapon_profiles(item_id,profile_record_type,weapon_type,damage,initiative_cost,damage_type,capacity_rounds,readiness_mode,draw_initiative_cost,ready_initiative_cost,reload_initiative_cost,unload_initiative_cost,firing_mode_change_initiative_cost) values($1,'Weapon','Revolver','4',4,'Piercing',6,'draw-is-ready',0,0,0,0,0) returning id", [revolver])).rows[0].id;
  await pool.query("insert into weapon_firing_modes(weapon_profile_id,name,normalized_name,sort_order,base_cycling_initiative_cost,base_recoil_reset_initiative_cost,delivery_cadence,rounds_per_cadence) values($1,'Single','single',0,0,0,'per-trigger',1)", [revolverProfile]);
  await pool.query("insert into campaign_character_item_instance(character_id,item_id,current_charges,unit_cost_credits,equipment_state) values($1,$2,0,0,'inactive')", [characterId, revolver]);
  for (let i = 0; i < 65; i++) {
    const skill = (await pool.query("insert into skill(name,classification,tier,primary_attribute,definition) values($1,'standard',1,'WIS','Disposable overflow fixture') returning id", [`Navigation route ${String(i + 1).padStart(2, "0")}`])).rows[0].id;
    await pool.query("insert into campaign_character_skill_allocation(character_id,skill_id,points) values($1,$2,4)", [characterId, skill]);
  }
  await pool.query("update campaign_character_profile set defining_marks=$2 where character_id=$1", [characterId, "A compass tattoo with a long, precisely recorded inscription. ".repeat(15) + "END-MARKS-RECORDED"]);
  const tables = (await pool.query("select table_name from information_schema.tables where table_schema='public' and (table_name='campaign_character' or starts_with(table_name,'campaign_character_')) order by table_name")).rows;
  const snapshot = async () => Promise.all(tables.map(async ({ table_name: table }) => {
    assert.match(table, /^campaign_character(?:_[a-z_]+)?$/);
    return (await pool.query(`select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]'::jsonb) value from "${table}" r`)).rows[0].value;
  }));
  const before = await snapshot();
  const out = path.resolve(process.env.SERRIAN_SPREADSHEET_PRINT_ARTIFACTS ?? "artifacts/character-spreadsheet-print/legal-correction");
  assert.ok(out.startsWith(path.resolve("artifacts/character-spreadsheet-print") + path.sep));
  await mkdir(out, { recursive: true });
  const page = await login("sheet-player");
  await page.addInitScript(() => { Object.defineProperty(window, "__nativeSpreadsheetPrint", { value: window.print.bind(window) }); window.print = () => { document.documentElement.dataset.spreadsheetPrintCalls = String(Number(document.documentElement.dataset.spreadsheetPrintCalls ?? "0") + 1); }; });
  await page.goto(`${baseUrl}/realms/characters/${characterId}`);
  await page.getByText("Print options", { exact: true }).click();
  await page.getByText(/^Ready:/).waitFor();
  const original = page.locator(".paper-character-sheet");
  assert.equal(await original.locator('[data-print-section="front"]').count(), 1);
  await page.getByRole("button", { name: /^Original Spreadsheet Sheets/ }).click();
  await page.getByRole("button", { name: "Select all eight sheets" }).click();
  await page.getByRole("button", { name: "Preview spreadsheet sheets" }).click();
  const root = page.locator(".spreadsheet-character-sheet");
  assert.equal(await page.locator(".paper-character-sheet").count(), 0);
  assert.equal(await root.locator(".spreadsheet-sheet-page").count(), 8);
  await page.getByRole("button", { name: "Print / Save as PDF", exact: true }).click();
  await page.waitForFunction(() => Number(document.documentElement.dataset.spreadsheetPrintCalls) === 1 || !!document.documentElement.dataset.spreadsheetLayoutError);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.spreadsheetLayoutError), undefined);
  assert.equal(await root.locator('[data-spreadsheet-section="Sheet front filled"] [data-spreadsheet-cell="H4"]').getAttribute("data-full-text"), "Aerin Tidewalker");
  assert.equal(await root.locator('[data-spreadsheet-section="Special Abilities Back"] [data-spreadsheet-cell="D23"]').getAttribute("data-full-text"), "—");
  assert.ok((await root.locator(".spreadsheet-information").allTextContents()).join("").includes("Navigation route 65"));
  assert.ok((await root.locator('[data-spreadsheet-cell="A10"]').first().textContent())!.includes("compass tattoo"));
  assert.equal(await root.getByRole("img", { name: "Body Shot Bob — hit locations", includeHidden: true }).count(), 1);
  assert.ok((await root.locator('[data-spreadsheet-section="Sheet front filled"] [data-sheet-information]').textContent())!.includes("Steady Resolve"));
  assert.doesNotMatch((await root.allTextContents()).join(""), /ammunition state not initialized/i);
  for (const back of SPREADSHEET_SHEETS.slice(1)) assert.ok(!(await root.locator(`[data-spreadsheet-section="${back}"] [data-sheet-information]`).textContent())!.includes("Steady Resolve"));
  const geometry = await root.locator(".spreadsheet-canvas").evaluateAll(canvases => canvases.map(canvas => {
    const rect = canvas.getBoundingClientRect();
    const cell = canvas.querySelector<HTMLElement>("[data-spreadsheet-cell]")!;
    const style = getComputedStyle(cell);
    return { width: rect.width, height: rect.height, rule: style.borderRightColor, ruleWidth: style.borderRightWidth, ruleStyle: style.borderRightStyle };
  }));
  for (const frame of geometry) { assert.ok(Math.abs(frame.width - 748.8) < 1); assert.ok(Math.abs(frame.height - 1248.53) < 1); assert.equal(frame.ruleStyle, "solid"); assert.equal(frame.rule, "rgb(0, 0, 0)"); assert.ok(parseFloat(frame.ruleWidth) >= .5); }
  await page.emulateMedia({ media: "print" });
  await writeFile(path.join(out, "print-layout.json"), JSON.stringify(await page.evaluate(() => {
    const root = document.querySelector(".spreadsheet-character-sheet")!;
    const ancestors = []; let node: Element | null = root;
    while (node) { const style = getComputedStyle(node); ancestors.push({ tag: node.tagName, class: node.className, width: node.getBoundingClientRect().width, scrollWidth: node.scrollWidth, transform: style.transform, zoom: style.zoom }); node = node.parentElement; }
    return { ancestors, canvases: [...root.querySelectorAll(".spreadsheet-canvas")].map(node => ({ width: node.getBoundingClientRect().width, scrollWidth: node.scrollWidth })) };
  }), null, 2));
  for (const title of SPREADSHEET_SHEETS) {
    const sheet = root.locator(`.spreadsheet-sheet-page[aria-label="${title} — Aerin Tidewalker"]`);
    assert.equal(await sheet.count(), 1);
    // Render the actual PDF pages in the companion verifier. Element screenshots of
    // tall, paginated print-media documents can stall Chrome's scroll-stability check.
  }
  const clipping = await root.locator("[data-spreadsheet-cell]:not([data-sheet-information]):not([data-body-shot-bob])").evaluateAll(cells => cells.filter(cell => {
    const text = cell.firstElementChild as HTMLElement;
    return text.textContent?.trim() && (text.scrollWidth > cell.clientWidth - 3 || text.scrollHeight > cell.clientHeight);
  }).map(cell => `${(cell as HTMLElement).dataset.spreadsheetCell}`));
  assert.deepEqual(clipping, [], "Measured cells, including continuation markers, must fit");
  await page.emulateMedia({ media: "print" });
  const cdp = await page.context().newCDPSession(page);
  const result = await cdp.send("Page.printToPDF", { printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false });
  await writeFile(path.join(out, "all-sheets.pdf"), Buffer.from(result.data, "base64"));
  await writeFile(path.join(out, "pdf-manifest.json"), JSON.stringify(await root.locator(".spreadsheet-sheet-page").evaluateAll(sections => sections.map(section => ({
    title: (section as HTMLElement).dataset.spreadsheetSection!,
    cells: [...section.querySelectorAll<HTMLElement>("[data-spreadsheet-cell]")].map(cell => ({ address: cell.dataset.spreadsheetCell, full: cell.dataset.fullText })),
    notes: [...section.querySelectorAll(".spreadsheet-information-text p")].map(note => note.textContent),
  }))), null, 2));
  await page.emulateMedia({ media: "screen" });
  // Each individual checkbox selects exactly its original sheet, including backs-only output.
  for (const title of SPREADSHEET_SHEETS) {
    for (const candidate of SPREADSHEET_SHEETS) await page.getByLabel(candidate, { exact: true }).setChecked(candidate === title);
    assert.equal(await root.locator(".spreadsheet-sheet-page").count(), 1);
    assert.equal(await root.locator(".spreadsheet-sheet-page").getAttribute("aria-label"), `${title} — Aerin Tidewalker`);
  }
  await page.getByLabel("Special Abilities Back", { exact: true }).uncheck();
  assert.equal(await page.getByRole("button", { name: "Print / Save as PDF", exact: true }).isDisabled(), true);
  await page.getByRole("button", { name: "Select all eight sheets" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".character-print-center").scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Phone controls cannot widen the page");
  await page.screenshot({ path: path.join(out, "phone-options.png") });
  await page.setViewportSize({ width: 820, height: 1180 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.getByRole("button", { name: /^Tabletop Quick Reference/ }).click();
  assert.equal(await page.locator(".spreadsheet-character-sheet").count(), 0);
  assert.equal(await page.locator('.paper-character-sheet [data-print-section="front"]').count(), 1);
  await page.getByRole("button", { name: "Print / Save as PDF", exact: true }).click();
  await page.waitForFunction(() => Number(document.documentElement.dataset.spreadsheetPrintCalls) === 2);
  // The print boundary refreshes the saved record and explicitly protects editor drafts.
  await page.goto(`${baseUrl}/realms/characters/${characters[1]}`);
  await page.getByText("Print options", { exact: true }).click();
  await page.getByText(/^Ready:/).waitFor();
  await page.getByRole("button", { name: /^Original Spreadsheet Sheets/ }).click();
  await page.getByRole("tab", { name: "Identity", exact: true }).click();
  await page.getByLabel(/Character Name/).fill("UNSAVED NAME MUST NOT PRINT");
  await page.getByRole("button", { name: "Print / Save as PDF", exact: true }).click();
  await page.getByRole("button", { name: "Print saved record", exact: true }).click();
  await page.waitForFunction(() => Number(document.documentElement.dataset.spreadsheetPrintCalls) === 1);
  assert.equal(await page.locator('[data-spreadsheet-section="Sheet front filled"] [data-spreadsheet-cell="H4"]').getAttribute("data-full-text"), "Rowan Draft");
  assert.equal(await page.getByLabel(/Character Name/).inputValue(), "UNSAVED NAME MUST NOT PRINT");
  await page.emulateMedia({ media: "print" });
  const simple = await cdp.send("Page.printToPDF", { printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false });
  await writeFile(path.join(out, "simple-sheets.pdf"), Buffer.from(simple.data, "base64"));
  await page.emulateMedia({ media: "screen" });
  assert.deepEqual(await snapshot(), before, "Printing and previewing never change persisted character state");
  if (process.env.SERRIAN_SPREADSHEET_NATIVE_PREVIEW === "true") {
    const { inspectNativeSpreadsheetPreview } = await import("./character-spreadsheet-native-preview");
    await inspectNativeSpreadsheetPreview(page, out);
  }
  await writeFile(path.join(out, "browser-receipt.json"), JSON.stringify({ passed: true, sheets: [...SPREADSHEET_SHEETS], characterId, database: "newly owned disposable", checks: ["original layouts", "all and individual selections", "overflow", "long values", "mixed systems", "passive no-roll", "desktop/tablet/phone", "saved snapshot", "unsaved draft protection", "existing default printing", "no database mutations"] }, null, 2));
  console.log("PASS: original eight spreadsheet layouts, actual print/PDF, independent selections, overflow, responsive controls, saved snapshot/draft protection and unchanged database state.");
}
