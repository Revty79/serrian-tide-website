import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { hashPassword } from "better-auth/crypto";
import { chromium } from "playwright-core";
import { pool } from "@/db";

assert.equal(process.env.SERRIAN_COMPANION_PROFILE_DISPOSABLE, "true");
assert.match(process.env.DATABASE_URL ?? "", /^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_creature_ownership_dev$/);
const artifacts = path.resolve("artifacts/guidance/companion-management");
// Screenshot-only: keep sticky navigation and the dev indicator out of focused evidence.
// Interaction and overflow assertions run with the actual page styles.
const focusedStyle = ".authenticated-navigation, nextjs-portal { visibility: hidden !important; }";
async function until(check: () => Promise<boolean>, label: string) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 250)); }
  throw new Error(`Timed out: ${label}`);
}
async function main() {
  const fixture = JSON.parse(await readFile(path.resolve("artifacts/guidance/companion-profile/fixture.json"), "utf8"));
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
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(port)], { cwd: process.cwd(), env: { ...process.env, BETTER_AUTH_URL: base, NEXT_TELEMETRY_DISABLED: "1", SERRIAN_TEST_NEXT_DIST_DIR: ".next-companion-management-browser" }, stdio: "pipe", windowsHide: true });
    server.stdout?.on("data", chunk => { serverLog += String(chunk); }); server.stderr?.on("data", chunk => { serverLog += String(chunk); });
    await until(async () => { if (server?.exitCode !== null) throw new Error("Next exited before startup."); try { return (await fetch(`${base}/login`)).ok; } catch { return false; } }, "Next startup");
    browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
    const context = await browser.newContext({ viewport: { width: 1365, height: 1000 }, hasTouch: true });
    const page = await context.newPage(); page.setDefaultTimeout(40_000); page.setDefaultNavigationTimeout(180_000); page.on("pageerror", error => errors.push(error.message));
    const login = await context.request.post(`${base}/api/auth/sign-in/email`, { headers: { Origin: base }, data: { email: `${fixture.god}@example.invalid`, password } }); assert.equal(login.status(), 200);
    await page.goto(`${base}/heavens/npcs/${fixture.storm}`);
    const profile=page.getByRole("region",{name:"Companion Profile",exact:true});
    await profile.getByLabel("Control Model",{exact:true}).selectOption("player-directed");
    await profile.getByLabel("Combat Preference",{exact:true}).selectOption("normally-joins");
    await profile.getByRole("checkbox",{name:"Familiar",exact:true}).check();
    await profile.getByRole("checkbox",{name:"Other",exact:true}).check();
    await profile.getByLabel("Other role label",{exact:true}).fill("Messenger");
    await profile.getByLabel("Maximum intended riders",{exact:true}).fill("2");
    await profile.getByLabel("Mount notes",{exact:true}).fill("Family saddle.");
    await profile.getByLabel("Relationship notes",{exact:true}).fill("Responds to whistle commands.");
    assert.equal(await profile.getByRole("button",{name:"Save relationship notes only",exact:true}).isDisabled(),true);
    await profile.getByRole("button",{name:"Save Companion Profile",exact:true}).click();await profile.getByRole("status").waitFor();
    await profile.screenshot({path:path.join(artifacts,"god-profile-desktop.png"),style:focusedStyle});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    await profile.screenshot({path:path.join(artifacts,"god-profile-phone.png"),style:focusedStyle});
    const controlHelp=profile.locator('[data-field-guidance="Control Model"]');
    await controlHelp.locator("summary").click();assert.equal(await controlHelp.getByRole("note").isVisible(),true);
    assert.equal(await profile.getByLabel("Control Model",{exact:true}).inputValue(),"player-directed");
    await profile.screenshot({path:path.join(artifacts,"god-profile-help-phone.png"),style:focusedStyle});
    await controlHelp.locator("summary").press("Escape");assert.equal(await controlHelp.getByRole("note").isVisible(),false);
    await profile.getByRole("checkbox",{name:"Mount",exact:true}).uncheck();
    assert.equal(await profile.getByRole("button",{name:"Save Companion Profile",exact:true}).isDisabled(),true);
    await profile.getByRole("checkbox",{name:/I confirm clearing/}).check();
    await profile.screenshot({path:path.join(artifacts,"mount-removal-phone.png"),style:focusedStyle});
    await profile.getByRole("button",{name:"Save Companion Profile",exact:true}).click();await profile.getByRole("status").waitFor();
    assert.equal((await pool.query("select count(*)::int n from companion_profile_role where character_id=$1 and role='mount'",[fixture.storm])).rows[0].n,0);
    await profile.getByRole("checkbox",{name:"Mount",exact:true}).check();
    assert.equal(await profile.getByLabel("Maximum intended riders",{exact:true}).inputValue(),"1");
    await profile.getByLabel("Control Model",{exact:true}).selectOption("owner-commands");
    await profile.getByLabel("Combat Preference",{exact:true}).selectOption("normally-stays-out");
    await profile.getByRole("button",{name:"Save Companion Profile",exact:true}).click();await profile.getByRole("status").waitFor();
    const travel=page.getByRole("region",{name:"Companion travel disposition",exact:true});
    await travel.getByLabel("Normal travel",{exact:true}).selectOption("accompanying");
    await travel.getByRole("checkbox",{name:"I confirm unbinding the current Vessel."}).check();
    await travel.getByRole("button",{name:"Save travel disposition",exact:true}).click();await travel.getByRole("status").waitFor();
    await pool.query("update campaign_character set owner_character_id=$1 where id=$2",[fixture.raceOwner,fixture.storm]);
    await page.reload();await profile.getByText("G.O.D. review required after ownership change.",{exact:true}).waitFor();
    assert.equal(await profile.getByRole("button",{name:"Save Companion Profile",exact:true}).isDisabled(),true);
    await profile.screenshot({path:path.join(artifacts,"owner-review-phone.png"),style:focusedStyle});
    await profile.getByRole("checkbox",{name:"I reviewed these settings for the current owner."}).check();
    await profile.getByRole("button",{name:"Save Companion Profile",exact:true}).click();await profile.getByRole("status").waitFor();
    assert.equal((await pool.query("select requires_owner_review from companion_profile where character_id=$1",[fixture.storm])).rows[0].requires_owner_review,false);
    await pool.query("update campaign_character set owner_character_id=$1 where id=$2",[fixture.owner,fixture.storm]);
    await page.reload();await travel.getByLabel("Normal travel",{exact:true}).selectOption("vessel-bound");
    await travel.getByLabel("Creature Vessel copy",{exact:true}).selectOption(String(fixture.copy));
    await travel.getByRole("button",{name:"Save travel disposition",exact:true}).click();await travel.getByRole("status").waitFor();
    await page.goto(`${base}/heavens/npcs?campaign=${fixture.campaignId}`);
    await page.getByRole("searchbox",{name:"Search NPCs"}).fill("Simple profile companion");
    await page.locator(".npcs-card").filter({hasText:"Simple profile companion"}).getByRole("button",{name:"Open Simple Editor",exact:true}).click();
    await profile.getByRole("checkbox",{name:"Familiar",exact:true}).check();
    await profile.getByRole("checkbox",{name:"Scout / Utility",exact:true}).check();
    await profile.getByLabel("Control Model",{exact:true}).selectOption("god-directed");
    await profile.getByLabel("Combat Preference",{exact:true}).selectOption("decide-at-start");
    await profile.getByRole("button",{name:"Save Companion Profile",exact:true}).click();await profile.getByRole("status").waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    await profile.screenshot({path:path.join(artifacts,"simple-npc-phone.png"),style:focusedStyle});
    const playerContext=await browser.newContext({viewport:{width:1365,height:1000},hasTouch:true});
    const auth=await playerContext.request.post(`${base}/api/auth/sign-in/email`,{headers:{Origin:base},data:{email:`${fixture.player}@example.invalid`,password}});assert.equal(auth.status(),200);
    const player=await playerContext.newPage();player.setDefaultTimeout(40_000);player.setDefaultNavigationTimeout(180_000);player.on("pageerror",error=>errors.push(error.message));
    await player.goto(`${base}/realms/characters/${fixture.owner}`);await player.locator("#character-tab-equipment").click();
    const animals=player.getByRole("region",{name:"Animals & Companions",exact:true});
    await animals.getByText("Companion behavior not yet configured",{exact:true}).waitFor();
    await animals.screenshot({path:path.join(artifacts,"player-list-desktop.png"),style:focusedStyle});
    await player.setViewportSize({width:390,height:844});
    assert.equal(await player.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    await animals.screenshot({path:path.join(artifacts,"player-list-phone.png"),style:focusedStyle});
    await player.getByRole("button",{name:"View Vessel binding",exact:true}).click();
    await player.getByRole("status").filter({hasText:"Bound to Storm"}).waitFor();
    await player.getByRole("status").filter({hasText:"Bound to Storm"}).screenshot({path:path.join(artifacts,"vessel-lookup-phone.png"),style:focusedStyle});
    const legacy=animals.locator("li").filter({has:player.getByText("Unconfigured companion",{exact:true})});
    await legacy.getByRole("button",{name:"View companion",exact:true}).click();
    const playerProfile=player.getByRole("region",{name:"Companion Profile",exact:true});
    await playerProfile.getByLabel("Relationship notes",{exact:true}).fill("Player notes before behavior is configured.");
    assert.equal(await playerProfile.getByLabel("Control Model",{exact:true}).count(),0);
    assert.equal(await playerProfile.getByRole("button",{name:"Save Companion Profile",exact:true}).count(),0);
    await playerProfile.getByRole("button",{name:"Save relationship notes only",exact:true}).click();await playerProfile.getByRole("status").waitFor();
    assert.equal((await pool.query("select control_model from companion_profile where character_id=$1",[fixture.legacy])).rows[0].control_model,null);
    await playerProfile.screenshot({path:path.join(artifacts,"player-legacy-notes-phone.png"),style:focusedStyle});
    await player.getByRole("dialog").filter({has:playerProfile}).getByRole("button",{name:"Close",exact:true}).click();
    await animals.locator("li").filter({has:player.getByText("Storm",{exact:true})}).getByRole("button",{name:"View companion",exact:true}).click();
    await playerProfile.getByLabel("Relationship notes",{exact:true}).fill("Always waits by the gate.");
    await playerProfile.getByRole("button",{name:"Save relationship notes only",exact:true}).click();await playerProfile.getByRole("status").waitFor();
    assert.equal((await pool.query("select requires_owner_review from companion_profile where character_id=$1",[fixture.storm])).rows[0].requires_owner_review,true);
    await playerProfile.locator("summary").filter({hasText:"Companion Profile change history"}).click();
    await playerProfile.locator("summary").filter({hasText:"Travel and Vessel change history"}).click();
    await playerProfile.getByRole("button",{name:"Refresh travel history",exact:true}).click();
    await playerProfile.getByText(/Vessel-bound.*Calling Stone.*Accompanying/).waitFor();
    await playerProfile.screenshot({path:path.join(artifacts,"player-history-phone.png"),style:focusedStyle});
    assert.equal(await player.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    assert.equal(await playerProfile.getByRole("button",{name:/^(Attack|Defend|Command|Mount|Dismount|Release|Recall|Deploy)/}).count(),0);
    await player.getByRole("dialog").filter({has:playerProfile}).getByRole("button",{name:"Close",exact:true}).click();
    await player.reload();await player.locator("#character-tab-equipment").click();await animals.getByText("Always waits by the gate.",{exact:false}).waitFor();
    // Continue the approved browser coverage with inverse binding, duplicates and retained inspection.
    const itemId=(await pool.query("select item_id from campaign_character_item_instance where id=$1",[fixture.copy])).rows[0].item_id;
    const empty=(await pool.query("insert into campaign_character_item_instance(character_id,item_id,current_charges,unit_cost_credits) values($1,$2,0,10) returning id",[fixture.owner,itemId])).rows[0].id;
    await pool.query("update campaign_character set name='Storm' where id=$1",[fixture.legacy]);
    // Free the first bond through the existing Creature-side UI, leaving two eligible same-name individuals.
    await page.goto(`${base}/heavens/npcs/${fixture.storm}`);
    await travel.getByLabel("Normal travel",{exact:true}).selectOption("accompanying");
    await travel.getByRole("checkbox",{name:"I confirm unbinding the current Vessel."}).check();
    await travel.getByRole("button",{name:"Save travel disposition",exact:true}).click();await travel.getByRole("status").waitFor();
    for(const [initial,width] of [["Not Yet Set",1365],["Away",390],["Accompanying",390]] as const) {
      await player.setViewportSize({width,height:width===390?844:1000});
      await player.reload();await player.locator("#character-tab-equipment").click();
      const copyRow=player.locator(".character-item-instances > div").filter({has:player.getByText(`Copy #${empty}`,{exact:true})});
      await copyRow.getByRole("button",{name:"View Vessel binding",exact:true}).click();
      await copyRow.getByRole("status").filter({hasText:"No Creature bound"}).waitFor();
      await copyRow.getByRole("button",{name:"Bind Creature",exact:true}).click();
      const chooser=copyRow.getByLabel("Owned Creature to bind",{exact:true});
      await chooser.waitFor();
      assert.equal(await chooser.locator("option").filter({hasText:`Storm · Individual #${fixture.legacy}`}).count(),1);
      assert.equal(await chooser.locator("option").filter({hasText:`Storm · Individual #${fixture.storm}`}).count(),1);
      await chooser.selectOption(String(fixture.legacy));
      await copyRow.getByText(`Binding Storm · Individual #${fixture.legacy} will change its normal travel disposition from ${initial} to Vessel-bound, using this exact copy.`,{exact:true}).waitFor();
      assert.equal(await player.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
      await copyRow.screenshot({path:path.join(artifacts,`vessel-bind-${initial.replaceAll(" ","-")}-${width}.png`),style:focusedStyle});
      await copyRow.getByRole("button",{name:"Save Vessel binding",exact:true}).click();
      await copyRow.getByRole("status").filter({hasText:`Bound to Storm · Individual #${fixture.legacy}`}).waitFor();
      assert.equal((await pool.query("select vessel_instance_id from owned_creature_disposition where character_id=$1",[fixture.legacy])).rows[0].vessel_instance_id,empty);
      await copyRow.screenshot({path:path.join(artifacts,`vessel-bound-${width}.png`),style:focusedStyle});
      // Change the same individual back through the Creature side for the next deliberate transition.
      await player.reload();await player.locator("#character-tab-equipment").click();
      const individual=animals.locator("li").filter({hasText:`Individual #${fixture.legacy}`});
      await individual.getByRole("button",{name:"View companion",exact:true}).click();
      const pt=player.getByRole("region",{name:"Companion travel disposition",exact:true});
      await pt.getByLabel("Normal travel",{exact:true}).selectOption(initial==="Not Yet Set"?"away":"accompanying");
      if(initial==="Not Yet Set")await pt.getByLabel("Away location or note",{exact:true}).fill("At the stable");
      await pt.getByRole("checkbox",{name:"I confirm unbinding the current Vessel."}).check();
      await pt.getByRole("button",{name:"Save travel disposition",exact:true}).click();await pt.getByRole("status").waitFor();
      await player.getByRole("dialog").filter({has:pt}).getByRole("button",{name:"Close",exact:true}).click();
    }
    // Both G.O.D. editors expose retained unowned data with no mutation controls.
    await pool.query("update campaign_character set owner_character_id=null where id in ($1,$2)",[fixture.storm,fixture.simple]);
    await page.setViewportSize({width:1365,height:1000});await page.goto(`${base}/heavens/npcs/${fixture.storm}`);
    const retained=page.getByRole("region",{name:"Retained companion management",exact:true});
    await retained.getByText(`Individual #${fixture.storm}`,{exact:false}).waitFor();
    assert.equal(await retained.locator("input,select,textarea").count(),0);
    await retained.locator("summary").filter({hasText:"Companion Profile change history"}).click();
    await retained.locator("summary").filter({hasText:"Before and after"}).first().click();
    await retained.screenshot({path:path.join(artifacts,"retained-profile-desktop.png"),style:focusedStyle});
    await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    await retained.screenshot({path:path.join(artifacts,"retained-profile-phone.png"),style:focusedStyle});
    await page.goto(`${base}/heavens/npcs?campaign=${fixture.campaignId}`);
    await page.getByRole("searchbox",{name:"Search NPCs"}).fill("Simple profile companion");
    await page.locator(".npcs-card").filter({hasText:"Simple profile companion"}).getByRole("button",{name:"Open Simple Editor",exact:true}).click();
    await retained.getByText(`Individual #${fixture.simple}`,{exact:false}).waitFor();assert.equal(await retained.locator("input,select,textarea").count(),0);
    await retained.screenshot({path:path.join(artifacts,"retained-simple-phone.png"),style:focusedStyle});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    console.log("PASS Chrome Pass 3: Vessel-side binding for Not Yet Set, Away and Accompanying; duplicate Creature names and Vessel copies; immediate exact reverse lookup; original Creature-side unbind; desktop/390px; retained unowned simple/detailed inspection and before/after history.");
    assert.deepEqual(errors,[]);
    console.log("PASS Chrome: G.O.D. simple/detailed profiles, all control/preference choices, multiple roles, Other, Mount removal confirmation, ownership review; Player notes-only authority and unconfigured legacy; Vessel reverse lookup and separate histories; desktop/390px; persisted reload; no overflow, runtime buttons or page errors.");
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
