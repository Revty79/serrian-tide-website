import {test} from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {readFile,writeFile,mkdir,link,rename,lstat,chmod,readdir} from "node:fs/promises";
import {execFileSync,spawnSync} from "node:child_process";
import {canonicalJson,digest,safeKey,type SnapshotManifest} from "./environment/model";

// Any legacy class imported by an integrity helper sees only this inert URL.
process.env.DATABASE_URL="postgresql://unit_only:unused@127.0.0.1:1/no_database";
test("Git exclusion refuses CRLF blank matches and re-included paths",async()=>{
  const f=await import("./environment/private-files"),out=path.resolve(`artifacts/infrastructure-git-ignore-${randomUUID()}`),repository=path.join(out,"repository");
  await f.createPrivateDirectory(out);await mkdir(repository);execFileSync("git",["init","--quiet",repository],{windowsHide:true,stdio:"pipe"});
  await writeFile(path.join(repository,".gitignore"),"\r\n# Private destinations\r\n\r\n/private/\r\n/exposed/\r\n!/exposed/\r\n");
  await assert.rejects(f.refuseGitPublication(path.join(repository,"unignored"),true),/Git/i);
  await mkdir(path.join(repository,"unignored"));await writeFile(path.join(repository,"unignored","retained.txt"),"retained source fixture");
  await assert.rejects(f.refuseGitPublication(path.join(repository,"unignored"),true),/Git/i);
  await assert.rejects(f.refuseGitPublication(path.join(repository,"unignored","new.key")),/Git/i);
  await assert.rejects(f.refuseGitPublication(path.join(repository,"exposed"),true),/Git/i);
  const privateRoot=path.join(repository,"private");await f.refuseGitPublication(privateRoot,true);await f.createPrivateDirectory(privateRoot);
  await f.refuseGitPublication(path.join(privateRoot,"recovery.key"));
  const listed=execFileSync("git",["-C",repository,"ls-files","--others","--exclude-standard"],{encoding:"utf8",windowsHide:true});
  assert.ok(listed.includes("unignored/retained.txt"));assert.ok(!listed.includes("private/"));
});
test("portable environment signatures, private files, encrypted transfer and fail-closed verification",async t=>{
  const f=await import("./environment/private-files"),s=await import("./environment/snapshot"),transfer=await import("./environment/transfer");
  const out=path.resolve(process.env.SERRIAN_INFRA_UNIT_OUT??`artifacts/infrastructure-unit-${randomUUID()}`);await f.createPrivateDirectory(out);const keyFile=path.join(out,"operator.key"),trustFile=path.join(out,"trust.json");await f.keygen(keyFile,trustFile);const key=await f.privateKey(keyFile),trust=await f.trustKey(trustFile),snapshot=path.join(out,"snapshot");await f.createPrivateDirectory(snapshot);await f.createPrivateDirectory(path.join(snapshot,"files"));const roots=s.snapshotRoots(snapshot);for(const r of Object.values(roots))await f.createPrivateDirectory(r);
  const data=Buffer.alloc(2048,3),hash=digest(data),tile=`objects/${hash.slice(0,2)}/${hash}.i16`;await mkdir(path.dirname(path.join(roots.terrain,tile)),{recursive:true,mode:0o700});await writeFile(path.join(roots.terrain,tile),data,{mode:0o600});await link(path.join(roots.terrain,tile),path.join(roots.terrain,"same-tile.i16"));const archive=Buffer.from("PGDMP unit-only file-integrity fixture; structural pg_restore checks use real disposable archives separately");await writeFile(path.join(snapshot,"database.dump"),archive,{mode:0o600});
  const manifest:SnapshotManifest={format:"serrian-environment",version:1,snapshotId:randomUUID(),createdAt:new Date().toISOString(),sourceEnvironment:"synthetic-source",sourceDatabaseName:"synthetic_source",applicationCommit:null,database:{serverMajor:18,serverVersion:"18 unit fixture",encoding:"UTF8",databaseBytes:0,locale:{provider:"c",collate:"C",ctype:"C",locale:null,version:null},tables:[],sequences:[],largeObjects:[],schemaSha256:digest("schema"),extensions:[],migrations:[],references:{terrain:[{sha256:hash,bytes:2048,encoding:"i16le-v1"}],artwork:[],rasters:[]}},archive:{key:"database.dump",bytes:archive.length,sha256:digest(archive)},files:await f.inventoryFiles(roots),freeze:{operator:"Synthetic unit fixture",statement:"ALL_APPLICATION_JOB_IMPORT_AND_DIRECT_WRITERS_STOPPED",checkedOtherClients:0,tableWriteLocks:true,beforeAfterIdentical:true}};
  await f.signJson(path.join(snapshot,"manifest.json"),manifest,key);await f.signJson(path.join(snapshot,"complete.json"),{version:1,snapshotId:manifest.snapshotId,manifestSha256:digest(await readFile(path.join(snapshot,"manifest.json")))},key);
  await t.test("path validation is portable and rejects traversal, reserved devices and aliases",()=>{for(const p of ["../x","a/../x","a\\b","C:/file","CON","a/NUL.txt","bad.","trailing ","a//b"])assert.throws(()=>safeKey(p));assert.equal(safeKey(tile),tile);assert.equal(canonicalJson({b:2,a:1}),canonicalJson({a:1,b:2}));assert.equal(f.within(out,path.join(out,"nested")),true);assert.equal(f.within(out,out+"-other"),false);if(process.platform==="win32")assert.equal(f.within(out.toUpperCase(),path.join(out.toLowerCase(),"nested")),true);});
  await t.test("connection query options cannot override the reviewed database identity",async()=>{const {databaseUrl,canonicalConstraint}=await import("./environment/database");const p={database:{urlEnv:"SERRIAN_INFRA_UNIT_CONNECTION",expectedHost:"127.0.0.1",expectedPort:6543,expectedRole:"unit",expectedName:"unit_db"}} as import("./environment/model").EnvironmentProfile;process.env.SERRIAN_INFRA_UNIT_CONNECTION="postgresql://unit:unused@127.0.0.1:6543/unit_db?host=unapproved.invalid";assert.throws(()=>databaseUrl(p),/override/i);process.env.SERRIAN_INFRA_UNIT_CONNECTION="postgresql://unit:unused@127.0.0.1:6543/unit_db";assert.equal(databaseUrl(p).hostname,"127.0.0.1");delete process.env.SERRIAN_INFRA_UNIT_CONNECTION;const changed={nspname:"public",relname:"attribute_score_reference",conname:"attribute_score_reference_key_valid",definition:"CHECK (false)"};assert.deepEqual(canonicalConstraint(changed),changed,"Unknown/different constraints remain exact");});
  await t.test("nested backups and private keys inside captured roots are refused before database access",async()=>{const p={roots,application:{trustFile}} as import("./environment/model").EnvironmentProfile;await assert.rejects(s.backupEnvironment(p,path.join(roots.terrain,"nested-backup"),keyFile,"unit","ALL_APPLICATION_JOB_IMPORT_AND_DIRECT_WRITERS_STOPPED"),/outside all source roots/i);const publicFolder=path.join(out,"public");await mkdir(publicFolder,{mode:0o700});await assert.rejects(f.refuseGitPublication(path.join(publicFolder,"would-expose-secret.key")),/public/i);const badRoots={terrain:path.join(out,"bad-terrain"),artwork:path.join(out,"bad-artwork"),raster:path.join(out,"bad-raster")};for(const root of Object.values(badRoots))await f.createPrivateDirectory(root);const capturedKey=path.join(badRoots.terrain,"must-not-capture.key");await writeFile(capturedKey,await readFile(keyFile),{mode:0o600});await assert.rejects(s.backupEnvironment({...p,roots:badRoots},path.join(out,"refused-key-capture"),capturedKey,"unit","ALL_APPLICATION_JOB_IMPORT_AND_DIRECT_WRITERS_STOPPED"),/outside all captured/i);});
  await t.test("independent trusted public signature and original terrain reader verify exact bytes",async()=>{const verified=await s.verifySnapshot(snapshot,trust);assert.equal(verified.snapshotId,manifest.snapshotId);assert.equal(verified.files.filter(f=>f.linkTo).length,1);assert.equal((await lstat(path.join(roots.terrain,tile))).ino,(await lstat(path.join(roots.terrain,"same-tile.i16"))).ino);});
  await t.test("tampered manifest and hashes cannot be accepted without the original signature",async()=>{const target=path.join(snapshot,"manifest.json"),valid=await readFile(target);await writeFile(target,Buffer.concat([valid,Buffer.from(" ")]));await assert.rejects(s.verifySnapshot(snapshot,trust),/signature/i);await writeFile(target,valid);});
  await t.test("corrupt and missing immutable objects fail without being replaced",async()=>{const target=path.join(roots.terrain,tile);await writeFile(target,Buffer.alloc(2048,9));await assert.rejects(s.verifySnapshot(snapshot,trust),/differs|integrity/i);await writeFile(target,data);const missing=target+".retained-missing";assert.ok(missing.startsWith(out+path.sep));await rename(target,missing);await assert.rejects(s.verifySnapshot(snapshot,trust));await rename(missing,target);});
  await t.test("valid archive corruption is rejected by the signed content hash",async()=>{const target=path.join(snapshot,"database.dump");await writeFile(target,Buffer.alloc(archive.length,7));await assert.rejects(s.verifySnapshot(snapshot,trust),/archive checksum/i);await writeFile(target,archive);});
  const sealed=path.join(out,"transfer.stenv");await t.test("AES-256-GCM transfer retains snapshot identity and internal hardlinks",async()=>{assert.equal((await transfer.sealSnapshot(snapshot,keyFile,sealed)).sealed,true);const opened=path.join(out,"opened");assert.equal((await transfer.openSnapshot(sealed,keyFile,opened)).opened,true);const verified=await s.verifySnapshot(opened,trust);assert.equal(canonicalJson(verified),canonicalJson(manifest));const a=path.join(s.snapshotRoots(opened).terrain,tile),b=path.join(s.snapshotRoots(opened).terrain,"same-tile.i16");assert.equal((await lstat(a)).ino,(await lstat(b)).ino);});
  await t.test("tampered ciphertext authenticates before any manifest or object is published",async()=>{const corrupt=path.join(out,"corrupt.stenv"),bytes=await readFile(sealed);bytes[Math.floor(bytes.length/2)]^=1;await writeFile(corrupt,bytes,{mode:0o600});const destination=path.join(out,"rejected-transfer");await assert.rejects(transfer.openSnapshot(corrupt,keyFile,destination));assert.equal(await lstat(path.join(destination,"manifest.json")).then(()=>true,()=>false),false);assert.equal(await lstat(path.join(destination,"complete.json")).then(()=>true,()=>false),false);});
  await t.test("wrong encryption/trust keys and existing destinations are refused",async()=>{const other=path.join(out,"other.key"),publicFile=path.join(out,"other-trust.json");await f.keygen(other,publicFile);await assert.rejects(transfer.openSnapshot(sealed,other,path.join(out,"wrong-key")),/key/i);await assert.rejects(s.verifySnapshot(snapshot,await f.trustKey(publicFile)),/signature/i);await assert.rejects(transfer.openSnapshot(sealed,keyFile,path.join(out,"opened")),/new.*destination|Existing/i);await assert.rejects(transfer.sealSnapshot(snapshot,keyFile,path.join(roots.terrain,"would-mutate-snapshot")),/outside/i);});
  await t.test("unprotected permissions and unignored Git destinations fail before publishing",async()=>{const bad=path.join(out,"bad-permissions");await f.createPrivateDirectory(bad);if(process.platform==="win32")execFileSync("icacls.exe",[bad,"/grant","*S-1-1-0:(OI)(CI)R"],{windowsHide:true,stdio:"pipe"});else await chmod(bad,0o755);await assert.rejects(f.privatePermissions(bad),/permissions|access/i);const repository=path.join(out,"git-private-test");await mkdir(repository);execFileSync("git",["init","--quiet",repository],{windowsHide:true,stdio:"pipe"});await assert.rejects(f.refuseGitPublication(path.join(repository,"unignored-private-environment"),true),/Git/i);});
  await t.test("CLI rejects extra options without printing sensitive option values",()=>{const sentinel="DO_NOT_PRINT_PRIVATE_CREDENTIAL_123",r=spawnSync(process.execPath,["--conditions=react-server","--import","tsx","scripts/environment.ts","backup","--unsafe",sentinel],{encoding:"utf8",windowsHide:true});assert.equal(r.status,1);assert.ok(r.stderr.includes("COMMAND"));assert.equal((r.stdout+r.stderr).includes(sentinel),false);});
  await t.test("filesystem authority audit requires review of any new server-side file reader/writer",async()=>{const found:string[]=[];async function walk(directory:string){for(const e of await readdir(directory,{withFileTypes:true})){const full=path.join(directory,e.name);if(e.isDirectory())await walk(full);else if(/\.tsx?$/.test(e.name)&&!e.name.includes(".test.")){const text=await readFile(full,"utf8");if(/(?:from\s*["'](?:node:)?fs(?:\/promises)?["']|import\(\s*["'](?:node:)?fs)/.test(text))found.push(full.replaceAll("\\","/"));}}}await walk("src");assert.deepEqual(found.sort(),["src/features/worlds/atlas-asset-storage.ts","src/features/worlds/raster-numerical.ts","src/features/worlds/raster-storage.ts","src/features/worlds/terrain-storage.ts"]);});
});

