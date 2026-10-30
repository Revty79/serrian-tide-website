import assert from "node:assert/strict";
import {readFile,writeFile,mkdir,cp} from "node:fs/promises";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createHash,randomUUID} from "node:crypto";
import {Pool} from "pg";
import {restoreTerrainBackup} from "./terrain-backup-restore";
import type {BrowserContext} from "playwright-core";
export async function restoreRegionalStorage(e:{databaseUrl:string;root:string},god:BrowserContext,api:string,world:string,map:string,id:string,revision:number,out:string){
 const u=new URL(e.databaseUrl);assert.equal(u.hostname,"127.0.0.1");assert.notEqual(u.port,"5432");assert.equal(u.pathname,"/serrian_atlas_s32");const backup=path.resolve(out,"storage-backup"),terrain=path.join(backup,"terrain"),dump=path.join(backup,"database.dump"),bin="C:/Program Files/PostgreSQL/18/bin";await mkdir(backup,{recursive:true});
 const expected:unknown[]=[];for(let r=1;r<=revision;r++)for(let lod=0;lod<=5;lod++){const columns=32/2**lod,tile=Math.floor(16/2**lod),key=tile*columns+tile,response=await god.request.get(`${api}/refinements?terrainMap=${map}&refinement=${id}&revision=${r}&historical=1&lod=${lod}&keys=${key}`);assert.equal(response.status(),200,await response.text());expected.push({revision:r,lod,key,body:await response.json()});}
 await writeFile(path.join(backup,"expected.json"),JSON.stringify({world,map,id,expected}));execFileSync(path.join(bin,"pg_dump.exe"),["--format=custom","--no-owner","--file",dump,e.databaseUrl],{windowsHide:true,stdio:"pipe"});await cp(path.join(e.root,"terrain"),terrain,{recursive:true});
 const name="serrian_atlas_s42_restore_"+randomUUID().slice(0,8),maintenance=new URL(u);maintenance.pathname="/postgres";const admin=new Pool({connectionString:maintenance.toString()}),target=new URL(u);target.pathname="/"+name;
 try{await admin.query(`create database ${name}`);await restoreTerrainBackup({pgRestore:path.join(bin,"pg_restore.exe"),psql:path.join(bin,"psql.exe"),dump,sql:path.join(backup,"restore.sql"),host:"127.0.0.1",port:Number(u.port),user:"postgres",database:name});
 const code="const fs=require('node:fs'),assert=require('node:assert/strict');(async()=>{const f=JSON.parse(fs.readFileSync(process.argv[1],'utf8')),service=require('./src/features/worlds/terrain-refinement-service.ts');for(const v of f.expected){const actual=await service.getRefinementTiles('world-god',f.world,f.map,f.id,{revision:v.revision,historical:true,lod:v.lod,keys:[v.key]});assert.deepEqual(actual,v.body);}await require('./src/db/index.ts').pool.end();console.log('PASS restored immutable revisions and every numerical overview with inherited references');})().catch(e=>{console.error(e);process.exitCode=1;});";
 const output=execFileSync(process.execPath,["--conditions=react-server","--import","tsx","-e",code,path.join(backup,"expected.json")],{env:{...process.env,DATABASE_URL:target.toString(),SERRIAN_ENVIRONMENT_ONLY:"1",SERRIAN_TERRAIN_ROOT:terrain},windowsHide:true,encoding:"utf8",timeout:120000});
 await writeFile(out+"/storage-paired-restore.json",JSON.stringify({passed:true,sharedDatabaseAccess:false,ownedRestore:name,revisions:revision,lods:6,restoredPinnedServiceReads:expected.length,pairedPrivateObjects:true,oldRevisionsAndMasksExact:true,unchangedOverviewReferencesInherited:true,dumpSha256:createHash("sha256").update(await readFile(dump)).digest("hex"),output:output.trim()},null,2)+"\n");
 }finally{await admin.end();}
}
