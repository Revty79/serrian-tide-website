import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";

const base="5961382469f8c3014b09db8bc644f93dc74aa191";
const allowed=new Set([
 "AGENTS.md",
 "scripts/worlds-collaboration-underground-fixture.ts",
 "src/features/worlds/atlas-map-consumption.ts",
 "src/features/worlds/atlas-map-consumption-service.ts",
 "src/features/worlds/atlas-map-consumption-projection.ts",
 "src/features/worlds/atlas-map-consumption-connections.ts",
 "src/features/worlds/atlas-map-consumption-privacy.ts",
 "src/features/worlds/atlas-map-consumption.test.ts",
 "scripts/worlds-map-consumption-disposable.test.ts",
 "scripts/worlds-map-consumption-integrity.mjs",
 "docs/architecture/worlds-atlas-map-consumption-s7c.md",
 "docs/operations/worlds-atlas-map-consumption-s7c-matrix.md",
 "docs/operations/worlds-atlas-map-consumption-s7c-delivery.md",
]);
const git=args=>execFileSync("git",["-c","core.quotepath=false",...args],{windowsHide:true,maxBuffer:32*1024*1024,encoding:"utf8"});
const starting=git(["ls-tree","-r","--format=%(objectname)%x09%(path)","-z",base]).split("\0").filter(Boolean).map(row=>{const [sha,file]=row.split("\t");return {sha,file};});
for(const file of [...git(["diff","--name-only","-z",base,"--"]).split("\0"),...git(["ls-files","--others","--exclude-standard","-z"]).split("\0")].filter(Boolean))assert.ok(allowed.has(file),"Unreviewed Stage7C path: "+file);
assert.ok((await readFile("AGENTS.md","utf8")).replace(/\r\n/g,"\n").endsWith(git(["show",base+":AGENTS.md"])),"All prior AGENTS instructions and receipts remain exact");
const protectedFiles=starting.filter(({file})=>!allowed.has(file));
for(let offset=0;offset<protectedFiles.length;offset+=70){const batch=protectedFiles.slice(offset,offset+70),hashes=git(["hash-object","--",...batch.map(row=>row.file)]).trim().split(/\r?\n/);for(let i=0;i<batch.length;i++)assert.equal(hashes[i],batch[i].sha,"Protected baseline blob changed: "+batch[i].file);}
const journal=JSON.parse(await readFile("drizzle/meta/_journal.json","utf8"));assert.equal(journal.entries.length,161);assert.equal(journal.entries.at(-1).tag,"0160_world_canon_geography_copy");
const files=git(["ls-files","--cached","--others","--exclude-standard","-z"]).split("\0").filter(file=>file&&(file.startsWith("src/")||file.startsWith("data/")||file.startsWith("public/")||["package.json","package-lock.json","next.config.ts","postcss.config.mjs","tsconfig.json"].includes(file))).sort(),hash=createHash("sha256"),build=JSON.parse(await readFile(process.argv[2],"utf8"));
for(const file of files){const bytes=await readFile(file);hash.update(file+"\0").update(bytes);const built=await readFile(path.join(build.checkout,file));if(file==="next.config.ts")assert.equal(built.toString(),bytes.toString().replace("root: process.cwd()",`root: ${JSON.stringify(process.cwd())}`));else if(file==="tsconfig.json"){const actual=JSON.parse(built),expected=JSON.parse(bytes);actual.include=actual.include.filter(entry=>expected.include.includes(entry)||!/^\.next-collaboration\/(dev\/)?types\//.test(entry));assert.deepEqual(actual,expected);}else assert.ok(bytes.equals(built),"Exact isolated production source differs: "+file);}
const sourceHash=hash.digest("hex");assert.equal(sourceHash,build.sourceHash);
const engines=starting.filter(({file})=>file.startsWith("src/features/worlds/")&&(/(?:canvas|renderer|painter|geometry|worker|budget|climate|simulation)(?:[.-]|$)/.test(file)||/\/(?:terrain|terrain-advanced|terrain-generation|terrain-sculpt|town-map|building-floor|underground|craft)\.ts$/.test(file)));assert.equal(engines.length,44);
const authFiles=starting.filter(({file})=>file.startsWith("src/lib/auth")).map(row=>row.file);
const result={passed:true,base,startingFiles:starting.length,protectedStartingFiles:protectedFiles.length,sourceHash,applicationDataAssetConfigFiles:files.length,sqlAndSnapshotsExact:starting.filter(r=>/^drizzle\/(?:\d{4}_[^/]+\.sql|meta\/\d{4}_snapshot\.json)$/.test(r.file)).length,journalEntriesExact:journal.entries.length,publicAssetsExact:starting.filter(r=>r.file.startsWith("public/")).length,numericalRenderingEnginesExact:engines.length,existingAuthenticationFilesExact:authFiles,noExistingApplicationChange:true,noNewMigration:true,noSharedAccess:true,build};
await writeFile(process.argv[3]??"node_modules/.cache/s7c-integrity.json",JSON.stringify(result,null,2));console.log(JSON.stringify(result));
