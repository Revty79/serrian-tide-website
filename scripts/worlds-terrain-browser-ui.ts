import type {Page,Locator} from "playwright-core";
/** User-facing navigation shared by regression journeys after the map-first layout change. */
export async function terrainPanel(p:Page|Locator,name:"Tool"|"Measure"|"Terrain detail"|"World"){
 const show=p.getByRole("button",{name:"Show settings",exact:true});if(await show.isVisible())await show.click();await p.getByRole("tab",{name,exact:true}).click();
}
export async function terrainTool(p:Page,tool:string){await p.getByLabel("Active terrain tool",{exact:true}).selectOption(tool.toLowerCase());}
export async function enableTerrainTouch(p:Page){const off=p.getByRole("button",{name:"Touch controls: Off",exact:true});if(await off.isVisible())await off.click();}
export async function terrainUnits(p:Page|Locator,distance:string,height="m"){
 const show=p.getByRole("button",{name:"Show settings",exact:true});if(await show.isVisible())await show.click();
 const tabs=p.getByRole("tab",{selected:true});const previous=await tabs.count()?await tabs.first().innerText():undefined;
 if(await p.getByRole("tab",{name:"Measure",exact:true}).count())await terrainPanel(p,"Measure");else{const summary=p.getByText("Units & grid",{exact:true});if(!await summary.evaluate(e=>(e.parentElement as HTMLDetailsElement).open))await summary.click();}
 await p.getByLabel("Horizontal units",{exact:true}).selectOption(distance);await p.getByLabel("Height units",{exact:true}).selectOption(height);
 if(previous)await terrainPanel(p,previous as "Tool"|"Measure"|"Terrain detail"|"World");
}
