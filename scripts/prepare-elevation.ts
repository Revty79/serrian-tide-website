/** CPU-only, bounded numerical preprocessing; no database connection. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile,mkdir,open,readFile,stat,writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import {numericalReader} from "../src/features/worlds/raster-numerical";
import {reliefPixels} from "../src/features/worlds/raster-relief";
import sharp from "sharp";
import { rasterManifestSchema,type RasterManifest,type RasterAsset } from "../src/features/worlds/raster";

export async function checksum(file:string){const hash=createHash("sha256");for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest("hex");}
export async function prepareElevation(input:string,metadata:Omit<RasterManifest,"version"|"algorithm"|"levels"|"assets"|"statistics">,directory:string){
  await mkdir(directory,{recursive:true});await mkdir(path.join(directory,"working"),{recursive:true});const grid=metadata.grid,factors=[1,2,4,8,20,40,80];while(Math.ceil(grid.width/factors.at(-1)!/256)*Math.ceil(grid.height/factors.at(-1)!/256)>16)factors.push(factors.at(-1)!*2);
  const levels=factors.filter((f,i)=>!i||f<Math.max(grid.width,grid.height)).map(f=>({factor:f,width:Math.ceil(grid.width/f),height:Math.ceil(grid.height/f),method:f===1?"original" as const:"box-mean-nodata-propagated" as const})),assets:RasterAsset[]=[],sourceKey=`source/original.${grid.encoding==="geotiff"?"tif":"f32"}`;
  assert.equal(await checksum(input),metadata.source.sha256);await mkdir(path.join(directory,"source"),{recursive:true});await copyFile(input,path.join(directory,sourceKey));assets.push({key:sourceKey,kind:"source",sha256:metadata.source.sha256,bytes:(await stat(input)).size});
  const reader=await numericalReader(input,grid),states=await Promise.all(levels.slice(1).map(async l=>({level:l,sums:new Float64Array(l.width),invalid:new Uint8Array(l.width),rows:0,handle:await open(path.join(directory,`working/${l.factor}.f32`),"w")})));
  const nativeHash=createHash("sha256");let minimum=Infinity,maximum=-Infinity,validCells=0,noDataCells=0;const started=performance.now();
  const emit=async(key:string,kind:RasterAsset["kind"],bytes:Buffer)=>{const file=path.join(directory,key);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,bytes);assets.push({key,kind,bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")});};
  const images=async(level:typeof levels[number],x:number,y:number,w:number,h:number,values:Float32Array,stride:number,startX:number,startY:number)=>{
    const {tint,shaded:shade}=reliefPixels(w,h,{grid,level,x,y,values,stride,startX,startY});
    await emit(`tint/${level.factor}/${x}-${y}.webp`,"tint",await sharp(tint,{raw:{width:w,height:h,channels:4}}).webp({lossless:true}).toBuffer());await emit(`shaded/${level.factor}/${x}-${y}.webp`,"shaded",await sharp(shade,{raw:{width:w,height:h,channels:4}}).webp({lossless:true}).toBuffer());
  };
  try{
    // At most 258 original rows, about 22 MiB for NOAA, plus bounded sums.
    // Every native value is read/hashed in original north-to-south row order.
    for(let top=0;top<grid.height;top+=256){const height=Math.min(256,grid.height-top),a=Math.max(0,top-1),b=Math.min(grid.height,top+height+1),slab=await reader.read(0,a,grid.width,b-a);
      for(let j=0;j<height;j++){const row=slab.subarray((top-a+j)*grid.width,(top-a+j+1)*grid.width),bytes=Buffer.alloc(row.length*4);for(let i=0;i<row.length;i++){const v=row[i];bytes.writeFloatLE(v,i*4);if(Number.isFinite(v)&&v!==grid.noData){minimum=Math.min(minimum,v);maximum=Math.max(maximum,v);validCells++;}else noDataCells++;}nativeHash.update(bytes);
        for(const state of states){const f=state.level.factor;for(let i=0;i<row.length;i++){const k=Math.floor(i/f),v=row[i];if(!Number.isFinite(v)||v===grid.noData)state.invalid[k]=1;else state.sums[k]+=v;}state.rows++;if(state.rows===f||top+j===grid.height-1){const result=Buffer.alloc(state.level.width*4);for(let i=0;i<state.level.width;i++)result.writeFloatLE(state.invalid[i]?NaN:state.sums[i]/(state.rows*Math.min(f,grid.width-i*f)),i*4);await state.handle.write(result);state.sums.fill(0);state.invalid.fill(0);state.rows=0;}}
      }
      for(let x=0;x<Math.ceil(grid.width/256);x++)await images(levels[0],x,top/256,Math.min(256,grid.width-x*256),height,slab,grid.width,x*256,top-a);
      if(top%2048===0)console.log(`Native rows ${top+height}/${grid.height}; RSS ${Math.round(process.memoryUsage().rss/1048576)} MiB`);
    }
  }finally{await reader.close();for(const state of states)await state.handle.close();}
  for(const level of levels.slice(1)){const source=path.join(directory,`working/${level.factor}.f32`),r=await numericalReader(source,{...grid,width:level.width,height:level.height,encoding:"float32-le"});try{for(let y=0;y<Math.ceil(level.height/256);y++)for(let x=0;x<Math.ceil(level.width/256);x++){const w=Math.min(256,level.width-x*256),h=Math.min(256,level.height-y*256),a=Math.max(0,x*256-1),b=Math.max(0,y*256-1),right=Math.min(level.width,x*256+w+1),bottom=Math.min(level.height,y*256+h+1),values=await r.read(a,b,right-a,bottom-b),native=Buffer.alloc(w*h*4);for(let j=0;j<h;j++)for(let i=0;i<w;i++)native.writeFloatLE(values[(j+y*256-b)*(right-a)+i+x*256-a],(j*w+i)*4);await emit(`numerical/${level.factor}/${x}-${y}.f32.gz`,"numerical",gzipSync(native));await images(level,x,y,w,h,values,right-a,x*256-a,y*256-b);}console.log(`Derived factor ${level.factor} complete`);}finally{await r.close();}}
  const manifest=rasterManifestSchema.parse({...metadata,version:1,algorithm:1,levels,assets,statistics:{validCells,noDataCells,minimum,maximum,nativeValuesSha256:nativeHash.digest("hex")}}),bytes=assets.reduce((n,a)=>n+a.bytes,0);assert.ok(bytes<=1_073_741_824,`Prepared assets exceed 1 GiB: ${bytes}; do not persist.`);await writeFile(path.join(directory,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");await writeFile(path.join(directory,"preparation.json"),JSON.stringify({bytes,files:assets.length,ms:performance.now()-started,peakRssBytes:process.resourceUsage().maxRSS*1024,statistics:manifest.statistics},null,2));return manifest;
}
async function main(){const metadata=JSON.parse(await readFile(process.argv[3],"utf8"));await prepareElevation(process.argv[2],metadata,process.argv[4]);}
if(process.argv[1]?.endsWith("prepare-elevation.ts"))main().catch(e=>{console.error(e);process.exitCode=1;});
