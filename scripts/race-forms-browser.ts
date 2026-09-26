import assert from "node:assert/strict";
import type { Page } from "playwright-core";
import { pool } from "@/db";

export async function checkRaceFormsBrowser(page: Page, base: string) {
  assert.equal(process.env.SERRIAN_DISPOSABLE_RACE_AUTHORING, "true");
  const name = "Forms Browser Race", variantName = "Forms Browser Variant";
  const button = (name: string) => page.getByRole("button", { name, exact: true });
  const row = (index: number) => page.getByRole("article", { name: `Form ${index}`, exact: true });
  const save = async (raceName = name) => { await button("Save Race").click(); await page.getByText(`${raceName} was saved.`, { exact: true }).waitFor(); };
  const open = async (raceName = name) => {
    await page.goto(`${base}/heavens/races`);
    await page.locator("#race-search").fill(raceName);
    await page.locator(".skill-library__row").filter({ hasText: raceName }).click();
    await button("Forms").click();
  };
  await page.goto(`${base}/heavens/races`);
  await button("New Race").click(); await page.getByLabel("Name", { exact: true }).fill(name);
  await button("Forms").click();
  await page.getByText("No alternate Forms. This Race uses its normal body and abilities.", { exact: true }).waitFor();
  await page.getByText("The Race itself is the normal state. Forms are alternate states available to this Race.", { exact: true }).waitFor();
  await page.getByText("You can describe Forms and preview them. Changing into a Form during play is not automated yet.", { exact: true }).waitFor();
  await page.evaluate(() => Object.defineProperty(crypto, "randomUUID", { configurable: true, value: undefined }));
  await button("Add Form").click();
  await page.getByRole("alert").getByText("Form Name is required.", { exact: true }).waitFor();
  await button("Save Race").click();
  await page.locator(".skill-editor__feedback").filter({ hasText: "Form Name is required" }).waitFor();
  assert.equal((await pool.query("select count(*)::int n from races where name=$1", [name])).rows[0].n, 0);
  await row(1).getByLabel("Form Name", { exact: true }).fill("Wolf Form");
  await row(1).getByLabel("Form Description", { exact: true }).fill("A wolf with a silver coat.\nA distinct alternate state.");
  await row(1).getByLabel("Form Notes", { exact: true }).fill("Authoring notes only.");
  await save();
  const raceId = (await pool.query("select id from races where name=$1", [name])).rows[0].id;
  const stored = async (id = raceId) => (await pool.query("select * from race_forms where race_id=$1 order by sort_order,id", [id])).rows;
  const original = await stored();
  await open();
  assert.equal(await row(1).getByLabel("Form Description", { exact: true }).inputValue(), original[0].description);
  assert.equal(await row(1).getByLabel("Form Notes", { exact: true }).inputValue(), original[0].notes);
  // A real authoring workflow proves the editor has no small fixed Form limit.
  for (let index = 2; index <= 20; index++) {
    await button("Add Form").click();
    await row(index).getByLabel("Form Name", { exact: true }).fill(`Alternate State ${index}`);
  }
  await row(20).getByRole("button", { name: "Move Up", exact: true }).click();
  await save();
  const many = await stored();
  assert.equal(many.length, 20);
  assert.equal(many[18].name, "Alternate State 20");
  assert.equal(many[0].id, original[0].id);
  await open();
  assert.equal(await page.getByRole("region", { name: "Race Forms", exact: true }).getByRole("article").count(), 20);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const help = row(1).locator('[data-field-guidance="Form Name"] summary');
    await help.click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await row(1).scrollIntoViewIfNeeded();
    await row(1).screenshot({ path: `artifacts/race-authoring/forms-${width}.png` });
    await help.press("Escape");
    assert.equal(await help.evaluate(element => element === document.activeElement), true);
    assert.equal(await page.locator(".skill-editor__header").getByText("Unsaved changes", { exact: true }).count(), 0);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await row(2).getByRole("button", { name: "Remove Form", exact: true }).click();
  await row(1).getByLabel("Form Name", { exact: true }).fill("Silver Wolf Form");
  await row(1).getByRole("button", { name: "Move Down", exact: true }).click();
  await save();
  const edited = await stored();
  assert.equal(edited.length, 19);
  assert.equal(edited[1].id, original[0].id);
  assert.equal(edited[1].name, "Silver Wolf Form");
  assert.deepEqual(edited.map(form => form.id).sort((a, b) => a - b), many.filter(form => form.id !== many[1].id).map(form => form.id).sort((a, b) => a - b));
  await button("Variants").click();
  await page.getByLabel("Variant Name", { exact: true }).fill(variantName);
  await button("Clone as Variant").click();
  await page.getByText(`${variantName} was created as a variant.`, { exact: true }).waitFor();
  await button("Forms").click();
  assert.equal(await row(2).getByLabel("Form Name", { exact: true }).inputValue(), "Silver Wolf Form");
  await row(2).getByLabel("Form Notes", { exact: true }).fill("Variant-only note");
  await save(variantName);
  assert.deepEqual(await stored(), edited);
  const variantId = (await pool.query("select id from races where name=$1", [variantName])).rows[0].id;
  assert.ok((await stored(variantId)).every(form => !edited.some(parent => parent.id === form.id)));
  await open();
  assert.equal(await row(2).getByLabel("Form Notes", { exact: true }).inputValue(), "Authoring notes only.");
  console.log("PASS: Forms add/edit/remove/reorder, blank-name rollback, 20-Form reload, stable IDs, independent variant, HTTP-safe keys, guidance and 1440/390px layouts");
}
