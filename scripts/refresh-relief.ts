/** Rebuild only derived presentation from retained original/derived numbers. */
import {mkdir,readFile,writeFile,stat} from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {numericalReader} from "../src/features/worlds/raster-numerical";
import {rasterManifestSchema} from "../src/features/worlds/raster";
import {reliefPixels} from "../src/features/worlds/raster-relief";
import {checksum} from "./prepare-elevation";
async function main(){
const directory=process.argv[2],m=rasterManifestSchema.parse(JSON.parse(await readFile(path.join(directory,"manifest.json"),"utf8"))),original=m.assets.find(a=>a.kind==="source")!,start=performance.now();
for(const level of m.levels){const file=level.factor===1?path.join(directory,original.key):path.join(directory,`working/${level.factor}.f32`),r=await numericalReader(file,level.factor===1?m.grid:{...m.grid,width:level.width,height:level.height,encoding:"float32-le"});try{for(let y=0;y<Math.ceil(level.height/256);y++){const h=Math.min(256,level.height-y*256),a=Math.max(0,y*256-1),b=Math.min(level.height,y*256+h+1),values=await r.read(0,a,level.width,b-a);for(let x=0;x<Math.ceil(level.width/256);x++){const w=Math.min(256,level.width-x*256),pixels=reliefPixels(w,h,{grid:m.grid,level,x,y,values,stride:level.width,startX:x*256,startY:y*256-a}),key=`shaded/${level.factor}/${x}-${y}.webp`,target=path.join(directory,key);await mkdir(path.dirname(target),{recursive:true});await sharp(pixels.shaded,{raw:{width:w,height:h,channels:4}}).webp({lossless:true}).toFile(target);const asset=m.assets.find(v=>v.key===key)!;asset.sha256=await checksum(target);asset.bytes=(await stat(target)).size;}}console.log(`Refreshed northwest and periodic relief ${level.factor}`);}finally{await r.close();}}
const bytes=m.assets.reduce((n,a)=>n+a.bytes,0);if(bytes>1073741824)throw Error("Refreshed imagery exceeds the 1 GiB budget; do not persist.");await writeFile(path.join(directory,"manifest.json"),JSON.stringify(m,null,2)+"\n");await writeFile(path.join(directory,"relief-refresh.json"),JSON.stringify({bytes,ms:performance.now()-start,peakRssBytes:process.resourceUsage().maxRSS*1024,northwestIllumination:true,periodicLongitudeHalo:true},null,2));

}
main().catch(e=>{console.error(e);process.exitCode=1;});
