/** CI-only newly owned PG18. Never selects an owner environment or reads dotenv. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdir,readFile,writeFile,copyFile} from "node:fs/promises";
import {randomUUID,createHash} from "node:crypto";
import path from "node:path";
import pg from "pg";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {hashPassword} from "better-auth/crypto";
assert.equal(process.env.SERRIAN_A5_OWNED_FIXTURE,"1");
assert.equal(await readFile("/owned/.a5-fixture","utf8"),"OWNED_SYNTHETIC_A5_ONLY\n");
const port=Number(process.env.SERRIAN_A5_PG_PORT),password=process.env.SERRIAN_A5_PG_PASSWORD!;assert(port>1024&&! [3000,3003,5432,5433].includes(port));assert(password?.length>=32);
const root="/owned",data=path.join(root,"postgres"),bin="/usr/lib/postgresql/18/bin",databaseUrl=`postgresql://postgres:${password}@127.0.0.1:${port}/serrian_deployment_fixture`;
const command=(name:string,args:string[])=>execFileSync(path.join(bin,name),args,{stdio:"pipe",windowsHide:true,maxBuffer:16*1024*1024});
const pool=new pg.Pool({connectionString:databaseUrl});
async function rows(){const names=(await pool.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows;const result:Record<string,string>={};for(const {tablename}of names){const text=JSON.stringify((await pool.query(`select to_jsonb(t) value from "${tablename.replaceAll('"','""')}" t order by to_jsonb(t)::text collate "C"`)).rows);result[tablename]=createHash("sha256").update(text).digest("hex");}return result;}
async function main(){
 if(process.argv.includes("--upgrade")){const before=await rows();await migrate(drizzle(pool),{migrationsFolder:"drizzle"});const after=await rows();for(const [name,value]of Object.entries(before))assert.equal(after[name],value,name);assert.equal((await pool.query("select count(*)::int n from drizzle.__drizzle_migrations")).rows[0].n,162);console.log(JSON.stringify({passed:true,explicitUpgrade:true,originalTablesExact:Object.keys(before).length}));return;}
 if(process.argv.includes("--mutate")){await pool.query("update \"user\" set name='Synthetic accepted post-start write' where id='a5-owner'");return;}
 await writeFile(path.join(root,"pg-password"),password,{mode:0o600,flag:"wx"});
 command("initdb",["-D",data,"-U","postgres","-A","scram-sha-256","--pwfile",path.join(root,"pg-password"),"--encoding=UTF8","--locale=C"]);
 command("pg_ctl",["-D",data,"-l",path.join(root,"postgres.log"),"-o",`-h 127.0.0.1 -p ${port}`,"-w","start"]);
 const admin=new pg.Pool({connectionString:databaseUrl.replace("serrian_deployment_fixture","postgres")});await admin.query("create database serrian_deployment_fixture");await admin.end();
 const journal=JSON.parse(await readFile("drizzle/meta/_journal.json","utf8")),folder=path.join(root,"baseline-161"),entries=journal.entries.slice(0,161);assert.equal(entries.at(-1).tag,"0160_world_canon_geography_copy");await mkdir(path.join(folder,"meta"),{recursive:true});await writeFile(path.join(folder,"meta/_journal.json"),JSON.stringify({...journal,entries}));for(const entry of entries)await copyFile(`drizzle/${entry.tag}.sql`,path.join(folder,entry.tag+".sql"));await migrate(drizzle(pool),{migrationsFolder:folder});
 await pool.query('insert into "user"(id,name,email,email_verified,username,display_username) values ($1,$2,$3,true,$2,$2)',["a5-owner","SyntheticOwner","a5-owner@example.invalid"]);
 await pool.query("insert into account(id,issuer,account_id,provider_id,user_id,password,updated_at) values('a5-credential','local:credential','a5-owner','credential','a5-owner',$1,now())",[await hashPassword("Synthetic-Deployment-Only-Password!")]);
 for(const role of["admin","god","player"])await pool.query("insert into user_role(user_id,role) values('a5-owner',$1)",[role]);
 for(const kind of["terrain","artwork","raster"])await mkdir(path.join(root,kind),{mode:0o700});
 process.env.DATABASE_URL=databaseUrl;process.env.SERRIAN_TERRAIN_ROOT="/owned/terrain";process.env.SERRIAN_ASSET_ROOT="/owned/artwork";process.env.SERRIAN_RASTER_ROOT="/owned/raster";
 const worlds=await import("../src/features/worlds/world-service"),terrain=await import("../src/features/worlds/terrain-service"),world=await worlds.createWorld("a5-owner",{name:"A5 synthetic preservation World"}),mapId=randomUUID();await terrain.changeTerrain("a5-owner",world,{action:"create",requestId:mapId,name:"Synthetic native source",initial:"land",settings:{gridWidth:64,gridHeight:64}});
 const {createGrid,readTile,terrainGeometry}=await import("../src/features/worlds/terrain"),doc=(await terrain.getTerrain("a5-owner",world,{mapId})).document!,shape=terrainGeometry(doc.settings),grid=createGrid(doc.baseElevation,doc.tiles,shape);grid[65]=777;await terrain.changeTerrain("a5-owner",world,{action:"save",requestId:randomUUID(),mapId,revision:1,seaLevel:0,tiles:[readTile(grid,0,shape)]});
 await(await import("../src/db")).pool.end();await writeFile("/owned/artwork/retained-diagnostic","Synthetic complete-root retention\n",{mode:0o600});await writeFile("/owned/raster/retained-diagnostic","Synthetic complete-root retention\n",{mode:0o600});
 await writeFile("/owned/info.json",JSON.stringify({databaseUrl,world,mapId,port,roots:{terrain:"/owned/terrain",artwork:"/owned/artwork",raster:"/owned/raster"}}),{mode:0o600});await pool.end();console.log("OWNED_A5_FIXTURE_READY");
 await new Promise<void>(resolve=>{for(const signal of["SIGINT","SIGTERM"])process.once(signal,()=>{command("pg_ctl",["-D",data,"-m","fast","-w","stop"]);resolve();});});
}
try{await main();}catch{console.error("OWNED_A5_FIXTURE_FAILED");process.exitCode=1;}finally{if(!pool.ended)await pool.end();}
