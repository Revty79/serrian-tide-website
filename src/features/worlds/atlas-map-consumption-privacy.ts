import "server-only";
import {sql} from "drizzle-orm";
import {geographicPrivateMaps,geographicPrivatePlaces} from "./geographic-privacy";
import {nativeResource,type NativeContentContext} from "./native-map-history-context";
import type {NativeHistoryTx} from "./native-map-history-store";
import type {TownMapBundle} from "./town-map";
import type {FloorBundle} from "./building-floor";
import type {UndergroundBundle} from "./underground";
import {WorldError} from "./world-errors";
import {worldScopeAllowed} from "./world-access-service";

export async function unavailableConsumptionPlaces(tx:NativeHistoryTx,c:NativeContentContext,ids:string[]){
 if(!worldScopeAllowed(c.worldId,"settlements"))return new Set(ids);
 const blocked=new Set<string>(),privatePlaces=geographicPrivatePlaces(c.worldId);
 for(let offset=0;offset<ids.length;offset+=500){const rows=await tx.execute<{id:string}>(sql`select id from (${privatePlaces}) hidden where id in (${sql.join(ids.slice(offset,offset+500).map(id=>sql`${id}`),sql`,`)})`);for(const row of rows.rows)blocked.add(row.id);}
 return blocked;
}

/** Ordinary geographic rules apply independently of privileged Atlas review. */
export async function assertConsumptionGeography(tx:NativeHistoryTx,c:NativeContentContext){
 const maps=[c.version.mapId,...c.scope.target.kind==="terrain"?[c.scope.target.id]:[]],places:string[]=[];
 if(c.scope.target.kind==="town"){
  const b=(await nativeResource(tx,c,"town")).payload as unknown as {bundle:TownMapBundle};if(b.bundle.document)places.push(b.bundle.document.townId);
 }else if(c.scope.target.kind==="floor"){
  const b=(await nativeResource(tx,c,"floor")).payload as unknown as {bundle:FloorBundle};if(b.bundle.building){places.push(b.bundle.building.townId);if(b.bundle.building.placeId)places.push(b.bundle.building.placeId);}
 }else if(c.scope.target.kind==="underground"){
  const b=(await nativeResource(tx,c,"underground")).payload as unknown as {bundle:UndergroundBundle};const site=b.bundle.sites.find(s=>s.id===b.bundle.document?.siteId);if(site?.placeId)places.push(site.placeId);
 }
 const hiddenMaps=geographicPrivateMaps(c.worldId),hiddenPlaces=geographicPrivatePlaces(c.worldId);
 const result=await tx.execute<{ok:boolean}>(sql`select not exists(select 1 from world_atlas_map m where m.world_id=${c.worldId} and m.id in (${sql.join(maps.map(id=>sql`${id}`),sql`,`)}) and (m.id in (${hiddenMaps}) or m.geography_id in (${hiddenPlaces})))
  and ${places.length?sql`not exists(select 1 from (${hiddenPlaces}) hidden where hidden.id in (${sql.join(places.map(id=>sql`${id}`),sql`,`)}))`:sql`true`} ok`);
 if(!result.rows[0]?.ok)throw new WorldError("This ordinary geographic source is unavailable.",404);
}
