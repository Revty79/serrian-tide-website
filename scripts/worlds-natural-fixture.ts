import {terrainSettingsSchema,terrainGeometry,readTile} from "../src/features/worlds/terrain";
import {calculateHydroFlow,hydroSuggestions} from "../src/features/worlds/terrain-hydrology-flow";
import {makeHydroAnalysis} from "../src/features/worlds/terrain-hydrology";
import {priorityWaterFlood,suggestedLakes} from "../src/features/worlds/terrain-water-basins";
import {riversIntoLakes} from "../src/features/worlds/terrain-water-network";
import {createHash,randomUUID} from "node:crypto";
import {writeFile} from "node:fs/promises";
import type {checkWaterDatabase} from "./worlds-water-db-checks";

export const naturalFixtureSettings=terrainSettingsSchema.parse({gridWidth:256,gridHeight:256,widthKm:64,heightKm:64,wrap:true});
/** Winding bedrock valleys, tributaries, ridges and two impoundments. This is
 * numerical test terrain, never a decorative perturbation of river geometry. */
export function naturalFixtureGrid(){return Int16Array.from({length:256*256},(_,i)=>{
  const x=(i%256+.5)/4,y=(Math.floor(i/256)+.5)/4,c=32+7*Math.sin(y*.09)+2*Math.sin(y*.23),main=Math.abs(x-c),
    left=20+(32-x)*.45+Math.sin(x*.3),right=45-(x-32)*.6+1.5*Math.sin(x*.4),
    side=Math.abs(y-(x<c?left:right)),relief=Math.min(main*72,side*125+main*12),
    noise=(Math.sin(x*.67+y*.28)+.6*Math.cos(y*.71-x*.31))*65*Math.min(1,main/4,side/2),
    basin=590*Math.exp(-((x-(32+7*Math.sin(35*.09)+2*Math.sin(35*.23)))**2+(y-35)**2)/8)
      +360*Math.exp(-((x-14)**2+(y-(20+18*.45+Math.sin(14*.3)))**2)/5);
  return Math.round((64-y)*23-160+relief+noise-basin);
});}
export const fineWaterSettings=terrainSettingsSchema.parse({gridWidth:128,gridHeight:128,widthKm:4,heightKm:4,wrap:true});
export function fineWaterGrid(){return Int16Array.from({length:128*128},(_,i)=>{const x=(i%128+.5)*31.25,y=(Math.floor(i/128)+.5)*31.25,base=y<3000?40+(3000-y)*.02:40+(4000-y)*.002;return Math.round(base+(y<2000?70:0)+Math.max(0,Math.abs(x-2000)-240)*.08);});}
export async function prepareNaturalFixture({world}:Parameters<typeof checkWaterDatabase>[0]){
  const terrain=await import("../src/features/worlds/terrain-service"),water=await import("../src/features/worlds/terrain-hydrology-service"),mapId="3c000000-0000-4000-8000-000000000001",settings=naturalFixtureSettings,shape=terrainGeometry(settings),grid=naturalFixtureGrid();
  await terrain.changeTerrain("world-god",world,{action:"create",requestId:mapId,name:"Winding mountain catchments",initial:"land",settings});
  await terrain.changeTerrain("world-god",world,{action:"save",mapId,revision:1,requestId:randomUUID(),seaLevel:0,source:{kind:"manual"},tiles:Array.from({length:64},(_,k)=>readTile(grid,k,shape))});
  const sources=(await water.getTerrainHydrology("world-god",world,mapId)).sources,source=sources.sources[0],analysis=makeHydroAnalysis(sources,source.frame,24e6,{lakeMinimumAreaM2:1e6,lakeMinimumDepthM:5}),flow=calculateHydroFlow({sources,patches:[{source,lod:0,width:256,height:256,grid}],focus:source.frame,minimumAreaM2:24e6}),lakes=suggestedLakes(flow,priorityWaterFlood(flow),analysis),layer=riversIntoLakes(hydroSuggestions(flow,analysis),lakes,sources.world);
  await water.saveTerrainHydrology("world-god",world,{mapId,revision:0,requestId:randomUUID(),layer});
  const sha=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex"),geography={edges:layer.edges.map(e=>e.points),lakes:layer.lakes?.map(l=>({rings:l.rings,levelM:l.levelM}))},receipt={mapId,gridSha256:createHash("sha256").update(Buffer.from(grid.buffer)).digest("hex"),geographySha256:sha(geography),channels:layer.edges.length,lakes:layer.lakes?.length,minimumAreaM2:24e6};
  await writeFile(`${process.env.SERRIAN_PASS8_EVIDENCE_DIR}/natural-fixture.json`,JSON.stringify(receipt,null,2)+"\n");return {mapId,flow,analysis,layer,sources};
}
