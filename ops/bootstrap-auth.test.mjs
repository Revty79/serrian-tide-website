import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {origins} from "./host-probe.mjs";
import {bootstrapAuthPlan} from "./bootstrap-auth-source.mjs";

const interfaces={ethernet:[{address:"10.23.4.5",family:"IPv4",internal:false}]};
const env={BETTER_AUTH_URL:"http://198.51.100.10:3003",BETTER_AUTH_TRUSTED_ORIGINS:"http://10.23.4.5:3003,https://one-test.trycloudflare.com,https://two-test.trycloudflare.com",BETTER_AUTH_SECRET:"synthetic-secret-".repeat(3),DATABASE_URL:"unchanged-synthetic-database"};
test("legacy source planning leaves strict public HTTP refusal intact and changes only the candidate base",()=>{
 assert.throws(()=>origins(env,interfaces),/AUTH_LOCAL_ORIGIN/);
 const original=JSON.stringify(env),plan=bootstrapAuthPlan(Object.freeze({...env}),origins,interfaces);
 assert.equal(plan.transition,true);assert.equal(plan.originalBase,env.BETTER_AUTH_URL);
 assert.equal(plan.candidate.base,"http://10.23.4.5:3003");
 assert.deepEqual(plan.candidate.trusted,env.BETTER_AUTH_TRUSTED_ORIGINS.split(","));
 assert.deepEqual(plan.candidate,origins({...env,BETTER_AUTH_URL:plan.candidate.base},interfaces));
 assert.equal(JSON.stringify(env),original);assert.throws(()=>origins(env,interfaces),/AUTH_LOCAL_ORIGIN/);
});
test("legacy recognition refuses unassigned LANs, invalid trusted entries and malformed or non-public source bases",()=>{
 assert.throws(()=>bootstrapAuthPlan(env,origins,{}),/BOOTSTRAP_AUTH_LOCAL_REQUIRED/);
 for(const base of ["http://198.51.100.10:3004","http://198.51.100.10:3003/","http://user:password@198.51.100.10:3003","http://unknown.invalid:3003","http://10.23.4.6:3003","http://127.0.0.2:3003","http://169.254.1.2:3003","http://100.64.0.1:3003","http://224.0.0.1:3003","https://*.trycloudflare.com"]){
  assert.throws(()=>bootstrapAuthPlan({...env,BETTER_AUTH_URL:base},origins,interfaces));
 }
 for(const trusted of ["https://*.trycloudflare.com","http://198.51.100.11:3003","http://10.23.4.6:3003","http://10.23.4.5:3004","https://bad.invalid/path"]){
  assert.throws(()=>bootstrapAuthPlan({...env,BETTER_AUTH_TRUSTED_ORIGINS:env.BETTER_AUTH_TRUSTED_ORIGINS+","+trusted},origins,interfaces));
 }
});
test("already strict configurations remain unchanged and multiple explicit LANs follow their existing order",()=>{
 const valid={...env,BETTER_AUTH_URL:"http://10.23.4.5:3003"};
 assert.deepEqual(bootstrapAuthPlan(valid,origins,interfaces),{transition:false,originalBase:valid.BETTER_AUTH_URL,candidate:origins(valid,interfaces)});
 const two={ethernet:[...interfaces.ethernet,{address:"10.23.4.4",family:"IPv4",internal:false}]};
 const plan=bootstrapAuthPlan({...env,BETTER_AUTH_TRUSTED_ORIGINS:"http://10.23.4.4:3003,"+env.BETTER_AUTH_TRUSTED_ORIGINS},origins,two);
 assert.equal(plan.candidate.base,"http://10.23.4.4:3003");
});
test("the old-image planner composition runs using built-ins without weakening the normal entrypoint",async()=>{
 const source=await readFile(new URL("./host-probe.mjs",import.meta.url),"utf8")+"\n"+await readFile(new URL("./bootstrap-auth-source.mjs",import.meta.url),"utf8")+"\nconsole.log(JSON.stringify(bootstrapAuthPlan(process.env,origins)));";
 const valid={...env,BETTER_AUTH_URL:"http://localhost:3003",BETTER_AUTH_TRUSTED_ORIGINS:"https://one-test.trycloudflare.com"};
 const result=spawnSync(process.execPath,["--input-type=module","-","--bootstrap-auth-source"],{env:valid,input:source,encoding:"utf8",windowsHide:true});
 assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).transition,false);
});
test("anonymous cutover canary exercises real Better Auth CSRF without reading or mutating accounts",()=>{
 const script=`
  const {auth}=await import('./src/lib/auth.ts');
  const {pool}=await import('./src/db/index.ts');
  const {checkBootstrapAuthentication}=await import('./ops/bootstrap-auth-health.mjs');
  let databaseCalls=0;
  pool.query=pool.connect=()=>{databaseCalls++;throw Error('No account/database access permitted');};
  globalThis.fetch=(url,options)=>auth.handler(new Request(url,options));
  try{const result=await checkBootstrapAuthentication(process.env,'http://198.51.100.10:3003');if(!result.passed||databaseCalls)throw Error('Anonymous check violated its contract');console.log('ANONYMOUS_AUTH_CONTRACT_PASS');}finally{await pool.end();}
 `;
 const result=spawnSync(process.execPath,["--conditions=react-server","--import","tsx","--input-type=module","-e",script],{env:{...process.env,NODE_ENV:"production",TEST:"false",DATABASE_URL:"postgresql://inert:unused@127.0.0.1:1/unreachable",BETTER_AUTH_URL:"http://127.0.0.1:3003",BETTER_AUTH_TRUSTED_ORIGINS:"https://one-test.trycloudflare.com,https://two-test.trycloudflare.com",BETTER_AUTH_SECRET:"synthetic-only-".repeat(4)},encoding:"utf8",timeout:30000,windowsHide:true});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/ANONYMOUS_AUTH_CONTRACT_PASS/);
});
