import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import type pg from "pg";
import type { Browser, BrowserContext } from "playwright-core";
import { blankCalendarRules } from "../src/features/worlds/calendar";
import { emptyLore } from "../src/features/worlds/peoples";
import type { EntryDraft } from "../src/features/worlds/history";
import { entryDraftOf } from "../src/features/worlds/client-api";

type Worlds = typeof import("../src/features/worlds/world-service");
const directory = "artifacts/guidance/worlds-calendar-privacy";
const known = (year: number) => ({version: 1 as const, scale: "world-year" as const, kind: "known" as const, year});

export async function calendarPrivacyFixture(worlds: Worlds, pool: pg.Pool) {
  const calendars = await import("../src/features/worlds/calendar-service");
  const evolution = await import("../src/features/worlds/calendar-evolution-service");
  const history = await import("../src/features/worlds/history-index-service");
  const lore = await import("../src/features/worlds/peoples-service");
  const links = await import("../src/features/worlds/milestone-service");
  const worldId = await worlds.createWorld("world-god", {name: "Calendar History privacy checkpoint"});
  const primary = (await worlds.getWorld("world-god", worldId)).selectedTimeline.id;
  const rules = blankCalendarRules();
  const version = (await calendars.changeCalendar("world-god", worldId, {action: "create", draft: {name: "Public Coast Calendar", description: "Public civil dates", context: "", visibility: "ordinary"}, title: "Coast definition", rules}))!;
  const calendarId = (await calendars.getCalendars("world-god", worldId)).versions.find(v => v.id === version)!.calendarId;
  await evolution.changeCalendarEvolution("world-god", worldId, {action: "origin", label: "Public dawn", description: "One shared elapsed day begins at the public dawn."});
  const endpoint = {versionId: version, revision: 1, date: {year: 1, month: 1, day: 1}};
  await evolution.changeCalendarEvolution("world-god", worldId, {action: "anchor", endpoint, elapsedDay: "0", sameDayUnit: true});
  const draft = (title: string, extra: Partial<EntryDraft> = {}): EntryDraft => ({title, account: `${title} complete narrative`, notes: "AUTHOR_CALENDAR_HISTORY_NOTES", time: known(10), accuracy: "established", narrative: "recorded", visibility: "ordinary", prominence: "standard", eventType: "", eraIds: [], calendarDate: {kind: "known", start: endpoint}, ...extra});
  const event = (title: string, extra: Partial<EntryDraft> = {}) => worlds.changeHistory("world-god", worldId, {entity: "entry", action: "save", timelineId: primary, draft: draft(title, extra)});
  const publicEvent = await event("Public harbor opening");
  const explicitEvent = await event("EXPLICIT_SECRET_CALENDAR_EVENT", {visibility: "protected"});
  const indirectEvent = await event("INDIRECT_SECRET_CALENDAR_EVENT");
  const secretPerson = await lore.changePeople("world-god", worldId, {action: "create", timelineId: primary, requestId: randomUUID(), draft: {...emptyLore("individual"), name: "CONFIDENTIAL_CALENDAR_PERSON", visibility: "protected"}});
  const current = await history.historyEntry("world-god", worldId, primary, indirectEvent);
  await links.linkMilestone("world-god", worldId, {timelineId: primary, entryId: indirectEvent, revision: current.revision, targetId: secretPerson, kind: "lore", eventType: "CONFIDENTIAL_CALENDAR_LINK"});
  const ordinary = await history.searchHistory("world-god", worldId, primary, {}, false, true);
  assert.ok(ordinary.entries.some(e => e.id === publicEvent));
  assert.ok(!ordinary.entries.some(e => e.id === explicitEvent || e.id === indirectEvent));
  if (process.argv.includes("--calendar-privacy-reproduction")) return {worldId, primary, version, calendarId, endpoint, rules, publicEvent, explicitEvent, indirectEvent, secretPerson};
  const retainedEvent = await event("RETAINED_SECRET_CALENDAR_EVENT");
  const retainedVersion = (await history.historyEntry("world-god", worldId, primary, retainedEvent)).historyContext!.versionId;
  const holder = await lore.changePeople("world-god", worldId, {action: "create", timelineId: primary, requestId: randomUUID(), draft: {...emptyLore("individual"), name: "Public calendar reader", historyRefs: [{entityId: retainedEvent, versionId: retainedVersion}]}});
  await links.linkMilestone("world-god", worldId, {timelineId: primary, entryId: retainedEvent, revision: (await history.historyEntry("world-god", worldId, primary, retainedEvent)).revision, targetId: secretPerson, kind: "lore", eventType: "Retained secret witness"});
  const privateVersion = (await calendars.changeCalendar("world-god", worldId, {action: "create", draft: {name: "CONFIDENTIAL_CALENDAR_TRADITION", description: "PRIVATE_CALENDAR_DESCRIPTION", context: "", visibility: "protected"}, title: "PRIVATE_CALENDAR_DEFINITION", rules}))!;
  const privateEndpoint = {...endpoint, versionId: privateVersion};
  await evolution.changeCalendarEvolution("world-god", worldId, {action: "anchor", endpoint: privateEndpoint, elapsedDay: "0", sameDayUnit: true});
  const privateEvent = await event("PRIVATE_CALENDAR_DATED_EVENT", {calendarDate: {kind: "duration", start: endpoint, end: privateEndpoint}});
  const successor = (await calendars.changeCalendar("world-god", worldId, {action: "version", id: calendarId, revision: 1, title: "Public successor definition", rules}))!;
  const reforms: {id: string; entryId: string | null; name: string}[] = [];
  for (const [entryId, name] of [[publicEvent, "Public harbor calendar reform"], [null, "Independent public reform"], [explicitEvent, "SECRET_EXPLICIT_REFORM"], [indirectEvent, "SECRET_INDIRECT_REFORM"], [retainedEvent, "SECRET_RETAINED_REFORM"], [privateEvent, "SECRET_PRIVATE_CALENDAR_REFORM"]] as const) {
    const id = (await evolution.changeCalendarEvolution("world-god", worldId, {action: "reform", draft: {name, predecessorId: version, successorId: successor, time: known(10), reason: `${name} revealing reason`, details: `${name} revealing details`, entryId, cutover: null}}))!;
    reforms.push({id, entryId, name});
  }
  const publicEvents = [publicEvent];
  // A calendar-specific query must reach later legitimate records even when
  // unrelated earlier History entries fill the first visual History page.
  for (let i = 0; i < 45; i++) await event(`Earlier year-only account ${i}`, {time: known(-100 + i), calendarDate: null});
  for (let i = 0; i < 65; i++) publicEvents.push(await event(`Public dated account ${String(i).padStart(2, "0")}`, {time: known(20 + i)}));
  const lateEvent = await event("Public calendar event beyond first page", {time: known(900)}); publicEvents.push(lateEvent);
  const timelines = await import("../src/features/worlds/branching-history-service");
  const branch = await timelines.changeTimeline("world-god", worldId, {action: "create", parentRevision: (await worlds.getWorld("world-god", worldId)).selectedTimeline.revision, draft: {parentId: primary, divergenceYear: 15, name: "Alternate public harbor", description: "Independent harbor account", explanation: "The harbor has another account."}});
  const inherited = await history.historyEntry("world-god", worldId, branch, publicEvent);
  await worlds.changeHistory("world-god", worldId, {entity: "entry", action: "save", timelineId: branch, id: publicEvent, revision: inherited.revision, draft: {...entryDraftOf(inherited), title: "Alternate harbor opening", account: "The alternate harbor account remains independent."}});
  const alternateOnly = await worlds.changeHistory("world-god", worldId, {entity: "entry", action: "save", timelineId: branch, draft: draft("Alternate calendar-only festival", {time: known(950)})});
  const nested = await timelines.changeTimeline("world-god", worldId, {action: "create", parentRevision: (await worlds.getWorld("world-god", worldId, false, branch)).selectedTimeline.revision, draft: {parentId: branch, divergenceYear: 1000, name: "Nested harbor", description: "Nested saved source", explanation: "Retains the alternate harbor."}});
  const snapshot = await privacySnapshot(pool, worldId);
  return {worldId, primary, version, calendarId, endpoint, rules, publicEvent, explicitEvent, indirectEvent, secretPerson, extended: {retainedEvent, retainedVersion, holder, privateVersion, privateEvent, successor, reforms, publicEvents, lateEvent, branch, nested, alternateOnly, snapshot}};
}

