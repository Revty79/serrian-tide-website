import assert from "node:assert/strict";
import type { Locator, Page } from "playwright-core";
import type { DerivedAbilityUseConditionDefinition } from "../src/features/derived-abilities/models";
import { setDetailsOpen } from "./interaction-rule-browser-checks";

const labels = {
  gte: "Greater than or equal to", gt: "Greater than", lte: "Less than or equal to", lt: "Less than",
  eq: "Equal to", neq: "Not equal to", possessed: "Present / possessed", "not-possessed": "Not present / not possessed",
};

async function checkHelp(container: Locator, name: string, expected: string, keyboard = false, touch = false) {
  const button = container.getByRole("button", { name: `Help for ${name}`, exact: true });
  assert.equal(await button.innerText(), "?");
  assert.equal(await button.getAttribute("aria-expanded"), "false");
  if (keyboard) { await button.focus(); await button.press("Enter"); } else if (touch) await button.tap(); else await button.click();
  assert.equal(await button.getAttribute("aria-expanded"), "true");
  const help = container.locator(`[id="${await button.getAttribute("aria-controls")}"]`);
  assert.equal(await help.isVisible(), true);
  assert.ok((await help.innerText()).includes(expected));
  assert.equal(await help.evaluate((element) => { const rect = element.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth; }), true);
  if (keyboard) await button.press("Space"); else if (touch) await button.tap(); else await button.click();
  assert.equal(await help.isVisible(), false);
}

function condition(overrides: Partial<DerivedAbilityUseConditionDefinition>): DerivedAbilityUseConditionDefinition {
  return { conditionType: "manual", conditionKey: null, operator: null, numericValue: null, textValue: null, notes: "", sortOrder: 0, ...overrides };
}

