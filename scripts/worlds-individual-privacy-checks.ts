import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import type pg from "pg";
import type { Browser, BrowserContext, Page } from "playwright-core";
import { captureWorldsScreenshot } from "./worlds-browser-evidence";
import { entryDraftOf } from "../src/features/worlds/client-api";
import type { HistoricalTime } from "../src/features/worlds/history";
import { emptyLore, type LoreDraft } from "../src/features/worlds/peoples";

type Worlds = typeof import("../src/features/worlds/world-service");
type Timelines = typeof import("../src/features/worlds/branching-history-service");
const directory = "artifacts/guidance/worlds-4b-privacy";
const known = (year: number): HistoricalTime => ({ version: 1, scale: "world-year", kind: "known", year });
const member = (targetId: string, role: string, protectedLink = false) => ({ targetId, role, authoredReference: "", account: "", protected: protectedLink });
const eventDraft = (title: string, eventType: string) => ({ title, eventType, account: title, notes: "PRIVATE_HISTORY_NOTES", time: known(10), accuracy: "disputed" as const, narrative: "recorded" as const, visibility: "ordinary" as const, eraIds: [] });

export async function individualPrivacyServiceChecks(worlds: Worlds, timelines: Timelines, pool: pg.Pool) {
  const lore = await import("../src/features/worlds/peoples-service");
  const history = await import("../src/features/worlds/history-index-service");
  const links = await import("../src/features/worlds/milestone-service");
  const atlas = await import("../src/features/worlds/atlas-service");
  const placeHistory = await import("../src/features/worlds/atlas-milestone-service");
  const worldId = await worlds.createWorld("world-god", { name: "Protected individual relationships" });
  const primary = (await worlds.getWorld("world-god", worldId)).selectedTimeline.id;
  const create = (family: LoreDraft["family"], name: string, extra: Partial<LoreDraft> = {}) =>
    lore.changePeople("world-god", worldId, { action: "create", timelineId: primary, requestId: randomUUID(), draft: { ...emptyLore(family), name, time: known(5), ...family === "relationship" ? { fields: { relationshipType: "Original personal relationship" } } : {}, ...extra } });
  const get = (id: string, timelineId = primary, ordinary = false) => lore.getPeople("world-god", worldId, timelineId, id, false, ordinary);
  const save = async (id: string, extra: Partial<LoreDraft>, timelineId = primary) => {
    const current = await get(id, timelineId);
    return lore.changePeople("world-god", worldId, { action: "save", timelineId, id, revision: current.revision, draft: { ...current.draft, ...extra } });
  };
  const resolve = async (id: string, timelineId: string, decision: "include" | "exclude") => {
    const current = await get(id, timelineId);
    return lore.changePeople("world-god", worldId, { action: "resolve", timelineId, id, revision: current.revision, decision });
  };
  const link = async (entryId: string, targetId: string, kind: "lore" | "geography", eventType: string) => {
    const current = await history.historyEntry("world-god", worldId, primary, entryId);
    await links.linkMilestone("world-god", worldId, { timelineId: primary, entryId, revision: current.revision, targetId, kind, eventType });
  };
  const event = (title: string, eventType: string) => worlds.changeHistory("world-god", worldId, { entity: "entry", action: "save", timelineId: primary, draft: eventDraft(title, eventType) });
  const iona = await create("individual", "Iona", { visibility: "protected" });
  const vale = await create("individual", "Vale", { description: "An ordinary public biography." });
  const parent = await create("relationship", "Iona is Vale's true parent", { fields: { relationshipType: "True ancestry" }, participants: [member(iona, "true parent"), member(vale, "descendant")], milestones: [{ eventType: "Confidential ancestry ceremony", draft: eventDraft("Iona appears at Vale's birth", "Confidential ancestry ceremony") }] });
  const saved = await lore.getPeople("world-god", worldId, primary, parent);
  assert.equal(saved.draft.visibility, "ordinary");
  assert.equal((await pool.query("select count(*)::int n from world_lore_participant where version_id=$1 and not protected", [saved.versionId])).rows[0].n, 2);
  assert.equal((await lore.listPeoples("world-god", worldId, primary, false, true, "Iona")).records.length, 0, "An ordinary relationship must not disclose its protected target through its title");
  const authoredEvent = saved.milestoneRecords[0].id;
  assert.equal((await history.historyEntry("world-god", worldId, primary, authoredEvent)).visibility ?? "ordinary", "ordinary", "The read boundary must handle nominally ordinary saved events");
  const rin = await create("individual", "Rin"), sera = await create("individual", "Sera");
  const companion = await create("relationship", "Vale and Rin are companions", { participants: [member(vale, "companion"), member(rin, "companion")] });
  const friendship = await create("relationship", "Vale and Sera share a friendship", { participants: [member(vale, "friend"), member(sera, "friend")] });
  const explicit = await create("relationship", "Confidential Vale and Rin affiliation", { participants: [member(vale, "member"), member(rin, "secret member", true)] });
  const multi = await create("relationship", "Iona, Rin and Sera are Vale's progenitors", { participants: [member(iona, "parent"), member(rin, "creator"), member(sera, "creator"), member(vale, "descendant")] });
  const species = await create("species", "Public species with confidential event links");
  const place = randomUUID();
  await atlas.changeAtlas("world-god", worldId, { action: "geography", draft: { id: place, revision: null, name: "Public harbor", description: "", kind: "location", context: "settlement", parentId: null } });
  const geo = { id: randomUUID(), geographyId: place, destinationId: null, relationshipType: "account location", account: "", time: known(10), protected: false };
  await save(parent, { geographies: [geo] });
  for (const [target, kind, type] of [[vale, "lore", "Secret parent witness"], [species, "lore", "Confidential species witness"], [place, "geography", "Confidential harbor ceremony"]] as const) await link(authoredEvent, target, kind, type);
  // An existing manual event and a later History edit must get the same guard.
  const manualEvent = await event("Iona's confidential meeting with Vale", "Confidential manual parent event");
  await link(manualEvent, vale, "lore", "Confidential meeting witness");
  await link(manualEvent, iona, "lore", "Confidential hidden parent");
  const oldManual = await history.historyEntry("world-god", worldId, primary, manualEvent);
  await worlds.changeHistory("world-god", worldId, { entity: "entry", action: "save", timelineId: primary, id: manualEvent, revision: oldManual.revision, draft: { ...entryDraftOf(oldManual), title: "Iona's corrected confidential meeting with Vale", visibility: "ordinary" } });
  const publicEvent = await event("Vale visits the public harbor", "Public life event");
  await link(publicEvent, vale, "lore", "Public traveler");
  await link(publicEvent, place, "geography", "Public visit");
  // Keep an old ordinary pin, then attach a secret identity to the effective event.
  const oldPinEvent = await event("Vale's older confidential parent account", "Confidential old pin type");
  const oldPinVersion = (await history.historyEntry("world-god", worldId, primary, oldPinEvent)).historyContext!.versionId;
  const manualVersion = (await history.historyEntry("world-god", worldId, primary, manualEvent)).historyContext!.versionId;
  const publicVersion = (await history.historyEntry("world-god", worldId, primary, publicEvent)).historyContext!.versionId;
  await save(vale, { participants: [member(iona, "confidential affiliation", true)], historyRefs: [{ entityId: oldPinEvent, versionId: oldPinVersion }, { entityId: manualEvent, versionId: manualVersion }, { entityId: publicEvent, versionId: publicVersion }] });
  await link(oldPinEvent, iona, "lore", "Confidential retained parent");
  await link(oldPinEvent, vale, "lore", "Confidential retained witness");
  const secretEvents = [authoredEvent, manualEvent, oldPinEvent];
  const secretRelationships = [parent, explicit, multi];
  const assertHidden = async (timelineId = primary) => {
    for (const id of secretRelationships) await assert.rejects(get(id, timelineId, true), /unavailable/);
    for (const id of secretEvents) {
      await assert.rejects(history.historyEntry("world-god", worldId, timelineId, id, false, true), /unavailable/);
      await assert.rejects(links.milestoneLinks("world-god", worldId, timelineId, id, false, true), /unavailable/);
    }
    const records = await lore.listPeoples("world-god", worldId, timelineId, false, true, "Iona");
    assert.deepEqual(records.records, []); assert.equal(records.hasMore, false);
    const indexed = await history.searchHistory("world-god", worldId, timelineId, {}, false, true);
    assert.equal(indexed.entries.some(e => secretEvents.includes(e.id)), false);
    assert.equal(indexed.eventTypes.some(type => type.includes("Confidential") || type.includes("Secret")), false);
    assert.equal(indexed.categories.includes("species"), false, "A hidden event must not contribute categories through another ordinary identity");
    for (const query of ["Iona", "Confidential", "Secret parent witness"]) assert.deepEqual((await history.searchHistory("world-god", worldId, timelineId, { q: query }, false, true)).entries, []);
    for (const category of ["species", "relationship"]) assert.deepEqual((await history.searchHistory("world-god", worldId, timelineId, { category }, false, true)).entries, []);
    assert.equal((await placeHistory.placeMilestones("world-god", worldId, timelineId, place, false, true)).events.some(e => secretEvents.includes(e.id)), false);
    assert.equal((await lore.peoplesAtPlace("world-god", worldId, timelineId, place, false, true)).records.some(r => secretRelationships.includes(r.id)), false);
    const refs = await lore.peoplesReferences("world-god", worldId, timelineId, false, true);
    assert.equal(refs.entities.some(e => secretRelationships.includes(e.id) || e.id === iona), false);
    assert.equal(refs.history.some(e => secretEvents.includes(e.entityId)), false);
    const ordinaryVale = await get(vale, timelineId, true);
    assert.equal(ordinaryVale.draft.description, "An ordinary public biography.");
    assert.equal(ordinaryVale.participants.some(p => p.targetId === iona), false);
    assert.equal(ordinaryVale.related.some(r => secretRelationships.includes(r.id)), false);
    assert.equal(ordinaryVale.milestoneRecords.some(e => secretEvents.includes(e.id)), false);
    assert.equal(ordinaryVale.historyNames.some(e => secretEvents.includes(e.entityId)), false);
    await assert.rejects(lore.pinnedHistoricalSource("world-god", worldId, timelineId, vale, oldPinVersion, false, true), /unavailable/);
    await assert.rejects(lore.pinnedHistoricalSource("world-god", worldId, timelineId, vale, manualVersion, false, true), /unavailable/);
  };
  await assertHidden();
  const publicVale = await get(vale, primary, true);
  assert.ok(publicVale.related.some(r => r.id === companion)); assert.ok(publicVale.related.some(r => r.id === friendship));
  assert.ok(publicVale.milestoneRecords.some(e => e.id === publicEvent));
  assert.equal((await lore.pinnedHistoricalSource("world-god", worldId, primary, vale, publicVersion, false, true) as { title: string }).title, "Vale visits the public harbor");
  assert.equal((await get(parent)).participants.length, 2); assert.equal((await get(multi)).participants.length, 4);
  assert.equal((await links.milestoneLinks("world-god", worldId, primary, authoredEvent)).links.length, 4);
  assert.equal((await lore.pinnedHistoricalSource("world-god", worldId, primary, vale, oldPinVersion) as { title: string }).title, "Vale's older confidential parent account");
  // Relationship dependencies can be nested or cyclic; only seeded secrecy propagates.
  const indirectA = await create("relationship", "Confidential indirect account A", { participants: [member(vale, "member"), member(rin, "member")] });
  const indirectB = await create("relationship", "Confidential indirect account B", { participants: [member(indirectA, "account"), member(iona, "subject")] });
  await save(indirectA, { participants: [member(indirectB, "account"), member(vale, "subject")] });
  for (const id of [indirectA, indirectB]) await assert.rejects(get(id, primary, true), /unavailable/);
  const safeCycleA = await create("relationship", "Public circular account A", { participants: [member(vale, "member"), member(rin, "member")] });
  const safeCycleB = await create("relationship", "Public circular account B", { participants: [member(safeCycleA, "account"), member(vale, "member")] });
  await save(safeCycleA, { participants: [member(safeCycleB, "account"), member(rin, "member")] });
  for (const id of [safeCycleA, safeCycleB]) assert.equal((await get(id, primary, true)).id, id);
  const branch = await timelines.changeTimeline("world-god", worldId, { action: "create", parentRevision: 1, draft: { parentId: primary, name: "Public ancestry interpretation", description: "Explicit local privacy interpretation", divergenceYear: 20 } });
  const included = [iona, vale, rin, sera, species, parent, companion, friendship, explicit, multi];
  assert.equal((await get(iona, branch)).mode, "pending");
  for (const id of included.filter(id => id !== iona)) await resolve(id, branch, "include");
  await assertHidden(branch); // pending participant despite an included ordinary relationship
  await resolve(iona, branch, "exclude"); await assertHidden(branch);
  await resolve(iona, branch, "include"); await assertHidden(branch); // inherited protection
  await save(iona, { visibility: "ordinary" }, branch);
  assert.equal((await get(iona, branch)).mode, "interpretation");
  assert.equal((await get(parent, branch, true)).id, parent); assert.equal((await get(multi, branch, true)).participants.length, 4);
  for (const id of secretEvents) assert.equal((await history.historyEntry("world-god", worldId, branch, id, false, true)).id, id);
  await assert.rejects(get(explicit, branch, true), /unavailable/); // explicit protection still wins
  await assertHidden(); // Primary remains protected; no lookup of its latest source
  const nested = await timelines.changeTimeline("world-god", worldId, { action: "create", parentRevision: 1, draft: { parentId: branch, name: "Confidential ancestry interpretation", description: "Nested independent source", divergenceYear: 30 } });
  for (const id of included) await resolve(id, nested, "include");
  await save(iona, { visibility: "protected" }, nested); await assertHidden(nested);
  // Changing Primary must not rewrite the child or nested effective source.
  const childPin = (await get(iona, branch)).versionId, nestedPin = (await get(iona, nested)).versionId;
  await save(iona, { visibility: "ordinary" });
  assert.equal((await get(iona, branch)).versionId, childPin); assert.equal((await get(iona, nested)).versionId, nestedPin);
  await assertHidden(nested); assert.equal((await get(parent, branch, true)).id, parent);
  await save(iona, { visibility: "protected" }); await assertHidden();
  // Adopt a relationship alone: its target is absent, then pending, then excluded.
  const late = await create("individual", "Later ordinary parent identity");
  const lateRelationship = await create("relationship", "Later ordinary parent identity and Vale", { participants: [member(late, "parent"), member(vale, "descendant")] });
  const adopt = async (id: string) => { const source = await get(id); await lore.changePeople("world-god", worldId, { action: "adopt-source", timelineId: branch, id, revision: 0, parentVersionId: source.versionId, parentRevision: source.revision }); };
  await adopt(lateRelationship); await resolve(lateRelationship, branch, "include");
  await assert.rejects(get(lateRelationship, branch, true), /unavailable/);
  await adopt(late); await assert.rejects(get(lateRelationship, branch, true), /unavailable/);
  await resolve(late, branch, "include"); assert.equal((await get(lateRelationship, branch, true)).id, lateRelationship);
  await resolve(late, branch, "exclude"); await assert.rejects(get(lateRelationship, branch, true), /unavailable/);
  // Archived secrets must not gain origin/latest-source fallback visibility.
  let current = await get(iona);
  await lore.changePeople("world-god", worldId, { action: "archive", timelineId: primary, id: iona, revision: current.revision });
  await assertHidden(); assert.equal((await get(parent)).participants.find(p => p.targetId === iona)!.unavailable, true);
  current = await get(iona);
  await lore.changePeople("world-god", worldId, { action: "restore", timelineId: primary, id: iona, revision: current.revision });
  // Old event pins also cannot bypass an excluded selected event head.
  const nestedEvent = await history.historyEntry("world-god", worldId, nested, publicEvent);
  await timelines.changeTimeline("world-god", worldId, { action: "resolve", id: nested, entityId: publicEvent, revision: nestedEvent.revision, decision: "exclude" });
  await assert.rejects(lore.pinnedHistoricalSource("world-god", worldId, nested, vale, publicVersion, false, true), /unavailable/);
  const allIdentityIds = [iona, vale, rin, sera, parent, companion, friendship, explicit, multi, species, indirectA, indirectB, safeCycleA, safeCycleB, late, lateRelationship];
  assert.equal((await pool.query("select count(*)::int n from world_lore_identity where world_id=$1", [worldId])).rows[0].n, allIdentityIds.length);
  for (const id of [...secretEvents, publicEvent]) assert.equal((await pool.query("select count(*)::int n from world_historical_entry where id=$1", [id])).rows[0].n, 1);
  assert.equal((await pool.query("select payload->>'title' title from world_history_version where id=$1", [oldManual.historyContext!.versionId])).rows[0].title, "Iona's confidential meeting with Vale");
  const snapshot = async () => (await pool.query("select md5(coalesce(jsonb_agg(to_jsonb(v) order by id)::text,'')) digest from world_lore_version v where world_id=$1 union all select md5(coalesce(jsonb_agg(to_jsonb(v) order by id)::text,'')) from world_history_version v where world_id=$1", [worldId])).rows;
  const beforeReads = await snapshot();
  await assertHidden(); await assertHidden(nested);
  for (const user of ["other-god", "world-player", "anonymous", "world-admin"]) {
    await assert.rejects(lore.getPeople(user, worldId, primary, parent, false, true), /unavailable|access/);
    await assert.rejects(history.historyEntry(user, worldId, primary, authoredEvent, false, true), /unavailable|access/);
  }
  assert.equal((await lore.getPeople("world-admin", worldId, primary, parent, true)).participants.length, 2);
  await assert.rejects(lore.getPeople("world-admin", worldId, primary, parent, true, true), /unavailable/);
  assert.equal((await lore.listPeoples("world-admin", worldId, primary, true)).canEdit, false);
  await assert.rejects(lore.changePeople("world-admin", worldId, { action: "archive", timelineId: primary, id: parent, revision: (await get(parent)).revision }), /unavailable/);
  assert.deepEqual(await snapshot(), beforeReads, "Ordinary projection preserves every immutable source");
  await mkdir(directory, { recursive: true });
  const fixture = { worldId, primary, branch, nested, iona, vale, rin, parent, companion, explicit, multi, authoredEvent, manualEvent, oldPinEvent, oldPinVersion, publicEvent, publicVersion, place, lateRelationship };
  await writeFile(`${directory}/service-results.json`, JSON.stringify({ ...fixture, actualSavedUnprotectedParticipants: 2, cases: ["A protected target/unprotected link", "B explicit link protection", "C public biography/private affiliation", "D editor/manual/corrected events and old pins", "E selected inherited/interpretation/pending/excluded/missing/nested sources", "F multi-party and cyclic relationships", "G stable IDs and immutable sources", "H owner/foreign/Player/anonymous/read-only Administrator"], ordinaryHiddenEvents: secretEvents, immutableSourcesUnchangedByReads: true }, null, 2) + "\n");
  console.log("PASS: 4B correction A–H: real protected Iona/unprotected parent links, public Vale affiliations, whole-event/Atlas/facet/reference privacy, old pins, multi-party/cyclic accounts, independent selected timeline decisions, stable identities and unchanged immutable sources, all authorization roles.");
  return fixture;
}

