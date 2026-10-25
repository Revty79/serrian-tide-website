import type {TerrainGeometry} from "./terrain";
import {importInterpretationSchema,type ImportInterpretation} from "./terrain-source";

export const PNG_LIMITS={bytes:16*1024*1024,dimension:4096,pixels:4*1024*1024} as const;
export type NumericalPng={width:number;height:number;bitDepth:8|16;values:Uint16Array;transparent:number|null;sha256:string};
const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
export function pngCrc(bytes:Uint8Array){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
const fail=(message:string):never=>{throw new Error(message);};
const paeth=(a:number,b:number,c:number)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};

/** Decode raw PNG samples; Canvas/Image conversions would reduce 16-bit precision. */
export async function decodeNumericalPng(buffer:ArrayBuffer):Promise<NumericalPng>{
 const bytes=new Uint8Array(buffer),view=new DataView(buffer);
 if(bytes.length>PNG_LIMITS.bytes)fail("Choose a PNG no larger than 16 MiB.");
 if(bytes.length<33||[137,80,78,71,13,10,26,10].some((v,i)=>bytes[i]!==v))fail("This file is not a valid PNG heightmap.");
 let offset=8,width=0,height=0,bitDepth:8|16=8,transparent:number|null=null,ended=false,idatStarted=false,idatFinished=false,total=0;
 const chunks:Uint8Array[]=[];
 while(offset<bytes.length){
  if(offset+12>bytes.length)fail("The PNG ends inside a chunk.");const length=view.getUint32(offset),start=offset+4,data=offset+8,end=data+length;
  if(end+4>bytes.length)fail("A PNG chunk exceeds the file bounds.");const type=String.fromCharCode(...bytes.subarray(start,data));
  if(!/^[A-Za-z]{4}$/.test(type)||pngCrc(bytes.subarray(start,end))!==view.getUint32(end))fail("The PNG contains a damaged chunk or checksum.");
  if(!width&&type!=="IHDR")fail("PNG dimensions must be the first chunk.");
  if(type==="IHDR"){
   if(width||length!==13)fail("The PNG has invalid or repeated dimensions.");width=view.getUint32(data);height=view.getUint32(data+4);const depth=bytes[data+8],color=bytes[data+9];
   if(!width||!height||width>PNG_LIMITS.dimension||height>PNG_LIMITS.dimension||width*height>PNG_LIMITS.pixels)fail("Use dimensions up to 4096 per side and at most 4,194,304 source pixels. Crop or resize the source in an elevation-aware tool first.");
   if(color!==0||(depth!==8&&depth!==16))fail("Use an 8-bit or 16-bit grayscale PNG. RGB, palette and alpha images are not interpreted as elevation.");
   if(bytes[data+10]!==0||bytes[data+11]!==0||bytes[data+12]!==0)fail("This PNG uses unsupported compression, filtering or interlacing. Export a non-interlaced grayscale PNG.");bitDepth=depth;
  }else if(type==="IDAT"){
   if(idatFinished)fail("PNG image-data chunks must be consecutive.");idatStarted=true;total+=length;chunks.push(bytes.subarray(data,end));
  }else{
   if(idatStarted)idatFinished=true;
   if(type==="IEND"){if(length||!idatStarted||end+4!==bytes.length)fail("The PNG has an invalid end marker or trailing data.");ended=true;offset=end+4;break;}
   if(type==="tRNS"){if(idatStarted||transparent!==null||length!==2)fail("The PNG has invalid transparency metadata.");transparent=view.getUint16(data);if(transparent>(bitDepth===8?255:65535))fail("The transparent height is outside the sample range.");}
   else if(type==="acTL"||type==="fcTL"||type==="fdAT")fail("Animated PNG files are not numerical heightmaps.");
   else if(type[0]===type[0].toUpperCase())fail(`Unsupported critical PNG chunk: ${type}.`);
  }
  offset=end+4;
 }
 if(!ended||!total)fail("The PNG is missing its complete image data.");
 const compressed=new Uint8Array(total);let at=0;for(const chunk of chunks){compressed.set(chunk,at);at+=chunk.length;}
 const bpp=bitDepth/8,rowBytes=width*bpp,expected=(rowBytes+1)*height,raw=new Uint8Array(expected);
 if(typeof DecompressionStream==="undefined")fail("This browser cannot decode numerical PNG compression. Use a current browser with DecompressionStream support.");
 const reader=new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate")).getReader();let decoded=0;
 try{while(true){const item=await reader.read();if(item.done)break;if(decoded+item.value.length>expected){await reader.cancel();fail("PNG decompression exceeds its declared dimensions.");}raw.set(item.value,decoded);decoded+=item.value.length;}}catch(error){if(error instanceof Error&&error.message.startsWith("PNG"))throw error;fail("The compressed PNG data is damaged or unsupported.");}finally{reader.releaseLock();}
 if(decoded!==expected)fail("PNG decompression did not produce the declared number of height samples.");
 const values=new Uint16Array(width*height),previous=new Uint8Array(rowBytes),current=new Uint8Array(rowBytes);
 for(let y=0;y<height;y++){
  const row=y*(rowBytes+1),filter=raw[row];if(filter>4)fail("The PNG uses an invalid row filter.");
  for(let x=0;x<rowBytes;x++){const a=x>=bpp?current[x-bpp]:0,b=previous[x],c=x>=bpp?previous[x-bpp]:0;current[x]=(raw[row+1+x]+(filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c)))&255;}
  for(let x=0;x<width;x++)values[y*width+x]=bitDepth===16?(current[x*2]<<8)|current[x*2+1]:current[x];previous.set(current);
 }
 const digest=await crypto.subtle.digest("SHA-256",buffer),sha256=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
 return {width,height,bitDepth,values,transparent,sha256};
}

