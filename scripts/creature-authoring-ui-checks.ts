import assert from "node:assert/strict";
import type { Locator, Page } from "playwright-core";
import { setDetailsOpen } from "./interaction-rule-browser-checks";

export async function assertAttackPrimaryFields(attack: Locator) {
  for (const label of ["Attack Name", "Attack %", "Attack Initiative", "Damage", "Damage Type", "Attack Mode", "Magical", "Notes"]) {
    const input = attack.getByLabel(label, { exact: true });
    assert.equal(await input.isVisible(), true, `${label} must be immediately visible`);
    assert.equal(await input.evaluate((element) => { const box = element.getBoundingClientRect(); return box.left >= 0 && box.right <= window.innerWidth; }), true, `${label} must fit within the viewport`);
  }
  for (const label of ["Range / Reach (Legacy Text)", "Special Effect (Legacy Text)", "Uses / Recharge", "Requirements", "Required Anatomy"]) {
    assert.equal(await attack.getByLabel(label, { exact: true }).count(), 0, "Legacy data is reference-only");
  }
  assert.equal(await attack.getByText("Attack Setup", { exact: true }).count(), 0);
  assert.equal(await attack.getByLabel("Attack Initiative", { exact: true }).evaluate((element) => Boolean(element.closest("[data-attack-primary]"))), true);
}

