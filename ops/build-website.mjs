import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {readFile,writeFile} from "node:fs/promises";
import {stampBuild} from "./stamp-build.mjs";
const commit=process.env.SERRIAN_BUILD_COMMIT??"",heap=Number(process.env.SERRIAN_BUILD_HEAP_MIB??2560),cpus=Number(process.env.SERRIAN_BUILD_CPUS??1);
assert.match(commit,/^[a-f0-9]{40}$/);assert(Number.isInteger(heap)&&heap>=1536&&heap<=8192);assert(Number.isInteger(cpus)&&cpus>=1&&cpus<=4);
const start=Date.now(),status=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[`--max-old-space-size=${heap}`,"node_modules/next/dist/bin/next","build"],{env:{...process.env,NODE_OPTIONS:`--max-old-space-size=${heap}`,DATABASE_URL:"postgresql://inert:unused@127.0.0.1:1/build_only",BETTER_AUTH_URL:"http://127.0.0.1:1",BETTER_AUTH_SECRET:"isolated-build-only-no-runtime-value",NEXT_TELEMETRY_DISABLED:"1"},stdio:"inherit"});child.on("error",reject);child.on("exit",resolve);});
if(status!==0)process.exitCode=Number(status)||1;else{const read=async name=>readFile(`/sys/fs/cgroup/${name}`,"utf8").then(v=>v.trim(),()=>null);const metrics={elapsedMs:Date.now()-start,nodeHeapMiB:heap,nextWorkers:cpus,cgroupMemoryLimit:await read("memory.max"),cgroupPeakMemoryBytes:await read("memory.peak"),cgroupMemoryEvents:await read("memory.events")};await writeFile(".serrian-build-metrics.json",JSON.stringify(metrics));console.log(JSON.stringify({buildMetrics:metrics}));await stampBuild(process.cwd(),commit);}
