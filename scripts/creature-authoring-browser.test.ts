import { checkCreatureForms } from "./creature-forms-browser-checks";
import assert from "node:assert/strict";
import { checkProtectionLayers } from "./protection-layer-checks";
import { authorCreatureUseConditions, checkSavedCreatureUseConditions } from "./creature-use-conditions-browser-checks";
import { assertAttackPrimaryFields, checkOrdinaryCreatureUi } from "./creature-authoring-ui-checks";
import { authorInteractionRules, checkRejectedPercentages, checkRaceInteractions, setDetailsOpen } from "./interaction-rule-browser-checks";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { hashPassword } from "better-auth/crypto";
import { chromium } from "playwright-core";
import { db, pool } from "@/db";
import { buildCreatureNpcSnapshot, createCreatureNpcInTransaction, parseCreatureNpcSnapshot, readCreatureNpcTemplateInTransaction } from "@/features/creatures/creature-npc-constructor-service";
import { spawnEncounterCreaturesInTransaction } from "@/features/tabletop-operations/creature-spawn-service";
import { assertInteractionRuleReferences } from "@/features/interaction-rules/interaction-rule-references";
import type { InteractionRuleProfile } from "@/features/interaction-rules/interaction-rules";
import type { CreatureDraft } from "@/app/heavens/creatures/actions";