async function signIn(context: BrowserContext, base: string, user = "world-god") {
  const response = await context.request.post(`${base}/api/auth/sign-in/email`, { headers: { Origin: base }, data: { email: `${user}@example.invalid`, password: "Worlds-Test-Only-Password!" } });
  assert.equal(response.status(), 200, await response.text());
}

export async function individualPrivacyBrowserChecks(browser: Browser, base: string, fixture: Awaited<ReturnType<typeof individualPrivacyServiceChecks>>) {
  const contexts: BrowserContext[] = [], errors: string[] = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { "X-Forwarded-For": "198.51.100.201" } }); contexts.push(context);
  await signIn(context, base);
  const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
  const api = `${base}/api/worlds/${fixture.worldId}`;
  const individualUrl = (timeline = fixture.primary, entity = fixture.vale, ordinary = true) => `${base}/worlds/${fixture.worldId}?tab=individuals&timeline=${timeline}&entity=${entity}${ordinary ? "&knowledge=ordinary" : ""}`;
  const historyUrl = `${base}/worlds/${fixture.worldId}?tab=history&timeline=${fixture.primary}&knowledge=ordinary`;
  const details = (p: Page) => p.locator('article[aria-label="World entity details"]');
  async function readPublic(p: Page, timeline = fixture.primary) {
    await p.goto(individualUrl(timeline));
    await p.getByRole("heading", { name: "Vale", exact: true }).waitFor({ state: "visible" });
    await p.getByRole("button", { name: "Return to author knowledge", exact: true }).waitFor({ state: "visible" });
    const text = await details(p).innerText();
    assert.ok(text.includes("An ordinary public biography."));
    if (timeline !== fixture.branch) assert.equal(text.includes("Iona"), false);
    assert.equal(text.includes("Confidential Vale and Rin affiliation"), false);
    assert.equal(await p.getByRole("button", { name: /^History \d/ }).count(), 0, "Author event totals are withheld from ordinary navigation");
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  try {
    // Every ordinary HTTP reader withholds complete sensitive sources, including IDs.
    const hidden = ["Iona", fixture.iona, fixture.parent, fixture.multi, fixture.authoredEvent, fixture.manualEvent, fixture.oldPinEvent, "Confidential", "Secret parent witness"];
    const reads: [string, number][] = [
      [`/peoples?timeline=${fixture.primary}&ordinary=1`, 200],
      [`/peoples?timeline=${fixture.primary}&ordinary=1&refs=1`, 200],
      [`/peoples?timeline=${fixture.primary}&ordinary=1&q=Iona&family=relationship`, 200],
      [`/peoples?timeline=${fixture.primary}&ordinary=1&place=${fixture.place}`, 200],
      [`/peoples?timeline=${fixture.primary}&ordinary=1&record=${fixture.vale}`, 200],
      [`/peoples?timeline=${fixture.primary}&ordinary=1&record=${fixture.parent}`, 404],
      [`/peoples?timeline=${fixture.primary}&ordinary=1&record=${fixture.iona}`, 404],
      [`/peoples?timeline=${fixture.primary}&ordinary=1&record=${fixture.vale}&source=${fixture.oldPinVersion}`, 404],
      [`/history?timeline=${fixture.primary}&ordinary=1`, 200],
      [`/history?timeline=${fixture.primary}&ordinary=1&q=Iona`, 200],
      [`/history?timeline=${fixture.primary}&ordinary=1&category=species`, 200],
      [`/history?timeline=${fixture.primary}&ordinary=1&record=${fixture.authoredEvent}`, 404],
      [`/history?timeline=${fixture.primary}&ordinary=1&record=${fixture.manualEvent}`, 404],
      [`/milestones?timeline=${fixture.primary}&ordinary=1&entry=${fixture.authoredEvent}`, 404],
      [`/milestones?timeline=${fixture.primary}&ordinary=1&entry=${fixture.publicEvent}`, 200],
      [`/atlas/milestones?timeline=${fixture.primary}&ordinary=1&place=${fixture.place}`, 200],
    ];
    for (const [path, status] of reads) {
      const response = await context.request.get(api + path); assert.equal(response.status(), status, path);
      assert.match(response.headers()["cache-control"], /no-store/);
      const body = await response.text(); for (const secret of hidden) assert.equal(body.includes(secret), false, `${path}: ${secret}`);
    }
    const author = await context.request.get(`${api}/peoples?timeline=${fixture.primary}&record=${fixture.parent}`);
    assert.equal(author.status(), 200); assert.ok((await author.text()).includes("Iona is Vale's true parent"));
    await page.goto(individualUrl(fixture.primary, fixture.parent, false));
    await page.getByRole("heading", { name: "Iona is Vale's true parent", exact: true }).waitFor({ state: "visible" });
    await captureWorldsScreenshot(page, { path: `${directory}/desktop-author.png`, fullPage: false });
    await readPublic(page);
    await page.getByRole("button", { name: "Vale and Rin are companions", exact: true }).waitFor({ state: "visible" });
    await captureWorldsScreenshot(page, { path: `${directory}/desktop-ordinary.png`, fullPage: false });
    // History → individual → History must retain ordinary knowledge on navigation.
    await details(page).getByRole("link", { name: "Vale visits the public harbor", exact: true }).click();
    assert.equal(new URL(page.url()).searchParams.get("knowledge"), "ordinary");
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("heading", { name: "Vale visits the public harbor", exact: true }).waitFor({ state: "visible" });
    await dialog.getByRole("link", { name: "Vale", exact: true }).waitFor({ state: "visible" });
    assert.ok((await dialog.getByRole("link", { name: "Public harbor", exact: true }).getAttribute("href"))?.includes("ordinary=1"));
    await dialog.getByRole("link", { name: "Vale", exact: true }).click();
    await page.getByRole("heading", { name: "Vale", exact: true }).waitFor({ state: "visible" });
    assert.equal(new URL(page.url()).searchParams.get("knowledge"), "ordinary");
    assert.equal((await details(page).innerText()).includes("Iona"), false);
    await page.getByLabel("Record family", { exact: true }).selectOption("relationship");
    await page.getByLabel("Search individuals", { exact: true }).fill("Iona");
    await page.waitForFunction(() => !document.querySelector('[aria-label="Individuals"]')?.textContent?.includes("Iona is Vale's true parent"));
    const search = await context.request.get(`${api}/peoples?timeline=${fixture.primary}&ordinary=1&q=Iona&family=relationship`);
    assert.deepEqual((await search.json()).records, []);
    await page.goto(historyUrl + "&q=Iona");
    await page.getByText("0 matching entries", { exact: false }).waitFor({ state: "visible" });
    assert.equal((await page.getByLabel("Event type", { exact: true }).innerText()).includes("Confidential"), false);
    await page.getByRole("button", { name: "Overview", exact: true }).click();
    await page.locator("aside").filter({ has: page.getByRole("heading", { name: "Recently written", exact: true }) }).getByText("Vale visits the public harbor", { exact: true }).waitFor({ state: "visible" });
    assert.equal((await page.locator("main").innerText()).includes("Iona"), false);
    await page.goto(historyUrl + `&entry=${fixture.authoredEvent}`);
    await page.getByRole("alert").filter({ hasText: "unavailable" }).waitFor({ state: "visible" });
    assert.equal(await page.getByRole("heading", { name: "Iona appears at Vale's birth", exact: true }).count(), 0);
    await readPublic(page, fixture.branch);
    assert.ok((await details(page).innerText()).includes("Iona is Vale's true parent"));
    await readPublic(page, fixture.nested);
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, extraHTTPHeaders: { "X-Forwarded-For": "198.51.100.202" } }); contexts.push(phone);
    await signIn(phone, base); const mobile = await phone.newPage(); mobile.on("pageerror", error => errors.push(error.message));
    assert.equal(await mobile.evaluate(() => navigator.maxTouchPoints > 0), true);
    await readPublic(mobile);
    await mobile.getByRole("button", { name: "Vale and Rin are companions", exact: true }).tap();
    await mobile.getByRole("heading", { name: "Vale and Rin are companions", exact: true }).waitFor({ state: "visible" });
    assert.equal(new URL(mobile.url()).searchParams.get("knowledge"), "ordinary");
    await mobile.reload(); await mobile.getByRole("button", { name: "Return to author knowledge", exact: true }).waitFor({ state: "visible" });
    await mobile.getByRole("button", { name: "Return to author knowledge", exact: true }).tap();
    await mobile.getByRole("button", { name: "Ordinary knowledge preview", exact: true }).waitFor({ state: "visible" });
    await mobile.getByRole("button", { name: "Ordinary knowledge preview", exact: true }).tap();
    await mobile.getByRole("heading", { name: "Vale and Rin are companions", exact: true }).waitFor({ state: "visible" });
    assert.equal((await details(mobile).innerText()).includes("Iona"), false);
    assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await captureWorldsScreenshot(mobile, { path: `${directory}/phone-ordinary.png`, fullPage: false });
    await mobile.goto(historyUrl + "&q=Iona");
    await mobile.getByText("0 matching entries", { exact: false }).waitFor({ state: "visible" });
    await readPublic(mobile, fixture.branch); await readPublic(mobile, fixture.nested);
    for (const user of ["anonymous", "world-player", "other-god", "world-admin"]) {
      const restricted = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": `198.51.100.${210 + contexts.length}` } }); contexts.push(restricted);
      if (user !== "anonymous") await signIn(restricted, base, user);
      for (const path of [reads[4][0], reads[11][0]]) {
        const response = await restricted.request.get(api + path); assert.ok([401, 403, 404].includes(response.status()), `${user}: ${path}`);
        assert.equal((await response.text()).includes("Iona"), false);
      }
      if (user === "world-admin") {
        const review = await restricted.request.get(`${api}/peoples?timeline=${fixture.primary}&record=${fixture.parent}&review=1`);
        assert.equal(review.status(), 200); assert.ok((await review.text()).includes("Iona"));
        const preview = await restricted.request.get(`${api}/peoples?timeline=${fixture.primary}&record=${fixture.parent}&review=1&ordinary=1`); assert.equal(preview.status(), 404);
        const adminPage = await restricted.newPage(); await adminPage.goto(individualUrl(fixture.primary, fixture.parent, false) + "&review=1");
        await adminPage.getByRole("heading", { name: "Iona is Vale's true parent", exact: true }).waitFor({ state: "visible" });
        assert.equal(await adminPage.getByRole("button", { name: "Edit record", exact: true }).count(), 0);
        const write = await restricted.request.post(`${api}/peoples`, { headers: { Origin: base }, data: { action: "create", timelineId: fixture.primary, requestId: randomUUID(), draft: { ...emptyLore("individual"), name: "Forbidden reviewer write" } } }); assert.equal(write.status(), 404);
      }
    }
    assert.deepEqual(errors, []);
    await writeFile(`${directory}/browser-results.json`, JSON.stringify({ productionDesktop: "passed", nativeTouchPhone390: "passed", ordinaryEndpointChecks: reads.length, knowledgePreservedAcrossNavigationAndReload: true, selectedPrimaryAlternateNestedPrivacy: "passed", authorizationAndReadOnlyReview: "passed", errors }, null, 2) + "\n");
    console.log("PASS: production desktop/native-touch phone protected-target privacy, ordinary source/link/facet/count HTTP readers, safe bidirectional navigation/reload, author knowledge, selected alternate/nested sources and all role/read-only review checks.");
  } finally { for (const active of contexts) await active.close(); }
}
