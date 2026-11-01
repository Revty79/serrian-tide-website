import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {getRegionHierarchy} from "../src/features/worlds/terrain-region-hierarchy-service";
import {getTerrain} from "../src/features/worlds/terrain-service";
import {pool} from "../src/db";
async function main(){const saved=JSON.parse(await readFile(process.argv[2],"utf8")),target=new URL(process.env.DATABASE_URL!);assert.equal(target.hostname,"127.0.0.1");assert.equal(target.pathname,"/serrian_hierarchy_restored");assert.notEqual(target.port,"5432");try{const current=await getRegionHierarchy("world-god",saved.nodes[0].worldId);assert.equal(current.available,true);assert.deepEqual(current.nodes,saved.nodes);for(const id of [saved.ids.alaska,saved.ids.local]){const doc=(await getTerrain("world-god",saved.nodes[0].worldId,{mapId:id})).document!;assert.equal(doc.sourceMapId,saved.nodes.find((n:{id:string})=>n.id===id).sourceWorldMapId);assert.ok(doc.tiles.length);}console.log("PASS restored hierarchy and actual numerical service reads");}finally{await pool.end();}}
void main().catch(error=>{console.error(error);process.exitCode=1;});
