/** Standalone art-study browser proof, not application or human acceptance. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const directory = "docs/screenshots/worlds-geo-ux0a/art-direction/revision-2";
async function main() {
  const svg = await readFile(`${directory}/first-island.svg`, "utf8"), requests: string[] = [];
  const browser = await chromium.launch({ executablePath: process.env.SERRIAN_TEST_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 2040, height: 1440 }, deviceScaleFactor: 1 });
    await page.route("**/*", route => { requests.push(route.request().url()); return route.abort(); });
    await page.setContent(`<body style="margin:0">${svg}</body>`);
    await page.evaluate(() => document.fonts.ready);
    // tsx/esbuild emits this function-name helper inside serialized callbacks.
    await page.evaluate("globalThis.__name = value => value");
    const boxes = await page.evaluate(() => {
      const box = (element: Element) => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
      const texts = [...document.querySelectorAll("svg text")].map(element => ({ text: element.textContent ?? "", ...box(element) }));
      const artwork = [...document.querySelectorAll("svg use")].map(element => ({ asset: element.getAttribute("href"), ...box(element) }));
      const overlap = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
      return { texts, artwork, collisions: texts.flatMap(a => [...texts.filter(b => a !== b && overlap(a, b)).map(b => ({ text: a.text, other: b.text })), ...artwork.filter(b => overlap(a, b)).map(b => ({ text: a.text, other: b.asset }))]) };
    });
    assert.deepEqual(boxes.collisions, [], "No text/text or text/asset bounding-box collisions in the actual SVG browser render");
    assert.deepEqual(requests, [], "The art study must be self-contained");
    await page.locator("svg").screenshot({ path: `${directory}/browser-composition.png` });
    await writeFile(`${directory}/browser-proof.json`, `${JSON.stringify({ scope: "Standalone SVG art study only; not an application journey", browser: browser.version(), viewport: { width: 2040, height: 1440 }, deviceScaleFactor: 1, externalRequests: requests, ...boxes }, null, 2)}\n`);
    console.log(`PASS: ${boxes.texts.length} text boxes and ${boxes.artwork.length} artwork instances, no bounding-box collisions or external requests`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