export async function authorCreatureUseConditions(page: Page, ability: Locator, artifacts: string) {
  const expected: DerivedAbilityUseConditionDefinition[] = [];
  await checkHelp(ability, "Activation Type", "Always applies while its Use Conditions are satisfied", true);
  await setDetailsOpen(ability, "Advanced Ability Settings", true);
  const group = ability.getByRole("group", { name: "Use Conditions", exact: true });
  await checkHelp(group, "Use Conditions", "A Condition Key is the system-readable name");
  await checkHelp(group, "Use Conditions", "does not yet provide a complete system-backed Equipment/State catalog and facts");
  const manual = group.locator("[data-use-condition]").first();
  assert.deepEqual(await manual.getByLabel("Condition Type", { exact: true }).locator("option").allTextContents(), ["Manual Ruling", "Event", "Equipment", "State"]);
  await checkHelp(manual, "Condition Type", "The G.O.D. decides whether this condition is satisfied");
  assert.equal(await manual.getByLabel("Description / Notes", { exact: true }).isVisible(), true);
  for (const name of ["Event Key", "Equipment Key", "State Key", "Operator", "Comparison Operator", "Number to Compare", "Text to Compare"]) {
    assert.equal(await manual.getByLabel(name, { exact: true }).count(), 0);
  }
  await checkHelp(manual, "Description / Notes", "This does not change how the condition is evaluated");
  await manual.getByLabel("Description / Notes", { exact: true }).fill("Only while standing in moonlight.");
  // Make a previously authored complex condition manual. Every now-hidden field must survive.
  await manual.getByLabel("Condition Type", { exact: true }).selectOption("state");
  await manual.getByLabel("State Key", { exact: true }).fill("legacy-state");
  await setDetailsOpen(manual, "Advanced Comparison", true);
  await manual.getByLabel("Comparison Operator", { exact: true }).selectOption("neq");
  await manual.getByLabel("Number to Compare", { exact: true }).fill("17");
  await manual.getByLabel("Compare As", { exact: true }).selectOption("text");
  await manual.getByLabel("Text to Compare", { exact: true }).fill("legacy-text");
  await manual.getByLabel("Condition Type", { exact: true }).selectOption("manual");
  assert.equal(await manual.getByLabel("Comparison Operator", { exact: true }).count(), 0);
  await setDetailsOpen(manual, "Saved Condition Details", true);
  for (const value of ["legacy-state", "Not equal to", "17", "legacy-text"]) assert.equal(await manual.getByText(value, { exact: true }).isVisible(), true);
  await setDetailsOpen(manual, "Saved Condition Details", false);
  expected.push(condition({ conditionKey: "legacy-state", operator: "neq", numericValue: 17, textValue: "legacy-text", notes: "Only while standing in moonlight." }));

  await group.getByRole("button", { name: "Add Use Condition", exact: true }).click();
  const event = group.locator("[data-use-condition]").nth(1);
  await event.getByLabel("Condition Type", { exact: true }).selectOption("event");
  await checkHelp(event, "Condition Type", "Typing a new Event Key does NOT automatically create that event");
  await checkHelp(event, "Event Key", "The key must eventually match a fact supplied by Serrian Tide");
  await event.getByLabel("Event Key", { exact: true }).fill("successful-parry");
  assert.equal(await event.getByText("Match: Exact Event.", { exact: true }).isVisible(), true);
  assert.equal(await event.getByLabel("Operator", { exact: true }).count(), 0);
  assert.equal(await event.getByLabel("Comparison Operator", { exact: true }).isVisible(), false);
  await setDetailsOpen(event, "Advanced Comparison", true);
  await event.getByLabel("Comparison Operator", { exact: true }).selectOption("eq");
  await event.getByLabel("Compare As", { exact: true }).selectOption("text");
  await event.getByLabel("Text to Compare", { exact: true }).fill("old-event-text");
  await checkHelp(event, "Text to Compare", "Use this when the condition compares text instead of a number");
  await event.getByLabel("Comparison Operator", { exact: true }).selectOption("gte");
  assert.equal(await event.getByLabel("Compare As", { exact: true }).count(), 0);
  assert.equal(await event.getByLabel("Text to Compare", { exact: true }).count(), 0);
  await event.getByLabel("Number to Compare", { exact: true }).fill("50");
  await checkHelp(event, "Number to Compare", "Leave this blank when the condition does not compare a number");
  await event.getByLabel("Notes", { exact: true }).fill("First successful parry each round.");
  await checkHelp(event, "Notes", "This does not change how the condition is evaluated");
  expected.push(condition({ conditionType: "event", conditionKey: "successful-parry", operator: "gte", numericValue: 50, textValue: "old-event-text", notes: "First successful parry each round.", sortOrder: 1 }));

  for (const [operator, label] of Object.entries(labels)) {
    await group.getByRole("button", { name: "Add Use Condition", exact: true }).click();
    const row = group.locator("[data-use-condition]").last();
    const state = operator === "eq" || operator === "neq";
    await row.getByLabel("Condition Type", { exact: true }).selectOption(state ? "state" : "equipment");
    await checkHelp(row, "Condition Type", state ? "Typing a new key by itself does not create a new tracked state" : "Checks an equipment-related fact");
    await checkHelp(row, state ? "State Key" : "Equipment Key", "Condition Key is the system-readable name");
    await row.getByLabel(state ? "State Key" : "Equipment Key", { exact: true }).fill(state ? "enraged" : "shield-equipped");
    assert.deepEqual(await row.getByLabel("Operator", { exact: true }).locator("option").allTextContents(), ["Unspecified", labels.possessed, labels["not-possessed"]]);
    await checkHelp(row, "Operator", "how to compare the current value");
    await setDetailsOpen(row, "Advanced Comparison", true);
    const select = row.getByLabel("Comparison Operator", { exact: true });
    assert.deepEqual(await select.locator("option").allTextContents(), ["Unspecified", ...Object.values(labels)]);
    await select.selectOption({ label });
    assert.equal(await select.inputValue(), operator, "Plain English must retain the stored operator code");
    const presence = operator === "possessed" || operator === "not-possessed";
    if (state) {
      await row.getByLabel("Compare As", { exact: true }).selectOption("text");
      await row.getByLabel("Text to Compare", { exact: true }).fill("enraged");
      assert.equal(await row.getByLabel("Number to Compare", { exact: true }).count(), 0);
    } else if (!presence) {
      await row.getByLabel("Number to Compare", { exact: true }).fill("25");
      assert.equal(await row.getByLabel("Text to Compare", { exact: true }).count(), 0);
    } else {
      for (const field of ["Compare As", "Number to Compare", "Text to Compare"]) assert.equal(await row.getByLabel(field, { exact: true }).count(), 0);
    }
    expected.push(condition({ conditionType: state ? "state" : "equipment", conditionKey: state ? "enraged" : "shield-equipped",
      operator: operator as DerivedAbilityUseConditionDefinition["operator"], numericValue: !state && !presence ? 25 : null,
      textValue: state ? "enraged" : null, sortOrder: expected.length }));
    await setDetailsOpen(row, "Advanced Comparison", false);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await checkHelp(ability, "Activation Type", "The creature deliberately chooses");
  await checkHelp(group, "Use Conditions", "Some advanced Use Conditions are being authored now", false, true);
  await checkHelp(event, "Event Key", "selectable system options");
  await checkHelp(event, "Comparison Operator", "how to compare the current value");
  await event.getByRole("button", { name: "Help for Number to Compare", exact: true }).click();
  await event.screenshot({ path: `${artifacts}/use-conditions-phone.png` });
  assert.equal(await group.evaluate((element) => element.scrollWidth > element.clientWidth + 2), false);
  for (const input of await event.locator("input, select, textarea, button").all()) {
    if (await input.isVisible()) assert.equal(await input.evaluate((element) => { const box = element.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth; }), true);
  }
  await page.setViewportSize({ width: 1365, height: 1000 });
  return expected;
}

export async function checkSavedCreatureUseConditions(page: Page, ability: Locator, phone = false) {
  await setDetailsOpen(ability, "Advanced Ability Settings", true);
  const group = ability.getByRole("group", { name: "Use Conditions", exact: true });
  if (phone) await page.setViewportSize({ width: 390, height: 844 });
  await checkHelp(group, "Use Conditions", "Creature Use Conditions remain authoring metadata");
  const manual = group.locator("[data-use-condition]").first();
  assert.equal(await manual.getByLabel("Description / Notes", { exact: true }).inputValue(), "Only while standing in moonlight.");
  await setDetailsOpen(manual, "Saved Condition Details", true);
  for (const value of ["legacy-state", "Not equal to", "17", "legacy-text"]) assert.equal(await manual.getByText(value, { exact: true }).isVisible(), true);
  const event = group.locator("[data-use-condition]").nth(1);
  assert.equal(await event.getByLabel("Event Key", { exact: true }).inputValue(), "successful-parry");
  await setDetailsOpen(event, "Advanced Comparison", true);
  assert.equal(await event.getByLabel("Comparison Operator", { exact: true }).inputValue(), "gte");
  assert.equal(await event.getByLabel("Number to Compare", { exact: true }).inputValue(), "50");
  await setDetailsOpen(event, "Saved Condition Details", true);
  assert.equal(await event.getByText("old-event-text", { exact: true }).isVisible(), true);
  const text = group.locator("[data-use-condition]").nth(6);
  await setDetailsOpen(text, "Advanced Comparison", true);
  assert.equal(await text.getByLabel("Compare As", { exact: true }).inputValue(), "text");
  assert.equal(await text.getByLabel("Text to Compare", { exact: true }).inputValue(), "enraged");
  assert.equal(await text.getByLabel("Number to Compare", { exact: true }).count(), 0);
  if (phone) await page.setViewportSize({ width: 1365, height: 1000 });
}
