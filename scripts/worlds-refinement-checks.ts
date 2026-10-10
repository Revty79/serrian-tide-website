import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Browser, Page } from "playwright-core";
import { draftOf, rounded, type AtlasBundle } from "../src/features/worlds/atlas";
import { strokeSamples, type TerrainDrawing } from "../src/features/worlds/cartography";
import { generateMap } from "../src/features/worlds/map-generator";
import { presetSpec, type GenerationSpec, type Preset } from "../src/features/worlds/generation-spec";
import { descriptionExample } from "../src/features/worlds/description-interpreter";

async function monitor(page:Page){
  // String evaluation avoids tsx's named-function helper in the isolated browser realm.
  await page.evaluate(`(() => {
    const state={frames:[],previous:performance.now(),running:true,longTasks:[]};
    window.atlasProbe=state;
    state.observer=new PerformanceObserver(list=>{if(state.running)state.longTasks.push(...list.getEntries().map(e=>e.duration));});
    state.observer.observe({type:"longtask",buffered:false});
    const frame=now=>{if(!state.running)return;state.frames.push(now-state.previous);state.previous=now;requestAnimationFrame(frame);};requestAnimationFrame(frame);
  })()`);
}
type FrameReading={frames:number;p95FrameMs:number;maxFrameMs:number;longTasks:number[]};
async function reading(page:Page){return page.evaluate<FrameReading>(`(async () => {
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const state=window.atlasProbe;state.running=false;state.observer.disconnect();
  const sorted=state.frames.sort((a,b)=>a-b);
  return {frames:sorted.length,p95FrameMs:sorted[Math.floor(sorted.length*.95)]??0,maxFrameMs:sorted.at(-1)??0,longTasks:state.longTasks};
})()`);}


