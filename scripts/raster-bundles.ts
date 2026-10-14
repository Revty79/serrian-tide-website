/** Portable offline provisioning primitives. No database writes, remote access,
 * raster regeneration or dependency on development artifact paths. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile,writeFile,mkdir,lstat,realpath,stat,readdir,unlink} from "node:fs/promises";
import path from "node:path";
import {gunzipSync} from "node:zlib";
import {rasterManifestSchema,type RasterManifest} from "../src/features/worlds/raster";
import {categoricalManifestSchema,type CategoricalManifest} from "../src/features/worlds/categorical-raster";
import {fileDigest,stageRasterBundle} from "../src/features/worlds/raster-storage";
import {numericalReader} from "../src/features/worlds/raster-numerical";
import {categoricalOriginal} from "../src/features/worlds/categorical-original";

export type BundleManifest=RasterManifest|CategoricalManifest;
export const sha=(bytes:Uint8Array|string)=>createHash("sha256").update(bytes).digest("hex");
export function parseManifest(value:unknown):BundleManifest{return typeof value==="object"&&value!==null&&"version" in value&&value.version===2?categoricalManifestSchema.parse(value):rasterManifestSchema.parse(value);}
export async function canonicalElevation(){
  const receipt=JSON.parse(await readFile(new URL("../data/geography/etopo-2022-surface.json",import.meta.url),"utf8"));
  const {preparation,...runtime}=receipt,manifest=rasterManifestSchema.parse(runtime),text=JSON.stringify(manifest,null,2)+"\n";
  assert.equal(sha(text),preparation.bundleManifestSha256,"Canonical C2 reconstruction differs from frozen receipt");return {manifest,text,bundle:sha(text)};
}
export async function writeCanonicalElevation(directory:string){const c=await canonicalElevation();await mkdir(directory,{recursive:true});const target=path.join(directory,"manifest.json");try{assert.equal(await readFile(target,"utf8"),c.text,"Existing manifest differs; never overwrite an immutable manifest");}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;await writeFile(target,c.text,{flag:"wx"});}return c.bundle;}
/** Reject symlinks at every level, including manifest and retained bundle dirs. */
export async function safeFile(directory:string,key:string,parents?:Map<string,string>){
  assert.ok(!path.isAbsolute(key)&&!key.includes("\\")&&key.split("/").every(p=>p&&p!=="."&&p!==".."),"Unsafe bundle key");
  const root=parents?.get("")??await realpath(directory);parents?.set("",root);let file=root;const parts=key.split("/");for(const [i,part] of parts.entries()){file=path.join(file,part);if(i<parts.length-1&&parents?.has(file))continue;const s=await lstat(file);assert.ok(!s.isSymbolicLink(),"Bundle may not traverse symbolic links");if(i<parts.length-1){assert.ok(s.isDirectory());parents?.set(file,file);}else assert.ok(s.isFile());}return file;
}
export async function loadBundle(directory:string){const bytes=await readFile(await safeFile(directory,"manifest.json")),text=bytes.toString("utf8");assert.ok(Buffer.from(text,"utf8").equals(bytes),"The retained manifest is not valid UTF-8");const manifest=parseManifest(JSON.parse(text));return {manifest,text,bundle:sha(bytes)};}
async function bundleFiles(directory:string,prefix=""):Promise<string[]>{const files:string[]=[];for(const entry of await readdir(path.join(directory,prefix),{withFileTypes:true})){assert.ok(!entry.isSymbolicLink(),"Retained bundle may not contain symbolic links");const key=prefix?`${prefix}/${entry.name}`:entry.name;if(entry.isDirectory())files.push(...await bundleFiles(directory,key));else{assert.ok(entry.isFile());files.push(key);}}return files;}
export async function verifyBundle(directory:string,options:{canonical?:boolean;values?:boolean;clean?:boolean}={}){
  const {manifest:m,text,bundle}=await loadBundle(directory),digestCache=new Map<string,string>(),parents=new Map<string,string>(),inodes=new Map<string,{bytes:number;blocks:number|undefined;links:number}>(),fileFor=(key:string)=>safeFile(directory,key,parents);
  if(options.clean){const expected=new Set(["manifest.json",...m.assets.map(a=>a.key)]);for(const key of await bundleFiles(directory))assert.ok(expected.has(key),`Unexpected or interrupted retained file: ${key}`);}
  if(options.canonical){if(m.version===1)assert.equal(bundle,(await canonicalElevation()).bundle,"C2 bundle is not the canonical retained bundle");else{const receipt=JSON.parse(await readFile(new URL("../data/geography/worldcover-land-cover.json",import.meta.url),"utf8"));assert.equal(bundle,receipt.bundleSha256,"C3 bundle is not the frozen retained bundle");assert.equal(m.originalTiles.length,receipt.sourceTiles);assert.equal(m.source.sha256,receipt.download.sourceIndexSha256);assert.equal(m.statistics.originalValuesSha256,receipt.originalValuesSha256);}}
  for(const a of m.assets){
    const file=await fileFor(a.key),s=await stat(file,{bigint:true});assert.equal(Number(s.size),a.bytes,`Wrong asset size: ${a.key}`);const id=`${s.dev}:${s.ino}`,fingerprint=`${id}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;let digest=digestCache.get(fingerprint);if(!digest){digest=await fileDigest(file);digestCache.set(fingerprint,digest);}assert.equal(digest,a.sha256,`Corrupt asset: ${a.key}`);inodes.set(id,{bytes:a.bytes,blocks:s.blocks===undefined?undefined:Number(s.blocks),links:Number(s.nlink)});
    if(m.version===1&&a.kind==="numerical"){const match=/^numerical\/(\d+)\/(\d+)-(\d+)\.f32\.gz$/.exec(a.key);assert.ok(match);const [,factor,x,y]=match.map(Number),l=m.levels.find(v=>v.factor===factor)!,count=Math.min(256,l.width-x*256)*Math.min(256,l.height-y*256)*4;assert.equal(gunzipSync(await readFile(file),{maxOutputLength:count}).length,count,`Incomplete numerical tile ${a.key}`);}
  }
  if(m.version===2){
    const index=JSON.parse(await readFile(await safeFile(directory,"source/index.json"),"utf8"));assert.deepEqual(index.grid,m.grid);assert.equal(index.tiles.length,m.originalTiles.length);
    for(const tile of m.originalTiles){const original=index.tiles.find((t:{key:string})=>t.key===tile.key);assert.ok(original,`Source index misses ${tile.key}`);for(const [key,value] of Object.entries(tile))assert.deepEqual(original[key],value,`Source index disagrees on ${tile.key}:${key}`);const values=gunzipSync(await readFile(await safeFile(directory,tile.key)),{maxOutputLength:tile.width*tile.height});assert.equal(values.length,tile.width*tile.height);assert.equal(sha(values),tile.valuesSha256);const codes=new Set(m.classes.map(c=>c.code));assert.ok(values.every(v=>v===m.grid.noData||codes.has(v)),"Undeclared original class code");}
  }
  if(options.values){
    const hash=createHash("sha256");if(m.version===1){const a=m.assets.find(a=>a.kind==="source")!,reader=await numericalReader(await safeFile(directory,a.key),m.grid);try{for(let y=0;y<m.grid.height;y+=256){const values=await reader.read(0,y,m.grid.width,Math.min(256,m.grid.height-y)),bytes=Buffer.alloc(values.length*4);for(let i=0;i<values.length;i++)bytes.writeFloatLE(values[i],i*4);hash.update(bytes);}}finally{await reader.close();}assert.equal(hash.digest("hex"),m.statistics.nativeValuesSha256);}
    else{const reader=categoricalOriginal(m.grid,m.originalTiles,async key=>readFile(await safeFile(directory,key)),240);try{for(let row=0;row<m.grid.height;row++)hash.update(await reader.read(0,row,m.grid.width,1));}finally{reader.clear();}assert.equal(hash.digest("hex"),m.statistics.originalValuesSha256);}
  }
  const physical=[...inodes.values()],manifestBytes=Buffer.byteLength(text),logicalBytes=m.assets.reduce((n,a)=>n+a.bytes,manifestBytes),allocation4K=physical.reduce((n,a)=>n+Math.ceil(a.bytes/4096)*4096,Math.ceil(manifestBytes/4096)*4096),blocksKnown=physical.every(a=>a.blocks!==undefined),allocatedAssetBytes=blocksKnown?physical.reduce((n,a)=>n+a.blocks!*512,0):null,manifestStat=await stat(path.join(directory,"manifest.json"),{bigint:true}),allocatedTotalBytes=allocatedAssetBytes===null||manifestStat.blocks===undefined?null:allocatedAssetBytes+Number(manifestStat.blocks)*512;
  // Node's Windows block reporting does not establish NTFS cluster allocation;
  // use the explicit conservative 4-KiB model for the Windows rehearsal.
  const budgetAllocationBytes=process.platform==="win32"?allocation4K:allocatedTotalBytes??allocation4K;
  return {bundle,version:m.version,assets:m.assets.length,logicalBytes,manifestBytes,uniqueAssetFiles:physical.length,allocation4K,allocatedAssetBytes,allocatedTotalBytes,budgetAllocationBytes,allocationMethod:process.platform==="win32"?"4-KiB physical-file model":"filesystem blocks including manifest",maximumLinks:Math.max(...physical.map(a=>a.links)),filesystemMetadataAllowance:physical.length*1024+m.assets.length*128,sourceSha256:m.source.sha256,valuesSha256:m.version===1?m.statistics.nativeValuesSha256:m.statistics.originalValuesSha256,fullValuesChecked:!!options.values};
}
export async function provisionBundle(source:string,root:string,canonical=true){
  const before=await verifyBundle(source,{canonical});await mkdir(root,{recursive:true});const previous=process.env.SERRIAN_RASTER_ROOT;process.env.SERRIAN_RASTER_ROOT=path.resolve(root);try{const staged=await stageRasterBundle(source,parseManifest);assert.equal(staged.bundle,before.bundle);const directory=path.join(root,staged.bundle),keys=new Set(["manifest.json",...staged.manifest.assets.map(a=>a.key)]);for(const key of await bundleFiles(directory)){const original=key.replace(/\.[a-f0-9-]{36}\.partial$/,"");if(original!==key&&keys.has(original))await unlink(path.join(directory,key));}const verified=await verifyBundle(directory,{canonical,clean:true});if(staged.manifest.version===2){assert.ok(verified.maximumLinks<=512,"C3 hardlink group exceeds supported size");const groups=new Map<string,number>();for(const a of staged.manifest.assets)groups.set(a.sha256,(groups.get(a.sha256)??0)+1);const expected=[...groups.values()].reduce((n,count)=>n+Math.ceil(count/512),0);assert.ok(verified.uniqueAssetFiles<=expected,"C3 was flattened; restore hardlinks on a clean volume");}return verified;}finally{if(previous===undefined)delete process.env.SERRIAN_RASTER_ROOT;else process.env.SERRIAN_RASTER_ROOT=previous;}
}
export async function retainedBundles(root:string){const directories=await readdir(root,{withFileTypes:true});return directories.filter(d=>d.isDirectory()&&/^[a-f0-9]{64}$/.test(d.name)).map(d=>d.name).sort();}
