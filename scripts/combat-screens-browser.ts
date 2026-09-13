import assert from "node:assert/strict";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Page, type Browser } from "playwright-core";
import { db, pool } from "@/db";
import { screenFixture, addScreenSpell, addScreenFirearm, SCREEN_PASSWORD } from "./fixtures/combat-screens-browser-fixture";
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
  const signedIn = await context.request.post(`${base}/api/auth/sign-in/email`, { headers: { Origin: base }, data: { email: `${id}@example.invalid`, password: SCREEN_PASSWORD } });
  assert.equal(signedIn.status(), 200, "The disposable account authenticates through the real auth endpoint.");
  await page.goto(`${base}/${role === "god" ? "heavens" : "realms"}/tabletop?combat=${f.encounterId}${role === "player" ? `&character=${f.heroId}` : ""}`);
  await screen(page).waitFor(); await until(() => screen(page).getByRole("button", { name: "Refresh", exact: true }).isEnabled(), "combat first read");
  await screen(page).getByText("Live", { exact: true }).waitFor();
  if (role === "god" && !automatic && await screen(page).getByRole("checkbox", { name: "Automatic flow", exact: true }).count()) await screen(page).getByRole("checkbox", { name: "Automatic flow", exact: true }).uncheck();
  return page;
}
async function selectGod(page: Page, name: string) { await screen(page).getByRole("region", { name: "Combatants", exact: true }).getByRole("button", { name: new RegExp(`^${name}`) }).click(); await screen(page).getByRole("region", { name: "Selected combatant detail" }).getByRole("heading", { name, exact: true }).waitFor(); await until(() => screen(page).getByRole("button", { name: "Refresh", exact: true }).isEnabled(), "selected information refreshed"); }
async function chooseAttack(page: Page, target: number, roll = "80", source = "Fixture Shortsword") {
  const view = screen(page);
  await view.getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: "Attack", exact: true }).click();
  await until(async () => await view.getByRole("combobox", { name: /^Attack source/ }).locator("option").count() > 1, "owned Attack source");
  await view.getByRole("combobox", { name: /^Attack source/ }).selectOption({ label: source });
  await view.getByRole("combobox", { name: /^Target/ }).selectOption(String(target));
  await view.getByRole("combobox", { name: "Roll method", exact: true }).selectOption("physical");
  await view.getByLabel("Percentile result", { exact: true }).fill(roll);
}
async function commitAttack(page: Page) { await screen(page).getByRole("button", { name: "Commit Attack & Roll", exact: true }).click(); }
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
    env: { ...process.env, NODE_ENV: "development", BETTER_AUTH_URL: base, BETTER_AUTH_SECRET: "disposable-screen-auth-secret-with-more-than-32-characters", NEXT_TELEMETRY_DISABLED: "1", SERRIAN_TEST_NEXT_DIST_DIR: ".next-combat-screens-browser" }, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout?.on("data", (chunk) => { serverLog += String(chunk); }); server.stderr?.on("data", (chunk) => { serverLog += String(chunk); });
  await until(async () => { try { return (await fetch(`${base}/login`)).ok; } catch { return false; } }, "isolated Next server", 150_000);
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
    await chooseAttack(director, f.heroId, canRespond ? "70" : "28", "Shortsword");
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
    results.push(`Initiative automatically offers the Player a choice without G.O.D. permission: ${canRespond ? "no-reaction then Hold preserves 20 Initiative and the original attack applies 6 damage" : "movement completes while the original attack remains pending, then Hold preserves 19 Initiative and the attack misses"}. One original Roll, no approval prompt, no timing reset.`);
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
  for (const mode of ["spell", "firearm"] as const) {
    if (!include(mode)) continue;
    const setup = await db.transaction(async (tx) => { const fixture = await screenFixture(tx, mode); const extra = mode === "spell" ? await addScreenSpell(tx, fixture) : await addScreenFirearm(tx, fixture); return { fixture, extra }; });
    const fixture = setup.fixture, director = await login(fixture.godId, "god", fixture), participant = await login(fixture.playerId, "player", fixture);
    const view = screen(participant);
    await view.getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: mode === "spell" ? "Cast" : "Attack", exact: true }).click();
    await until(async () => await view.getByRole("combobox", { name: mode === "spell" ? /^Cast source/ : /^Attack source/ }).locator("option").count() > 1, `${mode} source loaded`);
    const sourceControl = view.getByRole("combobox", { name: mode === "spell" ? /^Cast source/ : /^Attack source/ });
    await sourceControl.selectOption((await sourceControl.locator("option").filter({ hasText: mode === "spell" ? /^Screen Arc Bolt$/ : /^Screen Pistol/ }).getAttribute("value"))!);
    if (mode !== "spell") await view.getByRole("combobox", { name: /^Target/ }).selectOption(String(fixture.occurrences[0]));
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
    await setup.getByRole("button", { name: "Ready firearm", exact: true }).click();
    await until(async () => (await pool.query("select readied from campaign_character_firearm_state where item_instance_id=$1", [gun.instance.id])).rows[0]?.readied === true, "ordinary equipment readies the owned firearm");
    assert.equal((await pool.query("select quantity from campaign_character_item where character_id=$1 and item_id=$2", [f.heroId, profile.ammunition_item_id])).rows[0].quantity, 4);
    await setup.screenshot({ path: path.join(artifacts, "firearm-equipment-setup-guided.png") });
    results.push("Player initializes an exact empty firearm, loads two loose rounds, and readies it through ordinary equipment setup outside combat.");
    await player.context().close();
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
    await chooseAttack(player, f.defenderId); await commitAttack(player);
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
    const profile = (await pool.query("update weapon_profiles set reload_type='Magazine' where item_id=$1 returning id,ammunition_item_id", [gun.gun.id])).rows[0];
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
    await until(async () => (await pool.query("select readiness_mode from campaign_character_firearm_state where item_instance_id=$1", [gun.instance.id])).rows[0].readiness_mode === "draw-is-ready", "existing copy adopts authored settings without a reset");
    assert.equal((await pool.query("select readied from campaign_character_firearm_state where item_instance_id=$1", [gun.instance.id])).rows[0].readied, false);
    await screen(player).getByRole("button", { name: "Load / swap magazine", exact: true }).click();
    await screen(player).getByRole("combobox", { name: "Replacement magazine", exact: true }).selectOption(String(copies[0].id));
    await screen(player).getByRole("button", { name: /^Load magazine \(/ }).click();
    await until(async () => (await pool.query("select magazine_instance_id from firearm_magazine_attachment where weapon_instance_id=$1", [gun.instance.id])).rows[0]?.magazine_instance_id === copies[0].id, "magazine swap completes through Initiative");
    await screen(player).getByRole("button", { name: /^Draw weapon \(/ }).click();
    await until(async () => (await pool.query("select readied from campaign_character_firearm_state where item_instance_id=$1", [gun.instance.id])).rows[0].readied, "draw also readies once through the visible next step");
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
    await screen(player).getByText(/Your loaded magazine and readiness are saved/).waitFor();
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
    results.push("Player adopts item settings, loads a magazine, readies and fills a spare from Attack. A missing mode never asks this prepared copy to reload. The actual item editor saves the sole mode; refresh enables firing without a mode selector, with one Roll, one round consumed and 2 damage applied once. One Prepare next shot completes cycling 0.1 plus recoil 0.2 for 0.3 Initiative without spending ammunition.");
    await player.context().close(); await director.context().close();
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
  if (include("spell-area")) {
    const f = await db.transaction(async (tx) => { const fixture = await screenFixture(tx, "spell-area"); await addScreenSpell(tx, fixture, true); return fixture; });
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
    await until(async () => (await declarations(f))[0]?.status === "resolved", "area calculation completes automatically without a ruling or damage approval");
    for (const page of [director, participant]) await screen(page).getByRole("region", { name: "Combat activity", exact: true }).getByText(/Area report: 8 damage in/).waitFor();
    await screenshot(director, "spell-area-report");
    assert.deepEqual(await health(), before, "Area reports do not mutate any combatant's HP or conditions.");
    assert.equal((await pool.query("select count(*)::int count from campaign_session_roll where encounter_id=$1", [f.encounterId])).rows[0].count, 1);
    const mana = async () => (await pool.query("select mana_spent from campaign_character_active_mana where character_id=$1 order by system", [f.heroId])).rows;
    const spent = await mana(); assert.ok(spent.some((row) => Number(row.mana_spent) > 0));
    await director.reload(); await screen(director).getByText("Live", { exact: true }).waitFor();
    assert.deepEqual(await health(), before); assert.deepEqual(await mana(), spent);
    results.push("AoE casting Rolls once, spends Mana once, records the authored area and scaled damage for G.O.D. and caster, and completes automatically without changing combatant HP.");
    await director.context().close(); await participant.context().close();
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
    await pool.query("update weapon_profiles set damage='8' where item_id=$1", [f.weaponId]);
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
      await pool.query("update weapon_profiles set damage=$2 where item_id=$1", [f.weaponId, String(maximum - remaining - 2)]);
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
    await screen(player).getByLabel("Percentile result", { exact: true }).fill("100");
    await screen(player).getByRole("button", { name: "Fire & Roll", exact: true }).click();
    await screen(director).getByRole("button", { name: /^Rule on Screen Pistol/ }).click();
    await screen(director).getByLabel("Specific ruling / recovery reason", { exact: true }).fill("Apply supported damage; the critical remains an explicit decision.");
    await screen(director).getByRole("button", { name: "Confirm ruling & apply supported effects", exact: true }).click();
    await until(async () => (await pool.query("select fame from campaign_character_profile where character_id=$1", [f.heroId])).rows[0].fame === 4, "the actual killing shot awards CR Fame");
    await screen(director).getByRole("link", { name: "End Combat & XP", exact: true }).click();
    const closeout = screen(director).locator("#combat-closeout");
    const award = closeout.locator("fieldset").filter({ has: director.locator("legend", { hasText: "Fixture Goblin 1" }) });
    await award.getByLabel("Include this Creature award").check();
    await award.getByLabel("Rowan", { exact: true }).check();
    if (forced) {
      await screen(director).getByRole("button", { name: "Force end combat", exact: true }).click();
      await director.getByRole("dialog", { name: "End combat now?", exact: true }).getByRole("button", { name: "End combat now", exact: true }).click();
      await until(async () => (await pool.query("select status from campaign_session_encounter where id=$1", [f.encounterId])).rows[0].status === "completed", "force end retains applied critical-shot damage");
    } else {
      await closeout.getByRole("button", { name: "Open remaining result", exact: true }).click();
      await screen(director).getByLabel("Specific ruling / recovery reason", { exact: true }).fill("No additional critical consequence.");
      await screen(director).getByRole("button", { name: "Decline this effect", exact: true }).waitFor();
      await screen(director).getByRole("button", { name: "Decline this effect", exact: true }).click();
      await until(async () => (await pool.query("select count(*)::int n from campaign_session_encounter_effect_plan where encounter_id=$1 and status='partially-applied'", [f.encounterId])).rows[0].n === 0, "the final explicit critical decision also completes the result");
    }
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
      : "A Player's Double Ott firearm hit kills the Creature and adds its CR 4 Fame once. Closeout opens the actual outstanding critical; settling that last effect completes the result, preserves XP selections, awards 3 XP, and returns the Player to Tabletop. One original Roll and one round spent.");
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
