import type {Page,Locator} from "playwright-core";
type Panel="Tool"|"Measure"|"Terrain detail"|"Water"|"World"|"Climate & Biomes"|"Artwork"|"Labels & Layout"|"Settlements"|"Regions";
/** Navigate through public workspace controls, retaining exact accepted-baseline support. */
export async function terrainPanel(p:Page|Locator,name:Panel){
 const tab=p.getByRole("tab",{name,exact:true}),options=p.getByRole("button",{name:"Options",exact:true});
 if(await options.isVisible()){if(await options.getAttribute("aria-expanded")==="false")await options.click();const menu=p.getByText("All map options",{exact:true});await menu.waitFor();if(!await menu.evaluate(e=>(e.parentElement as HTMLDetailsElement).open))await menu.click();await tab.click();return;}
 const opener=p.getByRole("button",{name:/^(Show settings|Advanced settings)$/});await opener.or(tab).first().waitFor({state:"visible"});if(!await tab.isVisible())await opener.first().click();await tab.click();
}
const toolButtons:Record<string,string>={raise:"Raise mountains",lower:"Lower / carve valleys",smooth:"Smooth",level:"Flatten",sample:"Sample height","coast-land":"Extend land","coast-water":"Carve a bay","coast-smooth":"Smooth shoreline",pan:"Pan",inspect:"Inspect",measure:"Measure",locations:"Towns & settlements",artwork:"Artwork",labels:"Labels & map layout"};
export async function terrainTool(p:Page,tool:string|{label:string}){
 tool=typeof tool==="string"?tool.toLowerCase():({"Artwork":"artwork","Labels & Layout":"labels"}[tool.label]??tool.label.toLowerCase());const options=p.getByRole("button",{name:"Options",exact:true});
 if(await options.count()){
  if(["pan","inspect"].includes(tool)){const c=p.getByLabel("Terrain map canvas",{exact:true});await c.focus();await p.keyboard.press(tool==="pan"?"p":"i");return;}
  const group=["material","environment"].includes(tool)?"Paint":tool==="water"?"Water":["locations","artwork","labels"].includes(tool)?"Places":["measure","refine"].includes(tool)?"Inspect / Navigate":"Sculpt",family=p.getByRole("button",{name:group,exact:true});if(!await family.isVisible())await p.getByRole("button",{name:"Tools",exact:true}).click();await family.click();
  if(tool==="material"){await p.getByLabel("Paint layer",{exact:true}).selectOption("ground");const extra=p.getByText("Material layer options & history",{exact:true});if(!await extra.evaluate(e=>(e.parentElement as HTMLDetailsElement).open))await extra.click();return;}
  if(tool==="environment"){await terrainPanel(p,"Climate & Biomes");const boundary=p.getByText("Landscape painting & boundaries",{exact:true});if(!await boundary.evaluate(e=>(e.parentElement as HTMLDetailsElement).open))await boundary.click();await p.getByRole("button",{name:"Paint environment on map",exact:true}).click();return;}
  if(tool==="water")return;
  if(tool==="refine"){await terrainPanel(p,"Terrain detail");await p.getByRole("button",{name:"Draw physical bounds",exact:true}).click();return;}
  const button=p.getByRole("button",{name:toolButtons[tool]??tool,exact:true});if(!await button.isVisible())await p.getByRole("button",{name:"Tools",exact:true}).click();await button.click();return;
 }
 if(["pan","inspect"].includes(tool)&&!await p.getByLabel("More tools",{exact:true}).isVisible()&&!await p.getByLabel("Active terrain tool",{exact:true}).isVisible()){const c=p.getByLabel("Terrain map canvas",{exact:true});await c.scrollIntoViewIfNeeded();await c.focus();await p.keyboard.press(tool==="pan"?"p":"i");return;}
 let current=p.getByLabel("More tools",{exact:true});if(!await current.isVisible()&&!await p.getByLabel("Active terrain tool",{exact:true}).isVisible())await terrainPanel(p,"Tool");current=p.getByLabel("More tools",{exact:true});await(await current.count()?current:p.getByLabel("Active terrain tool",{exact:true})).selectOption(tool);
}
export async function terrainActiveTool(p:Page){if(await p.getByRole("button",{name:"Options",exact:true}).count()){const names=await p.getByRole("navigation",{name:"Mapmaking tools",includeHidden:true}).getByRole("button",{pressed:true,includeHidden:true}).allTextContents();return Object.entries(toolButtons).find(([,label])=>names.includes(label))?.[0];}const old=p.getByLabel("More tools",{exact:true});return(await old.count()?old:p.getByLabel("Active terrain tool",{exact:true})).inputValue();}
export async function enableTerrainTouch(p:Page){const off=p.getByRole("button",{name:"Touch controls: Off",exact:true});if(!await off.isVisible()&&await p.getByRole("button",{name:"Options",exact:true}).count())await terrainPanel(p,"Tool");if(await off.isVisible())await off.click();}
export async function chooseTerrainMap(p:Page,map:string){const select=p.getByLabel("World terrain map",{exact:true});if(!await select.isVisible()&&await p.getByRole("button",{name:"Choose Map",exact:true}).count())await p.getByRole("button",{name:"Choose Map",exact:true}).click();await select.selectOption(map);}
export async function createTerrainWorld(p:Page){const create=p.getByRole("button",{name:"Create flat world",exact:true});if(!await create.isVisible()&&await p.getByRole("button",{name:"Choose Map",exact:true}).count()){await p.getByRole("button",{name:"Choose Map",exact:true}).click();await p.getByRole("button",{name:"Map library & create a World map",exact:true}).click();}await create.click();}
export async function terrainUnits(p:Page|Locator,distance:string,height="m"){
 const previous=await p.getByRole("tab",{selected:true,includeHidden:true}).allTextContents();const show=p.getByRole("button",{name:"Show settings",exact:true});if(await show.isVisible())await show.click();
 if(await p.getByRole("button",{name:"Options",exact:true}).count()||await p.getByRole("tab",{name:"Measure",exact:true}).count())await terrainPanel(p,"Measure");else{const summary=p.getByText("Units & grid",{exact:true});if(!await summary.evaluate(e=>(e.parentElement as HTMLDetailsElement).open))await summary.click();}
 await p.getByLabel("Horizontal units",{exact:true}).selectOption(distance);await p.getByLabel("Height units",{exact:true}).selectOption(height);if(previous[0])await terrainPanel(p,previous[0] as Panel);
}
export async function closeTerrainSettings(p:Page|Locator,touch=false){const options=p.getByRole("button",{name:"Options",exact:true});if(await options.isVisible()){if(await options.getAttribute("aria-expanded")==="true"){if(touch)await options.tap();else await options.click();}return;}const hide=p.getByRole("button",{name:"Hide settings",exact:true}),entry=p.getByRole("button",{name:/^(Show settings|Advanced settings)$/});await entry.or(hide).first().waitFor({state:"visible"});if(await hide.isVisible()){if(touch)await hide.tap();else await hide.click();}const c=p.getByLabel("Terrain map canvas",{exact:true});if(await c.count()===1)await c.scrollIntoViewIfNeeded();}

