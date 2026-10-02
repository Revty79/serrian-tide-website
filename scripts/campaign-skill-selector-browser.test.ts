import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright-core";

test("Allowed Skills tree: Tier 2/3 exclusions, cascade restoration, groups and full-width search", { timeout: 60_000 }, async () => {
  const output = path.resolve("artifacts/campaign-skills-ui");
  await mkdir(output, { recursive: true });
  await build({ stdin: { resolveDir: process.cwd(), sourcefile: "campaign-skill-fixture.tsx", loader: "tsx", contents: `
    import {useState} from "react";
    import {createRoot} from "react-dom/client";
    import {CampaignSkillSelector} from "./src/app/heavens/campaigns/campaign-skill-selector";
    import {buildRecursiveSkillLibrary} from "./src/features/skills/recursive-skill-library";
    const skills = [
      {id:1,name:"Ranged Weapons",tier:1}, {id:2,name:"Firearms",tier:2}, {id:3,name:"Pistols",tier:3},
      {id:4,name:"Precision",tier:4}, {id:5,name:"Long Distance",tier:5}, {id:6,name:"Archery",tier:2},
      {id:7,name:"Night Sight",tier:null,classification:"special ability"},
      {id:8,name:"Spellcraft",tier:1,classification:"magic access"}
    ].map(row => ({classification:"standard",primaryAttribute:"DEX",secondaryAttribute:null,...row}));
    const edges = [[2,1],[3,2],[4,3],[5,4],[6,1]].map(([skillId,relatedSkillId],id) => ({id,skillId,relatedSkillId,relationshipType:"parent",sortOrder:0}));
    const library = buildRecursiveSkillLibrary(skills,edges);
    function App(){const [exclusions,onChange]=useState([]); return <CampaignSkillSelector library={library} allowedSystems={["Tier 1","Special Abilities"]} exclusions={exclusions} onChange={onChange}/>;}
    createRoot(document.getElementById("root")).render(<App/>);
  ` }, bundle: true, jsx: "automatic", outfile: path.join(output, "bundle.js"), logLevel: "silent" });
  const js = await readFile(path.join(output, "bundle.js"), "utf8");
  const css = await readFile(path.join(output, "bundle.css"), "utf8");
  const sharedCss = await readFile("src/app/globals.css", "utf8");
  const html = `<html><head><style>${sharedCss}*{box-sizing:border-box}body{margin:0;padding:16px;font-family:Arial;background:var(--st-page)}button,input{font:inherit}#root{max-width:1000px;margin:auto}${css}</style></head><body><div id="root"></div></body></html>`;
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    await page.setContent(html); await page.addScriptTag({ content: js });
    const search = page.getByRole("searchbox", { name: "Find a Skill" });
    await search.waitFor();
    assert.equal(await page.getByRole("checkbox", { name: "Firearms" }).count(), 0, "descendants start collapsed");
    await page.locator("summary").filter({ hasText: "DEX" }).click();
    await page.getByRole("button", { name: "Expand Ranged Weapons" }).click();
    const firearms = page.getByRole("checkbox", { name: "Firearms" });
    assert.equal(await firearms.isEnabled(), true, "Tier 2 can be excluded with only starting Tier 1 enabled");
    await page.getByRole("button", { name: "Expand Firearms" }).click();
    const pistols = page.getByRole("checkbox", { name: "Pistols" });
    assert.equal(await pistols.isEnabled(), true);
    await pistols.uncheck(); await firearms.uncheck();
    assert.equal(await pistols.isEnabled(), false);
    assert.equal(await page.getByRole("checkbox", { name: "Archery" }).isEnabled(), true);
    await firearms.check();
    assert.equal(await pistols.isEnabled(), true); assert.equal(await pistols.isChecked(), false);
    await search.fill("Spellcraft");
    assert.equal(await page.getByRole("checkbox", { name: "Spellcraft" }).isEnabled(), false);
    await search.fill("Long Distance");
    assert.equal(await page.getByRole("checkbox", { name: "Long Distance" }).isVisible(), true);
    assert.equal(await page.getByRole("checkbox", { name: "Long Distance" }).isEnabled(), false);
    await search.fill("Firearms");
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const input = await search.boundingBox(); const panel = await page.locator(".campaign-skill-selector").boundingBox();
      assert.ok(input && panel && input.width >= panel.width - 40 && input.height >= 48, "search fills the panel and has a usable height");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
      await page.screenshot({ path: path.join(output, `selector-${width}.png`), fullPage: true });
    }
    assert.deepEqual(errors, []);
    await writeFile(path.join(output, "result.json"), JSON.stringify({ passed: true, viewports: [1280, 390], checks: ["Tier 2 and 3 exclusions", "child restoration", "sibling independence", "system restriction", "five-level search", "full-width input", "no overflow"] }, null, 2));
  } finally { await browser.close(); }
});
