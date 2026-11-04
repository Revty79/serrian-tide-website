import "server-only";
import {createHash,randomUUID} from "node:crypto";
import {mkdir,open,readFile,realpath,lstat,unlink} from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {publishRasterFile} from "./raster-storage";
import {ASSET_LIMITS,type AssetObject} from "./atlas-assets";
import {WorldError} from "./world-service";

export const assetStorageRoot=()=>{const root=path.resolve(/* turbopackIgnore: true */ process.env.SERRIAN_ASSET_ROOT?.trim()||"storage/atlas-assets"),publicRoot=path.resolve("public"),key=(p:string)=>process.platform==="win32"?p.toLowerCase():p;if(key(root)===key(publicRoot)||key(root).startsWith(key(publicRoot)+path.sep))throw new WorldError("Private artwork storage must be outside the public website folder.",503);return root;};
export const assetDigest=(b:Uint8Array)=>createHash("sha256").update(b).digest("hex");
export function assetObjectPath(root:string,hash:string){if(!/^[a-f0-9]{64}$/.test(hash))throw Error("Invalid private artwork checksum.");return path.join(root,"objects",hash.slice(0,2),hash);}
async function privateAnchor(root:string){const anchor=await realpath(root),publicRoot=await realpath(path.resolve("public")).catch(()=>path.resolve("public")),key=(p:string)=>process.platform==="win32"?p.toLowerCase():p;if(key(anchor)===key(publicRoot)||key(anchor).startsWith(key(publicRoot)+path.sep))throw new WorldError("Private artwork storage cannot point into the public website folder.",503);return anchor;}
let decoding=false;
/** One bounded decoder per process; other processes are additionally serialized by the owner's DB row. */
export async function decodeAsset(bytes:Buffer,mime:string,filename:string){
 if(bytes.length<12||bytes.length>ASSET_LIMITS.fileBytes)throw new WorldError("Choose an image up to 8 MiB.",413);
 if(!filename||filename.length>180||/[\\/\x00-\x1f]/.test(filename))throw new WorldError("Use an ordinary image filename without folders.",400);
 const format=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?"png":bytes[0]===255&&bytes[1]===216&&bytes[2]===255?"jpeg":bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP"?"webp":undefined;
 if(!format||mime!==`image/${format}`||!(format==="jpeg"?/\.jpe?g$/i:new RegExp(`\\.${format}$`,"i")).test(filename))throw new WorldError("Choose a real PNG, JPEG or WebP image with its matching filename and format.",400);
 // Explicitly reject animation containers even when a decoder exposes only their first frame.
 if(format==="png"){for(let offset=8;offset+12<=bytes.length;){const length=bytes.readUInt32BE(offset);if(length>bytes.length-offset-12)throw new WorldError("This PNG is incomplete or malformed.",400);const type=bytes.toString("ascii",offset+4,offset+8);if(type==="acTL")throw new WorldError("Choose a still image instead of an animated PNG.",400);offset+=length+12;if(type==="IEND")break;}}
 if(format==="webp"){for(let offset=12;offset+8<=bytes.length;){const length=bytes.readUInt32LE(offset+4);if(length>bytes.length-offset-8)throw new WorldError("This WebP is incomplete or malformed.",400);const type=bytes.toString("ascii",offset,offset+4);if(type==="ANIM"||type==="ANMF")throw new WorldError("Choose a still image instead of an animated WebP.",400);offset+=length+8+(length%2);}}
 if(decoding)throw new WorldError("Another image is being prepared. Your import is retained; retry shortly.",429);
 decoding=true;
 try{
  const options={limitInputPixels:ASSET_LIMITS.pixels,limitInputChannels:4,unlimited:false,failOn:"warning" as const,sequentialRead:true},meta=await sharp(bytes,options).metadata();
  if(meta.format!==format||!meta.width||!meta.height||meta.width>ASSET_LIMITS.edge||meta.height>ASSET_LIMITS.edge||meta.width*meta.height>ASSET_LIMITS.pixels||(meta.pages??1)!==1)throw Error("Image dimensions or animation are unsupported.");
  const objects:{type:AssetObject["type"];data:Buffer}[]=[{type:"original",data:bytes}];
  // Full decode and re-encoding validate compressed pixels and strip metadata. Only these inert WebPs are served inline.
  for(const edge of [1536,768,128] as const){const data=await sharp(bytes,options).rotate().resize(edge,edge,{fit:"inside",withoutEnlargement:true}).webp({quality:88,effort:2}).timeout({seconds:8}).toBuffer();objects.push({type:String(edge) as AssetObject["type"],data});}
  const rotated=(meta.orientation??1)>=5;return {format,width:rotated?meta.height:meta.width,height:rotated?meta.width:meta.height,bytes:bytes.length,objects};
 }catch(error){if(error instanceof WorldError)throw error;throw new WorldError("This image could not be safely opened. Use a still PNG, JPEG or WebP, at most 8,192 pixels per side and 16 million pixels in total.",400);}finally{decoding=false;}
}
export async function stageAssetObjects(objects:{type:AssetObject["type"];data:Buffer}[]){
 const root=assetStorageRoot();await mkdir(root,{recursive:true});const anchor=await privateAnchor(root),result:AssetObject[]=[];
 for(const {type,data}of objects){const sha256=assetDigest(data),target=assetObjectPath(root,sha256),directory=path.dirname(target);await mkdir(directory,{recursive:true});if(!(await realpath(directory)).startsWith(anchor+path.sep))throw Error("Private artwork storage cannot traverse a link.");
  const temporary=path.join(directory,`${randomUUID()}.partial`);const file=await open(temporary,"wx");try{await file.writeFile(data);await file.sync();}finally{await file.close();}try{await publishRasterFile(temporary,target,sha256,data.length);}finally{await unlink(temporary);}result.push({type,sha256,bytes:data.length});
 }return result;
}
export async function readAssetObject(object:AssetObject){
 const root=await privateAnchor(assetStorageRoot()),candidate=assetObjectPath(root,object.sha256),file=await realpath(/* turbopackIgnore: true */ candidate),s=await lstat(candidate);
 if(!file.startsWith(root+path.sep)||s.isSymbolicLink()||!s.isFile()||s.size!==object.bytes)throw new WorldError("The private image is unavailable. Restore its paired artwork backup.",503);
 const data=await readFile(file);if(data.length!==object.bytes||assetDigest(data)!==object.sha256)throw new WorldError("The private image failed its integrity check. Restore its paired artwork backup.",503);return data;
}
