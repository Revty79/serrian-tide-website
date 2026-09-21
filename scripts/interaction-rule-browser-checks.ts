import assert from "node:assert/strict";
import type { Locator, Page } from "playwright-core";
import type { Pool } from "pg";
import type { InteractionRuleProfile } from "@/features/interaction-rules/interaction-rules";

export async function setDetailsOpen(container: Locator, title: string, open: boolean) {
  const summary = container.locator("summary").filter({ hasText: new RegExp(`^${title}$`) });
  const details = summary.locator("..");
  if ((await details.getAttribute("open") !== null) !== open) await summary.click();
}

export async function authorInteractionRules(page: Page, owner: "race" | "creature") {
  const section = page.getByRole("region", { name: owner === "race" ? "Racial Interaction Rules" : "Interaction Rules", exact: true });
  async function add(name: string, type: string, conditionKind = "damage-type") {
    await section.getByRole("button", { name: "Add Interaction Rule", exact: true }).click();
    const rule = section.locator("[data-interaction-rule]").last();
    await rule.getByLabel("Rule Name", { exact: true }).fill(name);
    await rule.getByLabel("Rule Type", { exact: true }).selectOption(type);
    assert.equal(await rule.getByLabel("Match", { exact: true }).count(), 0);
    assert.equal(await rule.getByLabel("Applies To", { exact: true }).isVisible(), false);
    assert.equal(await rule.getByLabel("Threat / CR Impact", { exact: true }).isVisible(), false);
    const condition = rule.getByLabel(type === "requirement" ? "Requires" : "Against", { exact: true });
    assert.equal(await condition.locator('option[value="source-kind"], option[value="item-tag"], option[value="mechanical-effect-kind"]').count(), 0);
    if (["source-kind", "item-tag", "mechanical-effect-kind"].includes(conditionKind)) {
      await condition.selectOption("advanced");
      await rule.getByLabel("Matching Type", { exact: true }).selectOption(conditionKind);
    } else await condition.selectOption(conditionKind);
    assert.equal(await rule.getByLabel("Threat / CR Impact", { exact: true }).count(), owner === "creature" ? 1 : 0);

    return rule;
  }
  const silver = await add("Silver or Magical", "requirement", "item-property");
  await silver.getByLabel("Property Name", { exact: true }).fill("Material");
  await silver.getByLabel("Property Value (optional)", { exact: true }).fill("Silver");
  assert.equal(await silver.getByLabel("Related Creature (optional)", { exact: true }).inputValue(), "");
  assert.equal(await silver.getByLabel("Related Creature (optional)", { exact: true }).isVisible(), false);
  await silver.getByRole("button", { name: "Add Condition", exact: true }).click();
  assert.equal(await silver.getByLabel("Match", { exact: true }).isVisible(), true);
  assert.equal(await silver.getByLabel("Match", { exact: true }).inputValue(), "ANY");
  await silver.getByLabel("Requires", { exact: true }).last().selectOption("magical");
  await silver.getByLabel("Magical", { exact: true }).selectOption("true");
  assert.equal(await silver.getByLabel(/^(Amount|Healing) \(\%\)$/).count(), 0);
  const immune = await add("Fire Immunity", "immunity");
  await immune.getByLabel("Damage Type", { exact: true }).fill("Fire");
  assert.equal(await immune.getByLabel(/^(Amount|Healing) \(\%\)$/).count(), 0);
  for (const [name, type, damage, percentage] of [["Fire Resistance 25%", "resistance", "Fire", "25"], ["Water Vulnerability 150%", "vulnerability", "Water", "150"], ["Fire Absorption 50%", "absorption", "Fire", "50"]]) {
    const rule = await add(name, type);
    assert.equal(await rule.getByLabel(/^(Amount|Healing) \(\%\)$/).inputValue(), "", "No percentage default");
    assert.equal(await rule.getByLabel(/^(Amount|Healing) \(\%\)$/).getAttribute("max"), null);
    await rule.getByLabel("Damage Type", { exact: true }).fill(damage);
    await rule.getByLabel(/^(Amount|Healing) \(\%\)$/).fill(percentage);
    assert.equal(await rule.getByLabel("Applies To", { exact: true }).count(), 0);
  }
  const poison = await add("Poison Immunity", "immunity", "condition-name");
  await setDetailsOpen(poison, "Advanced Matching", true);
  await poison.getByLabel("Applies To", { exact: true }).selectOption("condition");
  await poison.getByLabel("Condition Name", { exact: true }).fill("Poison");
  const all = await add("Tagged Firearm Effect Requirement", "requirement", "source-kind");
  await all.getByLabel("Applies To", { exact: true }).selectOption("mechanical-effect");
  await all.getByLabel("Source Kind", { exact: true }).selectOption("weapon");
  await all.getByLabel("Weapon Family", { exact: true }).selectOption("firearm");
  for (const [kind, label, value] of [["item-tag", "Item Tag", "TAG-INTERACTION-FIXTURE"], ["mechanical-effect-kind", "Mechanical Effect Kind", "condition.apply"]]) {
    await all.getByRole("button", { name: "Add Condition", exact: true }).click();
    await all.getByLabel("Matching Type", { exact: true }).last().selectOption(kind);
    await all.getByLabel(label, { exact: true }).selectOption(value);
  }
  await all.getByLabel("Match", { exact: true }).selectOption("ALL");
  for (const rule of await section.locator("[data-interaction-rule]").all()) {
    if (owner === "creature") {
      await setDetailsOpen(rule, "Advanced Matching", true);
      await rule.getByLabel("Threat / CR Impact", { exact: true }).selectOption("Moderate");
    }
    await setDetailsOpen(rule, "Advanced Matching", false);
  }
  const keys = await section.locator("[data-interaction-rule]").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-interaction-rule")));
  await all.getByRole("button", { name: "Up", exact: true }).click();
  const reordered = await section.locator("[data-interaction-rule]").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-interaction-rule")));
  assert.deepEqual(reordered, [...keys.slice(0, 5), keys[6], keys[5]]);
  return section;
}

