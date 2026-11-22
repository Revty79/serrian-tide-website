/** Native UI at the complete source-count boundary; ephemeral synthetic World only. */
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {withCollaborationFixture} from "./worlds-collaboration-fixture";
import {withCollaborationBrowser} from "./worlds-collaboration-browser-fixture";
import {claimOwnedWorldPage} from "./worlds-owned-world-api";
import {terrainPanel} from "./worlds-terrain-browser-ui";
import {settledAdvancedCanvas} from "./worlds-advanced-browser-checks";
import {createGrid,terrainGeometry} from "../src/features/worlds/terrain";
process.env.SERRIAN_COLLAB_OUT??=`artifacts/collaboration-s7b-source-capacity-browser-${Date.now()}`;
const hash=(g:Int16Array)=>createHash("sha256").update(new Uint8Array(g.buffer,g.byteOffset,g.byteLength)).digest("hex");
withCollaborationFixture(async f=>{
 const terrain=await import("../src/features/worlds/terrain-service"),detail=await import("../src/features/worlds/terrain-refinement-service"),mapId=randomUUID();
 await terrain.changeTerrain("collab-owner-a",f.worldA,{action:"create",requestId:mapId,name:"Owned native source-capacity World",initial:"land",settings:{gridWidth:2048,gridHeight:2048,widthKm:256,heightKm:256,wrap:false}});
 const root=(await terrain.getTerrain("collab-owner-a",f.worldA,{mapId})).document!,rootShape=terrainGeometry(root.settings),rootHash=hash(createGrid(root.baseElevation,root.tiles,rootShape)),index=()=>detail.getRefinements("collab-owner-a",f.worldA,mapId);
 for(let n=0;n<255;n++)await detail.createRefinement("collab-owner-a",f.worldA,{action:"create",requestId:randomUUID(),mapId,parentId:null,parentRevision:root.revision,name:"Owned preceding area "+n,frame:{x:1000+n%16*7000,y:1000+Math.floor(n/16)*7000,width:1000,height:1000},gridWidth:32,gridHeight:32,previewHash:hash(new Int16Array(1024).fill(root.baseElevation))});
 const preceding=(await index()).refinements;assert.equal(preceding.length,255);
 await withCollaborationBrowser(f,async b=>{
  const context=await b.login("collab-owner-a"),p=await context.newPage(),groups:string[]=[];p.setDefaultTimeout(45000);
  const pass=async(name:string)=>{groups.push(name);console.log("PASS "+name);await writeFile(path.join(f.out,"progress.json"),JSON.stringify({groups},null,2));};
  async function until<T>(read:()=>Promise<T>,accept:(v:T)=>boolean,message:string){const end=Date.now()+180000;for(;;){const value=await read();if(accept(value))return value;assert(Date.now()<end,message);await p.waitForTimeout(100);}}
  await p.goto(`${b.base}/worlds/${f.worldA}?tab=atlas&terrainMap=${mapId}`);await claimOwnedWorldPage(p,b.base);await p.getByRole("region",{name:"Heightmap editor",exact:true}).waitFor();await p.getByRole("button",{name:"Expand editor",exact:true}).click();
  await terrainPanel(p,"Terrain detail");await p.getByText(/Terrain-detail areas:\s*255 of\s*256\./).waitFor();
  await p.getByLabel("Refined area label",{exact:true}).fill("Owned capacity native final area");await p.getByLabel("Detail resolution",{exact:true}).selectOption("custom");
  for(const label of ["Sample columns","Sample rows"])await p.getByLabel(label,{exact:true}).selectOption("4096");
  for(const[label,value]of [["Centre east (km)","240.5"],["Centre south (km)","240.5"],["Physical width (km)","1"],["Physical height (km)","1"]])await p.getByLabel(label,{exact:true}).fill(value);
  await p.getByLabel("I understand the advanced terrain requirements",{exact:true}).check();await p.getByRole("button",{name:"Preview refined terrain",exact:true}).click();await p.getByRole("button",{name:"Accept refined terrain",exact:true}).click();
  await until(()=>p.getByTestId("terrain-active-detail").innerText(),v=>v.includes("Owned capacity native final area"),"Native final source is active");
  const all=await until(index,v=>v.refinements.length===256,"Native256-source acceptance"),target=all.refinements.find(v=>v.name==="Owned capacity native final area")!;assert(target);assert.equal(target.gridWidth,4096);assert.equal(target.gridHeight,4096);
  assert.deepEqual(all.refinements.filter(v=>v.id!==target.id),preceding);
  await p.getByText(/Terrain-detail areas:\s*256 of\s*256\./).waitFor();assert(await p.getByRole("button",{name:"Preview refined terrain",exact:true}).isDisabled());
  assert.equal(await p.getByLabel("Editing terrain source",{exact:true}).locator("option").count(),257);assert(await p.getByLabel("Editing terrain source",{exact:true}).isEnabled());
  await p.getByRole("button",{name:"Go to active terrain",exact:true}).click();await settledAdvancedCanvas(p.getByLabel("Terrain map canvas",{exact:true}));await until(()=>p.getByRole("button",{name:"Sculpt",exact:true}).isEnabled(),Boolean,"The selected native source finishes loading before inspection");
  await p.getByText(/Terrain-detail areas:\s*256 of\s*256\./).scrollIntoViewIfNeeded();await p.screenshot({path:path.join(f.out,"native256-capacity-controls.png")});await pass("Visible settled native creation accepts the256th4096-square source, lists all257choices and disables excess creation while retaining source selection");
  async function readTarget(){
   const meta=(await index()).refinements.find(v=>v.id===target.id)!,refs=(await f.pool.query("select distinct on(tile_y,tile_x) tile_x,tile_y,sha256 from world_terrain_refinement_tile where refinement_id=$1 and revision<=$2 and lod=0 order by tile_y,tile_x,revision desc",[target.id,meta.revision])).rows,grid=new Int16Array(4096*4096),cache=new Map<string,Buffer>();assert.equal(refs.length,16384);
   for(const ref of refs){let bytes=cache.get(ref.sha256);if(!bytes){bytes=await readFile(path.join(f.terrainRoot,"objects",ref.sha256.slice(0,2),ref.sha256+".i16"));assert.equal(createHash("sha256").update(bytes).digest("hex"),ref.sha256);cache.set(ref.sha256,bytes);}for(let y=0;y<32;y++)for(let x=0;x<32;x++)grid[(ref.tile_y*32+y)*4096+ref.tile_x*32+x]=bytes.readInt16LE((y*32+x)*2);}
   return {meta,grid,sha256:hash(grid)};
  }
  const before=await readTarget();assert(before.grid.every(z=>z===root.baseElevation));
  await p.getByRole("button",{name:"Sculpt",exact:true}).click();const landforms=p.getByText("Landforms & areas",{exact:true});if(!await landforms.evaluate(e=>(e.parentElement as HTMLDetailsElement).open))await landforms.click();await p.getByRole("button",{name:"Create Volcano",exact:true}).click();
  const d=p.getByRole("dialog",{name:"Create Volcano",exact:true});await d.getByRole("button",{name:"Prepare Preview",exact:true}).waitFor();await d.getByRole("button",{name:"Choose Area",exact:true}).click();
  for(const[label,value]of [["Selected x (m)",240450],["Selected y (m)",240450],["Selected width (m)",100],["Selected height (m)",100]] as const)await d.getByLabel(label,{exact:true}).fill(String(value));
  await d.getByRole("button",{name:"Fit selected area",exact:true}).click();await d.getByRole("button",{name:"Operation",exact:true}).click();await d.getByLabel("Protect existing manual heights",{exact:true}).uncheck();await d.getByLabel("Keep saved sea shoreline",{exact:true}).check();await d.getByLabel("Volcano form",{exact:true}).selectOption("shield");
  for(const[label,value]of [["Volcano centre east (m)",240500],["Volcano centre south (m)",240500],["Volcano radius (m)",35],["Height above existing land (m)",40],["Terrain modification strength (%)",100],["Crater / caldera diameter (m)",0],["Crater / caldera depth (m)",0],["Slope profile",2],["Blend / transition distance (m)",5]] as const)await d.getByLabel(label,{exact:true}).fill(String(value));
  await d.getByRole("button",{name:"Prepare Preview",exact:true}).click();await until(()=>d.locator("[data-advanced-changed]").getAttribute("data-advanced-changed"),v=>Number(v)>0,"Bounded native numerical preview at256-source capacity");await d.getByLabel("Advanced preview appearance",{exact:true}).selectOption("physical-relief");await settledAdvancedCanvas(d.getByLabel("Terrain map canvas",{exact:true}));assert.equal(await d.getByLabel("Terrain map canvas",{exact:true}).getAttribute("data-map-appearance"),"physical-relief");await d.screenshot({path:path.join(f.out,"native256-bounded-volcano.png")});
  await d.getByLabel("I reviewed the affected geography",{exact:true}).check();await d.getByRole("button",{name:"Accept Numerical Change",exact:true}).click();await until(index,v=>v.refinements.find(m=>m.id===target.id)?.revision===2,"Native save at full source capacity");
  const saved=await readTarget();assert.notEqual(saved.sha256,before.sha256);let changed=0,maximum=-Infinity;
  for(let y=0;y<4096;y++)for(let x=0;x<4096;x++){const i=y*4096+x,value=saved.grid[i];maximum=Math.max(maximum,value);if(value!==before.grid[i]){changed++;const east=240000+x*1000/4096,south=240000+y*1000/4096;assert(east>=240450&&east<=240550&&south>=240450&&south<=240550);assert(value>=before.grid[i]&&value<=root.baseElevation+40);}if(x===0||y===0||x===4095||y===4095)assert.equal(value,before.grid[i]);}assert(changed>0);assert.equal(maximum,root.baseElevation+40);assert.equal(saved.grid[2048*4096+2048],maximum);
  await p.getByRole("button",{name:"Undo change",exact:true}).click();await until(index,v=>v.refinements.find(m=>m.id===target.id)?.revision===3,"Native Undo");assert.equal((await readTarget()).sha256,before.sha256);
  await p.getByRole("button",{name:"Redo change",exact:true}).click();await until(index,v=>v.refinements.find(m=>m.id===target.id)?.revision===4,"Native Redo");assert.equal((await readTarget()).sha256,saved.sha256);
  assert.deepEqual((await index()).refinements.filter(v=>v.id!==target.id),preceding);const actualRoot=(await terrain.getTerrain("collab-owner-a",f.worldA,{mapId})).document!;assert.deepEqual(actualRoot,root);assert.equal(hash(createGrid(actualRoot.baseElevation,actualRoot.tiles,rootShape)),rootHash);
  await pass("At full capacity the guarded native volcano saves on4096-square terrain; whole-grid Undo/Redo, outside/boundary samples, Root and255 preceding sources remain exact");
  await p.reload();await claimOwnedWorldPage(p,b.base);await p.getByText("World · revision 4",{exact:true}).waitFor();assert(await p.getByRole("button",{name:"Save terrain",exact:true}).isDisabled());
  await terrainPanel(p,"Terrain detail");await p.getByText(/Terrain-detail areas:\s*256 of\s*256\./).waitFor();assert.equal(await p.getByLabel("Editing terrain source",{exact:true}).locator("option").count(),257);assert.equal(await p.getByLabel("Editing terrain source",{exact:true}).inputValue(),target.id);assert.equal((await readTarget()).sha256,saved.sha256);
  await p.getByRole("button",{name:"Go to active terrain",exact:true}).click();await settledAdvancedCanvas(p.getByLabel("Terrain map canvas",{exact:true}));await p.getByText(/Terrain-detail areas:\s*256 of\s*256\./).scrollIntoViewIfNeeded();await p.screenshot({path:path.join(f.out,"native256-fresh-reopened-controls.png")});
  await pass("Fresh ordinary reopening retains exact saved terrain, selection, complete source count and creation-limit explanation");
  await writeFile(path.join(f.out,"results.json"),JSON.stringify({passed:true,groups,sourceHash:b.sourceHash,buildId:b.buildId,sourceCount:256,selectedGrid:[4096,4096],changed,baseElevation:root.baseElevation,maximum,exactCentreHeight:true,wholeGridHistoryAndOtherSourcesExact:true,allOwnerEnvironmentAndGeographyUntouched:true},null,2));
 });
}).catch(error=>{console.error(error);process.exitCode=1;});
