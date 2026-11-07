import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import type {BrowserContext} from "playwright-core";
import type {CollaborationFixture} from "./worlds-collaboration-fixture";
import type {CollaborationBrowser} from "./worlds-collaboration-browser-fixture";
import type {NativeHistoryScope} from "../src/features/worlds/native-map-history";
import {terrainTool,closeTerrainSettings} from "./worlds-terrain-browser-ui";
export type SharedMapCase={name:string;scope:NativeHistoryScope;query:string};
export async function sharedNativeMapBrowser(f:CollaborationFixture,b:CollaborationBrowser,context:BrowserContext,cases:SharedMapCase[],mode:"viewer"|"editor"){
 const page=await context.newPage(),errors:string[]=[],checks:unknown[]=[];page.setDefaultTimeout(30000);page.on("pageerror",error=>errors.push(error.message));page.on("dialog",dialog=>dialog.accept());
 const source=(await f.pool.query("select source_map_id from world_town_map where id=$1",[cases.find(item=>item.scope.target.kind==="town")!.scope.target.id])).rows[0].source_map_id;
 const labels={terrain:"Terrain map canvas",town:"Town Map canvas",floor:"Building floor canvas",underground:"Underground map canvas",craft:"Craft exterior canvas",deck:"Craft deck canvas"};
 const fixtures=JSON.parse(await import("node:fs/promises").then(fs=>fs.readFile(path.join((f as CollaborationFixture&{source:string}).source,"native-floor-creation.json"),"utf8"))).fixture;
 const craft=(await f.pool.query("select craft_id from world_craft_deck where id=$1",[cases.find(item=>item.scope.target.kind==="deck")!.scope.target.id])).rows[0].craft_id;
 try{for(const item of cases){const kind=item.scope.target.kind,target=item.scope.target.id,q=new URLSearchParams({tab:"atlas",terrainMap:kind==="terrain"?target:source,timeline:item.scope.timelineId,atlasYear:String(item.scope.year),atlasState:item.scope.stateId});if(mode==="editor")q.set("atlasEditing","1");if(kind==="town")q.set("townMap",target);if(kind==="floor"){q.set("townMap",fixtures.townMapId);q.set("interiorBuilding",fixtures.featureId);q.set("interiorFloor",target);}if(kind==="underground")q.set("undergroundLevel",target);if(kind==="craft")q.set("craft",target);if(kind==="deck"){q.set("craft",craft);q.set("craftDeck",target);}
  await page.goto(`${b.base}/worlds/${f.worldA}?${q}`,{waitUntil:"networkidle"});const canvas=page.getByLabel(labels[kind],{exact:true});await canvas.waitFor();assert.ok((await canvas.boundingBox())!.height>=400,item.name+" retains the canvas height gate");
  if(mode==="viewer"){for(const name of ["Save terrain","Save Changes","Save Drawing","Create Floor","Create Craft","Create Deck","Create & Open","Generate More Town"]){const buttons=page.getByRole("button",{name,exact:true});for(let index=0;index<await buttons.count();index++)assert.ok(!await buttons.nth(index).isVisible()||await buttons.nth(index).isDisabled(),"Viewer mutation control must be absent or disabled: "+name);}checks.push({kind,viewerCanvas:true,usableSaveActions:false});}
  else{
   const deadline=Date.now()+10000;while(!await page.getByText("You are editing",{exact:true}).isVisible()){await page.getByRole("button",{name:"Check editing status",exact:true}).click();const start=page.getByRole("button",{name:"Start editing",exact:true});if(await start.isVisible())await start.click();assert.ok(Date.now()<deadline,"The contributor must receive available control through the public UI");await page.waitForTimeout(100);}
   await page.waitForLoadState("networkidle");await canvas.waitFor();await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
   let saveName="Save Changes";
   if(kind==="terrain"){await terrainTool(page,"raise");await closeTerrainSettings(page);await canvas.scrollIntoViewIfNeeded();const box=(await canvas.boundingBox())!;await page.mouse.move(box.x+box.width*.45,box.y+box.height*.45);await page.mouse.down();await page.mouse.move(box.x+box.width*.55,box.y+box.height*.5,{steps:6});await page.mouse.up();saveName="Save terrain";}
   else{const label=kind==="town"?"Map name":kind==="floor"?"Floor name":kind==="underground"?"Level name":kind==="deck"?"Deck name":"Craft name";let field=page.getByLabel(label,{exact:true});if(!await field.count()||!await field.isVisible()){const options=page.getByRole("button",{name:"Options",exact:true});if(await options.count())await options.first().click();}
    field=page.getByLabel(label,{exact:true});const details=field.locator("xpath=ancestor::details[not(@open)]");for(let index=await details.count()-1;index>=0;index--)await details.nth(index).locator("summary").first().click();await field.fill((await field.inputValue()).slice(0,120)+" UI contributor");if(kind==="craft"||kind==="deck")saveName="Save Drawing";
   }
   const response=page.waitForResponse(response=>response.request().method()==="POST"&&new URL(response.url()).pathname===`/api/worlds/${f.worldA}/${kind==="terrain"?"terrain":kind==="town"?"town-maps":kind==="floor"?"building-floors":kind==="underground"?"underground":"crafts"}`);void response.catch(()=>{});await page.getByRole("button",{name:saveName,exact:true}).click();const saved=await response;assert.equal(saved.status(),200,await saved.text());checks.push({kind,actualInvitedEditorSave:true});await page.getByRole("button",{name:"Release control",exact:true}).click();await page.getByRole("button",{name:"Start editing",exact:true}).waitFor();
  }
  await page.screenshot({path:path.join(f.out,`shared-${mode}-${kind}.png`)});
 }assert.deepEqual(errors,[]);await writeFile(path.join(f.out,`shared-${mode}-maps.json`),JSON.stringify({passed:true,checks,errors,realAuthentication:true,sourceHash:b.sourceHash,buildId:b.buildId,physicalAcceptance:false},null,2));console.log("PASS shared native map UI",mode,checks.length);
 }catch(error){await page.screenshot({path:path.join(f.out,`shared-${mode}-failure.png`)}).catch(()=>{});await writeFile(path.join(f.out,`shared-${mode}-failure.txt`),await page.locator("body").innerText().catch(()=>""));throw error;}finally{await page.close();}
}
