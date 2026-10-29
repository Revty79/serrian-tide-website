import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";

// Offline verification only: inspect Git/workspace/build bytes, never a database.
const baseline="d8fc41a9428fb7aa9c5211ec544d68007b3937a2";
const git=(...args)=>execFileSync("git",args,{encoding:"utf8",windowsHide:true,maxBuffer:32*1024*1024});
const env=JSON.parse(fs.readFileSync("artifacts/worlds-atlas-s32/environment.json","utf8"));
const checkout=path.resolve(env.checkout);
const out=process.env.SERRIAN_ENGRAVED_SOURCE_EVIDENCE??"artifacts/engraved-5d-source-verification.json";
assert.equal(checkout,path.resolve("artifacts/worlds-atlas-pass7/checkout"));
assert.ok(path.resolve(out).startsWith(path.resolve("artifacts/engraved-5d-").slice(0,-1)+"-"));

const allowed=new Set(["src/db/world-map-appearance-schema.ts", "src/db/world-map-style-schema.ts", "src/features/worlds/terrain-appearance-controls.tsx", "src/features/worlds/terrain-appearance-service.ts", "src/features/worlds/terrain-appearance.ts", "src/features/worlds/terrain-artwork-painter.ts", "src/features/worlds/terrain-canvas.tsx", "src/features/worlds/terrain-editor.tsx", "src/features/worlds/terrain-hydrology-overlay.ts", "src/features/worlds/terrain-labels-layout.ts", "src/features/worlds/terrain-labels-painter.ts", "src/features/worlds/terrain-style-preset.ts", "src/features/worlds/terrain-style-service.ts", "src/features/worlds/terrain-style-workshop.tsx", "src/features/worlds/terrain-water-artwork.ts"]);
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
assert.equal(oldJournal.entries.length,146);
assert.deepEqual(journal.entries.slice(0,146),oldJournal.entries);
assert.equal(journal.entries.length,147);
assert.equal(journal.entries[146].tag,"0146_world_engraved_appearance");
const sha=file=>createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const frozen=JSON.parse(fs.readFileSync("docs/screenshots/worlds-atlas-s35a/migration-frozen.json","utf8"));
assert.equal(sha("drizzle/0143_world_map_style.sql"),frozen.sha256);
// Freeze the additive SQL after its first successful owned-disposable rehearsal.
assert.equal(sha("drizzle/0146_world_engraved_appearance.sql"),"64b4dddb36fdae3e0d62f9708c216ed855128c3fd638588500d25e5d5bddbd42");
assert.equal(sha("drizzle/0146_world_engraved_appearance.sql"),sha(path.join(checkout,"drizzle/0146_world_engraved_appearance.sql")));

const all=git("ls-files","--cached","--others","--exclude-standard","-z").split("\0").filter(Boolean);
const files=all.filter(file=>file.startsWith("src/")||file.startsWith("data/")||file.startsWith("public/worlds/terrain-materials/v1/")||file.startsWith("public/worlds/cartography/v1/")||["package.json","package-lock.json","next.config.ts","postcss.config.mjs"].includes(file)).sort();
const runtimeHash=createHash("sha256");
for(const file of files){const bytes=fs.readFileSync(file);assert.ok(bytes.equals(fs.readFileSync(path.join(checkout,file))),"Production copy differs: "+file);runtimeHash.update(file+"\0");runtimeHash.update(bytes);}
const runtimeSourceSha256=runtimeHash.digest("hex");
assert.equal(runtimeSourceSha256,fs.readFileSync(path.join(checkout,env.dist,"serrian-runtime-sha256"),"utf8").trim());

const self="scripts/worlds-engraved-source-check.mjs",scripts=all.filter(file=>file.startsWith("scripts/")&&file!==self).sort();
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
const result={passed:true,baseline,workspaceHead:git("rev-parse","HEAD").trim(),runtimeFiles:files.length,runtimeSourceSha256,productionBuildId:fs.readFileSync(path.join(checkout,env.dist,"BUILD_ID"),"utf8").trim(),productionCopyByteExact:true,validationScriptsByteExact:true,scriptFiles:scripts.length,scriptsSha256:scriptHash.digest("hex"),separatelyExecutedVerifier:self,protectedApprovedGitBlobsExact:entries.length,protectionUsesGitLineEndingNormalization:true,explicitExistingFileAllowance:[...allowed],all146HistoricalMigrationsAndSnapshotsExact:true,newMigration:"0146_world_engraved_appearance",newMigrationSha256:sha("drizzle/0146_world_engraved_appearance.sql"),originalAssetsAndHistoricalEvidenceExact:true,geographicSolversMaterialsHydrologyClimateServicesExact:true,allGameplaySourcesExact:true,navigationCorrectionRetained:true,sharedDatabaseAccess:false};
fs.writeFileSync(out,JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify(result));
