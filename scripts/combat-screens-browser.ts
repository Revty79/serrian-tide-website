import assert from "node:assert/strict";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Page, type Browser } from "playwright-core";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { item, weaponProfile, itemPower, itemPowerEffect, itemPowerResource, itemPowerConstruction } from "@/db/item-schema";
import { campaignInventoryItem, campaignCharacterItem, campaignCharacterItemInstance } from "@/db/realm-schema";
import { submitCombatChoiceInTransaction } from "@/features/combat-screen/choice-service";
import { lockPlayerCombatContextInTransaction } from "@/features/tabletop-operations/player-combat-ruling-service";
import { screenFixture, addScreenSpell, addScreenRecoverySpell, addScreenFirearm, SCREEN_PASSWORD } from "./fixtures/combat-screens-browser-fixture";
import { createPass6Walkthrough, runPass6Walkthrough } from "./pass6-gameplay-walkthrough";
async function main() {
if (process.env.SERRIAN_DISPOSABLE_COMBAT_SCREENS !== "true" || !/^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_combat_screens_dev$/.test(process.env.DATABASE_URL ?? "")) throw new Error("A newly migrated disposable screen database is required.");
const artifactSubdir = process.env.COMBAT_SCREEN_ARTIFACT_SUBDIR ?? "";
if (artifactSubdir && !/^[a-z0-9_-]+$/i.test(artifactSubdir)) throw new Error("Use a simple combat artifact subdirectory name.");
const artifacts = path.resolve("artifacts/combat-screens", artifactSubdir);
await mkdir(artifacts, { recursive: true });
const resultPath = path.join(artifacts, process.env.COMBAT_SCREEN_CASE_FILTER ? `results-${process.env.COMBAT_SCREEN_CASE_FILTER.replace(/[^a-z0-9_-]/gi, "_")}.json` : "results.json");
const listener = createServer(); await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
const address = listener.address(); assert.ok(address && typeof address === "object"); const port = address.port;
await new Promise<void>((resolve) => listener.close(() => resolve()));
const base = `http://localhost:${port}`, results: string[] = [], errors: string[] = [];
const include = (name: string) => !process.env.COMBAT_SCREEN_CASE_FILTER || process.env.COMBAT_SCREEN_CASE_FILTER.split(",").some((filter) => name.includes(filter));
let server: ChildProcess | null = null, browser: Browser | null = null, serverLog = "";
type Fixture = Awaited<ReturnType<typeof screenFixture>>;
async function until(check: () => Promise<boolean>, label: string, timeout = 25_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 200)); }
  throw new Error(`Timed out: ${label}`);
}
function screen(page: Page) { return page.locator("[data-combat-screen]"); }
async function login(id: string, role: "god" | "player", f: Fixture, automatic = false) {
  const context = await browser!.newContext({ viewport: { width: 1365, height: 1000 } });
  const page = await context.newPage(); page.setDefaultTimeout(25_000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && /unique.*key|same key/i.test(message.text())) errors.push(message.text()); });
  const signedIn = await context.request.post(`${base}/api/auth/sign-in/email`, { maxRetries: 2, headers: { Origin: base }, data: { email: `${id}@example.invalid`, password: SCREEN_PASSWORD } });
  assert.equal(signedIn.status(), 200, "The disposable account authenticates through the real auth endpoint.");
  await page.goto(`${base}/${role === "god" ? "heavens" : "realms"}/tabletop?combat=${f.encounterId}${role === "player" ? `&character=${f.heroId}` : ""}`);
  await screen(page).waitFor(); await until(() => screen(page).getByRole("button", { name: "Refresh", exact: true }).isEnabled(), "combat first read");
  await screen(page).getByText("Live", { exact: true }).waitFor();
  if (role === "god" && !automatic && await screen(page).getByRole("checkbox", { name: "Automatic flow", exact: true }).count()) await screen(page).getByRole("checkbox", { name: "Automatic flow", exact: true }).uncheck();
  return page;
}
async function selectGod(page: Page, name: string) { await screen(page).getByRole("region", { name: "Combatants", exact: true }).getByRole("button", { name: new RegExp(`^${name}`) }).click(); await screen(page).getByRole("region", { name: "Selected combatant detail" }).getByRole("heading", { name, exact: true }).waitFor(); await until(() => screen(page).getByRole("button", { name: "Refresh", exact: true }).isEnabled(), "selected information refreshed"); }
async function chooseAttack(page: Page, target: number, roll = "80", source: string | null = "Fixture Shortsword") {
  const view = screen(page);
  await view.getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: "Attack", exact: true }).click();
  const sourcePicker = view.getByRole("combobox", { name: /^Attack source/ });
  await until(async () => await sourcePicker.locator("option").count() > 1, "owned Attack source");
  if (source !== null) await sourcePicker.selectOption({ label: source });
  else {
    const authoredSource = sourcePicker.locator("option:not([value=''])");
    assert.equal(await authoredSource.count(), 1, "The Creature fixture has one authored attack.");
    assert.equal(await sourcePicker.inputValue(), await authoredSource.getAttribute("value"), "Its sole authored attack is selected without changing the dropdown.");
  }
  await view.getByRole("combobox", { name: /^Target/ }).selectOption(String(target));
  assert.equal(await view.getByLabel("Target distance", { exact: true }).count(), 0, "Melee attacks do not ask for distance.");
  if (source === null) {
    try { await view.getByRole("combobox", { name: "Roll method", exact: true }).waitFor(); }
    catch (error) { throw new Error(`Automatic Creature source never became previewable: ${await view.innerText()}`, { cause: error }); }
  }
  await view.getByRole("combobox", { name: "Roll method", exact: true }).selectOption("physical");
  await view.getByLabel("Percentile result", { exact: true }).fill(roll);
}
async function commitAttack(page: Page) { await screen(page).getByRole("button", { name: "Commit Attack & Roll", exact: true }).click(); }
async function confirmPlayerDistance(director: Page, player: Page) {
  const previous = await screen(director).getByRole("region", { name: "Selected combatant detail" }).getByRole("heading", { level: 2 }).innerText();
  await screen(player).getByLabel("Target distance", { exact: true }).fill("25");
  await screen(player).getByLabel("Distance unit", { exact: true }).fill("feet");
  await screen(player).getByRole("button", { name: "Request G.O.D. distance confirmation", exact: true }).click();
  await screen(player).getByText("Distance sent to the Campaign-owning G.O.D. for confirmation.", { exact: true }).waitFor();
  await selectGod(director, "Rowan");
  if (!await screen(director).getByLabel("Ruling / participation reason", { exact: true }).isVisible()) await screen(director).getByText("G.O.D. controls for Rowan", { exact: true }).click();
  await screen(director).getByLabel("Ruling / participation reason", { exact: true }).fill("Confirm this measured distance for the exact selected weapon and target.");
  const request = screen(director).locator("fieldset").filter({ hasText: "weapon distance" }).first();
  await request.getByRole("button", { name: "Approve", exact: true }).click();
  await screen(player).getByText(/G\.O\.D\. approved distance: 25 feet/).waitFor();
  if (previous !== "Rowan") await selectGod(director, previous);
}
async function declarations(f: Fixture) { return (await pool.query("select * from campaign_session_encounter_action_declaration where encounter_id=$1 order by id", [f.encounterId])).rows; }
async function advanceAction(page: Page, pendingActionId: number) {
  await screen(page).getByRole("button", { name: "Refresh", exact: true }).click();
  await until(() => screen(page).getByRole("button", { name: "Refresh", exact: true }).isEnabled(), "fresh progression state");
  await screen(page).getByRole("button", { name: "Advance combat", exact: true }).click();
  await until(async () => (await pool.query("select remaining_initiative_cost from campaign_session_encounter_pending_action where id=$1", [pendingActionId])).rows[0].remaining_initiative_cost === 0, "action timing completes");
}
async function screenshot(page: Page, name: string, width = 1365) {
  await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
  await page.screenshot({ path: path.join(artifacts, `${name}.png`), fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} must not overflow horizontally`);
}
try {
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: process.cwd(), windowsHide: true,
    env: { ...process.env, NODE_ENV: "development", BETTER_AUTH_URL: base, BETTER_AUTH_SECRET: "disposable-screen-auth-secret-with-more-than-32-characters", NEXT_TELEMETRY_DISABLED: "1", SERRIAN_TEST_NEXT_DIST_DIR: process.env.SERRIAN_TEST_NEXT_DIST_DIR || ".next-combat-screens-browser" }, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout?.on("data", (chunk) => { serverLog += String(chunk); }); server.stderr?.on("data", (chunk) => { serverLog += String(chunk); });
  await until(async () => { if (server?.exitCode != null) throw new Error(`Isolated Next server exited: ${serverLog}`); try { return (await fetch(`${base}/login`, { signal: AbortSignal.timeout(10_000) })).ok; } catch { return false; } }, "isolated Next server", 150_000);
  browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true });
  if (include("start")) {
    const f = await db.transaction((tx) => screenFixture(tx, "start"));
    await pool.query("update campaign_session_encounter set status='completed', completed_at=now() where id=$1", [f.encounterId]);
    await pool.query("update campaign_session_encounter_initiative set status='closed', closed_at=now() where encounter_id=$1", [f.encounterId]);
    await pool.query("update campaign_session_scene set status='planned', started_at=null where id=$1", [f.sceneId]);
    await pool.query("update campaign_session set status='planned', started_at=null where id=$1", [f.sessionId]);
    const director = await login(f.godId, "god", f);
    await screen(director).getByRole("link", { name: "Back to Scene", exact: true }).click();
    const library = director.getByRole("region", { name: "Encounter library", exact: true });
    await library.getByText("Prepare an encounter", { exact: true }).click();
    await library.getByLabel("Encounter title", { exact: true }).fill("Screen-started fight");
    await library.getByRole("button", { name: "Prepare encounter", exact: true }).click();
    await library.getByRole("heading", { name: "Screen-started fight", exact: true }).waitFor();
    for (const id of [f.heroId, f.defenderId]) {
      await library.getByRole("combobox", { name: /^Scene member/ }).selectOption(String(id));
      await library.getByRole("button", { name: "Add to encounter", exact: true }).click();
      await until(async () => await library.getByRole("combobox", { name: /^Scene member/ }).locator(`option[value='${id}']`).count() === 0, "Scene member added");
    }
    await library.getByText("Add Creatures", { exact: true }).click();
    await library.getByRole("combobox", { name: /^Creature/ }).selectOption(String(f.templateId));
    await library.getByRole("button", { name: "Add Creatures to Encounter", exact: true }).click();
    await library.locator(".tabletop-scene-member").filter({ hasText: "Fixture Goblin 1" }).getByText("Encounter Creature", { exact: true }).waitFor();
    await library.screenshot({ path: path.join(artifacts, "encounter-library-desktop.png") });
    await director.setViewportSize({ width: 390, height: 844 });
    await library.screenshot({ path: path.join(artifacts, "encounter-library-narrow.png") });
    await director.setViewportSize({ width: 1365, height: 1000 });
    await library.getByRole("link", { name: "Open Combat", exact: true }).click();
    await screen(director).getByText("Live", { exact: true }).waitFor();
    assert.equal(await screen(director).getByRole("button", { name: "Start encounter", exact: true }).isDisabled(), true);
    assert.equal(await screen(director).getByRole("button", { name: "Initialize combat", exact: true }).isDisabled(), true);
    await screen(director).getByText("Start the Session, then the Scene and encounter.", { exact: false }).waitFor();
    await screen(director).getByRole("button", { name: "Start Session", exact: true }).click();
    await screen(director).getByRole("button", { name: "Start Scene", exact: true }).click();
    await screen(director).getByRole("button", { name: "Start encounter", exact: true }).click();
    await until(() => screen(director).getByRole("button", { name: "Initialize combat", exact: true }).isEnabled(), "active Encounter setup");
    await screen(director).getByRole("button", { name: "Initialize combat", exact: true }).click();
    const created = (await pool.query("select id from campaign_session_encounter where scene_id=$1 and title='Screen-started fight'", [f.sceneId])).rows[0].id;
    await until(async () => (await pool.query("select count(*)::int n from campaign_session_encounter_initiative_participant where encounter_id=$1", [created])).rows[0].n === 3, "all selected combatants initialized");
    await screen(director).getByRole("checkbox", { name: "Automatic flow", exact: true }).uncheck();
    const participant = await login(f.playerId, "player", { ...f, encounterId: created });
    await screen(participant).getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: "Hold", exact: true }).click();
    await screen(participant).getByRole("button", { name: "Hold Initiative", exact: true }).click();
    await selectGod(director, "Sentry NPC");
    await screen(director).getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: "Hold", exact: true }).click();
    await screen(director).getByRole("button", { name: "Hold Initiative", exact: true }).click();
    await until(async () => (await pool.query("select count(*)::int n from campaign_session_encounter_initiative_participant where encounter_id=$1 and participation_status='holding'", [created])).rows[0].n === 2, "both Character choices committed");
    await selectGod(director, "Fixture Goblin 1");
    await screen(director).getByRole("button", { name: "Advance combat", exact: true }).click();
    await screen(director).getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: "Attack", exact: true }).click();
    await screen(director).getByRole("combobox", { name: /^Attack source/ }).selectOption({ label: "Shortsword" });
    await screen(director).getByRole("combobox", { name: /^Target/ }).selectOption(String(f.heroId));
    await screen(director).getByRole("combobox", { name: "Roll method", exact: true }).selectOption("physical");
    await screen(director).getByLabel("Percentile result", { exact: true }).fill("20");
    await commitAttack(director);
    await until(async () => (await declarations({ ...f, encounterId: created })).length === 1, "direct Creature attack committed");
    assert.ok((await declarations({ ...f, encounterId: created }))[0].actor_character_id < 0);
    results.push("Planned Session and Scene show the start prerequisites; G.O.D. starts each from combat setup, initializes Characters and a direct Creature, and commands the NPC and Creature.");
    await director.context().close(); await participant.context().close();
  }
  if (include("affordability")) {
    const f = await db.transaction((tx) => screenFixture(tx, "affordability"));
    await pool.query("update campaign_session_encounter_initiative_participant set current_initiative=2 where encounter_id=$1 and character_id=$2", [f.encounterId, f.heroId]);
    await pool.query("update campaign_session_encounter_initiative set timeline_initiative=2 where encounter_id=$1", [f.encounterId]);
    const participant = await login(f.playerId, "player", f);
    await chooseAttack(participant, f.occurrences[0]);
    await screen(participant).getByText(/This action costs 4 Initiative; only 2 remains/).waitFor();
    assert.equal(await screen(participant).getByRole("button", { name: "Commit Attack & Roll", exact: true }).isDisabled(), true);
    assert.equal((await declarations(f)).length, 0);
    await screen(participant).getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: "Move", exact: true }).click();
    await screen(participant).getByLabel("Distance in feet", { exact: true }).fill("4");
    await screen(participant).getByRole("button", { name: "Check movement cost", exact: true }).click();
    await screen(participant).getByText("4 feet · 2 Initiative", { exact: true }).waitFor();
    await screen(participant).getByRole("button", { name: "Declare movement", exact: true }).click();
    await until(async () => (await declarations(f)).length === 1, "exact-cost movement commits");
    const [record] = await declarations(f);
    assert.equal(record.locked_snapshot_json.initiativeCost, 2);
    assert.equal((await pool.query("select count(*)::int n from campaign_session_roll where encounter_id=$1", [f.encounterId])).rows[0].n, 0);
    results.push("Two Initiative shows why a four-point attack is unavailable, preserves no committed Roll, and allows a two-point movement through Player controls.");
    await participant.context().close();
  }
  if (include("pass6-walkthrough")) {
    const f = await createPass6Walkthrough();
    const god = await login(f.godId, "god", f), player = await login(f.playerId, "player", f);
    const steps: string[] = [];
    const completed = await runPass6Walkthrough(f, async (step) => {
      for (const page of [god, player]) {
        await screen(page).getByRole("button", { name: "Refresh", exact: true }).click(); await screen(page).getByText("Live", { exact: true }).waitFor();
        await until(() => screen(page).getByRole("button", { name: "Refresh", exact: true }).isEnabled(), "walkthrough inspection");
      }
      assert.doesNotMatch(await screen(player).innerText(), /PRIVATE_WALKTHROUGH/);
      const historySummary = screen(god).getByText("Rolls & results", { exact: true });
      if (await historySummary.locator("..").getAttribute("open") === null) await historySummary.click();
      const history = screen(god).locator("details").filter({ has: god.locator(":scope > summary").filter({ hasText: /Fixture Shortsword|Shortsword|Screen Arc Bolt|Screen Pistol|Watcher's Mark/ }) });
      for (const entry of await history.all()) if (await entry.locator(":scope > summary").count() && await entry.getAttribute("open") === null) await entry.locator(":scope > summary").click();
      for (const summary of await screen(god).getByText("Protection and interaction calculation", { exact: true }).all()) if (await summary.locator("..").getAttribute("open") === null) await summary.click();
      await screenshot(god, `pass6-walkthrough-${steps.length + 1}`, 390);
      await screenshot(player, `pass6-player-${steps.length + 1}`, 390);
      await god.setViewportSize({ width: 1365, height: 1000 });
      steps.push(step);
    }, async () => {
      const before = (await pool.query("select id,authored_value_json,final_value_json,status from campaign_session_encounter_effect where encounter_id=$1 order by id", [f.encounterId])).rows;
      await screen(god).getByRole("button", { name: "Freeze Combat", exact: true }).click();
      await god.reload(); await screen(god).getByRole("button", { name: "Resume Combat", exact: true }).waitFor();
      await screen(god).getByRole("checkbox", { name: "Automatic flow", exact: true }).uncheck();
      await screenshot(god, "pass6-walkthrough-frozen", 390);
      await screen(god).getByRole("button", { name: "Resume Combat", exact: true }).click();
      await screen(god).getByRole("button", { name: "Freeze Combat", exact: true }).waitFor();
      assert.deepEqual((await pool.query("select id,authored_value_json,final_value_json,status from campaign_session_encounter_effect where encounter_id=$1 order by id", [f.encounterId])).rows, before);
      steps.push("Freeze, reload inspection and Resume preserve all results");
    });
    assert.equal(completed.length, 5);
    const saved = (await pool.query("select id,authored_value_json,final_value_json,status from campaign_session_encounter_effect where encounter_id=$1 order by id", [f.encounterId])).rows;
    await god.setViewportSize({ width: 1365, height: 1000 });
    await screen(god).getByRole("link", { name: "End Combat & XP", exact: true }).click();
    const closeout = screen(god).locator("#combat-closeout");
    const encounterReward = closeout.locator("fieldset").filter({ has: god.locator("legend", { hasText: "Additional encounter XP" }) });
    await encounterReward.getByLabel("XP per selected Character").fill("2");
    await encounterReward.getByLabel("Rowan", { exact: true }).check();
    await closeout.getByRole("button", { name: "Preview closeout", exact: true }).click();
    await closeout.getByRole("button", { name: "End Combat & award XP", exact: true }).click();
    await until(async () => (await pool.query("select status from campaign_session_encounter where id=$1", [f.encounterId])).rows[0].status === "completed", "combined mock combat closes");
    await player.waitForURL((url) => !url.searchParams.has("combat"));
    assert.deepEqual((await pool.query("select id,authored_value_json,final_value_json,status from campaign_session_encounter_effect where encounter_id=$1 order by id", [f.encounterId])).rows, saved);
    assert.equal((await pool.query("select experience from campaign_character_profile where character_id=$1", [f.heroId])).rows[0].experience, 14);
    steps.push("Normal combat closeout preserves the five completed action plans and returns the Player to Tabletop");
    await writeFile(path.join(artifacts, "pass6-walkthrough.json"), JSON.stringify({ steps, plans: completed }, null, 2));
    results.push(...steps.map((step) => `Pass 6 combined encounter: ${step}.`));
    await god.context().close(); await player.context().close();
  }
  if (include("pass5-response")) {
    const f = await db.transaction((tx) => screenFixture(tx, "pass5-response")), target = f.occurrences[0];
    const { rows: [record] } = await pool.query("select creature_snapshot_json from campaign_session_encounter_participant where character_id=$1", [target]);
    record.creature_snapshot_json.abilities = [{ canonicalId: "p5-guard", abilityName: "Reactive Guard", description: "An authored response", effects: [], authoring: {
      schemaVersion: 1, activationType: "reaction", initiativeCost: 2, resolutionMode: "automatic", fixedRollTarget: null, targeting: "self", costs: [], useLimits: [], magical: false, magic: null,
      useConditions: [{ conditionType: "event", conditionKey: "combat.attack-targeted", operator: null, numericValue: null, textValue: null, notes: "", sortOrder: 0 }],
    } }];
    await pool.query("update campaign_session_encounter_participant set creature_snapshot_json=$1 where character_id=$2", [record.creature_snapshot_json, target]);
    await pool.query("update campaign_session_encounter_initiative_participant set participation_status='holding',current_initiative=21 where character_id=$1", [target]);
    const god = await login(f.godId, "god", f), player = await login(f.playerId, "player", f);
    await chooseAttack(player, target, "70"); await commitAttack(player);
    await until(async () => (await declarations(f)).length === 1, "Reaction stimulus committed");
    await screen(god).getByRole("button", { name: "Refresh", exact: true }).click();
    await until(() => screen(god).getByRole("button", { name: "Advance combat", exact: true }).isEnabled(), "response timing ready");
    await screen(god).getByRole("button", { name: "Advance combat", exact: true }).click();
    await selectGod(god, "Fixture Goblin 1");
    await screen(god).getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: "Defend", exact: true }).click();
    const { rows: [window] } = await pool.query("select id from campaign_session_encounter_responder_opportunity where encounter_id=$1 and responder_character_id=$2 and status='pending'", [f.encounterId, target]);
    await screen(god).getByRole("combobox", { name: /^Respond to/ }).selectOption(String(window.id));
    await screen(god).getByRole("combobox", { name: /^Defense/ }).selectOption("intervention");
    await screen(god).getByRole("combobox", { name: /^Intervention source/ }).selectOption("creature-ability|p5-guard");
    await screen(god).getByText("No Roll required.", { exact: true }).waitFor();
    const current = async () => (await pool.query("select current_initiative from campaign_session_encounter_initiative_participant where character_id=$1", [target])).rows[0].current_initiative;
    assert.equal(await current(), 21);
    await screenshot(god, "pass5-response-narrow", 390);
    await screen(god).getByRole("button", { name: "Commit response", exact: true }).click();
    await until(async () => await current() === 19, "authored Reaction spends its cost at commit");
    assert.equal((await pool.query("select count(*)::int n from campaign_session_encounter_reaction where encounter_id=$1 and reaction_type='intervention'", [f.encounterId])).rows[0].n, 1);
    results.push("Pass 5 Reaction: a real targeted-attack window surfaces the authored choice, preview spends nothing, explicit commitment spends its authored Initiative once, narrow layout stays usable.");
    await god.context().close(); await player.context().close();
  }
  if (include("playable")) {
  const f = await db.transaction((tx) => screenFixture(tx, "playable"));
  const god = await login(f.godId, "god", f), player = await login(f.playerId, "player", f);
  assert.equal(await screen(player).getByRole("region", { name: "Combatants", exact: true }).count(), 0);
  await chooseAttack(player, f.occurrences[0]);
  // Freeze/resume uses the shared control while a local draft remains intact.
  await until(() => screen(god).getByRole("button", { name: "Freeze Combat", exact: true }).isEnabled(), "live G.O.D.");
  await screen(god).getByRole("button", { name: "Freeze Combat", exact: true }).click();
  await until(() => screen(player).getByRole("button", { name: "Commit Attack & Roll", exact: true }).isDisabled(), "Player observes Freeze");
  assert.equal(await screen(player).getByLabel("Percentile result").inputValue(), "80");
  assert.ok((await screen(player).innerText()).includes("HP"));
  await screen(god).getByRole("button", { name: "Resume Combat", exact: true }).click();
  await until(() => screen(player).getByRole("button", { name: "Commit Attack & Roll", exact: true }).isEnabled(), "Player observes Resume");
  await screen(player).getByLabel("Percentile result").focus();
  const scroll = await player.evaluate(() => scrollY);
  await player.context().setOffline(true);
  await screen(player).getByText("Reconnecting", { exact: true }).waitFor();
  await player.context().setOffline(false);
  await screen(player).getByText("Live", { exact: true }).waitFor();
  await until(() => screen(player).getByRole("button", { name: "Commit Attack & Roll", exact: true }).isEnabled(), "fresh reconnect state");
  assert.equal(await screen(player).getByLabel("Percentile result").inputValue(), "80");
  assert.equal(await screen(player).getByRole("combobox", { name: /^Target/ }).inputValue(), String(f.occurrences[0]));
  assert.ok(await screen(player).getByLabel("Percentile result").evaluate((element) => document.activeElement === element));
  assert.ok(Math.abs(await player.evaluate(() => scrollY) - scroll) < 2);
  assert.equal((await declarations(f)).length, 0);
  results.push("An actual offline/reconnect cycle preserves target, Roll draft, focus and scroll without submitting a choice.");
  results.push("Freeze/Resume is shared; inspection and the Player action draft remain available.");
  await screenshot(player, "player-desktop"); await screenshot(god, "god-desktop");
  await screenshot(player, "player-narrow", 390); await screenshot(god, "god-narrow", 390);
  await player.setViewportSize({ width: 1365, height: 1000 }); await god.setViewportSize({ width: 1365, height: 1000 });
  await commitAttack(player); await until(async () => (await declarations(f)).length === 1, "Player declaration committed");
  const first = (await declarations(f))[0];
  assert.equal((await pool.query("select count(*)::int count from campaign_session_roll where encounter_id=$1", [f.encounterId])).rows[0].count, 1);
  const pendingBeforeFreeze = (await pool.query("select remaining_initiative_cost, initiative_spent, status from campaign_session_encounter_pending_action where id=$1", [first.pending_action_id])).rows[0];
  await screen(god).getByRole("button", { name: "Freeze Combat", exact: true }).click();
  await until(async () => (await screen(player).innerText()).includes("Combat is paused by the G.O.D."), "pending action paused for Player");
  await until(async () => await screen(god).getByRole("region", { name: "Next combat input" }).getByRole("button").count() === 0, "G.O.D. pause projection reloaded");
  assert.equal(await screen(god).getByRole("region", { name: "Next combat input" }).getByRole("button").count(), 0);
  await screen(god).getByRole("button", { name: "Resume Combat", exact: true }).click();
  assert.deepEqual((await pool.query("select remaining_initiative_cost, initiative_spent, status from campaign_session_encounter_pending_action where id=$1", [first.pending_action_id])).rows[0], pendingBeforeFreeze);
  await advanceAction(god, first.pending_action_id);
  await screen(god).getByRole("region", { name: "Next combat input" }).getByRole("button", { name: /^Prepare .* result$/ }).click();
  await screen(god).getByRole("button", { name: "Approve & apply attack", exact: true }).click();
  await until(async () => (await pool.query("select local_state_json from campaign_session_encounter_participant where character_id=$1", [f.occurrences[0]])).rows[0].local_state_json?.combatCondition?.status === "dead", "fatal head damage applied");
  await selectGod(god, "Fixture Goblin 1");
  await until(async () => (await screen(god).innerText()).toLowerCase().includes("dead"), "dead status on card and detail");
  assert.equal(await screen(god).getByRole("region", { name: "Combatants" }).getByRole("button", { name: /^Fixture Goblin 1/ }).isEnabled(), true);
  results.push("Player weapon declaration and original percentile Roll resolve through timing to fatal head damage; the dead direct Creature remains inspectable.");
  // Direct Creature arrivals must never create NPCs.
  const beforeNpcs = (await pool.query("select count(*)::int count from campaign_character where campaign_id=$1", [f.campaignId])).rows[0].count;
  await screen(god).getByText("Roster & combat setup", { exact: true }).click();
  await screen(god).getByText("Add Creatures", { exact: true }).click();
  await screen(god).getByRole("combobox", { name: /^Creature/ }).selectOption(String(f.templateId));
  await screen(god).getByLabel("Quantity", { exact: true }).fill("2");
  await screen(god).getByRole("button", { name: "Add Creatures to Encounter", exact: true }).click();
  await until(async () => (await pool.query("select count(*)::int count from campaign_session_encounter_participant where encounter_id=$1 and participant_kind='creature'", [f.encounterId])).rows[0].count === 4, "two direct arrivals");
  assert.equal((await pool.query("select count(*)::int count from campaign_character where campaign_id=$1", [f.campaignId])).rows[0].count, beforeNpcs);
  results.push("The real Add Creatures control adds two direct occurrences, enrolls them late, and leaves NPC records unchanged.");
  await selectGod(god, "Fixture Goblin 3");
  await screen(god).getByText("G.O.D. controls for Fixture Goblin 3", { exact: true }).click();
  await screen(god).getByLabel("Ruling / participation reason").fill("The G.O.D. confirms this combatant leaves the fight.");
  await screen(god).getByText("Death, incapacitation & participation", { exact: true }).click();
  const arrival = (await pool.query("select character_id from campaign_session_encounter_participant where encounter_id=$1 and display_label='Fixture Goblin 3'", [f.encounterId])).rows[0].character_id;
  const participation = async () => (await pool.query("select local_state_json from campaign_session_encounter_participant where character_id=$1", [arrival])).rows[0].local_state_json.combatParticipation;
  const initiative = async () => (await pool.query("select current_initiative from campaign_session_encounter_initiative_participant where encounter_id=$1 and character_id=$2", [f.encounterId, arrival])).rows[0].current_initiative;
  const preserved = await initiative();
  await screen(god).getByRole("button", { name: "Withdraw from combat", exact: true }).click(); await until(async () => (await participation())?.departed === true, "withdrawal");
  await until(() => screen(god).getByRole("button", { name: "Return to combat", exact: true }).isEnabled(), "return control refreshed");
  await screen(god).getByRole("button", { name: "Return to combat", exact: true }).click(); await until(async () => (await participation())?.departed === false, "return"); assert.equal(await initiative(), preserved);
  await until(() => screen(god).getByRole("button", { name: "Return to combat", exact: true }).isDisabled(), "return reflected in the controls");
  await screen(god).getByRole("button", { name: "Confirm escape", exact: true }).click(); await until(async () => (await participation())?.departureKind === "confirm-escape", "confirmed escape");
  results.push("G.O.D. withdrawal, return with preserved Initiative, and confirmed escape update the exact occurrence.");
  await selectGod(god, "Rowan");
  // Open state is retained when inspecting another card.
  const godControls = screen(god).getByText("G.O.D. controls for Rowan", { exact: true });
  if (!await screen(god).getByLabel("Ruling / participation reason").isVisible()) await godControls.click();
  await screen(god).getByLabel("Ruling / participation reason").fill("Explicit isolated incapacitation ruling.");
  if (!await screen(god).getByRole("button", { name: "Rule incapacitation", exact: true }).isVisible()) await screen(god).getByText("Death, incapacitation & participation", { exact: true }).click();
  await screen(god).getByRole("button", { name: "Rule incapacitation", exact: true }).click();
  await until(async () => (await pool.query("select local_state_json from campaign_session_encounter_participant where encounter_id=$1 and character_id=$2", [f.encounterId, f.heroId])).rows[0].local_state_json?.combatCondition?.status === "incapacitated", "incapacitated PC");
  await screen(god).getByRole("link", { name: "End Combat & XP", exact: true }).click();
  const reward = screen(god).locator("fieldset").filter({ has: god.locator("legend", { hasText: "Fixture Goblin 1" }) });
  await reward.getByLabel("Include this Creature award").check();
  await reward.getByLabel("Rowan", { exact: true }).check();
  const encounterReward = screen(god).locator("fieldset").filter({ has: god.locator("legend", { hasText: "Additional encounter XP" }) });
  await encounterReward.getByLabel("XP per selected Character").fill("10"); await encounterReward.getByLabel("Rowan", { exact: true }).check();
  await screen(god).getByRole("button", { name: "Preview closeout", exact: true }).click(); await screen(god).getByText("Rowan: +13 XP", { exact: true }).waitFor();
  await screen(god).getByRole("button", { name: "End Combat & award XP", exact: true }).click();
  await until(async () => (await pool.query("select status from campaign_session_encounter where id=$1", [f.encounterId])).rows[0].status === "completed", "atomic closeout");
  assert.equal((await pool.query("select experience from campaign_character_profile where character_id=$1", [f.heroId])).rows[0].experience, 25);
  assert.equal((await pool.query("select count(*)::int count from campaign_session_encounter_reward_decision where encounter_id=$1", [f.encounterId])).rows[0].count, 2);
  await player.waitForURL((url) => url.pathname === "/realms/tabletop" && url.searchParams.get("character") === String(f.heroId) && !url.searchParams.has("combat"));
  await god.reload(); await screen(god).waitFor(); assert.ok((await screen(god).innerText()).includes("Combat has ended"));
  results.push("An incapacitated PC stays eligible: full Creature XP plus full encounter XP preview and apply once; the Player returns to Tabletop and G.O.D. inspects completed combat after reload.");
  await god.context().close(); await player.context().close();
  }
  for (const npcFirst of [false, true]) {
    if (!include("simultaneous")) continue;
    const tied = await db.transaction((tx) => screenFixture(tx, `simultaneous-${npcFirst}`, true));
    const director = await login(tied.godId, "god", tied), participant = await login(tied.playerId, "player", tied);
    await selectGod(director, "Sentry NPC");
    await chooseAttack(participant, tied.occurrences[0], "70"); await chooseAttack(director, tied.occurrences[1], "60");
    await commitAttack(npcFirst ? director : participant); await until(async () => (await declarations(tied)).length === 1, "first simultaneous choice");
    const waitingPage = npcFirst ? participant : director;
    await screen(waitingPage).getByRole("button", { name: "Refresh", exact: true }).click();
    await until(() => screen(waitingPage).getByRole("button", { name: "Refresh", exact: true }).isEnabled(), "sealed projection refreshed");
    assert.ok((await screen(waitingPage).getByRole("region", { name: "Combat activity" }).innerText()).includes("No revealed actions yet."));
    await commitAttack(waitingPage); await until(async () => (await declarations(tied)).length === 2, "second simultaneous choice");
    assert.equal((await pool.query("select count(*)::int count from campaign_session_roll where encounter_id=$1", [tied.encounterId])).rows[0].count, 2);
    results.push(`Simultaneous Player/NPC declarations, ${npcFirst ? "NPC" : "Player"} first, preserve hidden action history and record one Roll each.`);
    await director.context().close(); await participant.context().close();
  }
  if (include("creature-target-sharing")) {
    const f = await db.transaction((tx) => screenFixture(tx, "creature-target-sharing", true));
    await pool.query("update campaign_session_encounter_initiative set timeline_initiative=22 where encounter_id=$1", [f.encounterId]);
    await pool.query("update campaign_session_encounter_initiative_participant set participation_status='active',current_initiative=22 where encounter_id=$1 and character_id=any($2::int[])", [f.encounterId, f.occurrences]);
    await pool.query("update campaign_session_encounter_initiative_participant set current_initiative=20 where encounter_id=$1 and character_id in ($2,$3)", [f.encounterId, f.heroId, f.defenderId]);
    await pool.query("update campaign_session_encounter_initiative_participant set participation_status='holding' where encounter_id=$1 and character_id=any($2::int[])", [f.encounterId, [f.heroId, f.defenderId]]);
    const selfChoice = { participantId: f.occurrences[0], targetIds: [f.occurrences[0]], source: { kind: "creature-attack" as const, ref: "fixture-shortsword", name: "Shortsword", itemId: null, instanceId: null, description: "" } };
    await assert.rejects(db.transaction((tx) => submitCombatChoiceInTransaction(tx, f.context, f.god, { requestKey: crypto.randomUUID(), choice: selfChoice })), /another combatant/);
    const director = await login(f.godId, "god", f);
    for (const [index, occurrence] of f.occurrences.entries()) {
      await selectGod(director, `Fixture Goblin ${index + 1}`);
      await chooseAttack(director, f.heroId, index === 0 ? "70" : "60", null);
      const target = screen(director).getByRole("combobox", { name: /^Target/ });
      assert.equal(await target.inputValue(), String(f.heroId));
      assert.equal(await target.locator(`option[value='${occurrence}']`).count(), 0, "The ordinary Creature Attack menu excludes its own actor.");
      await commitAttack(director);
      await until(async () => (await declarations(f)).length === index + 1, `Creature ${index + 1} declaration`);
    }
    const locked = await declarations(f);
    assert.equal(locked.length, 2);
    for (const [index, declaration] of locked.entries()) {
      assert.equal(declaration.actor_character_id, f.occurrences[index]);
      assert.deepEqual(declaration.draft_json.targetCharacterIds, [f.heroId]);
      assert.deepEqual(declaration.locked_snapshot_json.targetCharacterIds, [f.heroId]);
    }
    const initiatives = (await pool.query("select character_id,current_initiative from campaign_session_encounter_initiative_participant where encounter_id=$1 and character_id=any($2::int[]) order by character_id", [f.encounterId, f.occurrences])).rows;
    assert.deepEqual(initiatives.map((entry) => entry.current_initiative), [22, 22]);
    await screen(director).getByRole("region", { name: "Next combat input" }).getByRole("button", { name: "Advance combat", exact: true }).click();
    const pendingIds = locked.map((declaration) => declaration.pending_action_id);
    await until(async () => {
      const actions = (await pool.query("select status from campaign_session_encounter_pending_action where id=any($1::int[])", [pendingIds])).rows;
      return actions.length === pendingIds.length && actions.every((action) => action.status === "completed");
    }, "both Creature actions complete");
    const response = screen(director).getByRole("region", { name: "Next combat input" }).getByRole("button", { name: /Rowan's response/ });
    await response.waitFor(); await response.click();
    await screen(director).getByRole("heading", { name: "Rowan", exact: true }).waitFor();
    for (const [index, occurrence] of f.occurrences.entries()) {
      await selectGod(director, `Fixture Goblin ${index + 1}`);
      const view = screen(director), attack = view.getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: "Attack", exact: true });
      assert.equal(await attack.getAttribute("aria-pressed"), "true", "Returning to a Creature restores its Attack command.");
      const target = view.getByRole("combobox", { name: /^Target/ });
      assert.equal(await target.inputValue(), String(f.heroId), `Creature ${index + 1} retains Rowan as its target after response inspection.`);
      assert.equal(await target.locator(`option[value='${occurrence}']`).count(), 0, "Returning to the Creature still rejects self-targeting.");
    }
    results.push("Two same-Initiative Creature occurrences independently lock Rowan as their shared target; response inspection preserves both per-attacker drafts and self-target protection.");
    await director.context().close();
  }
  if (include("called-shot-request")) {
    const f = await db.transaction((tx) => screenFixture(tx, "called-shot-request"));
    const director = await login(f.godId, "god", f), player = await login(f.playerId, "player", f);
    const view = screen(player);
    await view.getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: "Called Shot", exact: true }).click();
    await view.getByRole("combobox", { name: "Called Shot source", exact: true }).selectOption({ label: "Fixture Shortsword" });
    await view.getByRole("combobox", { name: "Target", exact: true }).selectOption(String(f.occurrences[0]));
    await view.getByRole("combobox", { name: "Target location", exact: true }).selectOption("0");
    await view.getByLabel("Called Shot objective", { exact: true }).fill("Strike the selected Head.");
    assert.equal(await view.getByLabel("Target distance", { exact: true }).count(), 0);
    await view.getByRole("button", { name: "Request Called Shot ruling", exact: true }).click();
    await view.getByText(/Called Shot is waiting for the G.O.D. penalty ruling/).waitFor();
    assert.equal((await declarations(f)).length, 0);
    assert.equal((await pool.query("select count(*)::int n from campaign_session_roll where encounter_id=$1", [f.encounterId])).rows[0].n, 0);
    await screen(director).getByRole("region", { name: "Next combat input" }).getByRole("button", { name: "Review Rowan's called shot request", exact: true }).click();
    await screen(director).getByLabel("Ruling / participation reason", { exact: true }).fill("Approve the exact Head objective with the chosen penalty.");
    await screen(director).getByLabel("Called Shot penalty", { exact: true }).fill("3");
    await screen(director).getByRole("button", { name: "Approve", exact: true }).click();
    await view.getByText(/G.O.D. approved: penalty 3/).waitFor();
    await view.getByLabel("Percentile result", { exact: true }).fill("70");
    await view.getByRole("button", { name: "Commit Called Shot & Roll", exact: true }).click();
    await until(async () => (await declarations(f)).length === 1, "approved melee Called Shot commits without distance");
    assert.equal((await pool.query("select count(*)::int n from campaign_session_roll where encounter_id=$1", [f.encounterId])).rows[0].n, 1);
    results.push("Player melee Called Shot requests use a valid retry identity, wait visibly for the G.O.D. penalty, surface in the main guide, then commit one Roll without distance.");
    await director.context().close(); await player.context().close();
  }
  if (include("attack-location")) {
    const { f, copy } = await db.transaction(async (tx) => {
      const f = await screenFixture(tx, "attack-location");
      await tx.delete(campaignCharacterItem).where(and(eq(campaignCharacterItem.characterId, f.heroId), eq(campaignCharacterItem.itemId, f.weaponId)));
      const [copy] = await tx.insert(campaignCharacterItemInstance).values({ characterId: f.heroId, itemId: f.weaponId, equipmentState: "wielded", currentCharges: 3, unitCostCredits: 1 }).returning();
      await tx.insert(itemPowerResource).values({ itemId: f.weaponId, maximumCharges: 3 });
      const [power] = await tx.insert(itemPower).values({ itemId: f.weaponId, name: "Burning Strike", trigger: "weapon-hit", resourceCostKind: "shared-charges", resourceCostAmount: 1, resolutionMode: "weapon-hit", sortOrder: 0 }).returning();
      await tx.insert(itemPowerEffect).values([
        { itemPowerId: power.id, sortOrder: 0, schemaVersion: 2, effectJson: { kind: "health.damage", amount: 2, application: "localized" } },
        { itemPowerId: power.id, sortOrder: 1, schemaVersion: 2, effectJson: { kind: "health.damage", amount: 1, application: "localized", timing: { mode: "over-time", frequency: "combat-rounds", applications: 3, firstApplication: "next-interval" } } },
      ]);
      // Match the reported two-power attack on a Creature with a foreleg at 3.
      const anatomy = { ...f.creatureSnapshot,
        hpPools: [...f.creatureSnapshot.hpPools, { canonicalId: "fixture-foreleg", poolName: "Right Foreleg", maximumHp: 30 }],
        hitLocations: [...f.creatureSnapshot.hitLocations, { hitLocationNumber: 3, locationName: "Right Foreleg", hpPoolCanonicalId: "fixture-foreleg", soak: "0", naturalArmor: "0" }],
      };
      await tx.execute((await import("drizzle-orm")).sql`update campaign_session_encounter_participant set creature_snapshot_json=${JSON.stringify(anatomy)}::jsonb where encounter_id=${f.encounterId} and character_id=${f.occurrences[0]}`);
      return { f, copy };
    });
    const director = await login(f.godId, "god", f, true), player = await login(f.playerId, "player", f);
    const view = screen(player);
    await chooseAttack(player, f.occurrences[0], "73", `Fixture Shortsword · Copy #${copy.id}`);
    assert.equal(await view.getByRole("combobox", { name: /damage location|Target location/ }).count(), 0, "Normal attacks must not ask for either on-hit effect's location");
    await view.getByText(/The last digit of your attack roll determines where you hit/).waitFor();
    await screenshot(player, "normal-attack-no-location-phone", 390);
    assert.equal(await view.getByRole("button", { name: "Commit Attack & Roll", exact: true }).isEnabled(), true);
    await commitAttack(player);
    const report = screen(director).getByRole("region", { name: "Attack result report" });
    await report.getByText("Right Foreleg", { exact: true }).waitFor();
    await report.getByRole("button", { name: "Approve & apply attack", exact: true }).click();
    await until(async () => (await declarations(f))[0]?.status === "resolved", "two-power normal attack resolves");
    const saved = (await declarations(f))[0];
    assert.deepEqual(saved.draft_json.sourcePayload.effectSelections, {});
    const effects = (await pool.query("select e.effect_key,e.status,e.final_value_json from campaign_session_encounter_effect e join campaign_session_encounter_effect_plan p on p.id=e.plan_id where p.declaration_id=$1 and e.effect_type='health.damage' order by e.id", [saved.id])).rows;
    assert.equal(effects.length, 2, "Immediate power joins base damage; ongoing power retains its own effect");
    for (const effect of effects) {
      assert.equal(effect.status, "applied");
      assert.equal(effect.final_value_json.application.hitLocationNumber, 3);
      assert.equal(effect.final_value_json.application.poolKey, "fixture-foreleg");
    }
    assert.equal((await pool.query("select current_charges from campaign_character_item_instance where id=$1", [copy.id])).rows[0].current_charges, 2);
    assert.equal((await pool.query("select count(*)::int n from campaign_session_roll where encounter_id=$1", [f.encounterId])).rows[0].n, 1);
    await player.reload(); await view.getByText("Live", { exact: true }).waitFor();
    assert.equal((await pool.query("select current_charges from campaign_character_item_instance where id=$1", [copy.id])).rows[0].current_charges, 2);
    results.push("Player normal attack with immediate and ongoing on-hit damage offers no location dropdowns, commits without selections, and applies both at roll 73's Right Foreleg with one Roll and one Charge spend.");
    await director.context().close(); await player.context().close();
  }
  if (include("pass5-incoming")) for (const kind of ["requirement", "resistance", "absorption", "conflict"] as const) {
    const f = await db.transaction((tx) => screenFixture(tx, `pass5-${kind}`));
    const { rows: [target] } = await pool.query("select creature_snapshot_json from campaign_session_encounter_participant where character_id=$1", [f.occurrences[0]]);
    const snapshot = target.creature_snapshot_json;
    const rule = { key: "p5", name: "Pass 5 protection", ruleType: kind === "conflict" ? "absorption" : kind, percentage: kind === "requirement" ? null : 50, scope: "damage", match: "ALL", crImpact: "None", notes: "PRIVATE TARGET NOTES", sortOrder: 0,
      conditions: [{ key: "source", kind: "magical", magical: kind === "requirement" }] };
    snapshot.core.interactionRules = { schemaVersion: 1, rules: kind === "conflict" ? [rule, { ...rule, key: "resist", ruleType: "resistance", sortOrder: 1 }] : [rule] };
    snapshot.hpPools = [{ canonicalId: "p5-body", poolName: "Body", maximumHp: 30, hpPercentage: 100 }];
    snapshot.hitLocations = [{ hitLocationNumber: 0, locationName: "Body", hpPoolCanonicalId: "p5-body", naturalArmor: "0", soak: "0" }];
    await pool.query("update campaign_session_encounter_participant set creature_snapshot_json=$1, local_state_json=$2 where character_id=$3", [snapshot, { health: { totalDamage: 10, poolDamage: { "p5-body": 10 } } }, f.occurrences[0]]);
    const god = await login(f.godId, "god", f), player = await login(f.playerId, "player", f);
    const controller = player;
    await chooseAttack(controller, f.occurrences[0], "70"); await commitAttack(controller);
    await until(async () => (await declarations(f)).length === 1, "Pass 5 attack committed");
    const action = (await declarations(f))[0];
    await advanceAction(god, action.pending_action_id);
    await screen(god).getByRole("region", { name: "Next combat input" }).getByRole("button", { name: /^Prepare .* result$/ }).click();
    if (kind === "requirement") {
      await screen(god).getByText("Rolls & results", { exact: true }).click();
      await screen(god).locator("summary").filter({ hasText: /Fixture Shortsword.*applied/ }).click();
      await screen(god).getByText("Protection and interaction calculation", { exact: true }).click();
      await screen(god).getByText("Pass 5 protection", { exact: false }).first().waitFor();
      assert.equal((await screen(player).innerText()).includes("PRIVATE TARGET NOTES"), false);
      assert.equal((await pool.query("select local_state_json from campaign_session_encounter_participant where character_id=$1", [f.occurrences[0]])).rows[0].local_state_json.health.totalDamage, 10);
      await screenshot(god, "pass5-requirement-narrow", 390);
      results.push("Pass 5 failed Requirement: no damage; historical frozen explanation, Player privacy and narrow layout.");
      await god.context().close(); await player.context().close(); continue;
    }
    const report = screen(god).getByRole("region", { name: "Attack result report" });
    await report.getByText("Protection and interaction calculation", { exact: true }).click();
    await report.getByText("Pass 5 protection", { exact: false }).first().waitFor();
    assert.equal((await screen(player).innerText()).includes("PRIVATE TARGET NOTES"), false);
    if (kind === "conflict") {
      await report.getByLabel("Reason for this ruling", { exact: true }).fill("Explicit G.O.D. decision for the unresolved Absorption conflict.");
      await report.getByLabel("Final amount", { exact: true }).fill("2");
      await report.getByRole("button", { name: "Rule damage", exact: true }).click();
      await until(async () => !(await report.innerText()).includes("Final amount"), "explicit incoming ruling saved");
      assert.match(await report.innerText(), /A decision has been recorded/);
      assert.doesNotMatch(await report.innerText(), /armor - .*soak =/);
    }
    if (kind === "absorption") await report.getByText("Healing to apply: 6", { exact: true }).waitFor();
    await screenshot(god, `pass5-${kind}-narrow`, 390);
    await god.setViewportSize({ width: 1365, height: 1000 });
    await report.getByRole("button", { name: "Approve & apply attack", exact: true }).click();
    const expected = kind === "absorption" ? 4 : kind === "resistance" ? 16 : 12;
    await until(async () => (await pool.query("select local_state_json from campaign_session_encounter_participant where character_id=$1", [f.occurrences[0]])).rows[0].local_state_json.health.totalDamage === expected, `Pass 5 ${kind} applies`);
    results.push(`Pass 5 ${kind}: real attack, frozen explanation, Player privacy, G.O.D. approval and narrow layout.`);
    await god.context().close(); await player.context().close();
  }
  if (include("draft-preservation")) {
    const f = await db.transaction((tx) => screenFixture(tx, "draft-preservation"));
    const director = await login(f.godId, "god", f);
    await selectGod(director, "Fixture Goblin 1");
    await chooseAttack(director, f.heroId, "71", null);
    await selectGod(director, "Rowan");
    await selectGod(director, "Fixture Goblin 1");
    assert.equal(await screen(director).getByLabel("Percentile result", { exact: true }).inputValue(), "71", "Inspecting a Player does not unmount and lose the Creature draft.");
    await screen(director).getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: "Move", exact: true }).click();
    await screen(director).getByLabel("Distance in feet", { exact: true }).fill("7");
    await screen(director).getByRole("button", { name: "Freeze Combat", exact: true }).click();
    await screen(director).getByRole("button", { name: "Resume Combat", exact: true }).click();
    await screen(director).getByRole("button", { name: "Freeze Combat", exact: true }).waitFor();
    assert.equal(await screen(director).getByLabel("Distance in feet", { exact: true }).inputValue(), "7", "An Initiative revision preserves unfinished movement input.");
    await screen(director).getByText("G.O.D. controls for Fixture Goblin 1", { exact: true }).click();
    await screen(director).getByLabel("Ruling / participation reason", { exact: true }).fill("Goblin-only draft ruling.");
    await selectGod(director, "Fixture Goblin 2");
    assert.equal(await screen(director).getByLabel("Ruling / participation reason", { exact: true }).inputValue(), "");
    await selectGod(director, "Fixture Goblin 1");
    assert.equal(await screen(director).getByLabel("Ruling / participation reason", { exact: true }).inputValue(), "Goblin-only draft ruling.");
    results.push("Inspecting a Player preserves another actor's Attack draft; Freeze/resume preserves movement input; G.O.D. ruling drafts belong to their exact combatant.");
    await director.context().close();
  }
  if (include("repeat-action")) {
    const f = await db.transaction((tx) => screenFixture(tx, "repeat-action"));
    await pool.query("update campaign_session_encounter_initiative_participant set participation_status='holding' where encounter_id=$1", [f.encounterId]);
    await pool.query("update campaign_session_encounter_initiative_participant set participation_status='active' where encounter_id=$1 and character_id=$2", [f.encounterId, f.occurrences[0]]);
    const director = await login(f.godId, "god", f);
    await selectGod(director, "Fixture Goblin 1");
    await chooseAttack(director, f.defenderId, "20", null);
    await screen(director).getByRole("combobox", { name: "Roll method", exact: true }).selectOption("digital");
    await commitAttack(director);
    await until(async () => (await declarations(f)).length === 1, "first digital attack recorded");
    const first = (await declarations(f))[0];
    await screen(director).getByText("G.O.D. controls for Fixture Goblin 1", { exact: true }).click();
    await screen(director).getByLabel("Ruling / participation reason", { exact: true }).fill("Cancel this unfinished attack to exercise the next ordinary action.");
    await screen(director).getByText("Unfinished actions & interventions", { exact: true }).click();
    await screen(director).getByRole("button", { name: "Cancel unfinished action", exact: true }).click();
    await until(async () => (await declarations(f))[0].status === "cancelled", "first action explicitly cancelled");
    await screen(director).getByRole("region", { name: "Next combat input" }).getByRole("button", { name: "Fixture Goblin 1 can act now", exact: true }).click();
    // No source, target, or Roll edits: a new opportunity is a new action.
    await commitAttack(director);
    await until(async () => (await declarations(f)).length === 2, "unchanged second action creates its own declaration");
    const second = (await declarations(f))[1];
    assert.notEqual(second.draft_json.sourcePayload.screenRequestKey, first.draft_json.sourcePayload.screenRequestKey);
    assert.equal((await pool.query("select count(*)::int n from campaign_session_roll where encounter_id=$1", [f.encounterId])).rows[0].n, 2);
    results.push("A confirmed digital action can be repeated at the next opportunity without reselecting source, target or Roll method; each action has its own declaration and exactly one Roll.");
    await director.context().close();
  }
  if (include("overlap")) {
    const f = await db.transaction((tx) => screenFixture(tx, "overlap"));
    await pool.query("update weapon_profiles set initiative_cost=5 where item_id=$1", [f.weaponId]);
    await pool.query("update campaign_session_encounter_initiative_participant set participation_status='active' where encounter_id=$1 and character_id=$2", [f.encounterId, f.occurrences[0]]);
    const director = await login(f.godId, "god", f), participant = await login(f.playerId, "player", f);
    const guide = screen(director).getByRole("region", { name: "Next combat input" });
    await chooseAttack(participant, f.occurrences[0], "00"); await commitAttack(participant);
    await guide.getByRole("button", { name: "Fixture Goblin 1 can act now", exact: true }).click();
    await chooseAttack(director, f.defenderId, "20", "Shortsword"); await commitAttack(director);
    await until(async () => (await declarations(f)).length === 2, "both overlapping attacks declared");
    const sword = (await declarations(f)).find((entry) => entry.actor_character_id === f.heroId)!;
    const bite = (await declarations(f)).find((entry) => entry.actor_character_id === f.occurrences[0])!;
    const local = async () => (await pool.query("select local_state_json from campaign_session_encounter_participant where encounter_id=$1 and character_id=$2", [f.encounterId, f.occurrences[0]])).rows[0].local_state_json;
    async function reviewPendingResponses() {
      for (let review = 0; review < 4; review++) {
        await until(() => screen(director).getByRole("button", { name: "Refresh", exact: true }).isEnabled(), "ready to read next response");
        await screen(director).getByRole("button", { name: "Refresh", exact: true }).click();
        await until(() => screen(director).getByRole("button", { name: "Refresh", exact: true }).isEnabled(), "fresh next response");
        await until(async () => await guide.getByRole("button").count() > 0 && await guide.getByRole("button").first().isEnabled(), "next input loaded");
        if (!await guide.getByRole("button", { name: "No, cannot respond", exact: true }).count()) return;
        const pendingCount = async () => (await pool.query("select count(*)::int n from campaign_session_encounter_responder_opportunity where encounter_id=$1 and status='pending'", [f.encounterId])).rows[0].n;
        const before = await pendingCount();
        await guide.getByRole("button", { name: "No, cannot respond", exact: true }).click();
        await until(async () => await pendingCount() < before, "response ruling committed");
      }
    }
    await reviewPendingResponses();
    await guide.getByRole("button", { name: "Advance combat", exact: true }).click();
    await until(async () => (await pool.query("select status from campaign_session_encounter_pending_action where id=$1", [bite.pending_action_id])).rows[0].status === "completed", "faster Creature timing complete");
    await reviewPendingResponses();
    await guide.getByRole("button", { name: "Prepare Fixture Goblin 1's Shortsword result", exact: true }).click();
    await until(async () => (await declarations(f)).find((entry) => entry.id === bite.id)?.status === "resolved", "completed Creature miss resolved from main control");
    assert.equal((await local())?.health?.totalDamage ?? 0, 0);
    assert.equal((await pool.query("select remaining_initiative_cost from campaign_session_encounter_pending_action where id=$1", [sword.pending_action_id])).rows[0].remaining_initiative_cost, 1);
    await guide.getByRole("button", { name: "Fixture Goblin 1 can act now", exact: true }).click();
    await chooseAttack(director, f.defenderId, "20", "Shortsword"); await commitAttack(director);
    await until(async () => (await declarations(f)).length === 3, "Creature gets another ordinary action while sword is unfinished");
    await reviewPendingResponses();
    await guide.getByRole("button", { name: "Advance combat", exact: true }).click();
    await until(async () => (await pool.query("select status from campaign_session_encounter_pending_action where id=$1", [sword.pending_action_id])).rows[0].status === "completed", "slower sword timing complete");
    assert.equal((await local())?.health?.totalDamage ?? 0, 0);
    await reviewPendingResponses();
    await guide.getByRole("button", { name: "Prepare Rowan's Fixture Shortsword result", exact: true }).click();
    await screen(director).getByLabel("Reason for this ruling", { exact: true }).fill("Resolve the completed critical strike against the authored head using calculated damage.");
    await screen(director).getByRole("combobox", { name: "Hit location", exact: true }).selectOption("0");
    await screen(director).getByRole("button", { name: "Approve & apply attack", exact: true }).click();
    await until(async () => (await local())?.combatCondition?.status === "dead", "fatal result applies only after sword timing and exact ruling");
    const unfinished = (await declarations(f)).find((entry) => entry.actor_character_id === f.occurrences[0] && entry.id !== bite.id)!;
    assert.equal(unfinished.status, "cancelled");
    results.push("A Creature's sole authored attack is active without a source-dropdown toggle and remains active for its later action opportunity while another declaration is in flight.");
    results.push("The main next-input control resolves a faster Creature action, offers its next action while the critical sword is unfinished, then opens the sword's exact ruling only at completion; death cancels the later unfinished action.");
    await director.context().close(); await participant.context().close();
  }
  if (include("initiative-crossing")) for (const canRespond of [false, true]) {
    const f = await db.transaction((tx) => screenFixture(tx, `initiative-crossing-${canRespond}`));
    await pool.query("update campaign_session_encounter_initiative set timeline_initiative=21 where encounter_id=$1", [f.encounterId]);
    await pool.query("update campaign_session_encounter_initiative_participant set current_initiative=20 where encounter_id=$1 and character_id=$2", [f.encounterId, f.heroId]);
    await pool.query("update campaign_session_encounter_initiative_participant set current_initiative=21, participation_status='active' where encounter_id=$1 and character_id=$2", [f.encounterId, f.occurrences[0]]);
    const director = await login(f.godId, "god", f, true), participant = await login(f.playerId, "player", f);
    const guide = screen(director).getByRole("region", { name: "Next combat input" });
    assert.equal(await screen(director).getByRole("checkbox", { name: "Automatic flow", exact: true }).isChecked(), true);
    await guide.getByRole("button", { name: "Fixture Goblin 1 can act now", exact: true }).click();
    await chooseAttack(director, f.heroId, canRespond ? "70" : "28", null);
    assert.equal(await screen(director).getByRole("combobox", { name: /^Target/ }).locator(`option[value='${f.occurrences[0]}']`).count(), 0, "The attack menu excludes its own actor.");
    assert.equal((await declarations(f)).length, 0, "Reading options never commits an action or Roll.");
    await commitAttack(director);
    await guide.getByRole("button", { name: "Rowan can act now", exact: true }).waitFor();
    await screen(participant).getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: "Hold", exact: true }).click();
    await until(() => screen(participant).getByRole("button", { name: "Hold Initiative", exact: true }).isEnabled(), "crossover gives the Player an independent ordinary choice");
    await until(async () => (await screen(participant).innerText()).includes("own legal target, Hold or Pass"), "Player sees independent choices at the crossover");
    await selectGod(director, "Rowan");
    for (const page of [director, participant]) assert.equal(await screen(page).getByRole("button", { name: /Yes, can respond|No, cannot respond/ }).count(), 0);
    if (!canRespond) {
      const attack = (await declarations(f))[0];
      const pending = async () => (await pool.query("select remaining_initiative_cost from campaign_session_encounter_pending_action where id=$1", [attack.pending_action_id])).rows[0];
      assert.equal((await pending()).remaining_initiative_cost, 3);
      await screen(participant).getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: "Move", exact: true }).click();
      await screen(participant).getByLabel("Distance in feet", { exact: true }).fill("2");
      await screen(participant).getByRole("button", { name: "Check movement cost", exact: true }).click();
      await screen(participant).getByRole("button", { name: "Declare movement", exact: true }).click();
      await until(async () => (await pool.query("select status from campaign_session_encounter_pending_action where encounter_id=$1 and actor_character_id=$2 and action_kind='combat-movement'", [f.encounterId, f.heroId])).rows.some((row) => row.status === "completed"), "Player movement completes during the Creature's unfinished attack");
      assert.equal((await pending()).remaining_initiative_cost, 2);
      await screen(participant).getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: "Hold", exact: true }).click();
    }
    if (canRespond) {
      await screen(participant).getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: "Defend", exact: true }).click();
      await screen(participant).getByRole("combobox", { name: /^Defense/ }).selectOption("no-reaction");
      await screen(participant).getByRole("button", { name: "Commit response", exact: true }).click();
      await screen(participant).getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: "Hold", exact: true }).click();
    }
    await until(() => screen(participant).getByRole("button", { name: "Hold Initiative", exact: true }).isEnabled(), "automatic progression reaches the Player's Hold opportunity");
    await screen(participant).getByRole("button", { name: "Hold Initiative", exact: true }).click();
    if (canRespond) await screen(director).getByRole("button", { name: "Approve & apply attack", exact: true }).click();
    await until(async () => (await declarations(f))[0]?.status === "resolved", "miss completes after the Player holds");
    await until(async () => (await screen(director).getByRole("region", { name: "Combat activity" }).innerText()).includes(canRespond ? "6 damage applied to Head" : "Miss - no damage applied."), "recent activity explains the actual damage outcome");
    const after = (await pool.query("select current_initiative, participation_status from campaign_session_encounter_initiative_participant where encounter_id=$1 and character_id=$2", [f.encounterId, f.heroId])).rows[0];
    assert.deepEqual(after, { current_initiative: canRespond ? 20 : 19, participation_status: "holding" });
    assert.equal((await pool.query("select count(*)::int n from campaign_session_roll where encounter_id=$1", [f.encounterId])).rows[0].n, 1);
    assert.equal((await pool.query("select total_damage from campaign_character_active_health where character_id=$1", [f.heroId])).rows[0].total_damage, canRespond ? 6 : 0);
    if (canRespond) {
      await until(async () => (await screen(participant).getByRole("region", { name: "Selected combatant detail" }).innerText()).includes("99 / 105"), "Player HP updates from applied damage without reload");
      await selectGod(director, "Rowan");
      assert.ok((await screen(director).getByRole("region", { name: "Selected combatant detail" }).innerText()).includes("99 / 105"));
      await selectGod(director, "Fixture Goblin 1");
      assert.equal(await screen(director).getByRole("combobox", { name: /^Target/ }).inputValue(), String(f.heroId), "Inspecting another actor preserves this Creature's own target draft.");
    }
    await until(() => guide.getByRole("button", { name: "Fixture Goblin 1 can act now", exact: true }).isEnabled(), "the Creature can act again without reprompting the holding Player");
    await guide.getByRole("button", { name: "Fixture Goblin 1 can act now", exact: true }).click();
    await chooseAttack(director, f.heroId, "28", null); await commitAttack(director);
    await until(async () => (await declarations(f)).length === 2, "Creature later action commits without source toggle");
    results.push(`A Creature's sole authored attack is immediately active and remains active for a later action opportunity without changing the source dropdown. Initiative automatically offers the Player a choice without G.O.D. permission: ${canRespond ? "no-reaction then Hold preserves 20 Initiative and the original attack applies 6 damage" : "movement completes while the original attack remains pending, then Hold preserves 19 Initiative and the attack misses"}. One original Roll, no approval prompt, no timing reset.`);
    await director.context().close(); await participant.context().close();
  }
  if (include("hold")) for (const tied of [false, true]) {
    const f = await db.transaction((tx) => screenFixture(tx, `hold-${tied}`, true));
    if (!tied) await pool.query("update campaign_session_encounter_initiative_participant set current_initiative=20 where encounter_id=$1 and character_id=$2", [f.encounterId, f.defenderId]);
    const director = await login(f.godId, "god", f), participant = await login(f.playerId, "player", f);
    await screen(director).getByRole("checkbox", { name: "Automatic flow", exact: true }).check();
    await screen(participant).getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: "Hold", exact: true }).click();
    await screen(participant).getByRole("button", { name: "Hold Initiative", exact: true }).click();
    await until(async () => (await pool.query("select participation_status from campaign_session_encounter_initiative_participant where encounter_id=$1 and character_id=$2", [f.encounterId, f.heroId])).rows[0].participation_status === "holding", "Player Hold recorded");
    await selectGod(director, "Sentry NPC");
    if (!tied) await until(async () => (await pool.query("select timeline_initiative from campaign_session_encounter_initiative where encounter_id=$1", [f.encounterId])).rows[0].timeline_initiative === 20, "automatic flow reaches the lower participant opportunity");
    await screen(director).getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: "Hold", exact: true }).click();
    await screen(director).getByRole("button", { name: "Hold Initiative", exact: true }).click();
    await until(async () => (await pool.query("select step_number from campaign_session_encounter_initiative where encounter_id=$1", [f.encounterId])).rows[0].step_number === 2, "all Holds complete one full Step");
    await until(async () => (await screen(director).innerText()).includes("No further Initiative event"), "all-Hold prompt stops requesting ordinary input");
    assert.equal(await screen(director).getByRole("region", { name: "Next combat input" }).getByRole("button").count(), 0);
    assert.ok(await screen(director).getByRole("button", { name: "Hold Initiative", exact: true }).isDisabled());
    for (let refresh = 0; refresh < 3; refresh++) { await screen(director).getByRole("button", { name: "Refresh", exact: true }).click(); await until(() => screen(director).getByRole("button", { name: "Refresh", exact: true }).isEnabled(), "stable all-Hold refresh"); }
    assert.equal((await pool.query("select step_number from campaign_session_encounter_initiative where encounter_id=$1", [f.encounterId])).rows[0].step_number, 2);
    assert.equal((await pool.query("select current_initiative from campaign_session_encounter_initiative_participant where encounter_id=$1 and character_id=$2", [f.encounterId, f.heroId])).rows[0].current_initiative, 22);
    assert.equal((await declarations(f)).length, 0);
    results.push(`${tied ? "Simultaneous" : "Higher-to-lower Initiative"} Holds advance required choices once, preserve Initiative, and stop at all-Hold without ordinary-input or advancement loops.`);
    await director.context().close(); await participant.context().close();
  }
  if (include("automatic")) {
    const f = await db.transaction((tx) => screenFixture(tx, "automatic"));
    const director = await login(f.godId, "god", f), secondDirector = await login(f.godId, "god", f), participant = await login(f.playerId, "player", f);
    await screen(director).getByRole("button", { name: "Freeze Combat", exact: true }).click();
    for (const page of [director, secondDirector, participant]) await until(async () => (await screen(page).innerText()).includes("Combat is paused by the G.O.D."), "automatic setup observes shared Freeze");
    await screen(director).getByRole("checkbox", { name: "Automatic flow", exact: true }).check();
    await screen(secondDirector).getByRole("checkbox", { name: "Automatic flow", exact: true }).check();
    assert.equal((await pool.query("select timeline_initiative from campaign_session_encounter_initiative where encounter_id=$1", [f.encounterId])).rows[0].timeline_initiative, 22);
    await screen(director).getByRole("button", { name: "Resume Combat", exact: true }).click();
    await chooseAttack(participant, f.occurrences[0]); await commitAttack(participant);
    await screen(director).getByRole("button", { name: "Approve & apply attack", exact: true }).click();
    await until(async () => (await declarations(f))[0]?.status === "resolved", "automatic progression stops for one report approval");
    const readOutcome = async () => (await pool.query("select local_state_json from campaign_session_encounter_participant where encounter_id=$1 and character_id=$2", [f.encounterId, f.occurrences[0]])).rows[0].local_state_json;
    const final = await readOutcome(); assert.equal(final.combatCondition.status, "dead");
    assert.equal((await pool.query("select count(*)::int n from campaign_session_roll where encounter_id=$1", [f.encounterId])).rows[0].n, 1);
    assert.equal((await pool.query("select current_initiative from campaign_session_encounter_initiative_participant where encounter_id=$1 and character_id=$2", [f.encounterId, f.heroId])).rows[0].current_initiative, 18);
    await until(async () => await screen(director).getByRole("region", { name: "Next combat input" }).getByRole("button", { name: "Rowan can act now", exact: true }).count() === 1, "automation stops for the next Player choice");
    await director.context().setOffline(true); await screen(director).getByText("Reconnecting", { exact: true }).waitFor(); await director.context().setOffline(false); await screen(director).getByText("Live", { exact: true }).waitFor();
    await until(() => screen(director).getByRole("button", { name: "Refresh", exact: true }).isEnabled(), "automatic reconnect read");
    assert.deepEqual(await readOutcome(), final);
    await director.reload(); await screen(director).getByText("Live", { exact: true }).waitFor();
    assert.equal(await screen(director).getByRole("checkbox", { name: "Automatic flow", exact: true }).isChecked(), true);
    assert.equal((await declarations(f)).length, 1); assert.deepEqual(await readOutcome(), final);
    results.push("Automatic flow prepares one attack report, applies it after approval, respects Freeze, stops for the next Player choice, and preserves one Roll/cost/outcome with two G.O.D. screens and reconnect.");
    await director.context().close(); await secondDirector.context().close(); await participant.context().close();
  }
  if (include("force-end")) {
    const f = await db.transaction((tx) => screenFixture(tx, "force-end", true));
    const director = await login(f.godId, "god", f), participant = await login(f.playerId, "player", f);
    await chooseAttack(participant, f.occurrences[0], "100"); await commitAttack(participant);
    await until(async () => (await declarations(f)).length === 1, "sealed action committed before override");
    await screen(director).getByRole("button", { name: "Freeze Combat", exact: true }).click();
    await screen(director).getByRole("button", { name: "Resume Combat", exact: true }).waitFor();
    const before = (await pool.query("select character_id,current_initiative,deferred_initiative_cost from campaign_session_encounter_initiative_participant where encounter_id=$1 order by character_id", [f.encounterId])).rows;
    assert.equal(await screen(participant).getByRole("button", { name: "Force end combat", exact: true }).count(), 0);
    await screen(director).getByRole("button", { name: "Force end combat", exact: true }).click();
    const dialog = director.getByRole("dialog", { name: "End combat now?", exact: true });
    await dialog.waitFor(); await screenshot(director, "force-end-frozen");
    await dialog.getByRole("button", { name: "End combat now", exact: true }).click();
    await until(async () => (await pool.query("select status from campaign_session_encounter where id=$1", [f.encounterId])).rows[0].status === "completed", "forced encounter close");
    await participant.waitForURL((url) => url.pathname === "/realms/tabletop" && url.searchParams.get("character") === String(f.heroId) && !url.searchParams.has("combat"));
    assert.equal(await screen(participant).count(), 0, "The Player leaves the finished combat screen.");
    assert.equal((await declarations(f))[0].status, "cancelled");
    assert.deepEqual((await pool.query("select character_id,current_initiative,deferred_initiative_cost from campaign_session_encounter_initiative_participant where encounter_id=$1 order by character_id", [f.encounterId])).rows, before);
    await director.reload(); await screen(director).getByText("Live", { exact: true }).waitFor();
    assert.equal(await screen(director).getByRole("button", { name: "Force end combat", exact: true }).count(), 0);
    results.push("The G.O.D. ends frozen combat with an unrevealed action through the header override, without a mandatory note or resource refund; the Player receives the closed state live.");
    await director.context().close(); await participant.context().close();
  }
  for (const weaponType of ["Bow", "Crossbow"] as const) {
    const scenario = `projectile-${weaponType.toLowerCase()}`;
    if (!include(scenario)) continue;
    const { f, gun } = await db.transaction(async (tx) => { const f = await screenFixture(tx, scenario); return { f, gun: await addScreenFirearm(tx, f) }; });
    await pool.query("update items set name=$1 where id=$2", [`Screen ${weaponType}`, gun.gun.id]);
    await pool.query("update weapon_profiles set weapon_type=$1,reload_type='Single',capacity_rounds=1,reload_initiative_cost=$2 where item_id=$3", [weaponType, weaponType === "Bow" ? 1.5 : 4, gun.gun.id]);
    await pool.query("update weapon_firing_modes set base_cycling_initiative_cost=null,base_recoil_reset_initiative_cost=null,delivery_cadence=null,rounds_per_cadence=null,mechanics_review_required=true where weapon_profile_id=(select id from weapon_profiles where item_id=$1)", [gun.gun.id]);
    await pool.query("insert into campaign_character_item (character_id,item_id,quantity,unit_cost_credits) select character_id,loaded_ammunition_item_id,5,1 from campaign_character_firearm_state where item_instance_id=$1", [gun.instance.id]);
    await pool.query("update campaign_character_firearm_state set capacity_rounds=1,loaded_rounds=0,loaded_ammunition_item_id=null,loaded_ammunition_profile_id=null,loaded_ammunition_unit_cost_credits=null where item_instance_id=$1", [gun.instance.id]);
    if (weaponType === "Crossbow") await pool.query("update campaign_character set is_npc=true,npc_build_mode='detailed',player_user_id=$2 where id=$1", [f.heroId, f.godId]);
    const director = await login(f.godId, "god", f);
    const actor = weaponType === "Bow" ? await login(f.playerId, "player", f) : director;
    const finishTiming = async (pendingId: number) => {
      const remaining = async () => Number((await pool.query("select remaining_initiative_cost from campaign_session_encounter_pending_action where id=$1", [pendingId])).rows[0].remaining_initiative_cost);
      for (let step = 0; step < 10 && await remaining() > 0; step++) {
        const before = await remaining();
        await screen(director).getByRole("button", { name: "Refresh", exact: true }).click();
        await until(async () => await remaining() === 0 || await screen(director).getByRole("button", { name: "Advance combat", exact: true }).isVisible()
          && await screen(director).getByRole("button", { name: "Advance combat", exact: true }).isEnabled(), "next projectile timing step");
        if (await remaining() === 0) break;
        await screen(director).getByRole("button", { name: "Advance combat", exact: true }).click();
        await until(async () => await remaining() < before, "projectile timing progresses");
      }
      assert.equal(await remaining(), 0);
    };
    if (weaponType === "Crossbow") await selectGod(director, "Rowan");
    const view = screen(actor), command = weaponType === "Crossbow" ? "Called Shot" : "Attack";
    await view.getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: command, exact: true }).click();
    const source = view.getByRole("combobox", { name: `${command} source`, exact: true });
    await until(async () => await source.locator("option").filter({ hasText: `Screen ${weaponType}` }).count() === 1, "projectile source available");
    await source.selectOption((await source.locator("option").filter({ hasText: `Screen ${weaponType}` }).getAttribute("value"))!);
    await view.getByRole("button", { name: weaponType === "Bow" ? "Select arrow (0 Initiative)" : "Load / cock crossbow (4 Initiative)", exact: true }).click();
    if (weaponType === "Crossbow") {
      await until(async () => (await declarations(f)).length === 1, "crossbow loading committed");
      await finishTiming((await declarations(f))[0].pending_action_id);
    }
    await until(async () => (await pool.query("select loaded_rounds from campaign_character_firearm_state where item_instance_id=$1", [gun.instance.id])).rows[0].loaded_rounds === 1, "projectile selected or loaded");
    await view.getByRole("combobox", { name: "Target", exact: true }).selectOption(String(f.occurrences[0]));
    if (weaponType === "Bow") await confirmPlayerDistance(director, actor);
    else {
      await view.getByLabel("Target distance", { exact: true }).fill("25");
      await view.getByLabel("Distance unit", { exact: true }).fill("feet");
    }
    if (weaponType === "Crossbow") {
      await view.getByRole("combobox", { name: "Target location", exact: true }).selectOption("0");
      await view.getByLabel("Called Shot objective", { exact: true }).fill("Head");
      await view.getByLabel("G.O.D. penalty", { exact: true }).fill("2");
      await view.getByLabel("Penalty reason", { exact: true }).fill("Authored Head location in the isolated projectile walkthrough.");
      await view.getByRole("combobox", { name: "Roll method", exact: true }).selectOption("physical");
    }
    await view.getByLabel("Aim Initiative", { exact: true }).fill("1");
    await view.getByLabel("Percentile result", { exact: true }).fill("70");
    await until(() => view.getByRole("button", { name: "Fire & Roll", exact: true }).isEnabled(), "projectile Aim and shot preflight");
    await actor.evaluate(() => window.scrollTo(0, 0));
    await screenshot(actor, `${scenario}-desktop`);
    await actor.evaluate(() => window.scrollTo(0, 0));
    await screenshot(actor, `${scenario}-mobile`, 390);
    await view.getByRole("button", { name: "Fire & Roll", exact: true }).click();
    const attack = async () => (await pool.query("select * from campaign_session_encounter_firearm_attack where encounter_id=$1", [f.encounterId])).rows[0];
    await until(async () => !!await attack(), "aiming projectile recorded");
    await finishTiming((await attack()).aim_pending_action_id);
    await view.getByRole("button", { name: "Aim complete: begin firing", exact: true }).click();
    await until(async () => !!(await attack()).trigger_pending_action_id, "release committed after Aim");
    const release = (await pool.query("select original_initiative_cost from campaign_session_encounter_pending_action where id=$1", [(await attack()).trigger_pending_action_id])).rows[0];
    assert.equal(release.original_initiative_cost, weaponType === "Bow" ? 1.5 : 1);
    await finishTiming((await attack()).trigger_pending_action_id);
    await screen(director).getByRole("region", { name: "Next combat input" }).getByRole("button", { name: /^Prepare Rowan's Screen .* result$/ }).click();
    await until(async () => (await attack()).rounds_consumed === 1, "one projectile consumed");
    await actor.reload(); await screen(actor).getByText("Live", { exact: true }).waitFor();
    assert.equal((await attack()).rounds_consumed, 1);
    assert.equal((await pool.query("select count(*)::int n from campaign_session_roll where encounter_id=$1", [f.encounterId])).rows[0].n, 1);
    results.push(`${weaponType}: exact ammunition loading, Aim, ${command}, correct release cost and one original Roll through desktop/mobile controls.`);
    if (actor !== director) await actor.context().close();
    await director.context().close();
  }
  for (const mode of ["spell", "firearm"] as const) {
    if (!include(mode)) continue;
    const setup = await db.transaction(async (tx) => { const fixture = await screenFixture(tx, mode); const extra = mode === "spell" ? await addScreenSpell(tx, fixture) : await addScreenFirearm(tx, fixture); return { fixture, extra }; });
    const fixture = setup.fixture, director = await login(fixture.godId, "god", fixture), participant = await login(fixture.playerId, "player", fixture);
    const view = screen(participant);
    await view.getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: mode === "spell" ? "Cast" : "Attack", exact: true }).click();
    await until(async () => await view.getByRole("combobox", { name: mode === "spell" ? /^Cast source/ : /^Attack source/ }).locator("option").count() > 1, `${mode} source loaded`);
    const sourceControl = view.getByRole("combobox", { name: mode === "spell" ? /^Cast source/ : /^Attack source/ });
    await sourceControl.selectOption((await sourceControl.locator("option").filter({ hasText: mode === "spell" ? /^Screen Arc Bolt$/ : /^Screen Pistol/ }).getAttribute("value"))!);
    if (mode !== "spell") {
      await view.getByRole("combobox", { name: /^Target/ }).selectOption(String(fixture.occurrences[0]));
      await confirmPlayerDistance(director, participant);
    }
    if (mode === "spell") await view.getByRole("combobox", { name: /^Spell target 1/ }).selectOption(String(fixture.occurrences[0]));
    await view.getByLabel("Percentile result", { exact: true }).fill("70");
    if (mode === "spell") { assert.equal(await view.getByRole("combobox", { name: /damage location/ }).count(), 0); await screenshot(participant, "spell-roll-ready"); }
    await view.getByRole("button", { name: mode === "spell" ? "Commit Cast & Roll" : "Fire & Roll", exact: true }).click();
    await until(async () => (await declarations(fixture)).length > 0, `${mode} committed`);
    const record = (await declarations(fixture))[0];
    const manaSpent = async () => Number((await pool.query("select coalesce(sum(mana_spent),0) spent from campaign_character_active_mana where character_id=$1", [fixture.heroId])).rows[0].spent);
    const committedMana = await manaSpent();
    if (mode === "spell") assert.ok(committedMana > 0, "The cast spends Mana at commitment");
    if (mode === "spell") assert.equal((await pool.query("select count(*)::int count from campaign_session_roll where encounter_id=$1", [fixture.encounterId])).rows[0].count, 1);
    await advanceAction(director, record.pending_action_id);
    if (mode === "spell") {
      await screen(director).getByRole("region", { name: "Next combat input" }).getByRole("button", { name: /^Prepare .* result$/ }).click();
      const report = screen(director).getByRole("region", { name: "Spell result report", exact: true }); await report.waitFor();
      await report.getByText(/damage pending to Head/).first().waitFor(); await screenshot(director, "spell-result-report");
      const damage = async () => (await pool.query("select local_state_json->'health'->>'totalDamage' damage from campaign_session_encounter_participant where encounter_id=$1 and character_id=$2", [fixture.encounterId, fixture.occurrences[0]])).rows[0].damage;
      assert.equal(Number(await damage()), 0, "The report is reviewed before HP changes.");
      await report.getByRole("button", { name: "Approve & apply spell", exact: true }).click();
      await until(async () => (await declarations(fixture))[0].status === "resolved", "spell consequence");
      assert.equal(Number(await damage()), 8, "The learned spell's four successes apply 2 damage each.");
      assert.equal(await manaSpent(), committedMana); await participant.reload(); await screen(participant).getByText("Live", { exact: true }).waitFor();
      assert.equal(await manaSpent(), committedMana); assert.equal(Number(await damage()), 8);
    }
    else { await screen(director).getByRole("region", { name: "Next combat input" }).getByRole("button", { name: /^Prepare Rowan's Screen Pistol.* result$/ }).click(); await until(async () => (await pool.query("select loaded_rounds from campaign_character_firearm_state where character_id=$1", [fixture.heroId])).rows[0].loaded_rounds === 2, "ammunition consumed once"); await director.reload(); await screen(director).getByText("Live", { exact: true }).waitFor(); assert.equal((await pool.query("select loaded_rounds from campaign_character_firearm_state where character_id=$1", [fixture.heroId])).rows[0].loaded_rounds, 2); assert.equal((await pool.query("select count(*)::int n from campaign_session_roll where encounter_id=$1", [fixture.encounterId])).rows[0].n, 1); }
    results.push(`${mode === "spell" ? "Learned spell Skill Roll, automatic hit location and one result approval" : "Exact firearm"} commits and completes through the screen/server flow.`);
    await director.context().close(); await participant.context().close();
  }
  if (include("firearm-setup")) {
    const { f, gun } = await db.transaction(async (tx) => { const f = await screenFixture(tx, "firearm-setup"); return { f, gun: await addScreenFirearm(tx, f) }; });
    // A fresh, empty equipment baseline in the isolated fixture, before combat.
    await pool.query("update campaign_session_encounter set status='completed', completed_at=now() where id=$1", [f.encounterId]);
    await pool.query("update campaign_session_encounter_initiative set status='closed', closed_at=now() where encounter_id=$1", [f.encounterId]);
    await pool.query("delete from campaign_character_firearm_state where item_instance_id=$1", [gun.instance.id]);
    const profile = (await pool.query("update weapon_profiles set reload_type='Single' where item_id=$1 returning ammunition_item_id", [gun.gun.id])).rows[0];
    await pool.query("insert into campaign_character_item(character_id,item_id,quantity,unit_cost_credits) values($1,$2,6,1)", [f.heroId, profile.ammunition_item_id]);
    const player = await login(f.playerId, "player", f);
    await player.goto(`${base}/realms/characters/${f.heroId}`); await player.waitForLoadState("networkidle");
    await player.getByRole("navigation", { name: "Character creation sections" }).getByRole("button", { name: /Sheet/ }).click();
    const setup = player.getByRole("region", { name: "Firearm equipment setup", exact: true });
    await setup.getByRole("button", { name: "Initialize empty firearm", exact: true }).click();
    await setup.getByRole("spinbutton", { name: "Loose rounds to insert", exact: true }).fill("2");
    await setup.getByRole("button", { name: "Load loose rounds", exact: true }).click();
    await setup.getByText(/2 rounds/).waitFor();
    await setup.getByText("Next: Loaded and ready.", { exact: true }).waitFor();
    assert.equal(await setup.getByRole("button", { name: "Ready firearm", exact: true }).count(), 0);
    assert.equal((await pool.query("select quantity from campaign_character_item where character_id=$1 and item_id=$2", [f.heroId, profile.ammunition_item_id])).rows[0].quantity, 4);
    await setup.screenshot({ path: path.join(artifacts, "firearm-equipment-setup-guided.png") });
    results.push("Player initializes an exact empty firearm and loads two loose rounds; it is ready without a separate action.");
    await player.context().close();
  }
  if (include("distance-approval")) {
    const { f, gun } = await db.transaction(async (tx) => { const f = await screenFixture(tx, "distance-approval"); return { f, gun: await addScreenFirearm(tx, f) }; });
    const god = await login(f.godId, "god", f), player = await login(f.playerId, "player", f);
    const playerScreen = screen(player);
    await playerScreen.getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: "Attack", exact: true }).click();
    await until(async () => await playerScreen.getByRole("combobox", { name: /^Attack source/ }).locator("option").filter({ hasText: /^Screen Pistol/ }).count() === 1, "structured pistol source");
    await playerScreen.getByRole("combobox", { name: /^Attack source/ }).selectOption(await playerScreen.getByRole("combobox", { name: /^Attack source/ }).locator("option").filter({ hasText: /^Screen Pistol/ }).getAttribute("value") ?? "");
    await playerScreen.getByRole("combobox", { name: /^Target/ }).selectOption(String(f.occurrences[0]));
    await playerScreen.getByLabel("Target distance", { exact: true }).fill("25");
    await playerScreen.getByLabel("Distance unit", { exact: true }).fill("feet");
    const beforeRequest = await pool.query<{ loaded_rounds: number; current_initiative: number }>(`select s.loaded_rounds, i.current_initiative from campaign_character_firearm_state s inner join campaign_session_encounter_initiative_participant i on i.character_id=s.character_id and i.encounter_id=$1 where s.item_instance_id=$2`, [f.encounterId, gun.instance.id]);
    assert.equal(beforeRequest.rows[0]?.loaded_rounds, 3);
    await playerScreen.getByRole("button", { name: "Request G.O.D. distance confirmation", exact: true }).click();
    await playerScreen.getByText("Distance sent to the Campaign-owning G.O.D. for confirmation.", { exact: true }).waitFor();
    assert.equal((await pool.query("select count(*)::int n from campaign_session_encounter_firearm_attack where encounter_id=$1", [f.encounterId])).rows[0].n, 0);
    assert.equal((await pool.query("select loaded_rounds from campaign_character_firearm_state where item_instance_id=$1", [gun.instance.id])).rows[0].loaded_rounds, 3);
    await god.reload();
    await screen(god).getByText("Live", { exact: true }).waitFor();
    await screen(god).getByRole("region", { name: "Next combat input" }).getByRole("button", { name: "Review Rowan's distance request", exact: true }).click();
    const request = screen(god).locator("fieldset").filter({ hasText: "weapon distance" }).first();
    await screen(god).getByLabel("Ruling / participation reason", { exact: true }).fill("Distance confirmed for this exact Player shot.");
    await request.getByLabel("Approved distance", { exact: true }).fill("75");
    await request.getByLabel("Distance unit", { exact: true }).fill("feet");
    await request.getByLabel("Beyond Long modifier", { exact: true }).fill("25");
    await request.getByLabel("Beyond Long reason", { exact: true }).fill("G.O.D. confirms the measured target is beyond Long.");
    await request.getByRole("button", { name: "Approve", exact: true }).click();
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    await player.getByRole("button", { name: "Refresh", exact: true }).click();
    await playerScreen.getByText(/G\.O\.D\. approved distance: 75 feet/).waitFor();
    try { await playerScreen.getByText(/final target 75/).waitFor(); } catch (error) { console.log("DISTANCE_FINAL_TARGET_DEBUG", (await playerScreen.innerText()).slice(-4500)); throw error; }
    await playerScreen.getByLabel("Percentile result", { exact: true }).fill("80");
    await playerScreen.getByRole("button", { name: "Fire & Roll", exact: true }).click();
    try { await until(async () => (await pool.query("select count(*)::int n from campaign_session_encounter_firearm_attack where encounter_id=$1", [f.encounterId])).rows[0].n === 1, "approved Player firearm attack committed"); } catch (error) { console.log("DISTANCE_COMMIT_DEBUG", (await playerScreen.innerText()).slice(-5000)); throw error; }
    const requestKey = (await pool.query<{ idempotency_key: string }>("select idempotency_key from campaign_session_encounter_firearm_attack where encounter_id=$1", [f.encounterId])).rows[0]?.idempotency_key; assert.match(requestKey ?? "", /^[a-f0-9-]{32,36}$/);
    const firearmModeId = (await pool.query<{ id: number }>("select selected_firing_mode_id id from campaign_character_firearm_state where item_instance_id=$1", [gun.instance.id])).rows[0]?.id;
    assert.ok(firearmModeId);
    const rulingRow = await pool.query<{ id: number; linkedFirearmAttackId: number | null }>("select id,linked_firearm_attack_id from campaign_session_player_ruling_request where encounter_id=$1 and request_type='weapon-distance'", [f.encounterId]);
    const distanceRequestId = rulingRow.rows[0]?.id; assert.ok(distanceRequestId);
    const duplicateChoice = {
      participantId: f.heroId, source: { kind: "weapon" as const, ref: `instance:${gun.instance.id}`, name: "Screen Pistol", instanceId: gun.instance.id, itemId: gun.gun.id, description: "" }, targetIds: [f.occurrences[0]], range: { attackMode: "ranged" as const, distance: 75, unit: "feet", beyondLongModifier: 25, beyondLongReason: "G.O.D. confirms the measured target is beyond Long.", distanceRulingRequestId: distanceRequestId }, firearm: { firingModeId: firearmModeId!, aimInitiative: 0, firingDurationInitiative: 1 },
    };
    const duplicateInput = { requestKey: requestKey!, choice: duplicateChoice, roll: { method: "entered" as const, enteredTotal: 80 } };
    const duplicate = await db.transaction(async (tx) => {
      const context = await lockPlayerCombatContextInTransaction(tx, f.encounterId, f.heroId, f.playerId);
      return submitCombatChoiceInTransaction(tx, context, { authority: "player", userId: f.playerId, characterId: f.heroId }, duplicateInput);
    });
    assert.equal((duplicate as { reused?: boolean }).reused, true, "Identical firearm retry returns the original attack.");
    assert.equal((await pool.query("select count(*)::int n from campaign_session_encounter_firearm_attack where encounter_id=$1", [f.encounterId])).rows[0].n, 1);
    const finishFirearm = async () => {
      const statusRow = (await pool.query<{ status: string; trigger_pending_action_id: number | null; effect_plan_id: number | null }>("select status,trigger_pending_action_id,effect_plan_id from campaign_session_encounter_firearm_attack where encounter_id=$1", [f.encounterId])).rows[0];
      const status = statusRow?.status;
      if (["resolved", "cancelled"].includes(status ?? "")) return;
      await god.getByRole("button", { name: "Refresh", exact: true }).click();
      await new Promise((resolveWait) => setTimeout(resolveWait, 500));
      const resolve = screen(god).getByRole("button", { name: "Resolve firearm result", exact: true });
      if (await resolve.count()) { await resolve.click(); await until(async () => (await pool.query("select status from campaign_session_encounter_effect_plan where encounter_id=$1 order by id desc limit 1", [f.encounterId])).rows[0]?.status === "applied", "firearm consequence application"); return; }
      if (statusRow?.effect_plan_id !== null) {
        const planStatus = (await pool.query<{ status: string }>("select status from campaign_session_encounter_effect_plan where id=$1", [statusRow.effect_plan_id])).rows[0]?.status;
        if (planStatus === "applied") return;
      }
      if (["resolved", "cancelled"].includes(status ?? "")) return;
      const pending = async () => Number((await pool.query("select trigger_pending_action_id from campaign_session_encounter_firearm_attack where encounter_id=$1", [f.encounterId])).rows[0]?.trigger_pending_action_id ?? 0);
      const remaining = async () => { const id = await pending(); return Number((await pool.query("select remaining_initiative_cost from campaign_session_encounter_pending_action where id=$1", [id])).rows[0]?.remaining_initiative_cost ?? 0); };
      for (let step = 0; step < 5 && await remaining() > 0; step++) { await god.getByRole("button", { name: "Refresh", exact: true }).click(); if (await remaining() <= 0) break; try { await until(() => screen(god).getByRole("button", { name: "Advance combat", exact: true }).isEnabled(), "firearm timing advance"); } catch (error) { if (await remaining() <= 0) break; console.log("DISTANCE_TIMING_DEBUG", JSON.stringify({ attack: (await pool.query("select status,trigger_pending_action_id,effect_plan_id from campaign_session_encounter_firearm_attack where encounter_id=$1", [f.encounterId])).rows, pending: (await pool.query("select id,status,remaining_initiative_cost from campaign_session_encounter_pending_action where encounter_id=$1", [f.encounterId])).rows }, null, 2)); throw error; } await screen(god).getByRole("button", { name: "Advance combat", exact: true }).click(); }
      const prepare = screen(god).getByRole("button", { name: /^Prepare Rowan's Screen Pistol.* result$/ });
      if (await prepare.count()) await prepare.click();
    };
    await finishFirearm();
    await until(async () => (await pool.query("select loaded_rounds from campaign_character_firearm_state where item_instance_id=$1", [gun.instance.id])).rows[0].loaded_rounds === 2, "normal firearm ammunition spend");
    await until(async () => (await pool.query("select count(*)::int n from campaign_session_roll where encounter_id=$1", [f.encounterId])).rows[0].n === 1, "one firearm roll");
    const proof = await pool.query<{ request_status: string; linked_attack: number | null; loaded_rounds: number; initiative: number }>(`select r.status request_status,r.linked_firearm_attack_id linked_attack,s.loaded_rounds,i.current_initiative initiative from campaign_session_player_ruling_request r cross join campaign_character_firearm_state s inner join campaign_session_encounter_initiative_participant i on i.character_id=s.character_id and i.encounter_id=$2 where r.encounter_id=$2 and r.request_type='weapon-distance' and s.item_instance_id=$1`, [gun.instance.id, f.encounterId]);
    assert.equal(proof.rows[0]?.request_status, "approved"); assert.ok(proof.rows[0]?.linked_attack); assert.equal(proof.rows[0]?.loaded_rounds, 2); assert.equal(proof.rows[0]?.initiative, beforeRequest.rows[0]!.current_initiative - 1, "The normal one-Initiative firing cost is spent only when firing occurs.");
    const rollProof = (await pool.query<{ result_total: number; mechanical_snapshot: { resolution?: { finalTarget?: number; succeeded?: boolean } } }>("select result_total,mechanical_snapshot from campaign_session_roll where encounter_id=$1", [f.encounterId])).rows[0];
    assert.equal(rollProof?.result_total, 80); assert.equal(rollProof?.mechanical_snapshot.resolution?.finalTarget, 75, "Approved Beyond-Long penalty is applied exactly once."); assert.equal(rollProof?.mechanical_snapshot.resolution?.succeeded, true);
    const effectCount = (await pool.query("select count(*)::int n from campaign_session_encounter_effect where encounter_id=$1", [f.encounterId])).rows[0].n;
    assert.equal(effectCount, 1, "one applied firearm effect row");
    const targetDamage = Number((await pool.query("select local_state_json->'health'->>'totalDamage' damage from campaign_session_encounter_participant where encounter_id=$1 and character_id=$2", [f.encounterId, f.occurrences[0]])).rows[0]?.damage ?? 0);
    assert.equal(targetDamage, 2, "one successful firearm shot applies its authored damage exactly once");
    const completedDuplicate = await db.transaction(async (tx) => {
      const context = await lockPlayerCombatContextInTransaction(tx, f.encounterId, f.heroId, f.playerId);
      return submitCombatChoiceInTransaction(tx, context, { authority: "player", userId: f.playerId, characterId: f.heroId }, duplicateInput);
    });
    assert.equal((completedDuplicate as { reused?: boolean }).reused, true, "Identical completed firearm retry returns the original attack.");
    assert.equal((await pool.query("select count(*)::int n from campaign_session_encounter_firearm_attack where encounter_id=$1", [f.encounterId])).rows[0].n, 1);
    assert.equal((await pool.query("select loaded_rounds from campaign_character_firearm_state where item_instance_id=$1", [gun.instance.id])).rows[0].loaded_rounds, 2);
    assert.equal(Number((await pool.query("select local_state_json->'health'->>'totalDamage' damage from campaign_session_encounter_participant where encounter_id=$1 and character_id=$2", [f.encounterId, f.occurrences[0]])).rows[0]?.damage ?? 0), 2);
    await player.reload(); await playerScreen.getByText("Live", { exact: true }).waitFor();
    assert.equal((await pool.query("select linked_firearm_attack_id from campaign_session_player_ruling_request where encounter_id=$1 and request_type='weapon-distance'", [f.encounterId])).rows[0]?.linked_firearm_attack_id, proof.rows[0]?.linked_attack, "Refresh preserves the consumed approval-to-attack identity.");
    results.push("Player proposed Medium, G.O.D. corrected it to Beyond Long at 75 feet with a 25-point replacement penalty, the persisted Roll target was 75, one successful shot spent one round and applied 2 damage, and an identical completed retry preserved one attack, one effect, two loaded rounds, and two damage.");
    await god.context().close(); await player.context().close();
  }
  if (include("firearm-completion-crossing")) {
    const { f, gun } = await db.transaction(async (tx) => { const f = await screenFixture(tx, "firearm-completion-crossing"); return { f, gun: await addScreenFirearm(tx, f) }; });
    await pool.query("update campaign_session_encounter_initiative set timeline_initiative=21 where encounter_id=$1", [f.encounterId]);
    await pool.query("update campaign_session_encounter_initiative_participant set participation_status='passed',current_initiative=0 where encounter_id=$1", [f.encounterId]);
    await pool.query("update campaign_session_encounter_initiative_participant set participation_status='active',current_initiative=$3 where encounter_id=$1 and character_id=$2", [f.encounterId, f.occurrences[0], 21]);
    await pool.query("update campaign_session_encounter_initiative_participant set participation_status='active',current_initiative=17 where encounter_id=$1 and character_id=$2", [f.encounterId, f.heroId]);
    const director = await login(f.godId, "god", f, true), player = await login(f.playerId, "player", f);
    await selectGod(director, "Fixture Goblin 1"); await chooseAttack(director, f.heroId, "20", "Shortsword"); await commitAttack(director);
    await until(async () => (await pool.query("select timeline_initiative from campaign_session_encounter_initiative where encounter_id=$1", [f.encounterId])).rows[0].timeline_initiative === 17, "incoming attack finishes at the free firearm wielder's Initiative");
    await screen(director).getByRole("button", { name: "Rowan can act now", exact: true }).waitFor();
    const source = screen(player).getByRole("combobox", { name: /^Attack source/ });
    await source.selectOption(await source.locator("option").filter({ hasText: /^Screen Pistol/ }).getAttribute("value") ?? "");
    await screen(player).getByRole("combobox", { name: /^Target/ }).selectOption(String(f.occurrences[0]));
    await confirmPlayerDistance(director, player);
    await screen(player).getByLabel("Percentile result", { exact: true }).fill("70");
    await until(() => screen(player).getByRole("button", { name: "Fire & Roll", exact: true }).isEnabled(), "a free actor can fire at a completed-action crossing without choosing a defense");
    await screenshot(player, "firearm-completion-crossing");
    await screen(player).getByRole("button", { name: "Fire & Roll", exact: true }).click();
    await screen(director).getByRole("button", { name: "Fixture Goblin 1 can act now", exact: true }).waitFor();
    await screen(director).getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: "Hold", exact: true }).click();
    await screen(director).getByRole("button", { name: "Pass this round", exact: true }).click();
    await until(async () => (await pool.query("select loaded_rounds from campaign_character_firearm_state where item_instance_id=$1", [gun.instance.id])).rows[0].loaded_rounds === 2, "independent shot resolves after the original incoming result");
    const damage = async () => Number((await pool.query("select local_state_json->'health'->>'totalDamage' damage from campaign_session_encounter_participant where encounter_id=$1 and character_id=$2", [f.encounterId, f.occurrences[0]])).rows[0].damage);
    await until(async () => await damage() === 2, "one bullet applies its authored 2 damage");
    assert.equal((await pool.query("select count(*)::int n from campaign_session_roll where encounter_id=$1", [f.encounterId])).rows[0].n, 2);
    results.push("At the exact Initiative where an incoming attack completes, the free Player can Fire & Roll without a defense-only gate. The incoming result remains recorded; the independent shot consumes one round and applies 2 damage.");
    await director.context().close(); await player.context().close();
  }
  if (include("passed-round")) {
    const f = await db.transaction((tx) => screenFixture(tx, "passed-round"));
    await pool.query("update campaign_session_encounter_initiative set timeline_initiative=1 where encounter_id=$1", [f.encounterId]);
    await pool.query("update campaign_session_encounter_initiative_participant set participation_status='passed',current_initiative=0 where encounter_id=$1", [f.encounterId]);
    await pool.query("update campaign_session_encounter_initiative_participant set participation_status='active',current_initiative=1 where encounter_id=$1 and character_id=any($2::int[])", [f.encounterId, [f.heroId, f.defenderId]]);
    await pool.query("update weapon_profiles set initiative_cost=1 where item_id=$1", [f.weaponId]);
    const director = await login(f.godId, "god", f, true), player = await login(f.playerId, "player", f);
    await chooseAttack(player, f.defenderId, "85"); await commitAttack(player);
    await selectGod(director, "Sentry NPC");
    await screen(director).getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: "Hold", exact: true }).click();
    await screen(director).getByRole("button", { name: "Pass this round", exact: true }).click();
    await until(async () => (await pool.query("select timeline_initiative from campaign_session_encounter_initiative where encounter_id=$1", [f.encounterId])).rows[0].timeline_initiative === 0, "last attack reaches round boundary after target passes");
    await screen(director).getByRole("button", { name: "Approve & apply attack", exact: true }).waitFor();
    assert.equal(await screen(director).getByRole("button", { name: "Next round", exact: true }).count(), 0, "last outcome is reviewed before round advancement");
    await screen(director).getByRole("button", { name: "Approve & apply attack", exact: true }).click();
    await screen(director).getByRole("button", { name: "Next round", exact: true }).waitFor();
    await screenshot(director, "passed-round-ready");
    const before = (await pool.query("select current_initiative,normal_total_initiative from campaign_session_encounter_initiative_participant where encounter_id=$1 and character_id=$2", [f.encounterId, f.defenderId])).rows[0];
    assert.equal(before.current_initiative, 1, "Pass retains unused Initiative");
    await screen(director).getByRole("button", { name: "Next round", exact: true }).click();
    await until(async () => (await pool.query("select round_number from campaign_session_encounter_initiative where encounter_id=$1", [f.encounterId])).rows[0].round_number === 2, "next round starts through the real button");
    const after = (await pool.query("select current_initiative from campaign_session_encounter_initiative_participant where encounter_id=$1 and character_id=$2", [f.encounterId, f.defenderId])).rows[0];
    assert.equal(after.current_initiative, before.current_initiative + before.normal_total_initiative);
    assert.equal((await pool.query("select count(*)::int n from campaign_session_encounter_responder_opportunity where encounter_id=$1 and status='pending' and reaction_id is null", [f.encounterId])).rows[0].n, 0);
    assert.equal((await pool.query("select count(*)::int n from campaign_session_roll where encounter_id=$1", [f.encounterId])).rows[0].n, 1);
    results.push("A target passes while the final attack is declared, the attack reaches Initiative zero and its report is approved, then Next round starts Round 2 with the passed combatant's unused Initiative preserved. No obsolete response, repeat Roll or G.O.D. permission prompt blocks it.");
    await director.context().close(); await player.context().close();
  }
  if (include("magazine-combat")) {
    const { f, gun } = await db.transaction(async (tx) => { const f = await screenFixture(tx, "magazine-combat"); return { f, gun: await addScreenFirearm(tx, f) }; });
    const profile = (await pool.query("update weapon_profiles set reload_type='Magazine',readiness_mode=null,ready_initiative_cost=null where item_id=$1 returning id,ammunition_item_id", [gun.gun.id])).rows[0];
    await pool.query("update campaign_character_firearm_state set capacity_rounds=null,capacity_source=null,readiness_mode=null,readiness_mode_source=null,readied=false,loaded_rounds=0,loaded_ammunition_item_id=null,loaded_ammunition_profile_id=null,loaded_ammunition_unit_cost_credits=null where item_instance_id=$1", [gun.instance.id]);
    const model = (await pool.query("insert into items(canonical_id,name,catalog_scope,equipment_group,record_type,family,category,price_basis,created_by_user_id) values($1,'Combat Magazine','equipment','general','Magazine','Test','Test','unit',$2) returning id", [`COMBAT-MAG-${crypto.randomUUID()}`.toUpperCase(), f.godId])).rows[0];
    await pool.query("insert into magazine_profiles(item_id,capacity_rounds,fill_initiative_cost_per_round) values($1,6,2)", [model.id]);
    await pool.query("insert into magazine_ammunition values($1,$2)", [model.id, profile.ammunition_item_id]);
    await pool.query("insert into weapon_magazines values($1,$2)", [profile.id, model.id]);
    const copies = (await pool.query("insert into campaign_character_item_instance(character_id,item_id,current_charges,unit_cost_credits,loaded_rounds,loaded_ammunition_item_id,loaded_ammunition_unit_cost_credits) values($1,$2,0,1,2,$3,1),($1,$2,0,1,0,null,0) returning id", [f.heroId, model.id, profile.ammunition_item_id])).rows;
    await pool.query("insert into campaign_character_item(character_id,item_id,quantity,unit_cost_credits) values($1,$2,6,1)", [f.heroId, profile.ammunition_item_id]);
    const director = await login(f.godId, "god", f, true), player = await login(f.playerId, "player", f);
    const attackSource = screen(player).getByRole("combobox", { name: /^Attack source/ });
    await until(async () => await attackSource.locator("option").filter({ hasText: /^Screen Pistol/ }).count() === 1, "owned firearm source");
    await attackSource.selectOption(await attackSource.locator("option").filter({ hasText: /^Screen Pistol/ }).getAttribute("value") ?? "");
    await screen(player).getByRole("button", { name: "Apply updated item settings", exact: true }).click();
    await until(async () => (await pool.query("select capacity_rounds from campaign_character_firearm_state where item_instance_id=$1", [gun.instance.id])).rows[0].capacity_rounds === 6, "existing copy adopts authored capacity without a reset");
    assert.equal((await pool.query("select readied from campaign_character_firearm_state where item_instance_id=$1", [gun.instance.id])).rows[0].readied, false);
    await screen(player).getByRole("button", { name: "Load / swap magazine", exact: true }).click();
    await screen(player).getByRole("combobox", { name: "Replacement magazine", exact: true }).selectOption(String(copies[0].id));
    await screen(player).getByRole("button", { name: /^Load magazine \(/ }).click();
    await until(async () => (await pool.query("select magazine_instance_id from firearm_magazine_attachment where weapon_instance_id=$1", [gun.instance.id])).rows[0]?.magazine_instance_id === copies[0].id, "magazine swap completes through Initiative");
    await screen(player).getByRole("heading", { name: "Ready to fire", exact: true }).waitFor();
    assert.equal(await screen(player).getByRole("button", { name: /^Ready weapon|^Draw weapon/ }).count(), 0);
    await screen(player).getByText("Fill magazine", { exact: true }).click();
    await screen(player).getByRole("combobox", { name: "Magazine to fill", exact: true }).selectOption(String(copies[1].id));
    await screen(player).getByRole("spinbutton", { name: "Rounds to insert", exact: true }).fill("2");
    await screen(player).getByRole("button", { name: "Begin magazine filling", exact: true }).click();
    await until(async () => (await pool.query("select loaded_rounds from campaign_character_item_instance where id=$1", [copies[1].id])).rows[0].loaded_rounds === 2, "detached magazine fills at two Initiative per round");
    assert.equal((await pool.query("select quantity from campaign_character_item where character_id=$1 and item_id=$2", [f.heroId, profile.ammunition_item_id])).rows[0].quantity, 4);
    assert.equal((await pool.query("select count(*)::int n from campaign_session_roll where encounter_id=$1", [f.encounterId])).rows[0].n, 0);
    await screenshot(player, "magazine-combat-preparation-guided");
    // Reproduce the live report: loaded and readied, but firing-mode fields are blank.
    await pool.query("update weapon_firing_modes set base_cycling_initiative_cost=null,base_recoil_reset_initiative_cost=null,delivery_cadence=null,rounds_per_cadence=null,mechanics_review_required=true where weapon_profile_id=$1", [profile.id]);
    await player.reload(); await screen(player).getByText("Live", { exact: true }).waitFor();
    await screen(player).getByRole("combobox", { name: /^Attack source/ }).selectOption(await screen(player).getByRole("combobox", { name: /^Attack source/ }).locator("option").filter({ hasText: /^Screen Pistol/ }).getAttribute("value") ?? "");
    await screen(player).getByText(/Your ammunition is loaded/).waitFor();
    assert.equal(await screen(player).getByRole("button", { name: /^Load magazine \(/ }).count(), 0);
    assert.equal(await screen(player).getByRole("button", { name: "Retry action options", exact: true }).count(), 0);
    await screenshot(player, "firearm-loaded-missing-mode");
    const author = await director.context().newPage();
    await author.goto(`${base}/heavens/equipment?item=${gun.gun.id}&tab=weapon#firearm-firing-modes`);
    await author.waitForLoadState("networkidle");
    await author.getByRole("region", { name: "Firearm setup checklist", exact: true }).waitFor();
    await author.getByLabel("Cycling Initiative Cost", { exact: true }).fill("0.1");
    await author.getByLabel("Recoil Reset Initiative Cost", { exact: true }).fill("0.2");
    await author.getByLabel("Delivery Cadence", { exact: true }).selectOption("per-trigger");
    await author.getByLabel("Rounds Per Cadence", { exact: true }).fill("1");
    await author.getByRole("button", { name: "Save Item", exact: true }).click();
    await until(async () => (await pool.query("select rounds_per_cadence from weapon_firing_modes where weapon_profile_id=$1", [profile.id])).rows[0].rounds_per_cadence === 1, "item editor saves the mode fields before combat refresh");
    await author.close();
    await screen(player).getByRole("button", { name: "Refresh weapon", exact: true }).click();
    await screen(player).getByRole("heading", { name: "Ready to fire", exact: true }).waitFor();
    assert.equal(await screen(player).getByRole("combobox", { name: "Firing mode", exact: true }).count(), 0, "a sole mode is selected automatically without a chooser");
    await screen(player).getByRole("combobox", { name: /^Target/ }).selectOption(String(f.occurrences[0]));
    await screen(player).getByLabel("Target distance", { exact: true }).fill("25");
    await screen(player).getByLabel("Distance unit", { exact: true }).fill("feet");
    await screen(player).getByRole("button", { name: "Request G.O.D. distance confirmation", exact: true }).click();
    await screen(player).getByText("Distance sent to the Campaign-owning G.O.D. for confirmation.", { exact: true }).waitFor();
    await director.reload(); await screen(director).getByText("Live", { exact: true }).waitFor();
    await selectGod(director, "Rowan");
    await screen(director).getByText("G.O.D. controls for Rowan", { exact: true }).click();
    const distanceRequest = screen(director).locator("fieldset").filter({ hasText: "weapon distance" }).first();
    await screen(director).getByLabel("Ruling / participation reason", { exact: true }).fill("Distance confirmed for this exact Player firearm shot.");
    await distanceRequest.getByLabel("Approved distance", { exact: true }).fill("25");
    await distanceRequest.getByLabel("Distance unit", { exact: true }).fill("feet");
    await distanceRequest.getByRole("button", { name: "Approve", exact: true }).click();
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    await screen(player).getByRole("button", { name: "Refresh", exact: true }).click();
    await screen(player).getByText(/G\.O\.D\. approved distance: 25 feet/).waitFor();
    await screen(player).getByLabel("Percentile result", { exact: true }).fill("70");
    await screenshot(player, "firearm-ready-to-fire");
    await screen(player).getByRole("button", { name: "Fire & Roll", exact: true }).click();
    await until(async () => (await pool.query("select loaded_rounds from campaign_character_item_instance where id=$1", [copies[0].id])).rows[0].loaded_rounds === 1, "shot consumes attached ammunition once");
    const damage = async () => Number((await pool.query("select local_state_json->'health'->>'totalDamage' damage from campaign_session_encounter_participant where encounter_id=$1 and character_id=$2", [f.encounterId, f.occurrences[0]])).rows[0].damage);
    await until(async () => await damage() === 2, "one ordinary bullet applies its 2 ammunition damage to the unarmored target");
    assert.equal((await pool.query("select count(*)::int n from campaign_session_roll where encounter_id=$1", [f.encounterId])).rows[0].n, 1);
    await player.reload(); await screen(player).getByText("Live", { exact: true }).waitFor();
    assert.equal((await pool.query("select loaded_rounds from campaign_character_item_instance where id=$1", [copies[0].id])).rows[0].loaded_rounds, 1);
    assert.equal(await damage(), 2, "refresh cannot apply firearm damage a second time");
    const reselect = screen(player).getByRole("combobox", { name: /^Attack source/ });
    await reselect.selectOption(await reselect.locator("option").filter({ hasText: /^Screen Pistol/ }).getAttribute("value") ?? "");
    const beforeRecovery = (await pool.query("select current_initiative from campaign_session_encounter_initiative_participant where encounter_id=$1 and character_id=$2", [f.encounterId, f.heroId])).rows[0].current_initiative;
    await screen(player).getByRole("button", { name: "Prepare next shot (0.3 Initiative)", exact: true }).click();
    await until(async () => !(await pool.query("select requires_cycling or requires_recoil_recovery pending from campaign_character_firearm_state where item_instance_id=$1", [gun.instance.id])).rows[0].pending, "one preparation completes cycling and recoil together");
    assert.equal((await pool.query("select current_initiative from campaign_session_encounter_initiative_participant where encounter_id=$1 and character_id=$2", [f.encounterId, f.heroId])).rows[0].current_initiative, beforeRecovery - 0.3);
    assert.equal((await pool.query("select loaded_rounds from campaign_character_item_instance where id=$1", [copies[0].id])).rows[0].loaded_rounds, 1);
    await screenshot(player, "firearm-combined-recovery");
    results.push("Player adopts item settings, loads a magazine, readies and fills a spare from Attack. A missing mode never asks this prepared copy to reload. The actual item editor saves the sole mode; Player distance approval is requested and approved at 25 feet before refresh enables firing without a mode selector, with one Roll, one round consumed and 2 damage applied once. One Prepare next shot completes cycling 0.1 plus recoil 0.2 for 0.3 Initiative without spending ammunition.");
    await player.context().close(); await director.context().close();
  }
  if (include("profile-cleanup")) {
    const f = await db.transaction(async (tx) => {
      const fixture = await screenFixture(tx, "profile-cleanup");
      const [noProfile] = await tx.insert(item).values({
        canonicalId: `SCREEN-PROFILE-NO-PROFILE-${crypto.randomUUID()}`.toUpperCase(), name: "Profile Cleanup Existing No Profile", catalogScope: "equipment", equipmentGroup: "weapon", recordType: "Weapon",
        family: "Fixture", category: "Sword", priceBasis: "per item", createdByUserId: fixture.godId,
      }).returning();
      const [ammunition] = await tx.insert(item).values({
        canonicalId: `SCREEN-PROFILE-AMMO-${crypto.randomUUID()}`.toUpperCase(), name: "Profile Cleanup Cartridge", catalogScope: "inventory", recordType: "Ammunition",
        family: "Fixture", category: "Ammunition", priceBasis: "per round", createdByUserId: fixture.godId,
      }).returning();
      await tx.insert(weaponProfile).values({
        itemId: ammunition.id, profileRecordType: "Ammunition", weaponType: "Cartridge", damageSource: "Ammunition", damage: "8", damageType: "Piercing",
      });
      await tx.insert(campaignInventoryItem).values({ campaignId: fixture.campaignId, itemId: ammunition.id, sortOrder: 2 });
      return { ...fixture, noProfileItemId: noProfile.id, ammunitionId: ammunition.id };
    });
    await pool.query("update weapon_profiles set profile_record_type='Equipment',weapon_type='Legacy Widget',handedness='N/A',damage_source='Ammunition',damage_type='Slashing',range_text='Legacy range',reach_text='Legacy reach',capacity='Legacy capacity',range_mode='melee',distance_unit='feet',reach_distance=5,capacity_rounds=6,ammunition_item_id=$2 where item_id=$1", [f.weaponId, f.ammunitionId]);
    const power = (await pool.query("insert into item_powers(item_id,name,description,trigger,activation_label,initiative_cost,resource_cost_kind,resource_cost_amount,resolution_mode,sort_order) values($1,'Legacy Shared Ability','Preserve this ability.','activated','Activate',1,'shared-charges',1,'automatic',0) returning id", [f.weaponId])).rows[0];
    await pool.query("insert into item_power_resources(item_id,maximum_charges,recharge_notes) values($1,3,'Recharges between scenes.')", [f.weaponId]);
    const profileSnapshot = async (itemId: number) => (await pool.query("select profile_record_type,weapon_type,handedness,damage_source,damage,damage_type,ammunition_item_id,range_text,reach_text,capacity,range_mode,reach_distance,capacity_rounds from weapon_profiles where item_id=$1", [itemId])).rows[0];
    const beforeProfile = await profileSnapshot(f.weaponId), beforeSkillCount = Number((await pool.query("select count(*)::int n from weapon_skill_path_mappings m join weapon_profiles p on p.id=m.weapon_profile_id where p.item_id=$1", [f.weaponId])).rows[0].n);
    const beforePower = (await pool.query("select p.name,p.resource_cost_kind,p.resource_cost_amount,r.maximum_charges,r.recharge_notes from item_powers p join item_power_resources r on r.item_id=p.item_id where p.id=$1", [power.id])).rows[0];
    const author = await login(f.godId, "god", f, true);
    const editor = author.locator(".item-editor");
    const field = (label: string) => editor.getByText(label, { exact: true }).locator("..").locator("select,input,textarea").first();
    const endpointSkillId = f.skillId;
    const secondSkillId = Number((await pool.query("select id from skill where id <> $1 and archived_at is null order by id limit 1", [endpointSkillId])).rows[0].id);
    await author.goto(`${base}/heavens/equipment?item=${f.noProfileItemId}&tab=weapon`); await author.waitForLoadState("networkidle");
    await editor.getByRole("button", { name: "Weapon / Ammunition", exact: true }).click();
    await editor.getByRole("button", { name: "Add Weapon / Ammunition Profile", exact: true }).click();
    await field("Weapon Type").selectOption("Sword");
    await field("Handedness").selectOption("One-Handed");
    await field("Damage Source").selectOption("Weapon");
    await field("Damage").fill("1d8"); await field("Damage Type").fill("Slashing"); await field("Initiative Cost").fill("4");
    await editor.getByText("Save the Weapon Profile before authoring canonical Skill eligibility.", { exact: true }).waitFor();
    await editor.getByRole("button", { name: "Retry Governing Skill Paths", exact: true }).click();
    await editor.getByText("Save the Weapon Profile before authoring canonical Skill eligibility.", { exact: true }).waitFor();
    await editor.getByRole("button", { name: "Save Item", exact: true }).click();
    await editor.getByRole("heading", { name: "Governing Skill Paths", exact: true }).waitFor();
    const endpoint = field("Exact endpoint Skill");
    await endpoint.selectOption(String(endpointSkillId));
    await editor.getByRole("button", { name: "Add Path", exact: true }).click();
    await editor.getByText("Authoring Notes", { exact: true }).locator("..").locator("textarea").first().fill("Immediate post-profile-save path.");
    await editor.getByRole("button", { name: "Approve Valid Path", exact: true }).click();
    await editor.getByRole("button", { name: "Overview", exact: true }).click();
    await field("Description").fill("Ordinary Item edit with pending governance path.");
    await editor.getByRole("button", { name: "Weapon / Ammunition", exact: true }).click();
    await editor.getByRole("heading", { name: "Governing Skill Paths", exact: true }).waitFor();
    const governanceNotes = editor.getByText("Authoring Notes", { exact: true }).locator("..").locator("textarea").first();
    assert.equal(await governanceNotes.inputValue(), "Immediate post-profile-save path.");
    await editor.getByRole("button", { name: "Save Item", exact: true }).click();
    await editor.getByText("Profile Cleanup Existing No Profile was saved.", { exact: true }).waitFor();
    await editor.getByText("Unsaved Governing Skill Path edits.", { exact: true }).waitFor();
    const savePaths = editor.getByRole("button", { name: "Save Governing Skill Paths", exact: true });
    assert.equal(await savePaths.isDisabled(), false);
    await savePaths.click();
    await editor.getByText("Canonical Governing Skill Paths were saved.", { exact: true }).first().waitFor();
    const savedMapping = (await pool.query("select m.endpoint_skill_id,m.review_state,m.notes,m.sort_order,m.firing_mode_id from weapon_skill_path_mappings m join weapon_profiles p on p.id=m.weapon_profile_id where p.item_id=$1", [f.noProfileItemId])).rows[0];
    assert.deepEqual(savedMapping, { endpoint_skill_id: endpointSkillId, review_state: "approved", notes: "Immediate post-profile-save path.", sort_order: 0, firing_mode_id: null });
    await author.getByRole("button", { name: "Variants", exact: true }).click();
    await editor.getByPlaceholder("Variant name", { exact: true }).fill("Profile Cleanup Base Variant");
    await editor.getByRole("button", { name: "Clone as Variant", exact: true }).click();
    await editor.getByText("Profile Cleanup Base Variant", { exact: true }).waitFor();
    const baseVariantId = Number((await pool.query("select id from items where name='Profile Cleanup Base Variant' and parent_item_id=$1", [f.noProfileItemId])).rows[0].id);
    await author.goto(`${base}/heavens/equipment?item=${f.noProfileItemId}&tab=weapon`); await author.waitForLoadState("networkidle");
    await editor.getByRole("button", { name: "Weapon / Ammunition", exact: true }).click();
    await editor.getByRole("heading", { name: "Governing Skill Paths", exact: true }).waitFor();
    assert.equal(await editor.getByText("Authoring Notes", { exact: true }).locator("..").locator("textarea").first().inputValue(), "Immediate post-profile-save path.");
    await editor.getByRole("button", { name: "Add Mode", exact: true }).click();
    await editor.getByRole("button", { name: "Add Mode", exact: true }).click();
    const modeCards = editor.locator(".item-firearm-mode");
    for (const [index, name] of [[0, "Mode One"], [1, "Mode Two"]] as const) {
      const card = modeCards.nth(index);
      await card.getByLabel("Mode Name", { exact: true }).fill(name);
      await card.getByLabel("Cycling Initiative Cost", { exact: true }).fill("0");
      await card.getByLabel("Recoil Reset Initiative Cost", { exact: true }).fill("0");
      await card.getByLabel("Delivery Cadence", { exact: true }).selectOption("per-trigger");
      await card.getByLabel("Rounds Per Cadence", { exact: true }).fill("1");
    }
    await editor.getByRole("button", { name: "Save Item", exact: true }).click();
    await editor.getByText("Profile Cleanup Existing No Profile was saved.", { exact: true }).waitFor();
    await editor.getByRole("heading", { name: "Governing Skill Paths", exact: true }).waitFor();
    const modeIds = (await pool.query<{ id: number }>("select id from weapon_firing_modes where weapon_profile_id=(select id from weapon_profiles where item_id=$1) order by sort_order", [f.noProfileItemId])).rows.map(({ id }) => id);
    assert.equal(modeIds.length, 2);
    await field("Authoring Scope").selectOption(`mode:${modeIds[0]}`);
    await field("Exact endpoint Skill").selectOption(String(secondSkillId));
    await editor.getByRole("button", { name: "Add Path", exact: true }).click();
    await editor.locator(".item-firearm-mode").nth(1).getByRole("button", { name: "Move Up", exact: true }).click();
    assert.equal(await editor.locator(".item-governance-path").filter({ hasText: `Skill #${secondSkillId}` }).count(), 1);
    await editor.getByRole("button", { name: "Save Item", exact: true }).click();
    await editor.getByText("Unsaved Governing Skill Path edits.", { exact: true }).waitFor();
    await editor.getByRole("button", { name: "Save Governing Skill Paths", exact: true }).click();
    await editor.getByText("Canonical Governing Skill Paths were saved.", { exact: true }).first().waitFor();
    const modeMapping = (await pool.query("select firing_mode_id,endpoint_skill_id,sort_order from weapon_skill_path_mappings m join weapon_profiles p on p.id=m.weapon_profile_id where p.item_id=$1 and m.firing_mode_id is not null", [f.noProfileItemId])).rows[0];
    assert.deepEqual(modeMapping, { firing_mode_id: modeIds[0], endpoint_skill_id: secondSkillId, sort_order: 0 });
    await field("Authoring Scope").selectOption("weapon");
    await field("Exact endpoint Skill").selectOption(String(secondSkillId));
    await editor.getByRole("button", { name: "Add Path", exact: true }).click();
    assert.equal(await editor.getByText("Unsaved Governing Skill Path edits.", { exact: true }).count(), 1);
    await editor.getByRole("button", { name: "Overview", exact: true }).click();
    const selectedWeaponCanonicalId = (await pool.query("select canonical_id from items where id=$1", [f.weaponId])).rows[0].canonical_id;
    await author.locator(".skill-library__row").filter({ hasText: selectedWeaponCanonicalId }).click();
    await author.locator(".skills-page__discard-confirm").getByText("Unsaved changes", { exact: true }).waitFor();
    await author.getByRole("button", { name: "Keep Editing", exact: true }).click();
    await editor.getByRole("button", { name: "Weapon / Ammunition", exact: true }).click();
    await editor.getByRole("heading", { name: "Governing Skill Paths", exact: true }).waitFor();
    assert.equal(await editor.locator(".item-governance-path").filter({ hasText: `Skill #${secondSkillId}` }).count(), 1);
    await editor.getByRole("button", { name: "Variants", exact: true }).click();
    await editor.locator(".item-variant-list button").filter({ hasText: "Profile Cleanup Base Variant" }).click();
    await author.locator(".skills-page__discard-confirm").getByText("Unsaved changes", { exact: true }).waitFor();
    await author.locator(".skills-page__discard-confirm").getByRole("button", { name: "Keep Editing", exact: true }).click();
    assert.equal((await pool.query("select id from items where id=$1", [baseVariantId])).rows.length, 1);
    await editor.getByPlaceholder("Variant name", { exact: true }).fill("Profile Cleanup Cancelled Variant");
    const beforeCancelledVariant = Number((await pool.query("select count(*)::int n from items where parent_item_id=$1", [f.noProfileItemId])).rows[0].n);
    await editor.getByRole("button", { name: "Clone as Variant", exact: true }).click();
    await author.locator(".skills-page__discard-confirm").getByText("Unsaved changes", { exact: true }).waitFor();
    await author.locator(".skills-page__discard-confirm").getByRole("button", { name: "Keep Editing", exact: true }).click();
    assert.equal(Number((await pool.query("select count(*)::int n from items where parent_item_id=$1", [f.noProfileItemId])).rows[0].n), beforeCancelledVariant);
    await editor.getByPlaceholder("Variant name", { exact: true }).fill("Profile Cleanup Cancelled Variant");
    await editor.getByRole("button", { name: "Clone as Variant", exact: true }).click();
    await author.locator(".skills-page__discard-confirm").getByRole("button", { name: "Discard Changes", exact: true }).click();
    await editor.getByText("Profile Cleanup Cancelled Variant", { exact: true }).waitFor();
    assert.equal(Number((await pool.query("select count(*)::int n from items where parent_item_id=$1", [f.noProfileItemId])).rows[0].n), beforeCancelledVariant + 1);
    assert.equal((await pool.query("select count(*)::int n from weapon_skill_path_mappings m join weapon_profiles p on p.id=m.weapon_profile_id where p.item_id=$1", [f.noProfileItemId])).rows[0].n, 2);
    await author.goto(`${base}/heavens/equipment`); await author.waitForLoadState("networkidle");
    await author.getByRole("button", { name: "New Equipment", exact: true }).click();
    await field("Name").fill("Profile Cleanup First Save");
    await editor.getByRole("button", { name: "Save Item", exact: true }).click();
    await editor.getByText("Profile Cleanup First Save was saved.", { exact: true }).waitFor();
    await editor.getByRole("button", { name: "Weapon / Ammunition", exact: true }).click();
    await editor.getByRole("button", { name: "Add Weapon / Ammunition Profile", exact: true }).click();
    await field("Weapon Type").selectOption("Sword"); await field("Handedness").selectOption("One-Handed"); await field("Damage Source").selectOption("Weapon");
    await field("Damage").fill("1d6"); await field("Damage Type").fill("Slashing"); await field("Initiative Cost").fill("3");
    await editor.getByRole("button", { name: "Save Item", exact: true }).click();
    await editor.getByRole("heading", { name: "Governing Skill Paths", exact: true }).waitFor();
    assert.equal(await editor.getByText("Unreviewed · Missing path · Requires G.O.D. review. No mapping has been inferred.", { exact: true }).count(), 1);
    await author.goto(`${base}/heavens/equipment?item=${f.weaponId}&tab=weapon`); await author.waitForLoadState("networkidle");
    await editor.getByRole("button", { name: "Weapon / Ammunition", exact: true }).click();
    assert.equal(await editor.getByText("Legacy Range Text", { exact: true }).count(), 0);
    assert.equal(await editor.getByText("Legacy Reach Text", { exact: true }).count(), 0);
    assert.equal(await editor.getByText("Legacy Capacity Text", { exact: true }).count(), 0);
    const profileRecordType = field("Profile Record Type");
    assert.equal(await profileRecordType.inputValue(), "Equipment");
    assert.ok((await profileRecordType.locator("option").allTextContents()).includes("Needs review: Equipment"));
    await field("Reach").fill("6");
    await editor.getByRole("button", { name: "Overview", exact: true }).click();
    await field("Description").fill("Historical profile edited without legacy text rewrite.");
    await editor.getByRole("button", { name: "Save Item", exact: true }).click();
    await editor.getByText("Fixture Shortsword was saved.", { exact: true }).waitFor();
    const afterHistorical = await profileSnapshot(f.weaponId);
    assert.equal(afterHistorical.reach_distance, 6);
    assert.deepEqual(afterHistorical, { ...beforeProfile, reach_distance: 6 });
    assert.equal(Number((await pool.query("select count(*)::int n from weapon_skill_path_mappings m join weapon_profiles p on p.id=m.weapon_profile_id where p.item_id=$1", [f.weaponId])).rows[0].n), beforeSkillCount);
    assert.deepEqual((await pool.query("select p.name,p.resource_cost_kind,p.resource_cost_amount,r.maximum_charges,r.recharge_notes from item_powers p join item_power_resources r on r.item_id=p.item_id where p.id=$1", [power.id])).rows[0], beforePower);
    await author.goto(`${base}/heavens/equipment?item=${f.weaponId}&tab=weapon`); await author.waitForLoadState("networkidle");
    await editor.getByRole("button", { name: "Weapon / Ammunition", exact: true }).click();
    assert.equal(await field("Reach").inputValue(), "6");
    await author.goto(`${base}/heavens/equipment`); await author.waitForLoadState("networkidle");
    await author.getByRole("button", { name: "New Equipment", exact: true }).click();
    await editor.getByLabel("Name", { exact: true }).fill("Profile Cleanup Supported Weapon");
    await editor.getByRole("button", { name: "Weapon / Ammunition", exact: true }).click();
    await editor.getByRole("button", { name: "Add Weapon / Ammunition Profile", exact: true }).click();
    assert.equal(await field("Profile Record Type").inputValue(), "Weapon");
    await field("Weapon Type").selectOption("Sword");
    await field("Damage Source").selectOption("Weapon");
    await field("Damage").fill("1d8");
    await field("Damage Type").fill("Slashing");
    await field("Initiative Cost").fill("4");
    await field("Range Mode").selectOption("melee");
    await field("Distance Unit").fill("feet");
    await field("Reach").fill("5");
    await field("Handedness").evaluate((element) => {
      const select = element as HTMLSelectElement;
      const option = document.createElement("option"); option.value = "twenty"; option.textContent = "twenty"; select.append(option);
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, "twenty"); select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await editor.getByRole("button", { name: "Save Item", exact: true }).click();
    await editor.getByText("Handedness must use a supported authored choice.", { exact: true }).waitFor();
    assert.equal((await pool.query("select count(*)::int n from items where name='Profile Cleanup Supported Weapon'", [])).rows[0].n, 0);
    await field("Handedness").selectOption("One-Handed");
    await editor.getByRole("button", { name: "Save Item", exact: true }).click();
    await editor.getByText("Profile Cleanup Supported Weapon was saved.", { exact: true }).waitFor();
    const newWeaponId = Number((await pool.query("select id from items where name='Profile Cleanup Supported Weapon'")).rows[0].id);
    assert.equal((await profileSnapshot(newWeaponId)).profile_record_type, "Weapon");
    await author.getByRole("searchbox", { name: "Search", exact: true }).fill("Profile Cleanup Supported Weapon");
    await author.locator(".skill-library__row").filter({ hasText: "Profile Cleanup Supported Weapon" }).click();
    await editor.getByRole("button", { name: "Weapon / Ammunition", exact: true }).click();
    assert.equal(await field("Weapon Type").inputValue(), "Sword");
    assert.equal(await field("Handedness").inputValue(), "One-Handed");
    await author.goto(`${base}/heavens/inventory`); await author.waitForLoadState("networkidle");
    await author.getByRole("searchbox", { name: "Search", exact: true }).fill("Profile Cleanup Cartridge");
    await author.locator(".skill-library__row").filter({ hasText: "Profile Cleanup Cartridge" }).click();
    await editor.getByRole("button", { name: "Weapon / Ammunition", exact: true }).click();
    assert.equal(await field("Profile Record Type").inputValue(), "Ammunition");
    assert.equal(await field("Damage Source").inputValue(), "Ammunition");
    await editor.getByRole("button", { name: "Overview", exact: true }).click();
    await field("Description").fill("Inventory profile save/reopen check.");
    await editor.getByRole("button", { name: "Save Item", exact: true }).click();
    await editor.getByText("Profile Cleanup Cartridge was saved.", { exact: true }).waitFor();
    assert.deepEqual(await profileSnapshot(f.ammunitionId), {
      profile_record_type: "Ammunition", weapon_type: "Cartridge", handedness: "", damage_source: "Ammunition", damage: "8", damage_type: "Piercing", ammunition_item_id: null,
      range_text: "", reach_text: "", capacity: "", range_mode: null, reach_distance: null, capacity_rounds: null,
    });
    await author.getByRole("searchbox", { name: "Search", exact: true }).fill("Profile Cleanup Cartridge");
    await author.locator(".skill-library__row").filter({ hasText: "Profile Cleanup Cartridge" }).click();
    await editor.getByRole("button", { name: "Weapon / Ammunition", exact: true }).click();
    assert.equal(await field("Profile Record Type").inputValue(), "Ammunition");
    results.push("ItemWorkspace profile cleanup: Equipment preserves an unknown historical profile choice, legacy range/reach/capacity values, structured reach, Skill paths, ammunition link, and Shared Charges ability/resource; new unsupported Handedness is rejected while supported Weapon choices save/reopen; Inventory uses the same editor and preserves its Ammunition profile on save/reopen.");
    await author.context().close();
  }
  if (include("magazine")) {
    const f = await db.transaction((tx) => screenFixture(tx, "magazine"));
    const director = await login(f.godId, "god", f);
    await pool.query("update campaign_session_encounter set status='completed', completed_at=now() where id=$1", [f.encounterId]);
    await pool.query("update campaign_session_encounter_initiative set status='closed', closed_at=now() where encounter_id=$1", [f.encounterId]);
    const ammo = (await pool.query("insert into items(canonical_id,name,catalog_scope,record_type,family,category,price_basis,credits,created_by_user_id) values($1,'Walkthrough Ammunition','inventory','Ammunition','Test','Test','per round',1,$2) returning id", [`MAG-AMMO-${crypto.randomUUID()}`.toUpperCase(), f.godId])).rows[0];
    await director.goto(`${base}/heavens/equipment`);
    await director.waitForLoadState("networkidle");
    await director.getByRole("button", { name: "New Equipment", exact: true }).click();
    const editor = director.locator(".item-editor");
    await editor.getByLabel("Name", { exact: true }).fill("Walkthrough Magazine");
    await editor.getByLabel("Credits", { exact: true }).fill("5");
    await editor.getByRole("button", { name: "Magazine", exact: true }).click();
    await editor.getByRole("button", { name: "Add Magazine Profile", exact: true }).click();
    await editor.getByLabel("Capacity (Rounds)", { exact: true }).fill("15");
    const ammoSelector = editor.getByLabel("Add Compatible Ammunition", { exact: true });
    await until(async () => await ammoSelector.locator("option").count() > 1, "searchable magazine ammunition");
    await ammoSelector.selectOption(String(ammo.id));
    await editor.getByRole("button", { name: "Save Item", exact: true }).click();
    await until(async () => (await pool.query("select count(*)::int n from items join magazine_profiles on item_id=items.id where name='Walkthrough Magazine'")).rows[0].n === 1, "magazine profile saved");
    const model = (await pool.query("select id from items where name='Walkthrough Magazine'")).rows[0];
    await editor.getByRole("button", { name: "Save Item", exact: true }).waitFor();
    await director.getByRole("searchbox", { name: "Search", exact: true }).fill("Fixture Shortsword");
    const weaponCanonicalId = (await pool.query("select canonical_id from items where id=$1", [f.weaponId])).rows[0].canonical_id;
    await director.locator(".skill-library__row").filter({ hasText: weaponCanonicalId }).click();
    await editor.getByRole("heading", { name: "Fixture Shortsword", exact: true }).waitFor();
    await editor.getByRole("button", { name: "Weapon / Ammunition", exact: true }).click();
    await editor.getByLabel("Reload Type", { exact: true }).selectOption("Magazine");
    const magazineSelector = editor.getByLabel("Add Compatible Magazines", { exact: true });
    await until(async () => await magazineSelector.locator("option").count() > 1, "searchable weapon magazine models");
    await magazineSelector.selectOption(String(model.id));
    await editor.getByRole("button", { name: "Save Item", exact: true }).click();
    await until(async () => (await pool.query("select reload_type from weapon_profiles where item_id=$1", [f.weaponId])).rows[0].reload_type === "Magazine", "weapon reload definition saved");
    assert.equal((await pool.query("select count(*)::int n from weapon_magazines where magazine_item_id=$1", [model.id])).rows[0].n, 1);
    await pool.query("insert into campaign_inventory_item(campaign_id,item_id,sort_order) values($1,$2,1),($1,$3,2)", [f.campaignId, model.id, ammo.id]);
    await director.goto(`${base}/heavens/characters/${f.heroId}`);
    await director.waitForLoadState("networkidle");
    const sections = director.getByRole("navigation", { name: "Character creation sections", exact: true });
    await sections.getByRole("button", { name: /Equipment/ }).click();
    await director.getByLabel("Walkthrough Magazine Quantity", { exact: true }).fill("2");
    await director.getByLabel("Walkthrough Ammunition Quantity", { exact: true }).fill("30");
    await director.getByRole("button", { name: "Save Character", exact: true }).click();
    await until(async () => (await pool.query("select count(*)::int n from campaign_character_item_instance where character_id=$1 and item_id=$2", [f.heroId, model.id])).rows[0].n === 2, "store acquisition creates two exact magazine copies");
    await sections.getByRole("button", { name: /Sheet/ }).click();
    const inventory = director.getByRole("region", { name: "Magazine inventory", exact: true });
    await inventory.getByRole("group").first().waitFor();
    const copies = (await pool.query("select id,loaded_rounds from campaign_character_item_instance where character_id=$1 and item_id=$2 order by id", [f.heroId, model.id])).rows;
    assert.deepEqual(copies.map((row) => row.loaded_rounds), [0, 0]);
    const first = inventory.getByRole("group").filter({ hasText: `Copy #${copies[0].id}` });
    const second = inventory.getByRole("group").filter({ hasText: `Copy #${copies[1].id}` });
    await first.getByRole("button", { name: "Fill to capacity", exact: true }).click();
    await first.getByText("15 / 15 rounds", { exact: true }).waitFor();
    await second.getByRole("spinbutton").fill("4");
    await second.getByRole("button", { name: "Add rounds", exact: true }).click();
    await second.getByText("4 / 15 rounds", { exact: true }).waitFor();
    await director.screenshot({ path: path.join(artifacts, "magazine-inventory.png"), fullPage: true });
    await second.getByRole("spinbutton").fill("1");
    await second.getByRole("button", { name: "Add rounds", exact: true }).click();
    await second.getByText("5 / 15 rounds", { exact: true }).waitFor();
    await first.getByRole("button", { name: "Empty magazine", exact: true }).click();
    await first.getByText("0 / 15 rounds", { exact: true }).waitFor();
    await director.reload(); await director.waitForLoadState("networkidle"); await director.getByRole("navigation", { name: "Character creation sections" }).getByRole("button", { name: /Sheet/ }).click();
    await inventory.getByText("5 / 15 rounds", { exact: true }).waitFor();
    assert.equal((await pool.query("select quantity from campaign_character_item where character_id=$1 and item_id=$2", [f.heroId, ammo.id])).rows[0].quantity, 25);
    results.push("Magazine UI: author capacity/ammunition, link a weapon, acquire two empty copies in the existing store, fill/top up/empty, and preserve separate contents and ammunition conservation after reload.");
    await director.context().close();
  }
  if (include("item-powers")) for (const kind of ["depleted-weapon", "activated", "magic-area"] as const) {
    const { f, copy, power } = await db.transaction(async (tx) => {
      const f = await screenFixture(tx, `item-powers-${kind}`);
      // A shared Charge pool requires individual copies, never the fixture's original quantity stack.
      await tx.delete(campaignCharacterItem).where(and(eq(campaignCharacterItem.characterId, f.heroId), eq(campaignCharacterItem.itemId, f.weaponId)));
      const [copy] = await tx.insert(campaignCharacterItemInstance).values({ characterId: f.heroId, itemId: f.weaponId, equipmentState: "wielded", currentCharges: kind === "depleted-weapon" ? 0 : 3, unitCostCredits: 1 }).returning();
      await tx.insert(itemPowerResource).values({ itemId: f.weaponId, maximumCharges: 3 });
      const [power] = await tx.insert(itemPower).values({ itemId: f.weaponId, name: "Screen Power", description: "Exact shared-pool combat fixture", trigger: kind === "depleted-weapon" ? "weapon-hit" : "activated", activationLabel: "Activate", initiativeCost: kind === "depleted-weapon" ? null : 4, resourceCostKind: "shared-charges", resourceCostAmount: 1,
        resolutionMode: kind === "depleted-weapon" ? "weapon-hit" : kind === "magic-area" ? "fixed-roll" : "automatic", fixedRollTarget: kind === "magic-area" ? 50 : null, sortOrder: 0 }).returning();
      if (kind === "magic-area") {
        await tx.update(item).set({ isMagical: true }).where(eq(item.id, f.weaponId));
        const learned = await addScreenSpell(tx, f, true);
        await tx.insert(itemPowerConstruction).values({ itemPowerId: power.id, schemaVersion: 1, documentJson: JSON.stringify(learned.spell) });
      } else await tx.insert(itemPowerEffect).values({ itemPowerId: power.id, sortOrder: 0, schemaVersion: 2, effectJson: { kind: "condition.apply", name: "Screen Mark", description: "A once-only item power", duration: { kind: "scene" } } });
      return { f, copy, power };
    });
    const director = await login(f.godId, "god", f, true), player = await login(f.playerId, "player", f);
    const view = screen(player), attack = kind === "depleted-weapon", command = attack ? "Attack" : "Item";
    await view.getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: command, exact: true }).click();
    const source = view.getByRole("combobox", { name: `${command} source`, exact: true });
    const value = attack ? `weapon/instance:${copy.id}/${copy.id}` : `item/item-power:${power.id}/${copy.id}`;
    await until(async () => await source.locator(`option[value='${value}']`).count() === 1, "exact owned power source appears");
    await source.selectOption(value);
    if (kind !== "magic-area") await view.getByRole("combobox", { name: "Target", exact: true }).selectOption(String(f.occurrences[0]));
    if (kind !== "activated") {
      await view.getByRole("combobox", { name: "Roll method", exact: true }).selectOption("physical");
      await view.getByLabel("Percentile result", { exact: true }).fill("70");
    }
    await view.getByRole("button", { name: `Commit ${command}${kind === "activated" ? "" : " & Roll"}`, exact: true }).click();
    if (kind === "magic-area") {
      await screen(director).getByRole("region", { name: "Next combat input" }).getByRole("button", { name: /Choose affected participants for/ }).click();
      assert.equal((await pool.query("select current_charges from campaign_character_item_instance where id=$1", [copy.id])).rows[0].current_charges, 3);
      await screen(director).getByRole("combobox", { name: "Affected participants 1", exact: true }).selectOption(String(f.occurrences[0]));
      await screen(director).getByRole("combobox", { name: "Affected participants 2", exact: true }).selectOption(String(f.occurrences[1]));
      await screen(director).getByRole("button", { name: "Confirm affected participants", exact: true }).click();
    } else if (attack) {
      const report = screen(director).getByRole("region", { name: "Attack result report" });
      await report.getByRole("button", { name: "Approve & apply attack", exact: true }).waitFor();
      assert.equal(await report.getByText("Damage to apply", { exact: true }).count(), 1, "A skipped Power cost is not displayed as another attack.");
      await report.getByText("Weapon powers and costs", { exact: true }).click();
      await report.getByText(/Optional Weapon-Hit Power skipped/).waitFor();
      await report.getByRole("button", { name: "Approve & apply attack", exact: true }).click();
    }
    await until(async () => (await declarations(f))[0]?.status === "resolved", `${kind} resolves through the actual controls`);
    const state = async () => ({ copies: (await pool.query("select current_charges from campaign_character_item_instance where id=$1", [copy.id])).rows,
      targets: (await pool.query("select character_id,local_state_json from campaign_session_encounter_participant where encounter_id=$1 and character_id=any($2::int[]) order by character_id", [f.encounterId, f.occurrences])).rows,
      rolls: (await pool.query("select count(*)::int n from campaign_session_roll where encounter_id=$1", [f.encounterId])).rows[0].n });
    const after = await state();
    assert.equal(after.copies[0].current_charges, attack ? 0 : 2);
    assert.equal(after.rolls, kind === "activated" ? 0 : 1);
    for (const target of after.targets) {
      if (kind === "magic-area") assert.equal(target.local_state_json.health.totalDamage, 2);
      else if (target.character_id === f.occurrences[0]) {
        assert.equal(target.local_state_json.conditions.some((entry: { name: string }) => entry.name === "Screen Mark"), !attack);
        if (attack) assert.equal(target.local_state_json.health.totalDamage, 11);
      }
    }
    await player.reload(); await screen(player).getByText("Live", { exact: true }).waitFor();
    assert.deepEqual(await state(), after);
    results.push(`${kind}: exact Item instance, correct original Roll count, explicit targets/area membership, once-only Charges and effects, and refresh-safe state through Player/G.O.D. screens.`);
    await director.context().close(); await player.context().close();
  }
  if (include("spell-area")) for (const selectedVictims of [false, true]) {
    const f = await db.transaction(async (tx) => { const fixture = await screenFixture(tx, `spell-area-${selectedVictims}`); await addScreenSpell(tx, fixture, true); return fixture; });
    const health = async () => ({
      members: (await pool.query("select character_id, local_state_json from campaign_session_encounter_participant where encounter_id=$1 order by character_id", [f.encounterId])).rows,
      caster: (await pool.query("select * from campaign_character_active_health where character_id=$1", [f.heroId])).rows,
      pools: (await pool.query("select * from campaign_character_active_health_pool where character_id=$1 order by pool_key", [f.heroId])).rows,
    });
    const before = await health();
    const director = await login(f.godId, "god", f, true), participant = await login(f.playerId, "player", f);
    const view = screen(participant);
    await view.getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: "Cast", exact: true }).click();
    const source = view.getByRole("combobox", { name: /^Cast source/ });
    await until(async () => await source.locator("option").count() > 1, "area spell loaded");
    await source.selectOption((await source.locator("option").filter({ hasText: /^Screen Arc Bolt/ }).getAttribute("value"))!);
    await until(async () => (await view.innerText()).includes("Mastery:") || (await view.innerText()).includes("unavailable"), "area casting options");
    assert.doesNotMatch(await view.innerText(), /Screen Arc Bolt · unavailable/, await view.innerText());
    await view.getByLabel("Percentile result", { exact: true }).fill("70");
    assert.equal(await view.getByRole("combobox", { name: /^Spell target|^Target|damage location/ }).count(), 0);
    await view.getByRole("button", { name: "Commit Cast & Roll", exact: true }).click();
    await screen(director).getByRole("region", { name: "Next combat input" }).getByRole("button", { name: /Choose affected participants for/ }).click();
    assert.equal((await pool.query("select count(*)::int n from campaign_session_encounter_effect_plan where encounter_id=$1", [f.encounterId])).rows[0].n, 0, "Automatic flow waits for the G.O.D. area decision.");
    if (selectedVictims) {
      await screen(director).getByRole("combobox", { name: "Affected participants 1", exact: true }).selectOption(String(f.occurrences[0]));
      await screen(director).getByRole("combobox", { name: "Affected participants 2", exact: true }).selectOption(String(f.occurrences[1]));
    }
    await screen(director).getByRole("button", { name: "Confirm affected participants", exact: true }).click();
    if (selectedVictims) await screen(director).getByRole("button", { name: "Approve & apply spell", exact: true }).click();
    await until(async () => (await declarations(f))[0]?.status === "resolved", "confirmed area result completes");
    const after = await health();
    if (selectedVictims) {
      assert.deepEqual(after.caster, before.caster); assert.deepEqual(after.pools, before.pools);
      const victims = after.members.filter((entry) => f.occurrences.includes(entry.character_id));
      assert.equal(victims.length, 2);
      assert.equal(victims[0].local_state_json.health.totalDamage, 8);
      assert.equal(victims[1].local_state_json.health.totalDamage, 8);
    } else {
      assert.deepEqual(after, before, "An empty area never applies effects to the caster or another combatant.");
      assert.equal((await pool.query("select count(*)::int n from campaign_session_encounter_effect where encounter_id=$1", [f.encounterId])).rows[0].n, 0);
    }
    await screenshot(director, selectedVictims ? "spell-area-victims" : "spell-area-empty");
    assert.equal((await pool.query("select count(*)::int count from campaign_session_roll where encounter_id=$1", [f.encounterId])).rows[0].count, 1);
    const mana = async () => (await pool.query("select mana_spent from campaign_character_active_mana where character_id=$1 order by system", [f.heroId])).rows;
    const spent = await mana(); assert.ok(spent.some((row) => Number(row.mana_spent) > 0));
    await director.reload(); await screen(director).getByText("Live", { exact: true }).waitFor();
    assert.deepEqual(await health(), after); assert.deepEqual(await mana(), spent);
    results.push(selectedVictims
      ? "G.O.D. selects two AoE victims from the main guide, approves equal 8 damage for both, and refresh preserves one casting Roll, one Mana spend, unchanged caster health and once-only damage."
      : "Automatic flow waits for explicit empty AoE membership; confirmation completes without any effect proposals or caster damage, with one Roll and one Mana spend.");
    await director.context().close(); await participant.context().close();
  }
  if (include("revival-screen")) {
    const f = await db.transaction(async (tx) => {
      const fixture = await screenFixture(tx, "revival-screen");
      await addScreenRecoverySpell(tx, fixture);
      return fixture;
    });
    const { ruleCombatConditionInTransaction } = await import("@/features/tabletop-operations/combat-condition-service");
    await db.transaction((tx) => ruleCombatConditionInTransaction(tx, f.encounterId, f.god, {
      participantId: f.defenderId, status: "dead", expectedRevision: 0, requestKey: crypto.randomUUID(), reason: "Eligible revival target is dead before the cast.",
    }));
    const director = await login(f.godId, "god", f, true), player = await login(f.playerId, "player", f);
    const view = screen(player);
    await view.getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: "Cast", exact: true }).click();
    const source = view.getByRole("combobox", { name: /^Cast source/ });
    await until(async () => await source.locator("option").filter({ hasText: /^Vital Wellspring/ }).count() === 1, "revival spell source loaded");
    await source.selectOption(await source.locator("option").filter({ hasText: /^Vital Wellspring/ }).getAttribute("value") ?? "");
    const targetChooser = view.getByRole("combobox", { name: "Spell target 1", exact: true });
    await targetChooser.waitFor();
    assert.ok(await targetChooser.locator(`option[value='${f.defenderId}']`).count() === 1, "The real options request exposes the eligible NPC revival target.");
    await targetChooser.selectOption(String(f.defenderId));
    const beforeCaster = (await pool.query("select local_state_json from campaign_session_encounter_participant where encounter_id=$1 and character_id=$2", [f.encounterId, f.heroId])).rows[0].local_state_json;
    const beforeOther = (await pool.query("select local_state_json from campaign_session_encounter_participant where encounter_id=$1 and character_id=$2", [f.encounterId, f.occurrences[0]])).rows[0].local_state_json;
    await view.getByLabel("Percentile result", { exact: true }).fill("80");
    await view.getByRole("button", { name: "Commit Cast & Roll", exact: true }).click();
    await until(async () => (await declarations(f)).length === 1, "revival declaration committed through the Player screen");
    const [declaration] = await declarations(f);
    const draft = typeof declaration.draft_json === "string" ? JSON.parse(declaration.draft_json) : declaration.draft_json;
    assert.deepEqual(draft.targetCharacterIds, [f.defenderId]);
    assert.deepEqual(Object.values(draft.sourcePayload.selections.targetGroups).flat(), [f.defenderId]);
    await until(async () => {
      const pending = await pool.query("select status from campaign_session_encounter_pending_action where id=$1", [declaration.pending_action_id]);
      return pending.rows[0]?.status === "completed";
    }, "revival timing completes");
    await screen(director).getByRole("region", { name: "Next combat input" }).getByRole("button", { name: "Rule on Vital Wellspring outcome", exact: true }).click();
    await screen(director).getByRole("button", { name: "Resolve authored revival", exact: true }).waitFor();
    await screen(director).getByLabel("Specific ruling / recovery reason", { exact: true }).fill("The G.O.D. confirms this exact selected revival target.");
    await screen(director).getByRole("button", { name: "Resolve authored revival", exact: true }).click();
    await until(async () => (await pool.query("select local_state_json from campaign_session_encounter_participant where encounter_id=$1 and character_id=$2", [f.encounterId, f.defenderId])).rows[0].local_state_json.combatCondition?.status === "able", "selected NPC revival applies");
    const casterState = (await pool.query("select local_state_json from campaign_session_encounter_participant where encounter_id=$1 and character_id=$2", [f.encounterId, f.heroId])).rows[0].local_state_json;
    assert.deepEqual(casterState, beforeCaster, "The caster was not substituted as the revival target.");
    assert.deepEqual((await pool.query("select local_state_json from campaign_session_encounter_participant where encounter_id=$1 and character_id=$2", [f.encounterId, f.occurrences[0]])).rows[0].local_state_json, beforeOther, "Other participants were not changed by target substitution.");
    const mana = (await pool.query("select mana_spent from campaign_character_active_mana where character_id=$1", [f.heroId])).rows[0].mana_spent;
    assert.ok(Number(mana) > 0, "The cast spent Mana once.");
    const storedDraft = typeof declaration.draft_json === "string" ? JSON.parse(declaration.draft_json) : declaration.draft_json;
    const retry = await db.transaction(async (tx) => {
      const context = await lockPlayerCombatContextInTransaction(tx, f.encounterId, f.heroId, f.playerId);
      return submitCombatChoiceInTransaction(tx, context, { authority: "player", userId: f.playerId, characterId: f.heroId }, storedDraft.sourcePayload.screenRequest);
    });
    assert.equal((retry as { reused?: boolean }).reused, true, "An identical original screen command retry reuses the declaration.");
    await player.reload(); await screen(player).getByText("Live", { exact: true }).waitFor();
    assert.equal((await pool.query("select count(*)::int n from campaign_session_roll where encounter_id=$1", [f.encounterId])).rows[0].n, 1);
    assert.equal((await pool.query("select count(*)::int n from campaign_session_encounter_effect_plan where declaration_id=$1", [declaration.id])).rows[0].n, 1);
    results.push("Player selected Vital Wellspring's exact NPC target from the real options request, committed the matching declaration, G.O.D. resolved authored revival, the NPC recovered without caster substitution, Mana was spent once, and refresh preserved one Roll.");
    await director.context().close(); await player.context().close();
  }
  if (include("defense")) {
    const f = await db.transaction((tx) => screenFixture(tx, "defense"));
    await pool.query("update campaign_session_encounter_initiative_participant set participation_status='holding' where encounter_id=$1 and character_id=$2", [f.encounterId, f.occurrences[0]]);
    const director = await login(f.godId, "god", f), participant = await login(f.playerId, "player", f);
    await screen(participant).getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: "Defend", exact: true }).click();
    assert.equal(await screen(participant).getByRole("button", { name: /^Commit response/ }).count(), 0);
    assert.ok((await screen(participant).innerText()).includes("response"));
    await chooseAttack(participant, f.occurrences[0], "20"); await commitAttack(participant);
    await until(async () => (await declarations(f)).length === 1, "attack awaiting legitimate response");
    await selectGod(director, "Fixture Goblin 1");
    await screen(director).getByText("G.O.D. controls for Fixture Goblin 1", { exact: true }).click();
    assert.equal(await screen(director).getByRole("button", { name: "Allow response", exact: true }).count(), 0, "Initiative eligibility requires no G.O.D. permission");
    await screen(director).getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: "Defend", exact: true }).click();
    await until(async () => await screen(director).getByRole("combobox", { name: "Respond to", exact: true }).locator("option").count() > 1, "rules-eligible Creature response");
    await screen(director).getByRole("combobox", { name: /^Defense/ }).selectOption("block");
    await screen(director).getByRole("combobox", { name: /^Defending weapon/ }).selectOption({ label: "Shortsword" });
    await screen(director).getByLabel("Percentile result", { exact: true }).fill("90");
    await screen(director).getByRole("button", { name: "Commit response & Roll", exact: true }).click();
    const action = (await declarations(f))[0];
    await until(async () => (await pool.query("select count(*)::int n from campaign_session_encounter_reaction where pending_action_id=$1", [action.pending_action_id])).rows[0].n === 1, "defense committed");
    await advanceAction(director, action.pending_action_id);
    await screen(director).getByRole("region", { name: "Next combat input" }).getByRole("button", { name: /^Prepare .* result$/ }).click();
    await until(async () => ["cancelled", "resolved"].includes((await declarations(f))[0].status), "successful defense resolved");
    const local = (await pool.query("select local_state_json from campaign_session_encounter_participant where character_id=$1", [f.occurrences[0]])).rows[0].local_state_json;
    assert.equal(local?.health?.totalDamage ?? 0, 0);
    results.push("An unavailable defense is blocked; a rules-eligible direct Creature Block uses its authored weapon and Roll, and prevents damage.");
    const firstResponse = (await pool.query("select id from campaign_session_encounter_responder_opportunity where declaration_id=$1 and responder_character_id=$2", [action.id, f.occurrences[0]])).rows[0].id;
    // Establish a later ordinary opportunity while retaining the mounted defense screen.
    for (const [id, status] of [[f.occurrences[0], "holding"], [f.heroId, "active"]]) await pool.query("update campaign_session_encounter_initiative_participant set current_initiative=18, participation_status=$3 where encounter_id=$1 and character_id=$2", [f.encounterId, id, status]);
    await pool.query("update campaign_session_encounter_initiative set timeline_initiative=18 where encounter_id=$1", [f.encounterId]);
    await screen(participant).getByRole("button", { name: "Refresh", exact: true }).click();
    await chooseAttack(participant, f.occurrences[0], "20"); await commitAttack(participant);
    const defenseView = screen(director);
    await until(async () => {
      const value = await defenseView.getByRole("combobox", { name: "Respond to", exact: true }).inputValue();
      return !!value && value !== String(firstResponse);
    }, "new response opportunity replaces the completed one");
    assert.equal(await defenseView.getByRole("combobox", { name: "Defense", exact: true }).inputValue(), "dodge");
    assert.equal(await defenseView.getByLabel("Percentile result", { exact: true }).inputValue(), "", "A new defense never reuses the previous physical Roll.");
    await defenseView.getByRole("combobox", { name: "Defense", exact: true }).selectOption("block");
    assert.equal(await defenseView.getByRole("combobox", { name: "Defending weapon", exact: true }).inputValue(), "", "The previous defending weapon is not silently reused.");
    await defenseView.getByRole("combobox", { name: "Defending weapon", exact: true }).selectOption({ label: "Shortsword" });
    await defenseView.getByLabel("Percentile result", { exact: true }).fill("90");
    await defenseView.getByRole("button", { name: "Commit response & Roll", exact: true }).click();
    const next = (await declarations(f)).find((entry) => entry.id !== action.id)!;
    await until(async () => (await pool.query("select count(*)::int n from campaign_session_encounter_reaction where pending_action_id=$1", [next.pending_action_id])).rows[0].n === 1, "fresh defense creates its own response");
    await advanceAction(director, next.pending_action_id);
    await defenseView.getByRole("region", { name: "Next combat input" }).getByRole("button", { name: /^Prepare .* result$/ }).click();
    await until(async () => ["cancelled", "resolved"].includes((await declarations(f)).find((entry) => entry.id === next.id)!.status), "second defended action resolves independently");
    assert.equal((await pool.query("select count(*)::int n from campaign_session_roll where encounter_id=$1", [f.encounterId])).rows[0].n, 4);
    results.push("A second defense on the mounted screen gets a fresh opportunity, defense choice, weapon selection and physical Roll; both attacks retain separate original and defense Rolls.");
    await director.context().close(); await participant.context().close();
  }
  if (include("incapacitated-xp")) {
    const f = await db.transaction((tx) => screenFixture(tx, "incapacitated-xp"));
    const creatureId = f.occurrences[0];
    const snapshot = { ...f.creatureSnapshot, core: { ...f.creatureSnapshot.core, killXp: 3 } };
    await pool.query("update campaign_session_encounter_participant set creature_snapshot_json=$3 where encounter_id=$1 and character_id=$2", [f.encounterId, creatureId, JSON.stringify(snapshot)]);
    const { ruleCombatConditionInTransaction } = await import("@/features/tabletop-operations/combat-condition-service");
    await db.transaction((tx) => ruleCombatConditionInTransaction(tx, f.encounterId, f.god, { participantId: creatureId,
      status: "incapacitated", initiativeTreatment: "preserve", expectedRevision: 0, requestKey: crypto.randomUUID(), reason: "Incapacitated Creature remains alive." }));
    const director = await login(f.godId, "god", f);
    await screen(director).getByRole("link", { name: "End Combat & XP", exact: true }).click();
    const reward = screen(director).locator("fieldset").filter({ has: director.locator("legend", { hasText: "Fixture Goblin 1" }) });
    await reward.getByLabel("Include this Creature award").check();
    assert.match(await reward.locator("legend").innerText(), /incapacitated.*3 XP/);
    await reward.getByLabel("Rowan", { exact: true }).check();
    await screen(director).getByRole("button", { name: "Preview closeout", exact: true }).click();
    await screen(director).getByText("Rowan: +3 XP", { exact: true }).waitFor();
    await screen(director).getByRole("button", { name: "End Combat & award XP", exact: true }).click();
    await until(async () => (await pool.query("select status from campaign_session_encounter where id=$1", [f.encounterId])).rows[0].status === "completed", "incapacitated Creature XP closeout");
    assert.equal((await pool.query("select experience from campaign_character_profile where character_id=$1", [f.heroId])).rows[0].experience, 15);
    assert.equal((await pool.query("select local_state_json from campaign_session_encounter_participant where encounter_id=$1 and character_id=$2", [f.encounterId, creatureId])).rows[0].local_state_json.combatCondition.status, "incapacitated");
    await director.reload(); await screen(director).waitFor();
    assert.equal((await pool.query("select count(*)::int n from campaign_session_encounter_reward_decision where encounter_id=$1", [f.encounterId])).rows[0].n, 1);
    results.push("The XP screen includes an incapacitated living Creature, previews and awards its authored 3 XP once, and preserves incapacitation after closeout and reload.");
    await director.context().close();
  }
  if (include("ended-xp")) {
    const f = await db.transaction((tx) => screenFixture(tx, "ended-xp"));
    const creatureId = f.occurrences[0];
    const snapshot = { ...f.creatureSnapshot, core: { ...f.creatureSnapshot.core, killXp: 3 } };
    await pool.query("update campaign_session_encounter_participant set creature_snapshot_json=$3 where encounter_id=$1 and character_id=$2", [f.encounterId, creatureId, JSON.stringify(snapshot)]);
    const { ruleCombatConditionInTransaction } = await import("@/features/tabletop-operations/combat-condition-service");
    await db.transaction((tx) => ruleCombatConditionInTransaction(tx, f.encounterId, f.god, { participantId: creatureId,
      status: "dead", expectedRevision: 0, requestKey: crypto.randomUUID(), reason: "Recorded fatal injury in the disposable fixture." }));
    const director = await login(f.godId, "god", f);
    await screen(director).getByRole("button", { name: "Force end combat", exact: true }).click();
    const dialog = director.getByRole("dialog", { name: "End combat now?", exact: true });
    await dialog.getByRole("button", { name: "End combat now", exact: true }).click();
    await until(async () => (await pool.query("select status from campaign_session_encounter where id=$1", [f.encounterId])).rows[0].status === "completed", "encounter closes before awarding XP");
    await screen(director).getByRole("link", { name: "XP & award history", exact: true }).click();
    const reward = screen(director).locator("fieldset").filter({ has: director.locator("legend", { hasText: "Fixture Goblin 1" }) });
    await reward.getByLabel("Include this Creature award").check();
    assert.match(await reward.locator("legend").innerText(), /dead.*3 XP/);
    await reward.getByLabel("Rowan", { exact: true }).check();
    await screen(director).getByRole("button", { name: "Preview XP awards", exact: true }).click();
    await screen(director).getByText("Rowan: +3 XP", { exact: true }).waitFor();
    await screen(director).getByRole("button", { name: "Award selected XP", exact: true }).click();
    await until(async () => (await pool.query("select experience from campaign_character_profile where character_id=$1", [f.heroId])).rows[0].experience === 15, "XP is awarded after combat has ended");
    assert.equal((await pool.query("select experience from campaign_character_profile where character_id=$1", [f.heroId])).rows[0].experience, 15);
    assert.equal((await pool.query("select local_state_json from campaign_session_encounter_participant where encounter_id=$1 and character_id=$2", [f.encounterId, creatureId])).rows[0].local_state_json.combatCondition.status, "dead");
    await director.reload(); await screen(director).getByText("Live", { exact: true }).waitFor();
    assert.equal((await pool.query("select count(*)::int n from campaign_session_encounter_reward_decision where encounter_id=$1", [f.encounterId])).rows[0].n, 1);
    await screen(director).getByRole("link", { name: "XP & award history", exact: true }).click();
    await screen(director).getByText(/already awarded/).first().waitFor();
    assert.equal(await screen(director).getByLabel("Include this Creature award").count(), 0);
    await screenshot(director, "ended-creature-xp");
    results.push("After the G.O.D. ends combat, the header opens XP and award history. A dead Creature's authored 3 XP is awarded once, with completed encounter and death preserved; reload shows already awarded.");

    await director.context().close();
  }
  if (include("attack-report-alerts")) {
    const f = await db.transaction((tx) => screenFixture(tx, "attack-report-alerts"));
    const creatureId = f.occurrences[0];
    await pool.query("update campaign_session_encounter_initiative_participant set participation_status='active', current_initiative=case when character_id=$2 then 200 else 1 end where encounter_id=$1 and character_id in ($2,$3)", [f.encounterId, f.heroId, creatureId]);
    await pool.query("update campaign_session_encounter_initiative set timeline_initiative=200 where encounter_id=$1", [f.encounterId]);
    const slime = { ...f.creatureSnapshot, core: { ...f.creatureSnapshot.core, totalHp: 10 }, hpPools: [{ canonicalId: "body", poolName: "Body", maximumHp: 10 }],
      hitLocations: Array.from({ length: 10 }, (_, hitLocationNumber) => ({ hitLocationNumber, locationName: "Body", hpPoolCanonicalId: "body", naturalArmor: null, soak: null })) };
    await pool.query("update campaign_session_encounter_participant set creature_snapshot_json=$3 where encounter_id=$1 and character_id=$2", [f.encounterId, creatureId, JSON.stringify(slime)]);
    // 3 authored + 5 STR + 2 additional successes reaches the exact Body threshold.
    await pool.query("update weapon_profiles set damage='3' where item_id=$1", [f.weaponId]);
    const director = await login(f.godId, "god", f, true), participant = await login(f.playerId, "player", f);
    await chooseAttack(participant, creatureId, "72"); await commitAttack(participant);
    const report = screen(director).getByRole("region", { name: "Attack result report", exact: true });
    await report.waitFor();
    assert.match(await report.innerText(), /Body/); assert.match(await report.innerText(), /Damage to apply\s+10/);
    const local = async (id: number) => (await pool.query("select local_state_json from campaign_session_encounter_participant where encounter_id=$1 and character_id=$2", [f.encounterId, id])).rows[0].local_state_json;
    assert.equal((await local(creatureId)).health?.totalDamage ?? 0, 0, "Automatic flow prepares the report without damaging the target.");
    assert.equal(await screen(director).getByRole("button", { name: "Approve & apply attack", exact: true }).count(), 1);
    await screenshot(director, "attack-report-desktop"); await screenshot(director, "attack-report-narrow", 390);
    await report.getByRole("button", { name: "Approve & apply attack", exact: true }).click();
    await until(async () => (await local(creatureId)).combatCondition?.status === "incapacitated", "whole-body condition applied with the approved damage");
    assert.deepEqual((await local(creatureId)).health, { totalDamage: 10, poolDamage: { body: 10 } }, "Blank Slime protection blocks no damage; approval changes both its total and Body HP.");
    const godAlerts = screen(director).getByRole("region", { name: "Combat condition alerts", exact: true });
    const playerAlerts = screen(participant).getByRole("region", { name: "Combat condition alerts", exact: true });
    await godAlerts.getByRole("heading", { name: "Fixture Goblin 1: Incapacitated", exact: true }).waitFor();
    assert.equal(await playerAlerts.getByRole("heading").count(), 0, "A Player does not receive another actor's private condition alert.");
    results.push("An ordinary Player attack runs to one report automatically; one approval applies whole-body incapacitation and alerts the G.O.D.");

    // Use real declarations for the NPC's attacks. The screens still prepare and
    // approve each result, while these setup calls isolate the threshold cases.
    const { createActionDeclarationDraftInTransaction, lockActionDeclarationInTransaction, commitActionDeclarationInTransaction } = await import("@/features/tabletop-operations/action-declaration-service");
    const { completionDraft } = await import("./fixtures/combat-completion-service-fixture");
    const { publishTabletopInvalidationInTransaction } = await import("@/features/tabletop-operations/tabletop-live-events");
    const { readActiveHealthInTransaction } = await import("@/features/active-state/active-health-service");
    const health = await db.transaction((tx) => readActiveHealthInTransaction(tx, f.heroId, "race"));
    for (const [poolKey, rolled, remaining] of [["leftArm", 72, 0], ["head", 70, -1]] as const) {
      await screen(director).getByRole("checkbox", { name: "Automatic flow", exact: true }).uncheck();
      const maximum = health.anatomy.pools.find((entry) => entry.key === poolKey)!.maximumHp!;
      await pool.query("update campaign_session_encounter_initiative_participant set participation_status='active', current_initiative=case when character_id=$2 then 200 else 1 end where encounter_id=$1 and character_id in ($2,$3)", [f.encounterId, f.defenderId, f.heroId]);
      await pool.query("update campaign_session_encounter_initiative set timeline_initiative=200 where encounter_id=$1", [f.encounterId]);
      await pool.query("update weapon_profiles set damage=$2 where item_id=$1", [f.weaponId, String(maximum - remaining - 2 - 5)]);
      await db.transaction(async (tx) => {
        const id = await createActionDeclarationDraftInTransaction(tx, f.context, f.god, { ...completionDraft(f.defenderId, f.heroId), sourceKind: "weapon", weaponItemId: f.weaponId });
        await lockActionDeclarationInTransaction(tx, f.context, f.god, id);
        await commitActionDeclarationInTransaction(tx, f.context, f.god, id, { method: "entered", enteredTotal: rolled });
        await publishTabletopInvalidationInTransaction(tx, { campaignId: f.campaignId, sessionId: f.sessionId, sceneId: f.sceneId, encounterId: f.encounterId, characterIds: [], category: "action" });
      });
      await screen(director).getByRole("button", { name: "Refresh", exact: true }).click();
      await screen(director).getByRole("checkbox", { name: "Automatic flow", exact: true }).check();
      await report.waitFor(); await report.getByRole("button", { name: "Approve & apply attack", exact: true }).click();
      const title = poolKey === "head" ? "Rowan: Death" : "Rowan: Left Arm incapacitated";
      await godAlerts.getByRole("heading", { name: title, exact: true }).waitFor();
      await playerAlerts.getByRole("heading", { name: title, exact: true }).waitFor();
      if (poolKey === "leftArm") {
        await playerAlerts.getByRole("button", { name: "Acknowledge", exact: true }).click();
        await participant.reload(); await screen(participant).getByText("Live", { exact: true }).waitFor();
        assert.equal(await playerAlerts.getByRole("heading").count(), 0, "Acknowledged alerts stay dismissed after reload.");
        await screen(participant).getByText("Left Arm incapacitated — this limb cannot be used.", { exact: true }).waitFor();
        await director.reload(); await screen(director).getByText("Live", { exact: true }).waitFor();
        await godAlerts.getByRole("heading", { name: title, exact: true }).waitFor();
      }
    }
    assert.equal((await local(f.heroId)).combatCondition.status, "dead");
    await screenshot(participant, "player-death-alert", 390);
    results.push("Limb incapacity and head death alert both roles live; acknowledgement survives reload and leaves the current condition visible.");
    await director.context().close(); await participant.context().close();
  }
  if (include("npc-surrender")) {
    const f = await db.transaction((tx) => screenFixture(tx, "npc-surrender"));
    const director = await login(f.godId, "god", f), player = await login(f.playerId, "player", f);
    await selectGod(director, "Sentry NPC");
    await screen(director).getByRole("button", { name: "Surrender / Yield", exact: true }).click();
    await until(async () => (await pool.query("select local_state_json->'combatParticipation'->>'departureKind' kind from campaign_session_encounter_participant where encounter_id=$1 and character_id=$2", [f.encounterId, f.defenderId])).rows[0].kind === "surrender", "NPC surrender is recorded");
    await screen(director).getByRole("link", { name: "End Combat & XP", exact: true }).click();
    const award = screen(director).locator("fieldset").filter({ has: director.locator("legend", { hasText: "Sentry NPC" }) });
    await award.getByLabel("Include this NPC award").check();
    await award.getByLabel("NPC XP per selected Character", { exact: true }).fill("6");
    await award.getByLabel("NPC Fame per selected Character", { exact: true }).fill("2");
    await award.getByLabel("Rowan", { exact: true }).check();
    await screen(director).getByRole("button", { name: "Preview closeout", exact: true }).click();
    await screen(director).getByText("Rowan: +6 XP", { exact: true }).waitFor();
    await screen(director).getByText("Rowan: +2 Fame", { exact: true }).waitFor();
    await screen(director).getByRole("button", { name: "End Combat & award XP / Fame", exact: true }).click();
    await player.waitForURL((url) => url.pathname === "/realms/tabletop" && url.searchParams.get("character") === String(f.heroId) && !url.searchParams.has("combat"));
    const profile = (await pool.query("select fame,experience from campaign_character_profile where character_id=$1", [f.heroId])).rows[0];
    assert.equal(profile.fame, 2); assert.equal(profile.experience, 18);
    await director.reload(); await screen(director).getByText("Live", { exact: true }).waitFor();
    await screen(director).getByRole("link", { name: "XP & award history", exact: true }).click();
    await screen(director).getByText(/Sentry NPC.*surrendered.*already awarded/).waitFor();
    assert.equal(await screen(player).count(), 0);
    assert.equal((await pool.query("select count(*)::int n from campaign_session_encounter_reward_decision where encounter_id=$1", [f.encounterId])).rows[0].n, 1);
    await screenshot(director, "npc-surrender-awards");
    results.push("G.O.D. records NPC Surrender / Yield, selects 6 XP and 2 Fame, previews and closes combat atomically. The Player returns to their exact Tabletop view. Reconnect shows one award and retains surrender.");
    await director.context().close(); await player.context().close();
  }
  for (const forced of [false, true]) if (include(forced ? "kill-fame-force-end" : "kill-fame-closeout")) {
    const { f, gun } = await db.transaction(async (tx) => { const f = await screenFixture(tx, "kill-fame-closeout"); return { f, gun: await addScreenFirearm(tx, f) }; });
    await pool.query("update campaign_session_encounter_participant set creature_snapshot_json=$3 where encounter_id=$1 and character_id=$2",
      [f.encounterId, f.occurrences[0], JSON.stringify({ ...f.creatureSnapshot, core: { ...f.creatureSnapshot.core, challengeRating: 4, killXp: 3 } })]);
    await pool.query("update weapon_profiles set damage='6' where id=(select loaded_ammunition_profile_id from campaign_character_firearm_state where item_instance_id=$1)", [gun.instance.id]);
    const director = await login(f.godId, "god", f, true), player = await login(f.playerId, "player", f);
    const source = screen(player).getByRole("combobox", { name: /^Attack source/ });
    await source.selectOption(await source.locator("option").filter({ hasText: /^Screen Pistol/ }).getAttribute("value") ?? "");
    await screen(player).getByRole("combobox", { name: /^Target/ }).selectOption(String(f.occurrences[0]));
    await confirmPlayerDistance(director, player);
    await screen(player).getByLabel("Percentile result", { exact: true }).fill("100");
    await screen(player).getByRole("button", { name: "Fire & Roll", exact: true }).click();
    await screen(director).getByRole("button", { name: /^Rule on Screen Pistol/ }).click();
    await screen(director).getByLabel("Critical / attack ruling", { exact: true }).fill("The critical applies the shown damage, with no additional consequence.");
    if (!forced) {
      await screenshot(director, "critical-ruling-desktop");
      await screenshot(director, "critical-ruling-mobile", 390);
      await director.setViewportSize({ width: 1365, height: 1000 });
    }
    await screen(director).getByRole("button", { name: "Confirm attack ruling & apply result", exact: true }).click();
    await until(async () => (await pool.query("select fame from campaign_character_profile where character_id=$1", [f.heroId])).rows[0].fame === 4, "the actual killing shot awards CR Fame");
    await until(async () => (await pool.query("select count(*)::int n from campaign_session_encounter_action_declaration where encounter_id=$1 and status not in ('resolved','cancelled','abandoned')", [f.encounterId])).rows[0].n === 0, "the killing action completes on the first confirmation");
    assert.equal((await pool.query("select count(*)::int n from campaign_session_encounter_effect where encounter_id=$1 and status='declined'", [f.encounterId])).rows[0].n, 0);
    await director.reload(); await screen(director).getByText("Live", { exact: true }).waitFor();
    assert.equal(await screen(director).getByRole("button", { name: /^Rule on Screen Pistol|^Prepare Rowan's Screen Pistol.* result$/ }).count(), 0);
    await screen(director).getByRole("link", { name: "End Combat & XP", exact: true }).click();
    const closeout = screen(director).locator("#combat-closeout");
    const award = closeout.locator("fieldset").filter({ has: director.locator("legend", { hasText: "Fixture Goblin 1" }) });
    await award.getByLabel("Include this Creature award").check();
    await award.getByLabel("Rowan", { exact: true }).check();
    if (forced) {
      await screen(director).getByRole("button", { name: "Force end combat", exact: true }).click();
      await director.getByRole("dialog", { name: "End combat now?", exact: true }).getByRole("button", { name: "End combat now", exact: true }).click();
      await until(async () => (await pool.query("select status from campaign_session_encounter where id=$1", [f.encounterId])).rows[0].status === "completed", "force end retains applied critical-shot damage");
    } else assert.equal(await closeout.getByRole("button", { name: "Open remaining result", exact: true }).count(), 0);
    await closeout.getByRole("button", { name: forced ? "Preview XP awards" : "Preview closeout", exact: true }).click();
    await closeout.getByRole("button", { name: forced ? "Award selected XP" : "End Combat & award XP", exact: true }).click();
    await player.waitForURL((url) => url.pathname === "/realms/tabletop" && url.searchParams.get("character") === String(f.heroId) && !url.searchParams.has("combat"));
    await until(async () => (await pool.query("select experience from campaign_character_profile where character_id=$1", [f.heroId])).rows[0].experience === 15, "selected XP award commits after combat ends");
    await screen(director).getByText("15", { exact: true }).waitFor();
    const profile = (await pool.query("select fame,experience from campaign_character_profile where character_id=$1", [f.heroId])).rows[0];
    assert.equal(profile.fame, 4); assert.equal(profile.experience, 15);
    assert.equal((await pool.query("select loaded_rounds from campaign_character_firearm_state where item_instance_id=$1", [gun.instance.id])).rows[0].loaded_rounds, 2);
    assert.equal((await pool.query("select count(*)::int n from campaign_session_roll where encounter_id=$1", [f.encounterId])).rows[0].n, 1);
    assert.equal((await pool.query("select count(*)::int n from campaign_session_encounter_reward_decision where encounter_id=$1", [f.encounterId])).rows[0].n, 2);
    await screenshot(director, forced ? "kill-fame-force-end" : "kill-fame-closeout");
    results.push(forced
      ? "Force end preserves a critical shot's applied damage and CR 4 Fame, closes without the cancelled-plan constraint error, returns the Player to Tabletop, and awards 3 XP afterward. One original Roll and one round spent."
      : "A Player's Double Ott firearm kill completes with one G.O.D. ruling confirmation and no Decline workaround. Reload does not repeat the result. CR 4 Fame, 3 closeout XP, one original Roll and one round spent are preserved.");
    await director.context().close(); await player.context().close();
  }
  assert.deepEqual(errors, [], "No browser runtime errors");
  await writeFile(resultPath, JSON.stringify({ passed: results, errors }, null, 2));
  console.log(JSON.stringify({ passed: results }, null, 2));
} catch (error) {
  for (const [index, context] of (browser?.contexts() ?? []).entries()) for (const [pageIndex, page] of context.pages().entries()) {
    await page.screenshot({ path: path.join(artifacts, `failure-${index}-${pageIndex}.png`), fullPage: true }).catch(() => {});
    await writeFile(path.join(artifacts, `failure-${index}-${pageIndex}.txt`), await page.locator("body").innerText().catch(() => "unreadable"));
  }
  await writeFile(resultPath, JSON.stringify({ passed: results, errors, failure: String(error) }, null, 2));
  throw error;
} finally {
  await browser?.close();
  if (server?.pid) { try { if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); else server.kill("SIGTERM"); } catch {} }
  await writeFile(path.join(artifacts, "server.log"), serverLog);
  await pool.end();
}
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
