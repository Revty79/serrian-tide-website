import {stageRowHashes} from "./worlds-atlas-checkpoint-stage-rows";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile,readdir,stat,writeFile} from "node:fs/promises";
import path from "node:path";
import type {RegionalFixture} from "./worlds-regional-editing-fixture";
async function retainedRows(f:RegionalFixture){const names=(await f.pool.query("select tablename from pg_tables where schemaname='public' and tablename not like 'world_underground_%' and tablename not like 'atlas_%' and tablename not like 'world_craft%' order by tablename")).rows;return stageRowHashes(f,names.map(row=>row.tablename as string));}
async function privateFiles(f:RegionalFixture){const result=[];for(const name of (await readdir(f.terrainRoot,{recursive:true})).sort()){const target=path.join(f.terrainRoot,name),info=await stat(target);if(info.isFile())result.push({name,bytes:info.size,hash:createHash("sha256").update(await readFile(target)).digest("hex")});}return result;}
export async function prepareCurrentUnderground(f:RegionalFixture){
 assert.ok(path.resolve(f.root).startsWith(path.join(path.resolve(f.out),"owned-temp")+path.sep));
 await writeFile(path.join(f.out,"before-0153-rows.json"),JSON.stringify(await retainedRows(f)));
 await writeFile(path.join(f.out,"before-0153-private.json"),JSON.stringify(await privateFiles(f)));
 await import("./worlds-underground-disposable.test").then(module=>module.undergroundDatabase(f,false));
}
