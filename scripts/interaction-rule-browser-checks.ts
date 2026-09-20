import assert from "node:assert/strict";
import type { Locator, Page } from "playwright-core";
import type { Pool } from "pg";
import type { InteractionRuleProfile } from "@/features/interaction-rules/interaction-rules";

export async function authorInteractionRules(page: Page, owner: "race" | "creature") {
  const section = page.getByRole("region", { name: owner === "race" ? "Racial Interaction Rules" : "Interaction Rules", exact: true });
  async function add(name: string, type: string, conditionKind = "damage-type") {
    await section.getByRole("button", { name: "Add Interaction Rule", exact: true }).click();
    const rule = section.locator("[data-interaction-rule]").last();
    await rule.getByLabel("Rule Name", { exact: true }).fill(name);
    await rule.getByLabel("Rule Type", { exact: true }).selectOption(type);
    await rule.getByLabel("Condition Type", { exact: true }).selectOption(conditionKind);
    assert.equal(await rule.getByLabel("Threat / CR Impact", { exact: true }).count(), owner === "creature" ? 1 : 0);
    if (owner === "creature") await rule.getByLabel("Threat / CR Impact", { exact: true }).selectOption("Moderate");
    return rule;
  }
  const silver = await add("Silver or Magical", "requirement", "item-property");
  await silver.getByLabel("Property Name", { exact: true }).fill("Material");
  await silver.getByLabel("Property Value (optional)", { exact: true }).fill("Silver");
  assert.equal(await silver.getByLabel("Related Creature (optional)", { exact: true }).inputValue(), "");
  await silver.getByRole("button", { name: "Add Condition", exact: true }).click();
  await silver.getByLabel("Condition Type", { exact: true }).last().selectOption("magical");
  await silver.getByLabel("Magical", { exact: true }).selectOption("true");
  assert.equal(await silver.getByLabel("Percentage", { exact: true }).count(), 0);
  const immune = await add("Fire Immunity", "immunity");
  await immune.getByLabel("Damage Type", { exact: true }).fill("Fire");
  assert.equal(await immune.getByLabel("Percentage", { exact: true }).count(), 0);
  for (const [name, type, damage, percentage] of [["Fire Resistance 25%", "resistance", "Fire", "25"], ["Water Vulnerability 150%", "vulnerability", "Water", "150"], ["Fire Absorption 50%", "absorption", "Fire", "50"]]) {
    const rule = await add(name, type);
    assert.equal(await rule.getByLabel("Percentage", { exact: true }).inputValue(), "", "No percentage default");
    assert.equal(await rule.getByLabel("Percentage", { exact: true }).getAttribute("max"), null);
    await rule.getByLabel("Damage Type", { exact: true }).fill(damage);
    await rule.getByLabel("Percentage", { exact: true }).fill(percentage);
    assert.equal(await rule.getByLabel("Applies To", { exact: true }).locator("option").count(), 1);
  }
  const poison = await add("Poison Immunity", "immunity", "condition-name");
  await poison.getByLabel("Applies To", { exact: true }).selectOption("condition");
  await poison.getByLabel("Condition Name", { exact: true }).fill("Poison");
  const all = await add("Tagged Firearm Effect Requirement", "requirement", "source-kind");
  await all.getByLabel("Applies To", { exact: true }).selectOption("mechanical-effect");
  await all.getByLabel("Match", { exact: true }).selectOption("ALL");
  await all.getByLabel("Source Kind", { exact: true }).selectOption("weapon");
  await all.getByLabel("Weapon Family", { exact: true }).selectOption("firearm");
  for (const [kind, label, value] of [["item-tag", "Item Tag", "TAG-INTERACTION-FIXTURE"], ["mechanical-effect-kind", "Mechanical Effect Kind", "condition.apply"]]) {
    await all.getByRole("button", { name: "Add Condition", exact: true }).click();
    await all.getByLabel("Condition Type", { exact: true }).last().selectOption(kind);
    await all.getByLabel(label, { exact: true }).selectOption(value);
  }
  const keys = await section.locator("[data-interaction-rule]").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-interaction-rule")));
  await all.getByRole("button", { name: "Up", exact: true }).click();
  const reordered = await section.locator("[data-interaction-rule]").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-interaction-rule")));
  assert.deepEqual(reordered, [...keys.slice(0, 5), keys[6], keys[5]]);
  return section;
}

