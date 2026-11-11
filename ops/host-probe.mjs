// Read-only, secret-redacted probe. Can be piped to Node in the OLD container.
import fs from "node:fs/promises";
import path from "node:path";
import {constants} from "node:fs";
import {networkInterfaces} from "node:os";
import {isIP} from "node:net";

function privateIPv4(address){
 if(isIP(address)!==4)return false;
 const [a,b]=address.split(".").map(Number);
 return a===10||(a===172&&b>=16&&b<=31)||(a===192&&b===168);
}

// Linux host-network probes and the website see the same actual interfaces.
// Interface injection is only a pure-test argument, never an environment override.
// This validates explicit configuration; it never adds an origin to Better Auth.
export function origins(env,interfaces=networkInterfaces()){
 const parse=value=>{
  if(value.includes("*"))throw Error("AUTH_WILDCARD");
  let u;try{u=new URL(value);}catch{throw Error("AUTH_ORIGIN");}
  if(u.origin!==value||u.username||u.password||!["http:","https:"].includes(u.protocol))throw Error("AUTH_ORIGIN");
  return u;
 };
 const base=parse(env.BETTER_AUTH_URL??""),trusted=(env.BETTER_AUTH_TRUSTED_ORIGINS??"").split(",").map(v=>v.trim()).filter(Boolean).map(parse);
 if(!env.BETTER_AUTH_SECRET||env.BETTER_AUTH_SECRET.length<32)throw Error("AUTH_SECRET");
 const assigned=new Set(Object.values(interfaces).flatMap(entries=>entries??[])
  .filter(entry=>entry.family==="IPv4"&&entry.internal===false&&privateIPv4(entry.address)).map(entry=>entry.address));
 let local=false;
 for(const u of [base,...trusted]){
  if(u.hostname==="localhost"||isIP(u.hostname.replace(/^\[|\]$/g,""))){
   if(u.protocol!=="http:"||u.port!=="3003"||!(u.hostname==="localhost"||u.hostname==="127.0.0.1"||assigned.has(u.hostname)))throw Error("AUTH_LOCAL_ORIGIN");
   local=true;
  }else{
   // External origins (including Quick Tunnels) must be exact HTTPS DNS names.
   // No DNS lookup can confer local-server identity or wildcard authorization.
   const labels=u.hostname.split(".");
   if(u.protocol!=="https:"||u.hostname.length>253||labels.length<2||labels.some(label=>! /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))||u.hostname.endsWith(".localhost"))throw Error("AUTH_ORIGIN");
  }
 }
 if(!local)throw Error("AUTH_LOCAL_ORIGIN");
 return {base:base.origin,trusted:trusted.map(u=>u.origin),quickTunnelConfigured:[base,...trusted].some(u=>u.hostname.endsWith(".trycloudflare.com"))};
}
export async function probe(env=process.env){
 const auth=origins(env);
 /** @type {Record<string,{path:string,device:number,inode:number,uid:number,gid:number,mode:number}>} */
 const roots={};
 for(const [kind,key]of [["terrain","SERRIAN_TERRAIN_ROOT"],["artwork","SERRIAN_ASSET_ROOT"],["raster","SERRIAN_RASTER_ROOT"]]){
  const value=env[key];if(!value||!path.isAbsolute(value)||path.normalize(value)!==value||["/","/app","/app/public"].includes(value)||value.includes("/public/"))throw Error("EXPLICIT_PRIVATE_ROOTS");
  const real=await fs.realpath(value),s=await fs.lstat(value);if(real!==value||!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077)!==0)throw Error("PRIVATE_ROOT_PERMISSIONS");
  await fs.access(value,constants.R_OK|constants.X_OK|(env.SERRIAN_PROBE_READ_ONLY_ROOTS==="1"?0:constants.W_OK));if(!(s.mode&0o200))throw Error("ROOT_NOT_WRITABLE");roots[kind]={path:real,device:s.dev,inode:s.ino,uid:s.uid,gid:s.gid,mode:s.mode&0o777};
 }
 const values=Object.values(roots).map(v=>v.path);if(values.some((a,i)=>values.some((b,j)=>i!==j&&(a===b||a.startsWith(b+"/")))))throw Error("OVERLAPPING_ROOTS");
 const url=new URL(env.DATABASE_URL??"");if(!["postgres:","postgresql:"].includes(url.protocol)||url.searchParams.has("host")||url.searchParams.has("user")||url.searchParams.has("options"))throw Error("DATABASE_CONFIG");
 if(!["localhost","127.0.0.1","[::1]"].includes(url.hostname)&&!["require","verify-ca","verify-full"].includes(url.searchParams.get("sslmode")))throw Error("DATABASE_TLS");
 const {default:pg}=await import("pg"),pool=new pg.Pool({connectionString:url.toString(),max:1,connectionTimeoutMillis:10000,application_name:"serrian-website-readonly-preflight"});
 try{const client=await pool.connect();try{await client.query("begin isolation level repeatable read read only");await client.query("set local statement_timeout='30s'");const who=(await client.query("select current_database() name,current_user role,current_setting('server_version_num')::int version,inet_server_port() port")).rows[0];if(Math.floor(who.version/10000)!==18||who.name!==decodeURIComponent(url.pathname.slice(1))||who.role!==decodeURIComponent(url.username)||who.port!==Number(url.port||5432))throw Error("DATABASE_IDENTITY");
  const rows=(await client.query("select hash,created_at::text from drizzle.__drizzle_migrations order by id")).rows;await client.query("commit");
  const bindings=[];for(const file of["/proc/net/tcp","/proc/net/tcp6"]){const text=await fs.readFile(file,"utf8").catch(()=>"");for(const line of text.split("\n").slice(1)){const fields=line.trim().split(/\s+/),local=fields[1]?.split(":");if(local&&parseInt(local[1],16)===3003&&fields[3]==="0A")bindings.push(local[0]);}}
  const websiteListen=bindings.includes("00000000")?"0.0.0.0":bindings.includes("0100007F")?"127.0.0.1":bindings.includes("00000000000000000000000000000000")?"::":null;
  return {passed:true,readOnly:true,auth,roots,websiteListen,database:{host:url.hostname,...who,migrations:rows.length,ledger:rows}};
 }finally{await client.query("rollback").catch(()=>{});client.release();}}finally{await pool.end();}
}
// stdin execution is used by the non-destructive host preflight.
export function safeProbeFailure(error){const allowed=new Set(["AUTH_ORIGIN","AUTH_SECRET","AUTH_LOCAL_ORIGIN","AUTH_WILDCARD","EXPLICIT_PRIVATE_ROOTS","PRIVATE_ROOT_PERMISSIONS","ROOT_NOT_WRITABLE","OVERLAPPING_ROOTS","DATABASE_CONFIG","DATABASE_TLS","DATABASE_IDENTITY"]);if(allowed.has(error?.message))return error.message;return({ENOENT:"PRIVATE_ROOT_MISSING",EACCES:"PRIVATE_ROOT_ACCESS",ECONNREFUSED:"DATABASE_UNAVAILABLE",ETIMEDOUT:"DATABASE_UNAVAILABLE","28P01":"DATABASE_AUTHENTICATION","42P01":"MIGRATION_LEDGER_UNAVAILABLE",ERR_INVALID_URL:"ORIGIN_OR_DATABASE_URL"})[error?.code]??"CONFIGURATION_OR_DATABASE_CHECK";}
if(process.argv.includes("--auth-probe")||process.argv[1]==="--input-type=module"||process.argv.includes("--probe"))Promise.resolve().then(()=>process.argv.includes("--auth-probe")?origins(process.env):probe()).then(v=>console.log(JSON.stringify(v))).catch(error=>{console.error("HOST_PROBE_FAILED: "+safeProbeFailure(error));process.exitCode=1;});
