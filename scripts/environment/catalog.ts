import path from "node:path";
import {createReadStream,createWriteStream} from "node:fs";
import {open,stat} from "node:fs/promises";
import {createHash} from "node:crypto";
import {Readable,Transform,Writable} from "node:stream";
import {pipeline} from "node:stream/promises";
import {createGzip,createGunzip} from "node:zlib";
import {EnvironmentError,manifestSchema,catalogManifestSchema,catalogDescriptorSchema,MAX_MANIFEST_BYTES,MAX_CATALOG_JSON_BYTES,MANIFEST_CATALOG_KEY,requireCondition,type SnapshotManifest} from "./model";
import {absent,signJson,verifiedJson,retainedFile,privatePermissions,type PrivateKey,type TrustKey} from "./private-files";

export const SNAPSHOT_METADATA_PREFIX=["manifest.json","manifest.json.signature"] as const;
const completion=["complete.json","complete.json.signature"] as const;

/** Plain JSON semantics for validated metadata, emitted in bounded buffers.
 * File contents and database rows are never encoded here. */
function* pieces(value:unknown):Generator<string>{
 if(value===null||typeof value!=="object"){const text=JSON.stringify(value);requireCondition(text!==undefined,"CATALOG_JSON","The recovery catalog contains unsupported JSON.");yield text;return;}
 if(Array.isArray(value)){yield "[";for(let i=0;i<value.length;i++){if(i)yield ",";yield* pieces(value[i]);}yield "]";return;}
 yield "{";let first=true;for(const[key,item]of Object.entries(value)){if(item===undefined)continue;if(!first)yield ",";first=false;yield JSON.stringify(key);yield ":";yield* pieces(item);}yield "}";
}
function* jsonChunks(value:SnapshotManifest,signal?:AbortSignal):Generator<Buffer>{
 signal?.throwIfAborted();let pending="",bytes=0;
 for(const text of pieces(value)){pending+=text;if(pending.length<16384)continue;signal?.throwIfAborted();const chunk=Buffer.from(pending);bytes+=chunk.length;requireCondition(bytes<=MAX_CATALOG_JSON_BYTES,"CATALOG_LIMIT","The expanded recovery catalog exceeds256MiB.");yield chunk;pending="";}
 signal?.throwIfAborted();const chunk=Buffer.from(pending+"\n");bytes+=chunk.length;requireCondition(bytes<=MAX_CATALOG_JSON_BYTES,"CATALOG_LIMIT","The expanded recovery catalog exceeds256MiB.");if(chunk.length)yield chunk;
}
export function measureSnapshotCatalog(value:SnapshotManifest,signal?:AbortSignal){const hash=createHash("sha256");let bytes=0;for(const chunk of jsonChunks(value,signal)){bytes+=chunk.length;hash.update(chunk);}return {bytes,sha256:hash.digest("hex")};}
export async function readSnapshotHeader(directory:string,trust:TrustKey){
 const value=await verifiedJson(path.join(directory,"manifest.json"),trust);
 return value?.version===1?manifestSchema.parse(value):catalogDescriptorSchema.parse(value);
}
export async function snapshotMetadataNames(directory:string,trust:TrustKey){
 const header=await readSnapshotHeader(directory,trust);
 return [...SNAPSHOT_METADATA_PREFIX,...header.version===2?[MANIFEST_CATALOG_KEY]:[],...completion];
}
async function writePacked(directory:string,value:SnapshotManifest,key:PrivateKey,expected:ReturnType<typeof measureSnapshotCatalog>,signal?:AbortSignal){
 signal?.throwIfAborted();await absent(path.join(directory,"manifest.json"));const file=path.join(directory,MANIFEST_CATALOG_KEY);await absent(file);
 const encoded=createHash("sha256"),expanded=createHash("sha256");let bytes=0,expandedBytes=0;
 const source=function*(){for(const chunk of jsonChunks(value,signal)){expandedBytes+=chunk.length;expanded.update(chunk);yield chunk;}};
 const counter=new Transform({transform(chunk:Buffer,_encoding,callback){try{bytes+=chunk.length;requireCondition(bytes<=MAX_MANIFEST_BYTES,"CATALOG_LIMIT","The compressed recovery catalog exceeds64MiB.");encoded.update(chunk);callback(null,chunk);}catch(error){callback(error instanceof Error?error:new Error("CATALOG_LIMIT"));}}});
 await pipeline(Readable.from(source()),createGzip({level:6}),counter,createWriteStream(file,{flags:"wx",mode:0o600}),{signal});
 const actualExpanded=expanded.digest("hex");requireCondition(expandedBytes===expected.bytes&&actualExpanded===expected.sha256,"CATALOG_CHANGED","Recovery metadata changed during catalog encoding.");
 requireCondition((await stat(file)).size===bytes,"CATALOG_INTEGRITY","The completed catalog length differs.");const handle=await open(file,"r+");try{await handle.sync();}finally{await handle.close();}await privatePermissions(file);
 const descriptor=catalogDescriptorSchema.parse({format:"serrian-environment",version:2,snapshotId:value.snapshotId,catalog:{key:MANIFEST_CATALOG_KEY,encoding:"gzip-json-v1",bytes,sha256:encoded.digest("hex"),expandedBytes,expandedSha256:actualExpanded}});
 const manifestSha256=await signJson(path.join(directory,"manifest.json"),descriptor,key);return {storageVersion:2 as const,manifestSha256,catalogBytes:bytes,expandedBytes};
}
/** Explicit encoder shares exactly the production catalog guards. */
export async function writePackedSnapshotManifest(directory:string,value:SnapshotManifest,key:PrivateKey,signal?:AbortSignal){
 signal?.throwIfAborted();catalogManifestSchema.parse(value);return writePacked(directory,value,key,measureSnapshotCatalog(value,signal),signal);
}
export async function writeSnapshotManifest(directory:string,value:SnapshotManifest,key:PrivateKey,signal?:AbortSignal){
 signal?.throwIfAborted();const legacy=value.files.length<=250000&&value.database.references.terrain.length<=250000&&value.database.references.artwork.length<=250000;
 (legacy?manifestSchema:catalogManifestSchema).parse(value);const size=measureSnapshotCatalog(value,signal);signal?.throwIfAborted();
 if(legacy&&size.bytes<=MAX_MANIFEST_BYTES)return {storageVersion:1 as const,manifestSha256:await signJson(path.join(directory,"manifest.json"),value,key),expandedBytes:size.bytes};
 return writePacked(directory,value,key,size,signal);
}
export async function readSnapshotManifest(directory:string,trust:TrustKey,signal?:AbortSignal):Promise<SnapshotManifest>{
 signal?.throwIfAborted();const header=await readSnapshotHeader(directory,trust);signal?.throwIfAborted();if(header.version===1)return header;
 const meta=header.catalog,file=await retainedFile(directory,MANIFEST_CATALOG_KEY),metadata=await stat(file);requireCondition(metadata.size===meta.bytes,"CATALOG_INTEGRITY","The signed recovery catalog is missing or has a different length.");
 const encoded=createHash("sha256");let read=0;for await(const chunk of createReadStream(file)){signal?.throwIfAborted();read+=chunk.length;requireCondition(read<=meta.bytes,"CATALOG_INTEGRITY","The signed catalog grew while reading.");encoded.update(chunk);}requireCondition(read===meta.bytes&&encoded.digest("hex")===meta.sha256,"CATALOG_INTEGRITY","The signed catalog failed its checksum.");
 const expanded=createHash("sha256"),chunks:Buffer[]=[];let bytes=0;
 const collect=new Writable({write(chunk:Buffer,_encoding,callback){try{bytes+=chunk.length;requireCondition(bytes<=meta.expandedBytes&&bytes<=MAX_CATALOG_JSON_BYTES,"CATALOG_LIMIT","The recovery catalog exceeds its signed expanded length.");expanded.update(chunk);chunks.push(chunk);callback();}catch(error){callback(error instanceof Error?error:new Error("CATALOG_LIMIT"));}}});
 try{await pipeline(createReadStream(file),createGunzip({chunkSize:65536}),collect,{signal});}catch(error){if(error instanceof EnvironmentError||signal?.aborted)throw error;throw new EnvironmentError("CATALOG_ENCODING","The signed recovery catalog could not be decompressed.");}
 requireCondition(bytes===meta.expandedBytes&&expanded.digest("hex")===meta.expandedSha256,"CATALOG_INTEGRITY","The expanded catalog failed its signed length or checksum.");
 let value:unknown;try{value=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks,bytes)));}catch{throw new EnvironmentError("CATALOG_JSON","The signed catalog does not contain valid UTF-8 JSON.");}
 const manifest=catalogManifestSchema.parse(value);requireCondition(manifest.snapshotId===header.snapshotId,"SNAPSHOT_PAIR","The catalog and descriptor identify different snapshots.");return manifest;
}
