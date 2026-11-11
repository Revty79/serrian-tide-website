import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,writeFile,readFile,symlink,unlink} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {sourceFingerprint,stampBuild,verifyBuild,RELEASE_FILES,RELEASE_DIRECTORIES} from "./stamp-build.mjs";
import {origins,safeProbeFailure} from "./host-probe.mjs";
import {spawnSync} from "node:child_process";
import {buildWebsite} from "./build-website.mjs";
test("CI fixture loads under the repository runtime and refuses without explicit ownership",()=>{
 const environment={...process.env};delete environment.SERRIAN_A5_OWNED_FIXTURE;
 const result=spawnSync(process.execPath,["--conditions=react-server","--import","tsx","scripts/deployment-a5-fixture.ts"],{env:environment,encoding:"utf8",windowsHide:true});
 assert.equal(result.status,1);assert.match(result.stderr,/OWNED_A5_FIXTURE_FAILED stage=ownership-guard code=ERR_ASSERTION/);assert.doesNotMatch(result.stderr,/Transform failed/);
});
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
const originEnvironment = base => ({BETTER_AUTH_URL:base,BETTER_AUTH_SECRET:"x".repeat(32),BETTER_AUTH_TRUSTED_ORIGINS:""});
const assignedInterfaces = address => ({ethernet:[{address,family:"IPv4",internal:false}]});
test("an explicit LAN origin uses assigned interface identity without rewriting authentication",()=>{
 for(const address of ["10.0.0.242","172.16.4.20","172.31.255.20","192.168.4.20"]){
  const base=`http://${address}:3003`,interfaces=assignedInterfaces(address);
  for(const tunnel of ["","https://synthetic-test.trycloudflare.com"]){
   const env=Object.freeze({...originEnvironment(base),BETTER_AUTH_TRUSTED_ORIGINS:tunnel});
   assert.deepEqual(origins(env,interfaces),{base,trusted:tunnel?[tunnel]:[],quickTunnelConfigured:!!tunnel});
  }
  const tunnelBase={...originEnvironment("https://synthetic-test.trycloudflare.com"),BETTER_AUTH_TRUSTED_ORIGINS:base};
  assert.equal(origins(tunnelBase,interfaces).base,tunnelBase.BETTER_AUTH_URL);
 }
 for(const base of ["http://localhost:3003","http://127.0.0.1:3003"]){
  assert.equal(origins(originEnvironment(base),{}).base,base);
 }
});
test("LAN origin authorization is exact, non-internal, and rejects unassigned addresses even beside localhost",()=>{
 const interfaces=assignedInterfaces("10.0.0.242");
 for(const value of ["http://10.0.0.243:3003","http://10.0.0.242:3000","http://10.0.0.242","https://10.0.0.242:3003","http://127.0.0.2:3003","http://localhost:3004","http://0.0.0.0:3003","http://169.254.1.1:3003","http://[::1]:3003"]){
  assert.throws(()=>origins(originEnvironment(value),interfaces),/AUTH_/);
  assert.throws(()=>origins({...originEnvironment("http://localhost:3003"),BETTER_AUTH_TRUSTED_ORIGINS:value},interfaces),/AUTH_/);
 }
 for(const invalid of [{},{ethernet:[{address:"10.0.0.242",family:"IPv4",internal:true}]},{ethernet:[{address:"10.0.0.242",family:"IPv6",internal:false}]}]){
  assert.throws(()=>origins(originEnvironment("http://10.0.0.242:3003"),invalid),/AUTH_LOCAL_ORIGIN/);
 }
 for(const address of ["172.15.255.1","172.32.0.1","169.254.1.1","203.0.113.1"]){
  assert.throws(()=>origins(originEnvironment(`http://${address}:3003`),assignedInterfaces(address)),/AUTH_/);
 }
});
test("every origin is canonical and exact; parsing failures never disclose supplied values",()=>{
 for(const value of ["not-a-url","*","https://*.trycloudflare.com","https://user:synthetic-secret@example.invalid","https://example.invalid/path","https://example.invalid/","https://example.invalid?x=1","https://example.invalid#x","http://example.invalid:3003","ftp://example.invalid","https://bad_host.invalid","https://-bad.invalid","https://example.invalid.","http://10.0.0.242:03003","http://10.0.0.242:65536","http://0x0a0000f2:3003","http://10.0.0.242:3003\n"]){
  const env={...originEnvironment(value),BETTER_AUTH_TRUSTED_ORIGINS:"http://localhost:3003"};
  assert.throws(()=>origins(env,assignedInterfaces("10.0.0.242")),error=>/^AUTH_/.test(safeProbeFailure(error))&&!error.message.includes(value));
 }
});
test("old-image stdin auth preflight needs neither storage nor database credentials",async()=>{
 const source=await readFile(new URL("./host-probe.mjs",import.meta.url),"utf8");
 for(const base of ["http://localhost:3003","http://127.0.0.1:3003"]){
  const result=spawnSync(process.execPath,["--input-type=module","-","--auth-probe"],{input:source,env:originEnvironment(base),encoding:"utf8",windowsHide:true});
  assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).base,base);
 }
 const refused=spawnSync(process.execPath,["--input-type=module","-","--auth-probe"],{input:source,env:originEnvironment("https://user:synthetic-secret@example.invalid"),encoding:"utf8",windowsHide:true});
 assert.equal(refused.status,1);assert.equal(refused.stdout,"");assert.equal(refused.stderr.trim(),"HOST_PROBE_FAILED: AUTH_ORIGIN");
});
test("v2 binds operational code, migrations and real output; legacy v1 remains readable",async()=>{
 const root=await mkdtemp(path.join(tmpdir(),"serrian-deploy-source-"));for(const name of[...RELEASE_DIRECTORIES,".next"])await mkdir(path.join(root,name));for(const file of RELEASE_FILES)await writeFile(path.join(root,file),file+"\n");await writeFile(path.join(root,"next-env.d.ts"),"generated types\n");await writeFile(path.join(root,".next/BUILD_ID"),"synthetic-build");
 const commit="a".repeat(40);const stamped=await stampBuild(root,commit);assert.equal(stamped.version,2);await verifyBuild(root,commit);await assert.rejects(verifyBuild(root,"b".repeat(40)));
 const operation=path.join(root,"ops","actual-startup.mjs");await writeFile(operation,"changed operational code");await assert.rejects(verifyBuild(root,commit));
 const old={version:1,commit,buildId:"synthetic-build",sourceHash:await sourceFingerprint(root,1)};await writeFile(path.join(root,".serrian-build.json"),JSON.stringify(old));await verifyBuild(root,commit);
 await writeFile(path.join(root,".serrian-build.json"),JSON.stringify({...stamped,sourceHash:await sourceFingerprint(root,2)}));await writeFile(path.join(root,".next/compiled-route.js"),"changed build output");await assert.rejects(verifyBuild(root,commit));assert((await readFile(operation,"utf8")).includes("changed"));
 // Retain the newly owned public-only fixture for failure inspection; no owner files used.
});
test("compiled native links bind only immutable in-release dependency targets",async()=>{
 const root=await mkdtemp(path.join(tmpdir(),"serrian-native-link-"));for(const name of[...RELEASE_DIRECTORIES,".next",".next/node_modules","node_modules","node_modules/pg"])await mkdir(path.join(root,name));for(const file of RELEASE_FILES)await writeFile(path.join(root,file),file);await writeFile(path.join(root,"next-env.d.ts"),"types");await writeFile(path.join(root,".next/BUILD_ID"),"owned");
 const link=path.join(root,".next/node_modules/pg-native"),kind=process.platform==="win32"?"junction":"dir";await symlink(path.join(root,"node_modules/pg"),link,kind);const commit="a".repeat(40);await stampBuild(root,commit);await verifyBuild(root,commit);await unlink(link);const outside=await mkdtemp(path.join(tmpdir(),"serrian-outside-link-"));await symlink(outside,link,kind);await assert.rejects(verifyBuild(root,commit),/inside this release/);
});
