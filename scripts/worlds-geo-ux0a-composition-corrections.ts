/** Correct saved sources using the same inspector controls available to an owner. */
import assert from "node:assert/strict";
import type {Page} from "playwright-core";
import {latestIslandAssets} from "../src/features/worlds/island-assets";
export const CORRECTIONS_DIRECTORY="docs/screenshots/worlds-geo-ux0a/full-library/corrections";
type Point={x:number;y:number};
export async function checkShorelineSamples(page:Page,samples:{name:string;point:Point;land:boolean}[]){
 const checks=await page.getByRole("application",{name:"Editable map canvas"}).evaluate((svg,samples)=>{const paths=[...svg.querySelectorAll('mask[data-geographic-land-mask="ready"] path')].map(p=>new Path2D(p.getAttribute("d")??"")),ctx=document.createElement("canvas").getContext("2d")!;return samples.map(sample=>({...sample,actualLand:paths.some(p=>ctx.isPointInPath(p,sample.point.x/2,600-sample.point.y/2,"evenodd"))}));},samples);
 for(const check of checks)assert.equal(check.actualLand,check.land,check.name);return checks;
}
export async function correctIslandComposition(page:Page,branch:"manual"|"generated"){
 const canvas=page.getByRole("application",{name:"Editable map canvas"});
 const geometry=await canvas.evaluate(svg=>{
  const paths=[...svg.querySelectorAll('mask[data-geographic-land-mask="ready"] path')].map(p=>new Path2D(p.getAttribute("d")??"")),ctx=document.createElement("canvas").getContext("2d")!;
  const points:Point[]=[];for(let y=80;y<1120;y+=10)for(let x=100;x<1900;x+=10)if(paths.some(p=>ctx.isPointInPath(p,x/2,600-y/2,"evenodd")))points.push({x,y});
  const extent={x:Math.min(...points.map(p=>p.x)),y:Math.min(...points.map(p=>p.y)),w:Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)),h:Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y))};
  const south:Record<number,number>={};for(let x=100;x<=1900;x+=2)for(let y=1198;y>=100;y-=2)if(paths.some(p=>ctx.isPointInPath(p,x/2,600-y/2,"evenodd"))){south[x]=y;break;}
  return {extent,south};
 });
 const transform=([x,y]:[number,number]):Point=>branch==="manual"?{x,y}:{x:geometry.extent.x+(x-300)/1400*geometry.extent.w,y:geometry.extent.y+(y-200)/830*geometry.extent.h};
 const south=(x:number)=>{const y=geometry.south[Math.round(x/2)*2];assert.ok(y,"Real geographic coast must exist at this longitude");return y;};
 const select=async(name:string)=>{console.log(`Inspector: ${name}`);await page.getByRole("button",{name,exact:true}).click();};
 const position=async(p:Point)=>{await page.getByLabel("Drawing X",{exact:true}).fill(p.x.toFixed(2));await page.getByLabel("Drawing Y",{exact:true}).fill(p.y.toFixed(2));await page.getByRole("button",{name:"Apply drawing position",exact:true}).click();};
 const apply=async()=>{const button=page.getByRole("button",{name:"Apply drawing changes",exact:true});assert.ok(await button.evaluate(el=>(el.closest("form") as HTMLFormElement).checkValidity()),"Inspector values must satisfy the real website form");await button.click();};
 await page.getByLabel("Artwork tool",{exact:true}).selectOption("edit",{timeout:30000});
 const mouth=transform([1120,1000]);mouth.y=south(mouth.x)+6;
 const river=[[1000,430],[1040,520],[1090,650],[1050,775]].map(p=>transform(p as [number,number]));river.push({x:mouth.x-30,y:mouth.y-105},mouth);
 await select("The Wrenwater");await page.getByLabel("Saved path width",{exact:true}).fill("6");await page.getByLabel("Saved path curvature",{exact:true}).fill("0.6");await apply();
 const riverPoints=await page.getByLabel("Drawing point",{exact:true}).locator("option").evaluateAll(options=>options.map(o=>(o as HTMLOptionElement).value).filter(Boolean));assert.equal(riverPoints.length,river.length);
 for(let i=0;i<river.length;i++){await page.getByLabel("Drawing point",{exact:true}).selectOption(riverPoints[i]);await position(river[i]);}
 // The harbor illustration's quays face down in its original vector. Align them with the actual coast.
 const harbor=transform([1430,900]);harbor.y=south(harbor.x)-8;
 const angle=Math.max(-45,Math.min(45,Math.atan2(south(harbor.x+55)-south(harbor.x-55),110)*180/Math.PI));
 await select("Port placed subject");await page.getByLabel("Placed symbol scale",{exact:true}).fill(branch==="manual"?"0.6":"0.4");await page.getByLabel("Drawing rotation",{exact:true}).fill(String(Math.round(angle)));await apply();await position(harbor);
 // Use independent saved labels: lettering belongs on quiet inland ground, away from the shore and symbols.
 const labels:Record<string,[number,number]>={"Ashmere":[610,820],"Wrenhaven":[850,940],"South Quay":branch==="generated"?[1470,815]:[1390,760],"Crownwatch":[940,700]};
 for(const [text,p] of Object.entries(labels)){
  const button=page.getByRole("button",{name:new RegExp(`^${text} label$`)});
  if(await button.count())await button.click();else{await select(text);}
  await page.getByLabel("Placed label size",{exact:true}).fill("25");await apply();await position(transform(p));
 }
 const symbols:Record<string,{p:[number,number];scale:number;rotation?:number}>={
  "settlement-village":{p:[610,755],scale:branch==="manual"?.6:.4},"settlement-city":{p:[850,875],scale:branch==="manual"?.6:.4},
  "woodland-broadleaf-tree":{p:[470,675],scale:.7},"woodland-broadleaf-grove":{p:[700,700],scale:.6},
  "woodland-conifer-tree":{p:[1170,625],scale:.6},"woodland-conifer-grove":{p:[1300,710],scale:.6},
  "wetland-reeds":{p:[1180,915],scale:.6,rotation:7}
 };
 for(const [id,s] of Object.entries(symbols)){const asset=latestIslandAssets.find(a=>a.id===id)!;await select(`${asset.name} placed subject`);await page.getByLabel("Placed symbol scale",{exact:true}).fill(String(branch==="generated"?Math.max(.4,Math.round(s.scale*.7*10)/10):s.scale));if(s.rotation!==undefined)await page.getByLabel("Drawing rotation",{exact:true}).fill(String(s.rotation));await apply();await position(transform(s.p));}
 // Reshape the retained strokes into foothills, woodland edges and riverbank reeds, rather than isolated rows.
 const strokes:Record<string,{a:[number,number];b:[number,number];radius:number;spacing:number}>={
  "mountain-rounded":{a:[610,475],b:[870,490],radius:28,spacing:58},
  "mountain-craggy":{a:[880,430],b:[1050,480],radius:26,spacing:65},
  "mountain-snow-capped":{a:[1140,480],b:[1330,505],radius:26,spacing:64},
  "hill-low":{a:[470,590],b:[780,600],radius:35,spacing:62},
  "hill-rocky":{a:[1250,590],b:[1490,610],radius:31,spacing:60},
  "woodland-broadleaf-tree":{a:[450,735],b:[565,730],radius:30,spacing:43},
  "woodland-broadleaf-grove":{a:[720,770],b:[850,745],radius:32,spacing:57},
  "woodland-conifer-tree":{a:[1220,785],b:[1320,795],radius:30,spacing:42},
  "woodland-conifer-grove":{a:[1400,645],b:[1510,695],radius:30,spacing:63},
  "wetland-reeds":{a:[1120,880],b:[1150,985],radius:32,spacing:45}
 };
 for(const [id,s] of Object.entries(strokes)){
  const asset=latestIslandAssets.find(a=>a.id===id)!;await select(`${asset.name} painted terrain`);await page.getByLabel("Stroke brush size",{exact:true}).fill(String(branch==="generated"?Math.max(12,s.radius*.7):s.radius));await page.getByLabel("Stroke spacing",{exact:true}).fill(String(s.spacing));await apply();
  const ids=await page.getByLabel("Drawing point",{exact:true}).locator("option").evaluateAll(options=>options.map(o=>(o as HTMLOptionElement).value).filter(Boolean));
  for(let i=0;i<ids.length;i++){const t=ids.length===1?0:i/(ids.length-1);await page.getByLabel("Drawing point",{exact:true}).selectOption(ids[i]);await position(transform([s.a[0]+(s.b[0]-s.a[0])*t,s.a[1]+(s.b[1]-s.a[1])*t+Math.sin(t*Math.PI*2)*18]));}
 }
 await page.getByRole("button",{name:/^(Undo|Undo change)$/}).click();await page.getByRole("button",{name:/^(Redo|Redo change)$/}).click();
 const rotation=Math.round(angle)*Math.PI/180,scale=branch==="manual"?.6:.4;
 const harborPoint=(x:number,y:number)=>({x:harbor.x+scale*(x*Math.cos(rotation)-y*Math.sin(rotation)),y:harbor.y+scale*(x*Math.sin(rotation)+y*Math.cos(rotation))});
 const samples=[{name:"river outlet",point:mouth,land:false},{name:"harbor buildings",point:harborPoint(-42,-60),land:true},{name:"harbor boat",point:harborPoint(31,44),land:false},{name:"central pier end",point:harborPoint(-10,67),land:false},...Object.entries(labels).map(([name,p])=>({name:`${name} label anchor`,point:transform(p),land:true}))];
 const shorelineChecks=await checkShorelineSamples(page,samples);
 return {riverPoints,river,mouth,harbor,harborRotation:Math.round(angle),shorelineChecks,source:"Read-only sampling of the actual geographic land mask; all saved changes applied through website inspector forms",editingHistory:"Undo and redo final retained-stroke point adjustment"};
}
