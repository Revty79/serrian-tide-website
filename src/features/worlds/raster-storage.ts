import "server-only";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, realpath, stat, copyFile, link } from "node:fs/promises";
import path from "node:path";
import { rasterManifestSchema, type RasterAsset, type RasterManifest } from "./raster";
type StoredAsset=Pick<RasterAsset,"key"|"sha256"|"bytes">;

export const rasterRoot=()=>path.resolve(/* turbopackIgnore: true */ process.env.SERRIAN_RASTER_ROOT?.trim()||"storage/world-raster");
export async function fileDigest(file:string){const hash=createHash("sha256");for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest("hex");}
export function bundlePath(bundle:string,key:string){if(!/^[a-f0-9]{64}$/.test(bundle)||!/^((source|numerical|shaded|tint|classification)\/[a-zA-Z0-9_.\/-]+|manifest.json)$/.test(key)||key.split("/").some(p=>p===".."||p==="."))throw new Error("Invalid raster asset identity.");const root=rasterRoot(),file=path.resolve(root,bundle,key);if(!file.startsWith(root+path.sep))throw new Error("Invalid raster asset path.");return file;}
export async function rasterAssetFile(bundle:string,asset:StoredAsset){const file=bundlePath(bundle,asset.key),resolved=await realpath(/* turbopackIgnore: true */ file),root=await realpath(rasterRoot());if(!resolved.startsWith(root+path.sep)||!(await stat(resolved)).isFile()||(await stat(resolved)).size!==asset.bytes)throw new Error("The retained raster asset is unavailable. Restore the verified asset backup.");return resolved;}
export async function readRasterAsset(bundle:string,asset:StoredAsset){const file=await rasterAssetFile(bundle,asset),bytes=await readFile(file);if(createHash("sha256").update(bytes).digest("hex")!==asset.sha256)throw new Error("The retained raster asset failed its integrity check.");return bytes;}
/** Stage immutable files before the metadata transaction. Retry verifies every
 * existing object; failed transactions leave only an unreferenced safe bundle. */
export function stageRasterBundle(directory:string):Promise<{bundle:string;manifest:RasterManifest}>;
export function stageRasterBundle<M extends {assets:StoredAsset[]}>(directory:string,parse:(value:unknown)=>M):Promise<{bundle:string;manifest:M}>;
export async function stageRasterBundle(directory:string,parse:(value:unknown)=>{assets:StoredAsset[]}=value=>rasterManifestSchema.parse(value)){
  const text=await readFile(path.join(directory,"manifest.json"),"utf8"),manifest=parse(JSON.parse(text)),bundle=createHash("sha256").update(text).digest("hex"),categorical="semantics" in manifest&&manifest.semantics==="categorical",anchors=new Map<string,string>();
  for(const asset of manifest.assets){
    const source=path.resolve(directory,asset.key);if(!source.startsWith(path.resolve(directory)+path.sep)||await fileDigest(source)!==asset.sha256||(await stat(source)).size!==asset.bytes)throw new Error("A prepared raster asset does not match the frozen manifest.");
    const target=bundlePath(bundle,asset.key);await mkdir(path.dirname(target),{recursive:true});let anchor=categorical?anchors.get(asset.sha256):undefined;
    // Links stay inside this private bundle, never to the preparation directory.
    // A conservative 512-link group also supports Windows' per-file link limit.
    if(anchor&&(await stat(anchor)).nlink>=512)anchor=undefined;
    try{if(anchor)await link(anchor,target);else await copyFile(source,target,1);}catch(e){if((e as NodeJS.ErrnoException).code!=="EEXIST")throw e;}
    if((await stat(target)).size!==asset.bytes||await fileDigest(target)!==asset.sha256)throw new Error("A retained asset differs from the frozen source.");
    if(categorical&&!anchor)anchors.set(asset.sha256,target);
  }
  const target=bundlePath(bundle,"manifest.json");await mkdir(path.dirname(target),{recursive:true});try{await copyFile(path.join(directory,"manifest.json"),target,1);}catch(e){if((e as NodeJS.ErrnoException).code!=="EEXIST")throw e;}if(await fileDigest(target)!==bundle)throw new Error("The retained raster manifest differs.");return {bundle,manifest};
}
export function originalAsset(manifest:RasterManifest){return manifest.assets.find(a=>a.kind==="source")!;}
