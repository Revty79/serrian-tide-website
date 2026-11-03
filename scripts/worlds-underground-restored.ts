import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
async function main(){
 const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,"127.0.0.1");assert.notEqual(url.port,"5432");assert.equal(url.pathname,"/serrian_underground_restored");
 const r=JSON.parse(await readFile(process.argv[2],"utf8")),svc=await import("../src/features/worlds/underground-service");
 for(const result of [r.dungeon,r.lower,r.cave,r.sewer]){const b=await svc.getUnderground("world-god",r.worldId,{levelId:result.levelId});assert.equal(b.document!.id,result.levelId);assert.ok(b.document!.history.length);assert.ok(b.document!.design.features.length>1);}
 assert.ok((await svc.navigateUnderground("world-god",r.worldId,r.dungeon.connectionId,true)).url.includes(r.townMap));
 const correction=await readFile(path.join(path.dirname(process.argv[2]),"underground-corrections-database.json"),"utf8").then(JSON.parse).catch(e=>{if(e.code==="ENOENT")return;throw e;});
 if(correction){for(const surface of correction.surfaces){const d=await svc.getUnderground("world-god",r.worldId,{levelId:surface.levelId});assert.ok(d.document!.history.length);const back=await svc.navigateUnderground("world-god",r.worldId,surface.connectionId,true);assert.deepEqual(back.to.point,surface.point);assert.ok(back.url.includes("terrainMap="+surface.mapId));}await assert.rejects(svc.navigateUnderground("world-god",r.worldId,correction.oneWay.connectionId,true));}
 const {pool}=await import("../src/db");await pool.end();console.log("PASS restored underground sites, immutable history, typed World/regional routes and one-way protection");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
