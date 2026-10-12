import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import type pg from "pg";
import type { Browser, Route } from "playwright-core";
import { emptyLore } from "../src/features/worlds/peoples";
import { entryDraftOf } from "../src/features/worlds/client-api";
import type { EntryDraft, WorldBundle } from "../src/features/worlds/history";

type Worlds = typeof import("../src/features/worlds/world-service");
const known = (year: number) => ({version: 1 as const, scale: "world-year" as const, kind: "known" as const, year});
const protectedEraName = "PROTECTED_CONTEXT_ERA";
const protectedPrimaryName = "PRIMARY_PROTECTED_CONTEXT_EVENT";
const protectedAlternateName = "ALTERNATE_PROTECTED_CONTEXT_EVENT";

async function snapshot(pool: pg.Pool, worldId: string) {
  const rows: Record<string, unknown> = {};
  for (const table of ["world_history_version", "world_history_head", "world_history_version_era", "world_lore_version", "world_lore_head", "world_lore_history"])
    rows[table] = (await pool.query(`select to_jsonb(t) row from ${table} t where world_id=$1 order by to_jsonb(t)::text`, [worldId])).rows;
  return rows;
}

export async function historyContextFixture(worlds: Worlds, pool: pg.Pool) {
  const history = await import("../src/features/worlds/history-index-service");
  const timelines = await import("../src/features/worlds/branching-history-service");
  const lore = await import("../src/features/worlds/peoples-service");
  const worldId = await worlds.createWorld("world-god", {name: "History reading context regression"});
  const primary = (await worlds.getWorld("world-god", worldId)).selectedTimeline.id;
  const publicEra = await worlds.changeHistory("world-god", worldId, {entity: "era", action: "save", timelineId: primary, draft: {name: "Shared ordinary era", description: "An ordinary overlapping age", startYear: 0, endYear: 30}});
  const protectedEra = await worlds.changeHistory("world-god", worldId, {entity: "era", action: "save", timelineId: primary, draft: {name: protectedEraName, description: "PROTECTED_CONTEXT_ERA_NARRATIVE", startYear: 0, endYear: 30}});
  const protectedEraVersion = (await pool.query("select version_id from world_history_head where world_id=$1 and timeline_id=$2 and entity_id=$3", [worldId, primary, protectedEra])).rows[0].version_id as string;
  const event = (title: string, visibility: "ordinary" | "protected", year = 10): EntryDraft => ({title, account: `${title} narrative`, notes: "AUTHOR_CONTEXT_NOTES", time: known(year), accuracy: "established", narrative: "recorded", visibility, eraIds: [visibility === "ordinary" ? publicEra : protectedEra]});
  const publicEvent = await worlds.changeHistory("world-god", worldId, {entity: "entry", action: "save", timelineId: primary, draft: event("Primary public treaty", "ordinary")});
  const protectedEvent = await worlds.changeHistory("world-god", worldId, {entity: "entry", action: "save", timelineId: primary, draft: event(protectedPrimaryName, "protected")});
  const publicVersion = (await history.historyEntry("world-god", worldId, primary, publicEvent)).historyContext!.versionId;
  const sourceHolder = await lore.changePeople("world-god", worldId, {action: "create", timelineId: primary, requestId: randomUUID(), draft: {...emptyLore("individual"), name: "Public source witness", time: known(5), historyRefs: [{entityId: publicEvent, versionId: publicVersion}]}});
  const protectedSourceHolder = await lore.changePeople("world-god", worldId, {action: "create", timelineId: primary, requestId: randomUUID(), draft: {...emptyLore("individual"), name: "Author source witness", time: known(5), historyRefs: [{entityId: protectedEra, versionId: protectedEraVersion}]}});
  const branch = await timelines.changeTimeline("world-god", worldId, {action: "create", parentRevision: (await worlds.getWorld("world-god", worldId)).selectedTimeline.revision, draft: {parentId: primary, divergenceYear: 15, name: "Alternate context", description: "Independent public and private accounts", explanation: "Another saved historical interpretation"}});
  const inherited = await history.historyEntry("world-god", worldId, branch, publicEvent);
  await worlds.changeHistory("world-god", worldId, {entity: "entry", action: "save", timelineId: branch, id: publicEvent, revision: inherited.revision, draft: {...entryDraftOf(inherited), title: "Alternate public treaty", account: "An independently saved alternate treaty"}});
  const alternatePublic = await worlds.changeHistory("world-god", worldId, {entity: "entry", action: "save", timelineId: branch, draft: event("Alternate ordinary discovery", "ordinary", 20)});
  const alternateProtected = await worlds.changeHistory("world-god", worldId, {entity: "entry", action: "save", timelineId: branch, draft: event(protectedAlternateName, "protected", 20)});
  const nested = await timelines.changeTimeline("world-god", worldId, {action: "create", parentRevision: (await worlds.getWorld("world-god", worldId, false, branch)).selectedTimeline.revision, draft: {parentId: branch, divergenceYear: 50, name: "Nested context", description: "Retained alternate accounts", explanation: "A later branch of the alternate timeline"}});
  // Era authoring has no visibility control. After fixture authoring finishes,
  // exercise the existing retained-payload privacy contract in each context
  // with appended disposable sources. Original versions and pins remain intact.
  for (const timeline of [primary, branch, nested]) {
    const version = randomUUID();
    await pool.query(`insert into world_history_version(id,world_id,entity_id,era_id,timeline_id,payload)
      select $1,v.world_id,v.entity_id,v.era_id,h.timeline_id,v.payload || jsonb_build_object('visibility','protected','revision',h.revision+1)
      from world_history_head h join world_history_version v on v.id=h.version_id where h.world_id=$2 and h.timeline_id=$3 and h.entity_id=$4`, [version, worldId, timeline, protectedEra]);
    await pool.query("update world_history_head set version_id=$1,revision=revision+1 where world_id=$2 and timeline_id=$3 and entity_id=$4", [version, worldId, timeline, protectedEra]);
  }
  const hidden = [protectedEra, protectedEraVersion, protectedEvent, alternateProtected, protectedEraName, "PROTECTED_CONTEXT_ERA_NARRATIVE", protectedPrimaryName, protectedAlternateName, "AUTHOR_CONTEXT_NOTES"];
  for (const timeline of [primary, branch, nested]) {
    const ordinary = await worlds.getWorld("world-god", worldId, false, timeline, true);
    assert.equal(ordinary.eras.length, 1); assert.equal(ordinary.world.eraCount, 1);
    assert.equal(ordinary.entries.length, timeline === primary ? 1 : 2);
    assert.equal(ordinary.world.entryCount, ordinary.entries.length);
    for (const value of hidden) assert.equal(JSON.stringify(ordinary).includes(value), false, value);
  }
  return {worldId, primary, branch, nested, publicEra, protectedEra, protectedEraVersion, publicEvent, protectedEvent, publicVersion, sourceHolder, protectedSourceHolder, alternatePublic, alternateProtected, hidden, original: await snapshot(pool, worldId)};
}
type Fixture = Awaited<ReturnType<typeof historyContextFixture>>;
type Hold = {match: (url: URL) => boolean; started: Promise<void>; release: () => void; finished: Promise<void>};