type Fixture = Awaited<ReturnType<typeof calendarPrivacyFixture>>;
async function privacySnapshot(pool: pg.Pool, worldId: string) {
  const snapshot: Record<string, unknown> = {};
  for (const table of ["world_history_version", "world_history_version_entity", "world_calendar_version", "world_calendar_anchor", "world_calendar_entry_date", "world_calendar_reform", "world_lore_version", "world_individual_version", "world_lore_history"])
    snapshot[table] = (await pool.query(`select to_jsonb(t) row from ${table} t where world_id=$1 order by to_jsonb(t)::text`, [worldId])).rows;
  return snapshot;
}

export async function calendarPrivacyServiceChecks(worlds: Worlds, pool: pg.Pool, f: Fixture) {
  assert.ok(f.extended); const e = f.extended;
  const calendar = await import("../src/features/worlds/calendar-service");
  const reader = await import("../src/features/worlds/calendar-history-service");
  const history = await import("../src/features/worlds/history-index-service");
  const lore = await import("../src/features/worlds/peoples-service");
  const hiddenIds = [f.explicitEvent, f.indirectEvent, f.secretPerson, e.retainedEvent, e.retainedVersion, e.privateVersion, e.privateEvent, ...e.reforms.filter(r => r.name.startsWith("SECRET")).map(r => r.id)];
  async function pages(timeline = f.primary, ordinary = true, review = false, actor = "world-god", includeArchived = false) {
    const entries = []; let offset = 0;
    for (;;) {
      const page = await reader.calendarHistory(actor, f.worldId, timeline, {versionId: f.version, offset, includeArchived}, review, ordinary);
      assert.ok(page.entries.length <= 50);
      if (ordinary) for (const id of hiddenIds) assert.equal(JSON.stringify(page).includes(id), false, id);
      entries.push(...page.entries);
      if (page.nextOffset === null) break;
      assert.ok(page.nextOffset > offset); offset = page.nextOffset;
    }
    assert.equal(new Set(entries.map(v => v.id)).size, entries.length);
    return entries;
  }
  const ordinary = await pages();
  assert.deepEqual(ordinary.map(v => v.id).sort(), [...e.publicEvents].sort());
  assert.ok(ordinary.every(v => !v.notes));
  const ordinaryWorld = await worlds.getWorld("world-god", f.worldId, false, f.primary, true);
  for (const id of hiddenIds) assert.equal(JSON.stringify(ordinaryWorld).includes(id), false);
  assert.equal(ordinaryWorld.world.entryCount, e.publicEvents.length + 45);
  assert.equal(ordinaryWorld.canEdit, false);
  assert.equal(ordinaryWorld.inheritanceReview.length, 0);
  const author = await pages(f.primary, false);
  for (const id of [f.explicitEvent, f.indirectEvent, e.retainedEvent]) assert.ok(author.some(v => v.id === id && v.notes));
  const safeBundle = await calendar.getCalendars("world-god", f.worldId, false, true, f.primary);
  for (const id of hiddenIds) assert.equal(JSON.stringify(safeBundle).includes(id), false);
  assert.deepEqual(safeBundle.evolution.reforms.map(v => v.name).sort(), ["Independent public reform", "Public harbor calendar reform"]);
  assert.equal((await calendar.getCalendars("world-god", f.worldId)).evolution.reforms.length, e.reforms.length);
  const alternate = await pages(e.branch);
  assert.ok(alternate.some(v => v.id === f.publicEvent && v.title === "Alternate harbor opening"));
  assert.ok(alternate.some(v => v.id === e.alternateOnly));
  assert.ok(!alternate.some(v => v.id === e.lateEvent));
  assert.ok((await pages(e.nested)).some(v => v.id === f.publicEvent && v.title === "Alternate harbor opening"));
  for (const timeline of [e.branch, e.nested]) {
    const b = await calendar.getCalendars("world-god", f.worldId, false, true, timeline);
    assert.equal(b.evolution.reforms.length, 0); assert.equal(b.evolution.histories.length, 0); assert.equal(b.evolution.adoptions.length, 0);
    assert.ok(b.evolution.anchors.some(a => a.versionId === f.version));
  }
  await assert.rejects(reader.calendarHistory("world-god", f.worldId, f.primary, {versionId: e.privateVersion}, false, true), /unavailable/);
  assert.ok((await reader.calendarHistory("world-god", f.worldId, f.primary, {versionId: e.privateVersion})).entries.some(v => v.id === e.privateEvent));
  // Old pins cannot recover a currently protected effective account.
  await assert.rejects(lore.pinnedHistoricalSource("world-god", f.worldId, f.primary, e.holder, e.retainedVersion, false, true), /unavailable/);
  assert.equal((await lore.pinnedHistoricalSource("world-god", f.worldId, f.primary, e.holder, e.retainedVersion)).id, e.retainedEvent);
  for (const actor of ["other-god", "world-player", "missing-user", "world-admin"]) await assert.rejects(reader.calendarHistory(actor, f.worldId, f.primary, {versionId: f.version}), /unavailable|access/);
  assert.ok((await pages(f.primary, false, true, "world-admin")).some(v => v.id === f.explicitEvent));
  assert.equal((await calendar.getCalendars("world-admin", f.worldId, true, true, f.primary)).canEdit, false);
  assert.deepEqual(await privacySnapshot(pool, f.worldId), e.snapshot);
  const current = await history.historyEntry("world-god", f.worldId, f.primary, f.publicEvent);
  await worlds.changeHistory("world-god", f.worldId, {entity: "entry", action: "archive", timelineId: f.primary, id: f.publicEvent, revision: current.revision});
  assert.ok(!(await pages()).some(v => v.id === f.publicEvent));
  assert.ok((await pages(f.primary, true, false, "world-god", true)).some(v => v.id === f.publicEvent && v.archived));
  await worlds.changeHistory("world-god", f.worldId, {entity: "entry", action: "restore", timelineId: f.primary, id: f.publicEvent, revision: (await history.historyEntry("world-god", f.worldId, f.primary, f.publicEvent)).revision});
  assert.ok((await pages()).some(v => v.id === f.publicEvent));
  const identity = (await calendar.getCalendars("world-god", f.worldId)).calendars.find(v => v.id === f.calendarId)!;
  await calendar.changeCalendar("world-god", f.worldId, {action: "archive", id: identity.id, revision: identity.revision});
  assert.deepEqual((await pages()).map(v => v.id).sort(), [...e.publicEvents].sort());
  await calendar.changeCalendar("world-god", f.worldId, {action: "restore", id: identity.id, revision: (await calendar.getCalendars("world-god", f.worldId)).calendars.find(v => v.id === identity.id)!.revision});
  // Reads never changed existing versions; deliberate archive/restore appended
  // versions while preserving every pre-existing canonical source row exactly.
  const after = await privacySnapshot(pool, f.worldId);
  for (const [table, rows] of Object.entries(e.snapshot)) {
    const original = rows as {row: unknown}[], actual = after[table] as {row: unknown}[];
    for (const row of original) assert.ok(actual.some(v => JSON.stringify(v) === JSON.stringify(row)), `Retained ${table} source changed`);
  }
  await mkdir(directory, {recursive: true});
  await writeFile(`${directory}/service-results.json`, JSON.stringify({ordinaryCount: ordinary.length, authorCount: author.length, pageSize: 50, publicReforms: safeBundle.evolution.reforms.map(v => v.name), selectedAlternateAndNested: true, wholeAccountPrivacyAndOldPins: true, originalRowsPreserved: true}, null, 2) + "\n");
  console.log("PASS: calendar History server projection, 67 safe events across bounded pages, whole-event/reform/retained-pin privacy, private calendars, selected alternate/nested sources, archive/restore, roles and immutable original rows.");
}
async function signIn(context: BrowserContext, base: string, user = "world-god") {
  const response = await context.request.post(`${base}/api/auth/sign-in/email`, {headers: {Origin: base}, data: {email: `${user}@example.invalid`, password: "Worlds-Test-Only-Password!"}});
  assert.equal(response.status(), 200, await response.text());
}

