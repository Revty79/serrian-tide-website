import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {getAssetComposition,getAssetImage,getAssetLibrary} from "../src/features/worlds/atlas-asset-service";
import {pool} from "../src/db";
async function main(){const r=JSON.parse(await readFile(process.argv[2],"utf8")),lib=await getAssetLibrary("world-god",r.world);assert.equal(lib.assets.length,2);assert.ok(lib.favorites.includes(r.symbol));assert.equal(lib.assets.find(a=>a.id===r.reference)!.versions.length,3);assert.equal((await getAssetComposition("world-god",r.world,{kind:"terrain",id:"43000000-0000-4000-8000-000000000001"})).layer.placements[0].version,1);assert.ok((await getAssetImage("world-god",r.world,r.reference,1,"768")).length);assert.ok((await getAssetImage("world-god",r.world,r.symbol,1,"128")).length);console.log("PASS restored service reads and exact asset versions");}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>pool.end());
