import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {sculpt,finishPatch,readTile,type Brush,type TerrainGeometry} from "../src/features/worlds/terrain";
import {prepareTerrainOperation,type TerrainOperation} from "../src/features/worlds/terrain-operations";
import {defaultGenerationV1} from "../src/features/worlds/terrain-source";
/** Native engines and actual immutable saves on the accepted 4096 source. */
export async function resolutionToolsChecks(world:string,mapId:string,id:string,revision:number,expected:Int16Array,shape:TerrainGeometry,seaLevel:number){
 const service=await import("../src/features/worlds/terrain-refinement-service"),groups=[];
 async function save(indices:Iterable<number>){const started=performance.now();const keys=[...new Set([...indices].map(n=>Math.floor(n/shape.width/32)*(shape.width/32)+Math.floor(n%shape.width/32)))];assert(keys.length);const accepted=await service.saveRefinement("world-god",world,id,{action:"save",requestId:randomUUID(),mapId,revision,seaLevel,tiles:keys.map(k=>readTile(expected,k,shape))});assert.equal(accepted.revision,revision+1);revision=accepted.revision;return performance.now()-started;}
 for(const tool of["raise","lower","smooth","level","coast-land","coast-water","coast-smooth"] as const){const before=new Map<number,number>(),brush:Brush={tool,radius:4,strength:250,target:200,seaLevel,coastHeight:1000,coastBand:10000};const started=performance.now();sculpt(expected,3000,3000,brush,before,shape);const patch=finishPatch(expected,before);assert(patch.indices.length,tool+" must change native samples");const kernelMs=performance.now()-started,saveMs=await save(patch.indices);groups.push({tool,revision,changed:patch.indices.length,kernelMs,saveMs});}
 const fields={tool:"raise" as const,target:0,amount:20,strength:100,passes:1,feather:0};const operations:TerrainOperation[]=[{kind:"area",area:{x:3030,y:3030,width:8,height:8},...fields},{kind:"polygon-area",points:[{x:3040,y:3040},{x:3050,y:3040},{x:3045,y:3050}],...fields},...(["ridge","valley"] as const).map(kind=>({kind,points:[{x:3060,y:3060},{x:3070,y:3070}],radius:3,height:100,hardness:.3}))];
 for(const op of operations){const started=performance.now(),result=prepareTerrainOperation(expected,shape,op);assert(result.changed);expected.set(result.grid);const kernelMs=performance.now()-started,saveMs=await save(result.patch.indices);groups.push({tool:op.kind,revision,changed:result.changed,kernelMs,saveMs});}
 const key=Math.floor(3000/32)*(shape.width/32)+Math.floor(3000/32),tile=readTile(expected,key,shape),n=3000%32*32+3000%32;tile.samples[n]++;
 await assert.rejects(service.saveRefinement("world-god",world,id,{action:"save",requestId:randomUUID(),mapId,revision,seaLevel,tiles:[tile],source:{kind:"regenerated",recipe:defaultGenerationV1,area:{x:3000,y:3000,width:1,height:1},preserveManual:true,feather:0}}),/protected manual/);
 return{revision,groups,manualProtectedRegenerationRejected:true};
}
