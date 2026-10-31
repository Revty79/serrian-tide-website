/** Matched CPU checks on a guarded retained disposable fixture. No app credentials are loaded. */
import assert from "node:assert/strict";
import {execFileSync,spawn,type ChildProcess} from "node:child_process";
import {createHash} from "node:crypto";
import {createWriteStream} from "node:fs";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import {chromium,type Browser} from "playwright-core";
import {ownedFreePort} from "./worlds-regional-editing-fixture";

async function main(){
 const input=path.resolve("artifacts/regions-s4c-information-tail-42/environment.json"),e=JSON.parse(await readFile(input,"utf8")),target=new URL(e.databaseUrl),root=path.resolve(e.root),data=path.resolve(e.data),out=path.resolve(process.env.SERRIAN_WORKSPACE_INHERITED_OUT??"artifacts/regions-s44-cpu-15"),checkout=path.resolve("artifacts/regions-s44-candidate-checkout"),dist=".next-s44-production";
 assert.ok(out.startsWith(path.resolve("artifacts/regions-s44-")));assert.equal(target.hostname,"127.0.0.1");assert.notEqual(target.port,"5432");assert.equal(target.pathname,"/serrian_atlas_s32");assert.equal(Number(target.port),e.dbPort);assert.ok(root.startsWith(path.join(tmpdir(),"serrian-atlas-s32-")));assert.equal(data,path.join(root,"data"));
 await mkdir(out,{recursive:true});const files=execFileSync("git",["ls-files","--cached","--others","--exclude-standard","-z"],{encoding:"utf8",windowsHide:true}).split("\0").filter(file=>file&&(file.startsWith("src/")||file.startsWith("data/")||file.startsWith("public/worlds/terrain-materials/v1/")||file.startsWith("public/worlds/cartography/v1/")||["package.json","package-lock.json","next.config.ts","postcss.config.mjs"].includes(file))).sort(),hash=createHash("sha256");
 for(const file of files){const bytes=await readFile(file);hash.update(file+"\0").update(bytes);assert.ok(bytes.equals(await readFile(path.join(checkout,file))),"Built checkout differs: "+file);}const runtimeHash=hash.digest("hex");assert.equal((await readFile(path.join(checkout,dist,"serrian-runtime-sha256"),"utf8")).trim(),runtimeHash);
 process.env.SERRIAN_WORKSPACE_CPU="1";process.env.SERRIAN_FREEFORM_PASS="1";process.env.SERRIAN_REGIONAL_EDITING_PASS="1";process.env.SERRIAN_REGIONAL_QUALITY_PASS="1";process.env.SERRIAN_ARTWORK_FOCUS="1";
 process.env.SERRIAN_BASELINE_ENVIRONMENT=path.join(out,"environment.json");process.env.SERRIAN_S32_LOG_DIR=out;
 const port=await ownedFreePort(),base=`http://127.0.0.1:${port}`,env:NodeJS.ProcessEnv={...process.env,NODE_ENV:"production",DATABASE_URL:e.databaseUrl,BETTER_AUTH_URL:base,BETTER_AUTH_SECRET:"atlas-removal-disposable-secret-only",SERRIAN_TERRAIN_ROOT:path.join(root,"terrain"),SERRIAN_TEST_NEXT_DIST_DIR:dist,NEXT_TELEMETRY_DISABLED:"1"},pgctl=path.join(process.env.SERRIAN_TEST_POSTGRES_BIN??"C:/Program Files/PostgreSQL/18/bin","pg_ctl.exe"),log=createWriteStream(path.join(out,"production.log"));let started=false,server:ChildProcess|undefined,browser:Browser|undefined;
 try{
  execFileSync(pgctl,["-D",data,"-l",path.join(root,"postgres.log"),"-o",`-h 127.0.0.1 -p ${e.dbPort}`,"-w","start"],{windowsHide:true,stdio:"ignore"});started=true;
  await writeFile(path.join(out,"environment.json"),JSON.stringify({...e,base,appPort:port,checkout,dist,resumedOwnedFixture:input},null,2));
  server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{cwd:checkout,env,windowsHide:true,stdio:["ignore","pipe","pipe"]});server.stdout!.pipe(log,{end:false});server.stderr!.pipe(log,{end:false});
  const deadline=Date.now()+90000;for(;;){assert.equal(server.exitCode,null);try{if((await fetch(base+"/login",{signal:AbortSignal.timeout(3000)})).ok)break;}catch{}assert.ok(Date.now()<deadline);await new Promise(resolve=>setTimeout(resolve,200));}
  browser=await chromium.launch({executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true,args:["--disable-gpu"]});const god=await browser.newContext({viewport:{width:1440,height:1000}});assert.equal((await god.request.post(base+"/api/auth/sign-in/email",{headers:{Origin:base},data:{email:"world-god@example.invalid",password:"Worlds-Test-Only-Password!"}})).status(),200);
  const errors:string[]=[],options={browser,god,base,world:e.world,foreign:e.foreign,out,errors,restart:async()=>{throw Error("No owner-service restart");}},completed:string[]=[];
  const checks=[['artwork',"./worlds-artwork-performance",'checkArtworkPerformance'],['labels',"./worlds-labels-performance",'checkLabelsPerformance'],['engraved',"./worlds-engraved-performance",'checkEngravedPerformance'],['regions',"./worlds-regions-performance",'checkRegionsPerformance']] as const;
  for(const [name,module,method]of checks){if(process.env.SERRIAN_WORKSPACE_CPU_ONLY&&process.env.SERRIAN_WORKSPACE_CPU_ONLY!==name)continue;console.log("START unchanged nine-limit CPU suite",name);await(await import(module))[method](options);completed.push(name);await writeFile(path.join(out,"progress.json"),JSON.stringify({passed:true,runtimeHash,completed,errors,baseline:"ec33f121e9275e3b900fe941eb753f89da6ffaa9",sharedDatabaseAccess:false},null,2));}
  assert.deepEqual(errors,[]);await writeFile(path.join(out,"results.json"),JSON.stringify({passed:true,runtimeHash,completed,browser:browser.version(),gpuDisabled:true,errors,sharedDatabaseAccess:false},null,2));
 }finally{await browser?.close();if(server?.pid&&server.exitCode===null)execFileSync("taskkill",["/pid",String(server.pid),"/t","/f"],{windowsHide:true,stdio:"ignore"});log.end();if(started)execFileSync(pgctl,["-D",data,"-m","fast","-w","stop"],{windowsHide:true,stdio:"ignore"});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