export async function reproduceCalendarPrivacy(browser: Browser, base: string, fixture: Fixture) {
  await mkdir(directory, {recursive: true});
  const results = [];
  for (const phone of [false, true]) {
    const context = await browser.newContext({viewport: phone ? {width: 390, height: 844} : {width: 1440, height: 900}, hasTouch: phone, isMobile: phone, extraHTTPHeaders: {"X-Forwarded-For": phone ? "198.51.100.242" : "198.51.100.241"}});
    try {
      await signIn(context, base);
      const page = await context.newPage();
      await page.goto(`${base}/worlds/${fixture.worldId}?tab=calendars&timeline=${fixture.primary}&calendarVersion=${fixture.version}&knowledge=ordinary`);
      const panel = page.getByLabel("Historical calendar evolution", {exact: true});
      if (phone) await panel.getByText("History, adoption & date comparison", {exact: true}).tap();
      else await panel.getByText("History, adoption & date comparison", {exact: true}).click();
      await panel.getByRole("button", {name: /Public harbor opening/}).waitFor();
      assert.equal(await panel.getByRole("button", {name: /EXPLICIT_SECRET_CALENDAR_EVENT/}).count(), 1);
      assert.equal(await panel.getByRole("button", {name: /INDIRECT_SECRET_CALENDAR_EVENT/}).count(), 1);
      const response = await context.request.get(`${base}/api/worlds/${fixture.worldId}/history?timeline=${fixture.primary}&ordinary=1`);
      assert.equal(response.status(), 200);
      const safe = await response.text();
      for (const id of [fixture.explicitEvent, fixture.indirectEvent, fixture.secretPerson]) assert.equal(safe.includes(id), false);
      await page.screenshot({path: `${directory}/reproduction-${phone ? "phone" : "desktop"}.png`, fullPage: true});
      results.push({device: phone ? "native-touch phone" : "desktop", ordinaryHistoryApiWithholdsBothSecrets: true, calendarPanelExposesBothSecretTitlesAndSourceNotation: true});
    } finally {await context.close();}
  }
  await writeFile(`${directory}/before-fix-reproduction.json`, JSON.stringify({startingCommit: "d694718d587a484bf11b8a9284cb5aefc515e061", results}, null, 2) + "\n");
  console.log("REPRODUCED: ordinary calendar History exposes explicit and indirectly protected events on desktop and native-touch phone while the central History API correctly withholds them.");
}

