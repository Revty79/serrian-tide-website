import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import type {Browser,BrowserContext,Page} from "playwright-core";
import type {RegionalFixture} from "./worlds-regional-editing-fixture";
import {regionalFixtureIds as ids} from "./worlds-regional-editing-fixture";
import {stable} from "./worlds-regional-editing-browser-checks";
import {chooseTerrainMap} from "./worlds-terrain-browser-ui";
type Options={f:RegionalFixture;browser:Browser;context:BrowserContext;page:Page;base:string;errors:string[];groups:string[]};
export async function workspaceBrowser(options:Options){
 if(process.env.SERRIAN_WORKSPACE_KEYBOARD==="1")return workspaceKeyboard(options);
 if(process.env.SERRIAN_WORKSPACE_BASELINE!=="1")return workspaceCandidate(options).catch(async error=>{await options.page.screenshot({path:`${options.f.out}/workspace-failure.png`}).catch(()=>{});await writeFile(`${options.f.out}/workspace-failure.json`,JSON.stringify(await options.page.evaluate(()=>({scrollY,body:document.body.innerText,rects:[...document.querySelectorAll('[aria-label="Heightmap editor"],canvas[aria-label="Terrain map canvas"],.authenticated-navigation')].map(e=>({tag:e.tagName,rect:e.getBoundingClientRect().toJSON(),height:getComputedStyle(e).height,classes:e.className}))})),null,2));throw error;});
 const {f,page:p,base,groups}=options;
 const records=[];
 for(const [width,height] of [[1440,1000],[1366,768],[1024,1194],[820,1180],[390,844]]){
  await p.setViewportSize({width,height});await p.goto(`${base}/worlds/${f.world}?tab=atlas&terrainMap=${ids.parent}`);await p.getByLabel("Terrain map canvas",{exact:true}).waitFor();
  await p.getByRole("button",{name:"Paint",exact:true}).click();await p.getByLabel("Ground material",{exact:true}).selectOption("sand");await stable(p);
  const canvas=p.getByLabel("Terrain map canvas",{exact:true});records.push({width,height,expanded:false,canvas:await canvas.boundingBox(),scrollY:await p.evaluate(()=>scrollY)});await p.screenshot({path:`${f.out}/before-${width}-standard.png`});
  await p.getByRole("button",{name:"Expand editor",exact:true}).click();await stable(p);records.push({width,height,expanded:true,canvas:await canvas.boundingBox(),scrollY:await p.evaluate(()=>scrollY)});await p.screenshot({path:`${f.out}/before-${width}-expanded.png`});
 }
 await writeFile(`${f.out}/workspace-baseline.json`,JSON.stringify({passed:true,startingCheckpoint:"ec33f121e9275e3b900fe941eb753f89da6ffaa9",records},null,2));groups.push("Exact accepted workspace baseline at desktop, small desktop, tablet and phone sizes");
}

async function workspaceKeyboard({f,page:p,base,groups}:Options){
 await p.setViewportSize({width:1440,height:1000});await p.goto(`${base}/worlds/${f.world}?tab=atlas&terrainMap=${ids.parent}`);await p.getByLabel("Terrain map canvas",{exact:true}).waitFor();await stable(p);
 const tools=p.getByRole("button",{name:"Tools",exact:true}),options=p.getByRole("button",{name:"Options",exact:true});
 await p.getByRole("button",{name:"Close tools",exact:true}).click();await p.waitForFunction(()=>document.activeElement?.getAttribute("aria-controls")==="terrain-tools");await p.keyboard.press("Enter");assert.equal(await tools.getAttribute("aria-expanded"),"true");
 await p.getByRole("button",{name:"Close settings",exact:true}).click();await p.waitForFunction(()=>document.activeElement?.getAttribute("aria-controls")==="terrain-inspector");await p.keyboard.press("Enter");assert.equal(await options.getAttribute("aria-expanded"),"true");
 await p.getByRole("button",{name:"Expand editor",exact:true}).click();const workspace=p.getByRole("region",{name:"Heightmap editor",exact:true});
 await tools.focus();await p.keyboard.press("Shift+Tab");assert.ok(await p.evaluate(()=>document.activeElement?.closest('[aria-label="Heightmap editor"]')!==null),"Expanded focus stays in the map workspace");await p.keyboard.press("Tab");assert.equal(await tools.evaluate(e=>document.activeElement===e),true,"Expanded focus wraps to its first control");
 const canvas=p.getByLabel("Terrain map canvas",{exact:true}),before=await canvas.getAttribute("data-view-x");await canvas.focus();await p.keyboard.press("ArrowRight");await p.waitForFunction(before=>document.querySelector<HTMLCanvasElement>('canvas[aria-label="Terrain map canvas"]')?.dataset.viewX!==before,before);await p.keyboard.press("Escape");assert.equal(await options.getAttribute("aria-expanded"),"false");await p.keyboard.press("Escape");await p.getByRole("button",{name:"Expand editor",exact:true}).waitFor();assert.ok(await workspace.isVisible());
 await chooseTerrainMap(p,ids.a);await p.waitForURL(url=>url.searchParams.get("terrainMap")===ids.a);await stable(p);await p.getByRole("button",{name:"Create New Region",exact:true}).click();const continuation=p.getByRole("button",{name:"Continue Creating Region",exact:true});await continuation.or(p.getByRole("button",{name:"Freehand",exact:true})).first().waitFor();if(await continuation.isVisible())await continuation.click();await p.waitForURL(url=>url.searchParams.get("terrainMap")===ids.parent);await p.getByRole("button",{name:"Freehand",exact:true}).waitFor();assert.ok(await p.getByRole("button",{name:"Point-by-Point",exact:true}).isVisible());await p.getByRole("button",{name:"Cancel",exact:true}).click();assert.equal(new URL(p.url()).searchParams.get("terrainMap"),ids.parent);
 await writeFile(`${f.out}/workspace-keyboard.json`,JSON.stringify({passed:true,closePanelFocusReturn:true,keyboardReopensPanels:true,expandedFocusWrap:true,canvasKeyboardPan:true,escapeClosesOptionsThenExpanded:true,createNewRegionFromExistingRegion:true,parentTransitionPresentsImmediateShapeChoices:true,physicalDeviceClaim:false},null,2));groups.push("Keyboard panel focus return, Enter reopening, expanded focus wrap, arrow navigation and Escape sequence; Create New Region safely returns from an existing region to the World boundary tools");
}

