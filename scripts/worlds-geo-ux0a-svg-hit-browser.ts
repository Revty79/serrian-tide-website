/** Saved mixed-v1/v2 selection, strict legacy SVGPoint contract, and unavailable-API fallback.
 * All fixture writes use existing services on a newly owned empty clone. Never uses owner DEV.
 */
import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {freshIslandEnvironment,ownedPool,UX0A_DIRECTORY,type Environment} from "./worlds-geo-ux0a-harness";
import {islandRuntime} from "./worlds-geo-ux0a-runtime";
import {draftOf} from "../src/features/worlds/atlas";
import {assetReference,latestIslandAssets} from "../src/features/worlds/island-assets";
import {defaultPresentation,terrainMarks,type MapDrawing} from "../src/features/worlds/cartography";
import {assetTerrainMarks} from "../src/features/worlds/island-asset-scene";
import {openStudioSection} from "./worlds-studio-test-tools";

type Fixture={environment:Environment;world:string;timeline:string;maps:{id:string;framed:boolean;modern:boolean;drawings:MapDrawing[]}[]};
const receipt=path.join(UX0A_DIRECTORY,"svg-hit-fixture.json"),before=process.argv.includes("--before"),captureOnly=process.argv.includes("--capture-only"),output=path.join(UX0A_DIRECTORY,"performance-investigation",before?"svg-hit-before":captureOnly?"svg-hit-city":"svg-hit-after");
async function setup(){
 const environment=await freshIslandEnvironment("acceptance");process.env.DATABASE_URL=environment.empty;
 const [w,a,g,states,db]=await Promise.all([import("../src/features/worlds/world-service"),import("../src/features/worlds/atlas-service"),import("../src/features/worlds/geographic-service"),import("../src/features/worlds/map-state-service"),import("../src/db")]);
 try{
  const owner=environment.users.owner,world=await w.createWorld(owner,{name:"Disposable SVG point compatibility regression"}),timeline=(await w.getWorld(owner,world)).selectedTimeline.id,fixture:Fixture={environment,world,timeline,maps:[]};
  for(const modern of [false,true])for(const framed of [false,true]){
   const id=await a.changeAtlas(owner,world,{action:"create",name:`${modern?"Modern":"Legacy"} ${framed?"framed":"normal"} hit-test fixture`,description:"Technical compatibility fixture, not canon or visual acceptance",scope:"regional",...modern?{style:"island-ink-wash"}:{}}) as string;
   const bundle=await a.getAtlas(owner,world),map=bundle.maps.find(m=>m.id===id)!,draft=draftOf(map,bundle.geographies),land=randomUUID(),city=randomUUID(),port=randomUUID();
   draft.presentation=modern?draft.presentation:defaultPresentation();
   draft.geographies=[{id:land,revision:null,name:"Underlying retained land",description:"",kind:"island",parentId:null},...[city,port].map((id,i)=>({id,revision:null,name:i?"Legacy port":"Legacy city",description:"",kind:"location" as const,context:"settlement" as const,parentId:land}))];
   draft.features=[{id:randomUUID(),geographyId:land,archived:false,geometry:{version:1,type:"polygon",points:[[200,180],[1800,180],[1800,1040],[200,1040]].map(([x,y])=>({id:randomUUID(),x,y}))}}];
   const common=()=>({version:1 as const,id:randomUUID(),archived:false,geographyId:null}),mountain=latestIslandAssets.find(a=>a.id==="mountain-rounded")!,grove=latestIslandAssets.find(a=>a.id==="woodland-broadleaf-grove")!;
   const drawings:MapDrawing[]=[
    {...common(),geographyId:city,type:"symbol",name:"Legacy filled city",kind:"city",point:{x:520,y:470},scale:3,rotation:23,style:"colored"},
    {...common(),geographyId:port,type:"symbol",name:"Legacy curved port",kind:"port",point:{x:850,y:470},scale:3,rotation:-17,style:"colored"},
    {...common(),type:"terrain",name:"Legacy forest group",kind:"forest",points:[{id:randomUUID(),x:470,y:800},{id:randomUUID(),x:680,y:800}],radius:85,spacing:100,density:1,seed:47},
    {...common(),version:2,type:"symbol",name:"Pinned mountain",kind:"mountain",role:"decoration",assetRef:assetReference(mountain),point:{x:1430,y:550},scale:.6,rotation:-18,style:"colored"},
    {...common(),version:2,type:"terrain",name:"Pinned painted grove",kind:"forest",assetRefs:[assetReference(grove)],points:[{id:randomUUID(),x:1150,y:840}],radius:95,spacing:100,density:1,seed:23},
    {...common(),type:"label",name:"Wide saved label",text:"Wide saved label",point:{x:850,y:290},size:44,rotation:8,style:"place"},
    {...common(),type:"path",name:"Saved curved river",kind:"river",points:[[1120,400],[1070,550],[1200,660]].map(([x,y])=>({id:randomUUID(),x,y})),width:8,curve:.8},
   ];draft.drawings=drawings;await a.changeAtlas(owner,world,{action:"save",id,revision:map.revision,draft});
   if(framed){
    const reference={version:1 as const,kind:"plane" as const,crs:`AUTHORED:${randomUUID()}`,units:"fixture units",bounds:[0,0,2000,1200] as [number,number,number,number]},surface=await g.changeGeography(owner,world,{action:"surface",requestId:randomUUID(),timelineId:timeline,name:`Hit-test surface ${modern}`,reference,realmId:null,protected:false});
    const records=[{externalId:"land",name:"Fixture source land",semantic:"authored-geography",geometry:{type:"Polygon",coordinates:[[[200,160],[1800,160],[1800,1020],[200,1020],[200,160]]]},protected:false}];
    await g.changeGeography(owner,world,{action:"import",timelineId:timeline,mapId:id,surfaceId:surface.id,source:{version:1,provenance:{provider:"Original disposable regression",dataset:`SVG compatibility ${modern}`,edition:"1",sourceUrl:"https://example.invalid/test",license:"Original test fixture",licenseUrl:"https://example.invalid/license",attribution:"Original fixture",attributionRequired:false,fileSha256:createHash("sha256").update(JSON.stringify(records)).digest("hex"),originalCrs:reference.crs,parameters:"SVG point compatibility only",display:{lods:["overview","regional","detail"],priority:100,style:"land",exact:true,theme:"authored",labels:false,labelRank:1}},records}});
   }
   const saved=(await a.getAtlas(owner,world)).maps.find(m=>m.id===id)!;
   await states.changeMapState(owner,world,{action:"create",mapId:id,timelineId:timeline,sourceVersionId:null,baselineRevision:saved.revision,details:{name:"Retained regression appearance",startYear:0,endYear:20,account:"Original disposable fixture",protected:false}});
   fixture.maps.push({id,framed,modern,drawings});
  }
  await writeFile(receipt,JSON.stringify(fixture,null,2));console.log("PASS newly owned mixed-version saved maps and immutable history fixture; no migrations run");
 }finally{await db.pool.end();}
}

