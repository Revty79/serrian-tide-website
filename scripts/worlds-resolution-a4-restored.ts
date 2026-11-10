/** Fresh-process native readers: no cached source buffers or authoring writes. */
import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {createGrid,terrainGeometry} from "../src/features/worlds/terrain";
async function main(){
 const expected=JSON.parse(await readFile(process.argv[2],"utf8")),target=new URL(process.env.DATABASE_URL!);assert.equal(target.hostname,"127.0.0.1");assert(!["5432","5433"].includes(target.port));assert.equal(target.pathname,"/serrian_regional_editing_restored");
 const terrain=await import("../src/features/worlds/terrain-service"),detail=await import("../src/features/worlds/terrain-refinement-service"),{pool}=await import("../src/db");
 const hash=(grid:Int16Array)=>createHash("sha256").update(new Uint8Array(grid.buffer,grid.byteOffset,grid.byteLength)).digest("hex");
 try{const document=(await terrain.getTerrain("world-god",expected.world,{mapId:expected.mapId})).document!;assert.equal(document.revision,expected.rootRevision);assert.equal(hash(createGrid(document.baseElevation,document.tiles,terrainGeometry(document.settings))),expected.rootSha256);
  const index=await detail.getRefinements("world-god",expected.world,expected.mapId);for(const [id,digest]of[[expected.detailId,expected.detailSha256],[expected.childId,expected.childSha256]]){const meta=index.refinements.find(m=>m.id===id)!;assert(meta);const grid=new Int16Array(meta.gridWidth*meta.gridHeight);for(let offset=0;offset<grid.length/1024;offset+=64){const keys=Array.from({length:Math.min(64,grid.length/1024-offset)},(_,n)=>offset+n),packet=await detail.getRefinementTiles("world-god",expected.world,expected.mapId,id,{revision:meta.revision,lod:0,keys});for(const tile of packet.tiles)for(let y=0;y<32;y++)grid.set(tile.samples.slice(y*32,y*32+32),(tile.y*32+y)*meta.gridWidth+tile.x*32);}assert.equal(hash(grid),digest);const history=await detail.getRefinementHistory("world-god",expected.world,expected.mapId,id);assert(history.versions.some(v=>v.revision===1));}
  assert.equal((await pool.query("select count(*)::int n from drizzle.__drizzle_migrations")).rows[0].n,162);await writeFile(process.argv[3],JSON.stringify({passed:true,freshProcess:true,normalNativeReaders:true,exactAllRootAndRefinementSamples:true,immutableHistoryAvailable:true,migrations:162},null,2));
 }finally{await pool.end();}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
