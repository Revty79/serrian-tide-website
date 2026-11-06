import "server-only";
import type {HistoryTx} from "./history-version-service";
import {nativeResource,type NativeContentContext} from "./native-map-history-context";
import {nativeTerritorySavedSchema,type NativeTerritory} from "./native-map-history-territories";
import {activeTerritoryRelationships} from "./historical-territories";
import {nativeConditions} from "./native-map-history-conditions";
import {nativeObjectPresent} from "./native-map-history";
/** Read only the geography this view actually consumes. Missing coverage never
 * falls back to a modern or legacy political layer. */
export async function nativeTerritoriesForDiscovery(tx:HistoryTx,c:NativeContentContext){
  const authority=c.authority??c;
  if(!authority.manifest.resources.some(r=>r.key==="territories"))return [];
  const conditions=(await nativeConditions(tx,authority)).values;
  if(!nativeObjectPresent(conditions,authority.scope.target.id))return [];
  const layer=nativeTerritorySavedSchema.parse((await nativeResource(tx,authority,"territories")).payload);
  return layer.territories.filter(t=>!t.archived&&nativeObjectPresent(conditions,t.id)&&t.boundaries.some(b=>!b.archived&&!b.parentId)).map(territory=>({territory,relationships:activeTerritoryRelationships(territory,c.scope.year),mapVersionId:authority.version.id}));
}
export function nativeTerritoryFocus(t:NativeTerritory){
  const points=t.boundaries.filter(b=>!b.archived&&!b.parentId).flatMap(b=>b.points);if(!points.length)return;
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys),width=Math.max(...xs)-x,height=Math.max(...ys)-y;
  return {point:{x:x+width/2,y:y+height/2},frame:{x,y,width:Math.max(1,width),height:Math.max(1,height)}};
}
