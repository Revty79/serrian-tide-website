import assert from "node:assert/strict";
import {test} from "node:test";
import {nativeTransportPacket,assertNativeTransportRetry,nativeTransportPacketSchema} from "./native-map-history-transport";
const worldId="10101010-1010-4010-8010-101010101010",timelineId="20202020-2020-4020-8020-202020202020",stateId="30303030-3030-4030-8030-303030303030",requestId="40404040-4040-4040-8040-404040404040";
const scope={timelineId,stateId,target:{kind:"terrain" as const,id:worldId},year:550,edit:true},endpoint=`/api/worlds/${worldId}/terrain`,body={requestId,action:"save",revision:2,tiles:[{x:0,y:0,samples:[1,2,3]}]};
test("a recovered command keeps its original year when mounted in an earlier part of the same appearance",()=>{
  const packet=nativeTransportPacket(worldId,endpoint,scope,body);
  assert.equal(assertNativeTransportRetry(packet,worldId,endpoint,{...scope,year:500},{tiles:body.tiles,revision:2,action:"save",requestId}).year,550);
});
test("an original packet cannot retarget another state, timeline, endpoint, World or edited command",()=>{
  const packet=nativeTransportPacket(worldId,endpoint,scope,body);
  for(const [w,e,s,b] of [[timelineId,endpoint,scope,body],[worldId,endpoint+"/refinements",scope,body],[worldId,endpoint,{...scope,stateId:requestId},body],[worldId,endpoint,{...scope,timelineId:requestId},body],[worldId,endpoint,scope,{...body,revision:3}]] as const)assert.throws(()=>assertNativeTransportRetry(packet,w,e,s,b),/different/);
});
test("exported transport bytes, identity and origin binding are checked together",()=>{
  const packet=nativeTransportPacket(worldId,endpoint,scope,body);
  for(const changed of [{...packet,endpoint:"https://evil.invalid"+endpoint},{...packet,bytes:1},{...packet,requestId:stateId},{...packet,scope:{...scope,edit:false}}])assert.equal(nativeTransportPacketSchema.safeParse(changed).success,false);
});
test("original transport cannot turn an immutable reference or read-only view into a write",()=>{
  const packet=nativeTransportPacket(worldId,endpoint,scope,body);
  assert.throws(()=>assertNativeTransportRetry(packet,worldId,endpoint,{...scope,edit:false},body),/read-only/);
  assert.throws(()=>assertNativeTransportRetry(packet,worldId,endpoint,{...scope,edit:false,versionId:stateId},body),/read-only/);
});
