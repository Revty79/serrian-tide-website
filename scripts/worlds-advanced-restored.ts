/** Actual service reads against an explicitly supplied owned restored database. */
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
async function main(){
const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,"127.0.0.1");assert.notEqual(url.port,"5432");assert.ok(url.pathname.endsWith("_restored"));
const input=JSON.parse(await readFile(process.argv[2],"utf8"));
const terrain=await import("../src/features/worlds/terrain-service"),advanced=await import("../src/features/worlds/terrain-advanced-service"),environment=await import("../src/features/worlds/terrain-environment-service"),{pool}=await import("../src/db");
try{
  const document=(await terrain.getTerrain("world-god",input.world,{mapId:input.map})).document!;
  assert.ok(document.revision>3);assert.equal(document.source?.kind,"manual");
  const packet=await advanced.getAdvancedTerrainContext("world-god",input.world,input.map);
  assert.ok(packet.context.volcanoes.some(v=>v.id===input.volcanoId));
  assert.ok((await environment.getTerrainEnvironment("world-god",input.world,input.map)).layer.regions.some(r=>r.name==="Volcanic ash / debris (visual only)"));
  console.log(JSON.stringify({passed:true,revision:document.revision,restoredVolcano:true,restoredVisualCover:true,ownedOnly:true}));
}finally{await pool.end();}

}
main().catch(error=>{console.error(error);process.exitCode=1;});
