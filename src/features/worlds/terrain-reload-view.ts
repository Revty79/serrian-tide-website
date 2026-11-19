import type {TerrainViewport} from "./terrain-refinement";

/** Ephemeral editor UI only. No terrain, draft or authority is stored here. */
export type TerrainCamera={x:number;y:number;scale:number};
export type TerrainReloadView=TerrainCamera&{binding:string};
export type TerrainReloadContext={actorId:string|undefined;api:string;worldId:string;mapId:string;terrainId:string;width:number;height:number;columns:number;rows:number;wrap:boolean;navigation:string};
export function terrainReloadBinding(context:TerrainReloadContext){
 if(!context.actorId||![context.api,context.worldId,context.mapId,context.terrainId].every(value=>typeof value==="string"&&value.length>0)||![context.width,context.height,context.columns,context.rows].every(value=>Number.isFinite(value)&&value>0)||!Number.isInteger(context.columns)||!Number.isInteger(context.rows))return undefined;
 return JSON.stringify([context.actorId,context.api,context.worldId,context.mapId,context.terrainId,context.width,context.height,context.columns,context.rows,context.wrap,context.navigation]);
}
function validCamera(value:TerrainCamera){return [value.x,value.y,value.scale].every(Number.isFinite)&&Math.abs(value.x)<=1e12&&Math.abs(value.y)<=1e12&&value.scale>=1e-12&&value.scale<=1e9;}
export function retainTerrainReloadView(binding:string|undefined,viewport:TerrainViewport|null|undefined):TerrainReloadView|undefined{
 if(!binding||!viewport||![viewport.left,viewport.right,viewport.top,viewport.bottom,viewport.width,viewport.height].every(Number.isFinite)||viewport.right<=viewport.left||viewport.bottom<=viewport.top||viewport.width<=0||viewport.height<=0)return;
 const value={x:viewport.left/2+viewport.right/2,y:viewport.top/2+viewport.bottom/2,scale:viewport.scale};
 return validCamera(value)?{binding,...value}:undefined;
}
export function readTerrainReloadView(binding:string|undefined,retained:TerrainReloadView|undefined):TerrainCamera|undefined{
 if(!binding||retained?.binding!==binding||!validCamera(retained))return;
 return {x:retained.x,y:retained.y,scale:retained.scale};
}
