import {withRegionalEditingFixture} from "./worlds-regional-editing-fixture";
import {regionalEditingBrowser} from "./worlds-regional-editing-browser-checks";
import type {RegionalFixture} from "./worlds-regional-editing-fixture";
import assert from "node:assert/strict";
import {readFile,mkdir} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {tmpdir} from "node:os";
import path from "node:path";
import pg from "pg";
async function main(){
 if(!process.env.SERRIAN_WORKSPACE_RESUME)return withRegionalEditingFixture(regionalEditingBrowser);
 const input=path.resolve(process.env.SERRIAN_WORKSPACE_RESUME),out=path.resolve(process.env.SERRIAN_REGIONAL_EDIT_EVIDENCE!);assert.ok(input.startsWith(path.resolve("artifacts/regions-s44-") )&&out.startsWith(path.resolve("artifacts/regions-s44-")));assert.notEqual(path.dirname(input),out);
 const e=JSON.parse(await readFile(input,"utf8")),target=new URL(e.databaseUrl);assert.equal(target.hostname,"127.0.0.1");assert.notEqual(target.port,"5432");assert.equal(target.pathname,"/serrian_regional_editing");assert.ok(path.resolve(e.root).startsWith(path.join(tmpdir(),"serrian-regional-editing-")));assert.equal(path.resolve(e.data),path.join(path.resolve(e.root),"data"));assert.equal(path.resolve(e.terrainRoot),path.join(path.resolve(e.root),"terrain"));
 await mkdir(out,{recursive:true});const bin=process.env.SERRIAN_TEST_POSTGRES_BIN??"C:/Program Files/PostgreSQL/18/bin",runPostgres=(name:string,args:string[])=>{execFileSync(path.join(bin,name+(process.platform==="win32"?".exe":"")),args,{windowsHide:true,stdio:"ignore"});};let started=false;const pool=new pg.Pool({connectionString:e.databaseUrl});
 try{runPostgres("pg_ctl",["-D",e.data,"-l",path.join(e.root,"postgres.log"),"-o",`-h 127.0.0.1 -p ${target.port}`,"-w","start"]);started=true;await regionalEditingBrowser({...e,out,pool,runPostgres} as RegionalFixture);}finally{await pool.end();if(started)runPostgres("pg_ctl",["-D",e.data,"-m","fast","-w","stop"]);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
