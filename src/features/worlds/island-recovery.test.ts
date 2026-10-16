import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import {sameSpatialReference} from "./geographic";
import {geographicPresets} from "./geographic-generation";
import {defaultBrush} from "./cartography-controls";
import {defaultPresentation} from "./cartography";
import {assetReference,islandAssets} from "./island-assets";
import {decodeIslandRecovery,encodeIslandRecovery,ISLAND_RECOVERY_BYTES,islandRecoveryKey,rebaseRecoveredArtwork,type IslandRecoveryBundle} from "./island-recovery";

function bundle():IslandRecoveryBundle{
 const surfaceId=randomUUID();
 return {format:"serrian-atlas-island-recovery",version:1,createdAt:new Date().toISOString(),context:{userId:"owned-disposable-user",worldId:randomUUID(),mapId:randomUUID(),timelineId:randomUUID(),scope:"shared-baseline"},view:{surfaceId,bounds:[0,0,2000,1200],projection:"planar",themes:["land","authored"],labels:true},domains:{artwork:{baseRevision:7,draft:{name:"Recovered island",description:"",scope:"regional",features:[],geographies:[],drawings:[],presentation:defaultPresentation()},tool:"path",brush:{...defaultBrush,assetRefs:[assetReference(islandAssets[0])]},unfinished:{points:[{id:randomUUID(),x:123,y:456}],redo:[],kind:"island",existingId:""}},source:{surfaceId,sourceId:randomUUID(),baseRevision:3,baseVersionId:randomUUID(),requestId:randomUUID(),reference:{version:1,kind:"plane",crs:`AUTHORED:${randomUUID()}`,units:"map units",bounds:[0,0,2000,1200]},draft:{kind:"island",type:"Polygon",name:"Unfinished source",note:"Work in progress",protected:false,components:[{rings:[{complete:false,points:[[100,100],[200,300]],original:null}]}]},component:0,ring:0,vertex:1,acknowledgeImported:false,retryPending:true}}};
}
test("recovery round-trip retains original identities, revisions, unfinished boundaries and independent domains",()=>{
 const original=bundle(),before=structuredClone(original),result=decodeIslandRecovery(encodeIslandRecovery(original),original.context);
 assert.deepEqual(result,original);assert.deepEqual(original,before);assert.equal(result.domains.source!.draft.components[0].rings[0].complete,false);
 delete result.domains.artwork;assert.deepEqual(decodeIslandRecovery(encodeIslandRecovery(result),result.context).domains.source,original.domains.source);
});
test("recovery rejects every foreign owner and context without trusting file identity",()=>{
 const original=bundle(),text=encodeIslandRecovery(original);
 for(const key of ["userId","worldId","mapId","timelineId"] as const)assert.throws(()=>decodeIslandRecovery(text,{...original.context,[key]:randomUUID()}),/different signed-in/);
 assert.notEqual(islandRecoveryKey(original.context),islandRecoveryKey({...original.context,userId:"another user"}));
});
test("recovery rejects unsupported formats, unsafe structure and unavailable exact artwork",()=>{
 const original=bundle();
 for(const value of [{...original,version:2},{...original,format:"serrian-atlas-draft-v1"},{...original,unexpected:true}])assert.throws(()=>decodeIslandRecovery(JSON.stringify(value),original.context));
 const invalid=structuredClone(original);invalid.domains.source!.baseRevision=null;assert.throws(()=>encodeIslandRecovery(invalid),/exact saved/);
 const specialized=structuredClone(original);specialized.domains.artwork!.draft.settlementShapes=[];assert.throws(()=>encodeIslandRecovery(specialized),/specialized/);
 const unavailable=structuredClone(original);unavailable.domains.artwork!.brush.assetRefs[0].assetRevision=999;assert.throws(()=>encodeIslandRecovery(unavailable),/exact artwork revision/);
 const over=structuredClone(original);over.domains.source!.draft.components[0].rings[0].points=Array.from({length:257},()=>[1,2]);assert.throws(()=>encodeIslandRecovery(over));
});
test("the byte envelope rejects oversized and malformed input before staging any state",()=>{
 const original=bundle(),valid=encodeIslandRecovery(original);assert.ok(new TextEncoder().encode(valid).byteLength<ISLAND_RECOVERY_BYTES);
 assert.throws(()=>decodeIslandRecovery(" ".repeat(ISLAND_RECOVERY_BYTES)+valid,original.context),/4-MiB/);
 assert.throws(()=>decodeIslandRecovery("{broken",original.context));
 assert.deepEqual(decodeIslandRecovery(valid,original.context),original);
});
test("deliberate artwork rebase retains draft content and undo while aligning shared-place revisions",()=>{
 const draft=bundle().domains.artwork!.draft,id=randomUUID();draft.geographies=[{id,revision:2,name:"Draft place",kind:"location",description:"",parentId:null}];
 const latest={...structuredClone(draft),name:"Newer saved title",geographies:[{...draft.geographies[0],revision:3,name:"Saved place"}]};
 const history={past:[structuredClone(draft)],present:draft,future:[structuredClone(draft)]},before=structuredClone(history),result=rebaseRecoveredArtwork(history,latest);
 assert.equal(result.present.name,draft.name);assert.equal(result.present.geographies[0].name,"Draft place");assert.equal(result.present.geographies[0].revision,3);assert.equal(result.past.length,1);assert.equal(result.future.length,1);assert.equal(result.past[0].geographies[0].revision,3);assert.deepEqual(history,before);
});
test("pending presentation/source requests agree with their reviewed fields and independent bases",()=>{
 const value=bundle(),sourceId=randomUUID(),requestId=randomUUID(),preferences={visible:true,style:"tint" as const,opacity:.4},common={mapId:value.context.mapId,timelineId:value.context.timelineId,sourceId};
 value.domains.elevation={sourceId,versionId:randomUUID(),baseRevision:2,viewRevision:3,requestId,note:"Retained account",protected:true,preferences,attempts:[{action:"preferences",...common,revision:3,preferences},{action:"revise",...common,revision:2,requestId,note:"Retained account",protected:true,archived:false}]};
 assert.doesNotThrow(()=>encodeIslandRecovery(value));
 for(const change of [(v:IslandRecoveryBundle)=>{v.domains.elevation!.preferences!.opacity=.6;},(v:IslandRecoveryBundle)=>{v.domains.elevation!.baseRevision=1;},(v:IslandRecoveryBundle)=>{v.domains.elevation!.requestId=randomUUID();},(v:IslandRecoveryBundle)=>{v.domains.elevation!.note="Different account";}]){const changed=JSON.parse(JSON.stringify(value)) as IslandRecoveryBundle;change(changed);assert.throws(()=>encodeIslandRecovery(changed),/disagree/);}
});
test("retained generation fields and preview cannot disguise a different pending acceptance",()=>{
 const value=bundle(),source=value.domains.source!,recipe={version:1 as const,algorithm:"serrian-geography-v1" as const,seed:"recover",reference:source.reference,extent:[0,0,2000,1200] as [number,number,number,number],settings:geographicPresets.island.settings},requestId=randomUUID(),context="c".repeat(64),digest="d".repeat(64);
 value.domains.generation={surfaceId:source.surfaceId,fields:{seed:"recover",settings:recipe.settings,extent:["0","0","2000","1200"],name:"Island",note:"Accepted proposal",protected:false},preview:{recipe,requestId,context,digest},attempt:{mapId:value.context.mapId,timelineId:value.context.timelineId,surfaceId:source.surfaceId,requestId,expectedContext:context,outputDigest:digest,recipe,name:"Island",note:"Accepted proposal",protected:false}};
 assert.doesNotThrow(()=>encodeIslandRecovery(value));
 const changed=structuredClone(value);changed.domains.generation!.fields.name="Another name";assert.throws(()=>encodeIslandRecovery(changed),/disagree/);
 const disguised=structuredClone(value);disguised.domains.generation!.preview!.requestId=randomUUID();assert.throws(()=>encodeIslandRecovery(disguised),/disagree/);
});

test("source recovery compares JSONB and portable coordinate references by validated value, not property order",()=>{const original=bundle(),ref=original.domains.source!.reference;const reordered=Object.fromEntries(Object.entries(ref).reverse()) as typeof ref;assert.ok(sameSpatialReference(ref,reordered));if(ref.kind==="plane")assert.equal(sameSpatialReference(ref,{...ref,bounds:[0,0,3000,1200]}),false);});
