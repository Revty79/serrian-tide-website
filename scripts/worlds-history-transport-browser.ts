import {claimOwnedWorldPage} from "./worlds-owned-world-api";
import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import type {BrowserContext} from "playwright-core";
import type {RegionalFixture} from "./worlds-regional-editing-fixture";

/** Real native condition form, failed acknowledgement, browser reload, exact
 * server receipt recovery. Storage inspection does not submit a command. */
export async function historicalTransportBrowser({f,context,base,sourceHash}:{f:RegionalFixture;context:BrowserContext;base:string;sourceHash:string}){
  const map=(await f.pool.query("select id from world_atlas_map where world_id=$1 and name='Historical numerical World'",[f.world])).rows[0].id as string;
  const page=await context.newPage();await page.setViewportSize({width:1440,height:1000});
  const url=`${base}/worlds/${f.world}?tab=atlas&terrainMap=${map}&atlasYear=100&atlasEditing=1`;
  const collaboration=!!(await f.pool.query("select to_regclass('public.world_access_participant') is not null ok")).rows[0].ok,actor=(await(await context.request.get(base+"/api/auth/get-session")).json()).user.id as string,accountPrefix=collaboration?`st:world-account:${encodeURIComponent(actor)}:`:"",databaseName="serrian-native-original-requests-v1"+(collaboration?":account:"+encodeURIComponent(actor):"");
  let originalId="",originalScope:unknown,originalBody:unknown,intercepted=false;
  const routePattern=`**/api/worlds/${f.world}/atlas-history/conditions?**`;
  try{
    await page.goto(url,{waitUntil:"networkidle"});if(collaboration)await claimOwnedWorldPage(page,base);await page.getByLabel("Terrain map canvas",{exact:true}).waitFor();
    async function open(){const buttons=page.getByRole("button",{name:"History / Era",exact:true});for(let i=0;i<await buttons.count();i++)if(await buttons.nth(i).isVisible()){await buttons.nth(i).click();return;}throw Error("Historical controls must be visible");}
    await open();const dialog=page.getByRole("dialog",{name:"History / Era",exact:true});await dialog.getByText("Historical conditions",{exact:true}).click();
    await dialog.getByLabel("Historical condition object",{exact:true}).selectOption(map);
    await dialog.getByLabel("Historical condition",{exact:true}).selectOption("present");
    await dialog.getByLabel("Historical condition account",{exact:true}).fill("Original request retained after an uncertain acknowledgement.");
    await page.route(routePattern,async route=>{
      if(route.request().method()!=="POST"||intercepted){await route.continue();return;}
      intercepted=true;originalBody=route.request().postDataJSON();originalId=(originalBody as {requestId:string}).requestId;
      originalScope=JSON.parse(new URL(route.request().url()).searchParams.get("historicalAtlas")!);
      const response=await route.fetch();assert.equal(response.status(),200);await route.abort("failed");
    });
    await dialog.getByRole("button",{name:"Save Historical Condition",exact:true}).click();
    await dialog.getByRole("button",{name:"Retry Original Condition Request",exact:true}).waitFor();
    await dialog.getByRole("alert").filter({hasText:"Retry sends the same condition request"}).waitFor();assert.ok(intercepted);
    const count=async()=>Number((await f.pool.query("select count(*)::int n from world_map_state_native_request where request_id=$1",[originalId])).rows[0].n);
    assert.equal(await count(),1);
    const packet=await page.evaluate(async ({id,databaseName})=>{
      const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open(databaseName,1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
      try{return await new Promise<unknown>((resolve,reject)=>{const transaction=db.transaction("packets","readonly"),request=transaction.objectStore("packets").get(id);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}finally{db.close();}
    },{id:originalId,databaseName}) as {scope:unknown;body:string};
    assert.deepEqual(JSON.parse(JSON.stringify(packet.scope)),originalScope);assert.deepEqual(JSON.parse(packet.body),originalBody);
    const originals=dialog.getByLabel("Original historical save requests",{exact:true});await originals.locator("summary").click();
    const [download]=await Promise.all([page.waitForEvent("download"),originals.getByRole("button",{name:"Export Original Request",exact:true}).click()]);
    await download.saveAs(path.join(f.out,"exported-original-condition-request.json"));
    await page.unroute(routePattern);
    // Simulate the narrow crash window: transport ACK cleanup completed, but
    // the domain's retained original request had not yet been retired.
    await page.evaluate(async ({id,databaseName,accountPrefix})=>{
      localStorage.removeItem(accountPrefix+"st:native-original-scope:v1:"+id);
      const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open(databaseName,1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
      try{await new Promise<void>((resolve,reject)=>{const transaction=db.transaction(["packets","metadata"],"readwrite");transaction.objectStore("packets").delete(id);transaction.objectStore("metadata").delete(id);transaction.oncomplete=()=>resolve();transaction.onabort=()=>reject(transaction.error);});}finally{db.close();}
    },{id:originalId,databaseName,accountPrefix});
    page.on("dialog",dialog=>void dialog.accept());await page.reload({waitUntil:"networkidle"});if(collaboration)await claimOwnedWorldPage(page,base);await page.getByLabel("Terrain map canvas",{exact:true}).waitFor();await open();
    const recovered=page.getByRole("dialog",{name:"History / Era",exact:true});await recovered.getByText("Historical conditions",{exact:true}).click();
    assert.equal(await recovered.getByLabel("Historical condition account",{exact:true}).inputValue(),"Original request retained after an uncertain acknowledgement.");
    const receipt=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/worlds/${f.world}/atlas-history/request`);
    void receipt.catch(()=>{});
    const accepted=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/worlds/${f.world}/atlas-history/conditions`&&response.request().method()==="POST");
    void accepted.catch(()=>{});
    await recovered.getByRole("button",{name:"Retry Original Condition Request",exact:true}).click();
    const [scopeResponse,retryResponse]=await Promise.all([receipt,accepted]);assert.equal(scopeResponse.status(),200);assert.equal(retryResponse.status(),200);
    assert.deepEqual(retryResponse.request().postDataJSON(),originalBody);assert.deepEqual(JSON.parse(new URL(retryResponse.url()).searchParams.get("historicalAtlas")!),originalScope);
    await recovered.getByLabel("Historical condition object",{exact:true}).waitFor();assert.equal(await count(),1);
    await page.screenshot({path:path.join(f.out,"historical-original-request-recovered.png")});
    await writeFile(path.join(f.out,"historical-transport-browser.json"),JSON.stringify({passed:true,sourceHash,realNativeConditionForm:true,serverSavedBeforeLostAcknowledgement:true,boundedOriginalPacketStoredBeforeWrite:true,actualExport:true,reloadRetainsOriginalDomainDraft:true,serverOriginalScopeRecoversAckCleanupCrash:true,exactCommandScopeAndSingleServerReceipt:true,sharedDatabaseAccess:false},null,2));
  }catch(error){await page.screenshot({path:path.join(f.out,"historical-transport-failure.png")}).catch(()=>{});await writeFile(path.join(f.out,"historical-transport-failure.txt"),await page.locator("body").innerText().catch(()=>""));throw error;}
  finally{await page.close();}
}
