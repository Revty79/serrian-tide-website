import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { hashPassword } from "better-auth/crypto";
import { chromium, type Locator } from "playwright-core";
import { and, asc, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { item, armorProfile } from "@/db/item-schema";
import { derivedAbility, derivedAbilityUseCondition } from "@/db/derived-ability-schema";
import { campaignCharacterAttribute, campaignCharacterItem, campaignCharacterItemEquipmentState, campaignCharacterActiveHealth, campaignCharacterActiveCondition } from "@/db/realm-schema";
import { campaignSessionEncounterParticipant as member, campaignSessionEncounterInitiativeParticipant as initiative, campaignSessionEncounterResponderOpportunity as opportunity } from "@/db/tabletop-operations-schema";
import { readAbilityFactsInTransaction } from "@/features/ability-use-conditions/fact-service";
import { evaluateAbilityUseCondition } from "@/features/ability-use-conditions/facts";
import type { DerivedAbilityUseConditionDefinition } from "@/features/derived-abilities/models";
import { createActionDeclarationDraftInTransaction, lockActionDeclarationInTransaction, commitActionDeclarationInTransaction } from "@/features/tabletop-operations/action-declaration-service";
import { completionServiceFixture, completionDraft } from "./fixtures/combat-completion-service-fixture";

if (process.env.SERRIAN_DISPOSABLE_DERIVED_CONDITIONS !== "true" || !/^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_derived_conditions_dev$/.test(process.env.DATABASE_URL ?? "")) throw new Error("Use the disposable Derived authoring harness.");
const artifacts = path.resolve("artifacts/creature-authoring/derived-use-conditions"), password = "Disposable-Authoring-Test!";
async function until(check: () => Promise<boolean>, description: string) {
  const end = Date.now() + 120_000;
  while (Date.now() < end) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 200)); }
  throw new Error(`Timed out: ${description}`);
}
async function openDetails(row: Locator, name: string) {
  const details = row.locator("details").filter({ has: row.page().locator("summary", { hasText: new RegExp(`^${name}$`) }) });
  if (!await details.getAttribute("open").then((value) => value !== null)) await details.locator("summary").click();
}

