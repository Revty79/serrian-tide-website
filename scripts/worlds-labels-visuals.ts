import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {writeFile} from "node:fs/promises";
import type {checkHydrologyBrowser} from "./worlds-hydrology-browser-checks";
import {environmentFixtureId} from "./worlds-environment-fixture";
import {environmentCamera} from "./worlds-environment-visuals";
import {environmentReady,environmentPhoto} from "./worlds-environment-browser-checks";
import {labelsPanel} from "./worlds-labels-browser-checks";
import {terrainActiveTool,closeTerrainSettings,terrainPanel} from "./worlds-terrain-browser-ui";
import {EMPTY_LABELS,newMapLabel} from "../src/features/worlds/terrain-labels";
import {biomeVegetation,type Biome,type EnvironmentRegion} from "../src/features/worlds/terrain-environment";
export async function checkLabelsVisuals({god,base,world,out,errors}:Parameters<typeof checkHydrologyBrowser>[0]){
 const map=environmentFixtureId,api=`${base}/api/worlds/${world}/terrain`,url=(kind:string)=>`${api}/${kind}?terrainMap=${map}`,read=async(kind:string)=>(await(await god.request.get(url(kind))).json()),original={labels:await read("labels"),environment:await read("environment"),artwork:await read("artwork")},p=await god.newPage();p.setDefaultTimeout(120000);p.on("pageerror",e=>errors.push(e.message));const captures=[];
 async function update(kind:keyof typeof original,layer:unknown){const head=await read(kind);assert.equal((await god.request.post(url(kind),{headers:{Origin:base},data:{mapId:map,revision:head.headRevision,requestId:randomUUID(),layer}})).status(),200);}
 try{for(const [name,biome,appearance,span,point] of [
  ["dark-forest","boreal","realistic-terrain",400,{x:700000,y:700000}],
  ["bright-desert","hotDesert","realistic-terrain",400,{x:700000,y:700000}],
  ["snow-ice","ice","realistic-terrain",400,{x:700000,y:700000}],
  ["busy-fantasy","boreal","illustrated-fantasy",400,{x:700000,y:700000}],
  ["mountain-relief",null,"realistic-terrain",900000,{x:1000000,y:700000}],
  ["scientific-contours",null,"topographic",900000,{x:1000000,y:700000}],
 ] as const){if(biome){const vegetation=biomeVegetation[biome as Biome],region:EnvironmentRegion={id:randomUUID(),name:"Creator-authored label contrast study",shape:"brush",points:[point],kind:"biome",effect:"override",radiusM:span*2,strength:1,biome,...vegetation,scaleM:8,clustering:.65,protected:true};await update("environment",{...original.environment.layer,regions:[...original.environment.layer.regions,region,{...region,id:randomUUID(),kind:"vegetation"}]});}else await update("environment",original.environment.layer);
  await update("artwork",{...original.artwork.layer,automatic:true,manual:false,placements:[],pack:appearance==="illustrated-fantasy"?"fantasy":"natural",density:1.1});const labels=[{...newMapLabel(randomUUID(),"Étoile — 山の国",point,"region"),sizePx:26,force:true},{...newMapLabel(randomUUID(),"Creator annotation\nPunctuation, accents & Unicode",{x:point.x+span*.22,y:point.y+span*.17}),sizePx:15,align:"left" as const,force:true}];const layer={...EMPTY_LABELS,labels,composition:{...EMPTY_LABELS.composition,title:{...EMPTY_LABELS.composition.title,visible:true,text:"A CARTOGRAPHER’S STUDY",subtitle:"Geographic labels · independent presentation"},scale:{...EMPTY_LABELS.composition.scale,visible:true},north:{...EMPTY_LABELS.composition.north,visible:true},frame:{...EMPTY_LABELS.composition.frame,visible:true}}};await update("labels",layer);
  await p.goto(`${base}/worlds/${world}?tab=atlas&terrainMap=${map}`);const c=p.getByLabel("Terrain map canvas",{exact:true});await c.waitFor();await p.getByRole("button",{name:"Expand editor",exact:true}).click();await terrainPanel(p,"World");await p.getByLabel("Map Appearance",{exact:true}).selectOption(appearance);await closeTerrainSettings(p);await environmentCamera(p,point,span);await labelsPanel(p);await p.getByRole("button",{name:"Preview map presentation",exact:true}).click();assert.equal(await terrainActiveTool(p),"pan");await closeTerrainSettings(p);for(let i=0;i<2;i++){const b=(await c.boundingBox())!,v=await c.evaluate(c=>({x:Number(c.dataset.viewX),y:Number(c.dataset.viewY),scale:Number(c.dataset.zoom)})),dx=b.width/2-(v.x+point.x*v.scale),dy=b.height/2-(v.y+point.y*v.scale);if(Math.abs(dx)<1&&Math.abs(dy)<1)break;await p.mouse.move(b.x+b.width/2,b.y+b.height/2);await p.mouse.down({button:"middle"});await p.mouse.move(b.x+b.width/2+dx,b.y+b.height/2+dy,{steps:2});await p.mouse.up({button:"middle"});}await environmentReady(p);await environmentPhoto(p,out,"labels-legibility-"+name);const stats=JSON.parse((await c.getAttribute("data-label-stats"))!);assert.ok(stats.drawn>=1);assert.ok(stats.scaleBarMetres>0);assert.deepEqual((await read("labels")).layer,layer);captures.push({name,appearance,creatorAuthoredBiome:biome,spanMetres:span,stats,geographicSourcesSha256:createHash("sha256").update(JSON.stringify((await read("environment")).sources)).digest("hex")});}
 await writeFile(out+"/labels-visuals.json",JSON.stringify({passed:true,actualProductionBrowser:true,gpuDisabled:true,localImagesOnly:true,captures,ownerArtisticAcceptance:"not recorded"},null,2)+"\n");
 }finally{await p.close();for(const kind of ["environment","artwork","labels"] as const){await update(kind,original[kind].layer);assert.deepEqual((await read(kind)).layer,original[kind].layer);}}
}
