import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import type {Page} from "playwright-core";
import type {RegionalFixture} from "./worlds-regional-editing-fixture";
import {regionalFixtureIds as ids} from "./worlds-regional-editing-fixture";
import {stable} from "./worlds-regional-editing-browser-checks";
import {chooseTerrainMap} from "./worlds-terrain-browser-ui";

export async function mapNavigationBrowser({f,page:p,base,groups}:{f:RegionalFixture;page:Page;base:string;groups:string[]}){
 const records=[];
 for(const [width,height]of [[1440,1000],[820,1180],[390,844]]){
  await p.setViewportSize({width,height});await p.goto(`${base}/worlds/${f.world}?tab=atlas&terrainMap=${ids.a}`);await p.getByRole("button",{name:/^Current Map:/}).waitFor();await stable(p);
  for(const name of ["Tools","Options"]){const button=p.getByRole("button",{name,exact:true});if(await button.getAttribute("aria-expanded")==="true")await button.click();}
  for(const expanded of [false,true]){
   if(expanded)await p.getByRole("button",{name:"Expand editor",exact:true}).click();
   for(const id of [ids.b,ids.parent,ids.a]){
    await chooseTerrainMap(p,id);await p.waitForURL(u=>u.searchParams.get("terrainMap")===id);await p.getByRole("button",{name:/^Current Map:/}).waitFor();await stable(p);
    for(const name of ["Tools","Options"])assert.equal(await p.getByRole("button",{name,exact:true}).getAttribute("aria-expanded"),"false");
    assert.equal(await p.getByRole("button",{name:"Exit expanded editor",exact:true}).count(),expanded?1:0);
    const before=await p.evaluate(()=>({tag:document.activeElement?.tagName,label:document.activeElement?.getAttribute("aria-label")}));
    if(expanded){await p.keyboard.press("Tab");assert.equal(await p.evaluate(()=>!!document.activeElement?.closest('[aria-label="Heightmap editor"]')),true,"Keyboard navigation remains inside the expanded workspace after switching documents");}
    records.push({width,height,expanded,id,beforeKeyboardFocus:before,closedPanelsPreserved:true});
   }
  }
 }
 await writeFile(`${f.out}/closed-panel-map-navigation.json`,JSON.stringify({passed:true,records,visibleMapBrowserSwitches:true,keyboardFocusRetained:true,physicalDeviceClaim:false},null,2));groups.push("Actual World/region/sibling switching with both panels closed in standard and expanded desktop/tablet/phone layouts; keyboard stays in the editor");
}
