import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import pg from "pg";
import { chromium } from "playwright-core";
import { db, pool as applicationPool } from "@/db";
import { issueCalledCheckInTransaction, issueHighLowInTransaction } from "@/features/tabletop-operations/called-check-service";
import { startOrAddShopVisitInTransaction } from "@/features/tabletop-operations/shop-visit-service";
import { screenFixture, SCREEN_PASSWORD } from "./fixtures/combat-screens-browser-fixture";
import { tabletopToolsFixture } from "./fixtures/tabletop-tools-fixture";
import { runTabletopToolsBrowser } from "./tabletop-tools-browser";
import { closeoutAwardsFixture } from "./fixtures/closeout-awards-fixture";
import { runCloseoutAwardsBrowser } from "./closeout-awards-browser";

assert.equal(process.env.SERRIAN_DISPOSABLE_TABLETOP_TABS, "true");
const database = new URL(process.env.DATABASE_URL!);
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.pathname, "/serrian_tabletop_tabs_dev");
assert.notEqual(database.port, "5432");
const pool = new pg.Pool({ connectionString: database.toString() });
const artifacts = path.resolve("artifacts/player-tabletop-tabs");

async function eventually(check: () => Promise<boolean>, message: string) {
  for (let index = 0; index < 160; index++) {
    try { if (await check()) return; } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("Execution context was destroyed")) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(message);
}

