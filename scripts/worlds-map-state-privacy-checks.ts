import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import type { Browser, BrowserContext, Page } from "playwright-core";
import type { LinkingFixtures } from "./worlds-linking-checks";
import type { MapFixtures } from "./worlds-map-state-checks";
import type { AtlasBundle } from "../src/features/worlds/atlas";
import type { MapStateBundle } from "../src/features/worlds/map-states";

export async function privacyServices(f: MapFixtures, b: LinkingFixtures, directory: string) {
  const { getMapStates } = await import("../src/features/worlds/map-state-service");
  const { getAtlas } = await import("../src/features/worlds/atlas-service");
  const results: string[] = [];
  async function check(name: string, run: () => Promise<void>) {
    await run(); results.push(name); console.log(`PASS ${name}`);
    await writeFile(`${directory}/service-results.json`, JSON.stringify({ results, passed: results.length }, null, 2));
  }
  const read = (timeline: string, options: Parameters<typeof getMapStates>[4] = {}, user = "world-god") =>
    getMapStates(user, f.worldId, f.mapId, timeline, options);
  const primary = await read(f.primary), alternate = await read(f.branch);
  const unadopted = primary.states.filter(s => !alternate.states.some(a => a.id === s.id));
  assert.ok(unadopted.length, "Completed fixtures must contain unadopted parent appearances.");
  await check("Primary/alternate authors retain sources; alternate ordinary excludes all parent choices and unadopted metadata", async () => {
    assert.equal(primary.parentStates.length, 0); assert.ok(primary.canEdit);
    assert.deepEqual(alternate.parentStates, primary.states); assert.ok(alternate.canEdit);
    const ordinary = await read(f.branch, { ordinary: true });
    assert.deepEqual(ordinary.parentStates, []); assert.equal(ordinary.canEdit, false);
    assert.equal(ordinary.bundle.canEdit, false);
    for (const state of unadopted) {
      const serialized = JSON.stringify(ordinary);
      assert.ok(!serialized.includes(state.id)); assert.ok(!serialized.includes(state.versionId));
      assert.ok(!serialized.includes(state.name));
      if (state.account) assert.ok(!serialized.includes(state.account));
    }
  });
  await check("explicit Administrator review retains legitimate parent choices and stays read-only", async () => {
    const review = await read(f.branch, { review: true }, "world-admin");
    assert.deepEqual(review.parentStates, primary.states); assert.equal(review.canEdit, false);
    assert.equal(review.bundle.canEdit, false);
    const ordinary = await read(f.branch, { review: true, ordinary: true }, "world-admin");
    assert.deepEqual(ordinary.parentStates, []); assert.equal(ordinary.canEdit, false);
    await assert.rejects(read(f.branch, {}, "world-admin"), e => (e as {status: number}).status === 404);
  });
  await check("explicitly retained sources and their authorized immutable revisions remain readable in the selected branch", async () => {
    const author = await read(f.branch, { stateId: f.earlier });
    assert.ok(author.selected?.sourceVersionId);
    const pin = author.selected.sourceVersionId;
    const current = await read(f.branch, { ordinary: true, stateId: f.earlier });
    assert.equal(current.selected?.id, f.earlier); assert.deepEqual(current.parentStates, []);
    const retained = await read(f.branch, { ordinary: true, stateId: f.earlier, versionId: pin });
    assert.equal(retained.selected?.versionId, pin); assert.equal(retained.coverage, "established");
    assert.ok(retained.bundle.maps.find(m => m.id === f.mapId)?.features.length);
    assert.equal((await read(f.primary, { stateId: f.earlier })).selected?.versionId === pin, false);
  });
  await check("protected historical appearances and protected-map geography never enter ordinary selections or projection", async () => {
    const author = await read(f.primary, { stateId: f.secret }); assert.ok(author.selected?.protected);
    const ordinary = await read(f.primary, { ordinary: true, year: author.selected.startYear });
    assert.equal(ordinary.coverage, "unknown"); assert.equal(ordinary.selected, null);
    assert.ok(!JSON.stringify(ordinary).includes("SECRET_"));
    await assert.rejects(read(f.primary, { ordinary: true, stateId: f.secret }), e => (e as {status: number}).status === 404);
    const baseline = await getAtlas("world-god", f.worldId, false, undefined, true);
    assert.equal(baseline.canEdit, false); assert.ok(!JSON.stringify(baseline).includes(b.secretMap));
    assert.ok(!baseline.geographies.some(g => g.id === b.secretPlace));
    await assert.rejects(getMapStates("world-god", f.worldId, b.secretMap, f.primary, { ordinary: true }), e => (e as {status: number}).status === 404);
  });
  await check("ordinary and author historical contexts preserve stable linked-map destinations and Realm sources", async () => {
    const ordinary = await read(f.primary, { ordinary: true, year: 50 });
    assert.equal(ordinary.selected?.id, f.later);
    assert.ok(ordinary.bundle.connections?.some(c => c.sourceMapId === f.mapId && c.destinationMapId === f.destination));
    const { getWorldLinks } = await import("../src/features/worlds/linking-service");
    const links = await getWorldLinks("world-god", f.worldId, f.primary, false, true);
    assert.ok(links.links.some(l => l.draft.kind === "realm-map" && l.draft.mapId === f.mapId));
    assert.ok(!JSON.stringify(links).includes(b.secretRealm));
  });
}

