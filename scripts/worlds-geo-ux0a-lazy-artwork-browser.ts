/** Exact-source loading/fault/export proof, using only the verified owned technical database. */
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {gzipSync} from "node:zlib";
import type {Page} from "playwright-core";
import {ownedPool,UX0A_DIRECTORY} from "./worlds-geo-ux0a-harness";
import {islandRuntime} from "./worlds-geo-ux0a-runtime";
import {draftOf} from "../src/features/worlds/atlas";
import {assetReference,islandAssets} from "../src/features/worlds/island-assets";
import {artworkUrl} from "../src/features/worlds/island-artwork-source";

async function main(){
 const f=JSON.parse(await readFile(path.join(UX0A_DIRECTORY,"performance-current.json"),"utf8")),guard=await ownedPool(f.environment,"empty");await guard.end();
 process.env.DATABASE_URL=f.environment.empty;process.env.SERRIAN_RASTER_ROOT=f.environment.assetRoot;
 const [a,app,author]=await Promise.all([import("../src/features/worlds/atlas-service"),import("../src/db"),import("../src/features/worlds/geographic-authoring-service")]),asset=islandAssets[0];let empty="",used="",retained="";
 try{
  empty=await a.changeAtlas(f.environment.users.owner,f.world,{action:"create",name:`Unused illustration proof ${Date.now()}`,description:"New technical loading fixture",scope:"regional",style:"island-ink-wash"}) as string;
  used=await a.changeAtlas(f.environment.users.owner,f.world,{action:"create",name:`Exact mountain loading ${Date.now()}`,description:"New technical loading fixture",scope:"regional",style:"island-ink-wash"}) as string;
  const b=await a.getAtlas(f.environment.users.owner,f.world),map=b.maps.find(m=>m.id===used)!,draft=draftOf(map,b.geographies);
  draft.drawings=[400,1200].map((x,i)=>({version:2,type:"symbol",id:randomUUID(),name:`Exact mountain ${i+1}`,archived:false,geographyId:null,kind:"mountain",role:"decoration",point:{x,y:600},scale:1.4,rotation:0,style:"colored",assetRef:assetReference(asset)}));
  await a.changeAtlas(f.environment.users.owner,f.world,{action:"save",id:used,revision:map.revision,draft});
  await author.authorGeography(f.environment.users.owner,f.world,{action:"attach",requestId:randomUUID(),timelineId:f.timeline,mapId:used,surfaceId:f.surface});
  retained=JSON.stringify((await a.getAtlas(f.environment.users.owner,f.world)).maps.find(m=>m.id===used));
 }finally{await app.pool.end();}
 const r=await islandRuntime("empty","lazy-artwork",f.environment),dir="docs/screenshots/worlds-geo-ux0a/lazy-artwork",errors:string[]=[];await mkdir(dir,{recursive:true});
 const url=(id:string)=>`${r.base}/worlds/${f.world}?tab=atlas&timeline=${f.timeline}&editMap=${id}`;
 const canvas=(page:Page)=>page.getByRole("application",{name:"Editable map canvas",exact:true});
 const tools=(page:Page)=>page.getByRole("navigation",{name:"Studio tools",exact:true});
 const exportPng=async(page:Page,name:string)=>{await tools(page).getByRole("button",{name:"Export",exact:true}).click();const download=page.waitForEvent("download");await page.getByRole("button",{name:/^Export (?:authored )?PNG$/}).click();await(await download).saveAs(`${dir}/${name}.png`);};
 try{
  const auth=await r.browser.newContext();await r.login(auth);const storageState=await auth.storageState();await auth.close();
  const c=await r.browser.newContext({storageState,viewport:{width:1440,height:900},acceptDownloads:true}),page=await c.newPage(),requests:string[]=[],scripts:Promise<string>[]=[];
  page.on("pageerror",error=>errors.push(error.message));page.on("request",request=>{if(request.resourceType()==="fetch"&&request.url().includes("/cartography/"))requests.push(new URL(request.url()).pathname);});
  page.on("response",response=>{if(response.request().resourceType()==="script"&&response.url().startsWith(r.base))scripts.push(response.text());});
  await page.goto(url(empty));await canvas(page).waitFor();await page.waitForTimeout(1200);assert.deepEqual(requests,[]);
  await page.goto(url(used));await canvas(page).locator('[data-cartography-scene][data-artwork-ready="true"]').waitFor();await canvas(page).locator('mask[data-geographic-land-mask="ready"]').waitFor({state:"attached"});assert.deepEqual(requests,[artworkUrl(asset)]);
  assert.equal(await canvas(page).locator('[data-asset-revision]').count(),1);assert.equal(await canvas(page).locator('[data-drawing]').count(),2);
  const original=await readFile(`public${artworkUrl(asset)}`,"utf8"),uniquePath=original.match(/<path d="([^"]+)"/)![1],chunks=await Promise.all(scripts);assert.ok(chunks.every(body=>!body.includes(uniquePath)),"Original vector bodies must not be shipped in page JavaScript");
  await exportPng(page,"exact-source-export");await canvas(page).screenshot({path:`${dir}/two-exact-mountains.png`});const screen=await sharp(`${dir}/two-exact-mountains.png`).raw().toBuffer({resolveWithObject:true});let stonePixels=0;for(let i=0;i<screen.data.length;i+=screen.info.channels){const [red,green,blue]=screen.data.subarray(i,i+3);if(Math.abs(red-183)<=3&&Math.abs(green-179)<=3&&Math.abs(blue-160)<=3)stonePixels++;}assert.ok(stonePixels>300,"Live canvas must visibly render loaded mountains; definitions alone do not prove artwork is painted");await c.close();

  const fault=await r.browser.newContext({storageState,viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true}),fp=await fault.newPage();fp.on("pageerror",error=>errors.push(error.message));let corrupt=true,attempts=0,downloads=0;const writes:string[]=[];
  fp.on("download",()=>{downloads++;});fp.on("request",request=>{if(request.method()==="POST"&&request.url().includes("/api/worlds/"))writes.push(request.url());});
  await fp.route(`**${artworkUrl(asset)}`,async route=>{if(route.request().resourceType()==="fetch"){attempts++;if(corrupt){await route.fulfill({status:200,contentType:"image/svg+xml",body:original.replace(uniquePath,`${uniquePath} M0 0`)});return;}}await route.continue();});
  await fp.goto(url(used));await canvas(fp).waitFor();await tools(fp).getByRole("button",{name:"Artwork",exact:true}).tap();
  const notice=fp.locator('[aria-label="Artwork loading status"]:visible');await notice.getByRole("alert").filter({hasText:"does not match"}).waitFor();assert.equal(attempts,1);assert.equal(await canvas(fp).locator('[data-asset-revision]').count(),0);
  await fp.waitForTimeout(1200);assert.equal(attempts,1,"A failed revision must wait for explicit retry");
  const summary=fp.locator("summary").filter({hasText:/^Map information$/});await summary.click();await fp.getByLabel("Map title",{exact:true}).fill("Retained unapplied title");
  await tools(fp).getByRole("button",{name:"Export",exact:true}).tap();await fp.getByRole("button",{name:/^Export (?:authored )?PNG$/}).tap();await fp.getByLabel("Map image downloads").getByRole("alert").filter({hasText:"does not match"}).last().waitFor();assert.equal(downloads,0);assert.equal(attempts,1);
  await fp.getByRole("region",{name:"Map Studio",exact:true}).screenshot({path:`${dir}/checksum-failure-retained-source.png`});
  corrupt=false;await fp.locator('[aria-label="Artwork loading status"]:visible').getByRole("button",{name:"Retry illustrations",exact:true}).tap();await canvas(fp).locator('[data-cartography-scene][data-artwork-ready="true"]').waitFor();assert.equal(attempts,2);
  await tools(fp).getByRole("button",{name:"Artwork",exact:true}).tap();assert.equal(await fp.getByLabel("Map title",{exact:true}).inputValue(),"Retained unapplied title");
  await exportPng(fp,"retried-exact-export");assert.equal(downloads,1);assert.deepEqual(writes,[]);await fault.close();

  const stress=await r.browser.newContext({storageState,viewport:{width:1440,height:900},acceptDownloads:true}),sp=await stress.newPage();sp.on("pageerror",error=>errors.push(error.message));let releaseCity!:()=>void,cityHeld=false;const cityGate=new Promise<void>(resolve=>{releaseCity=resolve;});await sp.route(`**${artworkUrl(islandAssets.find(a=>a.id==="settlement-city")!)}`,async route=>{if(route.request().resourceType()==="fetch"){cityHeld=true;await cityGate;}await route.continue();});await sp.goto(url(f.map));await canvas(sp).locator('mask[data-geographic-land-mask="ready"]').waitFor({state:"attached"});await sp.waitForFunction(()=>document.querySelectorAll('[data-terrain-raster]').length===20,null,{timeout:15000});assert.equal(cityHeld,true);assert.equal(await canvas(sp).locator('[data-cartography-scene]').getAttribute("data-artwork-ready"),"false");const terrainUrls=await canvas(sp).locator("[data-terrain-raster]").evaluateAll(nodes=>nodes.map(node=>node.getAttribute("href")));releaseCity();await canvas(sp).locator('[data-cartography-scene][data-artwork-ready="true"]').waitFor();assert.deepEqual(await canvas(sp).locator("[data-terrain-raster]").evaluateAll(nodes=>nodes.map(node=>node.getAttribute("href"))),terrainUrls,"Unrelated city loading must retain exact existing terrain images");assert.equal(await canvas(sp).locator('[data-terrain-mark]').count(),0);assert.equal(await canvas(sp).locator('[data-terrain-source-marks]').evaluateAll(nodes=>nodes.reduce((n,g)=>n+Number(g.getAttribute("data-terrain-source-marks")),0)),1500);await tools(sp).getByRole("button",{name:"Export",exact:true}).click();const png=sp.waitForEvent("download");await sp.getByRole("button",{name:"Download visible map PNG",exact:true}).click();await(await png).saveAs(`${dir}/composed-stress-export.png`);await stress.close();
  const pool=await ownedPool(f.environment,"empty");try{const row=(await pool.query("select id,revision from world_atlas_map where id=$1",[used])).rows[0];assert.equal(row.revision,2);}finally{await pool.end();}
  assert.deepEqual(errors,[]);const result={passed:true,browser:r.browser.version(),scope:"Current three-subject exact-source loading only. No art promotion/expansion or final full-library acceptance.",emptyMapSourceFetches:0,usedMapSourceFetches:requests,unusedSubjectsFetched:0,oneDefinitionForTwoDrawings:true,liveCanvasStonePixels:stonePixels,inlineOriginalVectorBodiesInPageJavaScript:false,requestedScriptGzipBytes:chunks.reduce((n,body)=>n+gzipSync(body).length,0),corruptRevision:{firstAttemptRejected:true,noAutomaticRetry:true,exportBlockedWithoutDownload:true,explicitRetryAttempts:attempts,unappliedTitleRetained:true,worldWrites:writes},retainedMapSha256:createHash("sha256").update(retained).digest("hex"),stress:{bitmaps:20,retainedMarks:1500,visiblePng:true,terrainCachesRetainedAcrossDelayedCityLoad:true},errors};await writeFile(path.join(UX0A_DIRECTORY,"lazy-artwork-browser-results.json"),JSON.stringify(result,null,2));console.log("PASS lazy exact-source loading, corrupt-revision rejection/retry, retained fields and full-vector exports");
 }finally{await r.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
