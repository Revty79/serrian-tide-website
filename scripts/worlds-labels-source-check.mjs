import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";

// Offline verification only: inspect Git/workspace/build bytes, never a database.
const baseline="f6baa2eb42681c58a9e9d7793b0ef24060a3c3c4";
const git=(...args)=>execFileSync("git",args,{encoding:"utf8",windowsHide:true,maxBuffer:32*1024*1024});
const env=JSON.parse(fs.readFileSync("artifacts/worlds-atlas-s32/environment.json","utf8"));
const checkout=path.resolve(env.checkout);
const out=process.env.SERRIAN_LABELS_SOURCE_EVIDENCE??"artifacts/labels-5c-source-verification.json";
assert.equal(checkout,path.resolve("artifacts/worlds-atlas-pass7/checkout"));
assert.ok(path.resolve(out).startsWith(path.resolve("artifacts/labels-5c-").slice(0,-1)+"-"));

const allowed=new Set([
 "src/features/worlds/terrain-canvas.tsx",
 "src/features/worlds/terrain-editor.tsx",
 "src/features/worlds/terrain-tools.tsx",
 "src/features/worlds/terrain.module.css",
 "src/features/worlds/terrain-artwork-painter.ts",
 "src/features/worlds/terrain-measurement-renderer.ts",
 "src/features/worlds/world-workspace.tsx", // Retain the later e930f54 navigation correction.
 "src/features/lifecycle/admin-account-lifecycle.test.ts",
 "src/features/lifecycle/user-account-delete-plan.ts",
]);
const entries=git("ls-tree","-r","-z",baseline,"--","src","data","drizzle","public","docs/screenshots","package.json","package-lock.json","next.config.ts","postcss.config.mjs")
 .split("\0").filter(Boolean).map(line=>{const [header,file]=line.split("\t");return {file,blob:header.split(" ")[2]};})
 .filter(entry=>!allowed.has(entry.file)&&entry.file!=="drizzle/meta/_journal.json");
const actual=execFileSync("git",["hash-object","--stdin-paths"],{
 encoding:"utf8",input:entries.map(entry=>entry.file).join("\n")+"\n",windowsHide:true,maxBuffer:4*1024*1024,
}).trim().split("\n");
assert.equal(actual.length,entries.length);
for(let i=0;i<entries.length;i++)assert.equal(actual[i],entries[i].blob,"Protected approved file changed: "+entries[i].file);

const oldJournal=JSON.parse(git("show",baseline+":drizzle/meta/_journal.json"));
const journal=JSON.parse(fs.readFileSync("drizzle/meta/_journal.json","utf8"));
assert.equal(oldJournal.entries.length,145);
assert.deepEqual(journal.entries.slice(0,145),oldJournal.entries);
assert.equal(journal.entries.length,146);
assert.equal(journal.entries[145].tag,"0145_world_labels");
const sha=file=>createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const frozen=JSON.parse(fs.readFileSync("docs/screenshots/worlds-atlas-s35a/migration-frozen.json","utf8"));
assert.equal(sha("drizzle/0143_world_map_style.sql"),frozen.sha256);
// Freeze the additive SQL after its first successful owned-disposable rehearsal.
assert.equal(sha("drizzle/0145_world_labels.sql"),"ce76b373cbd63a84513995427d1a0d7e1bdb02978f553ae7d0d55be64774791a");
assert.equal(sha("drizzle/0145_world_labels.sql"),sha(path.join(checkout,"drizzle/0145_world_labels.sql")));

const all=git("ls-files","--cached","--others","--exclude-standard","-z").split("\0").filter(Boolean);
const files=all.filter(file=>file.startsWith("src/")||file.startsWith("data/")||file.startsWith("public/worlds/terrain-materials/v1/")||file.startsWith("public/worlds/cartography/v1/")||["package.json","package-lock.json","next.config.ts","postcss.config.mjs"].includes(file)).sort();
const runtimeHash=createHash("sha256");
for(const file of files){const bytes=fs.readFileSync(file);assert.ok(bytes.equals(fs.readFileSync(path.join(checkout,file))),"Production copy differs: "+file);runtimeHash.update(file+"\0");runtimeHash.update(bytes);}
const runtimeSourceSha256=runtimeHash.digest("hex");
assert.equal(runtimeSourceSha256,fs.readFileSync(path.join(checkout,env.dist,"serrian-runtime-sha256"),"utf8").trim());

const self="scripts/worlds-labels-source-check.mjs",scripts=all.filter(file=>file.startsWith("scripts/")&&file!==self).sort();
const scriptHash=createHash("sha256");
for(const file of scripts){const bytes=fs.readFileSync(file);assert.ok(bytes.equals(fs.readFileSync(path.join(checkout,file))),"Executed script copy differs: "+file);scriptHash.update(file+"\0");scriptHash.update(bytes);}
const navigation=fs.readFileSync("src/features/worlds/world-workspace.tsx","utf8");
const nav=navigation.match(/<nav[^>]+aria-label="World workspace"[^>]*>(.*?)<\/nav>/s)?.[1];
assert.ok(nav);
const tabs=[...nav.matchAll(/changeTab\("([a-z]+)"\)/g)].map(match=>match[1]);
assert.equal(tabs.length,14);
assert.deepEqual(tabs.slice(-4),["stories","atlas","towns","campaigns"]);
const newFiles=git("ls-files","--others","--exclude-standard","-z").split("\0").filter(Boolean);
assert.ok(!newFiles.some(file=>/\.(png|jpe?g|webp|gif|mp4|woff2?|ttf|otf)$/i.test(file)),"Unexpected new image/font evidence or asset");
const result={passed:true,baseline,workspaceHead:git("rev-parse","HEAD").trim(),runtimeFiles:files.length,runtimeSourceSha256,productionBuildId:fs.readFileSync(path.join(checkout,env.dist,"BUILD_ID"),"utf8").trim(),productionCopyByteExact:true,validationScriptsByteExact:true,scriptFiles:scripts.length,scriptsSha256:scriptHash.digest("hex"),separatelyExecutedVerifier:self,protectedApprovedGitBlobsExact:entries.length,protectionUsesGitLineEndingNormalization:true,explicitExistingFileAllowance:[...allowed],all145HistoricalMigrationsAndSnapshotsExact:true,newMigration:"0145_world_labels",newMigrationSha256:sha("drizzle/0145_world_labels.sql"),originalAssetsAndHistoricalEvidenceExact:true,geographicSolversMaterialsHydrologyClimateServicesExact:true,allGameplaySourcesExact:true,navigationCorrectionRetained:true,sharedDatabaseAccess:false};
fs.writeFileSync(out,JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify(result));
