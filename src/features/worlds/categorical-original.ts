import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
import type {CategoricalGrid,CategoricalTileSource} from "./categorical-raster";

/** Bounded decoded source cache, shared by preparation and native class reads.
 * Missing source tiles are explicitly NoData, never inferred ocean/vegetation. */
export function categoricalOriginal(grid:CategoricalGrid,tiles:CategoricalTileSource[],load:(key:string)=>Promise<Uint8Array>,capacity=120){
  const sources=new Map(tiles.map(t=>[`${t.x}:${t.y}`,t])),cache=new Map<string,Uint8Array>();
  return {
    async read(x:number,y:number,width:number,height:number){
      assert.ok(Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&width>0&&height>0&&width*height<=16_777_216&&x+width<=grid.width&&y+height<=grid.height);
      const result=new Uint8Array(width*height).fill(grid.noData),size=grid.sourceTileSize;
      for(let ty=Math.floor(y/size);ty<=Math.floor((y+height-1)/size);ty++)for(let tx=Math.floor(x/size);tx<=Math.floor((x+width-1)/size);tx++){
        const key=`${tx}:${ty}`,source=sources.get(key);if(!source)continue;
        let values=cache.get(key);if(values){cache.delete(key);cache.set(key,values);}else{const bytes=await load(source.key);values=new Uint8Array(gunzipSync(bytes,{maxOutputLength:source.width*source.height}));assert.equal(values.length,source.width*source.height);assert.equal(createHash("sha256").update(values).digest("hex"),source.valuesSha256,"Original classification values failed integrity validation");cache.set(key,values);if(cache.size>capacity)cache.delete(cache.keys().next().value!);}
        const startX=Math.max(x,tx*size),endX=Math.min(x+width,tx*size+source.width),startY=Math.max(y,ty*size),endY=Math.min(y+height,ty*size+source.height);
        for(let row=startY;row<endY;row++)result.set(values.subarray((row-ty*size)*source.width+startX-tx*size,(row-ty*size)*source.width+endX-tx*size),(row-y)*width+startX-x);
      }
      return result;
    },
    clear(){cache.clear();},
  };
}