export async function calendarPrivacyBrowserChecks(browser: Browser, base: string, f: Fixture, pool: pg.Pool) {
  assert.ok(f.extended); const e = f.extended;
  await mkdir(directory, {recursive: true});
  const errors: string[] = [], results: unknown[] = [];
  const hidden = [f.explicitEvent, f.indirectEvent, f.secretPerson, e.retainedEvent, e.retainedVersion, e.privateVersion, e.privateEvent, ...e.reforms.filter(r => r.name.startsWith("SECRET")).flatMap(r => [r.id, r.name]), "EXPLICIT_SECRET_CALENDAR_EVENT", "INDIRECT_SECRET_CALENDAR_EVENT", "RETAINED_SECRET_CALENDAR_EVENT", "CONFIDENTIAL_CALENDAR_TRADITION", "PRIVATE_CALENDAR_DEFINITION", "CONFIDENTIAL_CALENDAR_PERSON", "PRIVATE_CALENDAR_DATED_EVENT", "AUTHOR_CALENDAR_HISTORY_NOTES"];
  const url = (timeline = f.primary, ordinary = true, review = false) => `${base}/worlds/${f.worldId}?tab=calendars&timeline=${timeline}&calendarVersion=${f.version}${ordinary ? "&knowledge=ordinary" : ""}${review ? "&review=1" : ""}`;
  const api = (timeline = f.primary, ordinary = true, review = false) => `${base}/api/worlds/${f.worldId}/calendars/history?${new URLSearchParams({timeline, version: f.version, ...ordinary ? {ordinary: "1"} : {}, ...review ? {review: "1"} : {}})}`;
  function assertSafe(text: string) {for (const secret of hidden) assert.equal(text.includes(secret), false, secret);}
  const before = await privacySnapshot(pool, f.worldId);
  for (const phone of [false, true]) {
    const context = await browser.newContext({viewport: phone ? {width: 390, height: 844} : {width: 1440, height: 900}, hasTouch: phone, isMobile: phone, extraHTTPHeaders: {"X-Forwarded-For": phone ? "198.51.100.244" : "198.51.100.243"}});
    try {
      await signIn(context, base);
      const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
      const activate = async (locator: ReturnType<typeof page.getByRole>) => {if (phone) await locator.tap(); else await locator.click();};
      async function open(timeline = f.primary, ordinary = true) {
        await page.goto(url(timeline, ordinary));
        const panel = page.getByLabel("Historical calendar evolution", {exact: true});
        await activate(panel.getByText("History, adoption & date comparison", {exact: true}));
        await page.getByLabel("Calendar historical accounts", {exact: true}).getByRole("button", {name: /harbor opening/}).waitFor();
        return panel;
      }
      let panel = await open();
      const list = page.getByLabel("Calendar historical accounts", {exact: true});
      assertSafe(await page.locator("main").innerText());
      assert.equal(await panel.getByText("Public harbor calendar reform", {exact: true}).count(), 1);
      assert.equal(await panel.getByText("Independent public reform", {exact: true}).count(), 1);
      assert.equal(await list.getByRole("button", {name: /Public calendar event beyond first page/}).count(), 0);
      await activate(list.getByRole("button", {name: "Load more calendar accounts", exact: true}));
      await list.getByRole("button", {name: /Public calendar event beyond first page/}).waitFor();
      assert.equal(await list.getByRole("button", {name: /^Public /}).count(), e.publicEvents.length);
      assert.equal(await list.getByRole("button", {name: "Load more calendar accounts", exact: true}).count(), 0);
      assertSafe(await list.innerText());
      const response = await context.request.get(api());
      assert.equal(response.status(), 200); assert.match(response.headers()["cache-control"], /private.*no-store/); assert.match(response.headers().vary, /Cookie/);
      assertSafe(await response.text());
      const collection = await context.request.get(`${base}/api/worlds/${f.worldId}/calendars?timeline=${f.primary}&ordinary=1`);
      assert.equal(collection.status(), 200); assertSafe(await collection.text());
      const worldResponse = await context.request.get(`${base}/api/worlds/${f.worldId}?timeline=${f.primary}&ordinary=1`);
      assert.equal(worldResponse.status(), 200); assertSafe(await worldResponse.text());
      const directPage = await context.request.get(url());
      assert.equal(directPage.status(), 200); assertSafe(await directPage.text());
      await activate(list.getByRole("button", {name: /Public calendar event beyond first page/}));
      await page.getByRole("dialog").getByRole("heading", {name: "Public calendar event beyond first page", exact: true}).waitFor();
      assert.equal(new URL(page.url()).searchParams.get("timeline"), f.primary); assert.equal(new URL(page.url()).searchParams.get("knowledge"), "ordinary");
      const comparison = page.getByLabel("Compare original calendar date using", {exact: true});
      await comparison.waitFor();
      assert.equal(await comparison.locator(`option[value="${e.privateVersion}"]`).count(), 0);
      await comparison.selectOption(f.version);
      await page.getByText(/Equivalent date notation:/).waitFor();
      assertSafe(await page.getByRole("dialog").innerText());
      await activate(page.getByRole("button", {name: "Close historical details", exact: true}));
      await activate(page.getByRole("navigation", {name: "World workspace"}).getByRole("button", {name: "Calendars", exact: true}));
      assert.equal(new URL(page.url()).searchParams.get("tab"), "calendars");
      assert.equal(new URL(page.url()).searchParams.get("knowledge"), "ordinary");
      await page.reload();
      await page.getByRole("heading", {name: "Public Coast Calendar", exact: true}).last().waitFor();
      await activate(page.getByLabel("Historical calendar evolution", {exact: true}).getByText("History, adoption & date comparison", {exact: true}));
      await page.getByLabel("Calendar historical accounts", {exact: true}).getByRole("button", {name: /Public harbor opening/}).waitFor();
      await activate(page.getByRole("navigation", {name: "World workspace"}).getByRole("button", {name: "Cosmology", exact: true}));
      await page.goBack();
      await page.getByLabel("Historical calendar evolution", {exact: true}).waitFor();
      assert.equal(new URL(page.url()).searchParams.get("knowledge"), "ordinary");
      await page.goForward();
      assert.equal(new URL(page.url()).searchParams.get("tab"), "cosmology");
      panel = await open(e.branch);
      const altList = page.getByLabel("Calendar historical accounts", {exact: true});
      await altList.getByRole("button", {name: /Alternate calendar-only festival/}).waitFor();
      assert.equal(await altList.getByRole("button", {name: /Public calendar event beyond first page/}).count(), 0);
      assert.equal(await panel.getByText("Public harbor calendar reform", {exact: true}).count(), 0);
      await activate(altList.getByRole("button", {name: /Alternate harbor opening/}));
      await page.getByRole("dialog").getByRole("heading", {name: "Alternate harbor opening", exact: true}).waitFor();
      assert.equal(new URL(page.url()).searchParams.get("timeline"), e.branch);
      await page.reload(); await page.getByRole("dialog").getByRole("heading", {name: "Alternate harbor opening", exact: true}).waitFor();
      await open(e.nested);
      assert.equal(await page.getByLabel("Calendar historical accounts", {exact: true}).getByRole("button", {name: /Public harbor opening/}).count(), 0);
      // A known calendar URL must keep context into Living Skies and back.
      await page.goto(url(e.branch));
      const skyLink = page.getByRole("link", {name: "Explore this calendar in the celestial chronicle", exact: true});
      await skyLink.waitFor(); await activate(skyLink);
      await page.getByRole("heading", {name: "Celestial chronicle", exact: true}).waitFor();
      assert.equal(new URL(page.url()).searchParams.get("timeline"), e.branch); assert.equal(new URL(page.url()).searchParams.get("knowledge"), "ordinary");
      await page.getByLabel("Sky display calendar", {exact: true}).waitFor();
      assert.equal(await page.getByLabel("Sky display calendar", {exact: true}).locator(`option[value="${e.privateVersion}"]`).count(), 0);
      await page.goBack(); await page.getByRole("heading", {name: "Public Coast Calendar", exact: true}).last().waitFor();
      assert.equal(new URL(page.url()).searchParams.get("timeline"), e.branch);
      await open(f.primary, false);
      await page.getByLabel("Calendar historical accounts", {exact: true}).getByRole("button", {name: /EXPLICIT_SECRET_CALENDAR_EVENT/}).waitFor();
      assert.equal(await page.getByRole("heading", {name: "CONFIDENTIAL_CALENDAR_TRADITION", exact: true}).count(), 1);
      // Hold the new ordinary collection request. The old author panel must
      // disappear immediately, including definitions, accounts and controls.
      let release!: () => void, entered!: () => void;
      const gate = new Promise<void>(resolve => {release = resolve;});
      const requested = new Promise<void>(resolve => {entered = resolve;});
      await page.route(`**/api/worlds/${f.worldId}/calendars?*`, async route => {
        if (new URL(route.request().url()).searchParams.get("ordinary") === "1") {entered(); await gate;}
        await route.continue();
      });
      await page.evaluate(() => {const u = new URL(location.href); u.searchParams.set("knowledge", "ordinary"); history.pushState(null, "", u.pathname + u.search);});
      await requested;
      assertSafe(await page.locator("main").innerText());
      assert.equal(await page.getByRole("button", {name: "New calendar", exact: true}).count(), 0);
      release(); await page.unrouteAll({behavior: "wait"});
      await page.getByLabel("Historical calendar evolution", {exact: true}).getByText("History, adoption & date comparison", {exact: true}).waitFor();
      await activate(page.getByLabel("Historical calendar evolution", {exact: true}).getByText("History, adoption & date comparison", {exact: true}));
      await page.getByLabel("Calendar historical accounts", {exact: true}).getByRole("button", {name: /Public harbor opening/}).waitFor();
      assertSafe(await page.locator("main").innerText());
      for (const id of [f.explicitEvent, f.indirectEvent, e.retainedEvent, e.privateEvent]) {
        const denied = await context.request.get(`${base}/api/worlds/${f.worldId}/history?timeline=${f.primary}&record=${id}&ordinary=1`);
        assert.equal(denied.status(), 404); assertSafe(await denied.text());
        await page.goto(`${base}/worlds/${f.worldId}?tab=history&timeline=${f.primary}&entry=${id}&knowledge=ordinary`);
        await page.getByRole("alert").filter({hasText: /unavailable/}).first().waitFor();
        assert.equal(await page.getByRole("dialog").count(), 0); assertSafe(await page.locator("main").innerText());
      }
      const pinned = await context.request.get(`${base}/api/worlds/${f.worldId}/peoples?timeline=${f.primary}&record=${e.holder}&source=${e.retainedVersion}&ordinary=1`);
      assert.equal(pinned.status(), 404); assertSafe(await pinned.text());
      await page.goto(`${base}/worlds/${f.worldId}?tab=individuals&timeline=${f.primary}&entity=${e.holder}`);
      await activate(page.getByRole("button", {name: "RETAINED_SECRET_CALENDAR_EVENT", exact: true}));
      await page.getByRole("dialog").getByRole("heading", {name: "RETAINED_SECRET_CALENDAR_EVENT", exact: true}).waitFor();
      await page.evaluate(() => {const u = new URL(location.href); u.searchParams.set("knowledge", "ordinary"); history.pushState(null, "", u.pathname + u.search);});
      await page.getByRole("heading", {name: "Public calendar reader", exact: true}).waitFor();
      assert.equal(await page.getByRole("dialog").count(), 0);
      assertSafe(await page.locator("main").innerText());
      await open();
      await page.screenshot({path: `${directory}/corrected-${phone ? "phone" : "desktop"}.png`, fullPage: true});
      await page.screenshot({path: `${directory}/corrected-${phone ? "phone" : "desktop"}-viewport.png`});
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Calendar reading must fit phone width");
      results.push({device: phone ? "native-touch phone" : "desktop", publicEventsAcrossPages: e.publicEvents.length, secretAccountsAndReformsWithheld: true, loadingTransitionSafe: true, selectedTimelineThroughNavigationReloadAndBackForward: true, retainedReaderAndComparisonsSafe: true});
    } finally {await context.close();}
  }
  for (const [user, review, ip] of [["world-admin", true, "245"], ["other-god", false, "246"], ["world-player", false, "247"], [null, false, "248"]] as const) {
    const context = await browser.newContext({viewport: {width: 1440, height: 900}, extraHTTPHeaders: {"X-Forwarded-For": `198.51.100.${ip}`}});
    try {
      if (user) await signIn(context, base, user);
      const response = await context.request.get(api(f.primary, true, review));
      if (review) {
        assert.equal(response.status(), 200); assertSafe(await response.text());
        const author = await context.request.get(api(f.primary, false, true));
        assert.equal(author.status(), 200); assert.ok((await author.text()).includes(f.explicitEvent));
        const denied = await context.request.get(api(f.primary, false, false)); assert.equal(denied.status(), 404);
        const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
        await page.goto(url(f.primary, false, true));
        await page.getByLabel("Historical calendar evolution", {exact: true}).getByText("History, adoption & date comparison", {exact: true}).click();
        await page.getByLabel("Calendar historical accounts", {exact: true}).getByRole("button", {name: /EXPLICIT_SECRET_CALENDAR_EVENT/}).waitFor();
        assert.equal(await page.getByRole("button", {name: "New calendar", exact: true}).count(), 0);
        assert.equal(await page.getByRole("button", {name: "Record reform", exact: true}).count(), 0);
        await page.goto(url(f.primary, true, true));
        await page.getByLabel("Historical calendar evolution", {exact: true}).getByText("History, adoption & date comparison", {exact: true}).click();
        await page.getByLabel("Calendar historical accounts", {exact: true}).getByRole("button", {name: /Public harbor opening/}).waitFor();
        assertSafe(await page.locator("main").innerText());
        const write = await context.request.post(`${base}/api/worlds/${f.worldId}/calendars/history`, {headers: {Origin: base}, data: {action: "origin", label: "Forged review", description: "Read-only review cannot write."}}); assert.equal(write.status(), 404);
      } else {
        assert.equal(response.status(), user === "world-player" ? 403 : user ? 404 : 401); assertSafe(await response.text());
        const direct = await context.request.get(url(), {maxRedirects: 0});
        const body = await direct.text(); assertSafe(body);
        assert.equal(body.includes("Calendar History privacy checkpoint"), false);
        assert.equal(body.includes("Public harbor opening"), false);
        const page = await context.newPage();
        await page.goto(url());
        if (user === "other-god") {
          // Installed Next docs: streamed notFound responses can be HTTP 200.
          assert.ok([200, 404].includes(direct.status()), `Foreign World status ${direct.status()}`);
          await page.getByRole("heading", {name: "404", exact: true}).waitFor();
        } else await page.waitForURL(/\/(access|login)(\?|$)/);
        assert.equal(await page.getByRole("heading", {name: "Calendar History privacy checkpoint", exact: true}).count(), 0);
        assert.equal(await page.getByLabel("Calendar historical accounts", {exact: true}).count(), 0);
      }
    } finally {await context.close();}
  }
  assert.deepEqual(await privacySnapshot(pool, f.worldId), before);
  assert.equal(errors.length, 0);
  const touch = await browser.newContext({viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true, extraHTTPHeaders: {"X-Forwarded-For": "198.51.100.249"}});
  try {
    await signIn(touch, base);
    const page = await touch.newPage(); page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${base}/worlds/${f.worldId}?tab=history&timeline=${f.primary}&entry=${f.publicEvent}`);
    await page.getByRole("dialog").getByRole("heading", {name: "Public harbor opening", exact: true}).waitFor();
    await page.getByRole("dialog").getByRole("button", {name: "Archive", exact: true}).tap();
    await page.getByRole("dialog").getByRole("button", {name: "Archive history", exact: true}).tap();
    await page.getByRole("dialog").waitFor({state: "hidden"});
    await page.goto(url());
    await page.getByLabel("Historical calendar evolution", {exact: true}).getByText("History, adoption & date comparison", {exact: true}).tap();
    const list = page.getByLabel("Calendar historical accounts", {exact: true});
    await list.getByRole("button", {name: /Public dated account 00/}).waitFor();
    assert.equal(await list.getByRole("button", {name: /Public harbor opening/}).count(), 0);
    await list.getByLabel("Include archived calendar accounts", {exact: true}).check();
    await list.getByRole("button", {name: /Public harbor opening.*archived/}).waitFor();
    assertSafe(await list.innerText());
    await page.goto(`${base}/worlds/${f.worldId}?tab=history&timeline=${f.primary}&entry=${f.publicEvent}`);
    await page.getByRole("dialog").getByRole("button", {name: "Restore", exact: true}).tap();
    await page.getByRole("dialog").getByRole("button", {name: "Restore history", exact: true}).tap();
    await page.getByRole("dialog").waitFor({state: "hidden"});
    await page.goto(url());
    await page.getByLabel("Historical calendar evolution", {exact: true}).getByText("History, adoption & date comparison", {exact: true}).tap();
    await page.getByLabel("Calendar historical accounts", {exact: true}).getByRole("button", {name: /Public harbor opening/}).waitFor();
    const after = await privacySnapshot(pool, f.worldId);
    for (const [table, rows] of Object.entries(before)) {
      const original = rows as {row: unknown}[], actual = after[table] as {row: unknown}[];
      for (const row of original) assert.ok(actual.some(v => JSON.stringify(v) === JSON.stringify(row)), `Archive/restore rewrote ${table}`);
      if (table !== "world_history_version") assert.deepEqual(actual, original);
      else assert.equal(actual.length, original.length + 2, "Only the explicit archive/restore versions are appended");
    }
  } finally {await touch.close();}
  assert.deepEqual(errors, []);
  await writeFile(`${directory}/browser-results.json`, JSON.stringify({results, administratorAuthorAndOrdinaryReviewReadOnly: true, foreignGodPlayerAnonymousDenied: true, noBrowserErrors: true, immutableSavedDataUnchanged: true}, null, 2) + "\n");
  console.log("PASS: calendar privacy desktop/native-touch phone, full pagination, delayed ordinary transitions, direct URLs, comparisons/pins, selected alternate/nested navigation/reload/Back/Forward, author and read-only Admin views, foreign G.O.D./Player/anonymous denial; unchanged saved sources and no browser errors.");
}
