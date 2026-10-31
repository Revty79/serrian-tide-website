import type {Page,Locator} from "playwright-core";
/** User-facing navigation shared by regression journeys after the map-first layout change. */
export async function terrainPanel(p:Page|Locator,name:"Tool"|"Measure"|"Terrain detail"|"Water"|"World"|"Climate & Biomes"|"Artwork"|"Labels & Layout"){
 const tab=p.getByRole("tab",{name,exact:true}),opener=p.getByRole("button",{name:/^(Show settings|Advanced settings)$/});await opener.or(tab).first().waitFor({state:"visible"});if(!await tab.isVisible())await opener.first().click();await tab.click();
}
export async function terrainTool(p:Page,tool:string){if(["pan","inspect"].includes(tool)&&!await p.getByLabel("More tools",{exact:true}).isVisible()&&!await p.getByLabel("Active terrain tool",{exact:true}).isVisible()){const canvas=p.getByLabel("Terrain map canvas",{exact:true});await canvas.waitFor();await canvas.scrollIntoViewIfNeeded();await canvas.focus();await p.keyboard.press(tool==="pan"?"p":"i");return;}let current=p.getByLabel("More tools",{exact:true});if(!await current.isVisible()&&!await p.getByLabel("Active terrain tool",{exact:true}).isVisible())await terrainPanel(p,"Tool");current=p.getByLabel("More tools",{exact:true});const select=await current.count()?current:p.getByLabel("Active terrain tool",{exact:true});await select.selectOption(tool.toLowerCase());}
export async function enableTerrainTouch(p:Page){const off=p.getByRole("button",{name:"Touch controls: Off",exact:true});if(await off.isVisible())await off.click();}
export async function terrainUnits(p:Page|Locator,distance:string,height="m"){
 const show=p.getByRole("button",{name:"Show settings",exact:true});if(await show.isVisible())await show.click();
 const tabs=p.getByRole("tab",{selected:true});const previous=await tabs.count()?await tabs.first().innerText():undefined;
 if(await p.getByRole("tab",{name:"Measure",exact:true}).count())await terrainPanel(p,"Measure");else{const summary=p.getByText("Units & grid",{exact:true});if(!await summary.evaluate(e=>(e.parentElement as HTMLDetailsElement).open))await summary.click();}
 await p.getByLabel("Horizontal units",{exact:true}).selectOption(distance);await p.getByLabel("Height units",{exact:true}).selectOption(height);
 if(previous)await terrainPanel(p,previous as "Tool"|"Measure"|"Terrain detail"|"World");
}

/** Close settings only when open; both old and current map layouts are supported. */
export async function closeTerrainSettings(p:Page|Locator,touch=false){const hide=p.getByRole("button",{name:"Hide settings",exact:true}),entry=p.getByRole("button",{name:/^(Show settings|Advanced settings)$/});await entry.or(hide).first().waitFor({state:"visible"});if(await hide.isVisible()){if(touch)await hide.tap();else await hide.click();}const canvas=p.getByLabel("Terrain map canvas",{exact:true});if(await canvas.count()===1)await canvas.scrollIntoViewIfNeeded();}

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