export async function checkOrdinaryCreatureUi(page: Page, base: string, artifacts: string) {
  await page.goto(`${base}/heavens/creatures`);
  await page.getByRole("button", { name: "New Creature", exact: true }).click();
  await page.getByLabel("Canonical Name", { exact: true }).fill("Simple Creature Builder");
  assert.equal(await page.getByRole("heading", { name: "Harvest & Utility", exact: true }).isVisible(), true);
  assert.equal(await page.getByRole("button", { name: "Add Use", exact: true }).isVisible(), true);
  await page.getByRole("button", { name: "Stats & Movement", exact: true }).click();
  for (const input of await page.locator(".creature-attribute-row input[type=number]").all()) await input.fill("30");
  await page.getByRole("button", { name: "Combat", exact: true }).click();
  await page.getByRole("button", { name: "Add Attack", exact: true }).click();
  const attack = page.getByRole("region", { name: "Attack authoring", exact: true });
  await assertAttackPrimaryFields(attack);
  assert.equal(await attack.locator("summary").filter({ hasText: /^Legacy Data$/ }).count(), 0);
  assert.equal(await attack.locator(".creature-ability-effects > article").count(), 0);
  assert.equal(await attack.getByRole("button", { name: "Add On-Hit Effect", exact: true }).isVisible(), true);
  assert.equal(await attack.getByRole("button", { name: "Build Magic Construction", exact: true }).isVisible(), false);
  await attack.getByLabel("Attack Name", { exact: true }).fill("Claw");
  await attack.getByLabel("Attack %", { exact: true }).fill("60");
  await attack.getByLabel("Attack Initiative", { exact: true }).fill("3");
  await attack.getByLabel("Damage", { exact: true }).fill("4");
  await attack.getByLabel("Damage Type", { exact: true }).fill("Slashing");
  await attack.getByLabel("Attack Mode", { exact: true }).selectOption("melee");
  await attack.getByLabel("Magical", { exact: true }).selectOption("false");
  assert.equal(await attack.getByLabel("Reach", { exact: true }).inputValue(), "");
  assert.equal(await attack.getByLabel("Distance Unit", { exact: true }).count(), 0);
  await attack.screenshot({ path: `${artifacts}/simple-attack-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await assertAttackPrimaryFields(attack);
  assert.equal(await attack.evaluate((element) => element.scrollWidth > element.clientWidth + 2), false);
  await attack.screenshot({ path: `${artifacts}/simple-attack-phone.png` });
  await page.setViewportSize({ width: 1365, height: 1000 });
  await page.getByRole("button", { name: "Abilities & Defenses", exact: true }).click();
  await page.getByRole("button", { name: "Add Ability", exact: true }).click();
  const ability = page.getByRole("region", { name: "Ability authoring", exact: true });
  await ability.getByLabel("Ability Name", { exact: true }).fill("Keen Senses");
  await ability.getByLabel("Description", { exact: true }).fill("The creature notices faint sounds.");
  await ability.getByLabel("Activation Type", { exact: true }).selectOption("passive");
  assert.equal(await ability.getByLabel("Ability Initiative", { exact: true }).count(), 0);
  assert.equal(await ability.getByRole("button", { name: "Add Resource Cost", exact: true }).count(), 0);
  assert.equal(await ability.getByRole("button", { name: "Add Use Condition", exact: true }).isVisible(), false);
  assert.equal(await ability.getByRole("button", { name: "Add Effect", exact: true }).isVisible(), true);
  assert.equal(await ability.locator("summary").filter({ hasText: /^Legacy Data$/ }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Add Defense", exact: true }).count(), 0);
  assert.equal(await page.locator("summary").filter({ hasText: /^Legacy Defense Data$/ }).count(), 0);
  for (const activation of ["activated", "triggered", "reaction"]) {
    await ability.getByLabel("Activation Type", { exact: true }).selectOption(activation);
    assert.equal(await ability.getByLabel("Ability Initiative", { exact: true }).isVisible(), true);
    assert.equal(await ability.getByLabel("Origin", { exact: true }).isVisible(), false);
  }
  await ability.getByLabel("Activation Type", { exact: true }).selectOption("passive");
  await setDetailsOpen(ability, "Advanced Ability Settings", true);
  assert.equal(await ability.getByLabel("Origin", { exact: true }).isVisible(), true);
  assert.equal(await ability.getByRole("button", { name: "Add Resource Cost", exact: true }).count(), 0);
  await setDetailsOpen(ability, "Advanced Ability Settings", false);
  await ability.screenshot({ path: `${artifacts}/simple-ability-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await ability.evaluate((element) => element.scrollWidth > element.clientWidth + 2), false);
  assert.equal(await ability.evaluate((element) => { const box = element.getBoundingClientRect(); return box.left >= 0 && box.right <= window.innerWidth; }), true);
  await ability.screenshot({ path: `${artifacts}/simple-ability-phone.png` });
  await page.getByRole("button", { name: "Save Creature", exact: true }).click();
  await page.getByText("Simple Creature Builder was saved.", { exact: true }).waitFor();
  await page.reload();
  await page.locator(".skill-library__row").filter({ hasText: "Simple Creature Builder" }).click();
  await page.getByRole("button", { name: "Combat", exact: true }).click();
  assert.equal(await attack.getByLabel("Attack Initiative", { exact: true }).inputValue(), "3");
  assert.equal(await attack.getByLabel("Reach", { exact: true }).inputValue(), "");
  assert.equal(await attack.locator("summary").filter({ hasText: /^Legacy Data$/ }).count(), 0);
  await attack.getByLabel("Reach", { exact: true }).fill("2");
  assert.equal(await attack.getByLabel("Reach Unit", { exact: true }).isVisible(), true);
  await attack.getByLabel("Reach Unit", { exact: true }).fill("feet");
  await page.getByRole("button", { name: "Save Creature", exact: true }).click();
  await page.getByText("Simple Creature Builder was saved.", { exact: true }).waitFor();
  await page.reload();
  await page.locator(".skill-library__row").filter({ hasText: "Simple Creature Builder" }).click();
  await page.getByRole("button", { name: "Combat", exact: true }).click();
  assert.equal(await attack.getByLabel("Reach", { exact: true }).inputValue(), "2");
  assert.equal(await attack.getByLabel("Reach Unit", { exact: true }).inputValue(), "feet");
  await page.getByRole("button", { name: "Abilities & Defenses", exact: true }).click();
  assert.equal(await ability.getByLabel("Ability Name", { exact: true }).inputValue(), "Keen Senses");
  assert.equal(await ability.getByLabel("Activation Type", { exact: true }).inputValue(), "passive");
  assert.equal(await ability.getByLabel("Origin", { exact: true }).isVisible(), false);
  await page.setViewportSize({ width: 1365, height: 1000 });
  console.log("PASS: ordinary Attack/Ability primary fields, optional controls, populated-only legacy sections, melee without range, desktop/phone and save/reload");
}
