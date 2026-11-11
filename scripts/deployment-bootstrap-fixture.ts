/** Newly owned CI source for the actual no-mount, no-Atlas bootstrap case. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdir,readFile,writeFile,copyFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import path from "node:path";
import pg from "pg";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {hashPassword} from "better-auth/crypto";

async function main(){
 assert.equal(process.env.SERRIAN_A5_OWNED_FIXTURE,"1");assert.equal(await readFile("/owned/.bootstrap-fixture","utf8"),"OWNED_BOOTSTRAP_FIXTURE\n");
 const port=Number(process.env.SERRIAN_A5_PG_PORT),password=process.env.SERRIAN_A5_PG_PASSWORD!;
 assert(port>1024&&![3000,3003,5432,5433].includes(port)&&password.length>=32);
 const databaseUrl=`postgresql://postgres:${password}@127.0.0.1:${port}/serrian_bootstrap_fixture`,pool=new pg.Pool({connectionString:databaseUrl}),bin="/usr/lib/postgresql/18/bin",data="/owned/postgres";
 const pgCommand=(name:string,args:string[])=>execFileSync(path.join(bin,name),args,{stdio:"pipe",maxBuffer:16*1024*1024});
 try{
  if(process.argv.includes("--upgrade")){
   const folder="/owned/windows-upgrade",journal=JSON.parse(await readFile("drizzle/meta/_journal.json","utf8"));await mkdir(path.join(folder,"meta"),{recursive:true});await writeFile(path.join(folder,"meta/_journal.json"),JSON.stringify(journal));
   for(const entry of journal.entries){const source=await readFile(`drizzle/${entry.tag}.sql`);await writeFile(path.join(folder,entry.tag+".sql"),entry.idx===161?source.toString().replaceAll("\r\n","\n").replaceAll("\n","\r\n"):source);}
   await migrate(drizzle(pool),{migrationsFolder:folder});console.log("OWNED_BOOTSTRAP_WINDOWS_MIGRATION_PASSED");return;
  }
  if(process.argv.includes("--mutate")){await pool.query("update \"user\" set name='Accepted new writer' where id='bootstrap-owner'");return;}
  if(process.argv.includes("--world")){process.env.DATABASE_URL=databaseUrl;await(await import("../src/features/worlds/world-service")).createWorld("bootstrap-owner",{name:"Synthetic blocking World"});await(await import("../src/db")).pool.end();return;}
  if(process.argv.includes("--bad-ledger")||process.argv.includes("--repair-ledger")){
   const sql=(await readFile("drizzle/0161_atlas_expanded_numerical_terrain.sql","utf8")).replaceAll("\r\n","\n").replaceAll("\n","\r\n"),hash=process.argv.includes("--bad-ledger")?"0".repeat(64):createHash("sha256").update(sql).digest("hex");await pool.query("update drizzle.__drizzle_migrations set hash=$1 where created_at=1794317081391",[hash]);return;
  }
  await writeFile("/owned/password",password,{flag:"wx",mode:0o600});pgCommand("initdb",["-D",data,"-U","postgres","--auth=scram-sha-256","--pwfile=/owned/password","--encoding=UTF8","--locale=C"]);
  pgCommand("pg_ctl",["-D",data,"-l","/owned/postgres.log","-o",`-h 127.0.0.1 -p ${port} -k /owned -c jit=off`,"-w","start"]);
  const admin=new pg.Pool({connectionString:databaseUrl.replace("serrian_bootstrap_fixture","postgres")});await admin.query("create database serrian_bootstrap_fixture");await admin.end();
  const journal=JSON.parse(await readFile("drizzle/meta/_journal.json","utf8")),entries=journal.entries.slice(0,161),folder="/owned/migrations";
  await mkdir(path.join(folder,"meta"),{recursive:true});await writeFile(path.join(folder,"meta/_journal.json"),JSON.stringify({...journal,entries}));for(const entry of entries)await copyFile(`drizzle/${entry.tag}.sql`,path.join(folder,entry.tag+".sql"));await migrate(drizzle(pool),{migrationsFolder:folder});
  await pool.query('insert into "user"(id,name,email,email_verified,username,display_username) values ($1,$2,$3,true,$2,$2)',["bootstrap-owner","BootstrapOwner","bootstrap-owner@example.invalid"]);
  await pool.query("insert into account(id,issuer,account_id,provider_id,user_id,password,updated_at) values('bootstrap-credential','local:credential','bootstrap-owner','credential','bootstrap-owner',$1,now())",[await hashPassword("Synthetic-Bootstrap-Only-Password!")]);
  for(const role of["admin","god","player"])await pool.query("insert into user_role(user_id,role) values('bootstrap-owner',$1)",[role]);
  await writeFile("/owned/info.json",JSON.stringify({databaseUrl,port}),{mode:0o600});await pool.end();console.log("OWNED_BOOTSTRAP_FIXTURE_READY");
  await new Promise<void>(resolve=>{const alive=setInterval(()=>{},60000);for(const sig of["SIGINT","SIGTERM"])process.once(sig,()=>{clearInterval(alive);pgCommand("pg_ctl",["-D",data,"-m","fast","-w","stop"]);resolve();});});
 }finally{if(!pool.ended)await pool.end();}
}
void main().catch(()=>{console.error("OWNED_BOOTSTRAP_FIXTURE_FAILED");process.exitCode=1;});
