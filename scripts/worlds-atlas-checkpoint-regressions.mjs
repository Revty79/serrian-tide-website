import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createWriteStream} from "node:fs";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";

// Serial execution preserves the original CPU gates and avoids overlapping
// production builds, browser performance measurements and authentication tests.
const suites={
 checkpoint:["worlds-atlas-checkpoint-browser.test.ts"],
 choices:["worlds-atlas-checkpoint-choices.test.ts"],
 history:["worlds-collaboration-inherited.test.ts","history"],
 hierarchy:["worlds-collaboration-inherited.test.ts","hierarchy"],
 stage5:["worlds-collaboration-inherited.test.ts","stage5"],
 underground:["worlds-collaboration-inherited.test.ts","underground"],
 inherited:["worlds-collaboration-inherited.test.ts","inherited"],
 assets:["worlds-collaboration-inherited.test.ts","stage6-assets"],
 crafts:["worlds-collaboration-inherited.test.ts","stage6-crafts"],
 templates:["worlds-collaboration-inherited.test.ts","stage6-templates"],
 "template-performance":["worlds-collaboration-inherited.test.ts","stage6-template-performance"],
 "template-phone":["worlds-collaboration-inherited.test.ts","stage6-template-phone"],
 advanced:["worlds-collaboration-inherited.test.ts","stage6-advanced"],
 "advanced-safety":["worlds-collaboration-inherited.test.ts","stage6-advanced-safety"],
 resources:["worlds-collaboration-resources.test.ts"],
 canon:["worlds-collaboration-canon.test.ts"],
 foundation:["worlds-collaboration-foundation.test.ts"],
 collaboration:["worlds-collaboration-browser.test.ts"],
 scopes:["worlds-collaboration-scopes.test.ts"],
 transactions:["worlds-collaboration-canon-transaction.test.ts"],
 "canon-geography":["worlds-collaboration-canon-geography.test.ts"],
 "canon-recovery":["worlds-collaboration-canon-geography-browser.test.ts"],
 "historical-db":["worlds-history-disposable.test.ts"],
 "copy-recovery":["worlds-atlas-checkpoint-copy-recovery.test.ts"],
 "town-db":["worlds-town-maps-disposable.test.ts"],
 "floor-db":["worlds-town-maps-disposable.test.ts"],
 "underground-db":["worlds-underground-disposable.test.ts"],
 "assets-db":["worlds-assets-disposable.test.ts"],
 "crafts-db":["worlds-crafts-disposable.test.ts"],
 "templates-db":["worlds-templates-disposable.test.ts"],
 "advanced-db":["worlds-advanced-disposable.test.ts"],
};
const names=(process.env.SERRIAN_CHECKPOINT_RUN??Object.keys(suites).join(",")).split(","),run=process.env.SERRIAN_CHECKPOINT_ATTEMPT??"1";
assert.match(run,/^[a-z0-9-]+$/);
assert.ok(process.env.SERRIAN_COLLAB_CHECKOUT&&process.env.SERRIAN_COLLAB_REUSE_RECEIPT,"Choose an exact byte-verified isolated production receipt");
const summary=path.resolve(`artifacts/collaboration-s7b-checkpoint-run-${run}`);await mkdir(summary,{recursive:true});const results=[];
for(const name of names){
 assert.ok(Object.hasOwn(suites,name),"Choose a reviewed checkpoint suite: "+name);
 const [script,mode]=suites[name],out=name==="historical-db"?`artifacts/history-s7a-checkpoint-database-${run}`:name==="advanced-db"?`artifacts/terrain-s6d-checkpoint-database-${run}`:`artifacts/collaboration-s7b-checkpoint-${name}-${run}`,log=createWriteStream(path.join(summary,name+".log")),start=new Date().toISOString();
 const ownedTemp=path.resolve(out,"owned-temp"),regional=name.endsWith("-db");if(regional)await mkdir(ownedTemp,{recursive:true});
 const env={...process.env,...(regional?{TEMP:ownedTemp,TMP:ownedTemp}:{}),RENDER:"true",SERRIAN_COLLAB_OUT:out,SERRIAN_HISTORY_EVIDENCE:out,SERRIAN_REGIONAL_EDIT_EVIDENCE:out,SERRIAN_BUILDING_FLOORS:name==="floor-db"?"1":"0",SERRIAN_CRAFTS_QUOTAS:name==="crafts-db"?"1":"0",SERRIAN_TEMPLATES_LIMITS:name==="templates-db"?"1":"0",SERRIAN_COLLAB_SUITE:mode??"",SERRIAN_HISTORY_FINAL_BROWSER:mode==="history"?"1":"0",SERRIAN_HIERARCHY_RECOVERY:mode==="hierarchy"?"1":"0"};
 console.log("START",name,out);
 const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,["--conditions=react-server","--import","tsx",path.join("scripts",script)],{env,windowsHide:true,stdio:["ignore","pipe","pipe"]});child.stdout.pipe(log);child.stderr.pipe(log);child.once("error",reject);child.once("exit",resolve);});
 results.push({name,script,mode,out,start,end:new Date().toISOString(),code});await writeFile(path.join(summary,"results.json"),JSON.stringify({passed:code===0,results,noSharedAccess:true},null,2));
 assert.equal(code,0,`Checkpoint ${name} failed; retain ${path.join(summary,name+".log")} and ${out}`);
 const built=await readFile(path.join(out,"build.json"),"utf8").then(JSON.parse,()=>null);console.log("PASS",name,built?.sourceHash??"database-only");
}
