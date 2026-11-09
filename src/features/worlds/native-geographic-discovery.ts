import "server-only";
import {sql} from "drizzle-orm";
import {WorldError} from "./world-service";
import {worldOrdinaryContent,worldScopeAllowed} from "./world-access-service";
import {geographicPrivatePlaces} from "./geographic-privacy";
import {layerAccess} from "./geographic-service";
import type {HistoryTx} from "./history-version-service";
import type {WorldAtlasContext} from "./world-atlas-context";
import type {GeographicBounds} from "./geographic";
import {terrainReferenceSourceFrame} from "./terrain-reference-boundaries";

type Candidate={map_id:string;map_name:string;geography_id:string;place_name:string;feature_id:string;width:number;height:number;wrap:boolean;bounds:GeographicBounds[]};
/** Current saved reference geometry never supplies a dated historical position. */
export async function nativeGeographicRepresentations(tx:HistoryTx,userId:string,context:WorldAtlasContext,ids:string[]){
 if(context.year!==undefined||context.ordinary||!ids.length||!worldScopeAllowed(context.worldId,"atlas"))return [];
 const ordinary=worldOrdinaryContent(context.worldId,context.ordinary);
 const rows=(await tx.execute<Candidate>(sql`select m.id map_id,m.name map_name,g.id geography_id,g.name place_name,f.id feature_id,t.width_metres width,t.height_metres height,t.wrap_east_west wrap,
   jsonb_agg(distinct jsonb_build_array(p.west,p.south,p.east,p.north)) bounds
   from world_geo_view binding join world_geo_surface s on s.id=binding.surface_id and s.world_id=binding.world_id
   join world_map_canvas canvas on canvas.map_id=binding.map_id and canvas.world_id=binding.world_id and canvas.purpose='world'
   join world_atlas_map m on m.id=canvas.map_id and m.world_id=canvas.world_id
   join world_terrain t on t.id=canvas.terrain_id and t.world_id=canvas.world_id
   join world_geo_feature f on f.surface_id=s.id and f.world_id=s.world_id
   join world_geo_head h on h.feature_id=f.id and h.world_id=f.world_id
   join world_geo_version v on v.id=h.version_id and v.world_id=h.world_id
   join world_geography g on g.id=f.geography_id and g.world_id=f.world_id
   join world_geo_part p on p.version_id=v.id and p.world_id=v.world_id and p.algorithm_version=3
   where binding.world_id=${context.worldId} and g.id in (${sql.join([...new Set(ids)].map(id=>sql`${id}`),sql`,`)})
    and f.semantic='administrative-boundary' and s.reference->>'kind'='sphere' and s.realm_id is null and m.archived_at is null and g.archived_at is null and not v.archived
    ${ordinary?sql`and not s.protected and not v.protected and g.id not in (${geographicPrivatePlaces(context.worldId)})`:sql``}
   group by m.id,m.name,g.id,g.name,f.id,t.id order by m.id,g.id,f.id limit 2001`)).rows;
 if(rows.length>2000)throw new WorldError("This reference selection exceeds the bounded map-discovery window. Narrow the saved place selection.",413);
 const checked=new Set<string>(),hidden=new Set<string>();for(const row of rows){if(checked.has(row.map_id))continue;checked.add(row.map_id);try{await layerAccess(tx,context.worldId,row.map_id,context.timelineId,{review:context.review,ordinary:context.ordinary},userId);}catch(e){if(e instanceof WorldError&&e.status===404)hidden.add(row.map_id);else throw e;}}
 return rows.filter(r=>!hidden.has(r.map_id)).map(row=>({...row,frame:terrainReferenceSourceFrame(row.bounds,{displayWidth:row.width,displayHeight:row.height,wrap:row.wrap})}));
}

/** Whole-map discovery follows overview references; explicit objects remain exact. */
export async function nativeGeographicPlaceIds(tx:HistoryTx,userId:string,context:WorldAtlasContext,mapId:string,objectId?:string){
 if(context.year!==undefined||context.ordinary||!worldScopeAllowed(context.worldId,"atlas"))return [];
 try{await layerAccess(tx,context.worldId,mapId,context.timelineId,{review:context.review,ordinary:context.ordinary},userId);}catch(e){if(e instanceof WorldError&&e.status===404)return [];throw e;}
 const ordinary=worldOrdinaryContent(context.worldId,context.ordinary);
 const rows=(await tx.execute<{id:string}>(sql`select distinct g.id from world_geo_view binding
  join world_map_canvas canvas on canvas.map_id=binding.map_id and canvas.world_id=binding.world_id and canvas.purpose='world'
  join world_geo_surface s on s.id=binding.surface_id and s.world_id=binding.world_id
  join world_geo_feature f on f.surface_id=s.id and f.world_id=s.world_id
  join world_geo_head h on h.feature_id=f.id and h.world_id=f.world_id
  join world_geo_version v on v.id=h.version_id and v.world_id=h.world_id
  join world_geo_dataset d on d.id=v.dataset_id and d.world_id=v.world_id
  join world_geography g on g.id=f.geography_id and g.world_id=f.world_id
  where binding.world_id=${context.worldId} and binding.map_id=${mapId} and f.semantic='administrative-boundary' and s.reference->>'kind'='sphere' and s.realm_id is null and not v.archived and g.archived_at is null
   ${objectId?sql`and f.id=${objectId}`:sql`and (not(d.provenance ? 'display') or (d.provenance->'display'->'lods') ? 'overview')`}
   ${ordinary?sql`and not s.protected and not v.protected and g.id not in (${geographicPrivatePlaces(context.worldId)})`:sql``}
  order by g.id limit 2001`)).rows;
 if(rows.length>2000)throw new WorldError("This overview has more reference places than the bounded discovery window. Use Geography records and boundaries to search the saved hierarchy.",413);
 return rows.map(r=>r.id);
}
