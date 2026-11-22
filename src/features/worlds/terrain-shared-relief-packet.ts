import {TERRAIN_REFINEMENT_LIMIT,TERRAIN_SOURCE_LIMIT} from "./terrain-source-limits";
import {z} from "zod";
import {ADVANCED_TERRAIN_LIMITS} from "./terrain-advanced-spec";
import {sharedReliefSnapshotSchema} from "./terrain-shared-relief-spec";
import {sharedReliefJoinReviewSchema} from "./terrain-shared-relief-join-review";
const hash=z.string().regex(/^[a-f0-9]{64}$/),count=z.number().int().nonnegative(),dimension=z.number().int().min(32).max(4096).multipleOf(32),frame=sharedReliefSnapshotSchema.shape.frame;
const meta=z.object({id:z.uuid(),worldId:z.uuid(),terrainId:z.uuid(),mapId:z.uuid(),name:z.string().max(160),parentId:z.uuid().nullable(),parentRevision:z.number().int().positive(),level:z.number().int().min(1).max(8),revision:z.number().int().positive(),frame,gridWidth:dimension,gridHeight:dimension,overviewLevels:z.number().int().min(0).max(7),updatedAt:z.string().max(40)}).strict();
export const sharedReliefPreviewHeaderSchema=z.object({
 version:z.literal(1),worldId:z.uuid(),mapId:z.uuid(),terrainId:z.uuid(),rootRevision:z.number().int().positive(),contextPin:hash,previewHash:hash,
 refinements:z.array(meta).max(TERRAIN_REFINEMENT_LIMIT),
 windows:z.array(z.object({id:z.uuid(),sourceId:z.uuid().nullable(),name:z.string().max(160),level:z.number().int().min(0).max(8),revision:z.number().int().positive(),frame,
  sourceWidth:dimension,sourceHeight:dimension,x:count,y:count,width:dimension,height:dimension,beforeHash:hash,afterHash:hash,changed:count.max(262144),maxLoweringM:count.max(60000),maxRaisingM:count.max(60000)}).strict()).min(1).max(TERRAIN_SOURCE_LIMIT),
 effects:z.array(z.object({id:z.uuid(),name:z.string().max(160),revision:z.number().int().positive(),parentRevision:z.number().int().positive().nullable(),changed:count.max(262144)}).strict()).min(1).max(TERRAIN_SOURCE_LIMIT),
 cells:count.max(262144),sampleSteps:count.max(8388608),workingBytes:count.max(33554432),contextChanges:count.max(8388608),maxContextChangeM:z.number().finite().min(0).max(60000),
 elapsedMs:z.number().finite().min(0),protected:count,waterProtected:count,siteProtected:count,
 joinReview:sharedReliefJoinReviewSchema.optional(),
 bankReinforcement:z.object({conflictingSupports:count.max(ADVANCED_TERRAIN_LIMITS.work),maximumStepM:count.max(60000),reviewHash:hash}).strict().optional(),
}).strict();
export type SharedReliefPreviewHeader=z.infer<typeof sharedReliefPreviewHeaderSchema>;
export type SharedReliefPreview={header:SharedReliefPreviewHeader;windows:{before:Int16Array;after:Int16Array}[]};
function countSamples(header:SharedReliefPreviewHeader){let count=0;for(const w of header.windows){if(w.x%32||w.y%32||w.x+w.width>w.sourceWidth||w.y+w.height>w.sourceHeight)throw Error("The native relief preview window is outside its accepted source.");count+=w.width*w.height;}const review=header.joinReview?.sources.reduce((n,s)=>n+s.supports.length,0)??0,reconstruction=header.joinReview?.sources.reduce((n,s)=>n+s.supports.reduce((n,p)=>n+(p.reconstruction?.length??0),0),0)??0;if(count*8+header.cells*8+review*512+reconstruction*256>ADVANCED_TERRAIN_LIMITS.workingBytes||review+reconstruction>header.cells)throw Error("The relief preview exceeds the existing numerical memory bound.");return count;}
/** Compact native preview transport only. It cannot be submitted as authoring
 * input: acceptance carries the original operation and checked hashes alone. */
export function encodeSharedReliefPreview(value:SharedReliefPreview){
 const header=sharedReliefPreviewHeaderSchema.parse(value.header),json=new TextEncoder().encode(JSON.stringify(header)),samples=countSamples(header);
 if(json.length>ADVANCED_TERRAIN_LIMITS.packetCharacters||value.windows.length!==header.windows.length)throw Error("The relief preview metadata is incomplete or exceeds its existing bound.");
 const bytes=new Uint8Array(8+json.length+samples*4),view=new DataView(bytes.buffer);view.setUint32(0,0x31524c53,true);view.setUint32(4,json.length,true);bytes.set(json,8);let offset=8+json.length;
 value.windows.forEach((w,i)=>{const n=header.windows[i].width*header.windows[i].height;if(w.before.length!==n||w.after.length!==n)throw Error("The relief preview native samples are incomplete.");for(const grid of [w.before,w.after])for(const n of grid){view.setInt16(offset,n,true);offset+=2;}});
 return bytes;
}
export async function decodeSharedReliefPreview(buffer:ArrayBuffer):Promise<SharedReliefPreview>{
 const view=new DataView(buffer);if(buffer.byteLength<8||view.getUint32(0,true)!==0x31524c53)throw Error("The native relief preview could not be read.");
 const size=view.getUint32(4,true);if(size>ADVANCED_TERRAIN_LIMITS.packetCharacters||size+8>buffer.byteLength)throw Error("The relief preview metadata exceeds its existing bound.");
 const header=sharedReliefPreviewHeaderSchema.parse(JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,8,size)))),samples=countSamples(header);if(buffer.byteLength!==8+size+samples*4)throw Error("The relief preview native samples are incomplete.");
 if(header.joinReview){
  const {reviewHash,...data}=header.joinReview,digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(data))),actual=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,"0")).join("");
  if(actual!==reviewHash)throw Error("The complete native border review failed its checksum. Saved geography is unchanged.");
  for(const source of data.sources){const meta=header.refinements.find(v=>v.id===source.sourceId),effect=header.effects.find(v=>v.id===source.sourceId);if(!meta||!effect||meta.parentRevision!==source.oldParentRevision||effect.parentRevision!==source.newParentRevision||meta.gridWidth!==source.columns||meta.gridHeight!==source.rows||JSON.stringify(meta.frame)!==JSON.stringify(source.frame))throw Error("The native border review does not match the accepted source and proposed parent context.");}
 }
 let offset=8+size;const windows:SharedReliefPreview["windows"]=[];
 if(header.bankReinforcement){
  const {reviewHash,...data}=header.bankReinforcement,digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(data))),actual=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,"0")).join("");
  if(actual!==reviewHash)throw Error("The protected-bank review failed its checksum. Saved geography is unchanged.");
 }
 for(const w of header.windows){
  const bytes=w.width*w.height*2;
  for(const [n,expected] of [w.beforeHash,w.afterHash].entries()){
   const digest=await crypto.subtle.digest("SHA-256",new Uint8Array(buffer,offset+n*bytes,bytes)),actual=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,"0")).join("");
   if(actual!==expected)throw Error("The native relief preview failed its numerical checksum. Saved terrain is unchanged.");
  }
  const read=()=>{const a=new Int16Array(w.width*w.height);for(let i=0;i<a.length;i++){a[i]=view.getInt16(offset,true);if(a[i]<-30000||a[i]>30000)throw Error("The relief preview contains invalid native heights.");offset+=2;}return a;};windows.push({before:read(),after:read()});
 }
 return {header,windows};
}