export async function historyContextBrowserChecks(browser: Browser, base: string, f: Fixture, pool: pg.Pool, directory: string) {
  await mkdir(directory, {recursive: true});
  const results: unknown[] = [], errors: string[] = [];
  const assertSafe = (value: string) => {for (const secret of f.hidden) assert.equal(value.includes(secret), false, secret);};
  for (const [actor, phone] of [["world-god", false], ["world-god", true], ["world-admin", false]] as const) {
    const review = actor === "world-admin";
    const context = await browser.newContext({viewport: {width: phone ? 390 : 1440, height: phone ? 844 : 900}, isMobile: phone, hasTouch: phone, extraHTTPHeaders: {"X-Forwarded-For": `198.51.100.${review ? 253 : phone ? 252 : 251}`}});
    let hold: (Hold & {arrive: () => void; done: () => void; gate: Promise<void>; captured: boolean}) | null = null;
    const delays: Hold[] = [];
    const requests: {timeline: string; ordinary: boolean; review: boolean; entries: number; eras: number}[] = [];
    const responseErrors: string[] = [];
    let failNextTimeline: string | null = null;
    const page = await context.newPage(); page.on("pageerror", e => errors.push(e.message));
    try {
      const auth = await context.request.post(`${base}/api/auth/sign-in/email`, {headers: {Origin: base}, data: {email: `${actor}@example.invalid`, password: "Worlds-Test-Only-Password!"}});
      assert.equal(auth.status(), 200);
      await page.addInitScript(({worldId, hidden}) => {
        const state = window as unknown as Window & {contextPrivacyLeaks: string[]}; state.contextPrivacyLeaks = [];
        new MutationObserver(() => {
          if (location.pathname !== `/worlds/${worldId}` || new URL(location.href).searchParams.get("knowledge") !== "ordinary") return;
          const main = document.querySelector("main");
          if (main) for (const secret of hidden) if (main.innerHTML.includes(secret)) state.contextPrivacyLeaks.push(secret);
        }).observe(document, {subtree: true, childList: true, characterData: true, attributes: true});
      }, {worldId: f.worldId, hidden: f.hidden});
      await page.route(`${base}/api/worlds/${f.worldId}?*`, async (route: Route) => {
        const url = new URL(route.request().url());
        if (failNextTimeline === url.searchParams.get("timeline")) {
          failNextTimeline = null;
          await route.fulfill({status: 503, contentType: "application/json", body: JSON.stringify({error: "The test connection was interrupted. Reload saved history to retry."})});
          return;
        }
        const response = await route.fetch();
        const body = await response.json() as WorldBundle;
        if (review && url.searchParams.get("review") !== "1") {
          try {assert.equal(response.status(), 404); assertSafe(JSON.stringify(body));}
          catch (error) {responseErrors.push((error as Error).message);}
          await route.fulfill({response}); return;
        }
        try {
          assert.equal(response.status(), 200);
          const timeline = url.searchParams.get("timeline")!;
          assert.ok([f.primary, f.branch, f.nested].includes(timeline));
          assert.equal(body.selectedTimeline.id, timeline);
          assert.equal(url.searchParams.get("review") === "1", review);
          const ordinary = url.searchParams.get("ordinary") === "1";
          if (ordinary) {assertSafe(JSON.stringify(body)); assert.equal(body.world.eraCount, 1); assert.equal(body.world.entryCount, timeline === f.primary ? 1 : 2); assert.equal(body.canEdit, false); assert.equal(body.canManageTimelines, false);}
          else assert.ok(body.entries.some(e => e.id === f.protectedEvent));
          requests.push({timeline, ordinary, review, entries: body.entries.length, eras: body.eras.length});
        } catch (error) {responseErrors.push((error as Error).message);}
        const delayed = hold && !hold.captured && hold.match(url) ? hold : null;
        if (delayed) {delayed.captured = true; delayed.arrive(); await delayed.gate;}
        try {await route.fulfill({response});} finally {delayed?.done();}
      });
      function delay(match: Hold["match"]): Hold {
        let arrive!: () => void, release!: () => void, done!: () => void;
        const started = new Promise<void>(r => {arrive = r;});
        const gate = new Promise<void>(r => {release = r;});
        const finished = new Promise<void>(r => {done = r;});
        hold = {match, started, gate, release, finished, arrive, done, captured: false};
        delays.push(hold);
        return hold;
      }
      const url = (timeline = f.primary, ordinary = true, entry?: string) => `${base}/worlds/${f.worldId}?tab=history&historyView=list&timeline=${timeline}${review ? "&review=1" : ""}${ordinary ? "&knowledge=ordinary" : ""}${entry ? `&entry=${entry}` : ""}`;
      const activate = async (name: string) => {const target = page.getByRole("button", {name, exact: true}); if (phone) await target.tap(); else await target.click();};
      async function noTransientLeaks() {assert.deepEqual(await page.evaluate(() => (window as unknown as Window & {contextPrivacyLeaks: string[]}).contextPrivacyLeaks), []);}
      async function ready(timeline: string, ordinary = true) {
        await page.getByLabel("Selected timeline", {exact: true}).waitFor();
        await page.waitForFunction(expected => (document.querySelector('select[aria-label="Selected timeline"]') as HTMLSelectElement)?.value === expected && !document.querySelector('main [role="status"]')?.textContent?.includes("Loading the selected history"), timeline);
        await page.getByRole("button", {name: ordinary ? "Return to author history" : "Ordinary-knowledge history preview", exact: true}).waitFor();
        await page.getByRole("button", {name: timeline === f.primary ? "Primary public treaty" : "Alternate public treaty", exact: true}).waitFor();
        if (ordinary) assertSafe(await page.locator("main").innerHTML());
        await noTransientLeaks();
        if (review) assert.equal(await page.getByRole("button", {name: "New entry", exact: true}).count(), 0);
      }
      async function pendingSafe() {
        await page.getByRole("status").filter({hasText: "Loading the selected history view"}).waitFor();
        assertSafe(await page.locator("main").innerHTML());
        assert.equal(await page.getByRole("dialog").count(), 0);
        assert.equal(await page.getByRole("button", {name: "New entry", exact: true}).count(), 0);
        assert.equal(await page.getByLabel("Historical era", {exact: true}).count(), 0);
        assert.equal(await page.locator("main strong").count(), 0, "Author counts must be absent while the ordinary projection loads");
        await noTransientLeaks();
      }
      async function settled() {await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));}
      if (!review) {
        await page.goto(url(f.primary, false)); await ready(f.primary, false);
        await page.getByLabel("Selected timeline", {exact: true}).selectOption(f.branch); await ready(f.branch, false);
        await activate("New entry");
        await page.getByRole("dialog").getByLabel("Entry title", {exact: true}).fill("Retained cancelled-navigation draft"); await settled();
        page.once("dialog", dialog => void dialog.dismiss()); await page.goBack();
        assert.equal(await page.getByRole("dialog").getByLabel("Entry title", {exact: true}).inputValue(), "Retained cancelled-navigation draft");
        assert.equal(new URL(page.url()).searchParams.get("timeline"), f.branch);
        await activate("Close editor"); await activate("Discard draft");
      }
      await page.goto(url()); await ready(f.primary);
      // The regression must switch via the live select while ordinary mode is
      // already active. Every intercepted bundle is the real HTTP response.
      await page.getByLabel("Selected timeline", {exact: true}).selectOption(f.branch); await ready(f.branch);
      assert.equal(await page.getByRole("button", {name: "Primary public treaty", exact: true}).count(), 0);
      await page.getByLabel("Selected timeline", {exact: true}).selectOption(f.nested); await ready(f.nested);
      assert.ok(requests.some(r => r.timeline === f.branch && r.ordinary));
      assert.ok(requests.some(r => r.timeline === f.nested && r.ordinary));
      await page.goBack(); await ready(f.branch); await page.goForward(); await ready(f.nested);
      await page.reload(); await ready(f.nested);
      if (review) {
        await page.evaluate(() => {const u = new URL(location.href); u.searchParams.delete("review"); history.pushState(null, "", u.pathname + u.search);});
        await page.getByRole("alert").filter({hasText: "unavailable"}).waitFor();
        assertSafe(await page.locator("main").innerHTML());
        assert.equal(await page.getByLabel("History index", {exact: true}).count(), 0);
        await page.goBack(); await ready(f.nested);
        assert.deepEqual(await page.locator("main").getByRole("alert").allTextContents(), [], "Review-context errors must not appear after returning to the authorized review");
      }
      await page.getByLabel("Selected timeline", {exact: true}).selectOption(f.primary); await ready(f.primary);
      const earlier = delay(u => u.searchParams.get("timeline") === f.branch && u.searchParams.get("ordinary") === "1");
      await page.getByLabel("Selected timeline", {exact: true}).selectOption(f.branch); await earlier.started; await pendingSafe();
      await page.getByLabel("Selected timeline", {exact: true}).selectOption(f.nested); await ready(f.nested);
      earlier.release(); await earlier.finished; await settled(); await ready(f.nested);
      // An obsolete author response is delivered after returning to ordinary
      // mode. The request is aborted and must never validate that author bundle.
      const lateAuthor = delay(u => u.searchParams.get("timeline") === f.nested && !u.searchParams.has("ordinary"));
      await activate("Return to author history"); await lateAuthor.started;
      await page.goBack(); await ready(f.nested);
      lateAuthor.release(); await lateAuthor.finished; await settled(); await ready(f.nested);
      await activate("Return to author history"); await ready(f.nested, false);
      assert.ok((await page.locator("main").innerText()).includes(protectedAlternateName));
      const ordinary = delay(u => u.searchParams.get("timeline") === f.nested && u.searchParams.get("ordinary") === "1");
      await activate("Ordinary-knowledge history preview"); await ordinary.started; await pendingSafe();
      ordinary.release(); await ordinary.finished; await ready(f.nested);
      // Retry/reload uses the currently requested context, and a late reload
      // cannot restore a different timeline after a newer interface selection.
      await page.goto(url(f.primary)); await ready(f.primary);
      const delayedReload = delay(u => u.searchParams.get("timeline") === f.branch && u.searchParams.get("ordinary") === "1");
      failNextTimeline = f.branch;
      await page.getByLabel("Selected timeline", {exact: true}).selectOption(f.branch);
      await page.getByRole("alert").filter({hasText: "The test connection was interrupted"}).waitFor();
      await activate("Reload saved history"); await delayedReload.started; await pendingSafe();
      await page.getByLabel("Selected timeline", {exact: true}).selectOption(f.nested); await ready(f.nested);
      delayedReload.release(); await delayedReload.finished; await settled(); await ready(f.nested);
      assert.deepEqual(await page.locator("main").getByRole("alert").allTextContents(), [], "An obsolete reload failure must not replace the new context");
      // Protected direct era selections cannot bypass the filtered bundle by
      // reusing an era cached in author knowledge while ordinary loading waits.
      await page.goto(url(f.primary, false, f.protectedEra));
      await page.getByRole("dialog").getByRole("heading", {name: protectedEraName, exact: true}).waitFor();
      if (!review) {
        await activate("Edit era");
        await page.getByRole("dialog").getByLabel("Era name", {exact: true}).waitFor();
      }
      const eraTransition = delay(u => u.searchParams.get("timeline") === f.primary && u.searchParams.get("ordinary") === "1");
      await page.evaluate(entry => {const u = new URL(location.href); u.searchParams.set("entry", entry); u.searchParams.set("knowledge", "ordinary"); history.pushState(null, "", u.pathname + u.search);}, f.protectedEra);
      await eraTransition.started; await pendingSafe(); eraTransition.release(); await eraTransition.finished;
      await page.getByRole("alert").filter({hasText: "unavailable"}).first().waitFor();
      assertSafe(await page.locator("main").innerHTML()); assert.equal(await page.getByRole("dialog").count(), 0);
      await activate("Return to author history"); await ready(f.primary, false);
      assert.equal(await page.getByRole("dialog").count(), 0, "The previous author editor must not reopen after its context was retired");
      await page.goto(url(f.primary, true, f.protectedEra));
      await page.reload(); await page.getByRole("alert").filter({hasText: "unavailable"}).first().waitFor(); assertSafe(await page.locator("main").innerHTML());
      await page.goto(url(f.branch, true, f.publicEvent));
      await page.getByRole("dialog").getByRole("heading", {name: "Alternate public treaty", exact: true}).waitFor();
      assertSafe(await page.getByRole("dialog").innerHTML());
      await activate("Close historical details");
      await page.getByRole("dialog").waitFor({state: "hidden"}); await settled();
      assert.equal(await page.getByRole("dialog").count(), 0, "A closed direct reader must not reopen from its former URL");
      assert.equal(new URL(page.url()).searchParams.has("entry"), false);
      await ready(f.branch);
      for (const timeline of [f.primary, f.branch, f.nested]) {
        const source = await context.request.get(`${base}/api/worlds/${f.worldId}/peoples?timeline=${timeline}&record=${f.protectedSourceHolder}&source=${f.protectedEraVersion}&ordinary=1${review ? "&review=1" : ""}`);
        assert.equal(source.status(), 404); assertSafe(await source.text());
      }
      await page.goto(`${base}/worlds/${f.worldId}?tab=individuals&timeline=${f.primary}&entity=${f.protectedSourceHolder}${review ? "&review=1" : ""}`);
      await activate(protectedEraName);
      await page.getByRole("dialog").getByRole("heading", {name: protectedEraName, exact: true}).waitFor();
      const sourceTransition = delay(u => u.searchParams.get("timeline") === f.primary && u.searchParams.get("ordinary") === "1");
      await page.evaluate(() => {const u = new URL(location.href); u.searchParams.set("knowledge", "ordinary"); history.pushState(null, "", u.pathname + u.search);});
      await sourceTransition.started; await pendingSafe(); sourceTransition.release(); await sourceTransition.finished;
      await page.getByRole("heading", {name: "Author source witness", exact: true}).waitFor();
      assert.equal(await page.getByRole("dialog").count(), 0); assertSafe(await page.locator("main").innerHTML());
      await noTransientLeaks();
      const otherWorld = await page.getByLabel("Switch world", {exact: true}).locator("option").evaluateAll((options, current) => (options as HTMLOptionElement[]).find(option => option.value !== current && !option.textContent?.includes("(archived)"))?.value, f.worldId);
      assert.ok(otherWorld);
      await page.getByLabel("Switch world", {exact: true}).selectOption(otherWorld);
      await page.waitForURL(u => u.pathname === `/worlds/${otherWorld}` && u.searchParams.get("knowledge") === "ordinary" && (u.searchParams.get("review") === "1") === review);
      await page.getByLabel("Switch world", {exact: true}).selectOption(f.worldId);
      await page.waitForURL(u => u.pathname === `/worlds/${f.worldId}` && u.searchParams.get("knowledge") === "ordinary");
      await page.getByRole("navigation", {name: "World workspace"}).getByRole("button", {name: "History", exact: true}).click();
      await activate("Chronological list");
      await ready(f.primary);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.equal(responseErrors.length, 0, responseErrors.join("\n"));
      results.push({actor, device: phone ? "native-touch phone emulation" : "desktop", actualInterfaceTimelineSwitches: true, ordinaryBundleResponsesFiltered: true, delayedAuthorToOrdinarySafe: true, staleTimelineAndKnowledgeResponsesRejected: true, protectedEraAndRetainedSourcesSafe: true, backForwardAndReload: true, worldSwitchPreservesKnowledgeAndReview: true, requests});
    } catch (failure) {console.log(JSON.stringify({historyContextFailure:await page.evaluate(()=>{const dialog=document.querySelector<HTMLDialogElement>("dialog[open]");const button=[...document.querySelectorAll<HTMLButtonElement>("dialog[open] button")].find(el=>el.textContent?.trim()==="Discard draft");const rect=button?.getBoundingClientRect();return {viewport:{width:innerWidth,height:innerHeight,visualWidth:visualViewport?.width,visualHeight:visualViewport?.height,offsetTop:visualViewport?.offsetTop,scale:visualViewport?.scale},scrollTop:dialog?.scrollTop,button:rect?.toJSON(),hit:rect?document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)?.outerHTML.slice(0,400):null};})}));await page.screenshot({path:`${directory}/history-context-failure.png`}).catch(()=>{});throw failure;} finally {for (const delayed of delays) delayed.release(); await context.close();}
  }
  assert.deepEqual(await snapshot(pool, f.worldId), f.original);
  assert.deepEqual(errors, []);
  await writeFile(`${directory}/history-context-results.json`, JSON.stringify({results, immutableSourcesUnchanged: true, noBrowserErrors: true}, null, 2));
  console.log("PASS: World bundle context desktop/native-touch phone/Admin review; live ordinary timeline switching, exact filtered HTTP bundles, delayed author/ordinary transitions, stale requests, protected-era URLs, retained readers and unchanged immutable sources.");
}
