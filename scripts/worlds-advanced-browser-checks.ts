/** Actual native creator controls author every operation; API calls below only read evidence. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile,writeFile} from "node:fs/promises";
import type {Browser,BrowserContext,Page,Locator} from "playwright-core";
import type {RegionalFixture} from "./worlds-regional-editing-fixture";
import {terrainPanel,terrainTool} from "./worlds-terrain-browser-ui";
import {createGrid,terrainGeometry,type TerrainDocument} from "../src/features/worlds/terrain";
import {advancedNames,type AdvancedKind} from "../src/features/worlds/terrain-advanced-spec";
import type {HydroLayer} from "../src/features/worlds/terrain-hydrology";
async function physicalPoint(canvas:Locator,x:number,y:number){
  const box=(await canvas.boundingBox())!,view=await canvas.evaluate(e=>({x:Number(e.dataset.viewX),y:Number(e.dataset.viewY),scale:Number(e.dataset.zoom)}));
  const point={x:box.x+view.x+x*view.scale,y:box.y+view.y+y*view.scale};
  assert.ok(point.x>=box.x&&point.x<=box.x+box.width&&point.y>=box.y&&point.y<=box.y+box.height,JSON.stringify({box,view,point}));
  return point;
}
const digest=(g:Int16Array)=>createHash("sha256").update(new Uint8Array(g.buffer,g.byteOffset,g.byteLength)).digest("hex");
export async function settledAdvancedCanvas(canvas:Locator){
  await canvas.evaluate(async e=>{
    const c=e as HTMLCanvasElement,end=performance.now()+60000;let stable=0,last="";
    while(stable<8){
      const ready=["renderPending","surfacePending","detailPending","cartographyPending","environmentPending"].every(k=>c.dataset[k]==="0"),
        key=[c.dataset.mapAppearance,c.dataset.surfacePainted,c.dataset.cartographyPainted,c.dataset.environmentFields,c.dataset.environmentRegions,c.dataset.environmentStats?JSON.parse(c.dataset.environmentStats).painted:0,c.dataset.viewX,c.dataset.viewY,c.dataset.zoom].join("/");
      stable=ready&&key===last?stable+1:0;last=key;
      if(performance.now()>end)throw Error("Native terrain rendering did not settle: "+JSON.stringify(c.dataset));
      await new Promise(requestAnimationFrame);
    }
  });
}
export async function advancedTerrainBrowser({f,browser,context,page:p,base}:{f:RegionalFixture;browser:Browser;context:BrowserContext;page:Page;base:string}){
  if(process.env.SERRIAN_ADVANCED_SAFETY_ONLY==="1"){await(await import("./worlds-advanced-browser-safety")).advancedTerrainSafety({f,context,page:p,base});return;}
  const seed=JSON.parse(await readFile(f.out+"/advanced-database.json","utf8")),map=seed.browserMap,api=base+"/api/worlds/"+f.world,
    url=base+"/worlds/"+f.world+"?tab=atlas&terrainMap="+map,groups:string[]=[],layouts:unknown[]=[],timings:unknown[]=[],numericalPosts:unknown[]=[];
  const read=async<T,>(path:string):Promise<T>=>{const response=await context.request.get(api+path);assert.equal(response.status(),200,await response.text());return response.json();};
  const terrainDocument=()=>read<{document:TerrainDocument}>("/terrain?terrainMap="+map).then(v=>v.document);
  const grid=(d:TerrainDocument)=>createGrid(d.baseElevation,d.tiles,terrainGeometry(d.settings));
  p.on("request",r=>{if(r.method()==="POST"&&new URL(r.url()).pathname===new URL(api+"/terrain").pathname)numericalPosts.push(r.postDataJSON());});
  const push=async(text:string)=>{groups.push(text);console.log("PASS",text);await writeFile(f.out+"/advanced-browser-progress.json",JSON.stringify({groups,layouts,timings},null,2));};
  const canvas=p.getByLabel("Terrain map canvas",{exact:true});
  const settle=()=>p.waitForTimeout(180);
  const open=async(kind:AdvancedKind)=>{
    await terrainTool(p,"raise");const panel=p.getByRole("complementary",{name:"Tool panel",exact:true}),summary=panel.getByText("Landforms & areas",{exact:true});
    if(!await summary.evaluate(e=>(e.parentElement as HTMLDetailsElement).open))await summary.click();
    await panel.getByRole("button",{name:advancedNames[kind],exact:true}).click();
    const dialog=p.getByRole("dialog",{name:advancedNames[kind],exact:true});await dialog.waitFor();
    await dialog.getByRole("button",{name:"Prepare Preview",exact:true}).waitFor();return dialog;
  };
  const input=async(d:Locator,label:string,value:number)=>{await d.getByLabel(label,{exact:true}).fill(String(value));};
  const prepare=async(d:Locator)=>{
    const started=performance.now();await d.getByRole("button",{name:"Prepare Preview",exact:true}).click();
    await d.getByRole("button",{name:"Prepare Preview",exact:true}).waitFor();
    await d.getByText("Settings changed. Prepare another preview before acceptance.",{exact:true}).waitFor({state:"hidden"});
    await d.locator("[data-advanced-changed]").evaluate(async e=>{const end=performance.now()+30000;while(Number(e.getAttribute("data-advanced-changed"))<=0){if(performance.now()>end)throw Error("No numerical proposal became ready");await new Promise(r=>setTimeout(r,50));}});
    await d.getByRole("button",{name:"Accept Numerical Change",exact:true}).waitFor();
    timings.push({kind:await d.getByRole("heading").first().innerText(),previewReadyMs:performance.now()-started});
  };
  const accept=async(d:Locator,before:number)=>{
    await d.getByLabel("I reviewed the affected geography",{exact:true}).check();
    await d.getByRole("button",{name:"Accept Numerical Change",exact:true}).click();await d.waitFor({state:"hidden"});
    const end=Date.now()+30000;for(;;){const saved=await terrainDocument();if(saved.revision>before)return saved;assert.ok(Date.now()<end,"Accepted numerical operation saved");await p.waitForTimeout(100);}
  };
  await p.goto(url);await canvas.waitFor();await settle();const initial=await terrainDocument();
  await terrainPanel(p,"Water");const water=p.getByRole("region",{name:"Water authoring",exact:true});
  await water.getByRole("button",{name:"Start a river",exact:true}).click();
  await p.getByRole("button",{name:"Cancel water calculation",exact:true}).waitFor({state:"hidden",timeout:120000});
  await canvas.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  const source=await physicalPoint(canvas,20000,10000);await p.mouse.click(source.x,source.y);
  await p.getByRole("button",{name:"Cancel water calculation",exact:true}).waitFor({state:"hidden",timeout:120000});
  await terrainPanel(p,"Water");await water.getByRole("button",{name:"Accept waterway",exact:true}).waitFor({timeout:120000});
  await water.getByRole("button",{name:"Accept waterway",exact:true}).click();
  const [waterSaved]=await Promise.all([p.waitForResponse(r=>r.request().method()==="POST"&&r.url().includes("/hydrology?")),water.getByRole("button",{name:"Save waterways",exact:true}).click()]);
  assert.equal(waterSaved.status(),200,await waterSaved.text());await settle();
  await water.getByRole("button",{name:"Discard river suggestions",exact:true}).click();await water.getByRole("button",{name:"Select saved water",exact:true}).click();await terrainPanel(p,"Water");await settle();
  const retainedWater=(await read<{layer:HydroLayer}>("/terrain/hydrology?terrainMap="+map)).layer;
  await writeFile(f.out+"/creator-authored-water.json",JSON.stringify(retainedWater,null,2));
  assert.ok(retainedWater.nodes.some(n=>n.kind==="source"&&Math.hypot(n.point.x-20000,n.point.y-10000)<750),"The native accepted river starts at the creator's chosen point");
  assert.ok(retainedWater.edges.length>0);assert.deepEqual(await terrainDocument(),initial);assert.equal(numericalPosts.length,0);
  await push("Existing native downhill river authoring, proposal acceptance and water save make no numerical terrain changes");

  const courseLength=(edge:HydroLayer["edges"][number])=>edge.points.slice(1).reduce((sum,point,i)=>sum+Math.hypot(point.x-edge.points[i].x,point.y-edge.points[i].y),0),
    channelRiver=retainedWater.edges.reduce((best,edge)=>courseLength(edge)>courseLength(best)?edge:best);
  await water.getByLabel("Waterway list",{exact:true}).selectOption("draft");
  await water.getByLabel("Waterway",{exact:true}).selectOption(channelRiver.id);
  await water.getByRole("button",{name:"Carve River Channel",exact:true}).click();
  let d=p.getByRole("dialog",{name:"Carve River Channel",exact:true});await d.waitFor();
  await input(d,"Channel width (m)",1800);await input(d,"Channel depth (m)",35);await prepare(d);
  await d.getByLabel("Advanced preview appearance",{exact:true}).selectOption("physical-relief");await settledAdvancedCanvas(d.getByLabel("Terrain map canvas",{exact:true}));
  const channelCanvas=d.getByLabel("Terrain map canvas",{exact:true}),channelPoint=channelRiver.points[Math.floor(channelRiver.points.length/2)],channelScreen=await physicalPoint(channelCanvas,channelPoint.x,channelPoint.y);
  await p.mouse.move(channelScreen.x,channelScreen.y);await p.mouse.wheel(0,-650);await settledAdvancedCanvas(channelCanvas);
  const firstPreview=await d.getByLabel("Terrain map canvas",{exact:true}).screenshot();await writeFile(f.out+"/river-channel-proposed.png",firstPreview);
  let inspected=false;
  for(const edge of [channelRiver,...retainedWater.edges.slice(0,8)]){
    const point=edge.points[Math.floor(edge.points.length/2)],q=await physicalPoint(d.getByLabel("Terrain map canvas",{exact:true}),point.x,point.y);
    await p.mouse.move(q.x,q.y);await settle();
    const text=await d.getByLabel("Advanced terrain inspection").innerText(),m=text.match(/Saved (-?\d+) m; proposed (-?\d+) m/);
    if(m&&m[1]!==m[2]){inspected=true;break;}
  }
  assert.ok(inspected,"Native inspection exposes a real proposed channel elevation difference");
  await d.getByRole("button",{name:"Show original terrain",exact:true}).click();
  const beforePreview=await d.getByLabel("Terrain map canvas",{exact:true}).screenshot();
  assert.notEqual(createHash("sha256").update(firstPreview).digest("hex"),createHash("sha256").update(beforePreview).digest("hex"));
  await d.getByRole("button",{name:"Reject Preview",exact:true}).click();assert.deepEqual(await terrainDocument(),initial);
  await d.getByRole("button",{name:"Operation",exact:true}).click();await input(d,"Channel depth (m)",60);await prepare(d);
  const carved=await accept(d,initial.revision),carvedGrid=grid(carved),initialGrid=grid(initial);
  let cuts=0;for(let i=0;i<carvedGrid.length;i++){assert.ok(carvedGrid[i]<=initialGrid[i]);assert.ok(initialGrid[i]-carvedGrid[i]<=60);if(carvedGrid[i]!==initialGrid[i])cuts++;}
  assert.ok(cuts>0);assert.deepEqual((await read<{layer:HydroLayer}>("/terrain/hydrology?terrainMap="+map)).layer,retainedWater);
  await push("Saved river > narrow channel preview > real elevation inspection/before-after > reject exact > revised depth > accept/autosave/reopen; original river identities/overrides retained");

  d=await open("erosion");await d.getByRole("button",{name:"Choose Area",exact:true}).click();
  for(const [label,value]of [["x",6000],["y",6000],["width",18000],["height",18000]] as const)await input(d,"Selected "+label+" (m)",value);
  await d.getByRole("button",{name:"Operation",exact:true}).click();await input(d,"Duration (erosion steps)",16);await input(d,"Runoff direction (degrees clockwise from north)",90);await prepare(d);
  await d.screenshot({path:f.out+"/erosion-first-preview.png"});
  const firstErosionSummary=await d.getByText(/changed samples\. Maximum lowering/).innerText();
  await d.getByRole("button",{name:"Operation",exact:true}).click();await input(d,"Runoff direction (degrees clockwise from north)",270);await input(d,"Terrain modification strength (%)",95);await prepare(d);
  assert.notEqual(await d.getByText(/changed samples\. Maximum lowering/).innerText(),firstErosionSummary,"Revised native erosion exposes different numerical results");
  await d.screenshot({path:f.out+"/erosion-revised-preview.png"});await d.getByRole("button",{name:"Reject Preview",exact:true}).click();assert.deepEqual(await terrainDocument(),carved);
  await prepare(d);const eroded=await accept(d,carved.revision),erodedGrid=grid(eroded);let erosionChanges=0;
  for(let i=0;i<erodedGrid.length;i++){const x=i%128*500,y=Math.floor(i/128)*500;if(x<6000||x>24000||y<6000||y>24000)assert.equal(erodedGrid[i],carvedGrid[i]);if(erodedGrid[i]!==carvedGrid[i])erosionChanges++;}
  assert.ok(erosionChanges>0);await push("Selected local erosion with direction/strength revision, cancellation exactness, explicit accept and byte-exact outside samples");

  d=await open("volcano");await input(d,"Volcano centre east (m)",45000);await input(d,"Volcano centre south (m)",28000);
  await input(d,"Volcano radius (m)",8000);await input(d,"Height above existing land (m)",1300);await input(d,"Crater / caldera diameter (m)",3000);await input(d,"Crater / caldera depth (m)",700);
  await prepare(d);const firstVolcanoSummary=await d.getByText(/changed samples\. Maximum lowering/).innerText();await d.getByRole("button",{name:"Operation",exact:true}).click();await input(d,"Crater / caldera diameter (m)",4500);await input(d,"Crater / caldera depth (m)",900);await prepare(d);
  assert.notEqual(await d.getByText(/changed samples\. Maximum lowering/).innerText(),firstVolcanoSummary,"Revised native crater exposes different numerical results");
  const volcanicCanvas=d.getByLabel("Terrain map canvas",{exact:true}),centre=await physicalPoint(volcanicCanvas,45000,28000);
  await p.mouse.move(centre.x,centre.y);const pageY=await p.evaluate(()=>scrollY);await p.mouse.wheel(0,-650);await settle();assert.equal(await p.evaluate(()=>scrollY),pageY);
  for(const appearance of ["classic-elevation","physical-relief","topographic","realistic-terrain","illustrated-fantasy","engraved-fantasy"]){await d.getByLabel("Advanced preview appearance",{exact:true}).selectOption(appearance);await settledAdvancedCanvas(volcanicCanvas);await d.screenshot({path:f.out+"/volcano-"+appearance+"-preview.png"});}
  const volcanic=await accept(d,eroded.revision),volcanicGrid=grid(volcanic);assert.ok(volcanicGrid.some((v,i)=>v!==erodedGrid[i]));
  await terrainTool(p,"raise");const flank=await physicalPoint(canvas,50000,30000);
  const [sculptSaved]=await Promise.all([p.waitForResponse(r=>r.request().method()==="POST"&&r.url().includes("/terrain")&&!r.url().includes("/hydrology")),p.mouse.move(flank.x,flank.y).then(()=>p.mouse.down()).then(()=>p.mouse.move(flank.x+4,flank.y+2,{steps:4})).then(()=>p.mouse.up())]);
  assert.equal(sculptSaved.status(),200,await sculptSaved.text());await settle();
  const sculpted=await terrainDocument();assert.ok(sculpted.revision>volcanic.revision);assert.notEqual(digest(grid(sculpted)),digest(volcanicGrid));
  await p.reload();await canvas.waitFor();await push("Conical numerical volcano, revised crater, realistic/illustrated inspection, acceptance and later ordinary manual sculpting survive reopen");

  d=await open("eruption");await d.getByLabel("Eruption effect",{exact:true}).selectOption("ash");
  await input(d,"Maximum effect extent (m)",6000);const beforeAsh=await terrainDocument();
  await d.getByRole("button",{name:"Prepare Preview",exact:true}).click();await d.locator('[data-advanced-visual="1"]').waitFor();
  await d.getByLabel("Advanced preview appearance",{exact:true}).selectOption("realistic-terrain");
  const ashCanvas=d.getByLabel("Terrain map canvas",{exact:true});await settledAdvancedCanvas(ashCanvas);
  const ashImage=await ashCanvas.screenshot();await d.screenshot({path:f.out+"/eruption-visual-ash.png"});assert.deepEqual(await terrainDocument(),beforeAsh);
  await d.getByRole("button",{name:"Show original terrain",exact:true}).click();await settledAdvancedCanvas(ashCanvas);
  assert.notEqual(createHash("sha256").update(ashImage).digest("hex"),createHash("sha256").update(await ashCanvas.screenshot()).digest("hex"),"Settled realistic ash changes rendered environmental cover");
  await d.getByRole("button",{name:"Show proposed terrain",exact:true}).click();
  await d.getByLabel("I reviewed the affected geography",{exact:true}).check();
  await d.getByRole("button",{name:"Accept Visual Cover",exact:true}).click();await d.waitFor({state:"hidden"});
  const climate=p.getByRole("region",{name:"Climate and Biomes",exact:true});
  await terrainPanel(p,"Climate & Biomes");const saveEnvironment=climate.getByRole("button",{name:/^Save environment$/i});
  await saveEnvironment.waitFor();
  const [ashSaved]=await Promise.all([p.waitForResponse(r=>r.request().method()==="POST"&&r.url().includes("/environment?")),saveEnvironment.click()]);
  assert.equal(ashSaved.status(),200,await ashSaved.text());assert.deepEqual(await terrainDocument(),beforeAsh);
  await push("Optional visual ash previews and saves as native environmental cover while every numerical terrain sample/revision stays exact");

  d=await open("eruption");await d.getByLabel("Eruption effect",{exact:true}).selectOption("collapse");
  await d.getByLabel("Protect existing manual heights",{exact:true}).uncheck();await input(d,"Maximum effect extent (m)",2200);await input(d,"Summit collapse depth (m)",180);await prepare(d);
  await d.getByRole("button",{name:"Reject Preview",exact:true}).click();assert.deepEqual(await terrainDocument(),beforeAsh);
  await d.getByRole("button",{name:"Operation",exact:true}).click();await d.getByLabel("Eruption effect",{exact:true}).selectOption("lava");
  await input(d,"Lava source east (m)",50000);await input(d,"Lava source south (m)",28000);await input(d,"Maximum effect extent (m)",6000);await input(d,"Lava deposit width (m)",1800);await input(d,"Lava deposit thickness (m)",35);await prepare(d);
  await d.screenshot({path:f.out+"/eruption-numerical-lava.png"});const erupted=await accept(d,beforeAsh.revision),eruptedGrid=grid(erupted),priorGrid=grid(beforeAsh);
  assert.ok(eruptedGrid.some((v,i)=>v>priorGrid[i]));for(let i=0;i<eruptedGrid.length;i++)assert.ok(eruptedGrid[i]>=priorGrid[i]);
  assert.deepEqual((await read<{layer:HydroLayer}>("/terrain/hydrology?terrainMap="+map)).layer,retainedWater);
  await push("Retained authored volcano remains selectable after sculpting; cancelled collapse is exact, explicit downhill lava raises bounded terrain and preserves the saved water network");

  // Unaccepted settings survive actual navigation/reload. No proposal is silently applied.
  d=await open("volcano");await input(d,"Volcano radius (m)",6700);await input(d,"Height above existing land (m)",777);
  const beforeRecovery=await terrainDocument();await p.reload();await canvas.waitFor();d=await open("volcano");
  await d.getByRole("button",{name:"Recover Operation Settings",exact:true}).click();
  assert.equal(await d.getByLabel("Height above existing land (m)",{exact:true}).inputValue(),"777");assert.deepEqual(await terrainDocument(),beforeRecovery);
  await d.getByRole("button",{name:"Keep settings & Close",exact:true}).click();
  await push("Reload with unfinished operation retains exact settings and requires explicit recovery/repreview; accepted terrain remains exact");

  // Tablet and native phone operate the same workshop and retain the normal map canvas gate.
  for(const width of [820,390]){
    const c=await browser.newContext({viewport:{width,height:width===390?844:1000},isMobile:width===390,hasTouch:width===390,deviceScaleFactor:width===390?2:1,storageState:await context.storageState()}),page=await c.newPage();
    page.on("dialog",dialog=>dialog.accept());await page.goto(url);await page.getByLabel("Terrain map canvas",{exact:true}).waitFor();
    await terrainTool(page,"raise");const tools=page.getByRole("complementary",{name:"Tool panel",exact:true}),summary=tools.getByText("Landforms & areas",{exact:true});
    if(!await summary.isVisible())await page.getByRole("button",{name:"Tools",exact:true}).click();
    if(!await summary.evaluate(e=>(e.parentElement as HTMLDetailsElement).open))await summary.click();
    await tools.getByRole("button",{name:"Create Volcano",exact:true}).click();
    const modal=page.getByRole("dialog",{name:"Create Volcano",exact:true});await modal.waitFor();
    const recover=modal.getByRole("button",{name:"Recover Operation Settings",exact:true});if(await recover.count())await recover.click();
    await modal.getByRole("button",{name:"Operation",exact:true}).click();
    await modal.getByLabel("Volcano centre east (m)",{exact:true}).fill("45000");await modal.getByLabel("Volcano centre south (m)",{exact:true}).fill("28000");
    await modal.getByLabel("Protect existing manual heights",{exact:true}).uncheck();
    if(width===390)await modal.getByRole("button",{name:"Prepare Preview",exact:true}).tap();else await modal.getByRole("button",{name:"Prepare Preview",exact:true}).click();
    await modal.locator("[data-advanced-changed]").evaluate(async e=>{const end=performance.now()+30000;while(Number(e.getAttribute("data-advanced-changed"))<=0){if(performance.now()>end)throw Error("Native device preview did not complete");await new Promise(r=>setTimeout(r,30));}});
    if(width===390)await modal.getByRole("button",{name:"Close creation settings",exact:true}).tap();else await modal.getByRole("button",{name:"Close creation settings",exact:true}).click();
    const drawing=modal.getByLabel("Terrain map canvas",{exact:true}),box=(await drawing.boundingBox())!;
    await modal.screenshot({path:f.out+"/advanced-native-layout-"+width+".png"});assert.ok(box.height>=400,JSON.stringify({width,box}));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await modal.screenshot({path:f.out+"/advanced-native-layout-"+width+".png"});layouts.push({width,canvas:box,nativeTouch:width===390});
    if(width===390){const q=(await drawing.boundingBox())!;await page.touchscreen.tap(q.x+q.width*.6,q.y+q.height*.45);await modal.getByRole("button",{name:"Reject Preview",exact:true}).tap();}else await modal.getByRole("button",{name:"Reject Preview",exact:true}).click();
    assert.deepEqual(await terrainDocument(),beforeRecovery);await c.close();
  }
  await push("Desktop/tablet/native phone use the shared collapsible workshop and retain the unchanged 400px drawing gate without page overflow");
  await writeFile(f.out+"/advanced-browser.json",JSON.stringify({passed:true,headed:true,groups,layouts,timings,numericalSaveCount:numericalPosts.length,sharedDatabaseAccess:false,ownerAcceptance:false,physicalDevice:false},null,2));
}