async function main() {
  await mkdir(artifacts, { recursive: true });
  const tsconfig = await readFile("tsconfig.json");
  const listener = createServer(); await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const address = listener.address(); assert.ok(address && typeof address === "object"); const port = address.port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  const base = `http://localhost:${port}`;
  let server: ChildProcess | null = null, browser: Awaited<ReturnType<typeof chromium.launch>> | null = null, serverLog = "";
  const errors: string[] = [], checks: string[] = [];
  try {
    const f = await db.transaction((tx) => completionServiceFixture(tx, "derived-authoring"));
    await pool.query("insert into account (id,issuer,account_id,provider_id,user_id,password,updated_at) values ($1,'local:credential',$2,'credential',$2,$3,now())", [`${f.godId}-credential`, f.godId, await hashPassword(password)]);
    await pool.query("insert into user_role(user_id,role) values ($1,'god')", [f.godId]);
    await db.insert(campaignCharacterAttribute).values([{ characterId: f.heroId, attributeKey: "CON", value: 60 }, { characterId: f.defenderId, attributeKey: "CON", value: 60 }]);
    const [weapon] = await db.select().from(item).where(eq(item.id, f.weaponId));
    const [armor] = await db.insert(item).values({ canonicalId: "AUTHORING-ARMOR", name: "Authoring Armor", catalogScope: "equipment", equipmentGroup: "armor", recordType: "Armor", family: "Armor", category: "Armor", priceBasis: "unit", createdByUserId: f.godId }).returning();
    await db.insert(armorProfile).values({ itemId: armor.id, baseSoak: 1, coverage: "Head" });
    await db.insert(campaignCharacterItem).values({ characterId: f.heroId, itemId: armor.id, quantity: 1, unitCostCredits: 0 });
    const [untouched] = await db.insert(derivedAbility).values({ name: "Unrelated catalog record", acquisitionType: "awarded", activationType: "activated", description: "Preserve this whole record", createdByUserId: f.godId }).returning();
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(port)], { cwd: process.cwd(), env: { ...process.env, BETTER_AUTH_URL: base, NEXT_TELEMETRY_DISABLED: "1", SERRIAN_TEST_NEXT_DIST_DIR: ".next-creature-authoring-browser" }, stdio: "pipe", windowsHide: true });
    server.stdout?.on("data", (chunk) => { serverLog += String(chunk); }); server.stderr?.on("data", (chunk) => { serverLog += String(chunk); });
    await until(async () => { if (server?.exitCode !== null) throw new Error("Next exited before starting."); try { return (await fetch(`${base}/login`)).ok; } catch { return false; } }, "Next start");
    browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
    const context = await browser.newContext({ viewport: { width: 1365, height: 1000 } });
    const page = await context.newPage(); page.setDefaultTimeout(35_000); page.setDefaultNavigationTimeout(180_000); page.on("pageerror", (error) => errors.push(error.message));
    const auth = await context.request.post(`${base}/api/auth/sign-in/email`, { maxRetries: 2, headers: { Origin: base }, data: { email: `${f.godId}@example.invalid`, password } }); assert.equal(auth.status(), 200);
    await page.goto(`${base}/heavens/derived-abilities`);
    await page.getByRole("button", { name: "New Ability", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).fill("Typed Use Conditions");
    const group = page.locator("section.derived-ability-card").filter({ has: page.getByRole("heading", { name: "Use Conditions", exact: true }) });
    const rows = group.locator("[data-use-condition]");
    const expected: DerivedAbilityUseConditionDefinition[] = [];
    const add = async (type: DerivedAbilityUseConditionDefinition["conditionType"], key: string | null, op: DerivedAbilityUseConditionDefinition["operator"], value?: number | string) => {
      await group.getByRole("button", { name: "Add Condition", exact: true }).click();
      const row = rows.last();
      await row.waitFor();
      await row.getByLabel("Condition Type", { exact: true }).selectOption(type);
      if (key) await row.getByRole("combobox", { name: "Supported condition fact", exact: true }).selectOption(key);
      if (op) await row.getByLabel(type === "equipment" || key === "state.dead" ? "Required State" : "Comparison", { exact: true }).selectOption(op);
      if (typeof value === "number") await row.getByLabel("Number to Compare", { exact: true }).fill(String(value));
      if (typeof value === "string") await row.getByLabel("Text to Compare", { exact: true }).fill(value);
      const next = { conditionType: type, conditionKey: key, operator: op, numericValue: typeof value === "number" ? value : null, textValue: typeof value === "string" ? value : null, notes: "", sortOrder: expected.length };
      expected.push(next); return row;
    };
    await add("equipment", "equipment.armor-worn", "possessed");
    await add("equipment", "equipment.armor-worn", "not-possessed");
    const exact = await add("equipment", null, null);
    await exact.getByRole("textbox", { name: "Search supported facts" }).fill("Fixture Shortsword");
    await until(async () => (await exact.getByRole("combobox", { name: "Exact Item condition" }).locator(`option[value="${weapon.canonicalId}"]`).count()) === 1, "exact Item search");
    await exact.getByRole("combobox", { name: "Exact Item condition" }).selectOption(weapon.canonicalId);
    await exact.getByRole("combobox", { name: "Required Item state" }).selectOption("wielded");
    await exact.getByLabel("Required State", { exact: true }).selectOption("possessed");
    expected[2] = { ...expected[2], conditionKey: `equipment.item:${weapon.canonicalId}:wielded`, operator: "possessed" };
    await add("state", "state.dead", "possessed"); await add("state", "state.dead", "not-possessed");
    const numeric = await add("state", "state.hp-percent", "gte", 50);
    assert.deepEqual(await numeric.getByLabel("Comparison", { exact: true }).locator("option").allTextContents(), ["Choose comparison", "Greater than or equal to", "Greater than", "Less than or equal to", "Less than", "Equal to", "Not equal to"]);
    assert.equal(await numeric.getByLabel("Text to Compare", { exact: true }).count(), 0);
    const text = await add("state", "state.movement-mode", "eq", "Flying");
    assert.equal(await text.getByLabel("Number to Compare", { exact: true }).count(), 0);
    const event = await add("event", "combat.attack-targeted", null);
    assert.match(await event.innerText(), /No operator is needed/); assert.equal(await event.getByLabel("Comparison", { exact: true }).count(), 0);
    const custom = await add("state", null, null);
    await openDetails(custom, "Advanced / custom key"); await custom.getByRole("textbox", { name: "Condition Key", exact: true }).fill("legacy.custom-fact");
    await openDetails(custom, "Advanced Comparison"); await custom.getByLabel("Comparison Operator", { exact: true }).selectOption("neq");
    await custom.getByLabel("Number to Compare", { exact: true }).fill("17"); await custom.getByLabel("Text to Compare", { exact: true }).fill("legacy-text");
    await custom.getByLabel("Notes", { exact: true }).fill("Preserve all custom fields");
    expected[8] = { ...expected[8], conditionKey: "legacy.custom-fact", operator: "neq", numericValue: 17, textValue: "legacy-text", notes: "Preserve all custom fields" };
    const active = await add("state", null, null);
    await active.getByLabel("Exact active Condition name", { exact: true }).fill("Enraged"); await active.getByLabel("Required State", { exact: true }).selectOption("possessed");
    expected[9] = { ...expected[9], conditionKey: "state.condition:Enraged", operator: "possessed" };
    const save = async () => { await page.getByRole("button", { name: "Save Ability", exact: true }).click(); await page.getByText("Typed Use Conditions was saved.", { exact: true }).waitFor(); };
    await save();
    const [ability] = await db.select().from(derivedAbility).where(eq(derivedAbility.name, "Typed Use Conditions"));
    const conditions = async () => (await db.select().from(derivedAbilityUseCondition).where(eq(derivedAbilityUseCondition.derivedAbilityId, ability.id)).orderBy(asc(derivedAbilityUseCondition.sortOrder))).map(({ conditionType, conditionKey, operator, numericValue, textValue, notes, sortOrder }) => ({ conditionType, conditionKey, operator, numericValue, textValue, notes, sortOrder } as DerivedAbilityUseConditionDefinition));
    assert.deepEqual(await conditions(), expected);
    // Existing ambiguous and Manual records arrive with hidden comparison data.
    const ambiguous: DerivedAbilityUseConditionDefinition = { conditionType: "state", conditionKey: "state.hp-percent", operator: "eq", numericValue: 50, textValue: "legacy-percent", notes: "Keep this old combination", sortOrder: 10 };
    const manual: DerivedAbilityUseConditionDefinition = { ...ambiguous, conditionType: "manual", conditionKey: "legacy.manual", sortOrder: 11, notes: "Only in moonlight" };
    expected.push(ambiguous, manual);
    await db.insert(derivedAbilityUseCondition).values([ambiguous, manual].map((entry) => ({ ...entry, derivedAbilityId: ability.id })));
    const reopen = async () => { await page.reload(); await page.locator(".skill-library__row").filter({ hasText: "Typed Use Conditions" }).click(); await until(async () => await rows.count() === 12, "saved conditions reopen"); };
    await reopen();
    for (const index of [0, 1, 2, 3, 4, 9]) assert.equal(await rows.nth(index).getByLabel("Required State", { exact: true }).inputValue(), expected[index].operator);
    assert.equal(await rows.nth(5).getByLabel("Comparison", { exact: true }).inputValue(), "gte");
    assert.equal(await rows.nth(5).getByLabel("Number to Compare", { exact: true }).inputValue(), "50");
    assert.equal(await rows.nth(6).getByLabel("Text to Compare", { exact: true }).inputValue(), "Flying");
    assert.equal(await rows.nth(7).getByRole("combobox", { name: "Supported condition fact" }).inputValue(), "combat.attack-targeted");
    assert.match(await rows.nth(10).innerText(), /Both a number and text are saved/);
    await openDetails(rows.nth(10), "Saved Condition Details"); assert.equal(await rows.nth(10).getByLabel("Saved Text to Compare").inputValue(), "legacy-percent");
    await openDetails(rows.nth(11), "Saved Condition Details"); assert.equal(await rows.nth(11).getByLabel("Saved Condition Key").inputValue(), "legacy.manual");
    await rows.nth(11).getByLabel("Condition Type", { exact: true }).selectOption("state");
    await rows.nth(11).getByLabel("Condition Type", { exact: true }).selectOption("manual");
    await save(); assert.deepEqual(await conditions(), expected);
    await openDetails(rows.nth(10), "Saved Condition Details");
    await page.setViewportSize({ width: 390, height: 844 }); await rows.nth(10).scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await rows.nth(0).screenshot({ path: path.join(artifacts, "boolean-narrow.png") });
    await rows.nth(10).screenshot({ path: path.join(artifacts, "saved-details-narrow.png") });
    await page.screenshot({ path: path.join(artifacts, "saved-conditions-narrow.png"), fullPage: true });
    await page.setViewportSize({ width: 1365, height: 1000 }); await group.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(artifacts, "saved-conditions-desktop.png"), fullPage: true });
    checks.push("Twelve conditions save/reload with readable fact/comparison labels, stable codes, exact Item state, custom keys, ambiguous values and Manual history; phone layout has no horizontal overflow.");

    const saved = await conditions();
    const read = (participantId = f.heroId, opportunityId?: number) => db.transaction((tx) => readAbilityFactsInTransaction(tx, { ...f.context, participantId, opportunityId, requestedKeys: saved.flatMap(({ conditionKey }) => conditionKey ?? []) }));
    const evaluate = async (indices: number[], expectedResults: string[]) => {
      const facts = await read(); assert.deepEqual(indices.map((index) => evaluateAbilityUseCondition(saved[index], facts)), expectedResults); return facts;
    };
    await evaluate([0, 1, 2, 3, 4, 8, 9, 10, 11], ["unsatisfied", "satisfied", "satisfied", "unsatisfied", "satisfied", "manual", "unsatisfied", "manual", "manual"]);
    await db.insert(campaignCharacterItemEquipmentState).values({ characterId: f.heroId, itemId: armor.id, state: "worn", quantity: 1 });
    await evaluate([0, 1], ["satisfied", "unsatisfied"]);
    await db.delete(campaignCharacterItemEquipmentState).where(and(eq(campaignCharacterItemEquipmentState.characterId, f.heroId), eq(campaignCharacterItemEquipmentState.itemId, f.weaponId)));
    await evaluate([2], ["unsatisfied"]);
    await db.update(member).set({ localStateJson: { combatCondition: { status: "dead", reason: "Disposable fact fixture" } } }).where(and(eq(member.encounterId, f.encounterId), eq(member.characterId, f.heroId)));
    await evaluate([3, 4], ["satisfied", "unsatisfied"]);
    await db.update(member).set({ localStateJson: {} }).where(and(eq(member.encounterId, f.encounterId), eq(member.characterId, f.heroId)));
    const maximum = Number((await read()).get("state.maximum-hp")!.value);
    for (const [fraction, result] of [[0.6, "satisfied"], [0.4, "unsatisfied"]] as const) {
      await db.insert(campaignCharacterActiveHealth).values({ characterId: f.heroId, totalDamage: maximum * (1 - fraction) }).onConflictDoUpdate({ target: campaignCharacterActiveHealth.characterId, set: { totalDamage: maximum * (1 - fraction) } });
      const facts = await evaluate([5], [result]); assert.ok(Math.abs(Number(facts.get("state.hp-percent")!.value) - fraction * 100) < 1e-8);
    }
    for (const mode of ["Flying", "flying", "Walk"]) {
      await db.update(initiative).set({ movementMode: mode }).where(and(eq(initiative.encounterId, f.encounterId), eq(initiative.characterId, f.heroId)));
      await evaluate([6], [mode === "Flying" ? "satisfied" : "unsatisfied"]);
    }
    await db.insert(campaignCharacterActiveCondition).values({ characterId: f.heroId, name: "Enraged", description: "Exact fact", sourceKind: "god", sourceId: "fixture", sourceName: "Disposable ruling", durationKind: "scene", durationLabel: "This scene" });
    await evaluate([9], ["satisfied"]);
    await db.transaction(async (tx) => {
      await tx.update(initiative).set({ participationStatus: "holding", currentInitiative: 21 }).where(and(eq(initiative.encounterId, f.encounterId), eq(initiative.characterId, f.heroId)));
      await tx.update(initiative).set({ participationStatus: "active" }).where(and(eq(initiative.encounterId, f.encounterId), eq(initiative.characterId, f.defenderId)));
      const id = await createActionDeclarationDraftInTransaction(tx, f.context, f.god, { ...completionDraft(f.defenderId, f.heroId), sourceKind: "weapon", weaponItemId: f.weaponId });
      await lockActionDeclarationInTransaction(tx, f.context, f.god, id); await commitActionDeclarationInTransaction(tx, f.context, f.god, id, { method: "entered", enteredTotal: 70 });
      const [window] = await tx.select().from(opportunity).where(eq(opportunity.declarationId, id)); assert.ok(window);
      const facts = await readAbilityFactsInTransaction(tx, { ...f.context, participantId: f.heroId, opportunityId: window.id });
      assert.equal(evaluateAbilityUseCondition(saved[7], facts), "satisfied");
    });
    assert.equal(evaluateAbilityUseCondition(saved[7], await read()), "manual", "No response window means no manufactured Event.");
    checks.push("Saved UI conditions evaluate real Worn/Wielded equipment, dead true/false, HP 60/40 percent, exact movement text, active conditions and a server-produced attack-targeted response window. Unknown/custom and ambiguous records remain manual.");
    await openDetails(rows.nth(10), "Saved Condition Details");
    await rows.nth(10).getByLabel("Saved Text to Compare", { exact: true }).fill(""); await save(); await reopen();
    const corrected = await conditions(); assert.equal(corrected[10].textValue, null); assert.equal(corrected[10].numericValue, 50);
    await db.update(campaignCharacterActiveHealth).set({ totalDamage: maximum / 2 }).where(eq(campaignCharacterActiveHealth.characterId, f.heroId));
    assert.equal(evaluateAbilityUseCondition(corrected[10], await read()), "satisfied");
    assert.deepEqual((await db.select().from(derivedAbility).where(eq(derivedAbility.id, untouched.id)))[0], untouched);
    checks.push("The author deliberately clears the hidden text value, saves/reloads, and the equality condition becomes automatic. The unrelated Derived Ability row is byte-for-value unchanged.");
    assert.deepEqual(errors, []);
    await writeFile(path.join(artifacts, "results.json"), JSON.stringify({ passed: true, checks, errors }, null, 2)); console.log(JSON.stringify({ passed: true, checks, errors }, null, 2));
  } catch (error) {
    const page = browser?.contexts()[0]?.pages()[0];
    if (page) { await page.screenshot({ path: path.join(artifacts, "failure.png"), fullPage: true }).catch(() => undefined); await writeFile(path.join(artifacts, "failure.txt"), await page.locator("body").innerText().catch(() => "")); }
    throw error;
  } finally {
    if (browser) await browser.close();
    if (server && server.exitCode === null) { server.kill(); await new Promise<void>((resolve) => { const timer = setTimeout(resolve, 3000); server!.once("exit", () => { clearTimeout(timer); resolve(); }); }); }
    await writeFile(path.join(artifacts, "server.log"), serverLog); await pool.end(); await writeFile("tsconfig.json", tsconfig);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