async function main() {
  const realmsOnly = process.env.SERRIAN_BROWSER_SCENARIO === "realms-overview";
  const toolsOnly = process.env.SERRIAN_BROWSER_SCENARIO === "tabletop-tools";
  const listener = createServer();
  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const address = listener.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  const base = `http://localhost:${port}`;
  const tsconfigBefore = await readFile("tsconfig.json", "utf8");
  let server: ChildProcess | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  const logs: string[] = [];
  await mkdir(artifacts, { recursive: true });
  try {
    const fixture = await db.transaction((tx) => screenFixture(tx, "tabletop-tabs"));
    const campaignOverview = "The quay is quiet after dusk, but the warehouse lamps still burn.\n\n" + "Trade crews arrive with conflicting accounts of the missing cargo. The party must decide who to trust before the next ship sails. ".repeat(12);
    await pool.query("update campaign set name=$1,overview=$2 where id=$3", ["The Quay at Dusk", campaignOverview, fixture.campaignId]);
    const encounterTitle = String((await pool.query("select title from campaign_session_encounter where id=$1", [fixture.encounterId])).rows[0].title);
    const consoleUrl = `${base}/realms/tabletop?character=${fixture.heroId}`;
    const issue = async (purpose: string, recipient = fixture.heroId, visibility: "table" | "private" = "table") => {
      const batch = await db.transaction((tx) => issueCalledCheckInTransaction(tx, fixture.godId, {
        sessionId: fixture.sessionId, sceneId: fixture.sceneId, source: { kind: "attribute", attributeKey: "DEX" },
        purpose, recipientScope: "one", recipientCharacterIds: [recipient], visibility, rollMethod: "entered", idempotencyKey: crypto.randomUUID(),
      }));
      return Number((await pool.query("select id from campaign_session_called_check_request where batch_id=$1", [batch])).rows[0].id);
    };
    const firstRequest = await issue("Watch the quay gate");
    await issue("Private NPC request", fixture.defenderId, "private");
    const highLow = await db.transaction((tx) => issueHighLowInTransaction(tx, fixture.godId, {
      sessionId: fixture.sessionId, sceneId: fixture.sceneId, mode: "player-calls-god-rolls", participantCharacterId: fixture.heroId,
      visibility: "table", rollMethod: "random", purpose: "A turn of fortune", idempotencyKey: crypto.randomUUID(),
    }));
    const notify = () => pool.query("select pg_notify('serrian_tide_tabletop',$1)", [JSON.stringify({ campaignId: fixture.campaignId, sessionId: fixture.sessionId, sceneId: fixture.sceneId, encounterId: null, characterIds: [fixture.heroId], category: "called-check" })]);
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(port)], {
      cwd: process.cwd(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "development", BETTER_AUTH_URL: base, NEXT_TELEMETRY_DISABLED: "1", SERRIAN_TEST_NEXT_DIST_DIR: process.env.SERRIAN_TEST_NEXT_DIST_DIR || ".next-player-tabletop-tabs-browser" },
    });
    server.stdout?.on("data", (chunk) => logs.push(String(chunk)));
    server.stderr?.on("data", (chunk) => logs.push(String(chunk)));
    await eventually(async () => {
      if (server?.exitCode !== null) throw new Error(logs.join(""));
      try { return (await fetch(`${base}/login`, { redirect: "manual" })).status < 500; } catch { return false; }
    }, "Next did not start");
    browser = await chromium.launch({ executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", headless: true });
    if (process.env.SERRIAN_BROWSER_SCENARIO === "closeout-awards") {
      const f = await db.transaction((tx) => closeoutAwardsFixture(tx, "closeout-awards-browser"));
      await runCloseoutAwardsBrowser(browser, base, pool, f, artifacts);
      await writeFile(path.join(artifacts, "results-closeout-awards.json"), JSON.stringify({ passed: true, manualAwards: true, sceneAndSession: true, noDuplicateOnReopen: true, desktopAndMobile: true }, null, 2) + "\n");
      return;
    }
    if (toolsOnly) {
      const toolsFixture = await db.transaction((tx) => tabletopToolsFixture(tx, "tabletop-tools-browser"));
      await runTabletopToolsBrowser(browser, base, pool, toolsFixture, artifacts);
      await writeFile(path.join(artifacts, "results-tools.json"), JSON.stringify({ passed: true, equipment: true, spellRulings: true, itemRulings: true, respondentRollMethod: true, desktopAndMobile: true }, null, 2) + "\n");
      return;
    }
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(30_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    const signedIn = await page.request.post(`${base}/api/auth/sign-in/email`, {
      headers: { Origin: base }, data: { email: `${fixture.playerId}@example.invalid`, password: SCREEN_PASSWORD },
    });
    assert.equal(signedIn.status(), 200, "Disposable Player authentication failed");

    async function tab(label: string) {
      await page.getByRole("tab", { name: new RegExp(`^${label}(?:\\s|$)`) }).click();
      await eventually(async () => (await page.getByRole("tab", { name: new RegExp(`^${label}(?:\\s|$)`) }).getAttribute("aria-selected")) === "true", `${label} not selected`);
      assert.equal(await page.getByRole("tabpanel").count(), 1);
    }
    async function screenshot(name: string) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(artifacts, name), fullPage: true, caret: "initial" });
    }
    if (!realmsOnly) {
    await page.goto(consoleUrl);
    await page.getByRole("tab", { name: /^Alerts/ }).waitFor();
    assert.equal(await page.getByRole("tabpanel").count(), 1);
    assert.match(await page.getByRole("tab", { name: /^Alerts/ }).innerText(), /3/);
    assert.equal(await page.getByText("Private NPC request").count(), 0);
    const campaign = page.locator("details").filter({ has: page.getByRole("heading", { name: "The Quay at Dusk", exact: true }) });
    await tab("Table");
    assert.equal(await campaign.evaluate((node) => (node as HTMLDetailsElement).open), false);
    assert.equal(await campaign.locator("p").isVisible(), false);
    await campaign.locator("summary").focus();
    await page.keyboard.press("Enter");
    assert.equal(await campaign.locator("p").isVisible(), true);
    assert.equal(await campaign.locator("p").textContent(), campaignOverview);
    await tab("Alerts");
    await page.getByRole("link", { name: "Open roll", exact: true }).click();
    await eventually(async () => (await page.evaluate(() => document.activeElement?.id)) === `player-request-check-${firstRequest}`, "Alert did not focus exact request");
    assert.match(page.url(), /tab=rolls/);
    const initialRollCount = Number((await pool.query("select count(*)::int count from campaign_session_roll")).rows[0].count);
    const general = page.getByRole("region", { name: "General Rolls" });
    await general.getByLabel("Label", { exact: true }).fill("Keep this unfinished roll");
    await tab("Equipment");
    const newRequest = await issue("Listen at the warehouse door");
    await notify();
    await eventually(async () => /4/.test(await page.getByRole("tab", { name: /^Alerts/ }).innerText()), "Live alert badge did not update");
    assert.equal(await page.getByRole("tab", { name: "Equipment", exact: true }).getAttribute("aria-selected"), "true");
    await tab("Table");
    assert.equal(await campaign.evaluate((node) => (node as HTMLDetailsElement).open), true, "Campaign expansion was lost during tab changes or live refresh");
    await tab("Equipment");
    await tab("Rolls");
    assert.equal(await general.getByLabel("Label", { exact: true }).inputValue(), "Keep this unfinished roll");
    await page.goBack();
    await eventually(async () => (await page.getByRole("tab", { name: "Equipment", exact: true }).getAttribute("aria-selected")) === "true", "Back did not restore tab");
    await page.goForward();
    await eventually(async () => (await page.getByRole("tab", { name: /^Rolls/ }).getAttribute("aria-selected")) === "true", "Forward did not restore tab");
    assert.equal(Number((await pool.query("select count(*)::int count from campaign_session_roll")).rows[0].count), initialRollCount, "Navigation created a Roll");

    await tab("Alerts");
    await page.getByRole("link", { name: "Make call", exact: true }).click();
    const highLowCard = page.locator(`#player-request-high-low-${highLow}`);
    await highLowCard.getByRole("button", { name: "Call High", exact: true }).click();
    await highLowCard.getByText("Your call is locked. Waiting for the G.O.D. Roll.").waitFor();
    await tab("Alerts");
    assert.match(await page.getByRole("tab", { name: /^Rolls/ }).innerText(), /2/);
    assert.equal(await page.getByRole("link", { name: "View request", exact: true }).count(), 1);
    await page.getByRole("link", { name: "Open roll", exact: true }).first().click();
    await page.locator(`#player-request-check-${firstRequest}`).getByLabel("Percentile result").fill("42");
    await page.locator(`#player-request-check-${firstRequest}`).getByRole("button", { name: "Record Physical Result" }).click();
    await page.getByText("Your Called Check Roll was recorded.", { exact: true }).waitFor();
    await tab("Alerts");
    await eventually(async () => (await page.getByRole("heading", { name: "Watch the quay gate", exact: true }).count()) === 0, "Answered request stayed in Alerts after refresh");
    await screenshot("desktop-alerts.png");

    await page.getByRole("link", { name: "Open encounter", exact: true }).click();
    await page.waitForURL((url) => url.searchParams.get("combat") === String(fixture.encounterId));
    await page.getByRole("heading", { name: encounterTitle, exact: true }).waitFor();
    await page.goto(`${consoleUrl}&tab=rolls&request=check-${newRequest}`);
    await page.reload();
    await page.locator(`#player-request-check-${newRequest}`).waitFor();
    assert.equal(await page.getByRole("tab", { name: /^Rolls/ }).getAttribute("aria-selected"), "true");

    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
      await page.setViewportSize(viewport);
      for (const label of ["Alerts", "Table", "Rolls", "Status", "Equipment", "Spells", "Abilities", "History"]) {
        await tab(label);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, `${label} overflows at ${viewport.width}`);
        const buttons = await page.getByRole("tablist", { name: "Tabletop sections" }).getByRole("tab").evaluateAll((nodes) => nodes.map((node) => ({ label: node.textContent, height: node.getBoundingClientRect().height, width: node.clientWidth, scrollWidth: node.scrollWidth })));
        assert.ok(buttons.every((button) => button.height >= 44 && button.scrollWidth <= button.width), `${label} at ${viewport.width}: ${JSON.stringify(buttons)}`);
      }
      await tab("Alerts");
      await screenshot(`alerts-${viewport.width}.png`);
      await tab("Rolls");
      await screenshot(`rolls-${viewport.width}.png`);
      await tab("Table");
      assert.equal(await campaign.evaluate((node) => (node as HTMLDetailsElement).open), false);
      await screenshot(`table-collapsed-${viewport.width}.png`);
      await campaign.locator("summary").click();
      assert.equal(await campaign.locator("p").isVisible(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, `Expanded Campaign overflows at ${viewport.width}`);
      await screenshot(`table-expanded-${viewport.width}.png`);
      await campaign.locator("summary").click();
      assert.equal(await campaign.locator("p").isVisible(), false);
    }
    await page.getByRole("tab", { name: /^Rolls/ }).focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "tabletop-tab-status");
    await page.keyboard.press("Home");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "tabletop-tab-alerts");
    await page.keyboard.press("End");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "tabletop-tab-history");

    // Shopping must not hide Alerts/Rolls or strand a closed Shop tab.
    await pool.query("update campaign_session_encounter set status='completed',completed_at=now() where id=$1", [fixture.encounterId]);
    const shop = Number((await pool.query("insert into shop(campaign_id,name,category,description,storefront_state) values($1,'Quay Supplies','General','Supplies for the journey.','open') returning id", [fixture.campaignId])).rows[0].id);
    await pool.query("insert into campaign_session_prepared_shop(session_id,campaign_id,shop_id,sort_order) values($1,$2,$3,0)", [fixture.sessionId, fixture.campaignId, shop]);
    await pool.query("insert into campaign_session_scene_shop(scene_id,session_id,campaign_id,shop_id,sort_order,revealed) values($1,$2,$3,$4,0,true)", [fixture.sceneId, fixture.sessionId, fixture.campaignId, shop]);
    await db.transaction((tx) => startOrAddShopVisitInTransaction(tx, { sceneId: fixture.sceneId, shopId: shop, placement: { kind: "independent" }, characterIds: [fixture.heroId], mode: "shopping", closedShopOverrideReason: "" }, { userId: fixture.godId, roles: ["god"] }));
    await page.goto(consoleUrl);
    await page.getByRole("tab", { name: "Shop", exact: true }).waitFor();
    assert.equal(await page.getByRole("tab", { name: "Shop", exact: true }).getAttribute("aria-selected"), "true");
    await tab("Alerts");
    await tab("Rolls");
    await page.locator(`#player-request-check-${newRequest}`).waitFor();
    await tab("Shop");
    await page.getByRole("button", { name: /Leave Shop/i }).click();
    await eventually(async () => (await page.getByRole("tab", { name: "Shop", exact: true }).count()) === 0, "Shop tab did not close");
    assert.equal(await page.getByRole("tab", { name: /^Alerts/ }).getAttribute("aria-selected"), "true");
    assert.equal(await page.getByRole("tabpanel").count(), 1);
    }
    await page.goto(`${base}/realms`);
    const realmsOverview = page.locator(".realms-campaign-overview");
    const campaignSelect = page.getByRole("combobox", { name: /^Campaign/ });
    const characterSelect = page.getByRole("combobox", { name: /^Character/ });
    assert.equal(await realmsOverview.count(), 0);
    await campaignSelect.selectOption(String(fixture.campaignId));
    await realmsOverview.waitFor();
    assert.equal(await realmsOverview.evaluate((node) => (node as HTMLDetailsElement).open), false);
    assert.equal(await realmsOverview.locator("p").last().isVisible(), false);
    await realmsOverview.locator("summary").focus();
    await page.keyboard.press("Enter");
    assert.equal(await realmsOverview.locator("p").last().isVisible(), true);
    assert.equal(await realmsOverview.locator("p").last().textContent(), campaignOverview);
    await characterSelect.selectOption(String(fixture.heroId));
    assert.equal(await realmsOverview.evaluate((node) => (node as HTMLDetailsElement).open), true);
    const tabletopLink = page.getByRole("link", { name: /TABLETOP CONSOLE/ });
    assert.equal(await tabletopLink.getAttribute("href"), `/realms/tabletop?character=${fixture.heroId}`);
    await campaignSelect.selectOption("");
    assert.equal(await realmsOverview.count(), 0);
    await campaignSelect.selectOption(String(fixture.campaignId));
    await realmsOverview.waitFor();
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
      await page.setViewportSize(viewport);
      assert.equal(await realmsOverview.evaluate((node) => (node as HTMLDetailsElement).open), false);
      assert.equal(await realmsOverview.getByRole("heading", { name: "The Quay at Dusk", exact: true }).isVisible(), true);
      await screenshot(`realms-collapsed-${viewport.width}.png`);
      await realmsOverview.locator("summary").click();
      assert.equal(await realmsOverview.locator("p").last().isVisible(), true);
      const bounds = await realmsOverview.evaluate((node) => {
        const summary = node.querySelector("summary")!;
        return { fits: node.scrollWidth <= node.clientWidth, summaryHeight: summary.getBoundingClientRect().height };
      });
      assert.ok(bounds.fits && bounds.summaryHeight >= 44, `Realms Campaign overflows or has a small control at ${viewport.width}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, `Realms overflows at ${viewport.width}`);
      await screenshot(`realms-expanded-${viewport.width}.png`);
      await realmsOverview.locator("summary").click();
      assert.equal(await realmsOverview.locator("p").last().isVisible(), false);
    }
    await page.goto(`${base}/realms/tabletop?character=${fixture.defenderId}&tab=rolls`);
    await page.getByRole("heading", { name: "Choose your Character" }).waitFor();
    assert.equal(await page.getByText("Private NPC request").count(), 0);
    assert.deepEqual(errors, []);
    const results = realmsOnly
      ? { passed: true, realmsCampaignOverview: true, desktopAndMobile: true, authorization: true, consoleErrors: errors }
      : { passed: true, desktopAndMobile: true, collapsibleCampaign: true, realmsCampaignOverview: true, exactAlertNavigation: true, liveRefreshAndDraftPreservation: true, noRollOnNavigation: true, actualCalledAndHighLowActions: true, shopNavigation: true, authorization: true, consoleErrors: errors };
    await writeFile(path.join(artifacts, realmsOnly ? "results-realms.json" : "results.json"), JSON.stringify(results, null, 2) + "\n");
    await writeFile(path.join(artifacts, "server.log"), logs.join(""));
    console.log(realmsOnly ? "Realms Campaign overview: desktop/mobile, keyboard, Campaign reset, Character selection, and authorization passed." : "Player tabletop tabs: desktop/mobile, live alerts, requests, drafts, keyboard, encounters, Shop, Realms, and authorization passed.");
  } finally {
    await writeFile(path.join(artifacts, "server.log"), logs.join(""));
    if (browser) await browser.close();
    if (server && server.exitCode === null) {
      server.kill();
      await new Promise<void>((resolve) => { const timer = setTimeout(resolve, 5000); server!.once("exit", () => { clearTimeout(timer); resolve(); }); });
    }
    await pool.end();
    await applicationPool.end();
    const tsconfigAfter = await readFile("tsconfig.json", "utf8");
    if (tsconfigAfter !== tsconfigBefore) {
      const before = JSON.parse(tsconfigBefore), after = JSON.parse(tsconfigAfter);
      assert.deepEqual({ ...after, include: before.include }, before, "Unexpected concurrent tsconfig edit; leave it untouched");
      await writeFile("tsconfig.json", tsconfigBefore);
    }
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
