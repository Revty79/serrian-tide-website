import {artworkKey,islandArtworkImage,islandArtworkImageBounds} from "./island-artwork-source";
import type {IslandAsset} from "./island-assets";

type Bitmap={state:"ready";url:string;scale:number}|{state:"loading"|"error"};
const states=new Map<string,Bitmap>(),pending=new Map<string,Promise<void>>(),listeners=new Set<()=>void>();let version=0;
const publish=()=>{version++;for(const listener of listeners)listener();};
export const islandArtworkBitmaps={
 read:(asset:IslandAsset)=>states.get(artworkKey(asset)),
 version:()=>version,
 subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
 ensure(asset:IslandAsset):Promise<void>{
  const key=artworkKey(asset),running=pending.get(key);if(running)return running;if(states.has(key))return Promise.resolve();
  const source=islandArtworkImage(asset);if(!source||typeof document==="undefined")return Promise.resolve();states.set(key,{state:"loading"});
  const request=(async()=>{
   const image=new Image();try{
    await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error("Display cache unavailable"));image.src=source;});
    const [,,width,height]=islandArtworkImageBounds(asset),scale=Math.min(2,1024/Math.max(width,height)),canvas=document.createElement("canvas");canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil(height*scale);
    try{const context=canvas.getContext("2d");if(!context)throw Error("Display cache unavailable");context.drawImage(image,0,0,canvas.width,canvas.height);states.set(key,{state:"ready",url:canvas.toDataURL("image/png"),scale});}finally{canvas.width=0;canvas.height=0;}
   }catch{states.set(key,{state:"error"});}finally{image.src="";pending.delete(key);publish();}
  })();pending.set(key,request);return request;
 },
};

/** Reject undersampled display images at deep zoom; export always requests the original SVG. */
export function adequateIslandBitmap(bitmap:{scale:number},unitsPerPixel:number,maximumScale:number,deviceScale:number){return bitmap.scale*unitsPerPixel>=1.2*maximumScale*deviceScale;}