export function interpretHeightmap(png:NumericalPng,shape:TerrainGeometry,input:ImportInterpretation){
 const settings=importInterpretationSchema.parse(input);if(settings.low<shape.min||settings.high>shape.max||settings.fillElevation<shape.min||settings.fillElevation>shape.max)fail("The import heights and NoData fill must fit within this map's elevation limits. Adjust the interpretation or the limits; no heights were clamped.");
 const missing=new Set([settings.noData,png.transparent].filter((v):v is number=>v!==null));let sourceNoData=0;for(const v of png.values)if(missing.has(v))sourceNoData++;
 if(sourceNoData&&settings.noDataMode==="reject")fail(`${sourceNoData.toLocaleString()} source samples are NoData. Choose an explicit fill elevation before preparing a preview.`);
 const width=png.width,height=png.height,sourceRatio=width/height,targetRatio=shape.displayWidth/shape.displayHeight;
 let cropWidth=width,cropHeight=height;if(settings.crop==="crop"){if(sourceRatio>targetRatio)cropWidth=height*targetRatio;else cropHeight=width/targetRatio;}
 const left=(width-cropWidth)/2,top=(height-cropHeight)/2,maximum=png.bitDepth===16?65535:255,scale=(settings.high-settings.low)/maximum;
 const value=(x:number,y:number)=>{const raw=png.values[Math.max(0,Math.min(height-1,y))*width+Math.max(0,Math.min(width-1,x))];return missing.has(raw)?settings.fillElevation:settings.low+raw*scale;};
 const grid=new Int16Array(shape.width*shape.height);let min=Infinity,max=-Infinity;
 for(let y=0;y<shape.height;y++)for(let x=0;x<shape.width;x++){
  const px=left+(x+.5)/shape.width*cropWidth-.5,py=top+(y+.5)/shape.height*cropHeight-.5;
  let z:number;if(settings.resampling==="nearest")z=value(Math.round(px),Math.round(py));else{const ix=Math.floor(px),iy=Math.floor(py),a=px-ix,b=py-iy;z=(value(ix,iy)*(1-a)+value(ix+1,iy)*a)*(1-b)+(value(ix,iy+1)*(1-a)+value(ix+1,iy+1)*a)*b;}
  grid[y*shape.width+x]=Math.round(z);min=Math.min(min,grid[y*shape.width+x]);max=Math.max(max,grid[y*shape.width+x]);
 }
 return {grid,sourceNoData,min,max,crop:{left,top,width:cropWidth,height:cropHeight},sourceStepMetres:scale,roundingLimitMetres:.5,aspectChanged:Math.abs(sourceRatio-targetRatio)>.001&&settings.crop==="fit"};
}