async function main(){
 if(process.argv.includes("--setup"))return setup();
 await mkdir(output,{recursive:true});const f=JSON.parse(await readFile(receipt,"utf8")) as Fixture,r=await islandRuntime("empty","svg-hit",f.environment),pool=await ownedPool(f.environment,"empty"),results:unknown[]=[];
 try{
  const protectedRows=async()=>({versions:(await pool.query("select id,to_jsonb(v)::text body from world_geo_version v order by id")).rows,history:(await pool.query("select id,payload from world_map_state_version order by id")).rows,migrations:(await pool.query("select hash from drizzle.__drizzle_migrations order by id")).rows});
  const protectedBefore=await protectedRows();assert.ok(protectedBefore.history.length>=4);
  const auth=await r.browser.newContext();await r.login(auth);const storageState=await auth.storageState();await auth.close();
  const selectedMode=process.argv.find(arg=>arg.startsWith("--mode="))?.slice(7);
  for(const mode of (before?["native","strict"]:["native","strict","unavailable"]).filter(mode=>!selectedMode||mode===selectedMode))for(const touch of before?[false]:[false,true])for(const map of before||captureOnly?f.maps.slice(0,1):f.maps){
   const c=await r.browser.newContext({storageState,viewport:touch?{width:390,height:844}:{width:1440,height:1000},hasTouch:touch,isMobile:touch});const p=await c.newPage(),errors:string[]=[],writes:string[]=[];p.setDefaultTimeout(30000);p.on("pageerror",e=>errors.push(e.message));p.on("dialog",d=>void d.accept());p.on("request",req=>{if(req.method()!=="GET"&&req.url().includes("/api/worlds/"))writes.push(new URL(req.url()).pathname);});
   // Chromium 154 accepts DOMPoint natively. Strict mode exercises the older native
   // SVGPoint contract reported by the owner; it is explicitly compatibility fault injection.
   if(mode!=="native")await p.addInitScript(mode=>{
    for(const name of ["isPointInFill","isPointInStroke"] as const){const native=SVGGeometryElement.prototype[name];if(mode==="unavailable"){Object.defineProperty(SVGGeometryElement.prototype,name,{configurable:true,value:undefined});continue;}SVGGeometryElement.prototype[name]=function(point){if(point?.constructor.name!=="SVGPoint")throw new TypeError(`Failed to execute '${name}' on 'SVGGeometryElement': parameter 1 is not of type 'SVGPoint'.`);return native.call(this,point);};}
   },mode);
   const url=`${r.base}/worlds/${f.world}?tab=atlas&timeline=${f.timeline}&editMap=${map.id}`,canvas=p.getByRole("application",{name:"Editable map canvas"}),bar=p.getByLabel("Map navigation",{exact:true});
   await p.goto(url);await canvas.locator('[data-cartography-scene][data-artwork-ready="true"]').first().waitFor();if(map.framed){await canvas.locator('[data-map-background="fictional-water"]').first().waitFor({state:"attached"});if(map.modern)await canvas.locator('[data-geographic-land-mask="ready"]').waitFor({state:"attached"});}
   const close=async()=>{const b=p.getByRole("button",{name:"Close tool settings",exact:true});if(await b.isVisible())await b.click();};await close();
   const tap=async(q:{x:number;y:number})=>{if(touch)await p.touchscreen.tap(q.x,q.y);else await p.mouse.click(q.x,q.y);};
   const selected=async(d:MapDrawing)=>{assert.equal(await canvas.locator(`[data-drawing="${d.id}"]`).getAttribute("data-selected"),"true",`${mode} ${touch} ${d.name}`);assert.equal(await canvas.locator('[data-feature][data-selected="true"]').count(),0);};
   const point=async(d:MapDrawing,local:{x:number;y:number})=>canvas.locator(`[data-drawing="${d.id}"] g[transform]`).first().evaluate((node,q)=>{const p=new DOMPoint(q.x,q.y).matrixTransform((node as SVGGElement).getScreenCTM()!);return {x:p.x,y:p.y};},local);
   const city=map.drawings[0];await bar.getByRole("button",{name:"Select",exact:true}).click();await tap(await point(city,{x:-16,y:7}));
   if(before){await p.waitForTimeout(100);results.push({mode,nativeOwnerExceptionReproduced:mode==="native"&&errors.some(e=>e.includes("SVGPoint")),strictContractExceptionReproduced:mode==="strict"&&errors.some(e=>e.includes("SVGPoint")),errors,selectedId:await canvas.locator('[data-drawing][data-selected="true"]').first().getAttribute("data-drawing").catch(()=>null)});await p.screenshot({path:path.join(output,`${mode}.png`)});await c.close();continue;}
   if(mode==="unavailable"){
    await p.getByRole("status").filter({hasText:"Use Items to select safely"}).waitFor();assert.equal(await canvas.locator('[data-selected="true"]').count(),0);await bar.getByRole("button",{name:"Items",exact:true}).click();const items=p.getByRole("region",{name:"Map items",exact:true});await items.waitFor();await p.getByLabel("Find an item",{exact:true}).fill(city.name);await items.getByRole("button",{name:/^Select /}).first().click();await selected(city);assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);results.push({mode,touch,modern:map.modern,framed:map.framed,passed:true,itemsFallback:true,noFalseSelection:true,noWrites:true});await p.getByRole("region",{name:"Map Studio",exact:true}).screenshot({path:path.join(output,`fallback-${map.modern}-${map.framed}-${touch}.png`)});await c.close();continue;
   }
   await selected(city);await canvas.locator(`[data-drawing="${city.id}"] [data-selection-highlight]`).waitFor({state:"attached"});
   if(captureOnly){assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);await p.getByRole("region",{name:"Map Studio",exact:true}).screenshot({path:path.join(output,`city-${touch?"touch":"desktop"}.png`)});results.push({mode,touch,cityId:city.id,selectedDrawingId:city.id,highlight:true,pageErrors:0,contentWrites:0});await c.close();continue;}
   const hills=map.drawings[1];await tap(await point(hills,{x:0,y:-18}));await selected(hills);
   // Sample a curved stroke away from its anchor, then outside the ink within the touch/mouse halo.
   const hillPath=canvas.locator(`[data-drawing="${hills.id}"] path`).first();const curve=await hillPath.evaluate(node=>{const path=node as SVGPathElement,q=path.getPointAtLength(path.getTotalLength()*.45),p=new DOMPoint(q.x,q.y).matrixTransform(path.getScreenCTM()!);return {x:p.x,y:p.y};});await tap(curve);await selected(hills);await tap({x:curve.x,y:curve.y+(touch?8:2)});await selected(hills);
   const mountain=map.drawings[3];await tap(await point(mountain,{x:14,y:-150}));await selected(mountain);
   const label=map.drawings[5],labelInk=await canvas.locator(`[data-drawing="${label.id}"] text`).evaluate(node=>{const box=node.getBoundingClientRect();return {x:box.x+box.width*.8,y:box.y+box.height*.55};});await tap(labelInk);await selected(label);
   const river=map.drawings[6],riverInk=await canvas.locator(`[data-drawing="${river.id}"] path:not([data-export-omit])`).first().evaluate(node=>{const path=node as SVGPathElement,q=path.getPointAtLength(path.getTotalLength()*.7),p=new DOMPoint(q.x,q.y).matrixTransform(path.getScreenCTM()!);return {x:p.x,y:p.y};});await tap(riverInk);await selected(river);
   for(const index of [2,4]){
    const drawing=map.drawings[index];assert.equal(drawing.type,"terrain");const terrain=drawing as Extract<MapDrawing,{type:"terrain"}>,mark=terrain.version===1?terrainMarks(terrain)[0]:assetTerrainMarks(terrain)[0];
    // The Items choice reveals retained vectors even when the initial display uses a cache.
    await bar.getByRole("button",{name:"Items",exact:true}).click();await p.getByLabel("Find an item",{exact:true}).fill(drawing.name);await p.getByRole("region",{name:"Map items",exact:true}).getByRole("button",{name:/^Select /}).first().click();
    const use=canvas.locator(`[data-drawing="${drawing.id}"] use[data-terrain-mark]`).first();const ink=await use.evaluate((node,version)=>{const q=version===1?{x:0,y:0}:{x:0,y:-30},p=new DOMPoint(q.x,q.y).matrixTransform((node as SVGGraphicsElement).getScreenCTM()!);return {x:p.x,y:p.y};},terrain.version);assert.ok(mark);
    await bar.getByRole("button",{name:"Select",exact:true}).click();await tap(await point(city,{x:-16,y:7}));await selected(city);await tap(ink);await selected(drawing);
   }
   // The separate selection-guards journey tests clicks outside a retained legacy clip.
   await p.getByRole("region",{name:"Map Studio",exact:true}).screenshot({path:path.join(output,`${mode}-${map.modern}-${map.framed}-${touch}.png`)});
   // A normal UI save/reopen preserves all drawing/source IDs and the immutable appearance.
   await openStudioSection(p,"Artwork");const info=p.locator("summary").filter({hasText:/^Map information$/});if(!await info.evaluate(node=>node.parentElement!.hasAttribute("open")))await info.click();await p.getByLabel("Map description",{exact:true}).fill(`Compatibility checked ${mode} ${touch}`);await p.getByRole("button",{name:"Apply map information",exact:true}).click();await close();await bar.getByRole("button",{name:"Save map",exact:true}).click();await p.getByRole("status").filter({hasText:"Map saved."}).waitFor();await p.reload();await canvas.locator('[data-cartography-scene][data-artwork-ready="true"]').first().waitFor();await close();await tap(await point(city,{x:-16,y:7}));await selected(city);assert.deepEqual(errors,[]);
   const saved=(await pool.query("select id,content from world_atlas_drawing where map_id=$1 order by id",[map.id])).rows;assert.deepEqual(saved.map(row=>row.id),map.drawings.map(d=>d.id).sort());for(const row of saved)assert.deepEqual(row.content,map.drawings.find(d=>d.id===row.id));
   results.push({mode,touch,modern:map.modern,framed:map.framed,passed:true,legacyFillStrokeOffsets:true,pinnedStampAndBothPaintGroups:true,labelsCurvedPaths:true,correctSelectionHighlight:true,savedReopened:true,drawingsExact:true,errors});await c.close();console.log(`PASS SVG hit ${mode} modern=${map.modern} framed=${map.framed} touch=${touch}`);
  }
  assert.deepEqual(await protectedRows(),protectedBefore);
  if(before)assert.ok(results.some(row=>(row as {strictContractExceptionReproduced?:boolean}).strictContractExceptionReproduced));
  await writeFile(path.join(output,"results.json"),JSON.stringify({passed:true,before,captureOnly,filtered:!!selectedMode,ownerNativeBrowserReproduction:false,strictContractFaultInjection:true,browser:r.browser.version(),runtime:process.env.SERRIAN_UX0A_CHECKOUT??"runtime-checkout",physicalDevice:false,immutableAppearancesExact:true,sourceVersionsExact:true,migrationLedgerExact:true,results},null,2));
 }catch(error){await writeFile(path.join(output,"failure.txt"),String(error));throw error;}finally{await pool.end();await r.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