async function signIn(context: BrowserContext, base: string, user = "world-god") {
  const response = await context.request.post(`${base}/api/auth/sign-in/email`, {
    headers: { Origin: base }, data: { email: `${user}@example.invalid`, password: "Worlds-Test-Only-Password!" },
  });
  assert.equal(response.status(), 200, await response.text());
}

export async function privacyBrowser(browser: Browser, base: string, f: MapFixtures, b: LinkingFixtures, directory: string) {
  const results: string[] = process.argv.includes("--continue")
    ? JSON.parse(await readFile(`${directory}/browser-results.json`, "utf8")).results : [], errors: string[] = [];
  async function check(name: string, run: () => Promise<void>) {
    if (results.includes(name)) { console.log(`REUSE ${name}`); return; }
    await run(); results.push(name); console.log(`PASS ${name}`);
    await writeFile(`${directory}/browser-results.json`, JSON.stringify({ results, passed: results.length, errors }, null, 2));
  }
  for (const [index, phone] of [false, true].entries()) {
    const context = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      isMobile: phone, hasTouch: phone, extraHTTPHeaders: { "X-Forwarded-For": `198.51.100.${220 + index}` } });
    try {
      await signIn(context, base); const page = await context.newPage();
      page.on("pageerror", e => errors.push(e.message)); page.on("console", m => { if (m.type() === "error" && !m.text().includes("Failed to load resource")) errors.push(m.text()); });
      const prefix = `${base}/api/worlds/${f.worldId}`, name = phone ? "phone" : "desktop";
      async function read<T>(url: string): Promise<T> { const r = await context.request.get(url); assert.equal(r.status(), 200, await r.text()); return r.json(); }
      function noControls(scope: ReturnType<Page["getByRole"]>) {
        return scope.getByRole("button", { name: /^(Edit map|Edit connections|New map|New geography|Generate map|Create appearance from displayed map|Edit this historical appearance|Save map|Connect |Duplicate |Archive |Restore |Edit |Add floor|Add level)/ });
      }
      await check(`${name}: both URL aliases return identical server-filtered Atlas, states, Realm links and place milestones`, async () => {
        const publicPlace = (await read<AtlasBundle>(`${prefix}/atlas?map=${f.mapId}`)).maps.find(m => m.id === f.mapId)!.features[0].geographyId;
        for (const suffix of ["atlas", `atlas/states?map=${f.mapId}&timeline=${f.branch}`, `links?timeline=${f.primary}`, `atlas/milestones?timeline=${f.primary}&place=${publicPlace}`]) {
          const url = `${prefix}/${suffix}`, separator = suffix.includes("?") ? "&" : "?";
          const left = await read<unknown>(`${url}${separator}knowledge=ordinary`), right = await read<unknown>(`${url}${separator}ordinary=1`);
          assert.deepEqual(left, right); assert.ok(!JSON.stringify(left).includes("SECRET_"));
          if (suffix === "atlas") { const atlas = left as AtlasBundle; assert.equal(atlas.canEdit, false); assert.ok(!atlas.maps.some(m => m.id === b.secretMap)); }
          if (suffix.startsWith("atlas/states")) assert.deepEqual((left as MapStateBundle).parentStates, []);
        }
        for (const alias of ["knowledge=ordinary", "ordinary=1"]) {
          const response = await context.request.get(`${prefix}/atlas/milestones?timeline=${f.primary}&place=${b.secretPlace}&${alias}`);
          assert.equal(response.status(), 404); assert.ok(!(await response.text()).includes("SECRET_"));
        }
      });
      await check(`${name}: ordinary entry paths hide protected rendering and author controls; returning to author restores editing`, async () => {
        for (const alias of ["knowledge=ordinary", "ordinary=1"]) {
          await page.goto(`${base}/worlds/${f.worldId}?tab=atlas&timeline=${f.primary}&atlas=${f.mapId}&place=${b.secretPlace}&${alias}`);
          const explorer = page.getByRole("region", { name: "Map explorer", exact: true });
          await explorer.getByRole("button", { name: "Return to author view", exact: true }).waitFor();
          assert.equal(await noControls(explorer).count(), 0); assert.ok(!(await explorer.innerText()).includes("SECRET_"));
          await page.goto(`${base}/worlds/${f.worldId}?tab=atlas&timeline=${f.primary}&atlas=${f.mapId}&mapYear=300&${alias}`);
          await explorer.getByText("Unknown historical coverage; shared baseline reference", { exact: false }).waitFor();
          assert.equal(await noControls(explorer).count(), 0); assert.ok(!(await page.locator("body").innerText()).includes("SECRET_"));
          await explorer.getByRole("button", { name: "Map library", exact: true }).click();
          const library = page.getByRole("region", { name: "World Atlas", exact: true });
          await library.getByRole("heading", { name: "Geography records", exact: true }).waitFor();
          assert.equal(await noControls(library).count(), 0); assert.ok(!(await library.innerText()).includes("SECRET_"));
          await page.goto(`${base}/worlds/${f.worldId}?tab=atlas&timeline=${f.branch}&editMap=${f.mapId}&mapYear=-50&${alias}`);
          const history = page.getByRole("region", { name: "Historical map appearances", exact: true });
          await history.getByRole("heading", { name: "Old coast", exact: true }).waitFor();
          assert.equal(await noControls(history).count(), 0);
          assert.equal(await noControls(page.getByRole("region", { name: "Map editor", exact: true })).count(), 0);
          assert.ok(!(await history.innerText()).includes("Retain a source from"));
          assert.ok((await history.getByRole("combobox", { name: "Saved appearance", exact: true }).locator("option").allTextContents()).every(s => !s.includes("SECRET_")));
          await page.screenshot({ path: `${directory}/${name}-${alias.split("=")[0]}-ordinary.png`, fullPage: true });
          await page.goto(`${base}/worlds/${f.worldId}?tab=atlas&timeline=${f.primary}&atlas=${f.mapId}&mapYear=50&${alias}`);
          await explorer.getByText("Later coast", { exact: false }).first().waitFor();
          await explorer.getByRole("button", { name: "Return to author view", exact: true }).click();
          await explorer.getByRole("button", { name: "Edit map", exact: true }).waitFor();
          assert.equal(new URL(page.url()).searchParams.has("ordinary"), false);
          assert.equal(new URL(page.url()).searchParams.has("knowledge"), false);
          assert.equal(new URL(page.url()).searchParams.get("mapYear"), "50");
          await page.screenshot({ path: `${directory}/${name}-${alias.split("=")[0]}-author.png`, fullPage: true });
        }
      });
      await check(`${name}: stable Realm links, linked-map navigation, historical year and unsaved-draft refusal remain functional`, async () => {
        await page.goto(`${base}/worlds/${f.worldId}?tab=atlas&timeline=${f.primary}&atlas=${f.mapId}&mapYear=50`);
        const explorer = page.getByRole("region", { name: "Map explorer", exact: true });
        await explorer.getByRole("button", { name: "Later historic coast name", exact: true }).first().click();
        const dest = (await read<AtlasBundle>(`${prefix}/atlas?map=${f.destination}`)).maps.find(m => m.id === f.destination)!;
        await explorer.getByRole("button", { name: `Open ${dest.name} \u00b7 preferred`, exact: true }).click();
        await explorer.getByRole("heading", { name: dest.name, exact: true }).waitFor();
        assert.equal(new URL(page.url()).searchParams.get("mapYear"), "50");
        assert.ok(await explorer.getByRole("button", { name: "Previous map", exact: true }).count(), JSON.stringify(await page.evaluate(() => ({url:location.href,state:window.history.state}))));
        await explorer.getByRole("button", { name: "Previous map", exact: true }).click();
        await explorer.getByRole("heading", { name: "Historical coasts", exact: true }).waitFor();
        const links = explorer.locator("details").filter({ has: page.locator("summary").filter({ hasText: "Connected Realms" }) });
        if ((await links.getAttribute("open")) === null) await links.locator("summary").click();
        await links.getByText(new RegExp(`^${f.realmName} \\u2192`)).waitFor();
        const [reader] = await Promise.all([context.waitForEvent("page"), links.getByRole("link", { name: "Read the connected Realm", exact: true }).click()]);
        try { await reader.getByRole("heading", { name: f.realmName, exact: true }).waitFor(); } finally { await reader.close(); }
        await explorer.getByRole("button", { name: "Edit map", exact: true }).click();
        const history = page.getByRole("region", { name: "Historical map appearances", exact: true });
        await history.getByRole("heading", { name: "Later coast", exact: true }).waitFor();
        await history.getByRole("button", { name: "Edit this historical appearance", exact: true }).click();
        const form = history.getByRole("form", { name: "Historical appearance information", exact: true });
        await form.getByRole("textbox", { name: "Historical source account", exact: true }).fill("Unsaved privacy regression draft");
        let refused = false;
        const refuse = async (dialog: import("playwright-core").Dialog) => { refused = true; await dialog.dismiss(); };
        page.on("dialog", refuse);
        await history.getByRole("button", { name: "Return to shared baseline", exact: true }).click();
        page.off("dialog", refuse); assert.ok(refused);
        assert.equal(await form.getByRole("textbox", { name: "Historical source account", exact: true }).inputValue(), "Unsaved privacy regression draft");
        assert.equal(new URL(page.url()).searchParams.get("mapYear"), "50");
        page.once("dialog", d => d.accept()); await history.getByRole("button", { name: "Return to shared baseline", exact: true }).click();
        await history.getByRole("heading", { name: "Established map presentation", exact: true }).waitFor();
      });
      if (!phone) await check("author-to-ordinary context change removes protected historical content while the filtered response is delayed", async () => {
        await page.goto(`${base}/worlds/${f.worldId}?tab=atlas&timeline=${f.primary}&atlas=${f.mapId}&mapYear=300`);
        const explorer = page.getByRole("region", { name: "Map explorer", exact: true });
        await explorer.getByText(/SECRET_/).first().waitFor();
        let release!: () => void, reached!: () => void;
        const blocked = new Promise<void>(resolve => { release = resolve; }), requested = new Promise<void>(resolve => { reached = resolve; });
        const pending: Promise<void>[] = [], routeErrors: string[] = [];
        const delay = (route: import("playwright-core").Route) => {
          const work = (async () => {
            if (new URL(route.request().url()).searchParams.get("ordinary") === "1") { reached(); await blocked; }
            await route.continue();
          })().catch(error => { routeErrors.push(String(error)); });
          pending.push(work); return work;
        };
        await page.route("**/atlas/states?**", delay);
        try {
          await page.evaluate(() => { const url = new URL(location.href); url.searchParams.set("knowledge", "ordinary"); window.history.pushState(null, "", url.pathname + url.search); });
          await requested;
          await page.waitForFunction(() => !document.body.innerText.includes("SECRET_") && ![...document.querySelectorAll("button")].some(b => b.textContent?.trim() === "Edit map"));
        } finally { release(); await Promise.all(pending); await page.unroute("**/atlas/states?**", delay); }
        assert.deepEqual(routeErrors, []);
        await explorer.getByText("Unknown historical coverage; shared baseline reference", { exact: false }).waitFor();
      });
      if (!phone) await check("preview-qualified Atlas, appearance, connection and place mutation requests reject all aliases; owner writes still reach revision checks", async () => {
        for (const route of ["atlas", "atlas/states", "links", "atlas/milestones"]) {
          for (const alias of ["knowledge=ordinary", "ordinary=1", "review=1"]) {
            const response = await context.request.post(`${prefix}/${route}?${alias}`, { headers: { Origin: base }, data: {} });
            assert.equal(response.status(), 403, await response.text()); assert.match(await response.text(), /read-only/);
          }
        }
        for (const [route, body] of [["atlas", { action: "archive-map", id: f.mapId, revision: 999999 }],
          ["atlas/states", { action: "archive", mapId: f.mapId, timelineId: f.primary, id: f.later, revision: 999999 }]] as const) {
          const response = await context.request.post(`${prefix}/${route}`, { headers: { Origin: base }, data: body });
          assert.equal(response.status(), 409, await response.text());
        }
      });
      assert.equal(await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth)), 0);
    } finally { await context.close(); }
  }
  await check("explicit Administrator review remains readable and read-only after returning from either ordinary alias", async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { "X-Forwarded-For": "198.51.100.222" } });
    try {
      await signIn(context, base, "world-admin"); const page = await context.newPage(); page.on("pageerror", e => errors.push(e.message));
      for (const alias of ["knowledge=ordinary", "ordinary=1"]) {
        await page.goto(`${base}/worlds/${f.worldId}?tab=atlas&timeline=${f.branch}&atlas=${f.mapId}&mapYear=-50&review=1&${alias}`);
        const explorer = page.getByRole("region", { name: "Map explorer", exact: true });
        await explorer.getByText("Old coast", { exact: false }).first().waitFor();
        await explorer.getByRole("button", { name: "Return to author view", exact: true }).click();
        await explorer.getByRole("button", { name: "Map library", exact: true }).waitFor();
        assert.equal(new URL(page.url()).searchParams.get("review"), "1");
        assert.equal(await explorer.getByRole("button", { name: /^(Edit map|Edit connections)$/ }).count(), 0);
      }
    } finally { await context.close(); }
  });
  assert.deepEqual(errors, []);
}
