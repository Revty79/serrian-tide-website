import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {isRefinementBoundary} from "../src/features/worlds/terrain-refinement";
import {readTile,type TerrainGeometry} from "../src/features/worlds/terrain";
/** A full 4096 manifest is independently exercised, beyond single-tile UI edits. */
export async function fullDetailTransfer(world:string,mapId:string,refinementId:string,revision:number,grid:Int16Array,shape:TerrainGeometry,seaLevel:number){
 const service=await import("../src/features/worlds/terrain-transfer-service"),requestId=randomUUID(),tiles=[],manifest=[],started=performance.now();for(let y=0;y<shape.height;y++)for(let x=0;x<shape.width;x++)if(!isRefinementBoundary(x,y,shape.width,shape.height))grid[y*shape.width+x]++;
 for(let n=0;n<grid.length/1024;n++){const tile=readTile(grid,n,shape),bytes=Buffer.alloc(2048);tile.samples.forEach((v,i)=>bytes.writeInt16LE(v,i*2));tiles.push(tile);manifest.push({x:tile.x,y:tile.y,sha256:createHash("sha256").update(bytes).digest("hex")});}
 await service.changeTerrainTransfer("world-god",world,{op:"begin",refinementId,command:{action:"save",requestId,mapId,revision,seaLevel},tiles:manifest});
 for(let offset=0;offset<tiles.length;offset+=64)await service.changeTerrainTransfer("world-god",world,{op:"chunk",requestId,tiles:tiles.slice(offset,offset+64)});
 const accepted=await service.changeTerrainTransfer("world-god",world,{op:"finish",requestId});assert.equal(accepted.result?.revision,revision+1);assert.deepEqual(await service.changeTerrainTransfer("world-god",world,{op:"finish",requestId}),accepted);
 return{revision:revision+1,requestId,tiles:tiles.length,chunks:Math.ceil(tiles.length/64),elapsedMs:performance.now()-started,peakTestProcessRssBytes:process.resourceUsage().maxRSS*1024,exactRetry:true};
}
