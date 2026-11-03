import type {FloorFeature} from "./building-floor";
import {sameUndergroundMap,undergroundCategoryLayer,undergroundLayer,type UndergroundAttribute,type UndergroundConnection,type UndergroundDesign,type UndergroundMap} from "./underground";

type Layer=keyof UndergroundDesign["layers"];
export function undergroundCreationLayers(category:UndergroundAttribute["category"]):Layer[]{
 return category==="room"||category==="cavern"?["rooms","walls"]:[undergroundCategoryLayer(category)];
}
export function undergroundFeatureLocked(design:UndergroundDesign,feature:FloorFeature):boolean{
 const affected=new Set([feature.id]);
 if(feature.variant==="area")for(const f of design.features)if(f.variant==="wall"&&f.roomId===feature.id)affected.add(f.id);
 for(const f of design.features)if(f.variant==="opening"&&affected.has(f.wallId))affected.add(f.id);
 if(feature.variant==="opening")affected.add(feature.wallId);
 return design.features.some(f=>affected.has(f.id)&&design.layers[undergroundLayer(f,design)].locked);
}
function equal(a:unknown,b:unknown):boolean{
 if(a===b)return true;if(a===null||b===null||typeof a!=="object"||typeof b!=="object")return false;
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,i)=>equal(value,b[i]));
 const x=a as Record<string,unknown>,y=b as Record<string,unknown>,keys=Object.keys(x).filter(k=>x[k]!==undefined);return keys.length===Object.keys(y).filter(k=>y[k]!==undefined).length&&keys.every(k=>equal(x[k],y[k]));
}
const openingGeometry=(f:Extract<FloorFeature,{variant:"opening"}>)=>({wallId:f.wallId,startId:f.startId,endId:f.endId,at:f.at,width:f.width,style:f.style,archived:f.archived});
/** Same JSON-domain lock policy for client acceptance and authoritative saves. Unlocking remains explicit. */
export function assertUndergroundLayerChanges(before:UndergroundDesign,after:UndergroundDesign){
 const old=new Map(before.features.map(f=>[f.id,f])),next=new Map(after.features.map(f=>[f.id,f])),locked=(layer:Layer)=>before.layers[layer].locked&&after.layers[layer].locked;
 for(const f of before.features){const n=next.get(f.id),source=undergroundLayer(f,before);if(locked(source)&&(!equal(f,n)||!equal(before.attributes[f.id],after.attributes[f.id])))throw Error(`Unlock ${source} before changing its objects or information.`);
  if(n){const destination=undergroundLayer(n,after);if(destination!==source&&locked(destination))throw Error(`Unlock the destination layer (${destination}) before moving an object into it.`);}
  if(f.variant==="opening"&&locked(source)){const a=old.get(f.wallId),b=next.get(f.wallId);if(a?.variant==="wall"&&b?.variant==="wall"&&(!equal(a.points,b.points)||a.archived!==b.archived))throw Error("Unlock openings before moving their attached wall or chamber.");}
 }
 for(const f of after.features){const previous=old.get(f.id),layer=undergroundLayer(f,after);if(!previous&&locked(layer))throw Error(`Unlock ${layer} before adding objects.`);
  if(f.variant==="opening"&&(!previous||previous.variant!=="opening"||!equal(openingGeometry(previous),openingGeometry(f)))){
   const parents=[[next.get(f.wallId),after],[previous?.variant==="opening"?old.get(previous.wallId):undefined,before]] as const;for(const [parent,design] of parents)if(parent&&locked(undergroundLayer(parent,design)))throw Error("Unlock the attached wall's layer before changing its opening.");
  }
 }
 if(locked("ground")&&before.flooring!==after.flooring)throw Error("Unlock ground before changing its material.");
}

/** Only an explicit recorded route can become Return to Entrance; inventories never imply an arrival. */
export function undergroundReturnRoute(raw:string|null,map:UndergroundMap|undefined,connections:UndergroundConnection[]):{connection?:UndergroundConnection;reverse:boolean;reason:string}{
 const fallback=(reason="")=>({reverse:false,reason});if(!raw||!map)return fallback();let hint:{connectionId:string;reverse:boolean};
 try{const value=JSON.parse(raw);if(!value||typeof value.connectionId!=="string"||typeof value.reverse!=="boolean")return fallback("The recorded return route is invalid. Return to Atlas or choose a connection in Options.");hint=value;}catch{return fallback("The recorded return route is invalid. Return to Atlas or choose a connection in Options.");}
 const connection=connections.find(c=>c.id===hint.connectionId&&sameUndergroundMap(map,hint.reverse?c.destination.map:c.source.map));
 if(!connection)return fallback("The recorded return connection is missing from this map. Return to Atlas or choose a connection in Options.");
 if(!connection.twoWay)return fallback("This is a one-way arrival. Return to Atlas or choose another connection in Options.");
 if(!connection.available||connection.archived)return fallback((connection.reason||"The recorded return connection is unavailable.")+" Return to Atlas or restore it in Options.");
 return {connection,reverse:hint.reverse,reason:""};
}
