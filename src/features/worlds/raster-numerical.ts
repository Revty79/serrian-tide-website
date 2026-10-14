import assert from "node:assert/strict";
import {open} from "node:fs/promises";
import {fromFile,type GeoTIFFImage} from "geotiff";
import type {RasterGrid} from "./raster";

export async function numericalReader(file:string,grid:RasterGrid){
  if(grid.encoding==="geotiff"){const tiff=await fromFile(file),image=await tiff.getImage();assert.equal(image.getWidth(),grid.width);assert.equal(image.getHeight(),grid.height);assert.deepEqual(image.getBoundingBox(),grid.bounds);assert.equal(image.getGDALNoData(),grid.noData);assert.equal(image.getSamplesPerPixel(),1);const keys=image.getGeoKeys(),bits=image.getFileDirectory().getValue("BitsPerSample"),format=image.getFileDirectory().getValue("SampleFormat");assert.ok(keys&&bits&&format);assert.equal(bits[0],32);assert.equal(format[0],3);assert.equal(keys.GTRasterTypeGeoKey,1);if(/^EPSG:\d+$/.test(grid.horizontalReference))assert.equal(keys.GeographicTypeGeoKey??keys.ProjectedCSTypeGeoKey,Number(grid.horizontalReference.slice(5)));return {read:async(x:number,y:number,w:number,h:number)=>new Float32Array(await image.readRasters({window:[x,y,x+w,y+h],samples:[0],interleave:true}) as Float32Array),close:()=>tiff.close(),image};}
  const handle=await open(file,"r");assert.equal((await handle.stat()).size,grid.width*grid.height*4);return {read:async(x:number,y:number,w:number,h:number)=>{const result=new Float32Array(w*h),row=Buffer.alloc(w*4);for(let i=0;i<h;i++){const {bytesRead}=await handle.read(row,0,row.length,((y+i)*grid.width+x)*4);assert.equal(bytesRead,row.length);for(let j=0;j<w;j++)result[i*w+j]=row.readFloatLE(j*4);}return result;},close:()=>handle.close(),image:undefined as GeoTIFFImage|undefined};
}
