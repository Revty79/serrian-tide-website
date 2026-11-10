/** Resume only this milestone's newly owned synthetic fixture. Never accepts shared targets. */
import assert from "node:assert/strict";
import path from "node:path";
import {tmpdir} from "node:os";
import {execFileSync} from "node:child_process";
import {access,readFile,writeFile,mkdir} from "node:fs/promises";
import pg from "pg";
import {ownedFreePort,type RegionalFixture} from "./worlds-regional-editing-fixture";
import {runGraphicsA2Browser,type GraphicsFixture} from "./worlds-graphics-a2-browser";

async function main(){
 const input=path.resolve(process.env.SERRIAN_A2_FIXTURE_ENVIRONMENT??"artifacts/regions-s43-graphics-a2-baseline-2/environment.json");assert(input.startsWith(path.resolve("artifacts/regions-s43-graphics-a2-") ));assert.equal(path.basename(input),"environment.json");
 const e=JSON.parse(await readFile(input,"utf8")),fixture=JSON.parse(await readFile(path.join(path.dirname(input),"graphics-fixture.json"),"utf8")) as GraphicsFixture;
 assert.equal(fixture.synthetic,true);assert.deepEqual(fixture.externalSources,[]);assert.equal(fixture.world,e.world);assert(path.resolve(e.root).startsWith(path.join(tmpdir(),"serrian-regional-editing-")));assert.equal(path.resolve(e.data),path.join(path.resolve(e.root),"data"));
 assert.equal((await readFile(path.join(e.data,"PG_VERSION"),"utf8")).trim(),"18");assert.equal(await access(path.join(e.data,"postmaster.pid")).then(()=>true,()=>false),false,"Resume requires its owned fixture to be stopped");
 const phase=process.env.SERRIAN_A2_PHASE??"baseline";assert(phase==="baseline"||phase==="candidate");const out=path.resolve(process.env.SERRIAN_A2_OUT??"artifacts/atlas-graphics-a2/baseline-3");assert(out.startsWith(path.resolve("artifacts/atlas-graphics-a2")+path.sep));await mkdir(out,{recursive:true});
 const port=await ownedFreePort();assert(![3000,3003,5432,5433].includes(port));for(const name of ["databaseUrl","restoredUrl"]){const u=new URL(e[name]);assert.equal(u.hostname,"127.0.0.1");assert(["/serrian_regional_editing","/serrian_regional_editing_restored"].includes(u.pathname));u.port=String(port);e[name]=u.toString();}
 const bin=process.env.SERRIAN_TEST_POSTGRES_BIN??"C:/Program Files/PostgreSQL/18/bin",execute=(name:string,args:string[])=>execFileSync(path.join(bin,name+".exe"),args,{windowsHide:true,stdio:"ignore"});let started=false,pool:pg.Pool|undefined;
 try{
  execute("pg_ctl",["-D",e.data,"-l",path.join(e.root,"postgres.log"),"-o",`-h 127.0.0.1 -p ${port}`,"-w","start"]);started=true;pool=new pg.Pool({connectionString:e.databaseUrl});
  const who=(await pool.query("select current_database() name,current_setting('data_directory') directory,inet_server_port() port")).rows[0];assert.equal(who.name,"serrian_regional_editing");assert.equal(path.resolve(who.directory),path.resolve(e.data));assert.equal(who.port,port);
  await writeFile(path.join(out,"owned-environment.json"),JSON.stringify({...e,pool:undefined,sourceEnvironment:input,phase},null,2));
  const f={...e,pool,runPostgres:execute} as RegionalFixture;
  if(process.env.SERRIAN_A2_PERSISTENCE_ONLY==="1"){await(await import("./worlds-graphics-a2-persistence")).graphicsA2Persistence(f,fixture,out);return;}
  await runGraphicsA2Browser(f,fixture,{phase,out,checkout:path.resolve(process.env.SERRIAN_A2_CHECKOUT??"artifacts/atlas-keyboard-1/runtime"),dist:process.env.SERRIAN_A2_DIST??".next-keyboard-a1",sourceHash:process.env.SERRIAN_A2_SOURCE_HASH??"04ec7e8ff1a3cb7a64a7d2d9da6f9c8f7f073d7ecdf97ddfb252428047a6ad91"});
 }finally{await pool?.end();if(started)execute("pg_ctl",["-D",e.data,"-m","fast","-w","stop"]);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