if (process.env.SERRIAN_DISPOSABLE_CREATURE_AUTHORING !== "true" || !/^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_creature_authoring_dev$/.test(process.env.DATABASE_URL ?? "")) throw new Error("Use the disposable Creature authoring harness.");
const dist = ".next-creature-authoring-browser", artifacts = path.resolve("artifacts/creature-authoring");
const userId = "creature-authoring-god", password = "Authoring-Only-Test!";
async function until(check: () => Promise<boolean>, description: string) {
  const end = Date.now() + 120_000;
  while (Date.now() < end) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 200)); }
  throw new Error(`Timed out: ${description}`);
}
async function main() {
  await mkdir(artifacts, { recursive: true });
  const tsconfig = await readFile("tsconfig.json");
  const listener = createServer(); await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const address = listener.address(); assert.ok(address && typeof address === "object"); const port = address.port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  const base = `http://localhost:${port}`;
  let server: ChildProcess | null = null, browser: Awaited<ReturnType<typeof chromium.launch>> | null = null, serverLog = "";
  const errors: string[] = [];
  try {
    await pool.query(`insert into "user" (id,name,email,email_verified,username,display_username) values ($1,'Creature Author',$2,true,$1,$1)`, [userId, `${userId}@example.invalid`]);
    await pool.query("insert into account (id,issuer,account_id,provider_id,user_id,password,updated_at) values ($1,'local:credential',$2,'credential',$2,$3,now())", [`${userId}-credential`, userId, await hashPassword(password)]);
    await pool.query("insert into user_role (user_id,role) values ($1,'god')", [userId]);
    await pool.query("insert into item_tags_catalog (canonical_id,name,tag_group,description) values ('TAG-INTERACTION-FIXTURE','Interaction Fixture','Test','Disposable test tag')");
    const referenceFixture: InteractionRuleProfile = { schemaVersion: 1, rules: [{ key: "reference", name: "Reference check", ruleType: "requirement", scope: "damage", match: "ANY", percentage: null, notes: "", sortOrder: 0, conditions: [{ key: "tag", kind: "item-tag", tagCanonicalId: "TAG-MISSING" }] }] };
    await assert.rejects(db.transaction((tx) => assertInteractionRuleReferences(tx, referenceFixture)), /Item Tag that no longer exists/);
    referenceFixture.rules[0].conditions = [{ key: "property", kind: "item-property", propertyName: "Material", value: "Silver", relatedCreatureCanonicalId: "CR-MISSING" }];
    await assert.rejects(db.transaction((tx) => assertInteractionRuleReferences(tx, referenceFixture)), /Creature that no longer exists/);
    referenceFixture.rules[0].conditions = [{ key: "property", kind: "item-property", propertyName: "Material", value: "Silver" }];
    await db.transaction((tx) => assertInteractionRuleReferences(tx, referenceFixture));
    const campaignId = (await pool.query("insert into campaign (name,overview,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,assigned_fate_points,created_by_user_id) values ('Authoring Test','',100,100,50,10,100,250,'Credits','Assigned',3,$1) returning id", [userId])).rows[0].id as number;
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(port)], { cwd: process.cwd(), env: { ...process.env, BETTER_AUTH_URL: base, NEXT_TELEMETRY_DISABLED: "1", SERRIAN_TEST_NEXT_DIST_DIR: dist }, stdio: "pipe", windowsHide: true });
    server.stdout?.on("data", (chunk) => { serverLog += String(chunk); }); server.stderr?.on("data", (chunk) => { serverLog += String(chunk); });
    await until(async () => { if (server?.exitCode !== null) throw new Error("Next exited before starting."); try { return (await fetch(`${base}/login`)).ok; } catch { return false; } }, "Next start");
    browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
    const context = await browser.newContext({ viewport: { width: 1365, height: 1000 }, hasTouch: true });
    const page = await context.newPage(); page.setDefaultTimeout(35_000); page.setDefaultNavigationTimeout(180_000); page.on("pageerror", (error) => errors.push(error.message));
    const auth = await context.request.post(`${base}/api/auth/sign-in/email`, { headers: { Origin: base }, data: { email: `${userId}@example.invalid`, password } }); assert.equal(auth.status(), 200);
    await page.goto(`${base}/heavens/creatures`); console.log("PASS: Creature editor loaded");
    await page.getByRole("button", { name: "New Creature", exact: true }).click();
    await page.getByLabel("Canonical Name", { exact: true }).fill("Authoring Test Creature");
    await page.getByRole("button", { name: "Stats & Movement", exact: true }).click();
    for (const input of await page.locator(".creature-attribute-row input[type=number]").all()) await input.fill("30");
    await page.getByRole("button", { name: "Save Creature", exact: true }).click();
    await page.getByText("Authoring Test Creature was saved.", { exact: true }).waitFor();
    const creatureId = (await pool.query("select id from creatures where created_by_user_id=$1", [userId])).rows[0].id as number;
    await pool.query("insert into creature_hit_locations(creature_id,hit_location_number,location_name,natural_armor,soak,sort_order) values ($1,9,'Scales',3,2,0)", [creatureId]);
    // Legacy rows have no authoring profile and must remain editable without backfilling mechanics.
    await pool.query("insert into creature_attacks (creature_id,canonical_id,attack_name,attack_percentage,damage,range_reach,special_effect) values ($1,'ATK-AUTHORING-LEGACY','Legacy Bite',62,'1d6','Within reach','Legacy venom remains descriptive')", [creatureId]);
    await pool.query("insert into creature_abilities (creature_id,canonical_id,ability_name,ability_type,activation,mechanical_effect) values ($1,'ABL-AUTHORING-LEGACY','Legacy Trait','Unknown old origin','While awake','Keep the old mechanical notes')", [creatureId]);
    await pool.query("insert into creature_uses (creature_id,use_name,notes) values ($1,'Hide','Harvest intact')", [creatureId]);
    await pool.query("insert into creature_defenses (creature_id,defense_type,against,value,notes) values ($1,'Resistance','fire','5','Unchanged defense')", [creatureId]);
    await pool.query("update creature_attacks set required_anatomy='Teeth',requirements='Old bite requirement',uses_recharge='Once per scene' where creature_id=$1", [creatureId]);
    await pool.query("update creature_abilities set requirements='Old ability requirement',uses_recharge='Old recharge' where creature_id=$1", [creatureId]);
    const legacyValues = async () => ({
      attacks: (await pool.query("select range_reach,required_anatomy,requirements,uses_recharge,special_effect from creature_attacks where creature_id=$1 order by canonical_id", [creatureId])).rows,
      abilities: (await pool.query("select activation,requirements,uses_recharge,mechanical_effect from creature_abilities where creature_id=$1 order by canonical_id", [creatureId])).rows,
      defenses: (await pool.query("select defense_type,against,value,notes,cr_impact,sort_order from creature_defenses where creature_id=$1 order by sort_order", [creatureId])).rows,
      uses: (await pool.query("select use_name,notes,sort_order from creature_uses where creature_id=$1 order by sort_order", [creatureId])).rows,
    });
    const legacyBefore = await legacyValues();
    const openMaster = async () => { await page.goto(`${base}/heavens/creatures`); await page.locator(".skill-library__row").filter({ hasText: "Authoring Test Creature" }).click(); };
    await openMaster();
    assert.equal(await page.getByLabel("Use Name", { exact: true }).inputValue(), "Hide");
    await page.getByRole("button", { name: "Abilities & Defenses", exact: true }).click();
    assert.equal(await page.getByLabel("Origin", { exact: true }).inputValue(), "Unknown old origin");
    assert.equal(await page.getByLabel("Activation Type", { exact: true }).inputValue(), "");
    assert.equal(await page.getByLabel("Use Name", { exact: true }).count(), 0);
    assert.equal(await page.getByLabel("Origin", { exact: true }).isVisible(), false);
    assert.equal(await page.getByText("Keep the old mechanical notes", { exact: true }).isVisible(), false);
    assert.equal(await page.getByRole("button", { name: "Add Defense", exact: true }).count(), 0);
    assert.equal(await page.getByText("Unchanged defense", { exact: true }).isVisible(), false);
    await page.getByLabel("Description", { exact: true }).fill("Legacy record saved without reinterpretation");
    await page.getByRole("button", { name: "Save Creature", exact: true }).click();
    await page.getByText("Authoring Test Creature was saved.", { exact: true }).waitFor();
    assert.deepEqual(await legacyValues(), legacyBefore, "Collapsed legacy values and visible Harvest & Utility survive save");
    const legacyAbility = page.getByRole("region", { name: "Ability authoring", exact: true });
    await setDetailsOpen(legacyAbility, "Legacy Data", true);
    assert.equal(await legacyAbility.getByText("Keep the old mechanical notes", { exact: true }).isVisible(), true);
    assert.equal(await legacyAbility.locator("details").filter({ has: page.locator("summary").filter({ hasText: /^Legacy Data$/ }) }).locator("input,textarea,select").count(), 0);
    await setDetailsOpen(legacyAbility, "Legacy Data", false);
    const defenseLegacy = page.locator("details").filter({ has: page.locator("summary").filter({ hasText: /^Legacy Defense Data$/ }) });
    await defenseLegacy.locator("summary").click();
    assert.equal(await defenseLegacy.getByText(/Unchanged defense/).isVisible(), true);
    assert.equal(await defenseLegacy.locator("input,textarea,select,button").count(), 0);
    await defenseLegacy.locator("summary").click();
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    assert.equal(await page.locator(".creature-preview__chips").getByText(/^Resistance/).count(), 0, "Legacy Defenses stay in the collapsed reference section");
    console.log("PASS: legacy Creature save through authenticated browser");
    const legacy = await db.transaction((tx) => readCreatureNpcTemplateInTransaction(tx, creatureId));
    assert.ok(legacy);
    assert.equal(legacy.attacks[0].authoring, null); assert.equal(legacy.abilities[0].authoring, null);
    const oldSnapshot = structuredClone(legacy); for (const attack of oldSnapshot.attacks) delete attack.authoring; for (const ability of oldSnapshot.abilities) delete ability.authoring;
    delete oldSnapshot.core.interactionRules;
    assert.equal(legacy.core.interactionRules, null);
    const parsedOld = parseCreatureNpcSnapshot(JSON.stringify(oldSnapshot), "Old snapshot");
    assert.equal(parsedOld.core.interactionRules, undefined);
    assert.equal(parsedOld.attacks[0].specialEffect, "Legacy venom remains descriptive"); assert.equal(parsedOld.abilities[0].mechanicalEffect, "Keep the old mechanical notes");

    await page.getByRole("button", { name: "Combat", exact: true }).click();
    const attack = page.locator(".creature-edit-card").first();
    assert.equal(await attack.getByLabel("Attack Initiative", { exact: true }).getAttribute("min"), "0.01");
    await attack.getByLabel("Attack Initiative", { exact: true }).fill("4");
    for (const mode of ["melee", "ranged", "hybrid", "aoe", "hybrid"]) {
      await attack.getByLabel("Attack Mode", { exact: true }).selectOption(mode);
      assert.equal(await attack.getByLabel("Reach", { exact: true }).count(), mode === "melee" || mode === "hybrid" ? 1 : 0);
      assert.equal(await attack.getByLabel("Short Range", { exact: true }).count(), mode === "melee" ? 0 : 1);
      assert.equal(await attack.getByLabel("Distance Unit", { exact: true }).count(), mode === "melee" ? 0 : 1);
    }
    await attack.getByLabel("Distance Unit", { exact: true }).fill("feet"); await attack.getByLabel("Reach", { exact: true }).fill("3");
    for (const [band, value] of [["Short", "10"], ["Medium", "20"], ["Long", "30"]]) await attack.getByLabel(`${band} Range`, { exact: true }).fill(value);
    await attack.getByLabel("Magical", { exact: true }).selectOption("true");
    for (const title of ["Venom condition", "Manual follow-up"]) {
      await attack.getByRole("button", { name: "Add On-Hit Effect", exact: true }).click();
      const effect = attack.locator(".creature-ability-effects > article").last();
      await effect.getByLabel("Title", { exact: true }).fill(title); await effect.getByLabel("Instructions", { exact: true }).fill(`${title} instructions`);
    }
    await attack.locator(".creature-ability-effects > article").last().getByRole("button", { name: "Up", exact: true }).click();
    await attack.locator("summary").filter({ hasText: "Magic Construction" }).click();
    await attack.getByRole("button", { name: "Build Magic Construction", exact: true }).click();
    await page.screenshot({ path: path.join(artifacts, "attack-desktop.png"), fullPage: true });

    await page.getByRole("button", { name: "Abilities & Defenses", exact: true }).click();
    for (const [index, activation] of ["passive", "activated", "triggered", "reaction"].entries()) {
      if (index) await page.getByRole("button", { name: "Add Ability", exact: true }).click();
      const ability = page.locator(".creature-edit-card").nth(index);
      if (index) await ability.getByLabel("Ability Name", { exact: true }).fill(`${activation} ability`);
      await ability.getByLabel("Activation Type", { exact: true }).selectOption(activation);
      assert.equal(await ability.getByLabel("Ability Initiative", { exact: true }).count(), activation === "passive" ? 0 : 1);
      if (activation !== "passive") {
        assert.equal(await ability.getByLabel("Ability Initiative", { exact: true }).getAttribute("min"), "0.01");
        await ability.getByLabel("Ability Initiative", { exact: true }).fill("3");
      }
      assert.equal(await ability.getByRole("button", { name: "Add Use Condition", exact: true }).isVisible(), false);
      await setDetailsOpen(ability, "Advanced Ability Settings", true);
      if (activation === "passive") assert.equal(await ability.getByRole("button", { name: "Add Resource Cost", exact: true }).count(), 0);
      await ability.getByRole("button", { name: "Add Use Condition", exact: true }).click();
      await ability.getByLabel("Description / Notes", { exact: true }).fill(`${activation} authoring condition`);
      if (activation === "activated") {
        await ability.getByRole("button", { name: "Add Resource Cost", exact: true }).click();
        await ability.getByLabel("Cost Amount", { exact: true }).fill("2");
        await ability.getByRole("button", { name: "Add Use Limit", exact: true }).click();
        await ability.getByLabel("Maximum Uses", { exact: true }).fill("2");
        await ability.getByLabel("Resolution Mode", { exact: true }).selectOption("fixed-roll"); await ability.getByLabel("Fixed Roll Target %", { exact: true }).fill("70");
        assert.equal(await ability.getByLabel("Fixed Roll Target %", { exact: true }).getAttribute("min"), "1");
      }
    }
    await page.getByRole("button", { name: "Save Creature", exact: true }).click();
    await page.getByText("Authoring Test Creature was saved.", { exact: true }).waitFor();
    console.log("PASS: attack and ability authoring saved through authenticated browser");
    const expectedUseConditions = await authorCreatureUseConditions(page, page.getByRole("region", { name: "Ability authoring", exact: true }).first(), artifacts);
    await page.getByRole("button", { name: "Save Creature", exact: true }).click();
    await page.getByText("Authoring Test Creature was saved.", { exact: true }).waitFor();
    const creatureBeforeRules = (await pool.query("select calculated_challenge_rating from creatures where id=$1", [creatureId])).rows[0].calculated_challenge_rating;
    const interactionSection = await authorInteractionRules(page, "creature");
    await checkRejectedPercentages(page, interactionSection, "Save Creature", async () => (await pool.query("select interaction_rules_json from creatures where id=$1", [creatureId])).rows[0].interaction_rules_json);
    await page.getByRole("button", { name: "Save Creature", exact: true }).click();
    await page.getByText("Authoring Test Creature was saved.", { exact: true }).waitFor();
    assert.equal((await pool.query("select calculated_challenge_rating from creatures where id=$1", [creatureId])).rows[0].calculated_challenge_rating, creatureBeforeRules, "Authored CR Impact is not double-counted");
    console.log("PASS: Creature shared Interaction Rules authored and saved without changing calculated CR");
    const template = await db.transaction((tx) => readCreatureNpcTemplateInTransaction(tx, creatureId));
    assert.ok(template);
    await openMaster();
    await page.getByRole("button", { name: "Save Creature", exact: true }).click();
    await page.getByText("Authoring Test Creature was saved.", { exact: true }).waitFor();
    const untouched = await db.transaction((tx) => readCreatureNpcTemplateInTransaction(tx, creatureId));
    for (const field of ["attacks", "abilities", "defenses", "uses"] as const) assert.deepEqual(untouched![field], template[field], `${field} must survive an unopened-card save`);
    assert.deepEqual(untouched!.core.interactionRules, template.core.interactionRules);
    assert.equal(template.attacks[0].authoring?.initiativeCost, 4); assert.equal(template.attacks[0].authoring?.mode, "hybrid");
    assert.deepEqual(template.attacks[0].authoring?.onHitEffects.map((effect) => effect.effectKey), ["effect-2", "effect-1"]);
    assert.equal(template.attacks[0].authoring?.magical, true); assert.ok(template.attacks[0].authoring?.magic?.document);
    assert.deepEqual(template.abilities.map((ability) => ability.authoring?.activationType), ["passive", "activated", "triggered", "reaction"]);
    assert.equal(template.abilities[0].abilityType, "Unknown old origin"); assert.equal(template.abilities[0].mechanicalEffect, legacy.abilities[0].mechanicalEffect);
    assert.deepEqual(template.defenses, legacy.defenses); assert.deepEqual(template.uses, legacy.uses);
    assert.deepEqual(template.abilities[0].authoring?.useConditions, expectedUseConditions);
    await page.getByRole("button", { name: "Abilities & Defenses", exact: true }).click();
    await checkSavedCreatureUseConditions(page, page.getByRole("region", { name: "Ability authoring", exact: true }).first());
    const snapshot = buildCreatureNpcSnapshot(template);
    assert.deepEqual(parseCreatureNpcSnapshot(JSON.stringify(snapshot), "New snapshot"), snapshot);
    assert.equal(template.core.interactionRules?.rules.length, 7);
    assert.deepEqual(snapshot.core.interactionRules, template.core.interactionRules);
    snapshot.core.interactionRules!.rules[0].conditions[0].key = "copy-only";
    assert.notEqual(template.core.interactionRules!.rules[0].conditions[0].key, "copy-only");
    snapshot.attacks[0].authoring!.range.short = 999;
    assert.equal(template.attacks[0].authoring?.range.short, 10, "NPC copies must not mutate the master template");
    const npcId = await db.transaction((tx) => createCreatureNpcInTransaction(tx, { campaignId, controllerUserId: userId, creatureId, name: "Authoring Individual", roleLabel: "Authoring fixture", snapshot: buildCreatureNpcSnapshot(template) }));
    const npcBefore = (await pool.query("select baseline_snapshot_json,current_snapshot_json from campaign_creature_npc_profile where character_id=$1", [npcId])).rows[0];
    assert.deepEqual(JSON.parse(npcBefore.current_snapshot_json).attacks, template.attacks);
    assert.deepEqual(JSON.parse(npcBefore.current_snapshot_json).core.interactionRules, template.core.interactionRules);
    const sessionId = (await pool.query("insert into campaign_session (campaign_id,title,sequence_number) values ($1,'Authoring',1) returning id", [campaignId])).rows[0].id;
    const sceneId = (await pool.query("insert into campaign_session_scene (campaign_id,session_id,title,sequence_number) values ($1,$2,'Authoring',1) returning id", [campaignId, sessionId])).rows[0].id;
    const encounterId = (await pool.query("insert into campaign_session_encounter (campaign_id,session_id,scene_id,title,sequence_number) values ($1,$2,$3,'Authoring',1) returning id", [campaignId, sessionId, sceneId])).rows[0].id;
    await db.transaction((tx) => spawnEncounterCreaturesInTransaction(tx, { campaignId, sessionId, sceneId, encounterId, ownerUserId: userId, encounterStatus: "planned", sceneStatus: "planned", sessionStatus: "planned" }, userId, { creatureId, quantity: 1, joinInitiative: false }));
    const occurrence = (await pool.query("select creature_snapshot_json from campaign_session_encounter_participant where encounter_id=$1", [encounterId])).rows[0].creature_snapshot_json as CreatureDraft;
    assert.deepEqual(occurrence.core.interactionRules, template.core.interactionRules);
    assert.deepEqual(occurrence.attacks, template.attacks); assert.deepEqual(occurrence.abilities, template.abilities);

    console.log("PASS: NPC construction, snapshot parsing, and direct encounter spawning");
    await page.goto(`${base}/heavens/npcs/${npcId}`);
    await page.getByRole("button", { name: "Overview", exact: true }).click();
    assert.equal(await page.getByLabel("Use Notes", { exact: true }).inputValue(), "Harvest intact");
    await page.getByRole("button", { name: "Combat", exact: true }).click();
    await assertAttackPrimaryFields(page.getByRole("region", { name: "Attack authoring", exact: true }));
    assert.equal(await page.getByText("Legacy venom remains descriptive", { exact: true }).isVisible(), false);
    assert.equal(await page.getByLabel("Attack Initiative", { exact: true }).inputValue(), "4");
    const expectRejectedNpcSave = async (message: string) => {
      await page.getByRole("button", { name: "Save Individual", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: message }).waitFor();
      await until(() => page.getByRole("button", { name: "Save Individual", exact: true }).isEnabled(), "rejected NPC save completed");
      assert.equal((await pool.query("select current_snapshot_json from campaign_creature_npc_profile where character_id=$1", [npcId])).rows[0].current_snapshot_json, npcBefore.current_snapshot_json);
    };
    for (const invalidInitiative of ["0", "-1"]) {
      await page.getByLabel("Attack Initiative", { exact: true }).fill(invalidInitiative);
      await expectRejectedNpcSave("Attack Initiative must be greater than zero");
    }
    await page.getByLabel("Attack Initiative", { exact: true }).fill("5");
    await page.getByRole("button", { name: "Abilities & Defenses", exact: true }).click();
    assert.equal(await page.getByLabel("Origin", { exact: true }).first().inputValue(), "Unknown old origin");
    await checkSavedCreatureUseConditions(page, page.getByRole("region", { name: "Ability authoring", exact: true }).first(), true);
    for (const invalidInitiative of ["0", "-1"]) {
      await page.getByLabel("Ability Initiative", { exact: true }).first().fill(invalidInitiative);
      await expectRejectedNpcSave("Ability Initiative must be greater than zero");
    }
    await page.getByLabel("Ability Initiative", { exact: true }).first().fill("3");
    await setDetailsOpen(page.getByRole("region", { name: "Ability authoring", exact: true }).nth(1), "Advanced Ability Settings", true);
    for (const invalidTarget of ["0", "-1", "101", ""]) {
      await page.getByLabel("Fixed Roll Target %", { exact: true }).fill(invalidTarget);
      await expectRejectedNpcSave(invalidTarget === "" ? "Fixed-roll resolution requires a target percentage" : "Fixed Roll Target");
    }
    await page.getByLabel("Fixed Roll Target %", { exact: true }).fill("70");
    const npcInteractions = page.getByRole("region", { name: "Interaction Rules", exact: true });
    await checkRejectedPercentages(page, npcInteractions, "Save Individual", async () => (await pool.query("select current_snapshot_json from campaign_creature_npc_profile where character_id=$1", [npcId])).rows[0].current_snapshot_json);
    await npcInteractions.getByLabel("Rule Name", { exact: true }).first().fill("Individual Silver Requirement");
    await page.getByRole("button", { name: "Save Individual", exact: true }).click();
    await until(async () => (await pool.query("select current_snapshot_json::json->'attacks'->0->'authoring'->>'initiativeCost' cost from campaign_creature_npc_profile where character_id=$1", [npcId])).rows[0].cost === "5", "NPC authoring save");
    const npcAfter = (await pool.query("select baseline_snapshot_json,current_snapshot_json from campaign_creature_npc_profile where character_id=$1", [npcId])).rows[0];
    assert.equal(npcAfter.baseline_snapshot_json, npcBefore.baseline_snapshot_json);
    assert.equal(JSON.parse(npcAfter.current_snapshot_json).core.interactionRules.rules[0].name, "Individual Silver Requirement");
    assert.equal((await db.transaction((tx) => readCreatureNpcTemplateInTransaction(tx, creatureId)))!.core.interactionRules?.rules[0].name, "Silver or Magical");
    assert.deepEqual(JSON.parse(npcAfter.current_snapshot_json).abilities, template.abilities);
    assert.deepEqual(JSON.parse(npcAfter.current_snapshot_json).defenses, template.defenses);
    assert.deepEqual(JSON.parse(npcAfter.current_snapshot_json).uses, template.uses);
    for (const field of ["rangeReach", "requiredAnatomy", "requirements", "usesRecharge", "specialEffect"] as const) assert.equal(JSON.parse(npcAfter.current_snapshot_json).attacks[0][field], template.attacks[0][field]);
    assert.equal((await db.transaction((tx) => readCreatureNpcTemplateInTransaction(tx, creatureId)))!.attacks[0].authoring?.initiativeCost, 4);
    await page.reload();
    await page.getByRole("button", { name: "Abilities & Defenses", exact: true }).click();
    await checkSavedCreatureUseConditions(page, page.getByRole("region", { name: "Ability authoring", exact: true }).first(), true);
    console.log("PASS: Use Condition help, plain labels, all stored operators, contextual fields and complex data preserved on master/NPC save/reload");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(artifacts, "abilities-phone.png"), fullPage: true });
    assert.equal(await npcInteractions.evaluate((element) => element.scrollWidth > element.clientWidth + 2), false);
    const overflow = await page.locator(".creature-authoring").evaluateAll((elements) => elements.some((element) => element.scrollWidth > element.clientWidth + 2)); assert.equal(overflow, false);
    await page.setViewportSize({ width: 1365, height: 1000 });
    await openMaster();
    await page.getByRole("button", { name: "Archive", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Archive", exact: true }).click();
    await until(async () => Boolean((await pool.query("select archived_at from creatures where id=$1", [creatureId])).rows[0].archived_at), "Creature archive");
    await page.getByRole("button", { name: "Archived", exact: true }).click();
    await page.locator(".skill-library__row").filter({ hasText: "Authoring Test Creature" }).click();
    await page.getByRole("button", { name: "Restore", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Restore", exact: true }).click();
    await until(async () => !(await pool.query("select archived_at from creatures where id=$1", [creatureId])).rows[0].archived_at, "Creature restore");
    assert.deepEqual((await db.transaction((tx) => readCreatureNpcTemplateInTransaction(tx, creatureId)))!.attacks, template.attacks);
    await page.getByRole("button", { name: "Active", exact: true }).click();
    await page.locator(".skill-library__row").filter({ hasText: "Authoring Test Creature" }).click();
    await page.getByRole("button", { name: "Abilities & Defenses", exact: true }).click();
    assert.equal(await page.getByLabel("Rule Name", { exact: true }).first().inputValue(), "Silver or Magical");
    assert.deepEqual((await db.transaction((tx) => readCreatureNpcTemplateInTransaction(tx, creatureId)))!.core.interactionRules, template.core.interactionRules);
    await page.getByRole("button", { name: "Variants & CR", exact: true }).click();
    await page.getByPlaceholder("Variant name", { exact: true }).fill("Interaction Variant");
    await page.getByRole("button", { name: "Clone as Variant", exact: true }).click();
    await until(async () => (await pool.query("select count(*)::int count from creatures where canonical_name='Interaction Variant'")).rows[0].count === 1, "Variant created");
    const variant = (await pool.query("select interaction_rules_json from creatures where canonical_name='Interaction Variant'")).rows[0].interaction_rules_json;
    assert.deepEqual(variant, template.core.interactionRules);
    await checkRaceInteractions(page, pool, base, artifacts);
    await checkOrdinaryCreatureUi(page, base, artifacts);
    await checkProtectionLayers(page, { base, artifacts, campaignId, userId, creatureId, npcId, encounterId });
    await checkCreatureForms(page, { base, artifacts, campaignId, userId });
    assert.deepEqual(errors, []);
    const result = { passed: true, checks: ["simple Attack and Ability cards", "collapsed legacy data preservation", "unchanged Harvest & Utility", "progressive rule matching", "unopened structured profile preservation", "shared Creature/Race Interaction Rules", "all matcher types", "ANY/ALL", "percentage validation", "stable keys and ordering", "NPC interaction editing", "variant interaction copy", "Race archive/restore", "old records load/save", "legacy snapshots", "conditional range UI", "ordered On-Hit Effects", "shared magic editor", "four activation types", "costs/recharge", "Origin preservation", "Harvest & Utility", "NPC construction and individual editing", "direct encounter snapshots", "archive/restore", "phone authoring layout"], errors };
    await writeFile(path.join(artifacts, "results.json"), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const lastPage = browser?.contexts()[0]?.pages()[0];
    if (lastPage) { await lastPage.screenshot({ path: path.join(artifacts, "failure.png"), fullPage: true }).catch(() => undefined); await writeFile(path.join(artifacts, "failure.txt"), await lastPage.locator("body").innerText().catch(() => "")); }
    throw error;
  } finally {
    if (browser) await browser.close();
    if (server && server.exitCode === null) { server.kill(); await new Promise<void>((resolve) => { const timer = setTimeout(resolve, 3000); server!.once("exit", () => { clearTimeout(timer); resolve(); }); }); }
    await writeFile(path.join(artifacts, "server.log"), serverLog);
    await pool.end(); await writeFile("tsconfig.json", tsconfig);
    // Keep only the ignored compiler cache for subsequent isolated runs. Database fixtures are destroyed by the parent.
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