test("versioned recovery catalogs retain legacy bytes and authenticate compressed metadata before restoring files",async t=>{
 const f=await import("./environment/private-files"),s=await import("./environment/snapshot"),transfer=await import("./environment/transfer"),catalog=await import("./environment/catalog"),model=await import("./environment/model");
 const out=path.resolve(`artifacts/infrastructure-catalog-unit-${randomUUID()}`);await f.createPrivateDirectory(out);
 const keyFile=path.join(out,"operator.key"),trustFile=path.join(out,"trust.json");await f.keygen(keyFile,trustFile);const key=await f.privateKey(keyFile),trust=await f.trustKey(trustFile);
 const plain=path.join(out,"plain");await f.createPrivateDirectory(plain);await f.createPrivateDirectory(path.join(plain,"files"));const roots=s.snapshotRoots(plain);for(const r of Object.values(roots))await f.createPrivateDirectory(r);
 const data=Buffer.alloc(2048,7),sha=digest(data),tile=`objects/${sha.slice(0,2)}/${sha}.i16`;await mkdir(path.dirname(path.join(roots.terrain,tile)),{recursive:true,mode:0o700});await writeFile(path.join(roots.terrain,tile),data,{mode:0o600});await link(path.join(roots.terrain,tile),path.join(roots.terrain,"same-tile.i16"));
 const archive=Buffer.from("PGDMP catalog unit fixture; real database restoration is exercised separately"),manifest:SnapshotManifest={format:"serrian-environment",version:1,snapshotId:randomUUID(),createdAt:new Date().toISOString(),sourceEnvironment:"catalog-unit",sourceDatabaseName:"catalog_unit",applicationCommit:null,database:{serverMajor:18,serverVersion:"18 catalog unit",encoding:"UTF8",databaseBytes:0,locale:{provider:"c",collate:"C",ctype:"C",locale:null,version:null},tables:[],sequences:[],largeObjects:[],schemaSha256:digest("schema"),extensions:[],migrations:[],references:{terrain:[{sha256:sha,bytes:2048,encoding:"i16le-v1"}],artwork:[],rasters:[]}},archive:{key:"database.dump",bytes:archive.length,sha256:digest(archive)},files:await f.inventoryFiles(roots),freeze:{operator:"Owned catalog fixture",statement:"ALL_APPLICATION_JOB_IMPORT_AND_DIRECT_WRITERS_STOPPED",checkedOtherClients:0,tableWriteLocks:true,beforeAfterIdentical:true}};
 await writeFile(path.join(plain,"database.dump"),archive,{mode:0o600});
 await t.test("ordinary signed snapshots keep the original pretty JSON and metadata frame order",async()=>{
  const encoded=await catalog.writeSnapshotManifest(plain,manifest,key);assert.equal(encoded.storageVersion,1);assert((await readFile(path.join(plain,"manifest.json"))).equals(Buffer.from(JSON.stringify(manifest,null,2)+"\n")));
  await f.signJson(path.join(plain,"complete.json"),{version:1,snapshotId:manifest.snapshotId,manifestSha256:encoded.manifestSha256},key);
  assert.deepEqual(await catalog.snapshotMetadataNames(plain,trust),["manifest.json","manifest.json.signature","complete.json","complete.json.signature"]);assert.equal(canonicalJson(await s.verifySnapshot(plain,trust)),canonicalJson(manifest));
 });
 const packed=path.join(out,"packed");await f.createPrivateDirectory(packed);await f.createPrivateDirectory(path.join(packed,"files"));const packedRoots=s.snapshotRoots(packed);for(const r of Object.values(packedRoots))await f.createPrivateDirectory(r);await f.copyFiles(manifest.files,roots,packedRoots);await writeFile(path.join(packed,"database.dump"),archive,{mode:0o600});
 const encoded=await catalog.writePackedSnapshotManifest(packed,manifest,key);await f.signJson(path.join(packed,"complete.json"),{version:1,snapshotId:manifest.snapshotId,manifestSha256:encoded.manifestSha256},key);const packedFile=path.join(packed,model.MANIFEST_CATALOG_KEY),validPacked=await readFile(packedFile);
 await t.test("cancelled catalog, inventory and transfer operations cannot certify or publish completion",async()=>{
  const controller=new AbortController();controller.abort();const signal=controller.signal,dir=path.join(out,"cancelled-catalog");await f.createPrivateDirectory(dir);
  const aborted=(error:unknown)=>error instanceof Error&&error.name==="AbortError";
  await assert.rejects(catalog.writeSnapshotManifest(dir,manifest,key,signal),aborted);await assert.rejects(catalog.writePackedSnapshotManifest(dir,manifest,key,signal),aborted);
  await assert.rejects(catalog.readSnapshotManifest(packed,trust,signal),aborted);await assert.rejects(s.verifySnapshot(packed,trust,true,signal),aborted);
  await assert.rejects(f.inventoryFiles(roots,model.CATALOG_FILE_LIMIT,signal),aborted);
  const sealed=path.join(out,"cancelled-transfer.stenv");await assert.rejects(transfer.sealSnapshot(packed,keyFile,sealed,signal),aborted);
  for(const file of [path.join(dir,"manifest.json"),path.join(dir,"complete.json"),sealed])assert.equal(await lstat(file).then(()=>true,()=>false),false);
 });
 await t.test("a signed version-two descriptor binds the exact catalog and original logical snapshot",async()=>{
  const header=await catalog.readSnapshotHeader(packed,trust);assert.equal(header.version,2);assert.equal(canonicalJson(await s.verifySnapshot(packed,trust)),canonicalJson(manifest));assert.equal(encoded.expandedBytes,Buffer.byteLength(JSON.stringify(manifest)+"\n"));
 });
 const sealed=path.join(out,"catalog.stenv"),opened=path.join(out,"opened");
 await t.test("compressed metadata, original database/archive bytes and hardlinks round-trip through authenticated AES transfer",async()=>{
  await transfer.sealSnapshot(packed,keyFile,sealed);await transfer.openSnapshot(sealed,keyFile,opened);
  assert.equal(canonicalJson(await s.verifySnapshot(opened,trust)),canonicalJson(manifest));
  for(const name of await catalog.snapshotMetadataNames(packed,trust))assert((await readFile(path.join(packed,name))).equals(await readFile(path.join(opened,name))),name);
  assert((await readFile(path.join(opened,"database.dump"))).equals(archive));const r=s.snapshotRoots(opened);assert.equal((await lstat(path.join(r.terrain,tile))).ino,(await lstat(path.join(r.terrain,"same-tile.i16"))).ino);
 });
 await t.test("catalog corruption refuses before decompression and cannot replace original accepted metadata",async()=>{
  const bad=Buffer.from(validPacked);bad[Math.floor(bad.length/2)]^=1;await writeFile(packedFile,bad);await assert.rejects(catalog.readSnapshotManifest(packed,trust),(error:unknown)=>error instanceof model.EnvironmentError&&error.code==="CATALOG_INTEGRITY");await writeFile(packedFile,validPacked);assert.equal(canonicalJson(await s.verifySnapshot(packed,trust)),canonicalJson(manifest));
 });
 await t.test("the original completion receipt cannot certify a different physical metadata encoding",async()=>{
  const complete=await readFile(path.join(packed,"complete.json")),signature=await readFile(path.join(packed,"complete.json.signature"));await writeFile(path.join(packed,"complete.json"),await readFile(path.join(plain,"complete.json")));await writeFile(path.join(packed,"complete.json.signature"),await readFile(path.join(plain,"complete.json.signature")));await assert.rejects(s.verifySnapshot(packed,trust),/completion receipt/);await writeFile(path.join(packed,"complete.json"),complete);await writeFile(path.join(packed,"complete.json.signature"),signature);
 });
 await t.test("tampered version-two ciphertext publishes neither a manifest nor accepted data",async()=>{
  const bad=await readFile(sealed);bad[Math.floor(bad.length/2)]^=1;const file=path.join(out,"bad.stenv"),dest=path.join(out,"bad-open");await writeFile(file,bad,{mode:0o600});await assert.rejects(transfer.openSnapshot(file,keyFile,dest));assert.equal(await lstat(path.join(dest,"manifest.json")).then(()=>true,()=>false),false);assert.equal(await lstat(path.join(dest,"complete.json")).then(()=>true,()=>false),false);
 });
 await t.test("fixed catalog paths, declared decode lengths and absolute decode bounds fail closed",async()=>{
  const header=await catalog.readSnapshotHeader(packed,trust);assert(header.version===2);
  for(const[name,change]of [["path",{key:"../not-a-catalog"}],["absolute-size",{expandedBytes:model.MAX_CATALOG_JSON_BYTES+1}],["overrun",{expandedBytes:1}]] as const){
   const dir=path.join(out,name);await f.createPrivateDirectory(dir);await writeFile(path.join(dir,model.MANIFEST_CATALOG_KEY),validPacked,{mode:0o600});await f.signJson(path.join(dir,"manifest.json"),{...header,catalog:{...header.catalog,...change}},key);
   await assert.rejects(catalog.readSnapshotManifest(dir,trust),(error:unknown)=>name==="overrun"?error instanceof model.EnvironmentError&&error.code==="CATALOG_LIMIT":error instanceof Error&&error.name==="ZodError");
  }
 });
 await t.test("legacy version-one readers retain their250000-record bound while the explicit catalog schema refuses500001",async()=>{
  const base=manifest.files[0],large={...manifest,files:Array.from({length:250001},(_,i)=>({...base,key:"metadata-only/file-"+i}))},dir=path.join(out,"invalid-legacy");await f.createPrivateDirectory(dir);await f.signJson(path.join(dir,"manifest.json"),large,key);
  await assert.rejects(catalog.readSnapshotManifest(dir,trust),(error:unknown)=>error instanceof Error&&error.name==="ZodError");
  assert.throws(()=>model.catalogManifestSchema.parse({...manifest,files:Array(500001).fill(base)}),(error:unknown)=>error instanceof Error&&error.name==="ZodError");
  await assert.rejects(f.inventoryFiles(roots,500001),/supported/);
 });
 await t.test("a metadata-only catalog beyond64MiB encodes and fully reopens without increasing the plain or compressed bound",async()=>{
  const count=200000,prefix="metadata-only/"+ "x".repeat(180)+"/",files=Array.from({length:count},(_,i)=>({root:"terrain" as const,key:prefix+"file-"+String(i).padStart(6,"0"),bytes:2048,sha256:digest("owned-catalog-"+i)}));
  const value=model.catalogManifestSchema.parse({...manifest,snapshotId:randomUUID(),files,database:{...manifest.database,references:{...manifest.database.references,terrain:files.map(v=>({sha256:v.sha256,bytes:2048 as const,encoding:"i16le-v1" as const}))}}}),dir=path.join(out,"large-metadata-only");await f.createPrivateDirectory(dir);
  const expected=catalog.measureSnapshotCatalog(value);assert(expected.bytes>model.MAX_MANIFEST_BYTES);const result=await catalog.writeSnapshotManifest(dir,value,key);assert.equal(result.storageVersion,2);assert(result.expandedBytes<=model.MAX_CATALOG_JSON_BYTES);
  const decoded=await catalog.readSnapshotManifest(dir,trust);assert.equal(decoded.files.length,count);assert.equal(decoded.database.references.terrain.length,count);assert.deepEqual(catalog.measureSnapshotCatalog(decoded),expected);
  const header=await catalog.readSnapshotHeader(dir,trust);assert(header.version===2);assert(header.catalog.bytes<=model.MAX_MANIFEST_BYTES);assert.equal(model.MAX_MANIFEST_BYTES,67108864);
  const cancelled=path.join(out,"large-cancelled");await f.createPrivateDirectory(cancelled);const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),5);
  try{await assert.rejects(catalog.writeSnapshotManifest(cancelled,value,key,abort.signal),(error:unknown)=>error instanceof Error&&error.name==="AbortError");}finally{clearTimeout(timer);}
  assert.equal(await lstat(path.join(cancelled,"manifest.json")).then(()=>true,()=>false),false);assert.equal(await lstat(path.join(cancelled,"complete.json")).then(()=>true,()=>false),false);
 });
});


