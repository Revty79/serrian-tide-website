import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import type {BrowserContext} from "playwright-core";
import {withCollaborationResources} from "./worlds-collaboration-resource-fixture";
import {withCollaborationBrowser} from "./worlds-collaboration-browser-fixture";
import {prepareCanonGeographyFixture} from "./worlds-collaboration-canon-geography-fixture";
import {seedNativeNarrative,nativeNarrativeBrowser} from "./worlds-native-history-narrative-browser";
import {attachOwnedBrowserApi,claimOwnedWorldPage} from "./worlds-owned-world-api";
import {chooseTerrainMap,closeTerrainSettings,terrainTool,visibleTerrainPoint} from "./worlds-terrain-browser-ui";
import {createGrid,terrainGeometry,type TerrainDocument} from "../src/features/worlds/terrain";
import type {TownMapDocument} from "../src/features/worlds/town-map";
import {prepareCheckpointRoute} from "./worlds-atlas-checkpoint-route";

/** New saved-relationship coverage beyond the retained Stage 5/6/7 suites.
 * Two private Worlds are created from the same ordinary multi-map Canon source.
 * No production data, authorization shortcuts or fabricated link IDs are used. */
withCollaborationResources(async f=>{
  await seedNativeNarrative(f.regional);
  const fixture=await prepareCanonGeographyFixture(f);
  const groups:string[]=[],journeys:unknown[]=[],copies:{id:string;requestId:string;identities:Map<string,string>}[]=[];let retainedPinsVerified=0;
  await withCollaborationBrowser(f,async b=>{
    attachOwnedBrowserApi(b.browser,b.base,[]);
    const owner=await b.login("collab-owner-a"),admin=await b.login("collab-admin"),player=await b.login("collab-player"),uninvited=await b.login("collab-owner-b"),errors:string[]=[];
    await nativeNarrativeBrowser({f:f.regional,browser:b.browser,context:owner,base:b.base,sourceHash:b.sourceHash});
    const narrative=JSON.parse(await readFile(path.join(f.out,"native-narrative-browser.json"),"utf8")).receipts[0] as {
      fixture:{root:string;region:string;townMap:string;townId:string};
      worldRegionTownInnBasementDungeonReturn500:{groundId:string;basementId:string;dungeonId:string;buildingId:string};
    };
    const privateBuilding=narrative.worldRegionTownInnBasementDungeonReturn500.buildingId;
    let route:{root:string;region:string;townMap:string;townId:string;groundId:string;basementId:string;dungeonId:string;buildingId:string;year:number;x:number;y:number;connectionId?:string}={...narrative.fixture,...narrative.worldRegionTownInnBasementDungeonReturn500,year:500,x:35000,y:50000};
    const hash=(d:TerrainDocument)=>createHash("sha256").update(new Uint8Array(createGrid(d.baseElevation,d.tiles,terrainGeometry(d.settings)).buffer)).digest("hex");
    async function get<T>(context:BrowserContext,url:string,status=200):Promise<T>{const r=await context.request.get(b.base+url);assert.equal(r.status(),status,await r.text());return r.json();}
    async function readTerrain(context:BrowserContext,world:string,map:string){return (await get<{document:TerrainDocument}>(context,`/api/worlds/${world}/terrain?terrainMap=${map}`)).document;}
    async function connected(context:BrowserContext,world:string,identities?:Map<string,string>){
      const id=(source:string)=>identities?.get(source)??source,primary=(await f.pool.query("select id from world_timeline where world_id=$1 and is_primary",[world])).rows[0].id as string;
      const year=route.year;
      const p=await context.newPage();p.on("pageerror",error=>errors.push(error.message));
      p.on("dialog",dialog=>void dialog.dismiss());
      const exact=()=>{const u=new URL(p.url());assert.equal(u.pathname,`/worlds/${world}`);assert.equal(u.searchParams.get("atlasYear"),String(year));assert.equal(u.searchParams.get("timeline")??u.searchParams.get("atlasTimeline"),primary);};
      const nav=p.getByRole("navigation",{name:"World workspace",exact:true});
      await p.goto(`${b.base}/worlds/${world}?tab=overview&terrainMap=${id(route.root)}&timeline=${primary}&atlasYear=${year}`);
      await nav.getByRole("button",{name:"Atlas",exact:true}).click();await p.getByLabel("Terrain map canvas",{exact:true}).waitFor();
      await chooseTerrainMap(p,id(route.region));await p.getByLabel("Terrain map canvas",{exact:true}).waitFor();await closeTerrainSettings(p);
      const marker=await visibleTerrainPoint(p,{x:route.x,y:route.y});await p.mouse.dblclick(marker.x,marker.y);
      const mapName=(await f.pool.query("select name from world_town_map where world_id=$1 and id=$2",[world,id(route.townMap)])).rows[0].name as string;
      await p.waitForFunction(({target,name})=>new URL(location.href).searchParams.get("townMap")===target||Array.from(document.querySelectorAll("button")).some(button=>button.textContent?.startsWith(name)),{target:id(route.townMap),name:mapName});
      if(new URL(p.url()).searchParams.get("townMap")!==id(route.townMap))await p.getByRole("region",{name:"Town map actions",exact:true}).getByRole("button").filter({hasText:mapName}).click();
      await p.waitForURL(u=>u.searchParams.get("townMap")===id(route.townMap));const tc=p.getByLabel("Town Map canvas",{exact:true});await tc.waitFor();exact();
      const head=(await f.pool.query("select h.state_id from world_map_state_head h join world_map_state_version v on v.id=h.version_id where h.world_id=$1 and h.timeline_id=$2 and v.payload#>>'{nativeAtlas,target,id}'=$3 and v.start_year=$4",[world,primary,id(route.townMap),year])).rows[0];assert.ok(head);
      const scope={target:{kind:"town",id:id(route.townMap)},timelineId:primary,stateId:head.state_id,year,edit:false};
      const town=(await get<{document:TownMapDocument}>(context,`/api/worlds/${world}/town-maps?map=${id(route.townMap)}&historicalAtlas=${encodeURIComponent(JSON.stringify(scope))}`)).document;
      const building=town.design.features.find(v=>v.id===id(route.buildingId));assert.ok(building&&building.shape==="area");
      await p.getByRole("region",{name:"Town Map editor",exact:true}).getByRole("button",{name:"Fit map",exact:true}).click();await tc.scrollIntoViewIfNeeded();
      const box=(await tc.boundingBox())!,view=JSON.parse((await tc.getAttribute("data-view"))!),point={x:building.points.reduce((n,q)=>n+q.x,0)/building.points.length,y:building.points.reduce((n,q)=>n+q.y,0)/building.points.length};
      await p.mouse.dblclick(box.x+(point.x-view.left)*view.scale,box.y+(point.y-view.top)*view.scale);
      const fc=p.getByLabel("Building floor canvas",{exact:true});
      await p.getByLabel("Current Floor",{exact:true}).waitFor();await p.getByLabel("Current Floor",{exact:true}).selectOption(id(route.basementId));await fc.waitFor();
      await p.waitForURL(u=>u.searchParams.get("interiorFloor")===id(route.basementId));exact();
      const floor=p.getByRole("region",{name:"Building interior editor",exact:true});
      if(identities&&route.connectionId){
        const head=(await f.pool.query("select h.state_id,h.version_id from world_map_state_head h join world_map_state_version v on v.id=h.version_id where h.world_id=$1 and h.timeline_id=$2 and v.payload#>>'{nativeAtlas,target,id}'=$3 and v.start_year=$4",[world,primary,id(route.basementId),year])).rows[0];assert.ok(head);
        const retained={target:{kind:"floor",id:id(route.basementId)},timelineId:primary,stateId:head.state_id,versionId:head.version_id,year,edit:false};
        const destination=await get<{url:string}>(context,`/api/worlds/${world}/underground?navigate=${id(route.connectionId)}&historicalAtlas=${encodeURIComponent(JSON.stringify(retained))}`);
        assert.ok(new URL(destination.url,b.base).searchParams.has("atlasVersion"),"Retained travel must keep its exact destination source");await p.goto(b.base+destination.url);
      }else{await floor.getByRole("button",{name:"Options",exact:true}).click();await floor.getByRole("button",{name:"Enter Underground Map",exact:true}).click();}
      await p.waitForURL(u=>u.searchParams.get("undergroundLevel")===id(route.dungeonId));await p.getByLabel("Underground map canvas",{exact:true}).waitFor();exact();
      await p.getByRole("region",{name:"Underground map editor",exact:true}).getByRole("button",{name:"Return to Entrance",exact:true}).click();await fc.waitFor();
      await floor.getByRole("button",{name:"Back to Town",exact:true}).click();await tc.waitFor();
      await nav.getByRole("button",{name:"Overview",exact:true}).click();await p.getByRole("form",{name:"World viewing year",exact:true}).waitFor();exact();
      assert.equal(await p.getByRole("form",{name:"World viewing year",exact:true}).getByLabel("World viewing year",{exact:true}).inputValue(),String(year));
      journeys.push({world,primary,route:Object.fromEntries(Object.entries(route).map(([key,value])=>[key,typeof value==="string"?id(value):value])),year,originalWorldOverviewReturn:true,copied:!!identities,viewport:p.viewportSize()});
      await p.screenshot({path:path.join(f.out,`checkpoint-connected-${world}-${year}.png`)});await p.close();
    }
    await connected(owner,f.worldA);groups.push("real saved World/Region/Town/building/interior/underground/original World journey at year500");
    route=await prepareCheckpointRoute(f,owner,b.base,fixture.publicHall);await writeFile(path.join(f.out,"checkpoint-route.json"),JSON.stringify(route,null,2));await connected(owner,f.worldA);
    const published=await admin.request.post(b.base+`/api/admin/worlds/${f.worldA}/canon`,{headers:{Origin:b.base},data:{requestId:randomUUID(),revision:0,isCanon:true,confirm:true,note:"Disposable complete integration checkpoint"}});assert.equal(published.status(),200,await published.text());
    const scoped=(await f.pool.query("select table_name from information_schema.columns where table_schema='public' and column_name='world_id' and table_name<>'world_access_audit' order by table_name")).rows.map(row=>row.table_name as string);
    async function snapshot(){const result:Record<string,string>={};for(const table of scoped)result[table]=createHash("sha256").update(JSON.stringify((await f.pool.query(`select to_jsonb(t)::text v from "${table}" t where world_id=$1 order by to_jsonb(t)::text`,[f.worldA])).rows)).digest("hex");result.world=JSON.stringify((await f.pool.query("select to_jsonb(w) v from world w where id=$1",[f.worldA])).rows);return result;}
    const before=await snapshot(),sourceHash=hash(await readTerrain(player,f.worldA,route.root));
    const catalog=await get<{worlds:{id:string}[]}>(player,"/api/worlds/canon");assert.ok(catalog.worlds.some(world=>world.id===f.worldA));
    for(let i=0;i<2;i++){
      const p=await player.newPage();p.on("pageerror",error=>errors.push(error.message));let packet:{requestId:string}|undefined;
      p.on("request",r=>{if(new URL(r.url()).pathname==="/api/worlds/canon"&&r.method()==="POST")packet=r.postDataJSON();});
      await p.goto(b.base+"/worlds");await p.getByRole("button",{name:"Canon Worlds",exact:true}).click();await p.getByRole("button",{name:"Use as a pattern",exact:true}).click();await p.getByLabel("Personal World name",{exact:true}).fill(`Independent checkpoint variation ${i+1}`);
      await p.getByRole("button",{name:"Create personal World from canon",exact:true}).click();const open=p.getByRole("link",{name:"Open your personal World",exact:true});await open.waitFor({timeout:240000});const id=(await open.getAttribute("href"))!.split("/").at(-1)!;assert.ok(packet);
      const identities=new Map<string,string>((await f.pool.query("select source_id,target_id from world_canon_copy_identity where request_id=$1",[packet.requestId])).rows.map(row=>[row.source_id,row.target_id]));
      for(const [key,source]of Object.entries(route).filter((entry):entry is [string,string]=>typeof entry[1]==="string"))assert.ok(identities.has(source),`Connected ${key} identity must be remapped: ${source}`);
      assert.equal(identities.has(privateBuilding),false,"A protected-history-only building must have no personal identity or binding");
      assert.ok(identities.has(fixture.craftRoute.routeId),"The ordinary strict craft/deck route must also be inherited");
      for(const {payload}of (await f.pool.query("select payload from world_map_state_component where world_id=$1 and kind='connections' and payload ? 'original'",[id])).rows)for(const source of [payload.source,payload.original])for(const key of ["sourceVersionId","destinationVersionId","sourceGeographyVersionId","destinationGeographyVersionId"]){const pin=source[key];if(!pin)continue;assert.equal((await f.pool.query("select exists(select 1 from world_map_state_version where world_id=$1 and id=$2) ok",[id,pin])).rows[0].ok,true,"Every exact retained entrance pin must belong to this independent World");retainedPinsVerified++;}
      copies.push({id,requestId:packet.requestId,identities});assert.equal(hash(await readTerrain(player,id,identities.get(route.root)!)),sourceHash);await p.close();
    }
    assert.notEqual(copies[0].id,copies[1].id);assert.notEqual(copies[0].identities.get(route.root),copies[1].identities.get(route.root));
    for(const copy of copies)await connected(player,copy.id,copy.identities);
    groups.push("two real Player UI variations retain independent remapped maps, floors, entrances and historical connected journeys at year42; protected-only buildings stay excluded");
    const edited:string[]=[];
    for(const [i,copy]of copies.entries()){
      const map=copy.identities.get(route.root)!,p=await player.newPage();await p.goto(`${b.base}/worlds/${copy.id}?tab=atlas&terrainMap=${map}`);await claimOwnedWorldPage(p,b.base);
      await terrainTool(p,"raise");await p.getByLabel(/^Brush strength:/).waitFor();await p.waitForFunction(()=>!document.querySelector<HTMLInputElement>('input[aria-label^="Brush strength:"]')?.disabled);await closeTerrainSettings(p);
      const at=await visibleTerrainPoint(p,{x:45000+i*3000,y:70000}),saving=p.waitForResponse(r=>r.request().method()==="POST"&&new URL(r.url()).pathname===`/api/worlds/${copy.id}/terrain`&&r.request().postDataJSON()?.action==="save");
      await p.mouse.move(at.x,at.y);await p.mouse.down();await p.waitForTimeout(100);await p.mouse.move(at.x+20,at.y+10,{steps:8});await p.mouse.up();const saved=await saving;assert.equal(saved.status(),200,await saved.text());
      edited.push(hash(await readTerrain(player,copy.id,map)));assert.notEqual(edited[i],sourceHash);
      if(i===0)assert.equal(hash(await readTerrain(player,copies[1].id,copies[1].identities.get(route.root)!)),sourceHash);
      else assert.equal(hash(await readTerrain(player,copies[0].id,copies[0].identities.get(route.root)!)),edited[0]);
      await p.reload();await p.getByLabel("Terrain map canvas",{exact:true}).waitFor();assert.equal(hash(await readTerrain(player,copy.id,map)),edited[i]);await p.close();
      await get(uninvited,`/api/worlds/${copy.id}/terrain?terrainMap=${map}`,404);
      await get(player,`/api/worlds/${copy.id}/terrain?terrainMap=${copies[1-i].identities.get(route.root)}`,404);
    }
    assert.deepEqual(await snapshot(),before);assert.equal(hash(await readTerrain(player,f.worldA,route.root)),sourceHash);
    groups.push("native sculpt/save/reload in each variation leaves the other variation and every Canon source table unchanged; foreign-map and uninvited deep links denied");
    const phone=await b.login("collab-player","phone"),pp=await phone.newPage();await pp.goto(`${b.base}/worlds/${copies[0].id}?tab=atlas&terrainMap=${copies[0].identities.get(route.region)}&atlasYear=${route.year}`);const pc=pp.getByLabel("Terrain map canvas",{exact:true});await pc.waitFor();await pc.scrollIntoViewIfNeeded();const phoneHeight=(await pc.boundingBox())!.height;assert.ok(phoneHeight>=400);assert.ok(await pp.evaluate(()=>navigator.maxTouchPoints>0));await pp.screenshot({path:path.join(f.out,"checkpoint-variation-regional-phone.png")});await phone.close();
    assert.deepEqual(errors,[]);await writeFile(path.join(f.out,"integration-checkpoint-browser.json"),JSON.stringify({passed:true,groups,journeys,sourceHash:b.sourceHash,buildId:b.buildId,sourceWorld:f.worldA,sourceTerrainHash:sourceHash,sourceWorldScopedTables:scoped.length,variants:copies.map((copy,i)=>({id:copy.id,requestId:copy.requestId,identityCount:copy.identities.size,editedHash:edited[i]})),retainedPinsVerified,phoneHeight,fixture,errors,realAuthentication:true,headed:true,gpuDisabled:true,noSharedAccess:true,ownerAcceptance:false,physicalDeviceAcceptance:false},null,2));
    console.log("PASS integration checkpoint",groups.length,"groups");
  });
}).catch(error=>{console.error(error);process.exitCode=1;});