export async function checkRejectedPercentages(page: Page, section: Locator, save: string, readSaved: () => Promise<unknown>) {
  const saved = await readSaved();
  const input = section.getByLabel("Percentage", { exact: true }).first();
  for (const value of ["", "0", "-1"]) {
    await input.fill(value);
    await page.getByRole("button", { name: save, exact: true }).click();
    await page.getByText(/Percentage must be finite and greater than zero/).waitFor();
    assert.deepEqual(await readSaved(), saved, "Rejected save must leave persisted data untouched");
  }
  await input.fill("25");
}

export async function checkRaceInteractions(page: Page, pool: Pool, base: string, artifacts: string) {
  await page.goto(`${base}/heavens/races`);
  // A pre-migration Race is loaded and saved with a null profile before authoring.
  await page.locator(".skill-library__row").filter({ hasText: "Migration Legacy Race" }).click();
  await page.getByRole("button", { name: "Save Race", exact: true }).click();
  await page.getByText("Migration Legacy Race was saved.", { exact: true }).waitFor();
  const legacy = (await pool.query("select id,interaction_rules_json,legacy_description from races where name='Migration Legacy Race'")).rows[0];
  assert.equal(legacy.interaction_rules_json, null); assert.equal(legacy.legacy_description, "Keep Race lore");
  await page.getByRole("button", { name: "New Race", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Interaction Test Race");
  await page.getByRole("button", { name: "Save Race", exact: true }).click();
  await page.getByText("Interaction Test Race was saved.", { exact: true }).waitFor();
  const raceId = (await pool.query("select id from races where name='Interaction Test Race'")).rows[0].id;
  await page.getByRole("button", { name: "Attributes & Movement", exact: true }).click();
  const section = await authorInteractionRules(page, "race");
  const readSaved = async () => (await pool.query("select interaction_rules_json from races where id=$1", [raceId])).rows[0].interaction_rules_json as InteractionRuleProfile | null;
  await checkRejectedPercentages(page, section, "Save Race", readSaved);
  await page.getByRole("button", { name: "Save Race", exact: true }).click();
  await page.getByText("Interaction Test Race was saved.", { exact: true }).waitFor();
  const saved = await readSaved(); assert.equal(saved?.rules.length, 7); assert.ok(saved?.rules.every((rule) => rule.crImpact === undefined));
  await page.reload();
  await page.locator(".skill-library__row").filter({ hasText: "Interaction Test Race" }).click();
  await page.getByRole("button", { name: "Attributes & Movement", exact: true }).click();
  assert.equal(await section.getByLabel("Rule Name", { exact: true }).first().inputValue(), "Silver or Magical");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await section.evaluate((element) => element.scrollWidth > element.clientWidth + 2), false);
  await page.screenshot({ path: `${artifacts}/race-interactions-phone.png`, fullPage: true });
  await page.setViewportSize({ width: 1365, height: 1000 });
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Archive", exact: true }).click();
  await page.getByRole("button", { name: "Archived", exact: true }).click();
  await page.locator(".skill-library__row").filter({ hasText: "Interaction Test Race" }).click();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Restore", exact: true }).click();
  await page.getByRole("button", { name: "Active", exact: true }).click();
  await page.locator(".skill-library__row").filter({ hasText: "Interaction Test Race" }).click();
  await page.getByRole("button", { name: "Archive", exact: true }).waitFor();
  assert.deepEqual(await readSaved(), saved);
  console.log("PASS: Race legacy save, all rule and condition types, percentages, reload, phone layout and archive/restore");
}
