import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {readFile,writeFile} from "node:fs/promises";
import {createGrid,readTile,terrainGeometry} from "../src/features/worlds/terrain";
import {initializeRefinement,rootFrame} from "../src/features/worlds/terrain-refinement";
import type {checkHydrologyBrowser} from "./worlds-hydrology-browser-checks";
/** Explicit disposable acceptance, never automatic zoom-driven geographic creation. */
export async function createRegionalQualityFixture({god,base,world:sourceWorld,out}:Parameters<typeof checkHydrologyBrowser>[0]){
 assert.equal(new URL(base).hostname,"127.0.0.1");assert.notEqual(new URL(base).port,"3000");
 const env=JSON.parse(await readFile(process.env.SERRIAN_S42_ENVIRONMENT??"artifacts/worlds-atlas-s32/environment.json","utf8"));assert.equal(base,env.base);assert.equal(sourceWorld,env.world);const db=new URL(env.databaseUrl);assert.equal(db.hostname,"127.0.0.1");assert.notEqual(db.port,"5432");assert.equal(db.pathname,"/serrian_atlas_s32");
 const createdWorld=await god.request.post(`${base}/api/worlds`,{headers:{Origin:base},data:{name:"S42 owned fine-detail fixture"}});assert.equal(createdWorld.status(),200,await createdWorld.text());const world=(await createdWorld.json()).id;
 const api=`${base}/api/worlds/${world}/terrain`,post=async(url:string,data:unknown)=>{const r=await god.request.post(url,{headers:{Origin:base},data});assert.equal(r.status(),200,await r.text());return r.json();},read=async(url:string)=>(await(await god.request.get(url)).json());
 const map=(await post(api,{action:"create",requestId:randomUUID(),name:"S42 accepted fine island World",initial:"ocean",settings:{gridWidth:1024,gridHeight:1024,widthKm:1000000,heightKm:1000000}})).id,doc=(await read(`${api}?terrainMap=${map}`)).document,shape=terrainGeometry(doc.settings),frame={x:500000000,y:500000000,width:20000,height:20000},baseGrid=createGrid(doc.baseElevation,doc.tiles,shape),grid=initializeRefinement(baseGrid,shape,rootFrame(shape),frame,1024,1024,shape),id=randomUUID();
 await post(`${api}/refinements?terrainMap=${map}`,{action:"create",requestId:id,mapId:map,parentId:null,parentRevision:doc.revision,name:"S42 saved one-kilometre island",frame,gridWidth:1024,gridHeight:1024,previewHash:createHash("sha256").update(new Uint8Array(grid.buffer)).digest("hex")});
 const changed=new Set<number>();for(let y=470;y<=554;y++)for(let x=470;x<=554;x++){const distance=Math.hypot((x-512)*frame.width/1024,(y-512)*frame.height/1024);if(distance>=900)continue;const height=Math.round(-500+850*(1-distance/900));grid[y*1024+x]=height;changed.add(Math.floor(y/32)*32+Math.floor(x/32));}
 const fineShape={...shape,displayWidth:frame.width,displayHeight:frame.height,wrap:false};await post(`${api}/refinements?terrainMap=${map}&refinement=${id}`,{action:"save",requestId:randomUUID(),mapId:map,revision:1,seaLevel:doc.seaLevel,source:{kind:"manual"},tiles:[...changed].map(k=>readTile(grid,k,fineShape))});
 const index=await read(`${api}/refinements?terrainMap=${map}`),region=(await post(`${api}/regions?terrainMap=${map}`,{action:"create-region",requestId:randomUUID(),parentMapId:map,terrainId:doc.terrainId,parentRevision:doc.mapRevision,sourceRevision:doc.revision,sourceState:index.sourceState,name:"S42 saved island regional view",frame:{x:frame.x+7000,y:frame.y+7000,width:6000,height:6000}})).id;
 const fixture={world,map,region,refinement:id,frame,point:{x:frame.x+10000,y:frame.y+10000},islandDiameterMetres:1800*(1-500/850),spacing:20000/1024,explicitAcceptedNumericalFeature:true};await writeFile(out+"/accepted-fine-fixture.json",JSON.stringify(fixture,null,2)+"\n");return fixture;
}
