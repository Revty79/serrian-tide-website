import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {readFile,writeFile} from "node:fs/promises";
import {stampBuild} from "./stamp-build.mjs";
import {fileURLToPath} from "node:url";
import path from "node:path";
const execute=(args,env)=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{env,stdio:"inherit"});child.on("error",reject);child.on("exit",code=>code===0?resolve():reject(Error("REQUIRED_BUILD_PHASE_FAILED")));});
export async function buildWebsite({environment=process.env,run=execute,stamp=stampBuild,metrics=true}={}){
 const commit=environment.SERRIAN_BUILD_COMMIT??"",heap=Number(environment.SERRIAN_BUILD_HEAP_MIB??3328),cpus=Number(environment.SERRIAN_BUILD_CPUS??1);
 assert.match(commit,/^[a-f0-9]{40}$/);assert(Number.isInteger(heap)&&heap>=1536&&heap<=8192);assert(Number.isInteger(cpus)&&cpus>=1&&cpus<=4);
 const start=Date.now(),phases=[],env={...environment,NODE_OPTIONS:`--max-old-space-size=${heap}`,SERRIAN_BUILD_CPUS:String(cpus),SERRIAN_BUILD_SEQUENTIAL_CHECKS:"1",DATABASE_URL:"postgresql://inert:unused@127.0.0.1:1/build_only",BETTER_AUTH_URL:"http://127.0.0.1:1",BETTER_AUTH_SECRET:"isolated-build-only-no-runtime-value",NEXT_TELEMETRY_DISABLED:"1"};
 // Terminate the compiler/native cache before strict production + generated-route tsc.
 // Original full-project tsc, including every test/fixture, remains mandatory CI.
 // No receipt or usable image is produced if any mandatory phase fails.
 for(const [name,args]of[["compile",["node_modules/next/dist/bin/next","build"]],["typegen",["node_modules/next/dist/bin/next","typegen"]],["production-typecheck",["node_modules/typescript/bin/tsc","--project","tsconfig.website.json","--noEmit","--incremental","false"]]]){const began=Date.now();console.log("REQUIRED_BUILD_PHASE_START "+name);await run([`--max-old-space-size=${heap}`,...args],env);phases.push({name,elapsedMs:Date.now()-began});console.log("REQUIRED_BUILD_PHASE_PASS "+name);}
 if(metrics){const read=async name=>readFile(`/sys/fs/cgroup/${name}`,"utf8").then(v=>v.trim(),()=>null);const observation={elapsedMs:Date.now()-start,nodeHeapMiB:heap,nextWorkers:cpus,phases,cgroupMemoryLimit:await read("memory.max"),cgroupPeakMemoryBytes:await read("memory.peak"),cgroupMemoryEvents:await read("memory.events")};await writeFile(".serrian-build-metrics.json",JSON.stringify(observation));console.log(JSON.stringify({buildMetrics:observation}));}
 return stamp(process.cwd(),commit);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))buildWebsite().catch(()=>{console.error("BUILD_FAILED: a required compile/typegen/production-TypeScript or identity phase did not pass; no completion receipt was produced.");process.exitCode=1;});
