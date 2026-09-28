import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { hashPassword } from "better-auth/crypto";
import { chromium } from "playwright-core";
import { pool } from "@/db";
import { APPEARANCE_PRESETS, getAppearanceCssVariables } from "@/features/appearance/appearance";

assert.equal(process.env.SERRIAN_EVOLUTION_DISPOSABLE,"true");
assert.match(process.env.DATABASE_URL ?? "",/^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_creature_evolution_dev$/);
const artifacts=path.resolve("artifacts/guidance/creature-evolutions");
async function until(check:()=>Promise<boolean>,label:string) {
  const deadline=Date.now()+180_000;
  while(Date.now()<deadline) { if(await check()) return; await new Promise(resolve=>setTimeout(resolve,250)); }
  throw new Error(`Timed out: ${label}`);
}
async function main() {
  await mkdir(artifacts,{recursive:true});
  const tsconfig=await readFile("tsconfig.json"),nextEnv=await readFile("next-env.d.ts");
  const listener=createServer(); await new Promise<void>(resolve=>listener.listen(0,"127.0.0.1",resolve));
  const address=listener.address(); assert.ok(address && typeof address === "object"); const port=address.port;
  await new Promise<void>(resolve=>listener.close(()=>resolve()));
  const base=`http://localhost:${port}`,userId="evolution-god",password="Evolution-Disposable-Only!";
  let server:ChildProcess|null=null,browser:Awaited<ReturnType<typeof chromium.launch>>|null=null,serverLog="";
  const errors:string[]=[];
  const query=async(text:string,values:unknown[]=[]) => (await pool.query(text,values)).rows;
  try {
    await pool.query('update "user" set email_verified=true,username=$1,display_username=$1 where id=$1',[userId]);
    await pool.query("insert into account(id,issuer,account_id,provider_id,user_id,password,updated_at) values($1,'local:credential',$2,'credential',$2,$3,now())",[`${userId}-credential`,userId,await hashPassword(password)]);
    const source=(await query("select id from creatures where canonical_name='Evolution Young Drake'"))[0].id as number;
    const destination=(await query("select id from creatures where canonical_name='Evolution Frost Drake'"))[0].id as number;
    const variant=(await query("select id from creatures where canonical_name='Evolution Destination Variant'"))[0].id as number;
    const before=await query("select to_jsonb(t) body from campaign_creature_npc_profile t order by character_id");
    const forms=await query("select to_jsonb(t) body from creature_forms t where creature_id=$1 order by id",[source]);
    server=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--port",String(port)],{cwd:process.cwd(),env:{...process.env,BETTER_AUTH_URL:base,NEXT_TELEMETRY_DISABLED:"1",SERRIAN_TEST_NEXT_DIST_DIR:".next-evolution-browser"},stdio:"pipe",windowsHide:true});
    server.stdout?.on("data",chunk=>{serverLog+=String(chunk);}); server.stderr?.on("data",chunk=>{serverLog+=String(chunk);});
    await until(async()=>{if(server?.exitCode!==null) throw new Error("Next exited before startup."); try{return(await fetch(`${base}/login`)).ok;}catch{return false;}},"Next startup");
    browser=await chromium.launch({executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true});
    const context=await browser.newContext({viewport:{width:1365,height:1000},hasTouch:true});
    const page=await context.newPage(); page.setDefaultTimeout(40_000); page.setDefaultNavigationTimeout(180_000);
    page.on("pageerror",error=>errors.push(error.message));
    const login=await context.request.post(`${base}/api/auth/sign-in/email`,{headers:{Origin:base},data:{email:`${userId}@example.invalid`,password}}); assert.equal(login.status(),200);
    await page.goto(`${base}/heavens/creatures`);
    const openSource=async()=>{
      await page.locator("#creature-search").fill("Evolution Young Drake");
      await page.locator(".skill-library__row").filter({hasText:"Evolution Young Drake"}).click();
      await page.getByRole("button",{name:"Evolutions",exact:true}).click();
      await page.getByRole("button",{name:"Add Evolution",exact:true}).waitFor();
    };
    await openSource();
    const area=page.getByRole("region",{name:"Evolution paths",exact:true});
    const dialog=page.getByRole("dialog");
    await area.getByRole("button",{name:"Add Evolution",exact:true}).click();
    await dialog.getByLabel("Evolution name",{exact:true}).fill("Browser Frost branch");
    await dialog.getByLabel("Find destination Creature",{exact:true}).fill("Evolution Frost Drake");
    await dialog.getByLabel("Destination Creature",{exact:true}).selectOption(String(destination));
    await dialog.getByLabel("Description",{exact:true}).fill("Growing into the cold.");
    await dialog.getByLabel("Notes",{exact:true}).fill("Authored path only.");
    await dialog.getByRole("button",{name:"Save Evolution",exact:true}).click();
    await area.getByRole("heading",{name:"Browser Frost branch",exact:true}).waitFor();
    const pathId=(await query("select id from creature_evolution_paths where source_creature_id=$1 and name='Browser Frost branch'",[source]))[0].id;
    await area.getByRole("button",{name:"Move Browser Frost branch up",exact:true}).click();
    await until(async()=>(await query("select id from creature_evolution_paths where source_creature_id=$1 order by sort_order,id",[source]))[0].id===pathId,"reorder saved");
    await area.getByRole("button",{name:"Edit Browser Frost branch",exact:true}).click();
    await dialog.getByLabel("Evolution name",{exact:true}).fill("Browser Frost evolution");
    await dialog.getByRole("button",{name:"Save Evolution",exact:true}).click();
    await area.getByRole("heading",{name:"Browser Frost evolution",exact:true}).waitFor();
    assert.equal((await query("select id from creature_evolution_paths where source_creature_id=$1 and name='Browser Frost evolution'",[source]))[0].id,pathId);
    await page.screenshot({path:path.join(artifacts,"evolutions-desktop.png"),fullPage:true});
    await page.reload(); await openSource();
    await area.getByRole("heading",{name:"Browser Frost evolution",exact:true}).waitFor();
    await pool.query("update creatures set archived_at=now(),archived_by_user_id=$2,archive_reason='Browser archive check' where id=$1",[destination,userId]);
    await area.getByRole("button",{name:"Reload Evolutions",exact:true}).click();
    await area.getByText(/This destination is archived/).waitFor();
    await area.getByRole("button",{name:"Edit Browser Frost evolution",exact:true}).click();
    await dialog.getByLabel("Notes",{exact:true}).fill("Retained archived destination.");
    await dialog.getByRole("button",{name:"Save Evolution",exact:true}).click();
    await area.getByText("Notes: Retained archived destination.",{exact:true}).waitFor();
    await page.setViewportSize({width:390,height:844});
    await area.getByRole("button",{name:"Add Evolution",exact:true}).click();
    await dialog.getByLabel("Evolution name",{exact:true}).fill("Browser exact variant");
    await dialog.getByLabel("Find destination Creature",{exact:true}).fill("Evolution Frost Drake");
    await dialog.getByText(/Showing up to 30/).waitFor();
    assert.equal(await dialog.locator(`option[value="${destination}"]`).count(),0,"archived target is not a new option");
    await dialog.getByLabel("Find destination Creature",{exact:true}).fill("Evolution Destination Variant");
    await dialog.getByLabel("Destination Creature",{exact:true}).selectOption(String(variant));
    await dialog.getByText(/Variant of Evolution Adult Drake/).last().waitFor();
    const help=dialog.getByLabel("Help for Notes",{exact:true});
    await help.click(); await page.keyboard.press("Escape"); assert.equal(await dialog.isVisible(),true);
    await dialog.getByRole("button",{name:"Save Evolution",exact:true}).scrollIntoViewIfNeeded();
    const bounds=await dialog.boundingBox(); assert.ok(bounds && bounds.x>=0 && bounds.x+bounds.width<=391 && bounds.y>=0 && bounds.y+bounds.height<=845);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const colors=await dialog.getByLabel("Destination Creature",{exact:true}).evaluate(element=>({background:getComputedStyle(element).backgroundColor,color:getComputedStyle(element).color}));
    await dialog.evaluate((element,variables)=>{element.setAttribute("data-appearance-theme-scope",""); for(const [key,value] of Object.entries(variables)) (element as HTMLElement).style.setProperty(key,value);},getAppearanceCssVariables(APPEARANCE_PRESETS.classic));
    const alternate=await dialog.getByLabel("Destination Creature",{exact:true}).evaluate(element=>({background:getComputedStyle(element).backgroundColor,color:getComputedStyle(element).color}));
    assert.notDeepEqual(alternate,colors,"select responds to shared scoped appearance");
    await page.screenshot({path:path.join(artifacts,"evolution-dialog-phone.png"),fullPage:false});
    await dialog.getByRole("button",{name:"Save Evolution",exact:true}).click();
    await area.getByRole("heading",{name:"Browser exact variant",exact:true}).waitFor();
    await area.getByRole("button",{name:"Remove Browser exact variant",exact:true}).click();
    await dialog.getByRole("button",{name:"Remove Evolution",exact:true}).click();
    await area.getByRole("heading",{name:"Browser exact variant",exact:true}).waitFor({state:"hidden"});
    await area.getByRole("button",{name:"Edit Browser Frost evolution",exact:true}).click();
    await page.keyboard.press("Escape"); await dialog.waitFor({state:"hidden"});
    await page.getByRole("button",{name:"Forms",exact:true}).click();
    assert.deepEqual(await query("select to_jsonb(t) body from creature_forms t where creature_id=$1 order by id",[source]),forms);
    assert.deepEqual(await query("select to_jsonb(t) body from campaign_creature_npc_profile t order by character_id"),before);
    await page.getByRole("button",{name:"Evolutions",exact:true}).click();
    await area.getByRole("heading",{name:"Browser Frost evolution",exact:true}).waitFor();
    await page.screenshot({path:path.join(artifacts,"evolutions-phone.png"),fullPage:true});
    // Pass 2: authenticate the Campaign G.O.D. used by both Race/Creature fixtures.
    const requirementsUser="requirements-god";
    await pool.query('update "user" set email_verified=true,username=$1,display_username=$1 where id=$1',[requirementsUser]);
    await pool.query("insert into account(id,issuer,account_id,provider_id,user_id,password,updated_at) values($1,'local:credential',$2,'credential',$2,$3,now())",[`${requirementsUser}-credential`,requirementsUser,await hashPassword(password)]);
    await context.request.post(`${base}/api/auth/sign-out`,{headers:{Origin:base},data:{}});
    const secondLogin=await context.request.post(`${base}/api/auth/sign-in/email`,{headers:{Origin:base},data:{email:`${requirementsUser}@example.invalid`,password}});assert.equal(secondLogin.status(),200);
    const raceDestination=(await query("select id from races where name='Evolution Elf'"))[0].id;
    for(const kind of ["creature","race"] as const) {
      const name=kind==="creature"?"Requirements Young Drake":"Evolution Human";
      const pathName=kind==="creature"?"Mature":"Ascend";
      const individualName=kind==="creature"?"Requirements Ember":"Evolution PC";
      const selectedIndividual=(await query("select id from campaign_character where name=$1",[individualName]))[0].id;
      if(kind === "race") for (const key of ["STR","DEX","CON","INT","WIS","CHR"]) await pool.query("insert into campaign_character_attribute(character_id,attribute_key,value) values($1,$2,30) on conflict do nothing",[selectedIndividual,key]);
      await page.setViewportSize({width:1365,height:1000});
      await page.goto(`${base}/heavens/${kind}s`);
      await page.locator(`#${kind}-search`).fill(name);
      await page.locator(".skill-library__row").filter({has:page.locator(".skill-library__row-name").filter({hasText:name})}).click();
      await page.getByRole("button",{name:"Evolutions",exact:true}).click();
      await area.getByRole("heading",{name:pathName,exact:true}).waitFor();
      if(kind==="race") {
        await area.getByRole("button",{name:"Add Evolution",exact:true}).click();
        await dialog.getByLabel("Evolution name",{exact:true}).fill("Browser Race branch");
        await dialog.getByLabel("Find destination Race",{exact:true}).fill("Evolution Elf");
        await dialog.getByLabel("Destination Race",{exact:true}).selectOption(String(raceDestination));
        await dialog.getByRole("button",{name:"Save Evolution",exact:true}).click();
        await area.getByRole("heading",{name:"Browser Race branch",exact:true}).waitFor();
        await area.getByRole("button",{name:"Move Browser Race branch up",exact:true}).click();
        await area.getByText("Evolution order saved.",{exact:true}).waitFor();
        await area.getByRole("button",{name:"Remove Browser Race branch",exact:true}).click();
        await dialog.getByRole("button",{name:"Remove Evolution",exact:true}).click();
        await area.getByRole("heading",{name:"Browser Race branch",exact:true}).waitFor({state:"hidden"});
      }
      await area.getByRole("button",{name:`Requirements for ${pathName}`,exact:true}).click();
      await dialog.getByLabel("Requirement mode",{exact:true}).selectOption("unrestricted");
      await dialog.getByLabel("Requirement mode",{exact:true}).selectOption("requirements");
      await dialog.getByRole("button",{name:"Add requirement",exact:true}).click();
      await dialog.getByLabel("Requirement notes",{exact:true}).fill("G.O.D. must confirm the story milestone.");
      await dialog.getByRole("button",{name:"Add alternative group",exact:true}).click();
      const secondGroup=dialog.getByRole("region",{name:"Requirement group 2",exact:true});
      await secondGroup.getByRole("button",{name:"Add requirement",exact:true}).click();
      await secondGroup.getByLabel("Requirement type",{exact:true}).selectOption("age");
      await secondGroup.getByLabel("Required value",{exact:true}).fill("18");
      await page.screenshot({path:path.join(artifacts,`${kind}-requirements-desktop.png`),fullPage:false});
      await page.setViewportSize({width:390,height:844});
      await dialog.getByRole("button",{name:"Save requirements",exact:true}).scrollIntoViewIfNeeded();
      const requirementBounds=await dialog.boundingBox();assert.ok(requirementBounds && requirementBounds.x>=0 && requirementBounds.x+requirementBounds.width<=391 && requirementBounds.y>=0 && requirementBounds.y+requirementBounds.height<=845);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:path.join(artifacts,`${kind}-requirements-phone.png`),fullPage:false});
      await dialog.getByRole("button",{name:"Save requirements",exact:true}).click();
      await area.getByText("Evolution requirements saved.",{exact:true}).waitFor();
      await area.getByRole("button",{name:`Requirements for ${pathName}`,exact:true}).click();
      assert.equal(await dialog.getByLabel("Requirement notes",{exact:true}).first().inputValue(),"G.O.D. must confirm the story milestone.");
      await dialog.getByRole("button",{name:"Close",exact:true}).click();
      const stateBefore=await query("select to_jsonb(t) body from campaign_character_profile t order by character_id");
      await area.getByRole("button",{name:`Preview eligibility for ${pathName}`,exact:true}).click();
      await dialog.getByLabel(kind==="race"?"Character":"Individual Creature",{exact:true}).selectOption(String(selectedIndividual));
      await dialog.getByRole("button",{name:"Check eligibility",exact:true}).click();
      await dialog.getByRole("heading",{name:kind==="race"?"Eligible":"Requires G.O.D. review",exact:true}).waitFor();
      await dialog.getByRole("button",{name:"Close preview",exact:true}).scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(artifacts,`${kind}-eligibility-phone.png`),fullPage:false});
      assert.deepEqual(await query("select to_jsonb(t) body from campaign_character_profile t order by character_id"),stateBefore);
      await dialog.getByRole("button",{name:"Close preview",exact:true}).click();
    }
    // Pass 3: actual permanent Race and Creature transitions under a third Campaign G.O.D.
    const executionUser="execution-god";
    await pool.query('update "user" set email_verified=true,username=$1,display_username=$1 where id=$1',[executionUser]);
    await pool.query("insert into account(id,issuer,account_id,provider_id,user_id,password,updated_at) values($1,'local:credential',$2,'credential',$2,$3,now())",[`${executionUser}-credential`,executionUser,await hashPassword(password)]);
    await context.request.post(`${base}/api/auth/sign-out`,{headers:{Origin:base},data:{}});
    assert.equal((await context.request.post(`${base}/api/auth/sign-in/email`,{headers:{Origin:base},data:{email:`${executionUser}@example.invalid`,password}})).status(),200);
    for(const kind of ["race","creature"] as const) {
      const name=kind === "race" ? "Execution Human" : "Execution Young Drake";
      const pathName=kind === "race" ? "Changed later" : "Mature permanently";
      const table=kind === "race" ? "campaign_character_profile" : "campaign_creature_npc_profile", column=kind === "race" ? "race_id" : "creature_id";
      const roots=await query(kind === "race" ? "select id from races where name=$1" : "select id from creatures where canonical_name=$1",[name]);
      const candidates=await query(`select c.id from campaign_character c join ${table} p on p.character_id=c.id where p.${column}=$1 and c.archived_at is null and not exists(select 1 from campaign_session_encounter_participant ep where ep.character_id=c.id) order by c.id`,[roots[0].id]);
      const subject=candidates[0].id;
      await pool.query("update campaign_character set name=$2 where id=$1",[subject,`Browser persistent ${kind}`]);
      if(kind === "creature") {
        const stored=(await query("select current_snapshot_json from campaign_creature_npc_profile where character_id=$1",[subject]))[0];
        const edited=JSON.parse(stored.current_snapshot_json);edited.attributes[0].value+=5;
        await pool.query("update campaign_creature_npc_profile set current_snapshot_json=$2 where character_id=$1",[subject,JSON.stringify(edited)]);
        const path=(await query("select id from creature_evolution_paths where source_creature_id=$1 and name=$2",[roots[0].id,pathName]))[0].id;
        await pool.query("update creature_evolution_paths set requirement_mode='requirements',version=version+1 where id=$1",[path]);
        await pool.query("insert into creature_evolution_requirements(path_id,requirement_key,group_number,sort_order,requirement_type,manual_category,notes) values($1,'browser-milestone',0,0,'manual','milestone','Confirm this companion completed its story milestone.')",[path]);
      }
      await page.setViewportSize({width:1365,height:1000});await page.goto(`${base}/heavens/${kind}s`);
      await page.locator(`#${kind}-search`).fill(name);
      await page.locator(".skill-library__row").filter({has:page.locator(".skill-library__row-name").filter({hasText:name})}).click();
      await page.getByRole("button",{name:"Evolutions",exact:true}).click();
      if(kind === "race") {
        await area.getByRole("button",{name:`Edit ${pathName}`,exact:true}).click();
        await dialog.getByLabel("STR change",{exact:true}).selectOption("add");
        await dialog.getByLabel("STR value",{exact:true}).fill("10");
        await dialog.getByLabel("CON change",{exact:true}).selectOption("add");
        await dialog.getByLabel("CON value",{exact:true}).fill("15");
        await page.setViewportSize({width:390,height:844});
        await dialog.getByRole("button",{name:"Save Evolution",exact:true}).scrollIntoViewIfNeeded();
        await page.screenshot({path:path.join(artifacts,"race-permanent-adjustments-phone.png")});
        await dialog.getByRole("button",{name:"Save Evolution",exact:true}).click();
      }
      await area.getByRole("button",{name:`Preview eligibility for ${pathName}`,exact:true}).click();
      await dialog.getByLabel(kind === "race" ? "Character" : "Individual Creature",{exact:true}).selectOption(String(subject));
      await dialog.getByRole("button",{name:"Check eligibility",exact:true}).click();
      await dialog.getByRole("heading",{name:kind === "creature" ? "Requires G.O.D. review" : "Eligible",exact:true}).waitFor();
      await page.setViewportSize({width:1365,height:1000});
      await page.screenshot({path:path.join(artifacts,`${kind}-execution-desktop.png`)});
      await page.setViewportSize({width:390,height:844});
      const execute=dialog.getByRole("button",{name:new RegExp(`^Evolve Browser persistent ${kind} into`)});
      assert.equal(await execute.isDisabled(),true);
      await dialog.getByLabel(/I have reviewed the permanent mechanical changes/).check();
      if(kind === "creature") {
        assert.equal(await execute.isDisabled(),true);
        await dialog.getByLabel(/Confirm this requirement for this execution/).check();
        assert.equal(await execute.isDisabled(),true,"replacement needs a separate acknowledgement");
      }
      const override=dialog.getByLabel(/I confirm replacing this Creature/);if(await override.count())await override.check();
      await execute.scrollIntoViewIfNeeded();const rectangle=await execute.boundingBox();assert.ok(rectangle&&rectangle.x>=0&&rectangle.x+rectangle.width<=391);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:path.join(artifacts,`${kind}-execution-phone.png`)});
      await execute.click();await dialog.getByRole("status").filter({hasText:/Evolution event #/}).waitFor();
      assert.notEqual((await query(`select ${column} id from ${table} where character_id=$1`,[subject]))[0].id,roots[0].id);
      const eventTable=kind === "race" ? "race_evolution_events" : "creature_evolution_events";
      assert.equal(Number((await query(`select count(*) n from ${eventTable} where character_id=$1`,[subject]))[0].n),1);
      await dialog.getByRole("region",{name:"Individual Evolution history"}).waitFor();
      await page.screenshot({path:path.join(artifacts,`${kind}-execution-history-phone.png`)});
      await dialog.getByRole("button",{name:"Close preview",exact:true}).click();
    }
    assert.deepEqual(errors,[]);
    console.log("PASS: real Race and Creature persistent execution, Race permanent adjustment authoring, health acknowledgement, event history, desktop/390px controls; real Race and Creature requirements AND/OR authoring, saved reload, Campaign G.O.D. eligibility and 390px scrolling; Creature authoring UI add/edit/reorder/reload/remove; exact variant selection; retained archived destination; phone dialog scrolling and shared theme; Forms and NPC snapshots unchanged; no browser errors.");
  } catch(error) {
    const page=browser?.contexts()[0]?.pages()[0];
    if(page) { await page.screenshot({path:path.join(artifacts,"failure.png"),fullPage:true}).catch(()=>undefined); await writeFile(path.join(artifacts,"failure.txt"),await page.locator("body").innerText().catch(()=>"")); }
    throw error;
  } finally {
    if(browser) await browser.close();
    if(server && server.exitCode===null) {server.kill(); await new Promise<void>(resolve=>{const timer=setTimeout(resolve,3000);server!.once("exit",()=>{clearTimeout(timer);resolve();});});}
    await writeFile(path.join(artifacts,"server.log"),serverLog); await pool.end();
    await writeFile("tsconfig.json",tsconfig);await writeFile("next-env.d.ts",nextEnv);
  }
}
main().catch((error:unknown)=>{console.error(error);process.exitCode=1;});
