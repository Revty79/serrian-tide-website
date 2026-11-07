import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {withCollaborationResources} from "./worlds-collaboration-resource-fixture";
import {withCollaborationBrowser} from "./worlds-collaboration-browser-fixture";
import {attachOwnedBrowserApi} from "./worlds-owned-world-api";
import {emptyTown} from "../src/features/worlds/world-towns";
import {emptyTownDesign,townFeature} from "../src/features/worlds/town-map";
import type {WorldAtlasDiscovery,WorldAtlasSubject} from "../src/features/worlds/world-atlas-discovery";

withCollaborationResources(async f=>{
  const original=JSON.parse(await readFile(path.join(f.source,"worlds-atlas-integration.json"),"utf8")).fixture as {target:{id:string};townId:string;shopId:string;branchId:string};
  await withCollaborationBrowser(f,async b=>{
    attachOwnedBrowserApi(b.browser,b.base,[]);const context=await b.login("collab-owner-a"),api=`/api/worlds/${f.worldA}`,errors:string[]=[],journeys:unknown[]=[];
    async function post<T>(endpoint:string,data:unknown):Promise<T>{const r=await context.request.post(b.base+api+endpoint,{headers:{Origin:b.base},data});assert.equal(r.status(),200,await r.text());return r.json();}
    const second=await post<{townId:string}>("/towns",{action:"save",requestId:randomUUID(),id:null,revision:null,geographyRevision:null,draft:{...emptyTown,name:"Second checkpoint branch Town"}});
    const location=await post<{id:string}>("/business",{action:"save-location",requestId:randomUUID(),id:null,revision:null,shopId:original.shopId,townId:second.townId,placeId:null,note:"Actual second-Town branch",sortOrder:1});
    const marker=await post<{placementId:string;placementRevision:number}>("/towns",{action:"place",requestId:randomUUID(),mapId:original.target.id,townId:second.townId,revision:null,x:30000,y:30000});
    const firstPlacement=(await f.pool.query("select id,revision,x_metres x,y_metres y from world_map_place where world_id=$1 and map_id=$2 and geography_id=$3 and removed_at is null",[f.worldA,original.target.id,original.townId])).rows[0];assert.ok(firstPlacement);
    const plans:{id:string;name:string;townId:string;branchId:string;featureId:string}[]=[];
    for(let i=0;i<3;i++){
      const first=i<2,townId=first?original.townId:second.townId,branchId=first?original.branchId:location.id,placementId=first?firstPlacement.id:marker.placementId,placementRevision=first?firstPlacement.revision:marker.placementRevision,x=first?Number(firstPlacement.x):30000,y=first?Number(firstPlacement.y):30000,id=randomUUID(),featureId=randomUUID(),name=`Checkpoint branch map ${i+1}`;
      await post("/town-maps",{action:"create",requestId:id,townId,sourceMapId:original.target.id,contextMapId:original.target.id,placementId,placementRevision,anchor:{x,y},frame:{x:x-250,y:y-250,width:500,height:500,rotation:0},name,design:emptyTownDesign(),previewToken:null});
      const placeId=(await f.pool.query("select place_id from world_shop_location where world_id=$1 and id=$2",[f.worldA,branchId])).rows[0].place_id as string|null;
      const design=emptyTownDesign();design.features.push({...townFeature("building","area",[{x:200,y:200},{x:240,y:200},{x:240,y:240},{x:200,y:240}],featureId),name:`Saved branch building ${i+1}`,shopLocationId:branchId,placeId});
      await post("/town-maps",{action:"save",requestId:randomUUID(),mapId:id,revision:1,name,design});plans.push({id,name,townId,branchId,featureId});
    }
    async function find(subject:WorldAtlasSubject,year?:number){const query=new URLSearchParams({timeline:f.timelineA,subject:JSON.stringify(subject)});if(year!==undefined)query.set("year",String(year));const r=await context.request.get(b.base+api+"/atlas-discovery?"+query);assert.equal(r.status(),200,await r.text());return r.json() as Promise<WorldAtlasDiscovery>;}
    const all=await find({kind:"shop",id:original.shopId}),town=await find({kind:"town",id:original.townId});
    for(const plan of plans){assert.ok(all.maps.some(map=>map.target.id===plan.id&&map.objectId===plan.featureId));const branch=await find({kind:"shop",id:original.shopId,branchId:plan.branchId});assert.ok(branch.maps.some(map=>map.target.id===plan.id));assert.ok(!branch.maps.some(map=>plans.some(other=>other.branchId!==plan.branchId&&other.id===map.target.id)));}
    assert.ok(plans.slice(0,2).every(plan=>town.maps.some(map=>map.target.id===plan.id)),"One settlement retains both independent map representations");
    for(const year of [-100,0]){const past=await find({kind:"shop",id:original.shopId},year);assert.ok(!past.maps.some(map=>plans.some(plan=>plan.id===map.target.id)&&map.coverage==="established"),"Current-only Shop buildings never acquire an invented historical appearance");}
    for(const device of ["desktop","phone"] as const){
      const c=await b.login("collab-owner-a",device),p=await c.newPage();p.on("pageerror",e=>errors.push(e.message));await p.goto(`${b.base}/worlds/${f.worldA}?tab=towns&townSection=shops&worldRecord=${original.shopId}&timeline=${f.timelineA}`);
      const originalShop=p.locator(`[data-world-record="${original.shopId}"]`);await originalShop.locator("summary").filter({hasText:/^Find in Atlas$/}).first().click();const choices=originalShop.getByRole("region",{name:"Find in Atlas",exact:true});await choices.getByRole("heading",{name:plans[2].name,exact:true}).waitFor();
      for(const plan of plans){
        const [map]=await Promise.all([c.waitForEvent("page"),choices.getByRole("article").filter({has:p.getByRole("heading",{name:plan.name,exact:true})}).getByRole("link",{name:"Show in Atlas",exact:true}).click()]);
        map.on("pageerror",e=>errors.push(e.message));await map.getByLabel("Town Map canvas",{exact:true}).waitFor();assert.equal(new URL(map.url()).searchParams.get("townMap"),plan.id);
        assert.equal(await map.getByText("This World is archived. Restore it in the World registry before editing.",{exact:true}).count(),0,"A read-only lease or grant must not be described as an archived World");
        const related=map.getByRole("button",{name:"Related Worlds Records",exact:true});if(!await related.isVisible())await map.getByRole("region",{name:"Town Map editor",exact:true}).getByRole("button",{name:"Tools",exact:true}).click();await related.click();
        const panel=map.getByRole("dialog",{name:"Related Worlds Records",exact:true}),source=panel.getByRole("link",{name:"Open original World record",exact:true});await source.first().waitFor();
        const links=await source.evaluateAll(nodes=>nodes.map(node=>(node as HTMLAnchorElement).href)),exact=links.find(href=>new URL(href).searchParams.get("worldRecord")===original.shopId);assert.ok(exact,"Every branch map returns to the same original Shop identity");
        const [record]=await Promise.all([c.waitForEvent("page"),panel.locator(`a[href=${JSON.stringify(new URL(exact).pathname+new URL(exact).search)}]`).click()]);await record.waitForLoadState("networkidle");assert.equal(new URL(record.url()).searchParams.get("worldRecord"),original.shopId);assert.equal(new URL(record.url()).searchParams.get("timeline"),f.timelineA);
        const [returned]=await Promise.all([c.waitForEvent("page"),record.getByRole("link",{name:"Return to saved World / Atlas view",exact:true}).click()]);await returned.getByLabel("Town Map canvas",{exact:true}).waitFor();assert.equal(new URL(returned.url()).searchParams.get("townMap"),plan.id);
        journeys.push({device,mapId:plan.id,townId:plan.townId,branchId:plan.branchId,featureId:plan.featureId,shopId:original.shopId,bidirectional:true});await returned.close();await record.close();await map.close();
      }
      await c.close();
    }
    assert.deepEqual(errors,[]);await writeFile(path.join(f.out,"checkpoint-choices.json"),JSON.stringify({passed:true,sourceHash:b.sourceHash,buildId:b.buildId,plans,journeys,currentOnlyYears:[-100,0],allShopChoices:all.maps.length,firstTownChoices:town.maps.length,errors,realAuthentication:true,noSharedAccess:true,physicalDeviceAcceptance:false},null,2));console.log("PASS saved multi-map and multi-Town Shop choices",journeys.length,"journeys");
  });
}).catch(error=>{console.error(error);process.exitCode=1;});
