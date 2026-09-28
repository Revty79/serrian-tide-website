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
    assert.deepEqual(errors,[]);
    console.log("PASS: real Creature authoring UI add/edit/reorder/reload/remove; exact variant selection; retained archived destination; phone dialog scrolling and shared theme; Forms and NPC snapshots unchanged; no browser errors.");
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
