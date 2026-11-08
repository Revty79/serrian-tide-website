import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import {createReadStream,createWriteStream} from "node:fs";
import {Transform} from "node:stream";
import {pipeline} from "node:stream/promises";
/** Restore a locally created, verified backup into an EMPTY, newly owned target.
 * Legacy CHECK validators call other public validators without qualification.
 * pg_restore's empty session search_path makes those valid retained rows fail.
 * Set the replay session path explicitly; do not change any function or row.
 * The caller must verify target identity and supply the private SQL destination.
 */
export async function restoreTerrainBackup(options: { pgRestore: string; psql: string; dump: string; sql: string; host: string; port: number; user: string; database: string; env?: NodeJS.ProcessEnv; dataOnly?:boolean; singleTransaction?:boolean; streaming?:boolean }) {
  if(options.streaming){
    assert.ok(options.singleTransaction&&!options.dataOnly,"Portable restoration requires a complete, constrained single transaction");
    const raw=options.sql+".unmodified",statement="SELECT pg_catalog.set_config('search_path', '', false);";let tail="",matches=0,processed=0;
    execFileSync(options.pgRestore,["--no-owner","--no-privileges","--no-tablespaces","--file",raw,options.dump],{windowsHide:true,stdio:"pipe",env:options.env,maxBuffer:8*1024*1024});
    // Rewrite only the early archive preamble. Identical text inside a retained
    // user record must survive unchanged. Never buffer an entire COPY row.
    const replace=(chunk:string,final=false)=>{const input=tail+chunk;let cursor=0,result="",at:number;while((at=input.indexOf(statement,cursor))>=0){if(matches===0){assert.ok(processed+at<65536,"Review a changed dump preamble before restoration");result+=input.slice(cursor,at)+"SELECT pg_catalog.set_config('search_path', 'pg_catalog,public', false);";matches++;}else result+=input.slice(cursor,at)+statement;cursor=at+statement.length;}const end=final?input.length:Math.max(cursor,input.length-statement.length+1);result+=input.slice(cursor,end);tail=input.slice(end);processed+=end;return result;};
    const transform=new Transform({decodeStrings:false,transform(chunk:string,_encoding,callback){callback(null,replace(chunk));},flush(callback){callback(null,replace("",true));}});
    await pipeline(createReadStream(raw,{encoding:"utf8"}),transform,createWriteStream(options.sql,{flags:"wx",mode:0o600}));assert.equal(matches,1,"Review a changed dump preamble before restoration");
    execFileSync(options.psql,["-X","--no-password","--single-transaction","-h",options.host,"-p",String(options.port),"-U",options.user,"-d",options.database,"-v","ON_ERROR_STOP=1","--file",options.sql],{windowsHide:true,stdio:"pipe",env:options.env,maxBuffer:8*1024*1024});return;
  }
  execFileSync(options.pgRestore, ["--no-owner", "--no-privileges",...options.dataOnly?["--data-only","--disable-triggers"]:[], "--file", options.sql, options.dump], { windowsHide: true, stdio: "pipe", env: options.env });
  const original = await readFile(options.sql, "utf8"), statement = "SELECT pg_catalog.set_config('search_path', '', false);";
  assert.equal(original.split(statement).length, 2, "Review a changed dump preamble before restoration");
  await writeFile(options.sql, original.replace(statement, "SELECT pg_catalog.set_config('search_path', 'pg_catalog,public', false);"));
  execFileSync(options.psql, ["-h", options.host, "-p", String(options.port), "-U", options.user, "-d", options.database, "-v", "ON_ERROR_STOP=1", "--file", options.sql], { windowsHide: true, stdio: "pipe", env: options.env, maxBuffer: 32 * 1024 * 1024 });
}
