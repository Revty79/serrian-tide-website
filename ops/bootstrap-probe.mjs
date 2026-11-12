// Runs as an explicit short-lived read-only probe, including on the old image.
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
const ROOT_KEYS=["SERRIAN_TERRAIN_ROOT","SERRIAN_ASSET_ROOT","SERRIAN_RASTER_ROOT"];
const TABLES=["world","world_terrain_tile","world_terrain_refinement_tile","world_terrain_transfer","world_terrain_transfer_tile","atlas_asset_version","world_raster_version","world_raster_asset"];
function requireValue(value,code){if(!value)throw Error(code);}
export async function storageProbe(root){
 requireValue(path.isAbsolute(root)&&path.normalize(root)===root&&!root.includes(","),"BOOTSTRAP_STORAGE_PATH");
 const result={};
 for(const kind of["","terrain","artwork","raster"]){
  const directory=kind?path.join(root,kind):root,s=await fs.lstat(directory);
  requireValue(s.isDirectory()&&!s.isSymbolicLink()&&await fs.realpath(directory)===directory,"BOOTSTRAP_STORAGE_PERMISSIONS");
  if(kind){requireValue(s.uid===1000&&s.gid===1000&&(s.mode&0o777)===0o700,"BOOTSTRAP_STORAGE_PERMISSIONS");requireValue((await fs.readdir(directory)).length===0,"BOOTSTRAP_STORAGE_NOT_EMPTY");result[kind]={path:directory,device:s.dev,inode:s.ino,uid:s.uid,gid:s.gid,mode:s.mode&0o777};}
  else requireValue([0,1000].includes(s.uid)&&(s.mode&0o022)===0,"BOOTSTRAP_STORAGE_PARENT");
 }
 return {passed:true,roots:result};
}
export async function oldStorageProbe(){
 requireValue(ROOT_KEYS.every(key=>process.env[key]===undefined),"BOOTSTRAP_ALREADY_CONFIGURED");
 requireValue(process.cwd()==="/app"&&await fs.realpath("/app")==="/app","BOOTSTRAP_OLD_WORKDIR");
 for(const name of["world-terrain","atlas-assets","world-raster"]){
  try{await fs.lstat("/app/storage/"+name);throw Error("BOOTSTRAP_OLD_STORAGE_PRESENT");}catch(error){if(error.code!=="ENOENT")throw error;}
 }
 return {passed:true,oldDefaultDirectoriesAbsent:true};
}
export async function databaseProbe(expected){
 const url=new URL(process.env.DATABASE_URL??"");
 requireValue(["postgres:","postgresql:"].includes(url.protocol)&&["localhost","127.0.0.1","[::1]"].includes(url.hostname)&&!url.hash&&[...url.searchParams.keys()].every(key=>["sslmode","sslrootcert","sslcert","sslkey"].includes(key)),"BOOTSTRAP_DATABASE_CONFIG");
 requireValue(decodeURIComponent(url.pathname.slice(1))===expected.name&&decodeURIComponent(url.username)===expected.role&&Number(url.port||5432)===expected.port,"BOOTSTRAP_DATABASE_IDENTITY");
 const {default:pg}=await import("pg"),client=new pg.Client({connectionString:url.toString(),connectionTimeoutMillis:10000,application_name:"serrian-bootstrap-readonly"});
 try{
  await client.connect();await client.query("begin isolation level repeatable read read only");await client.query("set local statement_timeout='30s'");await client.query("set local lock_timeout='2s'");await client.query("set local row_security=off");
  const who=(await client.query("select current_database() name,current_user role,inet_server_port() port,current_setting('server_version_num')::int version,pg_database_size(current_database())::text bytes")).rows[0];
  requireValue(who.name===expected.name&&who.role===expected.role&&who.port===expected.port&&Math.floor(who.version/10000)===18,"BOOTSTRAP_DATABASE_IDENTITY");
  const rows=(await client.query("select hash,created_at::text from drizzle.__drizzle_migrations order by id")).rows;
  requireValue([162,163].includes(expected.ledger.length)&&rows.length===expected.ledger.length,"BOOTSTRAP_MIGRATION_REQUIRED");
  for(const [i,row]of rows.entries())requireValue(row.created_at===expected.ledger[i].timestamp&&expected.ledger[i].hashes.includes(row.hash),"BOOTSTRAP_MIGRATION_HASH");
  const records={};
  for(const table of TABLES){records[table]=Number((await client.query(`select count(*)::text n from public."${table}"`)).rows[0].n);requireValue(records[table]===0,"BOOTSTRAP_EXISTING_ATLAS_DATA");}
  await client.query("rollback");return {passed:true,readOnly:true,database:{host:url.hostname,...who},migrations:rows.length,records};
 }finally{await client.end().catch(()=>{});}
}
export async function main(){
 let input="";for await(const chunk of process.stdin){input+=chunk;requireValue(input.length<100000,"BOOTSTRAP_INPUT_LIMIT");}
 const request=JSON.parse(input),result=request.mode==="storage"?await storageProbe(request.root):request.mode==="old-storage"?await oldStorageProbe():request.mode==="database"?await databaseProbe(request.expected):null;
 requireValue(result,"BOOTSTRAP_PROBE_MODE");console.log(JSON.stringify(result));
}
// stdin -e execution is deliberate; ordinary imports remain side-effect free.
if(process.argv.includes("--bootstrap-probe")||(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)))main().catch(error=>{
 const code=/^BOOTSTRAP_[A-Z_]+$/.test(error.message??"")?error.message:"BOOTSTRAP_READ_CHECK_FAILED";
 console.error("HOST_PROBE_FAILED: "+code);process.exitCode=1;
});
