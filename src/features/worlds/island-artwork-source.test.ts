import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {islandAssets} from "./island-assets";
import {createIslandArtworkStore,readIslandArtwork,artworkUrl} from "./island-artwork-source";

test("shipped metadata has no vector bodies; exact originals validate independently of newline conversion",async()=>{
 for(const asset of islandAssets){
  assert.ok(!("svg" in asset));
  const original=await readFile(`public${artworkUrl(asset)}`,"utf8");
  const body=await readIslandArtwork(asset,async(input,options)=>{
   assert.equal(input,artworkUrl(asset));assert.equal(options?.mode,"same-origin");assert.equal(options?.redirect,"error");
   return new Response(original.replace(/\r?\n/g,"\r\n"));
  });
  assert.equal(body,original.replaceAll("\r\n","\n").replace(/^<svg[^>]+>/,"").replace(/<\/svg>\s*$/,""));
 }
});

test("unavailable, oversized and wrong-checksum files reject rather than substituting artwork",async()=>{
 const asset=islandAssets[0];
 for(const response of [new Response("missing",{status:404}),new Response("altered SVG"),new Response("large",{headers:{"content-length":String(1024*1024+1)}}),new Response("x".repeat(1024*1024+1))])await assert.rejects(readIslandArtwork(asset,async()=>response));
});

test("source loads are deduplicated, unused assets stay idle and failures wait for explicit retry",async()=>{
 const calls:string[]=[];let fail=true,notify=0;
 const store=createIslandArtworkStore(async asset=>{calls.push(asset.id);await Promise.resolve();if(fail)throw new Error("Offline");return "exact original body";});
 const unsubscribe=store.subscribe(()=>{notify++;});const first=store.ensure(islandAssets[0]),duplicate=store.ensure(islandAssets[0]);assert.equal(first,duplicate);
 await assert.rejects(first,/Offline/);assert.equal(store.read(islandAssets[0]).state,"error");assert.equal(store.read(islandAssets[1]).state,"idle");
 await assert.rejects(store.ensure(islandAssets[0]),/Offline/);assert.equal(calls.length,1);
 fail=false;await store.ensure(islandAssets[0],true);assert.equal(store.read(islandAssets[0]).svg,"exact original body");assert.equal(calls.length,2);
 await store.ensure(islandAssets[0]);assert.equal(calls.length,2);assert.ok(notify>=4);unsubscribe();
});