export async function checkRejectedPercentages(page: Page, section: Locator, save: string, readSaved: () => Promise<unknown>) {
  const saved = await readSaved();
  const input = section.getByLabel(/^(Amount|Healing) \(\%\)$/).first();
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
  assert.equal(await page.getByLabel("Description", { exact: true }).inputValue(), "Keep Race lore");
  assert.equal(await page.getByLabel("Legacy Description", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "Save Race", exact: true }).click();
  await page.getByText("Migration Legacy Race was saved.", { exact: true }).waitFor();
  const legacy = (await pool.query("select id,interaction_rules_json,legacy_description from races where name='Migration Legacy Race'")).rows[0];
  assert.equal(legacy.interaction_rules_json, null); assert.equal(legacy.legacy_description, "Keep Race lore");
  await page.getByRole("button", { name: "New Race", exact: true }).click();
  assert.equal(await page.locator("summary").filter({ hasText: /^Legacy Data$/ }).count(), 0);
  await page.getByLabel("Name", { exact: true }).fill("Interaction Test Race");
  await page.getByRole("button", { name: "Save Race", exact: true }).click();
  await page.getByText("Interaction Test Race was saved.", { exact: true }).waitFor();
  const raceId = (await pool.query("select id from races where name='Interaction Test Race'")).rows[0].id;
  await page.getByRole("button", { name: "Mechanics", exact: true }).click();
  const section = await authorInteractionRules(page, "race");
  assert.ok((await page.getByRole("heading", { name: "Movement Modes", exact: true }).boundingBox())!.y < (await section.boundingBox())!.y, "Race movement appears before interaction rules");
  const readSaved = async () => (await pool.query("select interaction_rules_json from races where id=$1", [raceId])).rows[0].interaction_rules_json as InteractionRuleProfile | null;
  await checkRejectedPercentages(page, section, "Save Race", readSaved);
  await page.getByRole("button", { name: "Save Race", exact: true }).click();
  await page.getByText("Interaction Test Race was saved.", { exact: true }).waitFor();
  const saved = await readSaved(); assert.equal(saved?.rules.length, 7); assert.ok(saved?.rules.every((rule) => rule.crImpact === undefined));
  await page.reload();
  await page.locator(".skill-library__row").filter({ hasText: "Interaction Test Race" }).click();
  await page.getByRole("button", { name: "Mechanics", exact: true }).click();
  assert.equal(await section.getByLabel("Rule Name", { exact: true }).first().inputValue(), "Silver or Magical");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await section.evaluate((element) => element.scrollWidth > element.clientWidth + 2), false);
  assert.equal(await section.evaluate((element) => { const box = element.getBoundingClientRect(); return box.left >= 0 && box.right <= window.innerWidth; }), true);
  await section.locator("[data-interaction-rule]").nth(2).screenshot({ path: `${artifacts}/simple-rule-phone.png` });
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
