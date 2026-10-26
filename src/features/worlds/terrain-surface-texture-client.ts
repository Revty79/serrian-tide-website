import {SURFACE_TEXTURES,type TextureMip,type SurfaceTextureSet} from "./terrain-surface-textures";
let loaded:SurfaceTextureSet|undefined,promise:Promise<SurfaceTextureSet>|undefined;
export const cachedSurfaceTextures=()=>loaded;
async function decode(path:string,signal:AbortSignal):Promise<TextureMip[]>{
 const response=await fetch(path,{signal,cache:"force-cache"});if(!response.ok)throw new Error("A bundled surface texture is unavailable.");const blob=await response.blob(),image=await createImageBitmap(blob,{resizeWidth:512,resizeHeight:512,resizeQuality:"high"});
 try{const canvas=document.createElement("canvas");canvas.width=canvas.height=512;const context=canvas.getContext("2d",{willReadFrequently:true})!;context.drawImage(image,0,0,512,512);const levels:TextureMip[]=[];for(let size=512;size>=1;size/=2){if(size<512){const next=document.createElement("canvas");next.width=next.height=size;const c=next.getContext("2d",{willReadFrequently:true})!;c.imageSmoothingEnabled=true;c.imageSmoothingQuality="high";c.drawImage(canvas,0,0,size,size);canvas.width=canvas.height=size;context.drawImage(next,0,0);}levels.push({size,pixels:context.getImageData(0,0,size,size).data});await new Promise<void>(r=>setTimeout(r,0));}return levels;}finally{image.close();}
}
/** One lazily decoded, 512px mipmapped collection per document: <=16 MiB of
 * retained pixel data. Sequential decode bounds temporary bitmap memory. */
export function loadSurfaceTextures(){
 if(loaded)return Promise.resolve(loaded);if(promise)return promise;
 promise=(async()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);try{const materials=[];let bytes=0;for(const material of SURFACE_TEXTURES){const base="/worlds/terrain-materials/v1/"+material.id,diffuse=await decode(base+"-diffuse.jpg",controller.signal),normal=await decode(base+"-normal.jpg",controller.signal);for(const mip of [...diffuse,...normal])bytes+=mip.pixels.byteLength;materials.push({diffuse,normal});}if(bytes>16*1024*1024)throw new Error("Surface artwork exceeds its memory budget.");loaded={version:1,materials,bytes};return loaded;}finally{clearTimeout(timer);}})().catch(error=>{promise=undefined;throw error;});return promise;
}