test("reference verification keeps at most16reads active and fully drains each group",async()=>{
 const {verifyReferenceGroups}=await import("./environment/reference-reader"),tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
 const gates=Array.from({length:33},()=>{let release!:()=>void;const promise=new Promise<void>(resolve=>{release=resolve;});return {promise,release};}),started:number[]=[];let active=0,maximum=0;
 const pending=verifyReferenceGroups(gates.map((_,i)=>i),async i=>{started.push(i);active++;maximum=Math.max(maximum,active);await gates[i].promise;active--;});
 await tick();assert.equal(started.length,16);for(let i=0;i<15;i++)gates[i].release();await tick();assert.equal(started.length,16,"A later group cannot start while an earlier read remains pending");
 gates[15].release();await tick();assert.equal(started.length,32);for(let i=16;i<32;i++)gates[i].release();await tick();assert.equal(started.length,33);gates[32].release();await pending;assert.equal(maximum,16);assert.equal(active,0);
});

test("reference verification drains a failing group and preserves the first input error",async()=>{
 const {verifyReferenceGroups}=await import("./environment/reference-reader"),tick=()=>new Promise<void>(resolve=>setImmediate(resolve)),first=new Error("first reference"),second=new Error("second reference");
 let release!:()=>void,settled=false,active=0;const gate=new Promise<void>(resolve=>{release=resolve;}),started:number[]=[];
 const pending=verifyReferenceGroups(Array.from({length:17},(_,i)=>i),async i=>{started.push(i);active++;try{if(i===1)throw second;await gate;if(i===0)throw first;}finally{active--;}});
 const outcome=pending.then(()=>undefined,error=>error).finally(()=>{settled=true;});await tick();assert.equal(settled,false,"Callers must not restore storage roots while a read is pending");assert.equal(started.length,16);release();assert.equal(await outcome,first);assert.equal(active,0);assert.equal(started.length,16,"No next group starts after a failed group");
});

