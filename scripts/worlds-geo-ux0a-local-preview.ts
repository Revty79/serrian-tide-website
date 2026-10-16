/** Local review checkout only. Never reads an owner's .env or shared database. */
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {existsSync} from "node:fs";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {ownedPool,UX0A_DIRECTORY} from "./worlds-geo-ux0a-harness";
async function main(){
 for(const file of [".env",".env.local",".env.development",".env.development.local",".env.production",".env.production.local"])assert.ok(!existsSync(file),`Use a separate review checkout without ${file}; do not copy owner environment files`);
 const branch=process.argv.find(arg=>arg.startsWith("--branch="))?.split("=")[1];assert.ok(branch==="manual"||branch==="generated","Select an explicitly prepared local manual/generated journey receipt");
 const receipt=JSON.parse(await readFile(path.join(UX0A_DIRECTORY,`library-${branch}-journey.json`),"utf8")),e=receipt.environment,pool=await ownedPool(e,"empty");
 try{assert.equal(Number((await pool.query("select count(*) n from world_atlas_map where id=$1",[receipt.mapId])).rows[0].n),1);}finally{await pool.end();}
 const base=`http://127.0.0.1:${e.appPort}`;console.log(`Local disposable preview: ${base}${new URL(receipt.editorUrl).pathname}${new URL(receipt.editorUrl).search}`);console.log(`Disposable login: ${e.users.owner}@example.invalid / UX0A-Disposable-Only-Password!`);
 const child=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--hostname","127.0.0.1","--port",String(e.appPort)],{stdio:"inherit",env:{...process.env,NODE_ENV:"development",DATABASE_URL:e.empty,SERRIAN_RASTER_ROOT:e.assetRoot,BETTER_AUTH_URL:base,BETTER_AUTH_SECRET:"UX0A-owned-disposable-auth-secret-only",SERRIAN_TEST_NEXT_DIST_DIR:".next-ux0a-preview",NEXT_TELEMETRY_DISABLED:"1"}});
 const stop=()=>{if(child.exitCode===null)child.kill("SIGTERM");};process.once("SIGINT",stop);process.once("SIGTERM",stop);await new Promise<void>((resolve,reject)=>{child.once("error",reject);child.once("exit",code=>{process.exitCode=code??0;resolve();});});
}
main().catch(error=>{console.error(error);process.exitCode=1;});
