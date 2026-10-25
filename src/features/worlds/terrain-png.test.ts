import assert from "node:assert/strict";
import test from "node:test";
import {deflateSync} from "node:zlib";
import {decodeNumericalPng,interpretHeightmap,pngCrc} from "./terrain-png";
import {terrainGeometry,terrainSettingsSchema} from "./terrain";
const signature=Buffer.from([137,80,78,71,13,10,26,10]);
function chunk(type:string,data:Uint8Array){const output=Buffer.alloc(data.length+12);output.writeUInt32BE(data.length);output.write(type,4);output.set(data,8);output.writeUInt32BE(pngCrc(output.subarray(4,-4)),output.length-4);return output;}
export function numericalPng(width:number,height:number,depth:8|16,values:number[],filter=0){const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=depth;const bpp=depth/8,rowBytes=width*bpp,raw=Buffer.alloc((rowBytes+1)*height),original=Buffer.alloc(rowBytes*height);values.forEach((v,i)=>depth===16?original.writeUInt16BE(v,i*2):original.writeUInt8(v,i));for(let y=0;y<height;y++){raw[y*(rowBytes+1)]=filter;for(let x=0;x<rowBytes;x++){const i=y*rowBytes+x,a=x>=bpp?original[i-bpp]:0,b=y?original[i-rowBytes]:0,c=y&&x>=bpp?original[i-rowBytes-bpp]:0,p=a+b-c;const prediction=filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):Math.abs(p-a)<=Math.abs(p-b)&&Math.abs(p-a)<=Math.abs(p-c)?a:Math.abs(p-b)<=Math.abs(p-c)?b:c;raw[y*(rowBytes+1)+1+x]=(original[i]-prediction)&255;}}return Buffer.concat([signature,chunk("IHDR",header),chunk("IDAT",deflateSync(raw)),chunk("IEND",Buffer.alloc(0))]);}
const arrayBuffer=(bytes:Buffer)=>Uint8Array.from(bytes).buffer;
test("PNG CRC matches its published check vector and all five filters retain every 16-bit sample",async()=>{
 assert.equal(pngCrc(Buffer.from("123456789")),0xcbf43926);const values=[0,1,255,256,257,32767,32768,65535];for(let filter=0;filter<5;filter++){const png=await decodeNumericalPng(arrayBuffer(numericalPng(4,2,16,values,filter)));assert.equal(png.bitDepth,16);assert.deepEqual([...png.values],values);assert.equal(png.sha256.length,64);}
});
test("ordinary 8-bit samples are decoded without pretending to gain 16-bit precision",async()=>{const png=await decodeNumericalPng(arrayBuffer(numericalPng(2,2,8,[0,1,254,255])));assert.equal(png.bitDepth,8);assert.deepEqual([...png.values],[0,1,254,255]);});
test("damaged, oversized, non-grayscale and excessively inflated imports are rejected",async()=>{
 const valid=numericalPng(2,2,16,[0,1,2,3]),damaged=Buffer.from(valid);damaged[damaged.length-5]^=1;await assert.rejects(decodeNumericalPng(arrayBuffer(damaged)),/checksum/);await assert.rejects(decodeNumericalPng(arrayBuffer(Buffer.from("picture"))),/valid PNG/);
 for(const [width,height,color] of [[4097,1,0],[4096,4096,0],[2,2,2]]){const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=16;header[9]=color;await assert.rejects(decodeNumericalPng(arrayBuffer(Buffer.concat([signature,chunk("IHDR",header),chunk("IDAT",deflateSync(Buffer.alloc(50))),chunk("IEND",Buffer.alloc(0))]))));}
 const header=Buffer.alloc(13);header.writeUInt32BE(1);header.writeUInt32BE(1,4);header[8]=16;await assert.rejects(decodeNumericalPng(arrayBuffer(Buffer.concat([signature,chunk("IHDR",header),chunk("IDAT",deflateSync(Buffer.alloc(100000))),chunk("IEND",Buffer.alloc(0))]))),/exceeds/);
});
test("import interpretation has explicit cropping, resampling, missing values and no silent elevation clamp",async()=>{
 const png=await decodeNumericalPng(arrayBuffer(numericalPng(4,2,16,[0,10000,20000,30000,40000,50000,60000,65535]))),shape=terrainGeometry(terrainSettingsSchema.parse({gridWidth:32,gridHeight:32,widthKm:100,heightKm:100})),settings={low:-1000,high:4000,crop:"fit" as const,resampling:"nearest" as const,noData:null,noDataMode:"reject" as const,fillElevation:0};
 const fit=interpretHeightmap(png,shape,settings);assert.equal(fit.grid[0],-1000);assert.equal(fit.grid.at(-1),4000);assert.equal(fit.aspectChanged,true);assert.equal(fit.roundingLimitMetres,.5);assert.equal(interpretHeightmap(png,shape,{...settings,crop:"crop"}).crop.width,2);assert.throws(()=>interpretHeightmap(png,shape,{...settings,high:30000}),/no heights were clamped/);assert.throws(()=>interpretHeightmap(png,shape,{...settings,noData:0}),/NoData/);assert.equal(interpretHeightmap(png,shape,{...settings,noData:0,noDataMode:"fill",fillElevation:-500}).grid[0],-500);
});
