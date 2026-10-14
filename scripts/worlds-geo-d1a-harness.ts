/** Owned disposable acceptance only. Never loads .env.local or contacts shared databases. */
import assert from "node:assert/strict";
import {execFileSync,spawn} from "node:child_process";
import {createWriteStream,existsSync} from "node:fs";
import {mkdir,mkdtemp,readFile,writeFile,copyFile} from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import {createHash} from "node:crypto";
import pg from "pg";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {databaseSnapshot,freePort} from "./worlds-geo-c.test";
import {fileDigest} from "../src/features/worlds/raster-storage";
import {checkDatabase} from "./raster-deployment";

export const DIRECTORY="artifacts/guidance/geo-d1a",SECRET="geo-d1a-disposable-auth-secret-only";
const bin=process.env.SERRIAN_TEST_PG_BIN??"C:/Program Files/PostgreSQL/18/bin",pgtool=(name:string)=>path.join(bin,name+(process.platform==="win32"?".exe":""));
type Environment={cluster:string;data:string;port:number;url:string;assets:string;appPort:number;baseUrl:string;checkout:string;backup:string;backupSha256:string};
export async function environment():Promise<Environment>{const e:Environment=JSON.parse(await readFile(`${DIRECTORY}/environment.json`,"utf8"));assert.equal(path.dirname(e.cluster),path.resolve(tmpdir()));assert.ok(path.basename(e.cluster).startsWith("serrian-geo-d1a-"));assert.equal(e.data,path.join(e.cluster,"data"));assert.equal(e.url,`postgresql://postgres@127.0.0.1:${e.port}/serrian_geo_d1a`);assert.notEqual(e.port,5432);assert.equal(e.baseUrl,`http://127.0.0.1:${e.appPort}`);assert.equal(e.checkout,path.resolve(DIRECTORY,"checkout"));assert.equal(e.assets,path.resolve("artifacts/guidance/geo-repair/paired-assets"));return e;}
export async function runtimeFingerprint(){const files=execFileSync("git",["ls-files","--cached","--others","--exclude-standard"],{encoding:"utf8",windowsHide:true}).trim().split(/\r?\n/).filter(f=>f.startsWith("src/")&&!f.endsWith(".test.ts")||/^(package(?:-lock)?\.json|next\.config\.ts|tsconfig\.json)$/.test(f)).sort(),hash=createHash("sha256");for(const f of files){hash.update(f);hash.update(await readFile(f));}return hash.digest("hex");}
async function setup(){
 assert.equal(process.versions.node.split(".")[0],"22");await mkdir(DIRECTORY,{recursive:true});assert.ok(!existsSync(`${DIRECTORY}/environment.json`),"Retain the existing owned environment; do not replace it");
 const recovery=JSON.parse(await readFile("artifacts/guidance/geo-repair/recovery-results.json","utf8")),backup=path.resolve("artifacts/guidance/geo-repair/paired-backup.dump"),backupSha256=await fileDigest(backup);assert.equal(backupSha256,recovery.databaseBackupSha256);
 const cluster=await mkdtemp(path.join(tmpdir(),"serrian-geo-d1a-")),data=path.join(cluster,"data"),port=await freePort(),appPort=await freePort();assert.notEqual(port,5432);
 const e:Environment={cluster,data,port,url:`postgresql://postgres@127.0.0.1:${port}/serrian_geo_d1a`,assets:path.resolve("artifacts/guidance/geo-repair/paired-assets"),appPort,baseUrl:`http://127.0.0.1:${appPort}`,checkout:path.resolve(DIRECTORY,"checkout"),backup,backupSha256};
 execFileSync(pgtool("initdb"),["-D",data,"-U","postgres","-A","trust","--encoding=UTF8","--locale=C"],{windowsHide:true,stdio:"pipe"});
 execFileSync(pgtool("pg_ctl"),["-D",data,"-l",path.join(cluster,"postgres.log"),"-o",`-h 127.0.0.1 -p ${port}`,"-w","start"],{windowsHide:true,stdio:"ignore"});await writeFile(`${DIRECTORY}/environment.json`,JSON.stringify(e,null,2));
 const admin=new pg.Pool({connectionString:`postgresql://postgres@127.0.0.1:${port}/postgres`});try{await admin.query("create database serrian_geo_d1a");await admin.query("create database serrian_geo_d1a_fresh");}finally{await admin.end();}
 execFileSync(pgtool("pg_restore"),["--dbname",e.url,"--no-owner","--no-privileges","--exit-on-error",backup],{windowsHide:true,stdio:"pipe"});
 const pool=new pg.Pool({connectionString:e.url}),fresh=new pg.Pool({connectionString:e.url+"_fresh"});
 try{const before=await databaseSnapshot(pool);await writeFile(`${DIRECTORY}/baseline.json`,JSON.stringify(before));const ledger=(await pool.query("select hash,created_at::text from drizzle.__drizzle_migrations order by id")).rows,journal=JSON.parse(await readFile("drizzle/meta/_journal.json","utf8"));assert.equal(ledger.length,132);assert.equal(journal.entries.length,132);for(const [i,row] of ledger.entries()){const bytes=await readFile(`drizzle/${journal.entries[i].tag}.sql`),digest=(b:Buffer|string)=>createHash("sha256").update(b).digest("hex");assert.ok([digest(bytes),digest(bytes.toString("utf8").replaceAll("\r\n","\n"))].includes(row.hash));assert.equal(row.created_at,String(journal.entries[i].when));}
  await migrate(drizzle(pool),{migrationsFolder:"drizzle"});assert.deepEqual(await databaseSnapshot(pool),before);const metadata=await checkDatabase(pool,e.assets);assert.deepEqual(await databaseSnapshot(pool),before);await migrate(drizzle(fresh),{migrationsFolder:"drizzle"});assert.equal(Number((await fresh.query("select count(*) n from drizzle.__drizzle_migrations")).rows[0].n),132);
  await writeFile(`${DIRECTORY}/setup-results.json`,JSON.stringify({backupSha256,existingRowsUnchanged:true,migrations:132,newMigrations:0,metadata},null,2));console.log("PASS verified backup restored, fresh/upgrade migration ledger and all private bundle identities");
 }finally{await pool.end();await fresh.end();}
}
async function build(){const e=await environment();await mkdir(e.checkout,{recursive:true});for(const file of execFileSync("git",["ls-files","--cached","--others","--exclude-standard","-z"],{encoding:"utf8",windowsHide:true}).split("\0").filter(Boolean)){if(file.startsWith("artifacts/"))continue;const destination=path.resolve(e.checkout,file);assert.ok(destination.startsWith(e.checkout+path.sep));await mkdir(path.dirname(destination),{recursive:true});await copyFile(file,destination);}
 if(!existsSync(path.join(e.checkout,"node_modules/next/dist/bin/next")))execFileSync(process.execPath,[path.join(path.dirname(process.execPath),"node_modules/npm/bin/npm-cli.js"),"ci","--offline","--include=dev"],{cwd:e.checkout,windowsHide:true,stdio:"pipe",maxBuffer:16*1024*1024});
 const fingerprint=await runtimeFingerprint(),log=createWriteStream(`${DIRECTORY}/build.log`);try{await new Promise<void>((r,j)=>{const child=spawn(process.execPath,["node_modules/next/dist/bin/next","build"],{cwd:e.checkout,windowsHide:true,env:{...process.env,PATH:path.dirname(process.execPath)+path.delimiter+process.env.PATH,NODE_ENV:"production",DATABASE_URL:e.url,SERRIAN_RASTER_ROOT:e.assets,BETTER_AUTH_URL:e.baseUrl,BETTER_AUTH_SECRET:SECRET,SERRIAN_TEST_NEXT_DIST_DIR:".next-geo-d1a",NEXT_TELEMETRY_DISABLED:"1"},stdio:["ignore","pipe","pipe"]});child.stdout!.pipe(log,{end:false});child.stderr!.pipe(log,{end:false});child.once("error",j);child.once("exit",code=>code===0?r():j(Error(`Build exited ${code}`)));});}finally{log.end();}assert.equal(await runtimeFingerprint(),fingerprint);await writeFile(`${DIRECTORY}/build-results.json`,JSON.stringify({passed:true,node:process.version,fingerprint},null,2));console.log("PASS isolated production build");}
async function stop(){const e=await environment();execFileSync(pgtool("pg_ctl"),["-D",e.data,"-m","fast","-w","stop"],{windowsHide:true,stdio:"pipe"});console.log("PASS owned disposable PostgreSQL stopped");}
if(process.argv[1]?.endsWith("worlds-geo-d1a-harness.ts")){const command=process.argv[2];(command==="setup"?setup():command==="build"?build():command==="stop"?stop():Promise.reject(Error("Expected setup, build or stop"))).catch(e=>{console.error(e);process.exitCode=1;});}
