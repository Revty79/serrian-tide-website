import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,writeFile,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {sourceFingerprint,stampBuild,verifyBuild,RELEASE_FILES,RELEASE_DIRECTORIES} from "./stamp-build.mjs";
import {origins} from "./host-probe.mjs";
import {spawnSync} from "node:child_process";
import {buildWebsite} from "./build-website.mjs";
test("strict production TypeScript remains mandatory before any completed build receipt",async()=>{
 const calls=[],environment={SERRIAN_BUILD_COMMIT:"a".repeat(40),SERRIAN_BUILD_HEAP_MIB:"3328",SERRIAN_BUILD_CPUS:"1"};let stamped=0;
 await assert.rejects(buildWebsite({environment,metrics:false,run:async args=>{calls.push(args);if(args.includes("node_modules/typescript/bin/tsc"))throw Error("real type error");},stamp:async()=>{stamped++;}}));assert.equal(stamped,0);assert.equal(calls.length,3);assert(calls[1].includes("typegen"));assert(calls[2].includes("--noEmit"));assert(calls[2].includes("tsconfig.website.json"));
 await buildWebsite({environment,metrics:false,run:async()=>{},stamp:async()=>{stamped++;}});assert.equal(stamped,1);
});
test("invalid build commit fails before Next or runtime credentials are used",()=>{
 const result=spawnSync(process.execPath,["ops/build-website.mjs"],{env:{...process.env,SERRIAN_BUILD_COMMIT:"incorrect",DATABASE_URL:"synthetic-sensitive-value-must-not-print"},encoding:"utf8",windowsHide:true});assert.notEqual(result.status,0);assert(!result.stderr.includes("synthetic-sensitive-value-must-not-print"));
});
test("exact origin checks preserve configured free tunnel and reject mismatches",()=>{
 const env={BETTER_AUTH_URL:"http://localhost:3003",BETTER_AUTH_SECRET:"x".repeat(32),BETTER_AUTH_TRUSTED_ORIGINS:"https://synthetic-test.trycloudflare.com"};
 assert(origins(env).quickTunnelConfigured);assert.equal(origins(env).base,env.BETTER_AUTH_URL);
 for(const value of["https://example.invalid/path","https://user:password@example.invalid","https://*.trycloudflare.com"]){assert.throws(()=>origins({...env,BETTER_AUTH_URL:value}));}
 assert.throws(()=>origins({...env,BETTER_AUTH_URL:"https://example.invalid",BETTER_AUTH_TRUSTED_ORIGINS:""}));
});
test("v2 binds operational code, migrations and real output; legacy v1 remains readable",async()=>{
 const root=await mkdtemp(path.join(tmpdir(),"serrian-deploy-source-"));for(const name of[...RELEASE_DIRECTORIES,".next"])await mkdir(path.join(root,name));for(const file of RELEASE_FILES)await writeFile(path.join(root,file),file+"\n");await writeFile(path.join(root,"next-env.d.ts"),"generated types\n");await writeFile(path.join(root,".next/BUILD_ID"),"synthetic-build");
 const commit="a".repeat(40);const stamped=await stampBuild(root,commit);assert.equal(stamped.version,2);await verifyBuild(root,commit);await assert.rejects(verifyBuild(root,"b".repeat(40)));
 const operation=path.join(root,"ops","actual-startup.mjs");await writeFile(operation,"changed operational code");await assert.rejects(verifyBuild(root,commit));
 const old={version:1,commit,buildId:"synthetic-build",sourceHash:await sourceFingerprint(root,1)};await writeFile(path.join(root,".serrian-build.json"),JSON.stringify(old));await verifyBuild(root,commit);
 await writeFile(path.join(root,".serrian-build.json"),JSON.stringify({...stamped,sourceHash:await sourceFingerprint(root,2)}));await writeFile(path.join(root,".next/compiled-route.js"),"changed build output");await assert.rejects(verifyBuild(root,commit));assert((await readFile(operation,"utf8")).includes("changed"));
 // Retain the newly owned public-only fixture for failure inspection; no owner files used.
});
