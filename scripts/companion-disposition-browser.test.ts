import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { hashPassword } from "better-auth/crypto";
import { chromium } from "playwright-core";
import { pool } from "@/db";

assert.equal(process.env.SERRIAN_COMPANION_DISPOSABLE, "true");
assert.match(process.env.DATABASE_URL ?? "", /^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_creature_ownership_dev$/);
const artifacts = path.resolve("artifacts/guidance/companion-disposition");
// Screenshot-only: keep sticky navigation and the dev indicator out of focused evidence.
// Interaction and overflow assertions run with the actual page styles.
const focusedStyle = ".authenticated-navigation, nextjs-portal { visibility: hidden !important; }";
async function until(check: () => Promise<boolean>, label: string) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 250)); }
  throw new Error(`Timed out: ${label}`);
}
async function main() {
  const fixture = JSON.parse(await readFile(path.join(artifacts, "fixture.json"), "utf8"));
  const tsconfig = await readFile("tsconfig.json"), nextEnv = await readFile("next-env.d.ts");
  const listener = createServer(); await new Promise<void>(resolve => listener.listen(0, "127.0.0.1", resolve));
  const address = listener.address(); assert.ok(address && typeof address === "object");
  const port = address.port; await new Promise<void>(resolve => listener.close(() => resolve()));
  const base = `http://localhost:${port}`, password = "Companion-Browser-Synthetic-Only!";
  let server: ChildProcess | null = null, browser: Awaited<ReturnType<typeof chromium.launch>> | null = null, serverLog = "";
  const errors: string[] = [];
  try {
    for (const id of [fixture.god, fixture.player]) {
      await pool.query('update "user" set email_verified=true,username=$1,display_username=$1 where id=$1', [id]);
      await pool.query("insert into account(id,issuer,account_id,provider_id,user_id,password,updated_at) values($1,'local:credential',$2,'credential',$2,$3,now())", [`${id}-credential`,id,await hashPassword(password)]);
    }
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(port)], { cwd: process.cwd(), env: { ...process.env, BETTER_AUTH_URL: base, NEXT_TELEMETRY_DISABLED: "1", SERRIAN_TEST_NEXT_DIST_DIR: ".next-companion-browser" }, stdio: "pipe", windowsHide: true });
    server.stdout?.on("data", chunk => { serverLog += String(chunk); }); server.stderr?.on("data", chunk => { serverLog += String(chunk); });
    await until(async () => { if (server?.exitCode !== null) throw new Error("Next exited before startup."); try { return (await fetch(`${base}/login`)).ok; } catch { return false; } }, "Next startup");
    browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
    const context = await browser.newContext({ viewport: { width: 1365, height: 1000 }, hasTouch: true });
    const page = await context.newPage(); page.setDefaultTimeout(40_000); page.setDefaultNavigationTimeout(180_000); page.on("pageerror", error => errors.push(error.message));
    const login = await context.request.post(`${base}/api/auth/sign-in/email`, { headers: { Origin: base }, data: { email: `${fixture.god}@example.invalid`, password } }); assert.equal(login.status(), 200);
    await page.goto(`${base}/heavens/equipment`);
    await page.locator("#item-search").fill("Browser Vessel authoring");
    await page.locator(".skill-library__row").filter({ hasText: "Browser Vessel authoring" }).click();
    await page.getByLabel("Creature Vessel", { exact: true }).check();
    await page.getByRole("button", { name: "Save Item", exact: true }).click();
    await until(async () => !!(await pool.query("select 1 from creature_vessel_profile where item_id=$1 and enabled", [fixture.authorItem])).rows.length, "Vessel capability saved");
    await page.screenshot({ path: path.join(artifacts,"authoring-desktop.png"), fullPage: true });
    await page.locator(".item-vessel-capability").screenshot({ path: path.join(artifacts,"authoring-control-desktop.png"), style:focusedStyle });
    await page.setViewportSize({ width:390,height:844 });
    await page.getByLabel("Creature Vessel", { exact:true }).scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path:path.join(artifacts,"authoring-phone.png"),fullPage:true });
    await page.locator(".item-vessel-capability").screenshot({ path:path.join(artifacts,"authoring-control-phone.png"), style:focusedStyle });
    await page.reload(); await page.locator("#item-search").fill("Browser Vessel authoring"); await page.locator(".skill-library__row").filter({hasText:"Browser Vessel authoring"}).click(); await page.getByLabel("Creature Vessel", {exact:true}).waitFor(); assert.equal(await page.getByLabel("Creature Vessel", {exact:true}).isChecked(),true);
    const playerContext = await browser.newContext({ viewport: { width:1365,height:1000 }, hasTouch:true });
    const auth = await playerContext.request.post(`${base}/api/auth/sign-in/email`, {headers:{Origin:base},data:{email:`${fixture.player}@example.invalid`,password}}); assert.equal(auth.status(),200);
    const player = await playerContext.newPage(); player.setDefaultTimeout(40_000); player.setDefaultNavigationTimeout(180_000); player.on("pageerror",error=>errors.push(error.message));
    await player.goto(`${base}/realms/characters/${fixture.owner}`); await player.locator("#character-tab-equipment").click();
    const animals = player.getByRole("region",{name:"Animals & Companions",exact:true});
    await animals.getByText("Travel disposition not set",{exact:true}).waitFor();
    for(const state of ["Accompanying","Vessel-bound","Away · Stable at Greyhaven"]) await animals.getByText(state,{exact:true}).waitFor();
    await animals.scrollIntoViewIfNeeded(); await player.screenshot({path:path.join(artifacts,"companions-desktop.png"),fullPage:true});
    await animals.screenshot({path:path.join(artifacts,"companion-list-desktop.png"),style:focusedStyle});
    await player.setViewportSize({width:390,height:844});
    assert.equal(await player.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    await animals.screenshot({path:path.join(artifacts,"companion-list-phone.png"),style:focusedStyle});
    await player.setViewportSize({width:1365,height:1000});
    const row = animals.locator("li").filter({has:player.getByText("Legacy companion",{exact:true})});
    await row.getByRole("button",{name:"View companion",exact:true}).click();
    const editor = player.getByRole("region",{name:"Companion travel disposition",exact:true});
    await editor.getByLabel("Normal travel",{exact:true}).selectOption("accompanying");
    await editor.getByRole("button",{name:"Save travel disposition",exact:true}).click(); await editor.getByRole("status").waitFor();
    await editor.getByLabel("Normal travel",{exact:true}).selectOption("away"); await editor.getByLabel("Away location or note",{exact:true}).fill("At home with the caravan");
    await editor.getByRole("button",{name:"Save travel disposition",exact:true}).click(); await editor.getByRole("status").waitFor();
    await editor.getByLabel("Normal travel",{exact:true}).selectOption("vessel-bound");
    await editor.getByLabel("Creature Vessel copy",{exact:true}).selectOption(String(fixture.second));
    await editor.getByRole("button",{name:"Save travel disposition",exact:true}).click(); await editor.getByRole("status").waitFor();
    await player.setViewportSize({width:390,height:844});
    await editor.scrollIntoViewIfNeeded(); await player.screenshot({path:path.join(artifacts,"bound-phone.png"),fullPage:true});
    await editor.screenshot({path:path.join(artifacts,"bound-editor-phone.png"),style:focusedStyle});
    await editor.getByLabel("Normal travel",{exact:true}).selectOption("away");
    assert.equal(await editor.getByRole("button",{name:"Save travel disposition",exact:true}).isDisabled(),true);
    assert.equal((await pool.query("select vessel_instance_id from owned_creature_disposition where character_id=$1",[fixture.ids["Legacy companion"]])).rows[0].vessel_instance_id,fixture.second);
    await editor.getByLabel("Away location or note",{exact:true}).fill("Home");
    await editor.getByRole("checkbox",{name:"I confirm unbinding the current Vessel."}).check();
    await player.screenshot({path:path.join(artifacts,"unbind-confirmation-phone.png"),fullPage:true});
    await editor.screenshot({path:path.join(artifacts,"unbind-editor-phone.png"),style:focusedStyle});
    assert.equal(await player.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),true);
    const dialog=player.getByRole("dialog").filter({has:editor});
    const bounds=await dialog.boundingBox();assert.ok(bounds&&bounds.x>=0&&bounds.x+bounds.width<=391);
    assert.equal(await editor.getByRole("button",{name:/^(Release|Recall|Summon|Deploy|Return to Vessel|Add to Encounter)/}).count(),0);
    await editor.getByRole("button",{name:"Save travel disposition",exact:true}).click();await editor.getByRole("status").waitFor();
    await dialog.getByRole("button",{name:"Close",exact:true}).click();
    await row.getByText("Away · Home",{exact:true}).waitFor(); await player.screenshot({path:path.join(artifacts,"companions-phone.png"),fullPage:true});
    await player.reload();await player.locator("#character-tab-equipment").click();await row.getByText("Away · Home",{exact:true}).waitFor();
    const boundRow=animals.locator("li").filter({has:player.getByText("Bound companion",{exact:true})});
    await boundRow.getByRole("button",{name:"View companion",exact:true}).click();
    await editor.getByLabel("Normal travel",{exact:true}).waitFor();
    const labels=await editor.getByLabel("Creature Vessel copy",{exact:true}).locator("option").allTextContents();
    assert.equal(labels.filter(label=>label.includes("Browser Calling Stone")).length,2);assert.equal(new Set(labels).size,labels.length);
    await player.screenshot({path:path.join(artifacts,"duplicate-copies-phone.png"),fullPage:true});
    await editor.screenshot({path:path.join(artifacts,"duplicate-editor-phone.png"),style:focusedStyle});
    await page.goto(`${base}/heavens/npcs/${fixture.ids["Bound companion"]}`);
    const godEditor=page.getByRole("region",{name:"Companion travel disposition",exact:true});
    await godEditor.getByLabel("Normal travel",{exact:true}).selectOption("accompanying");
    await godEditor.getByRole("checkbox",{name:"I confirm unbinding the current Vessel."}).check();
    await godEditor.getByRole("button",{name:"Save travel disposition",exact:true}).click();await godEditor.getByRole("status").waitFor();
    await page.screenshot({path:path.join(artifacts,"god-npc-phone.png"),fullPage:true});
    await page.goto(`${base}/heavens/npcs?campaign=${fixture.campaignId}`);
    await page.getByRole("searchbox",{name:"Search NPCs"}).fill("Simple travel companion");
    await page.locator(".npcs-card").filter({hasText:"Simple travel companion"}).getByRole("button",{name:"Open Simple Editor",exact:true}).click();
    await godEditor.getByLabel("Normal travel",{exact:true}).selectOption("away");
    await godEditor.getByLabel("Away location or note",{exact:true}).fill("Race NPC owner's stable");
    await godEditor.getByRole("button",{name:"Save travel disposition",exact:true}).click();await godEditor.getByRole("status").waitFor();
    assert.equal((await pool.query("select disposition from owned_creature_disposition where character_id=$1",[fixture.simpleId])).rows[0].disposition,"away");
    await page.screenshot({path:path.join(artifacts,"god-simple-npc-phone.png"),fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    assert.deepEqual(errors,[]);
    console.log("PASS Chrome: Item capability save/reload; Player legacy, Accompanying, Away/note, Vessel binding; distinct same-name copies; explicit unbind confirmation; G.O.D. simple/detailed Creature NPC controls including a Race NPC owner; desktop and 390px; no overflow or browser errors.");
  } catch(error) {
    for(const [index,context] of (browser?.contexts()??[]).entries()) for(const page of context.pages()) {
      await page.screenshot({path:path.join(artifacts,`failure-${index}.png`),fullPage:true}).catch(()=>undefined);
      await writeFile(path.join(artifacts,`failure-${index}.txt`),await page.locator("body").innerText().catch(()=>""));
    }
    throw error;
  } finally {
    if(browser)await browser.close();
    if(server&&server.exitCode===null){server.kill();await new Promise<void>(resolve=>{const timer=setTimeout(resolve,3000);server!.once("exit",()=>{clearTimeout(timer);resolve();});});}
    await writeFile(path.join(artifacts,"server.log"),serverLog);await pool.end();await writeFile("tsconfig.json",tsconfig);await writeFile("next-env.d.ts",nextEnv);
  }
}
main().catch((error:unknown)=>{console.error(error);process.exitCode=1;});
