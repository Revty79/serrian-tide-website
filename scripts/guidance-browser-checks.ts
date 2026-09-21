import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import type { Page } from "playwright-core";

export async function checkRaceFieldGuidance(page: Page) {
  const field = page.locator('[data-field-guidance="Base Magic"]');
  const control = field.getByLabel("Base Magic", { exact: true });
  const initial = await control.inputValue();
  const help = field.locator("summary");
  await help.focus(); await help.press("Enter");
  await field.getByRole("note").waitFor();
  assert.match(await field.getByRole("note").innerText(), /5 × Base Magic 3 gives 15/);
  assert.ok(await control.getAttribute("aria-describedby"));
  await help.press("Escape");
  assert.equal(await field.locator("details").getAttribute("open"), null);
  assert.equal(await help.evaluate((element) => element === document.activeElement), true);
  assert.equal(await control.inputValue(), initial);
  assert.equal(await page.locator(".skill-editor__header").getByText("Unsaved changes", { exact: true }).count(), 0);

  await control.fill("9");
  await page.getByRole("button", { name: "Help with this page", exact: true }).click();
  const guide = page.getByRole("dialog", { name: "Race authoring", exact: true });
  await guide.getByLabel("Find a field or topic", { exact: true }).fill("Soak");
  await guide.getByRole("heading", { name: "Soak", exact: true }).waitFor();
  assert.match(await guide.innerText(), /only natural reduction value/);
  await guide.press("Escape");
  assert.equal(await control.inputValue(), "9", "Help preserves unsaved edits");
  assert.equal(await page.getByRole("button", { name: "Help with this page", exact: true }).evaluate((element) => element === document.activeElement), true);
  // Restore and save through the caller's existing save/reload path.
  await control.fill(initial);
  console.log("PASS: keyboard field help, described-by association, Escape/focus restoration and unsaved draft preservation");
}

export async function checkGuidanceWorkspaces(page: Page, base: string) {
  const artifacts = "artifacts/guidance"; await mkdir(artifacts, { recursive: true });
  page.on("dialog", (dialog) => { if (dialog.type() === "beforeunload") void dialog.accept(); else void dialog.dismiss(); });
  const workspaces = [
    ["/heavens/equipment", "New Equipment", "Credits", "Equipment and Inventory authoring"],
    ["/heavens/inventory", "New Item", "Price Basis", "Equipment and Inventory authoring"],
    ["/heavens/skills", "New Skill", "Primary Attribute", "Skill authoring"],
    ["/heavens/creatures", "New Creature", "Size", "Creature authoring"],
    ["/heavens/derived-abilities", "New Ability", "Name", "Derived Ability authoring"],
  ];
  for (const [path, action, name, title] of workspaces) {
    await page.goto(`${base}${path}`);
    await page.getByRole("button", { name: action, exact: true }).click();
    const field = page.locator(`[data-field-guidance="${name}"]`).first();
    await field.locator("summary").click(); await field.getByRole("note").waitFor();
    assert.ok((await field.getByRole("note").innerText()).length > 50);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${path} phone overflow`);
    await page.getByRole("button", { name: "Help with this page", exact: true }).click();
    const guide = page.getByRole("dialog", { name: title, exact: true });
    await guide.waitFor();
    await guide.getByLabel("Find a field or topic", { exact: true }).fill("zzzz-no-topic");
    await guide.getByRole("status").waitFor();
    await guide.getByRole("button", { name: "Close help", exact: true }).click();
    assert.equal(await guide.isVisible(), false);
  }
  // A desktop editor has a bounded height; phone-only checks cannot catch a
  // wrapper that clips its contents instead of letting them scroll.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}/heavens/derived-abilities`);
  await page.getByRole("button", { name: "New Ability", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Unsaved scrolling check");
  const editor = page.locator(".derived-ability-editor__content");
  const dimensions = await editor.evaluate((element) => ({ client: element.clientHeight, scroll: element.scrollHeight }));
  assert.ok(dimensions.scroll > dimensions.client, `Derived Ability desktop editor must scroll: ${JSON.stringify(dimensions)}`);
  await editor.hover({ position: { x: 30, y: 100 } });
  await page.mouse.wheel(0, 500);
  await page.waitForFunction(() => (document.querySelector(".derived-ability-editor__content")?.scrollTop ?? 0) > 0);
  const acquisition = page.locator('[data-field-guidance="Acquisition Type"]');
  await acquisition.locator("summary").click();
  await acquisition.getByRole("note").waitFor();
  await page.getByLabel("Rules Text", { exact: true }).fill("Bottom of the editor is reachable.");
  await page.getByLabel("Rules Text", { exact: true }).press("Tab");
  assert.ok(await editor.evaluate((element) => element.scrollTop > 500));
  await page.screenshot({ path: `${artifacts}/derived-ability-scroll-desktop.png` });
  assert.equal(await page.getByLabel("Name", { exact: true }).inputValue(), "Unsaved scrolling check");
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.getByLabel("Acquisition Type", { exact: true }).focus();
  await page.getByLabel("Rules Text", { exact: true }).fill("Still reachable on a shorter screen.");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Rules Text", { exact: true }).fill("Still reachable on a phone.");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  console.log("PASS: Derived Ability editor scrolls past How It Is Obtained on desktop, short screens and phones, with help open and draft preserved");
  await page.goto(`${base}/heavens/campaigns/new`);
  await page.locator('[data-field-guidance="Attribute Points"]').locator("summary").click();
  await page.locator('[data-field-guidance="Attribute Points"]').getByRole("note").waitFor();
  const browser = page.context().browser(); assert.ok(browser);
  const touch = await browser.newContext({ storageState: await page.context().storageState(), viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await touch.newPage();
  await phone.goto(`${base}/heavens/races`);
  await phone.locator(".skill-library__row").filter({ hasText: "Variant Authoring Parent" }).click();
  await phone.getByRole("button", { name: "Mechanics", exact: true }).click();
  const soak = phone.locator('[data-field-guidance="Soak"]').first();
  const trigger = soak.locator("summary");
  const bounds = await trigger.boundingBox(); assert.ok(bounds && bounds.width >= 44 && bounds.height >= 44);
  await trigger.tap(); await soak.getByRole("note").waitFor();
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await soak.screenshot({ path: `${artifacts}/soak-help-phone.png` });
  await phone.getByRole("button", { name: "Help with this page", exact: true }).tap();
  const mobileGuide = phone.getByRole("dialog", { name: "Race authoring", exact: true });
  await mobileGuide.getByLabel("Find a field or topic").fill("Soak");
  assert.equal(await mobileGuide.evaluate((element) => element.scrollWidth <= element.clientWidth), true);
  await phone.screenshot({ path: `${artifacts}/page-help-phone.png` });
  await mobileGuide.getByRole("button", { name: "Close help", exact: true }).tap();
  await touch.close();
  console.log("PASS: Equipment, Inventory, Skills, Creatures, Derived Abilities and campaign help; touch targets and searchable phone dialog");
}
