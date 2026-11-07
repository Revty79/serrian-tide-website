import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {readFile,writeFile} from "node:fs/promises";

const base="9ff9dd1c22b4e21e343c141dd5ecc8c07e85c4bf";
const allowed=new Set([
 "AGENTS.md",
 "docs/operations/worlds-atlas-post7b-integration-checkpoint.md",
 "docs/operations/worlds-atlas-post7b-integration-matrix.md",
 "scripts/worlds-atlas-checkpoint-browser.test.ts",
 "scripts/worlds-atlas-checkpoint-choices.test.ts",
 "scripts/worlds-atlas-checkpoint-regressions.mjs",
 "scripts/worlds-atlas-checkpoint-integrity.mjs",
 "scripts/worlds-regional-editing-fixture.ts",
 "scripts/worlds-collaboration-cpu.test.ts",
 "src/features/worlds/world-canon-geography-copy.ts",
 "src/features/worlds/world-canon-geography-projection.ts",
 "src/features/worlds/world-canon-geography-plan.ts",
 "src/features/worlds/town-map-editor.tsx",
 "src/features/worlds/atlas-viewport-focus.ts",
 "scripts/worlds-collaboration-canon-geography-browser.test.ts",
 "scripts/worlds-region-hierarchy-browser.ts",
 "scripts/worlds-region-hierarchy-recovery-browser.ts",
 "scripts/worlds-building-floors-devices.ts",
 "scripts/worlds-building-floors-safety-browser.ts",
 "scripts/worlds-atlas-checkpoint-copy-recovery.test.ts",
 "scripts/worlds-atlas-checkpoint-legacy-seed.ts",
 "scripts/worlds-atlas-checkpoint-stage-rows.ts",
 "scripts/worlds-underground-disposable.test.ts",
 "scripts/worlds-assets-disposable.test.ts",
 "scripts/worlds-crafts-disposable.test.ts",
 "scripts/worlds-templates-disposable.test.ts",
 "scripts/worlds-advanced-disposable.test.ts",
 "scripts/worlds-town-maps-disposable.test.ts",
 "scripts/worlds-collaboration-canon-geography-fixture.ts",
 "scripts/worlds-atlas-checkpoint-route.ts",
 "scripts/worlds-collaboration-inherited.test.ts",
]);
const git=args=>execFileSync("git",["-c","core.quotepath=false",...args],{windowsHide:true,maxBuffer:32*1024*1024,encoding:"utf8"});
const starting=git(["ls-tree","-r","--format=%(objectname)%x09%(path)","-z",base]).split("\0").filter(Boolean).map(row=>{const [sha,file]=row.split("\t");return {sha,file};});
for(const file of [...git(["diff","--name-only","-z",base,"--"]).split("\0"),...git(["ls-files","--others","--exclude-standard","-z"]).split("\0")].filter(Boolean))assert.ok(allowed.has(file),"Unreviewed checkpoint change: "+file);
const protectedFiles=starting.filter(({file})=>!allowed.has(file));
assert.ok((await readFile("AGENTS.md","utf8")).replace(/\r\n/g,"\n").endsWith(git(["show",base+":AGENTS.md"])) ,"Every prior AGENTS instruction/receipt must remain exact beneath the new checkpoint section");
const townFile="src/features/worlds/town-map-editor.tsx",oldTown=git(["show",base+":"+townFile]),newTown=(await readFile(townFile,"utf8")).replace(/\r\n/g,"\n");
assert.equal(newTown,oldTown.replace("This World is archived. Restore it in the World registry before editing.","This Town Map is read-only with your current World access or editing control. Check the editing status above."),"Town editor must retain every source byte outside the reviewed read-only message");
const focusFile="src/features/worlds/atlas-viewport-focus.ts",oldFocus=git(["show",base+":"+focusFile]),newFocus=(await readFile(focusFile,"utf8")).replace(/\r\n/g,"\n");
assert.equal(newFocus,oldFocus.replaceAll('"[data-native-history-action]"','"[data-native-history-action],dialog[aria-label=\'Map browser\']"'),"Only native map-browser focus exemption may change in the shared viewport guard");
for(let offset=0;offset<protectedFiles.length;offset+=70){const batch=protectedFiles.slice(offset,offset+70),hashes=git(["hash-object","--",...batch.map(row=>row.file)]).trim().split(/\r?\n/);for(let i=0;i<batch.length;i++)assert.equal(hashes[i],batch[i].sha,"Protected baseline blob changed: "+batch[i].file);}
const journal=JSON.parse(await readFile("drizzle/meta/_journal.json","utf8"));assert.deepEqual(journal,JSON.parse(git(["show",base+":drizzle/meta/_journal.json"])));assert.equal(journal.entries.length,161);assert.equal(journal.entries.at(-1).tag,"0160_world_canon_geography_copy");
const files=git(["ls-files","--cached","--others","--exclude-standard","-z"]).split("\0").filter(file=>file&&(file.startsWith("src/")||file.startsWith("data/")||file.startsWith("public/")||["package.json","package-lock.json","next.config.ts","postcss.config.mjs","tsconfig.json"].includes(file))).sort(),digest=createHash("sha256");for(const file of files)digest.update(file+"\0").update(await readFile(file));
const sourceHash=digest.digest("hex"),build=JSON.parse(await readFile(process.argv[2],"utf8"));assert.equal(build.sourceHash,sourceHash,"Exact isolated production source must match every application, asset, data and config byte");
const engines=starting.filter(({file})=>file.startsWith("src/features/worlds/")&&(/(?:canvas|renderer|painter|geometry|worker|budget|climate|simulation)(?:[.-]|$)/.test(file)||/\/(?:terrain|terrain-advanced|terrain-generation|terrain-sculpt|town-map|building-floor|underground|craft)\.ts$/.test(file)));assert.equal(engines.length,44);
const result={passed:true,base,startingFiles:starting.length,protectedStartingFiles:protectedFiles.length,applicationDataAssetConfigFilesMatchingBuild:files.length,sqlAndSnapshotsExact:starting.filter(row=>/^drizzle\/(?:\d{4}_[^/]+\.sql|meta\/\d{4}_snapshot\.json)$/.test(row.file)).length,journalEntriesExact:journal.entries.length,publicAssetsExact:starting.filter(row=>row.file.startsWith("public/")).length,numericalRenderingEnginesExact:engines.length,townEditorOnlyReadOnlyMessageChanged:true,sourceHash,build,noNewMigration:true,noSharedAccess:true};
await writeFile(process.argv[3]??"node_modules/.cache/checkpoint-integrity.json",JSON.stringify(result,null,2));console.log(JSON.stringify(result));
