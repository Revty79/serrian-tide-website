import {TERRAIN_SOURCE_STATE_CHARACTERS} from "./terrain-source-limits";
import {z} from "zod";
import type {TerrainGeometry,TerrainPatch} from "./terrain";
import {ADVANCED_TERRAIN_LIMITS} from "./terrain-advanced-spec";
import type {RefinementMeta} from "./terrain-refinement";

export const SAVED_ELEVATION_TILE_LIMIT=ADVANCED_TERRAIN_LIMITS.cells/1024;
const identity={worldId:z.uuid(),mapId:z.uuid(),terrainId:z.uuid(),refinementId:z.uuid().optional(),headRevision:z.number().int().positive(),sourceState:z.string().min(1).max(TERRAIN_SOURCE_STATE_CHARACTERS),waterRevision:z.number().int().nonnegative(),width:z.number().int().positive(),height:z.number().int().positive()};
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
export function validateSavedElevationIdentity(packet:SavedElevationIdentity,expected:SavedElevationIdentity){
 for(const field of ["worldId","mapId","terrainId","refinementId","headRevision","sourceState","waterRevision"] as const)if(packet[field]!==expected[field])throw Error("Saved terrain changed. Close this comparison and reopen the current map before restoring elevations.");
}
export type SavedElevationWindow={x:number;y:number;width:number;height:number};
/** Transient display metadata only. Preserve the existing binary-pyramid
 * display contract; the accepted source lattice and samples stay unchanged. */
export function savedElevationWindowMeta(source:RefinementMeta,w:SavedElevationWindow,serial:number):RefinementMeta{
 if(![w.x,w.y,w.width,w.height].every(n=>Number.isSafeInteger(n)&&n%32===0)||w.x<0||w.y<0||w.width<32||w.height<32||!Number.isInteger(Math.log2(w.width/32))||!Number.isInteger(Math.log2(w.height/32))||w.x+w.width>source.gridWidth||w.y+w.height>source.gridHeight||w.width*w.height>ADVANCED_TERRAIN_LIMITS.cells)throw Error("The complete saved comparison window must use binary native tiles and fit its unchanged native source.");
 let levels=0;while(w.width%(32*2**(levels+1))===0&&w.height%(32*2**(levels+1))===0)levels++;
 return {...source,id:source.id+":saved-preview:"+serial,parentId:source.id,parentRevision:source.revision,level:source.level+.5,frame:{x:source.frame.x+w.x/source.gridWidth*source.frame.width,y:source.frame.y+w.y/source.gridHeight*source.frame.height,width:w.width/source.gridWidth*source.frame.width,height:w.height/source.gridHeight*source.frame.height},gridWidth:w.width,gridHeight:w.height,overviewLevels:levels};
}

/** A bounded comparison of native saved tiles. The existing terrain writer
 * receives the resulting ordinary manual edit; no alternative writer exists. */
function* savedElevationSteps(base:Int16Array,shape:TerrainGeometry,raw:unknown,expected:SavedElevationIdentity,blocked?:Uint8Array,windowed=false){
 const packet=cooperativePacketSchema.parse(raw),tiles:z.infer<typeof tileSchema>[]=[];
 validateSavedElevationIdentity(packet,expected);
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
 const window=windowed&&changed?(()=>{const x=Math.floor(left/32)*32,y=Math.floor(top/32)*32,width=32*2**Math.max(0,Math.ceil(Math.log2((right-x+1)/32))),height=32*2**Math.max(0,Math.ceil(Math.log2((bottom-y+1)/32)));return {x:Math.min(x,shape.width-width),y:Math.min(y,shape.height-height),width,height};})():undefined;
 if(window&&window.width*window.height>ADVANCED_TERRAIN_LIMITS.cells)throw Error("That saved revision spans too much terrain for one bounded preview. Choose a more recent revision. The current terrain and all saved history are retained.");
 const grid=window?new Int16Array(window.width*window.height):windowed?new Int16Array():base.slice(),indices=new Uint32Array(changed),before=new Int16Array(changed),after=new Int16Array(changed);let next=0;
 if(window)for(let row=0;row<window.height;row++){const start=(row+window.y)*shape.width+window.x;grid.set(base.subarray(start,start+window.width),row*window.width);if(row%32===0)yield .5;}
 let copied=0;for(const tile of tiles){for(let n=0;n<1024;n++)if(tile.before[n]!==tile.after[n]){const x=tile.x*32+n%32,y=tile.y*32+Math.floor(n/32),i=y*shape.width+x;indices[next]=i;before[next]=tile.before[n];after[next]=tile.after[n];grid[window?(y-window.y)*window.width+x-window.x:i]=tile.after[n];next++;}yield .5+.5*++copied/Math.max(1,tiles.length);}
 const patch:TerrainPatch={indices,before,after};
 return {grid,patch,changed,...window?{window}:{},frame:changed?{x:left/shape.width*shape.displayWidth,y:top/shape.height*shape.displayHeight,width:(right-left+1)/shape.width*shape.displayWidth,height:(bottom-top+1)/shape.height*shape.displayHeight}:undefined};
}
export function prepareSavedElevations(base:Int16Array,shape:TerrainGeometry,raw:unknown,expected:SavedElevationIdentity,blocked?:Uint8Array,windowed=false){const steps=savedElevationSteps(base,shape,raw,expected,blocked,windowed);let next=steps.next();while(!next.done)next=steps.next();return next.value;}
export async function prepareSavedElevationsAsync(base:Int16Array,shape:TerrainGeometry,raw:unknown,expected:SavedElevationIdentity,blocked?:Uint8Array,signal?:AbortSignal,progress?:(value:number)=>void,windowed=false){
 const steps=savedElevationSteps(base,shape,raw,expected,blocked,windowed);let deadline=performance.now()+8;
 for(;;){if(signal?.aborted)throw new DOMException("Saved elevation comparison cancelled before acceptance.","AbortError");const next=steps.next();if(next.done)return next.value;progress?.(next.value);if(performance.now()>=deadline){await new Promise<void>(resolve=>setTimeout(resolve,0));deadline=performance.now()+8;}}
}
