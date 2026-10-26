import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";

const baseline="21cc99eec95779f61b8e2720120bf55e9405cf36";
const git=(...args)=>execFileSync("git",args,{encoding:"utf8",windowsHide:true,maxBuffer:24*1024*1024});
const env=JSON.parse(fs.readFileSync("artifacts/worlds-atlas-s32/environment.json","utf8"));
const checkout=path.resolve(env.checkout);
assert.equal(checkout,path.resolve("artifacts/worlds-atlas-pass7/checkout"));
const files=git("ls-files","--cached","--others","--exclude-standard","-z").split("\0").filter(f=>f&&(f.startsWith("src/")||f.startsWith("data/")||["package.json","package-lock.json","next.config.ts","postcss.config.mjs"].includes(f))).sort();
const sha=createHash("sha256");
for(const file of files){const current=fs.readFileSync(file);assert.ok(current.equals(fs.readFileSync(path.join(checkout,file))),`Production source differs: ${file}`);sha.update(file+"\0");sha.update(current);}
const normal=s=>s.replace(/\r\n/g,"\n");
const preserved=["terrain-generation-v1.ts","terrain-generation-v2.ts","terrain-generation-v3.ts","terrain-physical-noise.ts","terrain-renderer.ts","terrain-detail-renderer.ts","terrain-cartography.ts","terrain-cartography-painter.ts"].map(f=>"src/features/worlds/"+f);
for(const file of preserved)assert.equal(normal(fs.readFileSync(file,"utf8")),normal(git("show",baseline+":"+file)),`Historical implementation changed: ${file}`);
const prior=JSON.parse(git("show",baseline+":drizzle/meta/_journal.json")),journal=JSON.parse(fs.readFileSync("drizzle/meta/_journal.json","utf8"));
assert.deepEqual(journal.entries.slice(0,prior.entries.length),prior.entries);assert.equal(prior.entries.length,140);assert.equal(journal.entries.length,141);assert.equal(journal.entries.at(-1).tag,"0140_world_terrain_materials");
for(const entry of prior.entries){const file="drizzle/"+entry.tag+".sql";assert.equal(normal(fs.readFileSync(file,"utf8")),normal(git("show",baseline+":"+file)),file);}
for(const file of git("diff",baseline,"--name-only","--","drizzle/meta").trim().split("\n").filter(Boolean))assert.ok(["drizzle/meta/_journal.json","drizzle/meta/0140_snapshot.json"].includes(file),"Historical snapshot changed: "+file);
const migration="drizzle/0140_world_terrain_materials.sql",migrationBytes=fs.readFileSync(migration);assert.ok(migrationBytes.equals(fs.readFileSync(path.join(checkout,migration))),"Rehearsed migration differs from workspace");
const ts=JSON.parse(fs.readFileSync(path.join(checkout,"tsconfig.json"),"utf8"));ts.include=ts.include.filter(p=>!p.startsWith(env.dist+"/"));assert.deepEqual(ts,JSON.parse(fs.readFileSync("tsconfig.json","utf8")));
const result={baselineCommit:baseline,workspaceHead:git("rev-parse","HEAD").trim(),runtimeFilesChecked:files.length,runtimeWorkspaceSha256:sha.digest("hex"),productionCopyByteExact:true,productionBuildId:fs.readFileSync(path.join(checkout,env.dist,"BUILD_ID"),"utf8").trim(),priorGeneratorAndRendererImplementationsUnchanged:preserved,publishedMigrationContentsUnchanged:prior.entries.length,priorJournalEntriesExact:true,historicalSnapshotsUnchanged:true,migration0140Sha256:createHash("sha256").update(migrationBytes).digest("hex"),newMigrationOnly:140,manifestDefinition:"Sorted runtime/data files and package/package-lock/Next/PostCSS configuration; path, NUL, raw bytes",validationTsconfigDifference:"Only Next's isolated build-directory type include paths",sharedDatabaseWrites:false,productionContacted:false};
fs.writeFileSync("docs/screenshots/worlds-atlas-s32/source-verification.json",JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify(result));
