/** Real Chrome rendering on explicitly owned synthetic content; no owner environment is loaded. */
import assert from "node:assert/strict";
import {spawn,execFileSync,type ChildProcess} from "node:child_process";
import {createWriteStream} from "node:fs";
import {access,mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {chromium,type Page,type BrowserContext,type Browser} from "playwright-core";
import {ownedFreePort,gridDigest,type RegionalFixture} from "./worlds-regional-editing-fixture";
import type {createGraphicsA2Fixture} from "./worlds-graphics-a2-fixture";
import {environmentReady} from "./worlds-environment-browser-checks";
import {terrainPanel,terrainTool,closeTerrainSettings} from "./worlds-terrain-browser-ui";
import {createGrid,terrainGeometry,type TerrainDocument} from "../src/features/worlds/terrain";
import {isOwnedLeaseProtocol} from "./worlds-owned-world-api";

export type GraphicsFixture=Awaited<ReturnType<typeof createGraphicsA2Fixture>>;
type BusyPointerSample={latencyMs:number;pending:number;progressive:number;maxProgressive:number};
export type GraphicsCapture={scene:string;map:string;style:string;dpr:number;quality:string;point:{x:number;y:number};span:number;file:string;readyMs:number;inputMs:number;mainThreadTaskMs?:number;busyPointer?:BusyPointerSample[];view:{x:number;y:number;scale:number};css:{width:number;height:number};backing:{width:number;height:number};data:Record<string,string>;appearance:unknown;memory?:Record<string,number>};
const styles=["classic-elevation","physical-relief","topographic","realistic-terrain","illustrated-fantasy","engraved-fantasy"];
export async function graphicsCamera(p:Page,point:{x:number;y:number},span:number,onTransition?:()=>Promise<void>){
 const c=p.getByLabel("Terrain map canvas",{exact:true});await p.getByRole("button",{name:"Fit map",exact:true}).click();await environmentReady(p);
 const b=(await c.boundingBox())!,v=await c.evaluate(c=>({x:Number(c.dataset.viewX),y:Number(c.dataset.viewY),scale:Number(c.dataset.zoom)}));
 const from={x:b.x+v.x+point.x*v.scale,y:b.y+v.y+point.y*v.scale};assert(from.x>=b.x&&from.x<=b.x+b.width&&from.y>=b.y&&from.y<=b.y+b.height,"Camera anchor must be inside the fitted map");
 await p.mouse.move(from.x,from.y);await p.mouse.down({button:"middle"});await p.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:2});await p.mouse.up({button:"middle"});
 const target=Math.min(100,Math.max(1e-9,b.width/span));let gain=1;
 await p.mouse.move(b.x+b.width/2,b.y+b.height/2);
 for(let attempt=0;attempt<4;attempt++){
  const current=Number(await c.getAttribute("data-zoom"));if(Math.abs(current/target-1)<1e-5)break;
  const delta=-Math.log(target/current)/.0015/gain;
  // Observe native input, not React state. Installed Chrome's CDP wheel delta
  // can be normalized by device scale; feedback corrects the next normal event.
  await c.evaluate(el=>{delete el.dataset.graphicsWheelDelta;el.addEventListener("wheel",event=>{el.dataset.graphicsWheelDelta=String((event as WheelEvent).deltaY);},{once:true,passive:true});});
  await p.mouse.wheel(0,delta);await p.waitForFunction(()=>document.querySelector<HTMLCanvasElement>('canvas[aria-label="Terrain map canvas"]')?.dataset.graphicsWheelDelta!==undefined);
  const actual=Number(await c.getAttribute("data-graphics-wheel-delta"));assert(Number.isFinite(actual)&&actual!==0);gain=actual/delta;assert(gain>=.125&&gain<=8);
 }
 const achieved=Number(await c.getAttribute("data-zoom"));assert(Math.abs(achieved/target-1)<1e-5,JSON.stringify({target,achieved,gain}));
 await onTransition?.();
 await environmentReady(p);await p.mouse.move(0,0);await p.evaluate(()=>document.fonts.ready);
}
async function graphicsBusyPointer(p:Page,file:string){
 const c=p.getByLabel("Terrain map canvas",{exact:true});await p.waitForFunction(()=>Number(document.querySelector<HTMLCanvasElement>('canvas[aria-label="Terrain map canvas"]')?.dataset.surfacePending??0)>0,{},{timeout:15000});const box=(await c.boundingBox())!,samples:BusyPointerSample[]=[];
 for(let i=0;i<4;i++){
  const state=await c.evaluate(el=>({pending:Number(el.dataset.surfacePending??0),progressive:Number(el.dataset.surfaceProgressiveImages??0),maxProgressive:Number(el.dataset.surfaceMaxProgressiveImages??0)}));
  // Observe a real pointer event followed by its next browser frame. This does
  // not dispatch an edit, alter React state or move the geographic camera.
  await c.evaluate(el=>{delete el.dataset.a2PointerPaintAt;el.addEventListener("pointermove",()=>requestAnimationFrame(()=>{el.dataset.a2PointerPaintAt=String(performance.now());}),{once:true,passive:true});});const start=performance.now();await p.mouse.move(box.x+box.width*.5+12+i*7,box.y+box.height*.5+12+i*5);await p.waitForFunction(()=>document.querySelector<HTMLCanvasElement>('canvas[aria-label="Terrain map canvas"]')?.dataset.a2PointerPaintAt!==undefined,{},{timeout:15000});samples.push({latencyMs:performance.now()-start,...state});if(i===0)await c.screenshot({path:file});
 }
 assert(samples.some(s=>s.pending>0),"The pointer probe must actually overlap unfinished surface imagery");return samples;
}
export async function graphicsNumerical(context:BrowserContext,base:string,fixture:GraphicsFixture){
 const endpoint=`${base}/api/worlds/${fixture.world}/terrain`,response=await context.request.get(`${endpoint}?terrainMap=${fixture.map}`);assert.equal(response.status(),200);const doc=(await response.json()).document as TerrainDocument,root=gridDigest(createGrid(doc.baseElevation,doc.tiles,terrainGeometry(doc.settings)));assert.equal(root,fixture.rootHash);
 const result:{root:string;regional?:string;local?:string;water?:unknown;environment?:unknown}={root};
 for(const [key,meta,expected]of [["regional",fixture.regional,fixture.regionalHash],["local",fixture.local,fixture.localHash]] as const){
  const grid=new Int16Array(meta.gridWidth*meta.gridHeight),count=grid.length/1024;
  for(let start=0;start<count;start+=64){const keys=Array.from({length:Math.min(64,count-start)},(_,i)=>i+start);const r=await context.request.get(`${endpoint}/refinements?terrainMap=${fixture.map}&refinement=${meta.id}&lod=0&keys=${keys.join(",")}`);assert.equal(r.status(),200);const batch=await r.json();assert.equal(batch.headRevision,meta.revision);for(const tile of batch.tiles)for(let y=0;y<32;y++)grid.set(tile.samples.slice(y*32,y*32+32),(tile.y*32+y)*meta.gridWidth+tile.x*32);}
  const digest=gridDigest(grid);assert.equal(digest,expected);result[key]=digest;
 }
 for(const layer of ["water","environment"] as const){const r=await context.request.get(`${endpoint}/${layer==="water"?"hydrology":layer}?terrainMap=${fixture.map}`);assert.equal(r.status(),200);const value=await r.json();result[layer]={revision:value.revision,layer:value.layer};}
 return result;
}
export async function runGraphicsA2Browser(f:RegionalFixture,fixture:GraphicsFixture,options:{checkout:string;dist:string;out:string;phase:"baseline"|"candidate";sourceHash:string}){
 const {checkout,dist,phase,sourceHash}=options,out=path.resolve(options.out);assert(out.startsWith(path.resolve("artifacts/atlas-graphics-a2")+path.sep));await mkdir(out,{recursive:true});
 for(const name of [".env",".env.local",".env.production",".env.production.local",".env.development",".env.development.local"])assert.equal(await access(path.join(checkout,name)).then(()=>true,()=>false),false);
 assert.equal((await readFile(path.join(checkout,dist,"s43-source-sha256"),"utf8")).trim(),sourceHash);
 const port=await ownedFreePort();assert(![3000,3003,5432,5433].includes(port));const base=`http://127.0.0.1:${port}`,log=createWriteStream(path.join(out,"application.log"));
 const env:NodeJS.ProcessEnv={...process.env,NODE_ENV:"production",DATABASE_URL:f.databaseUrl,BETTER_AUTH_URL:base,BETTER_AUTH_SECRET:"graphics-a2-owned-synthetic-only",SERRIAN_TERRAIN_ROOT:f.terrainRoot,SERRIAN_ASSET_ROOT:path.join(f.root,"artwork"),SERRIAN_RASTER_ROOT:path.join(f.root,"raster"),SERRIAN_TEST_NEXT_DIST_DIR:dist,NEXT_TELEMETRY_DISABLED:"1"};
 let server:ChildProcess|undefined,browser:Browser|undefined;const errors:string[]=[],records:GraphicsCapture[]=[],contentWrites:string[]=[];
 await writeFile(path.join(out,"runtime.json"),JSON.stringify({base,appPort:port,checkout,dist,sourceHash,phase,fixtureEnvironment:f.out,ownedFixture:true},null,2));
 try{
  server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{cwd:checkout,env,windowsHide:true,stdio:["ignore","pipe","pipe"]});server.stdout!.pipe(log,{end:false});server.stderr!.pipe(log,{end:false});
  const deadline=Date.now()+90000;for(;;){assert.equal(server.exitCode,null);try{if((await fetch(base+"/login",{signal:AbortSignal.timeout(3000)})).ok)break;}catch{}assert(Date.now()<deadline);await new Promise(resolve=>setTimeout(resolve,200));}
  browser=await chromium.launch({executablePath:process.env.SERRIAN_TEST_CHROME??"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:process.env.SERRIAN_A2_HEADED!=="1",args:["--disable-gpu"]});
  let numerical:Awaited<ReturnType<typeof graphicsNumerical>>|undefined;
  const available:{name:string;map?:string;point:{x:number;y:number};span:number}[]=[{name:"world",point:{x:3200000,y:1600000},span:6800000},{name:"regional-coast",point:{x:1240000,y:1600000},span:1500000},{name:"local-water-relief",point:fixture.center,span:48000},{name:"close-numerical",point:{x:fixture.center.x+3000,y:fixture.center.y-4000},span:1600},{name:"wrap-seam",point:{x:0,y:1280000},span:320000},{name:"north-pole",point:{x:4800000,y:0},span:240000},{name:"linked-region",map:fixture.region,point:fixture.center,span:640000},{name:"maximum-zoom",point:{x:fixture.center.x+3000,y:fixture.center.y-4000},span:.01}];
  available.push({name:"lake-shore-close",point:{x:fixture.lake.x+4500+200/700*1000,y:fixture.lake.y},span:2000});
  const requested=process.env.SERRIAN_A2_SCENES?.split(",")??available.slice(0,4).map(s=>s.name);assert(requested.every(name=>available.some(s=>s.name===name)));const cases=available.filter(s=>requested.includes(s.name));
  const requestedStyles=process.env.SERRIAN_A2_STYLES?.split(",")??styles;assert(requestedStyles.every(style=>styles.includes(style)));const selectedStyles=styles.filter(style=>requestedStyles.includes(style)),freshScene=process.env.SERRIAN_A2_FRESH!=="0",primingStyle=process.env.SERRIAN_A2_PRIME_STYLE;assert(!primingStyle||styles.includes(primingStyle));
  const qualities=process.env.SERRIAN_A2_QUALITIES?.split(",")??["balanced"];assert(qualities.every(q=>["fast","balanced","detailed","maximum"].includes(q)));const workerMode=process.env.SERRIAN_A2_WORKERS??"normal";assert(["normal","disabled","failed"].includes(workerMode));const cpuRate=Number(process.env.SERRIAN_A2_CPU_RATE??1);assert([1,4].includes(cpuRate));
  for(const dpr of process.env.SERRIAN_A2_DPR?process.env.SERRIAN_A2_DPR.split(",").map(Number):[1,2]){
   const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:dpr});
   try{
    if(workerMode!=="normal")await context.addInitScript({content:workerMode==="disabled"?"Object.defineProperty(globalThis,'Worker',{value:undefined});":"Object.defineProperty(globalThis,'Worker',{value:class FailedWorker {constructor(){throw new Error('A2 owned worker startup failure');}}});"});
    assert.equal((await context.request.post(base+"/api/auth/sign-in/email",{headers:{Origin:base},data:{email:"world-god@example.invalid",password:"Regional-Editing-Only-Password!"}})).status(),200);
    const p=await context.newPage();p.setDefaultTimeout(180000);p.on("pageerror",e=>errors.push(e.message));p.on("dialog",dialog=>dialog.accept());p.on("request",r=>{if(r.method()==="POST"&&new URL(r.url()).pathname.startsWith(`/api/worlds/${f.world}/`)&&!isOwnedLeaseProtocol(r,base,f.world))contentWrites.push(new URL(r.url()).pathname);});
    numerical??=await graphicsNumerical(context,base,fixture);
    if(process.env.SERRIAN_A2_EXPORTS==="1")await(await import("./worlds-graphics-a2-export")).graphicsA2Exports(p,base,fixture,out);
    const c=p.getByLabel("Terrain map canvas",{exact:true}),cdp=await context.newCDPSession(p);await cdp.send("Performance.enable");if(cpuRate!==1)await cdp.send("Emulation.setCPUThrottlingRate",{rate:cpuRate});
    async function open(map:string,style:string){await p.goto(`${base}/worlds/${f.world}?tab=atlas&terrainMap=${map}`);await c.waitFor();const expand=p.getByRole("button",{name:"Expand editor",exact:true});if(await expand.isVisible())await expand.click();await terrainTool(p,"pan");await terrainPanel(p,"World");if(primingStyle)await p.getByLabel("Map Appearance",{exact:true}).selectOption(primingStyle);await p.getByLabel("Map Appearance",{exact:true}).selectOption(style);await closeTerrainSettings(p);const tools=p.getByRole("button",{name:"Close tools",exact:true});if(await tools.isVisible())await tools.click();await p.getByLabel("Device rendering quality",{exact:true}).selectOption("balanced");}
    for(const quality of qualities)for(const style of selectedStyles){
     if(!freshScene){await open(fixture.map,style);}
     for(const scene of cases){
      const map=scene.map??fixture.map;if(freshScene||new URL(p.url()).searchParams.get("terrainMap")!==map)await open(map,style);
      await p.getByLabel("Device rendering quality",{exact:true}).selectOption(quality);
      console.log("A2",phase,quality,style,scene.name,"DPR",dpr);const taskBefore=(await cdp.send("Performance.getMetrics")).metrics.find((m:{name:string})=>m.name==="TaskDuration")?.value??0;let busyPointer:BusyPointerSample[]|undefined;const start=performance.now();await graphicsCamera(p,scene.point,scene.span,process.env.SERRIAN_A2_BUSY_POINTER==="1"?async()=>{busyPointer=await graphicsBusyPointer(p,path.join(out,`${scene.name}-${style}-dpr${dpr}-busy.png`));}:undefined);const readyMs=performance.now()-start,taskAfter=(await cdp.send("Performance.getMetrics")).metrics.find((m:{name:string})=>m.name==="TaskDuration")?.value??0,mainThreadTaskMs=(taskAfter-taskBefore)*1000;
      const state=await c.evaluate(c=>{const canvas=c as HTMLCanvasElement,b=canvas.getBoundingClientRect();return {view:{x:Number(canvas.dataset.viewX),y:Number(canvas.dataset.viewY),scale:Number(canvas.dataset.zoom)},css:{width:b.width,height:b.height},backing:{width:canvas.width,height:canvas.height},data:{...canvas.dataset}};});
      assert.equal(state.data.mapAppearance,style);const appearance=JSON.parse(state.data.artworkAppearance??"null");
      if(style==="realistic-terrain"&&workerMode!=="normal")assert.equal(state.data.surfaceBackend,"main-thread","Worker failure/unavailability must really exercise the native main-thread fallback");
      const file=`${scene.name}-${style}-dpr${dpr}${quality==="balanced"?"":"-"+quality}.png`;await c.screenshot({path:path.join(out,file)});
      const oldX=await c.getAttribute("data-view-x"),input=performance.now();await c.focus();await p.keyboard.press("ArrowRight");await p.waitForFunction(x=>document.querySelector<HTMLCanvasElement>('canvas[aria-label="Terrain map canvas"]')?.dataset.viewX!==x,oldX);const inputMs=performance.now()-input;await p.keyboard.press("ArrowLeft");
      const metrics=await cdp.send("Performance.getMetrics"),memory=Object.fromEntries(metrics.metrics.filter((m:{name:string})=>["JSHeapUsedSize","JSHeapTotalSize","Nodes","Documents"].includes(m.name)).map((m:{name:string;value:number})=>[m.name,m.value]));
      records.push({scene:scene.name,map,style,dpr,quality,point:scene.point,span:scene.span,file,readyMs,inputMs,mainThreadTaskMs,busyPointer,...state,data:state.data as Record<string,string>,appearance,memory});
      await writeFile(path.join(out,"capture-progress.json"),JSON.stringify(records,null,2));
     }
    }
    assert.deepEqual(await graphicsNumerical(context,base,fixture),numerical);
   }catch(e){const page=context.pages().at(-1);await page?.screenshot({path:path.join(out,`failure-dpr${dpr}.png`)}).catch(()=>{});await writeFile(path.join(out,`failure-dpr${dpr}.txt`),await page?.locator("body").innerText().catch(()=>"")??"");await writeFile(path.join(out,`failure-dpr${dpr}.json`),JSON.stringify(await page?.getByLabel("Terrain map canvas",{exact:true}).evaluate(c=>({...c.dataset})).catch(()=>null),null,2));throw e;}finally{await context.close();}
  }
  assert.deepEqual(errors,[]);assert.deepEqual(contentWrites,[]);await writeFile(path.join(out,"results.json"),JSON.stringify({passed:true,phase,sourceHash,buildId:(await readFile(path.join(checkout,dist,"BUILD_ID"),"utf8")).trim(),browser:browser.version(),gpuDisabled:true,freshScene,primingStyle,workerMode,cpuRate,fixture,numerical,records,contentWrites,errors,ownerAcceptance:false},null,2));
 }finally{await browser?.close();if(server?.pid&&server.exitCode===null)execFileSync("taskkill",["/pid",String(server.pid),"/t","/f"],{windowsHide:true,stdio:"ignore"});log.end();}
}
