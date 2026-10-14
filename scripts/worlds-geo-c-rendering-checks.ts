/** Focused acceptance on an exact disposable clone of the populated C1 Earth. */
import assert from "node:assert/strict";
import {execFileSync,spawn} from "node:child_process";
import {createHmac,randomUUID} from "node:crypto";
import {createWriteStream} from "node:fs";
import {copyFile,mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import {chromium,type BrowserContext,type Page} from "playwright-core";
import {candidateFingerprint,stopServer} from "./worlds-geo-c.test";
import {EARTH} from "./worlds-geo-b-import";

const directory="artifacts/guidance/geo-c-rendering",secret="geo-c-task-disposable-auth-secret-only";
type Environment={database:string;databaseUrl:string;port:number;appPort:number;baseUrl:string;checkout:string};
async function environment():Promise<Environment>{const e=JSON.parse(await readFile(`${directory}/environment.json`,"utf8"));assert.match(e.database,/^serrian_geo_c_rendering_\d+$/);assert.equal(e.databaseUrl,`postgresql://postgres@127.0.0.1:${e.port}/${e.database}`);assert.equal(e.baseUrl,`http://127.0.0.1:${e.appPort}`);assert.equal(path.resolve(e.checkout),path.resolve("artifacts/guidance/geo-c/checkout"));return e;}
async function build(e:Environment){
  const fingerprint=await candidateFingerprint(),files=execFileSync("git",["ls-files","--cached","--others","--exclude-standard"],{encoding:"utf8",windowsHide:true}).trim().split(/\r?\n/);
  for(const file of files){if(file.startsWith("artifacts/"))continue;const destination=path.join(e.checkout,file);await mkdir(path.dirname(destination),{recursive:true});await copyFile(file,destination);}
  const log=createWriteStream(`${directory}/production-build.log`);
  try{await new Promise<void>((resolve,reject)=>{const child=spawn(process.execPath,["node_modules/next/dist/bin/next","build"],{cwd:e.checkout,windowsHide:true,env:{...process.env,NODE_ENV:"production",DATABASE_URL:e.databaseUrl,BETTER_AUTH_URL:e.baseUrl,BETTER_AUTH_SECRET:secret,SERRIAN_TEST_NEXT_DIST_DIR:".next-geo-c-rendering",NEXT_TELEMETRY_DISABLED:"1"},stdio:["ignore","pipe","pipe"]});child.stdout!.pipe(log,{end:false});child.stderr!.pipe(log,{end:false});child.once("error",reject);child.once("exit",code=>code===0?resolve():reject(Error(`Production build exited ${code}`)));});}finally{log.end();}
  assert.equal(await candidateFingerprint(),fingerprint);await writeFile(`${directory}/production-build.json`,JSON.stringify({passed:true,fingerprint,dist:".next-geo-c-rendering"},null,2));console.log("PASS isolated optimized production build");
}
async function authenticate(pool:pg.Pool,context:BrowserContext,base:string,user:string=EARTH.owner){const token=randomUUID(),signature=createHmac("sha256",secret).update(token).digest("base64");await pool.query("insert into session (id,user_id,token,expires_at,updated_at) values ($1,$2,$3,now()+interval '1 day',now())",[randomUUID(),user,token]);await context.addCookies([{name:"better-auth.session_token",value:encodeURIComponent(`${token}.${signature}`),url:base}]);}
async function capture(page:Page,file:string){const region=page.getByRole("region",{name:"Geographic map view",exact:true}),box=await region.boundingBox(),original=page.viewportSize()!;assert.ok(box);await page.setViewportSize({width:original.width,height:Math.ceil(box.height)+180});await region.evaluate(element=>window.scrollTo({top:window.scrollY+element.getBoundingClientRect().top-130,behavior:"instant"}));await region.screenshot({path:file});await page.setViewportSize(original);}
export async function renderingBrowser(pool:pg.Pool,e:Environment){
  const browser=await chromium.launch({executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000}}),results:string[]=[],errors:string[]=[];
  const f=JSON.parse(await readFile("artifacts/guidance/geo-c/service-fixture.json","utf8")),url=`${e.baseUrl}/worlds/${EARTH.world}?tab=atlas&timeline=${EARTH.timeline}&geography=1&geographicMap=${EARTH.map}`;
  if(process.argv.includes("--resume-browser")){const prior=JSON.parse(await readFile(`${directory}/browser-results.json`,"utf8"));results.push(...prior.results);}
  const check=async(name:string,run:()=>Promise<void>)=>{if(results.includes(name)){console.log(`REUSE ${name}`);return;}await run();results.push(name);console.log(`PASS ${name}`);await writeFile(`${directory}/browser-results.json`,JSON.stringify({passed:results.length,results,errors},null,2));};
  try{
    await authenticate(pool,context,e.baseUrl);const page=await context.newPage();page.on("pageerror",error=>errors.push(error.message));page.on("console",message=>{if(message.type()==="error"&&/React.Fragment|hydration|Invalid prop/.test(message.text()))errors.push(message.text());});
    const ws=page.getByRole("region",{name:"Geographic sources",exact:true}),reader=page.getByRole("article",{name:"Geographic source reader"}),ready=()=>ws.locator('[data-geographic-ready="true"]').count();
    const loaded=()=>page.locator('[data-geographic-ready="true"]').waitFor({timeout:360000});
    const find=async(name:string)=>{await ws.getByLabel("Find a visible geographic source",{exact:true}).fill(name);if(name==="GEO_C_PRIVATE_NAME")await ws.locator(`svg g[data-source="${f.secret}"]`).first().press("Enter");else await ws.getByRole("button",{name,exact:true}).click();await reader.getByRole("heading",{name,exact:true}).waitFor();};
    if(process.argv.includes("--resume-browser")){await page.goto(url);await loaded();}
    await check("Automatic whole Earth and manual Detailed complete with every eligible component",async()=>{
      await page.goto(url);await loaded();assert.equal(await ws.getByLabel("Display detail",{exact:true}).inputValue(),"auto");
      await page.evaluate(()=>performance.clearResourceTimings());const start=Date.now();await ws.getByLabel("Display detail",{exact:true}).selectOption("detail");await loaded();
      const measurement=JSON.parse(await readFile(`${directory}/measurements.json`,"utf8")),expected=measurement.views.find((v:{name:string})=>v.name==="manual-detailed-global");
      assert.equal(await ws.locator("svg path").count(),expected.parts);assert.equal(await ws.getByRole("alert").count(),0);assert.equal(await ws.getByLabel("Display projection",{exact:true}).inputValue(),"equirectangular");assert.ok((await ws.locator('[data-geographic-display]').innerText()).includes("Detailed sources"));
      for(const style of ["land","outline","river","water","region","peak","city","marine"])assert.ok(await ws.locator(`svg path[data-source-style="${style}"]`).count()>0,style);
      const resources=await page.evaluate(()=>performance.getEntriesByType("resource").filter(r=>r.name.includes("/geography?")).map(entry=>{const r=entry as PerformanceResourceTiming;return {bytes:r.encodedBodySize,transfer:r.transferSize,duration:r.duration};}));await writeFile(`${directory}/desktop-detailed.json`,JSON.stringify({ms:Date.now()-start,parts:expected.parts,requests:resources.length,resources},null,2));
      await capture(page,"docs/screenshots/worlds-geo-c/detailed-earth-rendering-repair.png");

    });
    await check("failed later Detailed page retains authorized partial geometry and recovers without duplicates",async()=>{
      await page.goto(url);await loaded();await find("HIMALAYAS");await reader.getByRole("button",{name:"Focus this source",exact:true}).click();await loaded();await ws.getByLabel("Display detail",{exact:true}).selectOption("detail");await loaded();
      let fail=true;await page.route("**/geography?**",async route=>{const q=new URL(route.request().url()).searchParams;if(q.get("map")===EARTH.map&&q.has("cursor")&&fail){await new Promise(r=>setTimeout(r,600));await route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:"Disposable later-page interruption"})});return;}await route.continue();});
      // Whole-surface refresh starts a fresh authorization attempt.
      await ws.getByRole("button",{name:"Pan east",exact:true}).click();await ws.getByRole("button",{name:"Retry geographic view",exact:true}).waitFor({timeout:15000});
      const parts=await ws.locator("svg path").count();assert.ok(parts>0);assert.ok((await ws.getByRole("alert").innerText()).includes("coverage is incomplete"));assert.equal(await ready(),0);
      await capture(page,`${directory}/retained-partial-error.png`);fail=false;await ws.getByRole("button",{name:"Retry geographic view",exact:true}).click();await loaded();assert.ok(await ws.locator("svg path").count()>parts);await page.unroute("**/geography?**");
    });
    await check("Canada and Fiji source focus retain Detailed navigation across the antimeridian",async()=>{
      for(const name of ["Canada","Fiji"]){await ws.getByLabel("Display detail",{exact:true}).selectOption("auto");await loaded();await ws.getByRole("button",{name:"Whole surface",exact:true}).click();await loaded();await find(name);await reader.getByRole("button",{name:"Focus this source",exact:true}).click();await loaded();await ws.getByLabel("Display detail",{exact:true}).selectOption("detail");await loaded();assert.equal(await ws.getByLabel("Display detail",{exact:true}).inputValue(),"detail");assert.ok(await ws.locator("svg path").count()>0);assert.ok((await ws.getByRole("region",{name:"Geographic map view",exact:true}).textContent())?.includes("Detailed sources"));}
      await ws.getByRole("button",{name:"Pan east",exact:true}).click();await loaded();await ws.getByLabel("Display projection",{exact:true}).selectOption("mercator");await loaded();await ws.getByLabel("Display projection",{exact:true}).selectOption("equirectangular");await loaded();
    });
    await check("superseded delayed requests cannot replace a newer extent",async()=>{
      let held=false;await page.route("**/geography?**",async route=>{const q=new URL(route.request().url()).searchParams;if(q.has("bounds")&&!q.has("cursor")&&!held){held=true;await new Promise(r=>setTimeout(r,1800));}await route.continue();});
      await ws.getByRole("button",{name:"Zoom in",exact:true}).click();await page.waitForTimeout(100);
      await page.evaluate(u=>history.pushState(null,"",u),url.replace(EARTH.map,"00000000-0000-4000-8000-000000000001"));await ws.getByRole("button",{name:"Retry geographic view",exact:true}).waitFor();await page.waitForTimeout(1900);assert.equal(await ws.locator("svg").count(),0);
      // Projection/detail controls disappear during a context change; select a
      // different map through the same mounted workspace while it is pending.
      const glass=`${e.baseUrl}/worlds/df7be692-6307-4921-a6eb-dfe6ef79290e?tab=atlas&timeline=6768a3d0-afd2-43d8-8ffb-8009471d593e&geography=1&geographicMap=8c775bc6-da4a-4761-9649-452d3f4834bc`;
      await page.goto(glass);await loaded();await page.waitForTimeout(1900);assert.equal(await ws.getByLabel("Display projection",{exact:true}).inputValue(),"planar");assert.ok(await ws.locator("svg path").count()>0);assert.ok(!(await ws.textContent())?.includes("Canada"));await page.unroute("**/geography?**");
    });
    await check("both ordinary aliases hide prior protected geometry, labels and accounts through delay, failure and retry",async()=>{
      for(const alias of ["knowledge=ordinary","ordinary=1"]){
        await page.goto(url);await loaded();await find("GEO_C_PRIVATE_NAME");await reader.getByRole("button",{name:"Focus this source",exact:true}).click();await loaded();assert.ok((await reader.textContent())?.includes("GEO_C_PRIVATE_ACCOUNT"));
        let fail=true;await page.route("**/geography?**",async route=>{const q=new URL(route.request().url()).searchParams;if(q.get("ordinary")==="1"&&q.has("map")){await new Promise(r=>setTimeout(r,700));if(fail){await route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:"Disposable ordinary failure"})});return;}}await route.continue();});
        await page.evaluate(u=>history.pushState(null,"",u),`${url}&${alias}`);await page.waitForTimeout(150);assert.ok(!/GEO_C_PRIVATE_(NAME|ACCOUNT)/.test(await ws.innerText()));await ws.getByRole("button",{name:"Retry geographic view",exact:true}).waitFor();assert.ok(!/GEO_C_PRIVATE_(NAME|ACCOUNT)/.test(await ws.innerText()));assert.equal(await ws.locator("svg").count(),0);
        fail=false;await ws.getByRole("button",{name:"Retry geographic view",exact:true}).click();await loaded();assert.equal(await ws.locator(`svg [data-source="${f.secret}"]`).count(),0);assert.equal(await ws.getByRole("button",{name:"Save source revision",exact:true}).count(),0);await page.unroute("**/geography?**");
        await page.evaluate(u=>history.pushState(null,"",u),url);await loaded();await find("GEO_C_PRIVATE_NAME");assert.equal(await reader.getByRole("button",{name:"Save source revision",exact:true}).count(),1);
      }
    });
    await check("permission rejection and changed source context clear earlier pages",async()=>{
      for(const mode of ["deny","changed"]){let pages=0;await page.route("**/geography?**",async route=>{const q=new URL(route.request().url()).searchParams;if(q.get("map")===EARTH.map&&!q.has("feature")){pages++;if(q.has("cursor")){if(mode==="deny"){await route.fulfill({status:403,contentType:"application/json",body:JSON.stringify({error:"Disposable access revoked"})});return;}const response=await route.fetch(),body=await response.json();body.context="source-protection-changed";await route.fulfill({response,json:body});return;}}await route.continue();});
        await page.goto(url);await ws.getByRole("button",{name:"Retry geographic view",exact:true}).waitFor({timeout:20000});assert.ok(pages>=2);assert.equal(await ws.locator("svg").count(),0);assert.ok(!/GEO_C_PRIVATE_(NAME|ACCOUNT)/.test(await ws.innerText()));await page.unroute("**/geography?**");
      }
    });
    await check("Administrator review remains read-only and native touch Detailed Earth finishes",async()=>{
      const admin=await browser.newContext({viewport:{width:1440,height:1000}});try{await authenticate(pool,admin,e.baseUrl,"geo-c-admin");const p=await admin.newPage();await p.goto(`${url}&review=1`);await p.locator('[data-geographic-ready="true"]').waitFor({timeout:90000});assert.equal(await p.getByRole("button",{name:"Save coordinate surface",exact:true}).count(),0);assert.equal(await p.getByRole("button",{name:"Import geographic sources",exact:true}).count(),0);}finally{await admin.close();}
      const phone=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});try{await authenticate(pool,phone,e.baseUrl);const p=await phone.newPage();p.on("pageerror",error=>errors.push(error.message));await p.goto(url);await p.locator('[data-geographic-ready="true"]').waitFor({timeout:90000});const start=Date.now();await p.getByLabel("Display detail",{exact:true}).selectOption("detail");await p.locator('[data-geographic-ready="true"]').waitFor({timeout:360000});const parts=await p.locator('section[aria-label="Geographic sources"] svg path').count();assert.ok(parts>30000);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.ok(await p.locator('section[aria-label="Geographic sources"] svg text').count()<=20);await writeFile(`${directory}/phone-detailed.json`,JSON.stringify({width:390,hasTouch:true,ms:Date.now()-start,parts},null,2));await capture(p,"docs/screenshots/worlds-geo-c/detailed-earth-touch-repair.png");await p.getByLabel("Display detail",{exact:true}).selectOption("auto");await p.locator('[data-geographic-ready="true"]').waitFor({timeout:90000});await p.getByRole("button",{name:"Zoom in",exact:true}).tap();await p.locator('[data-geographic-ready="true"]').waitFor({timeout:90000});}finally{await phone.close();}
    });
    assert.deepEqual(errors,[]);
  }finally{await context.close();await browser.close();}
}
async function main(){
  await mkdir(directory,{recursive:true});const e=await environment();process.env.DATABASE_URL=e.databaseUrl;
  if(process.argv.includes("--build")){await build(e);return;}
  const pool=new pg.Pool({connectionString:e.databaseUrl});
  try{
    if(process.argv.includes("--services")){const f=JSON.parse(await readFile("artifacts/guidance/geo-c/service-fixture.json","utf8"));f.target=e.database;await writeFile(`${directory}/service-fixture.json`,JSON.stringify(f));const checks=await import("./worlds-geo-c-checks");await checks.geoCServices(pool,directory);return;}
    const log=createWriteStream(`${directory}/production-server.log`,{flags:"a"}),server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(e.appPort)],{cwd:e.checkout,windowsHide:true,env:{...process.env,NODE_ENV:"production",DATABASE_URL:e.databaseUrl,BETTER_AUTH_URL:e.baseUrl,BETTER_AUTH_SECRET:secret,SERRIAN_TEST_NEXT_DIST_DIR:".next-geo-c-rendering",NEXT_TELEMETRY_DISABLED:"1"},stdio:["ignore","pipe","pipe"]});server.stdout!.pipe(log,{end:false});server.stderr!.pipe(log,{end:false});
    try{let ready=false;for(let i=0;i<100;i++){assert.equal(server.exitCode,null);try{ready=(await fetch(`${e.baseUrl}/login`,{signal:AbortSignal.timeout(1000)})).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,200));}assert.ok(ready);if(process.argv.includes("--contexts")){const {renderingContexts}=await import("./worlds-geo-c-rendering-contexts");await renderingContexts(pool,e,directory);}else await renderingBrowser(pool,e);}finally{stopServer(server);log.end();}
  }finally{await pool.end();const app=await import("../src/db");await app.pool.end();}
}
if(process.argv[1]?.endsWith("worlds-geo-c-rendering-checks.ts"))main().catch(error=>{console.error(error);process.exitCode=1;});
