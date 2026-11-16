/** Synthetic native lake controls only. Never loads owner environment or geographic input. */
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {withCollaborationFixture,collaborationPassword} from "./worlds-collaboration-fixture";
import {withCollaborationBrowser} from "./worlds-collaboration-browser-fixture";
import {createGrid,terrainGeometry,type TerrainDocument} from "../src/features/worlds/terrain";
import type {HydroLayer} from "../src/features/worlds/terrain-hydrology";

process.env.SERRIAN_COLLAB_OUT??=`artifacts/collaboration-s7b-earth-pass1-lake-${Date.now()}`;
withCollaborationFixture(async f=>withCollaborationBrowser(f,async b=>{
 const context=await b.browser.newContext({viewport:{width:1800,height:1200},extraHTTPHeaders:{"cf-connecting-ip":"198.51.100.232"}});
 const p=await context.newPage();p.setDefaultTimeout(30000);
 const errors:string[]=[];p.on("pageerror",e=>errors.push(e.message));
 const groups:string[]=[],pass=(s:string)=>{groups.push(s);console.log("PASS",s);};
 const poll=async(test:()=>Promise<boolean>,message:string)=>{const deadline=Date.now()+60000;while(!await test()){if(Date.now()>=deadline){await writeFile(path.join(f.out,"native-timeout.txt"),message+"\n"+await p.locator("body").innerText());await p.screenshot({path:path.join(f.out,"native-timeout.png")});assert.fail(message);}await p.waitForTimeout(100);}};
 await p.goto(b.base+"/login");await p.getByLabel("Username or Email",{exact:true}).fill("owner_a");await p.getByLabel("Password",{exact:true}).fill(collaborationPassword);await p.getByRole("button",{name:"Enter",exact:true}).click();await p.waitForURL(u=>!u.pathname.startsWith("/login"));
 await p.goto(b.base+"/worlds");await p.getByRole("button",{name:"Create world",exact:true}).click();
 const creation=p.getByRole("dialog",{name:"Create a world",exact:true});await creation.getByLabel("World name",{exact:true}).fill("Synthetic close-corner lake");await creation.getByRole("button",{name:"Create world",exact:true}).click();
 await p.getByRole("link",{name:"Open Synthetic close-corner lake",exact:true}).click();await p.getByRole("button",{name:"Atlas",exact:true}).click();await p.getByText("You are editing",{exact:true}).waitFor();
 await p.getByRole("button",{name:"Create flat world",exact:true}).click();
 const map=p.getByRole("dialog",{name:"Create flat world",exact:true});await map.getByLabel("Map name",{exact:true}).fill("Synthetic lake canvas");await map.getByRole("button",{name:"World size & edges",exact:true}).click();
 await map.getByLabel("World width (km)",{exact:true}).fill("40075");await map.getByLabel("World height (km)",{exact:true}).fill("20004");await map.getByLabel("East/west edges",{exact:true}).selectOption("wrap");await map.getByLabel("Terrain detail",{exact:true}).selectOption("2048x2048");await map.getByRole("button",{name:"Create map",exact:true}).click();
 await p.getByRole("region",{name:"Heightmap editor",exact:true}).waitFor();
 const rootUrl=p.url(),worldId=new URL(rootUrl).pathname.split("/").at(-1)!,mapId=new URL(rootUrl).searchParams.get("terrainMap")!;
 const readTerrain=async()=>{const r=await context.request.get(`${b.base}/api/worlds/${worldId}/terrain?terrainMap=${mapId}`);assert.equal(r.status(),200);return(await r.json()).document as TerrainDocument;};
 const readWater=async()=>{const r=await context.request.get(`${b.base}/api/worlds/${worldId}/terrain/hydrology?terrainMap=${mapId}`);assert.equal(r.status(),200);return await r.json() as {revision:number;headRevision:number;layer:HydroLayer};};
 const hash=(d:TerrainDocument)=>createHash("sha256").update(new Uint8Array(createGrid(d.baseElevation,d.tiles,terrainGeometry(d.settings)).buffer)).digest("hex");
 const terrain=await readTerrain(),terrainHash=hash(terrain),water=await readWater();
 await p.getByRole("button",{name:"Expand editor",exact:true}).click();
 async function openWater(){if(await p.getByRole("button",{name:"Tools",exact:true}).getAttribute("aria-expanded")!=="true")await p.getByRole("button",{name:"Tools",exact:true}).click();await p.getByRole("button",{name:"Water",exact:true}).click();}
 await openWater();await p.getByRole("button",{name:"Lake shoreline workshop",exact:true}).click();
 const d=p.getByRole("dialog",{name:"Lake shoreline workshop",exact:true}),c=d.getByLabel("Terrain map canvas",{exact:true});
 await d.getByRole("button",{name:"Preview",exact:true}).click();await c.scrollIntoViewIfNeeded();
 await poll(async()=>Number(await c.getAttribute("data-zoom"))>0&&await c.getAttribute("data-render-pending")==="0","Native lake viewport initializes and renders");
 if(await d.getByRole("button",{name:"Add corners",exact:true}).count())await d.getByRole("button",{name:"Add corners",exact:true}).click();
 await c.scrollIntoViewIfNeeded();
 // Observe delivered native pointer events rather than assuming the browser
 // preserves every requested subpixel at this forty-million-metre World scale.
 type PointerObservation={kind:string;x:number;y:number;left:number;top:number;viewX:number;viewY:number;scale:number};
 const delivered:PointerObservation[]=[];
 await p.exposeFunction("captureSyntheticLakePointer",(value:PointerObservation)=>{delivered.push(value);});
 await p.evaluate("(()=>{const canvas=document.querySelector('dialog canvas');const record=event=>{const r=canvas.getBoundingClientRect();void window.captureSyntheticLakePointer({kind:event.type,x:event.clientX,y:event.clientY,left:r.left,top:r.top,viewX:Number(canvas.dataset.viewX),viewY:Number(canvas.dataset.viewY),scale:Number(canvas.dataset.zoom)});};canvas.addEventListener('pointerdown',record);canvas.addEventListener('pointerup',record);})()");
 const observedPoint=(event:PointerObservation)=>({x:(event.x-event.left-event.viewX)/event.scale,y:(event.y-event.top-event.viewY)/event.scale});
 async function clickObserved(x:number,y:number){assert.equal(await p.evaluate(q=>document.elementFromPoint(q.x,q.y)?.getAttribute("aria-label"),{x,y}),"Terrain map canvas");const before=delivered.length;await p.mouse.click(x,y);await poll(async()=>delivered.length>=before+2,"Native pointer observation arrives");const down=delivered.slice(before).find(e=>e.kind==="pointerdown");assert.ok(down);return observedPoint(down);}
 let box=(await c.boundingBox())!,view=await c.evaluate(e=>({x:Number(e.dataset.viewX),y:Number(e.dataset.viewY),scale:Number(e.dataset.zoom)}));
 const anchor={x:box.width*.48,y:box.height*.43},screen=Array.from({length:12},(_,i)=>({x:anchor.x+i*2.5,y:anchor.y+(i%2)*3}));
 screen.push({x:anchor.x+27.5,y:anchor.y+40},{x:anchor.x,y:anchor.y+40});
 const expected:{x:number;y:number}[]=[];
 for(const q of screen)expected.push(await clickObserved(box.x+q.x,box.y+q.y));
 const count=Number((await d.innerText()).match(/(\d+) of 1024 corners\./)?.[1]);
 await p.screenshot({path:path.join(f.out,"dense-lake-native-corners.png")});
 if(process.env.SERRIAN_LAKE_EXPECT_BASELINE_FAILURE==="1"){
  assert.ok(count<14,"The unchanged application must reproduce lost adjacent additions");
  await d.getByRole("button",{name:"Cancel",exact:true}).click();assert.deepEqual((await readWater()).layer,water.layer);assert.equal(hash(await readTerrain()),terrainHash);
  await writeFile(path.join(f.out,"lake-baseline-failure.json"),JSON.stringify({failedApplicationBaseline:true,intendedCorners:14,actualCorners:count,unchangedAcceptedWater:true,unchangedTerrain:true,sourceHash:b.sourceHash,buildId:b.buildId,errors,ownerEnvironmentAccessed:false},null,2));
  console.log("EXPECTED BASELINE FAILURE",count,"of 14 corners");return;
 }
 assert.equal(count,14);pass("native Add corners retains all fourteen adjacent shoreline clicks");
 await d.getByRole("button",{name:"Move corners",exact:true}).click();
 await c.scrollIntoViewIfNeeded();box=(await c.boundingBox())!;view=await c.evaluate(e=>({x:Number(e.dataset.viewX),y:Number(e.dataset.viewY),scale:Number(e.dataset.zoom)}));
 const corner={x:box.x+view.x+expected[0].x*view.scale,y:box.y+view.y+expected[0].y*view.scale};
 assert.equal(await p.evaluate(q=>document.elementFromPoint(q.x,q.y)?.getAttribute("aria-label"),corner),"Terrain map canvas");
 await p.mouse.click(corner.x-45,corner.y+70);assert.match(await d.innerText(),/14 of 1024 corners\./);
 const beforeDrag=delivered.length;await p.mouse.move(corner.x,corner.y);await p.mouse.down();await p.mouse.move(corner.x-8,corner.y-5,{steps:4});await p.mouse.up();
 await poll(async()=>delivered.length>=beforeDrag+2,"Native drag observation arrives");const moved=delivered.slice(beforeDrag).find(e=>e.kind==="pointerup");assert.ok(moved);expected[0]=observedPoint(moved);
 pass("Move corners selects the nearest point while background clicks add nothing");
 await d.getByRole("button",{name:"Shoreline & properties",exact:true}).click();await d.getByRole("button",{name:"Add island outline",exact:true}).click();
 await d.getByLabel("Drawn lake name",{exact:true}).fill("Synthetic island lake");await d.getByLabel("Drawn lake level (m)",{exact:true}).fill("0");
 await d.getByRole("button",{name:"Preview",exact:true}).click();await d.getByRole("button",{name:"Fit preview",exact:true}).click();await d.getByRole("button",{name:"Add corners",exact:true}).click();
 await c.scrollIntoViewIfNeeded();box=(await c.boundingBox())!;view=await c.evaluate(e=>({x:Number(e.dataset.viewX),y:Number(e.dataset.viewY),scale:Number(e.dataset.zoom)}));
 const firstView=terrainGeometry(terrain.settings);assert.equal(firstView.displayWidth,40075000);
 const holeTargets=[{x:expected[11].x-17.5/view.scale,y:expected[11].y+15/view.scale},{x:expected[11].x-9.5/view.scale,y:expected[11].y+15/view.scale},{x:expected[11].x-14.5/view.scale,y:expected[11].y+25/view.scale}],hole:{x:number;y:number}[]=[];
 for(const q of holeTargets)hole.push(await clickObserved(box.x+view.x+q.x*view.scale,box.y+view.y+q.y*view.scale));
 assert.match(await d.innerText(),/17 of 1024 corners\./);await d.getByRole("button",{name:"Prepare lake preview",exact:true}).click();await d.getByRole("button",{name:"Fit preview",exact:true}).click();
 await poll(()=>d.getByRole("button",{name:"Add lake to water draft",exact:true}).isEnabled(),"Prepared native lake with island becomes reviewable");
 assert.deepEqual((await readWater()).layer,water.layer,"Preparation never saves accepted water");
 await p.screenshot({path:path.join(f.out,"dense-lake-with-island-proposal.png")});await d.getByRole("button",{name:"Add lake to water draft",exact:true}).click();
 assert.deepEqual((await readWater()).layer,water.layer,"Accepting adds only to the water draft");
 const nativeSave=p.waitForRequest(r=>r.method()==="POST"&&new URL(r.url()).pathname.endsWith("/terrain/hydrology"));
 await p.getByRole("button",{name:"Save water changes",exact:true}).click();const nativeRequest=await nativeSave;
 await poll(async()=>(await readWater()).headRevision===water.headRevision+1,"Native water draft saves");
 const saved=await readWater(),lake=saved.layer.lakes?.[0];assert.ok(lake);assert.equal(saved.layer.lakes?.length,1);assert.deepEqual(lake.rings.map(r=>r.length),[14,3]);
 await p.getByText(`Waterways saved at water revision ${saved.headRevision}. Elevation and materials are unchanged.`,{exact:true}).waitFor({state:"attached"});
 const samePoints=(actual:{x:number;y:number}[],wanted:{x:number;y:number}[])=>{assert.equal(actual.length,wanted.length);actual.forEach((q,i)=>{assert.ok(Math.abs(q.x-wanted[i].x)<.25,"Native east coordinate "+i);assert.ok(Math.abs(q.y-wanted[i].y)<.25,"Native south coordinate "+i);});};
 await writeFile(path.join(f.out,"saved-native-corner-comparison.json"),JSON.stringify({actual:lake.rings,expected:[expected,hole]},null,2));
 samePoints(lake.rings[0],expected);samePoints(lake.rings[1],hole);assert.equal(hash(await readTerrain()),terrainHash);assert.equal((await readTerrain()).revision,terrain.revision);
 const writer=nativeRequest.headers();assert.ok(writer["x-world-editor"]);
 const obsolete=await context.request.post(`${b.base}/api/worlds/${worldId}/terrain/hydrology`,{headers:{Origin:b.base,"X-World-Editor":writer["x-world-editor"],"X-World-Actor":writer["x-world-actor"]},data:{mapId,revision:saved.headRevision,requestId:randomUUID(),layer:water.layer}});
 assert.equal(obsolete.status(),409);assert.match(await obsolete.text(),/older writer/);assert.deepEqual((await readWater()).layer,saved.layer);
 pass("outer shoreline, exact moved point and separate island hole save through native water controls without changing terrain");
 await openWater();await p.getByRole("button",{name:"Rivers, sources & connections",exact:true}).click();
 await writeFile(path.join(f.out,"before-water-history.txt"),await p.locator("body").innerText());
 await p.getByRole("button",{name:"Undo change",exact:true}).click();await p.getByRole("button",{name:"Save water changes",exact:true}).click();await poll(async()=>(await readWater()).headRevision===saved.headRevision+1,"Water Undo saves");assert.deepEqual((await readWater()).layer,{...water.layer,systemVersion:saved.layer.systemVersion});
 await p.getByText(`Waterways saved at water revision ${saved.headRevision+1}. Elevation and materials are unchanged.`,{exact:true}).waitFor({state:"attached"});
 await p.getByRole("button",{name:"Redo change",exact:true}).click();await p.getByRole("button",{name:"Save water changes",exact:true}).click();await poll(async()=>(await readWater()).headRevision===saved.headRevision+2,"Water Redo saves");assert.deepEqual((await readWater()).layer,saved.layer);
 pass("native water Undo and Redo preserve exact lake identity and every outline");
 await p.goto(rootUrl);await p.getByRole("region",{name:"Heightmap editor",exact:true}).waitFor();await openWater();assert.deepEqual((await readWater()).layer,saved.layer);assert.equal(hash(await readTerrain()),terrainHash);
 await p.getByRole("button",{name:"Lake shoreline workshop",exact:true}).click();const cancelled=p.getByRole("dialog",{name:"Lake shoreline workshop",exact:true});await cancelled.getByRole("button",{name:"Cancel",exact:true}).click();assert.deepEqual((await readWater()).layer,saved.layer);
 pass("same World reopens with saved water intact and cancelled workshops preserve accepted geography");

 await openWater();await p.getByRole("button",{name:"Lake shoreline workshop",exact:true}).click();
 const budget=p.getByRole("dialog",{name:"Lake shoreline workshop",exact:true});
 await budget.getByLabel("Drawn lake name",{exact:true}).fill("Synthetic 300-corner lake");await budget.getByLabel("Drawn lake level (m)",{exact:true}).fill("0");
 await budget.getByRole("button",{name:"Preview",exact:true}).click();const budgetCanvas=budget.getByLabel("Terrain map canvas",{exact:true});await budgetCanvas.scrollIntoViewIfNeeded();
 await poll(async()=>Number(await budgetCanvas.getAttribute("data-zoom"))>0&&await budgetCanvas.getAttribute("data-render-pending")==="0","Budget lake preview ready");
 await budget.getByRole("button",{name:"Add corners",exact:true}).click();
 await budgetCanvas.scrollIntoViewIfNeeded();
 const visible=await budgetCanvas.evaluate(e=>{const r=e.getBoundingClientRect(),a={left:Math.max(0,r.left),top:Math.max(0,r.top),right:Math.min(innerWidth,r.right),bottom:Math.min(innerHeight,r.bottom)};for(let n=e.parentElement;n;n=n.parentElement){const style=getComputedStyle(n),b=n.getBoundingClientRect();if(/(auto|scroll|hidden|clip)/.test(style.overflowX)){a.left=Math.max(a.left,b.left);a.right=Math.min(a.right,b.right);}if(/(auto|scroll|hidden|clip)/.test(style.overflowY)){a.top=Math.max(a.top,b.top);a.bottom=Math.min(a.bottom,b.bottom);}}return a;});
 await p.evaluate("(()=>{const canvas=document.querySelector('dialog canvas');const record=event=>{const r=canvas.getBoundingClientRect();void window.captureSyntheticLakePointer({kind:event.type,x:event.clientX,y:event.clientY,left:r.left,top:r.top,viewX:Number(canvas.dataset.viewX),viewY:Number(canvas.dataset.viewY),scale:Number(canvas.dataset.zoom)});};canvas.addEventListener('pointerdown',record);canvas.addEventListener('pointerup',record);})()");
 const radius=Math.min(visible.right-visible.left,visible.bottom-visible.top)*.3,budgetExpected:{x:number;y:number}[]=[];
 for(let i=0;i<300;i++){const a=i/300*Math.PI*2;budgetExpected.push(await clickObserved(visible.left+(visible.right-visible.left)*.78+Math.cos(a)*radius,(visible.top+visible.bottom)/2+Math.sin(a)*radius));}
 const budgetCount=Number((await budget.innerText()).match(/(\d+) of 1024 corners\./)?.[1]);
 await p.screenshot({path:path.join(f.out,"300-corner-lake-native-preview.png")});
 if(process.env.SERRIAN_LAKE_BUDGET_BASELINE==="1"){
  assert.equal(budgetCount,256,"Unchanged canvas reproduces the hidden 256-corner clamp");await budget.getByRole("button",{name:"Cancel",exact:true}).click();assert.deepEqual((await readWater()).layer,saved.layer);assert.equal(hash(await readTerrain()),terrainHash);
  await writeFile(path.join(f.out,"lake-budget-baseline.json"),JSON.stringify({reproduced:true,intendedCorners:300,actualCorners:budgetCount,acceptedWaterAndTerrainUnchanged:true,sourceHash:b.sourceHash,buildId:b.buildId,ownerEnvironmentAccessed:false},null,2));return;
 }
 assert.equal(budgetCount,300);await budget.getByRole("button",{name:"Prepare lake preview",exact:true}).click();await poll(()=>budget.getByRole("button",{name:"Add lake to water draft",exact:true}).isEnabled(),"300-corner lake prepares");
 const beforeBudgetSave=await readWater();await budget.getByRole("button",{name:"Add lake to water draft",exact:true}).click();assert.deepEqual((await readWater()).layer,beforeBudgetSave.layer);await p.getByRole("button",{name:"Save water changes",exact:true}).click();await poll(async()=>(await readWater()).headRevision===beforeBudgetSave.headRevision+1,"300-corner lake saves");
 const afterBudget=await readWater(),largeLake=afterBudget.layer.lakes!.find(l=>l.name==="Synthetic 300-corner lake")!;assert.ok(largeLake);assert.equal(largeLake.rings[0].length,300);samePoints(largeLake.rings[0],budgetExpected);assert.deepEqual(afterBudget.layer.lakes!.find(l=>l.id===lake.id),lake);assert.equal(hash(await readTerrain()),terrainHash);
 await p.goto(rootUrl);await p.getByRole("region",{name:"Heightmap editor",exact:true}).waitFor();assert.deepEqual((await readWater()).layer,afterBudget.layer);pass("explicit lake budget retains, saves and reopens 300 native corners while preserving prior lake and terrain");

 assert.deepEqual(errors,[]);await writeFile(path.join(f.out,"lake-authoring-result.json"),JSON.stringify({passed:true,groups,sourceHash:b.sourceHash,buildId:b.buildId,worldId,mapId,waterRevision:(await readWater()).headRevision,terrainHash,errors,ownerEnvironmentAccessed:false,externalGeometryUsed:false},null,2));
})).catch(e=>{console.error(e);process.exitCode=1;});
