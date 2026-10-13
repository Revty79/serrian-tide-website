import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import type { Browser, Route } from "playwright-core";
import type { AtlasBundle } from "../src/features/worlds/atlas";
import type { MapStateBundle } from "../src/features/worlds/map-states";
import type { MapFixtures } from "./worlds-map-state-checks";

async function mountedExplorerFixture(f: MapFixtures, directory: string) {
  // The full World page intentionally remounts Atlas when its History knowledge
  // context changes. This test-only shell keeps the real Explorer mounted and
  // reads live URL changes without that outer guard. All data still comes from
  // the authenticated production API; no application route or permission changes.
  const built = await build({ bundle: true, write: false, outdir: `${directory}/fixture`, platform: "browser", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' }, loader: { ".css": "local-css" },
    stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
      import { createRoot } from "react-dom/client";
      import { useSearchParams } from "next/navigation";
      import { AtlasExplorer } from "./src/features/worlds/atlas-explorer";
      const fixture = ${JSON.stringify(f)};
      for (const method of ["pushState", "replaceState"]) {
        const original = window.history[method].bind(window.history);
        window.history[method] = (...args) => { original(...args); window.dispatchEvent(new Event("fixture-url")); };
      }
      function Fixture() { const query = useSearchParams(); return <AtlasExplorer
        worldId={fixture.worldId} worldName="Historical Atlas fixture"
        timelineId={query.get("timeline") || fixture.primary} review={query.get("review") === "1"}
        onEdit={async () => {}} onConnections={() => {}} />; }
      createRoot(document.getElementById("root")).render(<Fixture />);
    ` }, plugins: [{ name: "fixture-url-context", setup(builder) {
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "fixture-url-context" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture-url-context" }, () => ({ resolveDir: process.cwd(), loader: "js", contents: `
        import { useMemo, useSyncExternalStore } from "react";
        const subscribe = callback => { window.addEventListener("fixture-url", callback); window.addEventListener("popstate", callback);
          return () => { window.removeEventListener("fixture-url", callback); window.removeEventListener("popstate", callback); }; };
        export function useSearchParams() { const query = useSyncExternalStore(subscribe, () => location.search);
          return useMemo(() => new URLSearchParams(query), [query]); }
      ` }));
    } }] });
  const js = built.outputFiles.find(file => file.path.endsWith(".js"))!, css = built.outputFiles.find(file => file.path.endsWith(".css"))!;
  assert.ok(js && css); await writeFile(`${directory}/fixture.js`, js.contents); await writeFile(`${directory}/fixture.css`, css.contents);
  return { js: js.text, css: css.text };
}

/** Exercise the same mounted Explorer through delayed failure, retry and author recovery. */
export async function explorerFailureChecks(browser: Browser, base: string, f: MapFixtures, directory: string) {
  const receipt = `${directory}/browser-results.json`, errors: string[] = [], writes: string[] = [];
  const results: string[] = process.argv.includes("--continue") ? JSON.parse(await readFile(receipt, "utf8")).results : [];
  const fixture = await mountedExplorerFixture(f, directory);
  async function check(name: string, run: () => Promise<void>) {
    if (results.includes(name)) { console.log(`REUSE ${name}`); return; }
    await run(); results.push(name); assert.deepEqual(errors, []); assert.deepEqual(writes, []);
    await writeFile(receipt, JSON.stringify({ passed: results.length, results, errors, worldMutationRequests: writes }, null, 2));
    console.log(`PASS ${name}`);
  }
  for (const [index, phone] of [false, true].entries()) {
    const context = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      hasTouch: phone, isMobile: phone, extraHTTPHeaders: { "X-Forwarded-For": `198.51.100.${210 + index}` } });
    try {
      const login = await context.request.post(`${base}/api/auth/sign-in/email`, { headers: { Origin: base },
        data: { email: "world-god@example.invalid", password: "Worlds-Test-Only-Password!" } });
      assert.equal(login.status(), 200, await login.text());
      const page = await context.newPage(), name = phone ? "phone" : "desktop", api = `${base}/api/worlds/${f.worldId}/atlas/states`;
      page.on("pageerror", e => errors.push(e.message));
      page.on("console", m => { if (m.type() === "error" && !m.text().includes("Failed to load resource")) errors.push(m.text()); });
      page.on("request", r => { if (r.method() === "POST" && r.url().includes("/api/worlds/")) writes.push(r.url()); });
      const response = await context.request.get(`${api}?map=${f.mapId}&timeline=${f.primary}&state=${f.secret}`);
      assert.equal(response.status(), 200); const protectedSource: MapStateBundle = await response.json();
      const secret = protectedSource.selected!; assert.ok(secret.protected); assert.ok(secret.name && secret.account);
      const authorUrl = `${base}/worlds/${f.worldId}?tab=atlas&timeline=${f.primary}&atlas=${f.mapId}&mapYear=${secret.startYear}`;
      await page.goto(authorUrl);
      const sharedStyles = await page.locator('link[rel="stylesheet"]').evaluateAll(links => links.map(link => (link as HTMLLinkElement).href));
      const fixturePath = "/__worlds-explorer-failure";
      await context.route(`${base}${fixturePath}**`, route => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname.endsWith(".js")) return route.fulfill({ contentType: "application/javascript", body: fixture.js });
        if (pathname.endsWith(".css")) return route.fulfill({ contentType: "text/css", body: fixture.css });
        return route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
          ${sharedStyles.map(href => `<link rel="stylesheet" href="${href}">`).join("")}<link rel="stylesheet" href="${fixturePath}.css"></head>
          <body><main id="root"></main><script src="${fixturePath}.js"></script></body></html>` });
      });
      const mountedAuthorUrl = `${base}${fixturePath}${new URL(authorUrl).search}`;
      const explorer = page.getByRole("region", { name: "Map explorer", exact: true });
      const historicalRequest = (url: string, ordinary: boolean) => {
        const query = new URL(url).searchParams;
        return url.includes("/atlas/states?") && query.get("map") === f.mapId && query.get("year") === String(secret.startYear)
          && query.get("ordinary") === (ordinary ? "1" : null);
      };
      async function withheld() {
        const text = await explorer.innerText();
        assert.ok(!text.includes(secret.name), text); assert.ok(!text.includes(secret.account), text);
        assert.ok(!text.includes("SECRET_"), text);
        assert.equal(await explorer.getByRole("button", { name: /^(Edit map|Edit connections)$/ }).count(), 0);
      }
      for (const alias of ["knowledge", "ordinary"] as const) {
        await check(`${name} ${alias}: delayed ordinary failure withholds protected appearance, retry filters correctly, author return restores the source`, async () => {
          await page.goto(mountedAuthorUrl);
          await explorer.getByRole("status").filter({ hasText: secret.name }).waitFor();
          await explorer.getByRole("button", { name: "Edit map", exact: true }).waitFor();
          const originalNode = await explorer.elementHandle(); assert.ok(originalNode);
          let release!: () => void;
          const blocked = new Promise<void>(resolve => { release = resolve; }), pending: Promise<void>[] = [], routeErrors: string[] = [];
          let ordinaryRequests = 0;
          const handler = (route: Route) => {
            const work = (async () => {
              if (historicalRequest(route.request().url(), true) && ++ordinaryRequests === 1) {
                await blocked;
                await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "The ordinary map view could not load. Try again." }) });
              } else await route.continue();
            })().catch(error => { routeErrors.push(String(error)); });
            pending.push(work); return work;
          };
          await page.route("**/atlas/states?**", handler);
          try {
            await Promise.all([
              page.waitForRequest(r => historicalRequest(r.url(), true)),
              page.evaluate(key => { const url = new URL(location.href); url.searchParams.delete("knowledge"); url.searchParams.delete("ordinary");
                url.searchParams.set(key, key === "knowledge" ? "ordinary" : "1"); window.history.pushState(null, "", url.pathname + url.search); }, alias),
            ]);
            await explorer.getByRole("status").filter({ hasText: "Loading the selected map" }).waitFor();
            assert.ok(await originalNode.evaluate(node => node.isConnected)); await withheld();
            release();
            await explorer.getByRole("alert").filter({ hasText: "The ordinary map view could not load" }).waitFor();
            assert.equal(await explorer.getByRole("status").filter({ hasText: "Loading the selected map" }).count(), 0);
            await withheld(); assert.ok(await originalNode.evaluate(node => node.isConnected));
            await page.screenshot({ path: `${directory}/${name}-${alias}-failed.png`, fullPage: true });
            const [retried] = await Promise.all([
              page.waitForResponse(r => historicalRequest(r.url(), true) && r.status() === 200),
              explorer.getByRole("button", { name: "Retry map", exact: true }).click(),
            ]);
            const ordinary: MapStateBundle = await retried.json();
            assert.equal(ordinary.selected, null); assert.equal(ordinary.coverage, "unknown"); assert.equal(ordinary.canEdit, false);
            assert.ok(!JSON.stringify(ordinary).includes(secret.name)); assert.ok(!JSON.stringify(ordinary).includes(secret.account));
            await explorer.getByRole("status").filter({ hasText: "Unknown historical coverage; shared baseline reference" }).waitFor();
            assert.equal(await explorer.getByRole("alert").count(), 0); await withheld();
            await page.screenshot({ path: `${directory}/${name}-${alias}-recovered.png`, fullPage: true });
            await explorer.getByRole("button", { name: "Return to author view", exact: true }).click();
            await explorer.getByRole("status").filter({ hasText: secret.name }).waitFor();
            await explorer.getByRole("button", { name: "Edit map", exact: true }).waitFor();
            assert.ok(await originalNode.evaluate(node => node.isConnected));
            const query = new URL(page.url()).searchParams;
            assert.equal(query.get("mapYear"), String(secret.startYear)); assert.equal(query.get("timeline"), f.primary);
            assert.equal(query.has("knowledge"), false); assert.equal(query.has("ordinary"), false);
            assert.equal(ordinaryRequests, 2);
          } finally { release(); await Promise.all(pending); await page.unroute("**/atlas/states?**", handler); await originalNode.dispose(); }
          assert.deepEqual(routeErrors, []);
        });
      }
      await check(`${name}: historical year navigation, linked-map return, immutable source reading and Atlas draft editing remain functional`, async () => {
        await page.goto(authorUrl); await explorer.getByRole("status").filter({ hasText: secret.name }).waitFor();
        await page.evaluate(() => { const url = new URL(location.href); url.searchParams.set("mapYear", "50"); window.history.pushState(null, "", url.pathname + url.search); });
        await explorer.getByRole("status").filter({ hasText: "Later coast" }).waitFor();
        await explorer.getByRole("button", { name: "Later historic coast name", exact: true }).first().click();
        const destinationResponse = await context.request.get(`${base}/api/worlds/${f.worldId}/atlas?map=${f.destination}`);
        assert.equal(destinationResponse.status(), 200); const destination: AtlasBundle = await destinationResponse.json();
        const destinationMap = destination.maps.find(m => m.id === f.destination)!;
        await explorer.getByRole("button", { name: `Open ${destinationMap.name} \u00b7 preferred`, exact: true }).click();
        await explorer.getByRole("heading", { name: destinationMap.name, exact: true }).waitFor();
        assert.equal(new URL(page.url()).searchParams.get("mapYear"), "50");
        await explorer.getByRole("status").filter({ hasText: "Unknown historical coverage; shared baseline reference" }).waitFor();
        await explorer.getByRole("button", { name: "Previous map", exact: true }).click();
        await explorer.getByRole("status").filter({ hasText: "Later coast" }).waitFor();
        await explorer.getByRole("button", { name: "Edit map", exact: true }).click();
        const panel = page.getByRole("region", { name: "Historical map appearances", exact: true });
        await panel.getByRole("heading", { name: "Later coast", exact: true }).waitFor();
        const sourceResponse = await context.request.get(`${api}?map=${f.mapId}&timeline=${f.primary}&state=${f.later}`);
        assert.equal(sourceResponse.status(), 200); const source: MapStateBundle = await sourceResponse.json();
        const older = source.revisions.find(v => v.versionId !== source.selected!.versionId)!; assert.ok(older);
        const revisions = panel.getByRole("combobox", { name: "Retained revisions", exact: true });
        const [readBack] = await Promise.all([
          page.waitForResponse(r => r.url().includes(`/atlas/states?`) && new URL(r.url()).searchParams.get("version") === older.versionId),
          revisions.selectOption(older.versionId),
        ]);
        assert.equal(readBack.status(), 200); assert.equal((await readBack.json() as MapStateBundle).selected!.versionId, older.versionId);
        await panel.getByRole("heading", { name: older.name, exact: true }).waitFor();
        assert.equal(await panel.getByRole("button", { name: "Edit this historical appearance", exact: true }).count(), 0);
        await revisions.selectOption(source.selected!.versionId);
        await panel.getByRole("button", { name: "Edit this historical appearance", exact: true }).waitFor();
        // Revision selection opens its authored start year. Deliberately choose
        // year 50 again before testing subsequent editing/exploration navigation.
        await panel.getByRole("spinbutton", { name: "View World year", exact: true }).fill("50");
        await panel.getByRole("button", { name: "View year", exact: true }).click();
        await panel.getByRole("button", { name: "Edit this historical appearance", exact: true }).waitFor();
        await panel.getByRole("button", { name: "Edit this historical appearance", exact: true }).click();
        assert.equal(await panel.getByRole("textbox", { name: "Historical source account", exact: true }).inputValue(), source.selected!.account);
        const editor = page.getByRole("region", { name: "Map editor", exact: true });
        await editor.getByRole("button", { name: "Move feature", exact: true }).click();
        await editor.getByRole("button", { name: "Later historic coast name", exact: true }).click();
        await editor.getByRole("button", { name: "Down", exact: true }).click();
        await editor.getByRole("status").filter({ hasText: "Unsaved changes" }).waitFor();
        page.once("dialog", dialog => dialog.dismiss());
        await editor.getByRole("button", { name: "Explore map", exact: true }).click();
        await editor.getByRole("status").filter({ hasText: "Unsaved changes" }).waitFor();
        const accept = async (dialog: import("playwright-core").Dialog) => { await dialog.accept(); };
        page.on("dialog", accept);
        try { await editor.getByRole("button", { name: "Explore map", exact: true }).click(); await explorer.getByRole("status").filter({ hasText: "Later coast" }).waitFor(); }
        finally { page.off("dialog", accept); }
        assert.equal(new URL(page.url()).searchParams.get("mapYear"), "50");
        assert.equal(await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth)), 0);
      });
    } finally { await context.close(); }
  }
}