export async function refinementBrowserChecks(browser:Browser,baseUrl:string,f:{worldId:string},captureDirectory="docs/screenshots/worlds-atlas-refinement"){
  const captures=path.resolve(captureDirectory);await mkdir(captures,{recursive:true});
  const context=await browser.newContext({viewport:{width:1440,height:1100},extraHTTPHeaders:{"X-Forwarded-For":"203.0.113.71"}}),page=await context.newPage(),errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));page.on("dialog",dialog=>dialog.accept());
  const login=await context.request.post(`${baseUrl}/api/auth/sign-in/email`,{headers:{Origin:baseUrl},data:{email:"other-god@example.invalid",password:"Worlds-Test-Only-Password!"}});assert.equal(login.status(),200);
  const url=`${baseUrl}/worlds/${f.worldId}`,api=`${baseUrl}/api/worlds/${f.worldId}/atlas`,read=async()=>(await context.request.get(api)).json() as Promise<AtlasBundle>;
  const measures:Record<string,unknown>={viewport:{width:1440,height:1100},browser:browser.version(),mode:"production Chromium; native full-detail SVG; synthetic private data"};
  const algorithmTimings:Record<string,unknown>={};
  for(const [size,recipe] of [["small",{...presetSpec("northern","performance-small"),settings:{...presetSpec("northern","performance-small").settings,islands:0,mountains:30,forest:30,rivers:1,lakes:0,size:"small"}}],["medium",presetSpec("continental","refinement-acceptance-2026")],["dense",{...presetSpec("rugged","performance-dense"),plan:{...presetSpec("rugged","performance-dense").plan,mountainRanges:3},settings:{...presetSpec("rugged","performance-dense").settings,mountains:100,forest:100,islands:24,rivers:10,lakes:8}}]] as [string,GenerationSpec][]){
    for(const algorithm of ["serrian-atlas-v1","serrian-atlas-v2"] as const){const durations:number[]=[];let stats:unknown;for(let n=0;n<3;n++){const began=performance.now();stats=generateMap({...recipe,algorithm}).stats;durations.push(rounded(performance.now()-began));}algorithmTimings[`${size}-${algorithm}`]={runsMs:durations,stats};}
  }
  measures.algorithmTimings=algorithmTimings;
  async function start(preset:Preset,seed:string,algorithm:GenerationSpec["algorithm"]="serrian-atlas-v2",described=false){
    await page.goto(url);await page.getByRole("button",{name:"Atlas",exact:true}).click();await page.getByRole("button",{name:"Generate map",exact:true}).click();
    await page.getByLabel("Landscape generation",{exact:true}).selectOption(algorithm);
    if(described){await page.getByLabel("Creation method",{exact:true}).selectOption("describe");await page.getByLabel("Describe the geography",{exact:true}).fill(descriptionExample);await page.getByRole("button",{name:"Interpret description",exact:true}).click();await page.getByLabel("Use the supported plan despite these limits",{exact:true}).check();}
    else await page.getByLabel("Generation preset",{exact:true}).selectOption(preset);
    await page.getByLabel("Generation seed",{exact:true}).fill(seed);
  }
  async function artworkShot(file:string){const art=page.getByLabel("Generated map artwork",{exact:true});await art.evaluate(node=>{document.documentElement.style.scrollBehavior="auto";node.scrollIntoView({block:"center",behavior:"instant"});});await page.waitForTimeout(120);await art.screenshot({path:path.join(captures,file)});}
  async function preview(name:string){
    await monitor(page);const began=performance.now();await page.getByRole("button",{name:"Preview map",exact:true}).click();
    await page.getByRole("heading",{name:"Unsaved preview",exact:true}).waitFor();
    measures[name]={elapsedMs:rounded(performance.now()-began),...await reading(page),elements:await page.getByLabel("Generated map artwork",{exact:true}).locator("*").count(),terrainUses:await page.locator("[data-terrain-mark]").count()};
  }
  try{
    // Keep real before/after images with the identical paragraph, seed and interpreted plan.
    for(const algorithm of ["serrian-atlas-v1","serrian-atlas-v2"] as const){await start("continental","description-example-2026",algorithm,true);await preview(`description-${algorithm}`);await artworkShot(algorithm.endsWith("v1")?"description-before.png":"description-after.png");}
    for(const [preset,file]of [["continental","chaotic-world.png"],["archipelago","broken-archipelago.png"],["northern","dramatic-continent.png"]] as [Preset,string][]){await start(preset,"refinement-acceptance-2026");await preview(preset);await artworkShot(file);}
    // Cancellation terminates the worker and prevents any late result or implicit write.
    await start("rugged","cancel-worker-2026");await page.route(/\.js(?:\?.*)?$/,async route=>{if(route.request().resourceType()==="script")await new Promise(resolve=>setTimeout(resolve,600));await route.continue().catch(()=>{});});
    const beforeCancel=(await read()).maps.length;await page.getByRole("button",{name:"Preview map",exact:true}).click();await page.getByRole("button",{name:"Cancel preview",exact:true}).click();await page.unrouteAll({behavior:"wait"});await page.waitForTimeout(800);
    assert.equal(await page.getByRole("heading",{name:"Unsaved preview",exact:true}).count(),0);assert.equal((await read()).maps.length,beforeCancel);assert.equal(await page.getByLabel("Generation seed",{exact:true}).inputValue(),"cancel-worker-2026");
    const denseName=`Dense refinement performance chart ${randomUUID().slice(0,6)}`;await preview("dense-generation");await page.getByLabel("Generated map name",{exact:true}).fill(denseName);await page.getByRole("button",{name:"Save as new editable map",exact:true}).click();await page.getByRole("application",{name:"Editable map canvas"}).waitFor();
    let bundle=await read();const map=bundle.maps.find(m=>m.name===denseName)!,draft=draftOf(map,bundle.geographies);
    let marks=draft.drawings!.filter((d):d is TerrainDrawing=>d.type==="terrain").reduce((sum,d)=>sum+strokeSamples(d.points,d.spacing).length*d.density,0);
    // A genuinely dense native-source stress case, rather than calling a sparse preset dense.
    for(let n=0;marks<5450;n++){
      const drawing:TerrainDrawing={version:1,id:randomUUID(),type:"terrain",kind:n%3?"forest":"mountains",name:`Dense performance stand ${n}`,geographyId:null,archived:false,points:[{id:randomUUID(),x:250,y:360+n*9},{id:randomUUID(),x:1750,y:365+n*9},{id:randomUUID(),x:1740,y:410+n*9}],radius:n%3?36:42,spacing:12,density:3,seed:n+1};
      const count=strokeSamples(drawing.points,drawing.spacing).length*drawing.density;if(marks+count>5900)break;draft.drawings!.push(drawing);marks+=count;
    }
    const saved=await context.request.post(api,{headers:{Origin:baseUrl},data:{action:"save",id:map.id,revision:map.revision,draft}});assert.equal(saved.status(),200);
    await page.goto(url);await page.getByRole("button",{name:"Atlas",exact:true}).click();await page.getByRole("button",{name:`Open ${map.name}`,exact:true}).click();const canvas=page.getByRole("application",{name:"Editable map canvas"});await canvas.waitFor();await canvas.scrollIntoViewIfNeeded();
    const terrainUses=await canvas.locator("[data-terrain-mark]").count();assert.equal(terrainUses,marks);assert.ok(marks>=5200);
    const elements=await canvas.locator("*").count();assert.ok(elements<marks*2,"Reusable full-detail symbols avoid repeating multi-path DOM per mark.");
    await page.waitForFunction(()=>document.querySelectorAll('[data-terrain-cache-ready="false"]').length===0);
    measures.denseSource={marks,elements,drawings:draft.drawings!.length,cachedStrokes:await canvas.locator('[data-terrain-cache-ready="true"]').count(),rasterStrokes:await canvas.locator("[data-terrain-raster]").count()};await canvas.screenshot({path:path.join(captures,"dense-map.png")});
    // Resolve controls outside the probe: repeated accessibility-tree queries over thousands of
    // SVG use instances can themselves stall Chromium and are not application interaction work.
    const zoomIn=await page.getByRole("button",{name:"Zoom in",exact:true}).elementHandle(),zoomOut=await page.getByRole("button",{name:"Zoom out",exact:true}).elementHandle();assert.ok(zoomIn&&zoomOut);
    await monitor(page);const navStart=performance.now();for(let n=0;n<6;n++){await zoomIn.click();await zoomOut.click();}measures.denseZoom={elapsedMs:rounded(performance.now()-navStart),...await reading(page)};
    await page.getByRole("button",{name:"Pan",exact:true}).click();await canvas.scrollIntoViewIfNeeded();const box=(await canvas.boundingBox())!;await monitor(page);await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.5+130,box.y+box.height*.5+45,{steps:24});await page.mouse.up();measures.densePan=await reading(page);
    assert.ok(await canvas.locator("[data-terrain-raster]").count()>0,"Navigation uses the prepared cache.");
    const stress=draft.drawings!.find(d=>d.name==="Dense performance stand 1")!;
    await page.getByRole("button",{name:stress.name,exact:true}).click();await page.getByRole("button",{name:"Move feature",exact:true}).click();const right=await page.getByRole("button",{name:"Right",exact:true}).elementHandle();assert.ok(right);await monitor(page);const editStart=performance.now();await right.click();measures.denseEdit={elapsedMs:rounded(performance.now()-editStart),...await reading(page)};await page.getByRole("button",{name:"Undo",exact:true}).click();await page.getByRole("button",{name:"Redo",exact:true}).click();
    await page.getByRole("button",{name:"Save map",exact:true}).click();await page.getByRole("status").filter({hasText:"Map saved."}).waitFor();bundle=await read();const reopened=bundle.maps.find(m=>m.id===map.id)!;assert.equal(reopened.drawings!.length,draft.drawings!.length);const moved=reopened.drawings!.find(d=>d.id===stress.id)!;assert.notDeepEqual(moved,stress);assert.deepEqual(reopened.generation,map.generation);
    measures.denseSave={revision:reopened.revision,sourceIdsRetained:reopened.drawings!.every(d=>draft.drawings!.some(old=>old.id===d.id))};assert.ok((measures.denseSave as {sourceIdsRetained:boolean}).sourceIdsRetained);
    const downloading=page.waitForEvent("download");await page.getByRole("button",{name:"Export PNG",exact:true}).click();const download=await downloading;await download.saveAs(path.join(captures,"dense-export.png"));
    assert.deepEqual(errors,[]);
    await writeFile(path.join(captures,"performance.json"),JSON.stringify(measures,null,2)+"\n");
    // Timing limits are broad correctness guards; report actual measurements, not a device guarantee.
    for(const key of ["denseZoom","densePan","denseEdit"]){const m=measures[key] as {maxFrameMs:number};assert.ok(m.maxFrameMs<1000,`${key}: interaction stalled for over a second`);}
    console.log("PASS: v1/v2 identical-description screenshots, irregular world/archipelago/continent previews, cancelled worker cannot publish late source; 5200+ full-detail native marks, compact SVG, zoom/pan/edit/undo/redo/save/reopen and PNG export with stable source IDs and provenance.");
  }finally{await context.close();}
}
