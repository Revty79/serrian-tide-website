import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type pg from "pg";
import type { Page } from "playwright-core";
import { PDFDocument } from "pdf-lib";
import { TABLETOP_PDF_SHEETS } from "../src/features/characters/character-tabletop-pdf-options";

/** Runs only inside the newly owned character-sheet fixture; no .env or shared target. */
export async function rehearseTabletopPdf(pool: pg.Pool, login: (id: string) => Promise<Page>, baseUrl: string, characters: number[]) {
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
  const out = path.resolve("artifacts/character-spreadsheet-print/letter-layout-correction");
  await mkdir(out, { recursive: true });
  const page = await login("sheet-player");
  page.on("response", response => {
    if (response.request().method() === "POST") void response.text().then(text => text.includes('"tabletop":') ? writeFile(path.join(out, "owned-saved-snapshot.rsc"), text) : undefined).catch(() => undefined);
  });
  await page.addInitScript(() => { window.print = () => { document.documentElement.dataset.normalPrintCalls = String(Number(document.documentElement.dataset.normalPrintCalls ?? "0") + 1); }; });
  const create = () => page.getByRole("button", { name: "Print / Save as PDF", exact: true }).click();
  const ready = async () => {
    await page.waitForFunction(() => !!document.querySelector('.character-pdf-actions a[download], .character-print-center [role="alert"]'));
    const error = page.locator('.character-print-center [role="alert"]');
    if (await error.count()) {
      await page.screenshot({ path: path.join(out, "generation-error.png") });
      throw new Error("PDF creation failed: " + await error.textContent());
    }
    await page.getByRole("link", { name: "Download PDF", exact: true }).waitFor();
  };
  const download = async (name: string, count: number) => {
    const pending = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download PDF", exact: true }).click();
    const file = await pending;
    assert.match(file.suggestedFilename(), /Tabletop Sheets\.pdf$/);
    const target = path.join(out, name + ".pdf"); await file.saveAs(target);
    const { readFile } = await import("node:fs/promises");
    const pdf = await PDFDocument.load(await readFile(target));
    assert.equal(pdf.getPageCount(), count);
    for (const pdfPage of pdf.getPages()) assert.deepEqual(pdfPage.getSize(), { width: 612, height: 792 });
    for (const tab of page.context().pages()) if (tab !== page && !tab.isClosed()) await tab.close();
  };
  await page.goto(`${baseUrl}/realms/characters/${characterId}`);
  await page.getByText("Print options", { exact: true }).click();
  await page.getByText(/^Ready:/).waitFor();
  assert.equal(await page.locator('.paper-character-sheet [data-print-section="front"]').count(), 1);
  await page.getByRole("button", { name: /^Tabletop PDF Sheets/ }).click();
  await page.getByRole("button", { name: "Select all eight sheets" }).click();
  await create(); await ready();
  assert.equal(await page.locator(".paper-character-sheet").count(), 0);
  assert.equal(await page.locator(".spreadsheet-character-sheet").count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.normalPrintCalls), undefined, "PDF creation must never print the editor webpage");
  assert.equal(await page.getByTitle("Character tabletop PDF preview").count(), 0);
  assert.equal(await page.locator(".character-pdf-preview iframe").count(), 0, "The builder keeps compact export controls instead of a tall embedded preview");
  const automatic = page.context().pages().find(tab => tab !== page && tab.url().startsWith("blob:"));
  assert.ok(automatic, "The print action opens the actual PDF for preview/printing");
  await download("browser-all", 8);
  // Each choice is an independent actual PDF, including backs without a front.
  for (const title of TABLETOP_PDF_SHEETS) {
    for (const candidate of TABLETOP_PDF_SHEETS) await page.getByLabel(candidate, { exact: true }).setChecked(candidate === title);
    assert.equal(await page.getByRole("link", { name: "Download PDF", exact: true }).count(), 0, "Changing the selected pages retires the old PDF");
    await create(); await ready();
    await download("single-" + title.toLowerCase().replaceAll(" ", "-"), 1);
  }
  await page.getByLabel("Special Abilities Back", { exact: true }).uncheck();
  assert.equal(await page.getByRole("button", { name: "Print / Save as PDF", exact: true }).isDisabled(), true);
  await page.getByLabel("Character Front", { exact: true }).check();
  await page.route("**/tabletop/NotoSans-Regular.ttf", route => route.abort());
  await create(); await page.getByRole("alert").waitFor();
  assert.equal(await page.getByRole("link", { name: "Download PDF", exact: true }).count(), 0);
  await page.unroute("**/tabletop/NotoSans-Regular.ttf");
  await create(); await ready();
  for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1180 }]) {
    await page.setViewportSize(viewport);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "PDF controls cannot widen the phone or tablet");
    await page.locator(".character-pdf-preview").scrollIntoViewIfNeeded();
    assert.ok((await page.locator(".character-pdf-preview").boundingBox())!.height < 220, "Export controls must remain compact");
    await page.screenshot({ path: path.join(out, `pdf-preview-${viewport.width}.png`) });
  }
  await page.getByRole("button", { name: /^Tabletop Quick Reference/ }).click();
  assert.equal(await page.locator('.paper-character-sheet [data-print-section="front"]').count(), 1);
  await page.getByRole("button", { name: "Print / Save as PDF", exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.normalPrintCalls === "1");
  await page.goto(`${baseUrl}/realms/characters/${characters[1]}`);
  await page.getByText("Print options", { exact: true }).click(); await page.getByText(/^Ready:/).waitFor();
  await page.getByRole("button", { name: /^Tabletop PDF Sheets/ }).click();
  await page.getByRole("tab", { name: "Identity", exact: true }).click();
  await page.getByLabel(/Character Name/).fill("UNSAVED NAME MUST NOT PRINT");
  await create(); await page.getByRole("button", { name: "Print saved record", exact: true }).click(); await ready();
  await download("browser-simple", 2);
  assert.equal(await page.getByLabel(/Character Name/).inputValue(), "UNSAVED NAME MUST NOT PRINT");
  assert.deepEqual(await snapshot(), before, "Creating, opening and downloading PDFs never changes persisted Character state");
  // The actual PDF opens through an explicit link, without pop-up permission or auto-printing.
  const opened = page.context().waitForEvent("page");
  await page.getByRole("link", { name: "Open PDF to print", exact: true }).click();
  const viewer = await opened; await viewer.waitForLoadState();
  assert.ok(viewer.url().startsWith("blob:"));
  if (process.env.SERRIAN_SPREADSHEET_NATIVE_PREVIEW === "true") {
    const { inspectNativePdfPreview } = await import("./character-tabletop-pdf-native-preview");
    await inspectNativePdfPreview(viewer, out);
  }
  await writeFile(path.join(out, "browser-receipt.json"), JSON.stringify({ passed: true, pages: TABLETOP_PDF_SHEETS, checks: ["actual PDF downloads", "Letter media boxes only", "eight pages for eight choices", "one-page individual backs", "font failure and retry", "stale download retired", "desktop/tablet/phone", "saved snapshot and unsaved draft", "existing printing unchanged", "no database mutations", "PDF viewer opens on Print", "no embedded preview"] }, null, 2));
  console.log("PASS: standalone tabletop PDFs, all eight and independent selections, explicit PDF viewer, failed font retry, responsive controls, saved snapshot and unchanged database.");
}