/** Keep authored coordinates exact while making the native pointer target reachable. */
export async function visibleTerrainPoint(p:Page,point:{x:number;y:number}){
 const c=p.getByLabel("Terrain map canvas",{exact:true});await c.waitFor();await c.focus();await c.scrollIntoViewIfNeeded();
 const hit=(at:{x:number;y:number})=>p.evaluate(({x,y})=>document.elementFromPoint(x,y)?.getAttribute("aria-label")==="Terrain map canvas",at);
 for(let attempt=0;attempt<12;attempt++){
  const b=await c.boundingBox();if(!b)throw Error("The map canvas is unavailable.");const v=await c.evaluate(c=>({x:Number(c.dataset.viewX),y:Number(c.dataset.viewY),scale:Number(c.dataset.zoom)})),at={x:b.x+v.x+point.x*v.scale,y:b.y+v.y+point.y*v.scale};
  if(await hit(at))return at;
  if(at.x<b.x||at.x>=b.x+b.width||at.y<b.y||at.y>=b.y+b.height){await p.getByRole("button",{name:"Fit map",exact:true}).click();await p.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));await c.scrollIntoViewIfNeeded();continue;}
  const viewport=p.viewportSize()!,left=Math.max(0,b.x),top=Math.max(0,b.y),width=Math.min(viewport.width,b.x+b.width)-left,height=Math.min(viewport.height,b.y+b.height)-top;
  let start:{x:number;y:number}|undefined;for(const [x,y]of [[.4,.6],[.3,.7],[.5,.5],[.2,.6]]){const candidate={x:left+width*x,y:top+height*y};if(await hit(candidate)){start=candidate;break;}}if(!start)throw Error("The native map target is obscured.");
  const dx=Math.max(-width*.25,Math.min(width*.25,start.x-at.x)),dy=Math.max(-height*.25,Math.min(height*.25,start.y-at.y));await c.focus();await p.keyboard.down("Space");try{await p.mouse.move(start.x,start.y);await p.mouse.down();await p.mouse.move(start.x+dx,start.y+dy,{steps:5});await p.mouse.up();}finally{await p.keyboard.up("Space");}await p.waitForFunction(old=>{const c=document.querySelector<HTMLCanvasElement>('canvas[aria-label="Terrain map canvas"]');return Number(c?.dataset.viewX)!==old.x||Number(c?.dataset.viewY)!==old.y;},v);
 }
 throw Error("Pan or zoom until the requested map position is visible.");
}

/** Prefer the visible everyday history action, retaining the published toolbar fallback. */
export async function terrainHistory(p:Page|Locator,direction:"undo"|"redo",touch=false){const name=direction==="undo"?"Undo":"Redo",primary=p.getByRole("button",{name:name+" change",exact:true}),legacy=p.getByRole("button",{name,exact:true});await primary.or(legacy).first().waitFor({state:"visible"});const button=await primary.isVisible()?primary:legacy;if(touch)await button.tap();else await button.click();}
