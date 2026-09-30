import assert from "node:assert/strict";
import path from "node:path";
import type { Locator, Page } from "playwright-core";
import type { SpecialAbilityMechanicsDocument } from "../src/features/special-abilities/models";

export async function checkToolboxAuthoring({ page, targetId, derivedId, artifacts, save, read }: {
  page: Page; targetId: number; derivedId: number; artifacts: string; save: () => Promise<void>;
  read: () => Promise<{ schema_version: number; data_json: string }>;
}): Promise<string[]> {
  const checks: string[] = [], mechanics = page.locator(".mechanics-editor"), editor = page.locator(".skill-editor");
  const button = (scope: Locator, name: string) => scope.getByRole("button", { name, exact: true });
  const field = (scope: Locator, name: string) => scope.getByLabel(name, { exact: true });
  const card = (name: string) => mechanics.locator("[data-rule-key]").filter({ has: page.getByRole("heading", { name, exact: true }) });
  const parsed = async () => JSON.parse((await read()).data_json) as SpecialAbilityMechanicsDocument;
  await page.setViewportSize({ width: 1365, height: 950 });
  const original = await read();
  await button(mechanics, "Add Resource Rule").click(); await button(mechanics, "Keep Version 1").click();
  assert.deepEqual(await read(), original);
  await save(); assert.deepEqual(await read(), original);
  await button(mechanics, "Add Resource Rule").click(); await button(mechanics, "Upgrade and Add Rule").click();
  assert.deepEqual(await read(), original);
  async function common(name: string) {
    const row = mechanics.locator("[data-rule-key]").last();
    await field(row, "Rule Title").fill(name); await field(row, "Rule Description").fill("Synthetic intrinsic definition for browser verification.");
    await field(row, "Applies When").first().selectOption("always");
    return card(name);
  }
  async function add(kind: string, name: string) {
    await field(mechanics, "Expanded rule family").selectOption(kind);
    const label = kind === "override" ? "Add Rule Override" : kind === "choice" ? "Add Choice / Binding Definition" : kind === "activated" ? "Add Activated / Triggered Rule" : `Add ${kind[0].toUpperCase() + kind.slice(1)} Rule`;
    await button(mechanics, label).click();
    return common(name);
  }
  let resource = await common("Synthetic pool");
  await field(resource, "Resource unit").fill("units"); await field(resource, "Maximum definition").selectOption("fixed");
  await field(resource, "Maximum amount").fill("8"); await button(resource, "Add Maximum Change").click();
  await field(resource, "Maximum contribution G.O.D. guidance").fill("Determine contribution manually.");
  await field(resource, "Applies When").last().selectOption("always");
  await button(resource, "Add Recovery").click(); await field(resource, "Recovery scope").selectOption("event");
  await field(resource, "Recovery event").fill("Synthetic recovery event"); await field(resource, "Recovery definition").selectOption("full");
  const modifier = await add("modifier", "Synthetic modifier");
  await field(modifier, "Modifier label").fill("Synthetic intrinsic contribution"); await field(modifier, "Modifier channel").selectOption("skill");
  await field(modifier, "Selected Skill").selectOption(String(targetId)); await field(modifier, "Modifier amount").fill("2");
  await field(modifier, "Duration").selectOption("combat-rounds"); await field(modifier, "Duration count").fill("3");
  const interaction = await add("interaction", "Synthetic interaction");
  await field(interaction, "Interaction type").selectOption("resistance"); await field(interaction, "Interaction percentage").fill("25");
  await button(interaction, "Add Incoming Condition").click(); await field(interaction, "Matching Damage Type").fill("Synthetic type");
  const choice = await add("choice", "Synthetic choice");
  await field(choice, "Choice type").selectOption("skill"); await button(choice, "Add Candidate").click();
  await field(choice, "Selected Skill").selectOption(String(targetId));
  const activated = await add("activated", "Synthetic activation");
  await field(activated, "Activation type").selectOption("reaction"); await field(activated, "Trigger or event").fill("Synthetic event response");
  await field(activated, "Target intent").selectOption("self"); await button(activated, "Add Cost").click();
  await field(activated, "Cost kind").selectOption("resource"); await field(activated, "Resource identity").selectOption("local");
  const resourceKey = await resource.getAttribute("data-rule-key"); assert.ok(resourceKey);
  await field(activated, "Local resource").selectOption(resourceKey); await field(activated, "Cost definition").selectOption("fixed"); await field(activated, "Cost amount").fill("2");
  await button(activated, "Add Use Limit").click(); await field(activated, "Maximum uses").fill("3"); await field(activated, "Use refresh scope").selectOption("scene");
  await activated.getByLabel("Synthetic choice", { exact: true }).check();
  await button(activated, "Add Intrinsic Effect").click(); await field(activated, "Effect title").fill("Synthetic effect"); await field(activated, "Effect description").fill("Manual intrinsic effect.");
  await button(activated, "Add Outcome").click(); await field(activated, "Outcome kind").selectOption("success"); await field(activated, "Outcome description").fill("The existing result selects this branch.");
  await activated.getByLabel("Effect 1: Synthetic effect", { exact: true }).check();
  const override = await add("override", "Synthetic exception");
  await field(override, "Proposed rule exception").fill("Proposed exception for G.O.D. review."); await field(override, "Conflict and precedence guidance").fill("G.O.D. decides conflicts.");
  await save();
  const first = await parsed(); assert.equal(first.schemaVersion, 2); assert.equal((await read()).schema_version, 2);
  assert.deepEqual(first.rules[0], JSON.parse(original.data_json).rules[0]);
  assert.deepEqual(first.rules.slice(1).map(rule => rule.kind), ["resource", "modifier", "interaction", "choice", "activated", "override"]);
  checks.push("deliberate v1 upgrade cancel/confirm; all six v2 families authored and saved through real browser controls; legacy rule unchanged");
  for (const row of [resource, modifier, interaction, choice, activated, override]) await button(row, "Collapse Rule").click();
  await mechanics.getByRole("heading", { name: "Special Ability Mechanics", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(artifacts, "toolbox-desktop-overview.png"), fullPage: true });
  await button(editor, "Preview").click(); assert.match(await editor.innerText(), /No Character has been evaluated/);
  assert.match(await editor.innerText(), /Synthetic Skill Reference/); await page.screenshot({ path: path.join(artifacts, "toolbox-desktop-preview.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await button(editor, "Special Ability Mechanics").click();
  // Every conditional editor must fit and accept edits at phone width.
  for (const name of ["Synthetic pool", "Synthetic modifier", "Synthetic interaction", "Synthetic choice", "Synthetic activation", "Synthetic exception"]) {
    const row = card(name); await button(row, "Edit Rule").click();
    await field(row, "Notes").fill("Synthetic mobile edit.");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: page overflow`);
    assert.ok(await row.evaluate(node => node.scrollWidth <= node.clientWidth + 1), `${name}: card overflow`);
    await row.locator("section[aria-label]").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(artifacts, `toolbox-mobile-${name.replaceAll(" ", "-")}.png`) });
    await button(row, "Collapse Rule").click();
  }
  const mobileChoice = card("Synthetic choice"); await button(mobileChoice, "Edit Rule").click();
  await field(mobileChoice, "Choice type").selectOption("attribute"); await mobileChoice.getByLabel("STR", { exact: true }).check();
  await field(mobileChoice, "Choice type").selectOption("manual"); await field(mobileChoice, "Choice G.O.D. guidance").fill("Choose a synthetic candidate manually.");
  await field(mobileChoice, "Choice type").selectOption("derived-ability"); await button(mobileChoice, "Add Candidate").click(); await field(mobileChoice, "Selected Derived Ability").selectOption(String(derivedId));
  await button(mobileChoice, "Collapse Rule").click();
  resource = card("Synthetic pool"); await button(resource, "Edit Rule").click(); await field(resource, "Rule Title").fill("Synthetic renamed pool"); resource = card("Synthetic renamed pool");
  await button(resource, "Move Rule Down").click(); await button(resource, "Collapse Rule").click();
  await save(); const renamed = await parsed();
  assert.deepEqual(renamed.rules.map(rule => rule.key).sort(), first.rules.map(rule => rule.key).sort());
  const a = renamed.rules.find(rule => rule.kind === "activated"); assert.ok(a?.kind === "activated");
  assert.equal(a.costs[0].kind === "resource" && a.costs[0].resource.kind === "local" && a.costs[0].resource.resourceKey, resourceKey);
  const mobileActivation = card("Synthetic activation"); await button(mobileActivation, "Edit Rule").click();
  await field(mobileActivation, "Intrinsic effect type").selectOption("health.heal"); await field(mobileActivation, "Health effect amount").fill("3");
  await field(mobileActivation, "Health effect timing").selectOption("over-time"); await field(mobileActivation, "Effect applications").fill("2");
  await save(); const changed = (await parsed()).rules.find(rule => rule.kind === "activated"); assert.ok(changed?.kind === "activated");
  assert.equal(changed.effects[0].key, a.effects[0].key); assert.deepEqual(changed.outcomes[0].effectKeys, a.outcomes[0].effectKeys);
  checks.push("390px edits in all six conditional editors without page/card overflow; all choice kinds; local resource survives rename/reorder; effect edits preserve outcome links");
  // A referenced child can be removed in the draft, but cannot be silently saved dangling.
  await button(mobileActivation, "Remove Intrinsic Effect").click();
  assert.match(await mechanics.innerText(), /missing intrinsic effect/);
  await button(editor, "Save Skill").click(); await editor.locator(".skill-editor__feedback.is-error").filter({ hasText: "missing intrinsic effect" }).waitFor();
  assert.equal((await parsed()).rules.find(rule => rule.kind === "activated")?.effects.length, 1);
  await button(mobileActivation, "Remove Missing Link").click(); await save();
  const corrected = (await parsed()).rules.find(rule => rule.kind === "activated"); assert.ok(corrected?.kind === "activated");
  assert.equal(corrected.effects.length, 0); assert.deepEqual(corrected.outcomes[0].effectKeys, []);
  checks.push("dangling outcome link visibly blocks save, retains draft and saved data, and can be explicitly repaired on mobile");
  return checks;
}