test("reference verification cancellation prevents later groups and also refuses an empty pre-aborted read",async()=>{
 const {verifyReferenceGroups}=await import("./environment/reference-reader"),tick=()=>new Promise<void>(resolve=>setImmediate(resolve)),controller=new AbortController(),reason=new Error("cancel reference verification");
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;}),started:number[]=[];
 const pending=verifyReferenceGroups(Array.from({length:17},(_,i)=>i),async i=>{started.push(i);await gate;},controller.signal),outcome=pending.then(()=>undefined,error=>error);
 await tick();assert.equal(started.length,16);controller.abort(reason);release();assert.equal(await outcome,reason);assert.equal(started.length,16);
 let calls=0;await assert.rejects(verifyReferenceGroups([],async()=>{calls++;},controller.signal),error=>error===reason);assert.equal(calls,0);
});

test("multiple terrain-reference groups retain complete file guards and restore all storage roots",async()=>{
 const f=await import("./environment/private-files"),{verifyReferences}=await import("./environment/database"),out=path.resolve(`artifacts/infrastructure-reference-readers-${randomUUID()}`);await f.createPrivateDirectory(out);
 const roots={terrain:path.join(out,"terrain"),artwork:path.join(out,"artwork"),raster:path.join(out,"raster")};for(const root of Object.values(roots))await f.createPrivateDirectory(root);
 const references=[] as import("./environment/model").DatabaseState["references"]["terrain"],originals:Buffer[]=[];
 for(let i=0;i<33;i++){const bytes=Buffer.alloc(2048,i+1),sha256=digest(bytes),file=path.join(roots.terrain,"objects",sha256.slice(0,2),sha256+".i16");await mkdir(path.dirname(file),{recursive:true,mode:0o700});await writeFile(file,bytes,{flag:"wx",mode:0o600});references.push({sha256,bytes:2048,encoding:"i16le-v1"});originals.push(bytes);}
 const state={references:{terrain:references,artwork:[],rasters:[]}} as unknown as import("./environment/model").DatabaseState,keys=["SERRIAN_TERRAIN_ROOT","SERRIAN_ASSET_ROOT","SERRIAN_RASTER_ROOT"],before=keys.map(key=>process.env[key]);
 await verifyReferences(state,roots);assert.deepEqual(keys.map(key=>process.env[key]),before);
 for(const change of [{bytes:2},{encoding:"unknown"}]){const refs=references.map((ref,i)=>i===32?{...ref,...change}:ref);await assert.rejects(verifyReferences({...state,references:{...state.references,terrain:refs}} as unknown as import("./environment/model").DatabaseState,roots),/unavailable/);assert.deepEqual(keys.map(key=>process.env[key]),before);}
 const last=references[32],file=path.join(roots.terrain,"objects",last.sha256.slice(0,2),last.sha256+".i16");await writeFile(file,Buffer.alloc(2048,255));await assert.rejects(verifyReferences(state,roots),/checksum/);assert.deepEqual(keys.map(key=>process.env[key]),before);await writeFile(file,originals[32]);await verifyReferences(state,roots);
 const controller=new AbortController();controller.abort();await assert.rejects(verifyReferences(state,roots,controller.signal),error=>error instanceof Error&&error.name==="AbortError");assert.deepEqual(keys.map(key=>process.env[key]),before);
});
