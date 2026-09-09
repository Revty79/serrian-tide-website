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
const listener = createServer(); await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
const address = listener.address(); assert.ok(address && typeof address === "object"); const port = address.port;
await new Promise<void>((resolve) => listener.close(() => resolve()));
const base = `http://localhost:${port}`, results: string[] = [], errors: string[] = [];
const include = (name: string) => !process.env.COMBAT_SCREEN_CASE_FILTER || name.includes(process.env.COMBAT_SCREEN_CASE_FILTER);
let server: ChildProcess | null = null, browser: Browser | null = null, serverLog = "";
type Fixture = Awaited<ReturnType<typeof screenFixture>>;
async function until(check: () => Promise<boolean>, label: string, timeout = 25_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 200)); }
  throw new Error(`Timed out: ${label}`);
}
function screen(page: Page) { return page.locator("[data-combat-screen]"); }
async function login(id: string, role: "god" | "player", f: Fixture) {
  const context = await browser!.newContext({ viewport: { width: 1365, height: 1000 } });
  const page = await context.newPage(); page.setDefaultTimeout(25_000);
  page.on("pageerror", (error) => errors.push(error.message));
  const signedIn = await context.request.post(`${base}/api/auth/sign-in/email`, { headers: { Origin: base }, data: { email: `${id}@example.invalid`, password: SCREEN_PASSWORD } });
  assert.equal(signedIn.status(), 200, "The disposable account authenticates through the real auth endpoint.");
  await page.goto(`${base}/${role === "god" ? "heavens" : "realms"}/tabletop?combat=${f.encounterId}${role === "player" ? `&character=${f.heroId}` : ""}`);
  await screen(page).waitFor(); await until(() => screen(page).getByRole("button", { name: "Refresh", exact: true }).isEnabled(), "combat first read");
  await screen(page).getByText("Live", { exact: true }).waitFor();
  return page;
}
async function selectGod(page: Page, name: string) { await screen(page).getByRole("region", { name: "Combatants", exact: true }).getByRole("button", { name: new RegExp(`^${name}`) }).click(); await screen(page).getByRole("region", { name: "Selected combatant detail" }).getByRole("heading", { name, exact: true }).waitFor(); await until(() => screen(page).getByRole("button", { name: "Refresh", exact: true }).isEnabled(), "selected information refreshed"); }
async function chooseAttack(page: Page, target: number, roll = "80", source = "Fixture Shortsword") {
  const view = screen(page);
  await view.getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: "Attack", exact: true }).click();
  await until(async () => await view.getByRole("combobox", { name: /^Attack source/ }).locator("option").count() > 1, "owned Attack source");
  await view.getByRole("combobox", { name: /^Attack source/ }).selectOption({ label: source });
  await view.getByRole("combobox", { name: /^Target/ }).selectOption(String(target));
  await view.getByRole("button", { name: "Check action", exact: true }).click();
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
    await library.getByText("Fixture Goblin 1 · Encounter Creature", { exact: true }).waitFor();
    await library.getByRole("link", { name: "Open Combat", exact: true }).click();
    await screen(director).getByText("Live", { exact: true }).waitFor();
    await screen(director).getByText("Roster & combat setup", { exact: true }).click();
    await screen(director).getByRole("button", { name: "Start encounter", exact: true }).click();
    await until(() => screen(director).getByRole("button", { name: "Initialize combat", exact: true }).isEnabled(), "active Encounter setup");
    await screen(director).getByRole("button", { name: "Initialize combat", exact: true }).click();
    const created = (await pool.query("select id from campaign_session_encounter where scene_id=$1 and title='Screen-started fight'", [f.sceneId])).rows[0].id;
    await until(async () => (await pool.query("select count(*)::int n from campaign_session_encounter_initiative_participant where encounter_id=$1", [created])).rows[0].n === 3, "all selected combatants initialized");
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
    await screen(director).getByRole("button", { name: "Check action", exact: true }).click();
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
  await screen(player).getByRole("button", { name: /^Resolve .* result$/ }).click();
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
  await screen(god).getByText("Participation & current condition", { exact: true }).click();
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
  if (!await screen(god).getByRole("button", { name: "Rule incapacitation", exact: true }).isVisible()) await screen(god).getByText("Participation & current condition", { exact: true }).click();
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
        await until(async () => await guide.getByRole("button").count() === 1 && await guide.getByRole("button").isEnabled(), "next input loaded");
        if (!/^Review .* response$/.test(await guide.getByRole("button").innerText())) return;
        const pendingCount = async () => (await pool.query("select count(*)::int n from campaign_session_encounter_responder_opportunity where encounter_id=$1 and status='pending'", [f.encounterId])).rows[0].n;
        const before = await pendingCount();
        await guide.getByRole("button").click();
        await screen(director).getByRole("textbox", { name: /^Ruling \/ participation reason/ }).fill("Explicit fixture ruling: no legitimate additional response during this committed action.");
        await screen(director).getByRole("button", { name: "Response unavailable", exact: true }).click();
        await until(async () => await pendingCount() < before, "response ruling committed");
      }
    }
    await reviewPendingResponses();
    await guide.getByRole("button", { name: "Advance combat", exact: true }).click();
    await until(async () => (await pool.query("select status from campaign_session_encounter_pending_action where id=$1", [bite.pending_action_id])).rows[0].status === "completed", "faster Creature timing complete");
    await reviewPendingResponses();
    await guide.getByRole("button", { name: "Resolve Fixture Goblin 1's Shortsword", exact: true }).click();
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
    await guide.getByRole("button", { name: "Resolve Rowan's Fixture Shortsword", exact: true }).click();
    await guide.getByRole("button", { name: "Rule on Fixture Shortsword outcome", exact: true }).click();
    await screen(director).getByLabel("Specific ruling / recovery reason", { exact: true }).fill("Resolve the completed critical strike against the authored head using calculated damage.");
    await screen(director).getByRole("combobox", { name: /^Authored hit location/ }).selectOption("0");
    await screen(director).getByRole("button", { name: "Confirm attack ruling & apply", exact: true }).click();
    await until(async () => (await local())?.combatCondition?.status === "dead", "fatal result applies only after sword timing and exact ruling");
    const unfinished = (await declarations(f)).find((entry) => entry.actor_character_id === f.occurrences[0] && entry.id !== bite.id)!;
    assert.equal(unfinished.status, "cancelled");
    results.push("The main next-input control resolves a faster Creature action, offers its next action while the critical sword is unfinished, then opens the sword's exact ruling only at completion; death cancels the later unfinished action.");
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
    await until(async () => (await declarations(f))[0]?.status === "resolved", "automatic progression and result application without Advance or Resolve clicks");
    const readOutcome = async () => (await pool.query("select local_state_json from campaign_session_encounter_participant where encounter_id=$1 and character_id=$2", [f.encounterId, f.occurrences[0]])).rows[0].local_state_json;
    const final = await readOutcome(); assert.equal(final.combatCondition.status, "dead");
    assert.equal((await pool.query("select count(*)::int n from campaign_session_roll where encounter_id=$1", [f.encounterId])).rows[0].n, 1);
    assert.equal((await pool.query("select current_initiative from campaign_session_encounter_initiative_participant where encounter_id=$1 and character_id=$2", [f.encounterId, f.heroId])).rows[0].current_initiative, 18);
    await until(async () => await screen(director).getByRole("region", { name: "Next combat input" }).getByRole("button", { name: "View Rowan's turn", exact: true }).count() === 1, "automation stops for the next Player choice");
    await director.context().setOffline(true); await screen(director).getByText("Reconnecting", { exact: true }).waitFor(); await director.context().setOffline(false); await screen(director).getByText("Live", { exact: true }).waitFor();
    await until(() => screen(director).getByRole("button", { name: "Refresh", exact: true }).isEnabled(), "automatic reconnect read");
    assert.deepEqual(await readOutcome(), final);
    await director.reload(); await screen(director).getByText("Live", { exact: true }).waitFor();
    assert.equal(await screen(director).getByRole("checkbox", { name: "Automatic flow", exact: true }).isChecked(), false);
    assert.equal((await declarations(f)).length, 1); assert.deepEqual(await readOutcome(), final);
    results.push("Automatic flow advances and resolves a supported attack without manual timing/result clicks, respects Freeze, stops for the next Player choice, and preserves one Roll/cost/outcome with two G.O.D. screens and reconnect.");
    await director.context().close(); await secondDirector.context().close(); await participant.context().close();
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
    await view.getByRole("combobox", { name: /^Target/ }).selectOption(String(fixture.occurrences[0]));
    if (mode === "spell") await view.getByRole("combobox", { name: /^Spell target 1/ }).selectOption(String(fixture.occurrences[0]));
    await view.getByRole("button", { name: "Check action", exact: true }).click();
    if (mode === "spell") { await view.getByRole("combobox", { name: /damage location/ }).selectOption("0"); await view.getByRole("button", { name: "Check action", exact: true }).click(); }
    else await view.getByLabel("Percentile result", { exact: true }).fill("70");
    await view.getByRole("button", { name: mode === "spell" ? "Commit Cast" : "Commit Attack & Roll", exact: true }).click();
    await until(async () => (await declarations(fixture)).length > 0, `${mode} committed`);
    const record = (await declarations(fixture))[0];
    const manaSpent = async () => Number((await pool.query("select coalesce(sum(mana_spent),0) spent from campaign_character_active_mana where character_id=$1", [fixture.heroId])).rows[0].spent);
    const committedMana = await manaSpent();
    if (mode === "spell") assert.ok(committedMana > 0, "The cast spends Mana at commitment");
    if (mode === "spell") assert.equal((await pool.query("select count(*)::int count from campaign_session_roll where encounter_id=$1", [fixture.encounterId])).rows[0].count, 0);
    await advanceAction(director, record.pending_action_id);
    if (mode === "spell") { await view.getByRole("button", { name: /^Resolve .* result$/ }).click(); await until(async () => (await declarations(fixture))[0].status === "resolved", "spell consequence"); assert.equal(await manaSpent(), committedMana); await participant.reload(); await screen(participant).getByText("Live", { exact: true }).waitFor(); assert.equal(await manaSpent(), committedMana); }
    else { await screen(director).getByRole("region", { name: "Next combat input" }).getByRole("button", { name: /^Resolve Rowan's Screen Pistol/ }).click(); await until(async () => (await pool.query("select loaded_rounds from campaign_character_firearm_state where character_id=$1", [fixture.heroId])).rows[0].loaded_rounds === 2, "ammunition consumed once"); await director.reload(); await screen(director).getByText("Live", { exact: true }).waitFor(); assert.equal((await pool.query("select loaded_rounds from campaign_character_firearm_state where character_id=$1", [fixture.heroId])).rows[0].loaded_rounds, 2); assert.equal((await pool.query("select count(*)::int n from campaign_session_roll where encounter_id=$1", [fixture.encounterId])).rows[0].n, 1); }
    results.push(`${mode === "spell" ? "Spell target group and authored location selection" : "Exact firearm"} commits and completes through the screen/server flow.`);
    await director.context().close(); await participant.context().close();
  }
  if (include("defense")) {
    const f = await db.transaction((tx) => screenFixture(tx, "defense"));
    await pool.query("update campaign_session_encounter_initiative_participant set participation_status='holding' where encounter_id=$1 and character_id=$2", [f.encounterId, f.occurrences[0]]);
    const director = await login(f.godId, "god", f), participant = await login(f.playerId, "player", f);
    await screen(participant).getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: "Defend", exact: true }).click();
    assert.ok(await screen(participant).getByRole("button", { name: "Check defense", exact: true }).isDisabled());
    assert.ok((await screen(participant).innerText()).includes("response"));
    await chooseAttack(participant, f.occurrences[0], "20"); await commitAttack(participant);
    await until(async () => (await declarations(f)).length === 1, "attack awaiting legitimate response");
    await selectGod(director, "Fixture Goblin 1");
    await screen(director).getByText("G.O.D. controls for Fixture Goblin 1", { exact: true }).click();
    await screen(director).getByRole("button", { name: "Allow response", exact: true }).click();
    await screen(director).getByRole("navigation", { name: "Combat commands" }).getByRole("button", { name: "Defend", exact: true }).click();
    await until(() => screen(director).getByRole("button", { name: "Check defense", exact: true }).isEnabled(), "confirmed Creature response");
    await screen(director).getByRole("combobox", { name: /^Defense/ }).selectOption("block");
    await screen(director).getByRole("combobox", { name: /^Defending weapon/ }).selectOption({ label: "Shortsword" });
    await screen(director).getByRole("button", { name: "Check defense", exact: true }).click();
    await screen(director).getByLabel("Percentile result", { exact: true }).fill("90");
    await screen(director).getByRole("button", { name: "Commit response & Roll", exact: true }).click();
    const action = (await declarations(f))[0];
    await until(async () => (await pool.query("select count(*)::int n from campaign_session_encounter_reaction where pending_action_id=$1", [action.pending_action_id])).rows[0].n === 1, "defense committed");
    await advanceAction(director, action.pending_action_id);
    await screen(participant).getByRole("button", { name: /^Resolve .* result$/ }).click();
    await until(async () => ["cancelled", "resolved"].includes((await declarations(f))[0].status), "successful defense resolved");
    const local = (await pool.query("select local_state_json from campaign_session_encounter_participant where character_id=$1", [f.occurrences[0]])).rows[0].local_state_json;
    assert.equal(local?.health?.totalDamage ?? 0, 0);
    results.push("An unavailable defense is blocked; a confirmed direct Creature Block uses its authored weapon and Roll, and prevents damage.");
    await director.context().close(); await participant.context().close();
  }
  assert.deepEqual(errors, [], "No browser runtime errors");
  await writeFile(path.join(artifacts, "results.json"), JSON.stringify({ passed: results, errors }, null, 2));
  console.log(JSON.stringify({ passed: results }, null, 2));
} catch (error) {
  for (const [index, context] of (browser?.contexts() ?? []).entries()) for (const [pageIndex, page] of context.pages().entries()) {
    await page.screenshot({ path: path.join(artifacts, `failure-${index}-${pageIndex}.png`), fullPage: true }).catch(() => {});
    await writeFile(path.join(artifacts, `failure-${index}-${pageIndex}.txt`), await page.locator("body").innerText().catch(() => "unreadable"));
  }
  await writeFile(path.join(artifacts, "results.json"), JSON.stringify({ passed: results, errors, failure: String(error) }, null, 2));
  throw error;
} finally {
  await browser?.close();
  if (server?.pid) { try { if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); else server.kill("SIGTERM"); } catch {} }
  await writeFile(path.join(artifacts, "server.log"), serverLog);
  await pool.end();
}
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