async function workspaceCandidate(options:Options){
 const {f,page:p,base,groups}=options;
 const records=[];
 for(const [width,height] of [[1440,1000],[1366,768],[1024,1194],[820,1180],[390,844]]){
  await p.setViewportSize({width,height});await p.goto(`${base}/worlds/${f.world}?tab=atlas&terrainMap=${ids.parent}`);await p.getByLabel("Terrain map canvas",{exact:true}).waitFor();await stable(p);
  for(const expanded of [false,true]){
   if(expanded)await p.getByRole("button",{name:"Expand editor",exact:true}).click();
   await p.waitForTimeout(150);
   const canvas=p.getByLabel("Terrain map canvas",{exact:true}),box=(await canvas.boundingBox())!;
   await p.screenshot({path:`${f.out}/workspace-${width}-${expanded?"expanded":"standard"}.png`});
   const workspace=(await p.getByRole("region",{name:"Heightmap editor",exact:true}).boundingBox())!;
   records.push({width,height,expanded,canvas:box,workspace,scrollY:await p.evaluate(()=>scrollY)});
   assert.ok(box.y>=0&&box.y+box.height<=height+1,JSON.stringify({width,height,expanded,box}));
   assert.ok(workspace.y>=0&&workspace.y+workspace.height<=height+1,JSON.stringify({width,height,expanded,workspace}));
   assert.ok(box.height>=(width>640?500:height/2)-1,"Retain the original canvas minimum");
   if(width>1100){
    const initial=await canvas.evaluate(c=>({scale:Number(c.dataset.zoom),x:Number(c.dataset.viewX),y:Number(c.dataset.viewY),width:c.getBoundingClientRect().width,height:c.getBoundingClientRect().height}));
    await p.getByRole("button",{name:"Close tools",exact:true}).click();await p.getByRole("button",{name:"Close settings",exact:true}).click();await p.waitForTimeout(100);
    const free=(await canvas.boundingBox())!;assert.ok(free.width>box.width+300);
    await p.getByRole("button",{name:"Tools",exact:true}).click();await p.getByRole("button",{name:"Options",exact:true}).click();await p.waitForTimeout(100);
    const after=await canvas.evaluate(c=>({scale:Number(c.dataset.zoom),x:Number(c.dataset.viewX),y:Number(c.dataset.viewY),width:c.getBoundingClientRect().width,height:c.getBoundingClientRect().height}));
    assert.equal(after.scale,initial.scale);assert.ok(Math.abs((initial.width/2-initial.x)/initial.scale-(after.width/2-after.x)/after.scale)<.001);assert.ok(Math.abs((initial.height/2-initial.y)/initial.scale-(after.height/2-after.y)/after.scale)<.001);
    const scroll=await p.evaluate(()=>scrollY);await p.getByRole("button",{name:"Paint",exact:true}).click();await p.getByLabel("Ground material",{exact:true}).selectOption("sand");await p.getByLabel(/^Paint brush size/).fill("1");
    const paintBox=(await canvas.boundingBox())!;assert.equal(paintBox.y,box.y,"Tool selection cannot push the map down");assert.equal(await p.evaluate(()=>scrollY),scroll,"Everyday controls cannot scroll the page");
    await p.screenshot({path:`${f.out}/paint-${width}-${expanded?"expanded":"standard"}.png`});
   }
  }
 }
 await writeFile(`${f.out}/workspace-layout.json`,JSON.stringify({passed:true,records},null,2));groups.push("Stable map-centered standard/expanded layout, original canvas minima and exact camera-preserving independent panel collapse");
 if(process.env.SERRIAN_WORKSPACE_JOURNEYS==="1")await(await import("./worlds-atlas-workspace-journeys")).workspaceJourneys({f,page:p,base,groups});
 if(process.env.SERRIAN_WORKSPACE_INPUTS==="1")await(await import("./worlds-atlas-workspace-inputs")).workspaceInputs(options);
 if(process.env.SERRIAN_WORKSPACE_KEYBOARD_AFTER==="1")await workspaceKeyboard(options);
}
