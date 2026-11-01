import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createWriteStream} from "node:fs";
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import type {Browser,BrowserContext,Page} from "playwright-core";
import {ownedFreePort,type RegionalFixture} from "./worlds-regional-editing-fixture";
import type {TownMapDocument} from "../src/features/worlds/town-map";

/** Read-only accepted zoom application, against this run's owned synthetic database only. */
export async function townNeighborhoodComparison({f,browser,context,base,manualMap,generatedMap}:{f:RegionalFixture;browser:Browser;context:BrowserContext;base:string;manualMap:string;generatedMap:string}){
 const checkout=path.resolve("artifacts/towns-s5a-wheel-candidate"),dist=".next-wheel-production",runtime="d9370f7f213b09e27ede209e84688070b84d740968ec5a14f710337d484285ef";
 assert.equal((await readFile(path.join(checkout,dist,"serrian-runtime-sha256"),"utf8")).trim(),runtime);
 const port=await ownedFreePort(),oldBase="http://127.0.0.1:"+port,log=createWriteStream(f.out+"/neighborhood-baseline-server.log"),server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{cwd:checkout,windowsHide:true,env:{...process.env,NODE_ENV:"production",DATABASE_URL:f.databaseUrl,SERRIAN_TERRAIN_ROOT:f.terrainRoot,BETTER_AUTH_URL:oldBase,BETTER_AUTH_SECRET:"regional-editing-disposable-only-secret",SERRIAN_TEST_NEXT_DIST_DIR:dist,NEXT_TELEMETRY_DISABLED:"1"},stdio:["ignore","pipe","pipe"]});server.stdout.pipe(log,{end:false});server.stderr.pipe(log,{end:false});
 const state=await context.storageState(),before=await browser.newContext({viewport:{width:1440,height:1000},storageState:state}),after=await browser.newContext({viewport:{width:1440,height:1000},storageState:state}),api=(root:string)=>`${root}/api/worlds/${f.world}/town-maps`;
 const read=async(root:string,id:string)=>{const r=await context.request.get(api(root)+"?map="+id);assert.equal(r.status(),200);return (await r.json()).document as TownMapDocument;};
 async function capture(page:Page,root:string,id:string,file:string,targetScale:number){
  await page.goto(`${root}/worlds/${f.world}?tab=atlas&townMap=${id}`);const editor=page.getByRole("region",{name:"Town Map editor",exact:true}),canvas=page.getByLabel("Town Map canvas",{exact:true});await canvas.waitFor();await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200);
  for(const name of ["Tools","Options"]){const button=editor.getByRole("button",{name,exact:true});if(await button.getAttribute("aria-expanded")==="true")await button.click();}await editor.getByRole("button",{name:"Fit map",exact:true}).click();await page.waitForTimeout(100);
  let view=JSON.parse((await canvas.getAttribute("data-view"))!),b=(await canvas.boundingBox())!;await page.mouse.move(Math.round(b.x+b.width/2),Math.round(b.y+b.height/2));
  for(let n=0;n<40&&Math.abs(view.scale-targetScale)>.003;n++){await page.mouse.wheel(0,Math.max(-120,Math.min(120,Math.log(view.scale/targetScale)/.0015)));await page.waitForTimeout(35);view=JSON.parse((await canvas.getAttribute("data-view"))!);}
  assert.ok(Math.abs(view.scale-targetScale)<.01,JSON.stringify({view,targetScale}));
  const center={x:view.left+view.width/view.scale/2,y:view.top+view.height/view.scale/2},dx=(750-center.x)*view.scale,dy=(500-center.y)*view.scale;b=(await canvas.boundingBox())!;await page.mouse.move(Math.round(b.x+b.width/2),Math.round(b.y+b.height/2));await page.mouse.down({button:"middle"});await page.mouse.move(Math.round(b.x+b.width/2-dx),Math.round(b.y+b.height/2-dy),{steps:8});await page.mouse.up({button:"middle"});await page.waitForTimeout(80);
  view=JSON.parse((await canvas.getAttribute("data-view"))!);await canvas.screenshot({path:f.out+"/"+file+".png"});return {view,canvas:await canvas.boundingBox(),dpr:await page.evaluate(()=>devicePixelRatio)};
 }
 try{
  const deadline=Date.now()+60000;for(;;){assert.equal(server.exitCode,null);try{if((await fetch(oldBase+"/login")).ok)break;}catch{}assert.ok(Date.now()<deadline);await new Promise(r=>setTimeout(r,200));}
  const a=await before.newPage(),b=await after.newPage(),captures:unknown[]=[];
  for(const [label,id]of [["manual",manualMap],["infill",generatedMap]]){const current=await read(base,id);assert.deepEqual((await read(oldBase,id)).design,current.design);for(const scale of [1,2])captures.push({label,scale,map:id,sameCanonicalGeometry:true,before:await capture(a,oldBase,id,`neighborhood-${label}-before-${scale}`,scale),after:await capture(b,base,id,`neighborhood-${label}-after-${scale}`,scale)});}
  const source=await read(base,generatedMap),towns=await(await context.request.get(`${base}/api/worlds/${f.world}/towns?town=${source.townId}`)).json(),placement=towns.placements.find((p:{id:string})=>p.id===source.placementId),settings={...source.design.recipe!,mode:"generate"},maps:string[]=[];
  for(const [root,ctx]of [[oldBase,before],[base,after]] as const){const previewResponse=await ctx.request.post(api(root),{headers:{Origin:root},data:{action:"preview",sourceMapId:source.sourceMapId,frame:source.frame,settings}});assert.equal(previewResponse.status(),200,await previewResponse.text());const proposal=await previewResponse.json(),id=crypto.randomUUID(),created=await ctx.request.post(api(root),{headers:{Origin:root},data:{action:"create",requestId:id,townId:source.townId,sourceMapId:source.sourceMapId,contextMapId:source.contextMapId,placementId:source.placementId,placementRevision:placement?.revision??null,anchor:source.anchor,frame:source.frame,name:"Owned matched neighborhood generator comparison",design:proposal.design,previewToken:proposal.previewToken}});assert.equal(created.status(),200,await created.text());maps.push(id);}
  const generation={sameWorldFrameRecipe:true,settings,frame:source.frame,before:await capture(a,oldBase,maps[0],"neighborhood-generation-before",1.4),after:await capture(b,base,maps[1],"neighborhood-generation-after",1.4)};
  await writeFile(f.out+"/neighborhood-comparison.json",JSON.stringify({passed:true,baselineCommit:"61e0cbbbfb1067962aec76d1cb5faec5edbc243c",baselineRuntime:runtime,captures,generation,gpuDisabled:true,publicWheelAndPanCalibration:true,canvasDimensionsReportedSeparately:true,legacyClientsRenderNewCurveTagsAsStraightControlPaths:true,pixelEqualityClaim:false,ownerAcceptance:false,sharedDatabaseAccess:false},null,2));
 }finally{await before.close();await after.close();server.kill();await new Promise<void>(resolve=>{if(server.exitCode!==null)resolve();else server.once("exit",()=>resolve());});log.end();}
}
