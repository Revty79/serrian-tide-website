import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createWriteStream} from "node:fs";
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import type {Browser,BrowserContext,Page} from "playwright-core";
import {ownedFreePort,type RegionalFixture} from "./worlds-regional-editing-fixture";
import type {TownMapDocument} from "../src/features/worlds/town-map";

export async function townCreativeComparison({f,browser,context,base,map}:{f:RegionalFixture;browser:Browser;context:BrowserContext;base:string;map:string}) {
 const checkout=path.resolve("artifacts/towns-s5a-candidate-checkout"),dist=".next-s5a-release",expected="6ae420d43bfd4518904de93901036d526bf9fc358a965ffdff1200bbe027cc43";
 assert.equal((await readFile(path.join(checkout,dist,"serrian-runtime-sha256"),"utf8")).trim(),expected);
 const port=await ownedFreePort(),legacyBase="http://127.0.0.1:"+port,log=createWriteStream(f.out+"/creative-baseline-server.log");
 const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{cwd:checkout,windowsHide:true,env:{...process.env,NODE_ENV:"production",DATABASE_URL:f.databaseUrl,SERRIAN_TERRAIN_ROOT:f.terrainRoot,BETTER_AUTH_URL:legacyBase,BETTER_AUTH_SECRET:"regional-editing-disposable-only-secret",SERRIAN_TEST_NEXT_DIST_DIR:dist,NEXT_TELEMETRY_DISABLED:"1"},stdio:["ignore","pipe","pipe"]});server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});
 const state=await context.storageState(),before=await browser.newContext({viewport:{width:1440,height:1000},storageState:state}),after=await browser.newContext({viewport:{width:1440,height:1000},storageState:state});
 const api=(root:string)=>root+"/api/worlds/"+f.world+"/town-maps";
 async function capture(page:Page,root:string,id:string,file:string){
  await page.goto(root+"/worlds/"+f.world+"?tab=atlas&townMap="+id);const editor=page.getByRole("region",{name:"Town Map editor",exact:true}),canvas=page.getByLabel("Town Map canvas",{exact:true});await canvas.waitFor();await page.evaluate(()=>document.fonts.ready);
  for(const name of ["Tools","Options"]){const button=editor.getByRole("button",{name,exact:true});if(await button.getAttribute("aria-expanded")==="true")await button.click();}
  await editor.getByRole("button",{name:"Fit map",exact:true}).click();await canvas.scrollIntoViewIfNeeded();
  // Public wheel/middle-button navigation matches physical scale and centre for the technical artwork comparison.
  let view=JSON.parse((await canvas.getAttribute("data-view"))!);let bounds=(await canvas.boundingBox())!;
  await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
  for(let n=0;n<35&&Math.abs(view.scale-1)>.045;n++){await page.mouse.wheel(0,view.scale>1?1:-1);await page.waitForTimeout(25);view=JSON.parse((await canvas.getAttribute("data-view"))!);}
  const center={x:view.left+view.width/view.scale/2,y:view.top+view.height/view.scale/2},dx=(750-center.x)*view.scale,dy=(500-center.y)*view.scale;
  bounds=(await canvas.boundingBox())!;await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down({button:"middle"});await page.mouse.move(bounds.x+bounds.width/2-dx,bounds.y+bounds.height/2-dy,{steps:5});await page.mouse.up({button:"middle"});await page.waitForTimeout(60);
  view=JSON.parse((await canvas.getAttribute("data-view"))!);await canvas.screenshot({path:f.out+"/"+file+".png"});return {view,canvas:await canvas.boundingBox(),dpr:await page.evaluate(()=>devicePixelRatio)};
 }
 try {
  const deadline=Date.now()+60000;for(;;){assert.equal(server.exitCode,null);try{if((await fetch(legacyBase+"/login")).ok)break;}catch{}assert.ok(Date.now()<deadline);await new Promise(r=>setTimeout(r,200));}
  const currentResponse=await context.request.get(api(base)+"?map="+map,{maxRetries:2});assert.equal(currentResponse.status(),200);const current=(await currentResponse.json()).document as TownMapDocument;
  const legacyRead=await before.request.get(api(legacyBase)+"?map="+map,{maxRetries:2});assert.equal(legacyRead.status(),200);assert.deepEqual((await legacyRead.json()).document.design,current.design);
  const a=await before.newPage(),b=await after.newPage(),oldArt=await capture(a,legacyBase,map,"art-before-same-geometry"),newArt=await capture(b,base,map,"art-after-same-geometry");
  const settings={...current.design.recipe!,mode:"generate"},previewResponse=await before.request.post(api(legacyBase),{headers:{Origin:legacyBase},data:{action:"preview",sourceMapId:current.sourceMapId,frame:current.frame,settings}});assert.equal(previewResponse.status(),200,await previewResponse.text());const preview=await previewResponse.json(),towns=await(await before.request.get(legacyBase+"/api/worlds/"+f.world+"/towns?town="+current.townId)).json(),placement=towns.placements.find((p:{id:string})=>p.id===current.placementId);
  const id=crypto.randomUUID(),created=await before.request.post(api(legacyBase),{headers:{Origin:legacyBase},data:{action:"create",requestId:id,townId:current.townId,sourceMapId:current.sourceMapId,contextMapId:current.contextMapId,placementId:placement.id,placementRevision:placement.revision,anchor:current.anchor,frame:current.frame,name:"Earlier generator comparison",design:preview.design,previewToken:preview.previewToken}});assert.equal(created.status(),200,await created.text());const oldGeneration=await capture(a,legacyBase,id,"generation-before-matched-settings"),newGeneration=await capture(b,base,map,"generation-after-matched-settings");
  await writeFile(f.out+"/creative-comparison.json",JSON.stringify({passed:true,legacyApplicationCommit:"2f183ecd321a9e8774679e75524b8c211b312941",legacyRuntime:expected,newMap:map,legacyGenerationMap:id,sameCanonicalDesignForArt:true,sameWorldFrameAndRecipeForGeneration:true,settings,frame:current.frame,viewport:{width:1440,height:1000},gpuDisabled:true,oldArt,newArt,oldGeneration,newGeneration,canvasSizesReportedSeparately:true,pixelEqualityClaim:false,ownerAcceptance:false,sharedDatabaseAccess:false},null,2));
 } finally {await before.close();await after.close();server.kill();await new Promise<void>(resolve=>{if(server.exitCode!==null)resolve();else server.once("exit",()=>resolve());});log.end();}
}
