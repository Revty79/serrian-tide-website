/** Synthetic visible-control regression only; never loads owner environment files. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {withCollaborationFixture,collaborationPassword} from "./worlds-collaboration-fixture";
import {withCollaborationBrowser} from "./worlds-collaboration-browser-fixture";
import {createGrid,terrainGeometry,type TerrainDocument} from "../src/features/worlds/terrain";

process.env.SERRIAN_COLLAB_OUT??=`artifacts/collaboration-s7b-earth-pass1-polygon-${Date.now()}`;
withCollaborationFixture(async f=>withCollaborationBrowser(f,async b=>{
 const context=await b.browser.newContext({viewport:{width:1800,height:1200},extraHTTPHeaders:{"cf-connecting-ip":"198.51.100.231"}});
 const p=await context.newPage();p.setDefaultTimeout(30000);
 const errors:string[]=[];p.on("pageerror",e=>errors.push(e.message));
 p.on("console",m=>{if(m.type()==="error"&&/Maximum update depth/.test(m.text()))errors.push(m.text());});
 const groups:string[]=[],pass=(name:string)=>{groups.push(name);console.log("PASS",name);};
 await p.goto(b.base+"/login");await p.getByLabel("Username or Email",{exact:true}).fill("owner_a");await p.getByLabel("Password",{exact:true}).fill(collaborationPassword);await p.getByRole("button",{name:"Enter",exact:true}).click();await p.waitForURL(u=>!u.pathname.startsWith("/login"));
 await p.goto(b.base+"/worlds");await p.getByRole("button",{name:"Create world",exact:true}).click();
 const creation=p.getByRole("dialog",{name:"Create a world",exact:true});await creation.getByLabel("World name",{exact:true}).fill("Synthetic dense polygon authoring");await creation.getByRole("button",{name:"Create world",exact:true}).click();
 await p.getByRole("link",{name:"Open Synthetic dense polygon authoring",exact:true}).click();await p.getByRole("button",{name:"Atlas",exact:true}).click();await p.getByText("You are editing",{exact:true}).waitFor();
 await p.getByRole("button",{name:"Create flat world",exact:true}).click();
 const map=p.getByRole("dialog",{name:"Create flat world",exact:true});await map.getByLabel("Map name",{exact:true}).fill("Synthetic 2048 polygon canvas");await map.getByRole("button",{name:"World size & edges",exact:true}).click();
 await map.getByLabel("World width (km)",{exact:true}).fill("40075");await map.getByLabel("World height (km)",{exact:true}).fill("20004");await map.getByLabel("East/west edges",{exact:true}).selectOption("wrap");await map.getByLabel("Terrain detail",{exact:true}).selectOption("2048x2048");await map.getByRole("button",{name:"Create map",exact:true}).click();
 await p.getByRole("region",{name:"Heightmap editor",exact:true}).waitFor();
 const rootUrl=p.url(),worldId=new URL(rootUrl).pathname.split("/").at(-1)!,mapId=new URL(rootUrl).searchParams.get("terrainMap")!;assert.ok(mapId);
 const read=async()=>{const response=await context.request.get(`${b.base}/api/worlds/${worldId}/terrain?terrainMap=${mapId}`);assert.equal(response.status(),200);return (await response.json()).document as TerrainDocument;};
 const hash=(d:TerrainDocument)=>createHash("sha256").update(new Uint8Array(createGrid(d.baseElevation,d.tiles,terrainGeometry(d.settings)).buffer)).digest("hex");
 const poll=async(test:()=>Promise<boolean>,message:string)=>{const deadline=Date.now()+60000;while(!await test()){assert.ok(Date.now()<deadline,message);await p.waitForTimeout(100);}};
 const initial=await read(),initialHash=hash(initial);assert.equal(initial.settings.gridWidth,2048);assert.equal(initial.settings.gridHeight,2048);assert.equal(initial.source?.kind,"blank");
 await p.getByRole("button",{name:"Expand editor",exact:true}).click();
 async function openArea(){
  const tools=p.getByRole("button",{name:"Tools",exact:true});if(await tools.getAttribute("aria-expanded")!=="true")await tools.click();
  await p.getByRole("button",{name:"Sculpt",exact:true}).click();
  if(!await p.getByRole("button",{name:"Select area",exact:true}).isVisible())await p.getByText("Landforms & areas",{exact:true}).click();
  await p.getByRole("button",{name:"Select area",exact:true}).click();
  const d=p.getByRole("dialog",{name:"Edit selected terrain",exact:true});await d.getByRole("button",{name:"Area & operation",exact:true}).click();await d.getByLabel("Selection shape",{exact:true}).selectOption("polygon");await d.getByLabel("Target elevation (m)",{exact:true}).fill("200");await d.getByLabel("Interior edge blend (samples)",{exact:true}).fill("0");await d.getByRole("button",{name:"Preview",exact:true}).click();
  await d.getByRole("button",{name:"Add corners",exact:true}).waitFor();
  const c=d.getByLabel("Terrain map canvas",{exact:true});await poll(async()=>await c.getAttribute("data-render-pending")==="0","Preview rendering settles");
  return {d,c};
 }
 let {d,c}=await openArea();
 let box=(await c.boundingBox())!;
 const start={x:box.x+box.width*.48,y:box.y+box.height*.43};
 // Deliberately synthetic screen-space comb: adjacent corners are inside the
 // old 12px hit radius. No external geographic geometry is used by this test.
 const clicks=Array.from({length:12},(_,i)=>({x:start.x+i*2.5,y:start.y+(i%2)*3}));clicks.push({x:start.x+27.5,y:start.y+40},{x:start.x,y:start.y+40});
 for(const q of clicks)await p.mouse.click(q.x,q.y);
 await d.getByRole("button",{name:"Area & operation",exact:true}).click();await d.getByText("14 of 256 total polygon corners; 0 of 32 exclusions.",{exact:true}).waitFor();
 await d.getByText("Edit polygon corner coordinates",{exact:true}).click();
 const values=async()=>Promise.all(Array.from({length:14},async(_,i)=>({x:await d.getByLabel(`Polygon corner ${i+1} column`,{exact:true}).inputValue(),y:await d.getByLabel(`Polygon corner ${i+1} row`,{exact:true}).inputValue()})));
 const before=await values();assert.equal(new Set(before.map(q=>q.x+"/"+q.y)).size,14);
 pass("dense adjacent clicks retain every deliberately added polygon corner");
 await d.getByRole("button",{name:"Preview",exact:true}).click();await d.getByRole("button",{name:"Move corners",exact:true}).click();
 // Switching workshop sections remounts the preview. Locate the actual native
 // corner in its current displayed frame rather than reusing old screen pixels.
 await c.scrollIntoViewIfNeeded();box=(await c.boundingBox())!;
 const view=await c.evaluate(e=>({x:Number(e.dataset.viewX),y:Number(e.dataset.viewY),scale:Number(e.dataset.zoom)})),geometry=terrainGeometry(initial.settings);
 const corner={x:box.x+view.x+Number(before[0].x)/geometry.width*geometry.displayWidth*view.scale,y:box.y+view.y+Number(before[0].y)/geometry.height*geometry.displayHeight*view.scale};
 assert.equal(await p.evaluate(q=>document.elementFromPoint(q.x,q.y)?.getAttribute("aria-label"),corner),"Terrain map canvas","The drag must hit the displayed native corner");
 await p.mouse.click(corner.x-45,corner.y+70);
 await p.mouse.move(corner.x,corner.y);await p.mouse.down();await p.mouse.move(corner.x-8,corner.y-5,{steps:4});await p.mouse.up();
 await d.getByRole("button",{name:"Area & operation",exact:true}).click();const after=await values();assert.notDeepEqual(after[0],before[0]);assert.deepEqual(after.slice(1),before.slice(1));
 await d.getByText("14 of 256 total polygon corners; 0 of 32 exclusions.",{exact:true}).waitFor();
 pass("Move corners chooses the nearest dense vertex; background clicks add nothing and other corners remain exact");
 await d.getByRole("button",{name:"Cancel",exact:true}).click();assert.equal(hash(await read()),initialHash);assert.equal((await read()).revision,initial.revision);
 pass("cancelling dense selection preserves every accepted sample and revision");
 ({d,c}=await openArea());box=(await c.boundingBox())!;
 const anchor={x:box.x+box.width*.48,y:box.y+box.height*.43};
 for(let i=0;i<12;i++)await p.mouse.click(anchor.x+i*2.5,anchor.y+(i%2)*3);
 await p.mouse.click(anchor.x+27.5,anchor.y+40);await p.mouse.click(anchor.x,anchor.y+40);
 // Hundreds of ordinary hover redraws must not recursively publish unchanged
 // React readiness updates, even on the full 4.2-million-sample canvas.
 for(let i=0;i<180;i++)await p.mouse.move(anchor.x+60+(i%20),anchor.y+60+Math.floor(i/20));
 await d.getByRole("button",{name:"Prepare terrain preview",exact:true}).click();await poll(()=>d.getByRole("button",{name:"Apply terrain change",exact:true}).isEnabled(),"Valid dense polygon proposal becomes reviewable");
 assert.equal(hash(await read()),initialHash,"Preparing a proposal never writes accepted terrain");
 await p.screenshot({path:path.join(f.out,"dense-polygon-proposal.png")});
 await d.getByRole("button",{name:"Apply terrain change",exact:true}).click();await poll(async()=>(await read()).revision>initial.revision,"Native polygon saves through autosave");
 let saved=await read();const savedHash=hash(saved);assert.notEqual(savedHash,initialHash);assert.ok(createGrid(saved.baseElevation,saved.tiles,terrainGeometry(saved.settings)).some(z=>z===200));
 pass("dense native proposal is temporary until Apply and persists through the normal 2048 save");
 await p.getByRole("button",{name:"Undo change",exact:true}).click();await poll(async()=>(await read()).revision>saved.revision,"Undo saves");saved=await read();assert.equal(hash(saved),initialHash);
 await p.getByRole("button",{name:"Redo change",exact:true}).click();await poll(async()=>(await read()).revision>saved.revision,"Redo saves");saved=await read();assert.equal(hash(saved),savedHash);
 await p.goto(rootUrl);await p.getByRole("region",{name:"Heightmap editor",exact:true}).waitFor();assert.equal(hash(await read()),savedHash);assert.equal((await read()).revision,saved.revision);
 await p.screenshot({path:path.join(f.out,"dense-polygon-reopened.png")});
 pass("exact native Undo/Redo and reopened numerical samples remain editable and persistent");
 assert.deepEqual(errors,[]);await writeFile(path.join(f.out,"polygon-authoring-result.json"),JSON.stringify({passed:true,groups,sourceHash:b.sourceHash,buildId:b.buildId,worldId,mapId,revision:saved.revision,errors,ownerEnvironmentAccessed:false,externalGeometryUsed:false},null,2));
})).catch(e=>{console.error(e);process.exitCode=1;});
