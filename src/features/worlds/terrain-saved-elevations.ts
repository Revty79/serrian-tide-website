import {z} from "zod";
import type {TerrainGeometry,TerrainPatch} from "./terrain";
import {ADVANCED_TERRAIN_LIMITS} from "./terrain-advanced-spec";

export const SAVED_ELEVATION_TILE_LIMIT=ADVANCED_TERRAIN_LIMITS.cells/1024;
const identity={worldId:z.uuid(),mapId:z.uuid(),terrainId:z.uuid(),headRevision:z.number().int().positive(),sourceState:z.string().min(1).max(8192),waterRevision:z.number().int().nonnegative(),width:z.number().int().positive(),height:z.number().int().positive()};
export const savedElevationListSchema=z.object({...identity,versions:z.array(z.object({revision:z.number().int().positive(),previousRevision:z.number().int().positive().nullable(),createdAt:z.string(),kind:z.string().max(40)}).strict()).max(50)}).strict();
const samples=z.array(z.number().int().min(-30000).max(30000)).length(1024);
const tileSchema=z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative(),before:samples,after:samples}).strict();
export const savedElevationPreviewSchema=z.object({...identity,targetRevision:z.number().int().positive(),changed:z.number().int().nonnegative().max(ADVANCED_TERRAIN_LIMITS.cells),tiles:z.array(tileSchema).max(SAVED_ELEVATION_TILE_LIMIT)}).strict();
// The browser validates one native tile between cooperative checkpoints. The
// server's complete response schema retains exactly the same strict contract.
const cooperativePacketSchema=savedElevationPreviewSchema.omit({tiles:true}).extend({tiles:z.array(z.unknown()).max(SAVED_ELEVATION_TILE_LIMIT)});
export type SavedElevationList=z.infer<typeof savedElevationListSchema>;
export type SavedElevationPreview=z.infer<typeof savedElevationPreviewSchema>;
export type SavedElevationIdentity=Omit<SavedElevationList,"versions"|"width"|"height">;

/** A bounded comparison of native saved tiles. The existing terrain writer
 * receives the resulting ordinary manual edit; no alternative writer exists. */
function* savedElevationSteps(base:Int16Array,shape:TerrainGeometry,raw:unknown,expected:SavedElevationIdentity,blocked?:Uint8Array){
 const packet=cooperativePacketSchema.parse(raw),tiles:z.infer<typeof tileSchema>[]=[];
 for(const field of ["worldId","mapId","terrainId","headRevision","sourceState","waterRevision"] as const)if(packet[field]!==expected[field])throw Error("Saved terrain changed. Close this comparison and reopen the current map before restoring elevations.");
 if(packet.width!==shape.width||packet.height!==shape.height||base.length!==shape.width*shape.height||packet.targetRevision>packet.headRevision)throw Error("This saved revision does not match the active World terrain.");
 if(blocked&&blocked.length!==base.length)throw Error("The active finer-source protection is unavailable.");
 const seen=new Set<string>();let changed=0,left=shape.width,top=shape.height,right=-1,bottom=-1,checked=0;
 for(const rawTile of packet.tiles){
  const tile=tileSchema.parse(rawTile);tiles.push(tile);
  const key=tile.x+":"+tile.y;if(seen.has(key)||tile.x>=shape.width/32||tile.y>=shape.height/32)throw Error("The saved comparison contains duplicate or out-of-range tiles.");seen.add(key);
  for(let n=0;n<1024;n++){
   const x=tile.x*32+n%32,y=tile.y*32+Math.floor(n/32),i=y*shape.width+x;
   if(base[i]!==tile.before[n])throw Error("The current elevations changed after this comparison was prepared. Nothing was restored.");
   if(tile.after[n]<shape.min||tile.after[n]>shape.max)throw Error("The saved elevation exceeds this map's retained height range.");
   if(tile.before[n]!==tile.after[n]){
    if(blocked?.[i])throw Error("This saved revision would replace accepted finer terrain or its boundary supports. Keep the current sources and edit that finer terrain instead.");
    changed++;left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
   }
  }
  yield .5*++checked/Math.max(1,packet.tiles.length);
 }
 if(changed!==packet.changed)throw Error("The saved comparison summary is incomplete. Nothing was restored.");
 const grid=base.slice(),indices=new Uint32Array(changed),before=new Int16Array(changed),after=new Int16Array(changed);let next=0;
 let copied=0;for(const tile of tiles){for(let n=0;n<1024;n++)if(tile.before[n]!==tile.after[n]){const i=(tile.y*32+Math.floor(n/32))*shape.width+tile.x*32+n%32;indices[next]=i;before[next]=tile.before[n];after[next]=tile.after[n];grid[i]=tile.after[n];next++;}yield .5+.5*++copied/Math.max(1,tiles.length);}
 const patch:TerrainPatch={indices,before,after};
 return {grid,patch,changed,frame:changed?{x:left/shape.width*shape.displayWidth,y:top/shape.height*shape.displayHeight,width:(right-left+1)/shape.width*shape.displayWidth,height:(bottom-top+1)/shape.height*shape.displayHeight}:undefined};
}
export function prepareSavedElevations(base:Int16Array,shape:TerrainGeometry,raw:unknown,expected:SavedElevationIdentity,blocked?:Uint8Array){const steps=savedElevationSteps(base,shape,raw,expected,blocked);let next=steps.next();while(!next.done)next=steps.next();return next.value;}
export async function prepareSavedElevationsAsync(base:Int16Array,shape:TerrainGeometry,raw:unknown,expected:SavedElevationIdentity,blocked?:Uint8Array,signal?:AbortSignal,progress?:(value:number)=>void){
 const steps=savedElevationSteps(base,shape,raw,expected,blocked);let deadline=performance.now()+8;
 for(;;){if(signal?.aborted)throw new DOMException("Saved elevation comparison cancelled before acceptance.","AbortError");const next=steps.next();if(next.done)return next.value;progress?.(next.value);if(performance.now()>=deadline){await new Promise<void>(resolve=>setTimeout(resolve,0));deadline=performance.now()+8;}}
}
