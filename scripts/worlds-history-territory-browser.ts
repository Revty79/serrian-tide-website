import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import type {Browser,BrowserContext,Page,Locator} from "playwright-core";
import type {RegionalFixture} from "./worlds-regional-editing-fixture";
import type {NativeHistoryScope} from "../src/features/worlds/native-map-history";
import {nativeHistoryUrl} from "../src/features/worlds/native-map-history";
import {worldContextUrl} from "../src/features/worlds/world-atlas-context";
import type {NativeTerritoryBundle} from "../src/features/worlds/native-map-history-territories";

export async function nativeTerritoryBrowser({f,browser,context,base,sourceHash}:{f:RegionalFixture;browser:Browser;context:BrowserContext;base:string;sourceHash:string}){
  const fixture=JSON.parse(await readFile(path.join(f.out,"native-territories.json"),"utf8")).fixture as {target:{kind:"terrain";id:string};polityId:string;territoryId:string;scope100:NativeHistoryScope;scope500:NativeHistoryScope;originalPolityVersion:string};
  const failures:string[]=[],journeys:unknown[]=[];
  for(const layout of [{width:1440,height:1000,name:"desktop",hasTouch:false},{width:390,height:844,name:"phone",hasTouch:true}]){
    const c=await browser.newContext({viewport:{width:layout.width,height:layout.height},storageState:await context.storageState(),hasTouch:layout.hasTouch,isMobile:layout.hasTouch}),p=await c.newPage();
    c.on("page",page=>page.on("pageerror",e=>failures.push(e.stack??e.message)));p.on("pageerror",e=>failures.push(e.stack??e.message));
    const view=(year:number)=>({worldId:f.world,timelineId:fixture.scope100.timelineId,year,review:false,ordinary:false});
    const popup=async(page:Page,link:Locator)=>{const [opened]=await Promise.all([c.waitForEvent("page"),link.click()]);await opened.waitForLoadState("networkidle");return opened;};
    try{
      // The actual Politics tab offers the original territory representation,
      // even after a newer political head was authored.
      for(const year of [100,500]){
        await p.goto(base+worldContextUrl(view(year),{tab:"politics",entity:fixture.polityId,...year===100?{loreVersion:fixture.originalPolityVersion}:{}}),{waitUntil:"networkidle"});
        await p.locator("summary").filter({hasText:/^Find in Atlas$/}).filter({visible:true}).first().click();const find=p.getByRole("region",{name:"Find in Atlas",exact:true});
        const links=find.getByRole("link",{name:"Show in Atlas",exact:true});await links.first().waitFor();let selected:Locator|undefined;
        for(let i=0;i<await links.count();i++){const u=new URL((await links.nth(i).getAttribute("href"))!,base);if(u.searchParams.get("terrainMap")===fixture.target.id&&JSON.parse(u.searchParams.get("worldSource")??"null")?.territory?.id===fixture.territoryId){selected=links.nth(i);break;}}
        assert.ok(selected);const map=await popup(p,selected);
        try{
          const canvas=map.getByLabel("Terrain map canvas",{exact:true});await canvas.waitFor();assert.ok((await canvas.boundingBox())!.height>=400);
          const badge=map.getByTestId("atlas-date-context");assert.match(await badge.innerText(),new RegExp(`Year ${year}`));await badge.evaluate(el=>{const r=el.getBoundingClientRect();if(r.left<0||r.right>innerWidth+.5||el.scrollWidth>el.clientWidth||el.scrollHeight>el.clientHeight)throw Error("Political map date badge must retain its full text inside the phone viewport");});
          const actions=map.getByRole("button",{name:"Related Worlds Records",exact:true});let opened=false;for(let i=0;i<await actions.count();i++)if(await actions.nth(i).isVisible()){await actions.nth(i).click();opened=true;break;}if(!opened){await map.getByRole("button",{name:"Settings",exact:true}).click();await actions.filter({visible:true}).first().click();}
          const related=map.getByRole("dialog",{name:"Related Worlds Records",exact:true});await related.waitFor();const originals=related.getByRole("link",{name:"Open original World record",exact:true});await originals.first().waitFor();let original:Locator|undefined;
          for(let i=0;i<await originals.count();i++){const u=new URL((await originals.nth(i).getAttribute("href"))!,base);if(u.searchParams.get("entity")===fixture.polityId){original=originals.nth(i);break;}}assert.ok(original);
          const record=await popup(map,original);try{await record.getByRole("heading",{name:year===100?"Original territorial polity":"Later territorial polity",exact:true}).first().waitFor();const back=record.getByRole("link",{name:"Return to saved World / Atlas view",exact:true});await back.waitFor();const backUrl=new URL((await back.getAttribute("href"))!,base);assert.equal(backUrl.searchParams.get("atlasYear"),String(year));assert.ok(backUrl.searchParams.has("atlasView"));}finally{await record.close();}
          journeys.push({layout:layout.name,year,actualPoliticsToPhysicalTerritoryAndExactOriginalSource:true});
        }finally{await map.close();}
      }
      const scope=fixture.scope100,mapUrl=worldContextUrl(view(100),{tab:"atlas",terrainMap:fixture.target.id,atlasState:scope.stateId,atlasEditing:"1"});
      await p.goto(base+mapUrl,{waitUntil:"networkidle"});const canvas=p.getByLabel("Terrain map canvas",{exact:true});await canvas.waitFor();
      async function openPolitical(){const button=p.getByRole("button",{name:"Political Boundaries",exact:true});if(!await button.isVisible()){const toggle=p.getByRole("button",{name:"Settings",exact:true});await toggle.click();}await button.click();}
      await openPolitical();const panel=p.getByRole("region",{name:"Dated political boundaries",exact:true});
      const add=panel.getByRole("button",{name:"Add Territory",exact:true});await add.waitFor();await add.click();const name=`UI territory ${layout.name}`;await panel.getByLabel("Territory name",{exact:true}).fill(name);await panel.getByLabel("Territorial source account",{exact:true}).fill("Deliberately drawn and accepted through the real dated World map controls.");
      await panel.getByLabel("Existing political record",{exact:true}).selectOption(fixture.polityId);
      await panel.getByRole("button",{name:"Draw Outer Boundary",exact:true}).click();
      if(layout.hasTouch){const toggle=p.getByRole("button",{name:"Touch controls: Off",exact:true}).filter({visible:true});if(await toggle.count())await toggle.first().click();const enable=p.getByLabel("One-finger bounds selection",{exact:true}).filter({visible:true}).first();if(!await enable.isChecked())await enable.check();}
      if(layout.hasTouch){await p.getByRole("button",{name:"Close settings",exact:true}).click();await canvas.scrollIntoViewIfNeeded();await p.waitForTimeout(150);}
      const corners=[[24000,26000],[40000,26000],[40000,42000],[24000,42000]];
      for(const [x,y] of corners){await canvas.scrollIntoViewIfNeeded();await canvas.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));const b=(await canvas.boundingBox())!,camera=await canvas.evaluate(el=>({zoom:Number((el as HTMLCanvasElement).dataset.zoom),x:Number((el as HTMLCanvasElement).dataset.viewX),y:Number((el as HTMLCanvasElement).dataset.viewY)})),px=b.x+camera.x+x*camera.zoom,py=b.y+camera.y+y*camera.zoom;assert.ok(px>b.x&&px<b.x+b.width&&py>b.y&&py<b.y+b.height);assert.equal(await canvas.evaluate((el,point)=>document.elementFromPoint(point.x,point.y)===el,{x:px,y:py}),true,"The boundary corner is clicked on the painted canvas");if(layout.hasTouch)await p.touchscreen.tap(px,py);else await p.mouse.click(px,py);}
      if(layout.hasTouch){await p.getByRole("button",{name:"Options",exact:true}).click();await openPolitical();}
      await panel.getByRole("button",{name:"Finish Boundary",exact:true}).click();await p.reload({waitUntil:"networkidle"});await canvas.waitFor();await openPolitical();await panel.getByLabel("Territory name",{exact:true}).waitFor();assert.equal(await panel.getByLabel("Territory name",{exact:true}).inputValue(),name);
      const response=p.waitForResponse(r=>new URL(r.url()).pathname.endsWith("/atlas-history/territories")&&r.request().method()==="POST");await panel.getByRole("button",{name:"Save Political Boundaries",exact:true}).click();const saved=await response;assert.equal(saved.status(),200,await saved.text());await panel.getByText(/Political boundaries saved for this appearance/).waitFor();
      const bundle=await(await c.request.get(base+nativeHistoryUrl(`/api/worlds/${f.world}/atlas-history/territories`,{...scope,edit:false}))).json() as NativeTerritoryBundle;assert.ok(bundle.saved!.territories.some(t=>t.name===name&&t.boundaries[0].points.length===4&&t.relationships.some(r=>r.entityId===fixture.polityId)));
      const accepted=bundle.saved!.territories.find(t=>t.name===name)!.boundaries[0].points;assert.ok(corners.every(([x,y])=>accepted.some(point=>Math.hypot(point.x-x,point.y-y)<2)),"Every saved political corner retains its deliberate physical position");
      assert.ok((await canvas.boundingBox())!.height>=400);await p.screenshot({path:path.join(f.out,`political-territories-${layout.name}.png`)});journeys.push({layout:layout.name,realNativeTouch:layout.hasTouch,realBoundaryDrawingPoliticalSourceAndReloadRecovery:true,savedYear:100});
    }catch(e){await p.screenshot({path:path.join(f.out,`political-failure-${layout.name}.png`)}).catch(()=>{});await writeFile(path.join(f.out,`political-failure-${layout.name}.txt`),await p.locator("body").innerText()).catch(()=>{});throw e;}finally{await c.close();}
  }
  assert.deepEqual(failures,[]);await writeFile(path.join(f.out,"native-territory-browser.json"),JSON.stringify({passed:true,sourceHash,journeys,clientErrors:failures,sharedDatabaseAccess:false,ownerAcceptance:false,physicalDeviceAcceptance:false},null,2));
}
