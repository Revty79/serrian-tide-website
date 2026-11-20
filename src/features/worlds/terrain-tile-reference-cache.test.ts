import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {createTerrainTileReferenceCache} from "./terrain-tile-reference-cache";

describe("request-local native tile reference blocks",()=>{
 it("coalesces concurrent neighbours, keeps misses and binds source plus revision",async()=>{
  const calls:string[]=[],read=createTerrainTileReferenceCache(async(id,revision,x,y,size)=>{calls.push(`${id}:${revision}:${x}:${y}:${size}`);await Promise.resolve();return [{x:x+1,y:y+2,sha:`${id}/${revision}`}];});
  const a=await Promise.all([read("a",4,1,2),read("a",4,2,2),read("a",4,7,7)]);
  assert.deepEqual(a,[{x:1,y:2,sha:"a/4"},null,null]);assert.equal(calls.length,1);
  assert.equal(await read("a",4,2,2),null);assert.equal(calls.length,1);
  assert.equal((await read("a",3,1,2))?.sha,"a/3");assert.equal((await read("b",4,1,2))?.sha,"b/4");assert.equal(calls.length,3);
 });
 it("retries a failed read without publishing an incomplete block",async()=>{
  let calls=0;const read=createTerrainTileReferenceCache(async()=>{if(++calls===1)throw Error("unavailable");return [{x:0,y:0}];});
  await assert.rejects(read("a",1,0,0),/unavailable/);assert.deepEqual(await read("a",1,0,0),{x:0,y:0});assert.equal(calls,2);
 });
 it("bounds retained metadata, including missing tiles",async()=>{
  let calls=0;const read=createTerrainTileReferenceCache(async(_id,_r,x,y)=>{calls++;return [{x,y}];});
  for(let x=0;x<17*8;x+=8)await read("a",1,x,0);
  assert.equal(calls,17);await read("a",1,0,0);assert.equal(calls,18);
 });
 it("refuses out-of-block or duplicate query results before retaining them",async()=>{
  const outside=createTerrainTileReferenceCache(async()=>[{x:8,y:0}]);await assert.rejects(outside("a",1,0,0),/invalid/);
  const duplicate=createTerrainTileReferenceCache(async()=>[{x:0,y:0},{x:0,y:0}]);await assert.rejects(duplicate("a",1,0,0),/repeats/);
 });
});
