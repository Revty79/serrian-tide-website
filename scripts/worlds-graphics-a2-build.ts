/** Exact owned production snapshot. Never copies or loads the owner's environment. */
import assert from "node:assert/strict";
import {execFileSync,spawn} from "node:child_process";
import {createHash} from "node:crypto";
import {createWriteStream} from "node:fs";
import {access,copyFile,mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";

export async function prepareGraphicsA2Runtime(databaseUrl="postgresql://owned:unused@127.0.0.1:1/atlas_graphics_build_unavailable"){
 const target=new URL(databaseUrl);assert.equal(target.hostname,"127.0.0.1");assert(!["5432","5433"].includes(target.port));assert(["/atlas_graphics_build_unavailable","/serrian_regional_editing"].includes(target.pathname));
 const checkout=path.resolve("artifacts/atlas-graphics-a2/runtime"),dist=".next-graphics-a2",out=path.resolve(process.env.SERRIAN_A2_BUILD_OUT??"artifacts/atlas-graphics-a2/build-1");assert(out.startsWith(path.resolve("artifacts/atlas-graphics-a2")+path.sep));await mkdir(out,{recursive:true});await mkdir(checkout,{recursive:true});
 for(const name of [".env",".env.local",".env.production",".env.production.local",".env.development",".env.development.local"])assert.equal(await access(path.join(checkout,name)).then(()=>true,()=>false),false,"Owned runtime must contain no environment files");
 const inventory=execFileSync("git",["ls-files","--cached","--others","--exclude-standard","-z"],{encoding:"utf8",windowsHide:true}).split("\0").filter(Boolean),files=inventory.filter(file=>["src/","data/","public/","ops/"].some(prefix=>file.startsWith(prefix))||["package.json","package-lock.json","next.config.ts","postcss.config.mjs","tsconfig.json"].includes(file)).sort(),hash=createHash("sha256");
 for(const file of [...files,...inventory.filter(file=>file.startsWith("scripts/"))]){const bytes=await readFile(file),destination=path.join(checkout,file);await mkdir(path.dirname(destination),{recursive:true});await copyFile(file,destination);if(files.includes(file))hash.update(file+"\0").update(bytes);}
 const fontMock=path.resolve("artifacts/regions-s42-build-error/cached-font-responses.cjs"),sourceHash=hash.digest("hex"),log=createWriteStream(path.join(out,"build.log")),env:NodeJS.ProcessEnv={...process.env,NODE_ENV:"production",DATABASE_URL:databaseUrl,BETTER_AUTH_URL:"http://127.0.0.1:49991",BETTER_AUTH_SECRET:"graphics-a2-owned-build-only-secret",SERRIAN_TERRAIN_ROOT:path.join(checkout,"owned-build-terrain"),SERRIAN_ASSET_ROOT:path.join(checkout,"owned-build-artwork"),SERRIAN_RASTER_ROOT:path.join(checkout,"owned-build-raster"),SERRIAN_TEST_NEXT_DIST_DIR:dist,NEXT_TELEMETRY_DISABLED:"1",NEXT_FONT_GOOGLE_MOCKED_RESPONSES:await access(fontMock).then(()=>fontMock,()=>undefined)};
 const execute=(args:string[])=>new Promise<void>((resolve,reject)=>{const p=spawn(process.execPath,args,{cwd:checkout,env,windowsHide:true,stdio:["ignore","pipe","pipe"]});p.stdout!.pipe(log,{end:false});p.stderr!.pipe(log,{end:false});p.once("error",reject);p.once("exit",code=>code===0?resolve():reject(Error("Owned graphics build command failed: "+code)));});
 try{
  if(!await access(path.join(checkout,"node_modules/next/dist/bin/next")).then(()=>true,()=>false)){const npm=process.env.npm_execpath??path.join(path.dirname(process.execPath),"node_modules/npm/bin/npm-cli.js");await access(npm);await execute([npm,"ci","--include=dev","--no-audit"]);}
  let reuse=false;try{reuse=(await readFile(path.join(checkout,dist,"s43-source-sha256"),"utf8")).trim()===sourceHash&&!!(await readFile(path.join(checkout,dist,"BUILD_ID"),"utf8")).trim();}catch{}
  if(!reuse)await execute(["node_modules/next/dist/bin/next","build"]);
  const buildId=(await readFile(path.join(checkout,dist,"BUILD_ID"),"utf8")).trim();await writeFile(path.join(checkout,dist,"s43-source-sha256"),sourceHash+"\n");
  const result={passed:true,sourceHash,buildId,files:files.length,checkout,dist,reused:reuse,noOwnerEnvironment:true};await writeFile(path.join(out,"results.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result));return result;
 }catch(error){await writeFile(path.join(out,"failure.json"),JSON.stringify({passed:false,sourceHash,noOwnerEnvironment:true,message:error instanceof Error?error.message:String(error)},null,2));throw error;}finally{log.end();}
}
