import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,writeFile,stat,readdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {stageTerrainTiles,readTerrainTile,terrainObjectPath,type TerrainStagingMetrics} from "../src/features/worlds/terrain-storage";
test("immutable tile reuse avoids duplicate writes and rejects corruption without replacing history",async()=>{
 const root=await mkdtemp(path.join(tmpdir(),"serrian-terrain-reuse-")),old=process.env.SERRIAN_TERRAIN_ROOT;
 const metrics=():TerrainStagingMetrics=>({writtenObjects:0,writtenBytes:0,reusedObjects:0,reusedBytes:0,duplicateReferences:0});
 try{process.env.SERRIAN_TERRAIN_ROOT=root;const tile={x:0,y:0,samples:Array<number>(1024).fill(42)},first=metrics(),[a,b]=await stageTerrainTiles(randomUUID(),randomUUID(),randomUUID(),[tile,{...tile,x:1}],first);assert.equal(a.sha256,b.sha256);assert.deepEqual(first,{writtenObjects:1,writtenBytes:2048,reusedObjects:0,reusedBytes:0,duplicateReferences:1});const file=terrainObjectPath(root,a.sha256),before=await stat(file),request=randomUUID(),second=metrics();assert.deepEqual((await stageTerrainTiles(request,randomUUID(),randomUUID(),[tile],second))[0],a);assert.equal((await stat(file)).mtimeMs,before.mtimeMs);assert.deepEqual(second,{writtenObjects:0,writtenBytes:0,reusedObjects:1,reusedBytes:2048,duplicateReferences:0});assert.deepEqual(await readdir(path.join(root,"staging",request)),["manifest.json"]);assert.deepEqual(await readTerrainTile(a),tile.samples);const bytes=await readFile(file),bad=Buffer.from(bytes);bad[0]^=1;await writeFile(file,bad);await assert.rejects(stageTerrainTiles(randomUUID(),randomUUID(),randomUUID(),[tile]),/immutable checksum/);assert.deepEqual(await readFile(file),bad);await writeFile(file,bytes);assert.deepEqual(await readTerrainTile(a),tile.samples);
 }finally{if(old===undefined)delete process.env.SERRIAN_TERRAIN_ROOT;else process.env.SERRIAN_TERRAIN_ROOT=old;}
});
