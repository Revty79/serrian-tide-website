/** Existing maximum numerical dimensions; pure synthetic buffers, no database. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {writeFile} from "node:fs/promises";
import {terrainGeometry,terrainSettingsSchema} from "../src/features/worlds/terrain";
import {initializeAcceptedRefinement} from "../src/features/worlds/terrain-refinement-inheritance";
import type {RefinementMeta} from "../src/features/worlds/terrain-refinement";

async function main(){
const world=terrainGeometry(terrainSettingsSchema.parse({widthKm:3200,heightKm:1600,wrap:true})),root=new Int16Array(world.width*world.height).fill(-500),west:RefinementMeta={id:"43000000-0000-4000-8000-000000000001",worldId:"owned",terrainId:"owned",mapId:"owned",name:"Synthetic west",parentId:null,parentRevision:1,revision:2,level:1,frame:{x:372000,y:400000,width:128000,height:102400},gridWidth:2048,gridHeight:2048,overviewLevels:6,updatedAt:""},east={...west,id:"43000000-0000-4000-8000-000000000002",frame:{...west.frame,x:500000}},hash=(a:Int16Array)=>createHash("sha256").update(new Uint8Array(a.buffer)).digest("hex"),rootHash=hash(root),out=[];
for(const rows of [2048,4096]){const frame={x:480000,y:420000,width:128000,height:rows*25},started=performance.now(),sourceHashes:string[]=[];let activeLoads=0,maxActiveLoads=0,progress=0;
 const grid=await initializeAcceptedRefinement(root,world,frame,4096,rows,[east,west],async meta=>{activeLoads++;maxActiveLoads=Math.max(maxActiveLoads,activeLoads);const a=new Int16Array(2048*2048).fill(meta.id===west.id?200:600);sourceHashes.push(hash(a));activeLoads--;return a;},value=>{assert(value>=progress&&value<=1);progress=value;});
 let water=0,land=0;for(let y=0;y<rows;y++)for(let x=0;x<4096;x++){const expected=frame.y+y*25>=502400?-500:frame.x+x*31.25<500000?200:600;assert.equal(grid[y*4096+x],expected);if(expected<0)water++;else land++;}const last=hash(grid);assert.equal(hash(root),rootHash);assert.equal(maxActiveLoads,1);assert.equal(progress,1);assert.equal(sourceHashes.length,2);out.push({width:4096,height:rows,samples:grid.length,wholeBufferExact:true,rootUnchanged:true,oneAcceptedLoadAtATime:true,waterSamples:water,landSamples:land,gridSha256:last,elapsedMs:Math.round(performance.now()-started)});}
const receipt={syntheticOnly:true,noDatabaseOrOwnerEnvironment:true,existingCapacitiesUnchanged:true,cases:out};await writeFile(process.env.SERRIAN_INHERITED_CAPACITY_RECEIPT??"artifacts/inherited-crossing-capacity-results.json",JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
