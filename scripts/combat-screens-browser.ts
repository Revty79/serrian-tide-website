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
const artifacts = path.resolve("artifacts/combat-screens");
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
    await screen(director).getByText("Roster & combat setup", { exact: true }).click();
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
    results.push("Scene → Encounter setup adds Characters and a direct Creature, starts and initializes combat, and lets the G.O.D. command the NPC and Creature.");
    await director.context().close(); await participant.context().close();
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
  await screen(god).getByText("End Combat & XP", { exact: true }).click();
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
  await player.reload(); await screen(player).waitFor(); assert.ok((await screen(player).innerText()).includes("Combat has ended"));
  await god.reload(); await screen(god).waitFor(); assert.ok((await screen(god).innerText()).includes("Combat has ended"));
  results.push("An incapacitated PC stays eligible: full Creature XP plus full encounter XP preview and apply once; both roles inspect completed combat after reload.");
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
    await guide.getByRole("button", { name: "Choose Fixture Goblin 1's action", exact: true }).click();
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
    await guide.getByRole("button", { name: "Choose Fixture Goblin 1's action", exact: true }).click();
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
  if (include("awareness")) for (const canRespond of [false, true]) {
    const f = await db.transaction((tx) => screenFixture(tx, `awareness-hold-${canRespond}`));
    await pool.query("update campaign_session_encounter_initiative set timeline_initiative=21 where encounter_id=$1", [f.encounterId]);
    await pool.query("update campaign_session_encounter_initiative_participant set current_initiative=20 where encounter_id=$1 and character_id=$2", [f.encounterId, f.heroId]);
    await pool.query("update campaign_session_encounter_initiative_participant set current_initiative=21, participation_status='active' where encounter_id=$1 and character_id=$2", [f.encounterId, f.occurrences[0]]);
    const director = await login(f.godId, "god", f, true), participant = await login(f.playerId, "player", f);
    const guide = screen(director).getByRole("region", { name: "Next combat input" });
    assert.equal(await screen(director).getByRole("checkbox", { name: "Automatic flow", exact: true }).isChecked(), true);
    await guide.getByRole("button", { name: "Choose Fixture Goblin 1's action", exact: true }).click();
    await chooseAttack(director, f.heroId, canRespond ? "70" : "28", "Shortsword");
    assert.equal(await screen(director).getByRole("combobox", { name: /^Target/ }).locator(`option[value='${f.occurrences[0]}']`).count(), 0, "The attack menu excludes its own actor.");
    assert.equal((await declarations(f)).length, 0, "Reading options never commits an action or Roll.");
    await commitAttack(director);
    await guide.getByRole("heading", { name: /Can Rowan notice and respond/ }).waitFor();
    await screen(participant).getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: "Hold", exact: true }).click();
    assert.equal(await screen(participant).getByRole("button", { name: "Hold Initiative", exact: true }).isDisabled(), true);
    await until(async () => (await screen(participant).innerText()).includes("next ordinary choice, including Hold, is at 20"), "Player sees why Hold is waiting without learning an unconfirmed attack");
    await guide.getByRole("button", { name: canRespond ? "Yes, can respond" : "No, cannot respond", exact: true }).click();
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
    assert.deepEqual(after, { current_initiative: 20, participation_status: "holding" });
    assert.equal((await pool.query("select count(*)::int n from campaign_session_roll where encounter_id=$1", [f.encounterId])).rows[0].n, 1);
    assert.equal((await pool.query("select total_damage from campaign_character_active_health where character_id=$1", [f.heroId])).rows[0].total_damage, canRespond ? 6 : 0);
    if (canRespond) {
      await until(async () => (await screen(participant).getByRole("region", { name: "Selected combatant detail" }).innerText()).includes("99 / 105"), "Player HP updates from applied damage without reload");
      await selectGod(director, "Rowan");
      assert.ok((await screen(director).getByRole("region", { name: "Selected combatant detail" }).innerText()).includes("99 / 105"));
      await selectGod(director, "Fixture Goblin 1");
      assert.equal(await screen(director).getByRole("combobox", { name: /^Target/ }).inputValue(), String(f.heroId), "Inspecting another actor preserves this Creature's own target draft.");
    }
    await until(() => guide.getByRole("button", { name: "Choose Fixture Goblin 1's action", exact: true }).isEnabled(), "the Creature can act again without reprompting the holding Player");
    results.push(`Direct awareness ${canRespond ? "Yes and Player no-reaction records 6 damage and updates both HP displays" : "No without typed notes records a miss and zero damage"}, reaches the lower-Initiative Player's Hold, preserves 20 Initiative, and continues automatically with one Roll and the selected target.`);
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
    await until(async () => await screen(director).getByRole("region", { name: "Next combat input" }).getByRole("button", { name: "View Rowan's turn", exact: true }).count() === 1, "automation stops for the next Player choice");
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
    await until(async () => /combat has ended|encounter.*completed/i.test(await screen(participant).innerText()), "Player sees combat end live");
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
    await view.getByRole("button", { name: mode === "spell" ? "Commit Cast & Roll" : "Commit Attack & Roll", exact: true }).click();
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
    await director.locator(".skill-library__row").filter({ hasText: "Fixture Shortsword" }).click();
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
    await screen(director).getByRole("button", { name: "Allow response", exact: true }).click();
    await screen(director).getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: "Defend", exact: true }).click();
    await until(async () => await screen(director).getByRole("combobox", { name: "Respond to", exact: true }).locator("option").count() > 1, "confirmed Creature response");
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
    results.push("An unavailable defense is blocked; a confirmed direct Creature Block uses its authored weapon and Roll, and prevents damage.");
    await director.context().close(); await participant.context().close();
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
