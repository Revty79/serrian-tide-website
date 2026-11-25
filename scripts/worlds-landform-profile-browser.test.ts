/** All synthetic geography is authored with visible native controls in a newly owned fixture. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import type {Locator} from "playwright-core";
import {withCollaborationFixture} from "./worlds-collaboration-fixture";
import {withCollaborationBrowser} from "./worlds-collaboration-browser-fixture";
import {claimOwnedWorldPage} from "./worlds-owned-world-api";
import {terrainPanel} from "./worlds-terrain-browser-ui";
import {settledAdvancedCanvas} from "./worlds-advanced-browser-checks";
import {createGrid,terrainGeometry} from "../src/features/worlds/terrain";
import {terrainEditMask,rootFrame} from "../src/features/worlds/terrain-refinement";
import {refinementOccluders} from "../src/features/worlds/terrain-refinement-crossing";
import {prepareAdvancedTerrain} from "../src/features/worlds/terrain-advanced";
import {protectionGrid} from "../src/features/worlds/terrain-source";
import {insideWaterRings} from "../src/features/worlds/terrain-water-geometry";
import {mapAppearanceNames} from "../src/features/worlds/terrain-appearance";
const hash=(g:Int16Array)=>createHash("sha256").update(new Uint8Array(g.buffer)).digest("hex");
const envelope=process.env.SERRIAN_PROFILE_ENVELOPE==="1",heights=envelope?[6500,6500,6500]:[3200,5800,4100],widths=envelope?[500000,700000,500000]:[180000,340000,220000];
const scopedManual=process.env.SERRIAN_PROFILE_MANUAL_RECTANGLE==="1";
assert(!scopedManual||envelope,"The scoped manual journey uses the existing landform envelope fixture.");
process.env.SERRIAN_COLLAB_OUT??=`artifacts/collaboration-s7b-landform-profile-${envelope?"envelope-":""}${Date.now()}`;
withCollaborationFixture(async f=>withCollaborationBrowser(f,async b=>{
 const context=await b.login("collab-owner-a"),p=await context.newPage(),groups:string[]=[];p.setDefaultTimeout(60000);
 const pass=async(s:string)=>{groups.push(s);console.log("PASS "+s);await writeFile(path.join(f.out,"profile-progress.json"),JSON.stringify({groups},null,2));};
 async function until<T>(read:()=>Promise<T>,test:(v:T)=>boolean,message:string){const end=Date.now()+180000;for(;;){const value=await read();if(test(value))return value;assert(Date.now()<end,message);await p.waitForTimeout(100);}}
 async function physical(canvas:Locator,x:number,y:number){await canvas.scrollIntoViewIfNeeded();const box=(await canvas.boundingBox())!,view=await canvas.evaluate(e=>({x:Number(e.dataset.viewX),y:Number(e.dataset.viewY),scale:Number(e.dataset.zoom)}));const point={x:box.x+view.x+x*view.scale,y:box.y+view.y+y*view.scale};assert(point.x>=box.x&&point.x<box.x+box.width&&point.y>=box.y&&point.y<box.y+box.height);return point;}
 async function clickPhysical(canvas:Locator,x:number,y:number){const point=await physical(canvas,x,y);await p.mouse.click(point.x,point.y);}
 await p.goto(`${b.base}/worlds/${f.worldA}?tab=atlas`);await claimOwnedWorldPage(p,b.base);
 await p.getByRole("button",{name:"Create flat world",exact:true}).click();const creation=p.getByRole("dialog");
 await creation.getByLabel("Map name",{exact:true}).fill("Native variable profile preservation rehearsal");await creation.getByLabel("Starting surface",{exact:true}).selectOption("land");await creation.getByRole("button",{name:"World size & edges",exact:true}).click();
 for(const[label,value]of [["World width (km)","40075"],["World height (km)","20004"]])await creation.getByLabel(label,{exact:true}).fill(value);
 await creation.getByLabel("Terrain detail",{exact:true}).selectOption("2048x2048");await creation.getByRole("button",{name:"Create map",exact:true}).click();await p.getByRole("region",{name:"Heightmap editor",exact:true}).waitFor();await p.getByRole("button",{name:"Expand editor",exact:true}).click();
 const mapId=new URL(p.url()).searchParams.get("terrainMap")!,terrain=await import("../src/features/worlds/terrain-service"),detail=await import("../src/features/worlds/terrain-refinement-service"),read=async()=>(await terrain.getTerrain("collab-owner-a",f.worldA,{mapId})).document!;
 const initial=await read(),shape=terrainGeometry(initial.settings),grid=(d:typeof initial)=>createGrid(d.baseElevation,d.tiles,shape),sx=shape.displayWidth/shape.width,sy=shape.displayHeight/shape.height;
 async function sculpt(){if(await p.getByRole("button",{name:"Tools",exact:true}).getAttribute("aria-expanded")!=="true")await p.getByRole("button",{name:"Tools",exact:true}).click();await p.getByRole("button",{name:"Sculpt",exact:true}).click();const summary=p.getByText("Landforms & areas",{exact:true});if(!await summary.evaluate(e=>(e.parentElement as HTMLDetailsElement).open))await summary.click();}
 async function area(x:number,y:number,width:number,height:number,target:number){await sculpt();await p.getByRole("button",{name:"Select area",exact:true}).click();const d=p.getByRole("dialog",{name:"Edit selected terrain",exact:true});await d.getByRole("button",{name:"Area & operation",exact:true}).click();for(const[label,value]of [["Area first column",x],["Area first row",y],["Area width in samples",width],["Area height in samples",height],["Target elevation (m)",target],["Interior edge blend (samples)",0]] as const)await d.getByLabel(label,{exact:true}).fill(String(value));await d.getByRole("button",{name:"Prepare terrain preview",exact:true}).click();await until(()=>d.getByRole("button",{name:"Apply terrain change",exact:true}).isEnabled(),v=>v,"Area preview ready");const revision=(await read()).revision;await d.getByRole("button",{name:"Apply terrain change",exact:true}).click();await until(read,v=>v.revision===revision+1,"Native area saved");}
 await area(950,950,80,160,5000);await area(950,970,2,100,-500);
 await terrainPanel(p,"Terrain detail");await p.getByLabel("Refined area label",{exact:true}).fill("Retained profile neighbour");await p.getByLabel("Detail resolution",{exact:true}).selectOption("custom");await p.getByLabel("Sample columns",{exact:true}).selectOption("512");await p.getByLabel("Sample rows",{exact:true}).selectOption("256");
 for(const[label,value]of [["Centre east (km)",19000],["Centre south (km)",9800],["Physical width (km)",200],["Physical height (km)",100]] as const)await p.getByLabel(label,{exact:true}).fill(String(value));
 await p.getByRole("button",{name:"Preview refined terrain",exact:true}).click();await p.getByRole("button",{name:"Accept refined terrain",exact:true}).click();
 const index=async()=>(await detail.getRefinements("collab-owner-a",f.worldA,mapId)).refinements;const meta=(await until(index,v=>v.length===1,"Native detail saved"))[0];
 async function fine(){const m=(await index())[0],g=new Int16Array(m.gridWidth*m.gridHeight);for(let start=0;start<g.length/1024;start+=64){const packet=await detail.getRefinementTiles("collab-owner-a",f.worldA,mapId,m.id,{revision:m.revision,historical:true,lod:0,keys:Array.from({length:Math.min(64,g.length/1024-start)},(_,i)=>start+i)});for(const t of packet.tiles)for(let y=0;y<32;y++)g.set(t.samples.slice(y*32,y*32+32),(t.y*32+y)*m.gridWidth+t.x*32);}return {meta:m,hash:hash(g)};}
 await until(()=>p.getByTestId("terrain-active-detail").innerText(),v=>v.includes(meta.name),"Detail ready");await p.reload();await claimOwnedWorldPage(p,b.base);await p.getByRole("region",{name:"Heightmap editor",exact:true}).waitFor();await p.getByRole("button",{name:"Expand editor",exact:true}).click();await terrainPanel(p,"Terrain detail");await p.getByLabel("Editing terrain source",{exact:true}).selectOption("");await until(()=>p.getByTestId("terrain-active-detail").innerText(),v=>v.includes("Whole World base"),"Root ready");
 // A saved native lake, not a hidden hydrology fixture write.
 if(await p.getByRole("button",{name:"Tools",exact:true}).getAttribute("aria-expanded")!=="true")await p.getByRole("button",{name:"Tools",exact:true}).click();await p.getByRole("button",{name:"Water",exact:true}).click();await p.getByRole("button",{name:"Lake shoreline workshop",exact:true}).click();const lake=p.getByRole("dialog",{name:"Lake shoreline workshop",exact:true}),lc=lake.getByLabel("Terrain map canvas",{exact:true});await lake.getByRole("button",{name:"Preview",exact:true}).click();await settledAdvancedCanvas(lc);await lake.getByRole("button",{name:"Add corners",exact:true}).click();
 for(const[x,y]of [[18800000,10000000],[19100000,10000000],[19100000,10300000],[18800000,10300000]])await clickPhysical(lc,x,y);
 await lake.getByRole("button",{name:"Shoreline & properties",exact:true}).click();await lake.getByLabel("Drawn lake name",{exact:true}).fill("Retained highland lake");await lake.getByLabel("Drawn lake level (m)",{exact:true}).fill("0");await lake.getByRole("button",{name:"Prepare lake preview",exact:true}).click();await lake.getByRole("button",{name:"Add lake to water draft",exact:true}).click();await p.getByRole("button",{name:"Save water changes",exact:true}).click();
 const readWater=async()=>{const response=await context.request.get(`${b.base}/api/worlds/${f.worldA}/terrain/hydrology?terrainMap=${mapId}`);assert.equal(response.status(),200);const v=await response.json();return {available:v.available,revision:v.revision,headRevision:v.headRevision,layer:v.layer,history:v.history};};await until(readWater,v=>v.layer.lakes?.length===1,"Native lake saved");
 const before=await read(),base=grid(before),fineBefore=await fine(),waterBefore=await readWater();await pass("native 2048 source, sea, saved lake and finer detail established without hidden authoring");
 async function open(){await sculpt();await p.getByRole("button",{name:"Shape Landform Profile",exact:true}).click();const d=p.getByRole("dialog",{name:"Shape Landform Profile",exact:true});await until(()=>d.innerText(),v=>!v.includes("Loading accepted water"),"Profile context loaded");return d;}
 const scopedArea={x:955*sx,y:955*sy,width:12*sx,height:13*sy};
 let d=await open(),c=d.getByLabel("Terrain map canvas",{exact:true});await d.getByRole("button",{name:"Add profile points on map",exact:true}).click();await settledAdvancedCanvas(c);
 for(const[x,y]of [[18700000,9600000],[19400000,10000000],[19900000,10600000]])await clickPhysical(c,x,y);
 await until(()=>d.getByLabel("Profile point 3 elevation (m)",{exact:true}).count(),v=>v===1,"Three native points");
 for(let i=1;i<=3;i++)for(const[label,value]of [[`Profile point ${i} elevation (m)`,heights[i-1]],[`Profile point ${i} full width (m)`,widths[i-1]]] as const)await d.getByLabel(label,{exact:true}).fill(String(value));
 if(envelope){await d.getByLabel("Profile effect",{exact:true}).selectOption("upper-envelope");await d.getByLabel("Envelope base elevation (m)",{exact:true}).fill("200");await d.getByLabel("Terrain modification strength (%)",{exact:true}).fill("100");}
 if(scopedManual){
   await d.getByRole("checkbox",{name:"Allow changes to earlier manual heights in a smaller rectangle",exact:true}).check();
   const labels={x:"east",y:"south",width:"width",height:"height"} as const;
   for(const axis of ["x","y","width","height"] as const)await d.getByLabel(`Manual edit rectangle ${labels[axis]} (m)`,{exact:true}).fill(String(scopedArea[axis]));
   assert(await d.getByLabel("Protect existing manual heights",{exact:true}).isChecked());
 }else await d.getByRole("checkbox",{name:"Protect existing manual heights",exact:true}).uncheck();await d.getByLabel("Profile end blend (m)",{exact:true}).fill("100000");await d.getByLabel("Selection edge feather (m)",{exact:true}).fill("50000");await d.getByRole("button",{name:"Choose Area",exact:true}).click();
 for(const[label,value]of [["Selected x (m)",18300000],["Selected y (m)",9300000],["Selected width (m)",2000000],["Selected height (m)",1600000]] as const)await d.getByLabel(label,{exact:true}).fill(String(value));
 await d.getByRole("button",{name:"Keep settings & Close",exact:true}).click();assert.equal(hash(grid(await read())),hash(base));d=await open();await d.getByRole("button",{name:"Recover Operation Settings",exact:true}).click();assert.equal(await d.getByLabel("Profile point 2 elevation (m)",{exact:true}).inputValue(),String(heights[1]));if(envelope){assert.equal(await d.getByLabel("Profile effect",{exact:true}).inputValue(),"upper-envelope");assert.equal(await d.getByLabel("Envelope base elevation (m)",{exact:true}).inputValue(),"200");}if(scopedManual){
   assert(await d.getByRole("checkbox",{name:"Allow changes to earlier manual heights in a smaller rectangle",exact:true}).isChecked());
   assert.equal(await d.getByLabel("Manual edit rectangle width (m)",{exact:true}).inputValue(),String(scopedArea.width));
 }await pass("native path heights, widths and selected area recover after closing without accepting terrain");
 c=d.getByLabel("Terrain map canvas",{exact:true});
 let appearancesReviewed=false;
 async function preview(){await d.getByRole("button",{name:"Fit selected area",exact:true}).click();const start=Date.now();await d.getByRole("button",{name:"Prepare Preview",exact:true}).click();await until(()=>d.locator("[data-advanced-changed]").getAttribute("data-advanced-changed"),v=>Number(v)>0,"Profile preview ready");await settledAdvancedCanvas(c);if(envelope&&!appearancesReviewed){for(const style of Object.keys(mapAppearanceNames)){await d.getByLabel("Advanced preview appearance",{exact:true}).selectOption(style);await settledAdvancedCanvas(c);await d.screenshot({path:path.join(f.out,`envelope-native-preview-${style}.png`)});}appearancesReviewed=true;assert.equal(hash(grid(await read())),hash(base));}await d.getByRole("button",{name:"Review Changes",exact:true}).click();assert.equal(await d.getByRole("button",{name:"Accept Numerical Change",exact:true}).isDisabled(),true);await d.getByLabel("I reviewed the affected geography",{exact:true}).check();return Date.now()-start;}
 const previewMs=await preview();const review=await d.innerText();assert(review.includes("Adjacent land-sample review"));if(scopedManual)assert.match(review,/[1-9][0-9,]* earlier manual heights changed within the smaller rectangle/);await d.screenshot({path:path.join(f.out,"variable-profile-native-preview.png")});await d.getByRole("button",{name:"Reject Preview",exact:true}).click();assert.equal(hash(grid(await read())),hash(base));assert.deepEqual(await fine(),fineBefore);assert.deepEqual(await readWater(),waterBefore);await pass("numerical profile preview and rejection preserve all accepted terrain, finer sources and water");
 await preview();let lost=false;await p.route(`**/api/worlds/${f.worldA}/terrain`,async route=>{if(route.request().method()!=="POST"||lost){await route.continue();return;}const payload=route.request().postDataJSON();if(payload.source?.advanced?.operation?.kind!=="landform-profile"){await route.continue();return;}lost=true;const response=await route.fetch();assert.equal(response.status(),200,await response.text());await route.abort("failed");});
 await d.getByRole("button",{name:"Accept Numerical Change",exact:true}).click();const accepted=await until(read,v=>v.revision===before.revision+1,"Native profile server save");await until(()=>p.getByRole("button",{name:"Retry terrain save",exact:true}).isVisible(),v=>v,"Lost acknowledgement retained");await p.getByRole("button",{name:"Retry terrain save",exact:true}).click();await until(()=>p.getByRole("button",{name:"Retry terrain save",exact:true}).count(),v=>v===0,"Original save retry acknowledged");assert.equal((await read()).revision,accepted.revision);await p.unroute(`**/api/worlds/${f.worldA}/terrain`);assert(lost);
 const after=grid(accepted),version=(await f.pool.query("select source from world_terrain_version where terrain_id=(select terrain_id from world_map_canvas where map_id=$1) and revision=$2",[mapId,accepted.revision])).rows[0].source;assert.equal(version.advanced.operation.kind,"landform-profile");assert.equal(version.advanced.operation.points.length,3);assert.notEqual(hash(after),hash(base));assert.deepEqual(await fine(),fineBefore);assert.deepEqual(await readWater(),waterBefore);
 const packetResponse=await context.request.get(`${b.base}/api/worlds/${f.worldA}/terrain/advanced?terrainMap=${mapId}`),packet=await packetResponse.json();const manual=protectionGrid(before.protection??[],shape.width,shape.height);
 const expected=prepareAdvancedTerrain(base,shape,version.advanced.operation,packet.context,terrainEditMask(shape,rootFrame(shape),refinementOccluders(await index(),null),shape),manual);assert.deepEqual(after,expected.grid);
 let changed=0,lakeCells=0;for(let i=0;i<after.length;i++){const x=i%shape.width,y=Math.floor(i/shape.width),point={x:x*sx,y:y*sy};if(after[i]!==base[i])changed++;if(insideWaterRings(point,waterBefore.layer.lakes[0].rings,packet.context.world)){lakeCells++;assert.equal(after[i],base[i]);}if(base[i]<=0||[-1,0,1].some(ey=>[-1,0,1].some(ex=>x+ex>=0&&x+ex<shape.width&&y+ey>=0&&y+ey<shape.height&&base[(y+ey)*shape.width+x+ex]<=0)))assert.equal(after[i],base[i]);}assert(changed>0&&lakeCells>0);
 if(envelope){assert.equal(version.advanced.operation.mode,"upper-envelope");assert.equal(version.advanced.operation.envelopeBaseM,200);for(let i=0;i<after.length;i++)assert(after[i]<=base[i]);assert.equal(base[960*shape.width+960],5000);assert.equal(after[960*shape.width+960],200);assert.equal(after[1024*shape.width+990],5000);await pass("native envelope removes the raised outer box, retains its authored interior and never raises a sample");}
 if(scopedManual){
   assert.equal(version.advanced.operation.preserveManual,true);
   assert.deepEqual(version.advanced.operation.manualEditArea,scopedArea);
   let revisedPrior=0,retainedPrior=0;
   for(let i=0;i<base.length;i++){
     if(!manual[i])continue;
     const x=(i%shape.width)*sx,y=Math.floor(i/shape.width)*sy;
     const inside=x>=scopedArea.x&&x<scopedArea.x+scopedArea.width&&y>=scopedArea.y&&y<scopedArea.y+scopedArea.height;
     if(after[i]!==base[i]){assert(inside,"A saved manual sample outside the smaller rectangle changed.");revisedPrior++;}
     else if(!inside)retainedPrior++;
   }
   assert(revisedPrior>0&&retainedPrior>0);
   await pass("ordinary authoritative save changes earlier manual heights only inside the recovered smaller rectangle");
 }
 await pass("authoritative server profile, original-request retry, sea supports, saved lake and all finer data remain exact");
 await p.getByRole("button",{name:"Undo change",exact:true}).click();
 await until(read,v=>v.revision===accepted.revision+1,"Profile Undo saved");
 assert.equal(hash(grid(await read())),hash(base));
 await p.getByRole("button",{name:"Redo change",exact:true}).click();
 await until(read,v=>v.revision===accepted.revision+2,"Profile Redo saved");
 assert.equal(hash(grid(await read())),hash(after));
 // The visible status includes both the save acknowledgement and recovery status.
 await p.getByText("Terrain saved · revision "+(accepted.revision+2)+".").waitFor();
 await p.reload();
 await claimOwnedWorldPage(p,b.base);
 await p.getByRole("region",{name:"Heightmap editor",exact:true}).waitFor();
 assert.equal(hash(grid(await read())),hash(after));
 assert.deepEqual(await fine(),fineBefore);
 assert.deepEqual(await readWater(),waterBefore);
 await pass("exact native Undo/Redo, saved provenance and normal reopening preserve the accepted profile");
 await area(1020,1060,1,1,3333);const manualRevision=(await read()).revision;assert.equal(grid(await read())[1060*shape.width+1020],3333);await p.getByRole("button",{name:"Undo change",exact:true}).click();await until(read,v=>v.revision===manualRevision+1,"Later ordinary edit Undo saved");assert.equal(hash(grid(await read())),hash(after));await pass("accepted profile remains editable through ordinary native terrain controls and exact Undo");
 const foreign=await b.login("collab-uninvited"),fp=await foreign.newPage();await fp.goto(p.url());await fp.getByRole("heading",{name:"404",exact:true}).waitFor();await foreign.close();await pass("uninvited account cannot enter the private native profile editor");

 await p.screenshot({path:path.join(f.out,"variable-profile-native-reopened.png")});
 // Independently rehearse a level-only native water correction in this owned fixture.
 if(await p.getByRole("button",{name:"Tools",exact:true}).getAttribute("aria-expanded")!=="true")await p.getByRole("button",{name:"Tools",exact:true}).click();await p.getByRole("button",{name:"Water",exact:true}).click();await p.getByRole("button",{name:"Rivers, sources & connections",exact:true}).click();const more=p.getByText("More water tools and saved waterways",{exact:true});if(!await more.evaluate(e=>e.closest("details")?.open))await more.click();await p.getByRole("combobox",{name:"Lake list",exact:true}).selectOption("draft:"+waterBefore.layer.lakes[0].id);await p.getByLabel("Lake water level (m)",{exact:true}).fill("3810");await p.getByRole("button",{name:"Apply lake details",exact:true}).click();assert.deepEqual((await readWater()).layer,waterBefore.layer);await p.getByRole("button",{name:"Save water changes",exact:true}).click();const raisedWater=await until(readWater,v=>v.headRevision===waterBefore.headRevision+1,"Owned level correction saved");
 const oldLake=waterBefore.layer.lakes[0],newLake=raisedWater.layer.lakes[0];assert.equal(newLake.levelM,3810);assert.deepEqual(newLake.rings,oldLake.rings);assert.equal(newLake.id,oldLake.id);for(const key of ["name","seed","spillM","condition","mode","inletNodeIds","outletNodeId","flowKind","exceptionReason","protected","analysisId","sourceIds"])assert.deepEqual(newLake[key],oldLake[key]);assert.deepEqual(raisedWater.layer.nodes,waterBefore.layer.nodes);assert.deepEqual(raisedWater.layer.edges,waterBefore.layer.edges);assert.equal(hash(grid(await read())),hash(after));assert.deepEqual(await fine(),fineBefore);
 await writeFile(path.join(f.out,"owned-native-level-only-rehearsal.json"),JSON.stringify({passed:true,syntheticOwnedFixtureOnly:true,oldLevelM:0,newLevelM:3810,sameLakeIdentityAndRings:true,allGroundAndFinerExact:true,oldLake,newLake,ownerEnvironmentAccessed:false},null,2));await pass("existing native water-level control changes a standing surface while preserving its identity, outlines, connections and all ground");
await writeFile(path.join(f.out,"landform-profile-results.json"),JSON.stringify({passed:true,mode:envelope?"upper-envelope":"shape",scopedManual,groups,previewMs,review,changed,lakeCells,sourceSamples:base.length,before:hash(base),after:hash(after),rootRevision:(await read()).revision,waterRevision:waterBefore.revision,finerExact:true,allAuthoringVisibleNative:true,externalGeography:false,ownerEnvironmentAccessed:false,buildId:b.buildId,sourceHash:b.sourceHash},null,2));
})).catch(e=>{console.error(e);process.exitCode=1;});
