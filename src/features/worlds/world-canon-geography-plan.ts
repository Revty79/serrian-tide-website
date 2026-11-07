import "server-only";
import { sql, type SQL } from "drizzle-orm";
import {geographicPrivateMaps,geographicPrivatePlaces} from "./geographic-privacy";

export type CanonGeographyPlan={table:string;key:SQL;source:SQL;batch:number};
/** Only these reviewed native tables may be prepared or accepted. No catalog,
 * Campaign, invitation, asset-library or arbitrary table copying is possible. */
export function canonGeographyPlan(worldId:string):CanonGeographyPlan[]{
  const privatePlaces=geographicPrivatePlaces(worldId),privateMaps=geographicPrivateMaps(worldId);
  const maps=sql`select c.map_id from world_map_canvas c join world_atlas_map m on m.id=c.map_id and m.world_id=c.world_id where c.world_id=${worldId} and m.archived_at is null and c.map_id not in (${privateMaps}) and (m.geography_id is null or m.geography_id not in (${privatePlaces})) and (c.purpose='world' or exists(select 1 from world_map_region r join world_atlas_map p on p.id=r.parent_map_id and p.world_id=r.world_id where r.map_id=c.map_id and r.world_id=c.world_id and p.archived_at is null and p.id not in (${privateMaps}) and (p.geography_id is null or p.geography_id not in (${privatePlaces}))))`;
  const terrain=sql`select distinct terrain_id from world_map_canvas where world_id=${worldId} and map_id in (${maps})`;
  // Keep the minimal exact numerical ancestry required by refinement collars.
  // Reindex those selected snapshots contiguously for each independent source;
  // no private source recipe or unrelated numerical undo history is imported.
  const numericPins=sql`with recursive pins(id,terrain_id,revision,kind) as (
    select id,id,revision,'root'::text from world_terrain where world_id=${worldId} and id in (${terrain})
    union select id,terrain_id,revision,'detail'::text from world_terrain_refinement where world_id=${worldId} and terrain_id in (${terrain})
    union select next.id,p.terrain_id,next.revision,next.kind from pins p
      join world_terrain_refinement r on r.id=p.id and r.world_id=${worldId}
      join world_terrain_refinement_version v on v.refinement_id=p.id and v.revision=p.revision
      cross join lateral(select coalesce(r.parent_id,r.terrain_id) id,v.parent_revision revision,case when r.parent_id is null then 'root' else 'detail' end kind
        union select r.terrain_id,v.root_revision,'root') next
  ) select *,row_number() over(partition by id order by revision)::int copy_revision from pins`;
  const primary=sql`select id from world_timeline where world_id=${worldId} and is_primary`;
  const connectionPins=sql`values
    (c.payload#>>'{source,sourceVersionId}'),(c.payload#>>'{source,destinationVersionId}'),
    (c.payload#>>'{source,sourceGeographyVersionId}'),(c.payload#>>'{source,destinationGeographyVersionId}'),
    (c.payload#>>'{original,sourceVersionId}'),(c.payload#>>'{original,destinationVersionId}'),
    (c.payload#>>'{original,sourceGeographyVersionId}'),(c.payload#>>'{original,destinationGeographyVersionId}')`;
  const ordinaryConnection=sql`c.kind='connections' and c.payload ? 'connection' and c.payload ? 'original' and coalesce(c.payload#>>'{draft,protected}','false')<>'true'`;
  const targetId=(alias:"v"|"p")=>sql`${sql.identifier(alias)}.payload->'nativeAtlas'->'target'->>'id'`;
  const targetKind=(alias:"v"|"p")=>sql`${sql.identifier(alias)}.payload->'nativeAtlas'->'target'->>'kind'`;
  const birth=(alias:"v"|"p")=>sql`case ${targetKind(alias)}
    when 'town' then(select native_origin_version_id from world_town_map where world_id=${worldId} and id=${targetId(alias)})
    when 'floor' then(select native_origin_version_id from world_building_floor where world_id=${worldId} and id=${targetId(alias)})
    when 'underground' then(select native_origin_version_id from world_underground_level where world_id=${worldId} and id=${targetId(alias)})
    when 'craft' then(select native_origin_version_id from world_craft where world_id=${worldId} and id=${targetId(alias)})
    when 'deck' then(select native_origin_version_id from world_craft_deck where world_id=${worldId} and id=${targetId(alias)}) end`;
  const active=sql`case ${targetKind("v")}
    when 'terrain' then ${targetId("v")} in (${maps})
    when 'town' then exists(select 1 from world_town_map where world_id=${worldId} and id=${targetId("v")} and not archived and source_map_id in (${maps}) and context_map_id in (${maps}))
    when 'floor' then exists(select 1 from world_building_floor f join world_building_interior_source b on b.building_id=f.building_id and b.world_id=f.world_id join world_town_map t on t.id=b.town_map_id where f.world_id=${worldId} and f.id=${targetId("v")} and not f.archived and not t.archived and t.source_map_id in (${maps}) and t.context_map_id in (${maps}))
    when 'underground' then exists(select 1 from world_underground_level l join world_underground_site s on s.id=l.site_id and s.world_id=l.world_id where l.world_id=${worldId} and l.id=${targetId("v")} and not l.archived and not s.archived)
    when 'craft' then exists(select 1 from world_craft where world_id=${worldId} and id=${targetId("v")} and not archived)
    when 'deck' then exists(select 1 from world_craft_deck d join world_craft c on c.id=d.craft_id and c.world_id=d.world_id where d.world_id=${worldId} and d.id=${targetId("v")} and not d.archived and not c.archived)
    else false end`;
  // Do not import a public-looking appearance through a confidential dependency.
  // Only Primary History's ordinary closed source graph is inherited.
  const nativeVersions=sql`with recursive blocked(id) as (
    select v.id from world_map_state_version v where v.world_id=${worldId} and (v.protected or v.archived or v.timeline_id not in (${primary}) or not (${active}))
    union select p.id from blocked b join world_map_state_version p on p.world_id=${worldId} and (p.source_version_id=b.id or ${birth("p")}=b.id or exists(select 1 from world_map_state_native_dependency d where d.version_id=p.id and d.source_version_id=b.id))
  ), selected(id) as (
    select v.id from world_map_state_head h join world_map_state_version v on v.id=h.version_id where h.world_id=${worldId} and h.timeline_id in (${primary}) and v.map_id in (${maps}) and v.payload ? 'nativeAtlas' and v.id not in (select id from blocked)
    union select next.id from selected s join world_map_state_version v on v.id=s.id and v.world_id=${worldId}
      cross join lateral(select v.source_version_id id where v.source_version_id is not null union select ${birth("v")} where ${birth("v")} is not null union select d.source_version_id from world_map_state_native_dependency d where d.version_id=v.id and d.world_id=${worldId}
        union select pin.id from world_map_state_component_ref r join world_map_state_component c on c.id=r.component_id and c.world_id=r.world_id
          cross join lateral(${connectionPins}) pin(id)
          where r.version_id=v.id and r.world_id=${worldId} and ${ordinaryConnection} and pin.id is not null
            and exists(select 1 from world_map_state_version exact where exact.id=pin.id and exact.world_id=${worldId} and exact.id not in(select id from blocked))) next
  ) select id from selected`;
  const origin=sql`(native_origin_version_id is null or native_origin_version_id in (${nativeVersions}))`;
  const town=sql`select id from world_town_map where world_id=${worldId} and ${origin} and not archived and source_map_id in (${maps}) and context_map_id in (${maps})`;
  const buildings=sql`select distinct building_id from world_building_interior_source where world_id=${worldId} and town_map_id in (${town})`;
  const floor=sql`select id from world_building_floor where world_id=${worldId} and ${origin} and not archived and building_id in (${buildings})`;
  const underground=sql`select id from world_underground_level where world_id=${worldId} and ${origin} and not archived`;
  const craft=sql`select id from world_craft where world_id=${worldId} and ${origin} and not archived`;
  const deck=sql`select id from world_craft_deck where world_id=${worldId} and ${origin} and not archived and craft_id in (${craft})`;
  const geography=sql`select g.id from world_geography g where g.world_id=${worldId} and g.archived_at is null and (g.context in ('place','region','local area','settlement','building site') or g.id in(select place_id from world_underground_site where world_id=${worldId} and not archived)) and g.id not in (${privatePlaces})`;
  const plans:CanonGeographyPlan[]=[];
  const add=(table:string,key:string,where:SQL,batch=128)=>plans.push({table,key:sql.raw(`s.${key}::text`),source:sql`select s.* from ${sql.identifier(table)} s where s.world_id=${worldId} and ${where}`,batch});
  add("world_geography","id",sql`s.id in (${geography})`);
  add("world_atlas_map","id",sql`s.id in (${maps})`);
  plans.push({table:"world_terrain",key:sql`s.id`,batch:128,source:sql`select t.*,p.copy_revision __copy_revision from world_terrain t join (${numericPins}) p on p.id=t.id and p.revision=t.revision where t.world_id=${worldId}`});
  plans.push({table:"world_terrain_version",key:sql`s.terrain_id||':'||s.__copy_revision`,batch:128,source:sql`select v.*,p.copy_revision __copy_revision from world_terrain_version v join (${numericPins}) p on p.id=v.terrain_id and p.revision=v.revision and p.kind='root' where v.world_id=${worldId}`});
  plans.push({table:"world_terrain_tile",key:sql`s.terrain_id||':'||s.__copy_revision||':'||s.tile_x||':'||s.tile_y`,batch:256,source:sql`select distinct on(v.terrain_id,p.revision,v.tile_x,v.tile_y) v.*,p.copy_revision __copy_revision from world_terrain_tile v join (${numericPins}) p on p.id=v.terrain_id and p.kind='root' and v.revision<=p.revision where v.world_id=${worldId} order by v.terrain_id,p.revision,v.tile_x,v.tile_y,v.revision desc`});
  add("world_map_canvas","map_id",sql`s.map_id in (${maps})`);
  plans.push({table:"world_terrain_refinement",key:sql`s.id`,batch:128,source:sql`select r.*,p.copy_revision __copy_revision,parent.copy_revision __copy_parent_revision from world_terrain_refinement r join (${numericPins}) p on p.id=r.id and p.revision=r.revision join (${numericPins}) parent on parent.id=coalesce(r.parent_id,r.terrain_id) and parent.revision=r.parent_revision where r.world_id=${worldId}`});
  plans.push({table:"world_terrain_refinement_version",key:sql`s.refinement_id||':'||s.__copy_revision`,batch:128,source:sql`select v.*,p.copy_revision __copy_revision,parent.copy_revision __copy_parent_revision,root.copy_revision __copy_root_revision from world_terrain_refinement_version v join world_terrain_refinement r on r.id=v.refinement_id and r.world_id=v.world_id join (${numericPins}) p on p.id=v.refinement_id and p.revision=v.revision join (${numericPins}) parent on parent.id=coalesce(r.parent_id,r.terrain_id) and parent.revision=v.parent_revision join (${numericPins}) root on root.id=r.terrain_id and root.revision=v.root_revision where v.world_id=${worldId}`});
  plans.push({table:"world_terrain_refinement_tile",key:sql`s.refinement_id||':'||s.__copy_revision||':'||s.lod||':'||s.tile_x||':'||s.tile_y`,batch:256,source:sql`select distinct on(v.refinement_id,p.revision,v.lod,v.tile_x,v.tile_y) v.*,p.copy_revision __copy_revision from world_terrain_refinement_tile v join (${numericPins}) p on p.id=v.refinement_id and p.kind='detail' and v.revision<=p.revision where v.world_id=${worldId} order by v.refinement_id,p.revision,v.lod,v.tile_x,v.tile_y,v.revision desc`});
  add("world_map_region","map_id",sql`s.map_id in (${maps})`);
  add("world_map_region_footprint","map_id",sql`s.map_id in (${maps})`,1);
  add("world_region_hierarchy","map_id",sql`s.map_id in (${maps})`);
  for(const table of ["world_hydrology","world_environment","world_terrain_material","world_artwork","world_labels","world_map_appearance"])add(table,"map_id",sql`s.map_id in (${maps})`,1);
  add("world_map_style","id",sql`s.source_map_id in (${maps})`,1);
  add("world_atlas_feature","id",sql`s.map_id in (${maps}) and s.geography_id in (${geography}) and s.archived_at is null`);
  add("world_atlas_drawing","id",sql`s.map_id in (${maps}) and (s.geography_id is null or s.geography_id in (${geography})) and s.archived_at is null`,1);
  add("world_settlement_profile","geography_id",sql`s.geography_id in (${geography})`);
  add("world_town_place","geography_id",sql`s.geography_id in (${geography}) and s.town_id in (${geography})`);
  add("world_map_place","id",sql`s.map_id in (${maps}) and s.geography_id in (${geography}) and s.removed_at is null`);
  // Version envelopes depend only on the already-created numerical anchor and
  // timeline; born-in-history native identities may then reference these pins.
  add("world_map_state","id",sql`s.id in (select state_id from world_map_state_version where id in (${nativeVersions}))`);
  // Strict route accounts retain exact endpoint versions separately from the
  // manifest's general dependencies. Copy that ordinary closed source graph;
  // omit an account if even one of its retained geometry pins is unavailable.
  const ordinaryComponent=sql`coalesce(c.payload #>> '{draft,protected}','false')<>'true' and (not(${ordinaryConnection}) or not exists(select 1 from (${connectionPins}) pin(id) where pin.id is not null and pin.id not in(${nativeVersions})))`;
  const scoped=sql`case when (c.kind='conditions' and jsonb_array_length(coalesce(c.payload->'values','[]'::jsonb))>0) or (c.kind='connections' and c.payload ? 'connection') or (c.kind in ('connections','underground') and jsonb_array_length(coalesce(c.payload->'bundle'->'connections',c.payload->'connections','[]'::jsonb))>0) then r.version_id else '' end`;
  plans.push({table:"world_map_state_component",key:sql`s.id||case when s.__version_id='' then '' else ':'||s.__version_id end`,batch:1,source:sql`select distinct on(c.id,${scoped}) c.*,${scoped} __version_id from world_map_state_component c join world_map_state_component_ref r on r.component_id=c.id and r.world_id=c.world_id where c.world_id=${worldId} and r.version_id in (${nativeVersions}) and r.key<>'territories' and ${ordinaryComponent} order by c.id,${scoped}`});
  add("world_map_state_version","id",sql`s.id in (${nativeVersions})`,1);
  plans.push({table:"world_map_state_component_ref",key:sql`s.version_id||':'||s.key`,batch:128,source:sql`select s.* from world_map_state_component_ref s join world_map_state_component c on c.id=s.component_id and c.world_id=s.world_id where s.world_id=${worldId} and s.version_id in (${nativeVersions}) and s.key<>'territories' and ${ordinaryComponent}`});
  add("world_map_state_head","state_id",sql`s.version_id in (${nativeVersions}) and s.timeline_id in (${primary})`);
  plans.push({table:"world_map_state_native_dependency",key:sql`s.version_id||':'||s.source_version_id`,batch:128,source:sql`select s.* from world_map_state_native_dependency s where s.world_id=${worldId} and s.version_id in (${nativeVersions})`});
  plans.push({table:"world_map_state_geography",key:sql`s.version_id||':'||s.geography_id`,batch:128,source:sql`select s.* from world_map_state_geography s where s.world_id=${worldId} and s.version_id in (${nativeVersions}) and s.geography_id in (${geography})`});
  add("world_town_map","id",sql`s.id in (${town})`,1);
  add("world_building_interior","id",sql`s.id in (${buildings})`);
  add("world_building_interior_source","id",sql`s.building_id in (${buildings}) and s.town_map_id in (${town})`);
  add("world_building_floor","id",sql`s.id in (${floor})`,1);
  add("world_underground_site","id",sql`not s.archived and exists(select 1 from world_underground_level l where l.site_id=s.id and l.id in (${underground}))`);
  add("world_underground_level","id",sql`s.id in (${underground})`,1);
  add("world_craft","id",sql`s.id in (${craft})`,1);
  add("world_craft_deck","id",sql`s.id in (${deck})`,1);
  add("world_craft_placement","craft_id",sql`s.craft_id in (${craft}) and s.source_map_id in (${maps}) and not s.removed`);
  add("world_craft_connection","id",sql`s.craft_id in (${craft}) and not s.archived and (s.source='exterior' or s.source in (${deck})) and (s.destination='exterior' or s.destination in (${deck}))`);
  // Endpoint visibility is checked against the redacted native features while preparing.
  add("world_underground_connection","id",sql`not s.archived`,1);
  const surfaces=sql`select sf.id from world_geo_surface sf where sf.world_id=${worldId} and not sf.protected and sf.realm_id is null and exists(select 1 from world_geo_view v where v.surface_id=sf.id and v.map_id in (${maps}))`;
  add("world_geo_surface","id",sql`s.id in (${surfaces})`);
  add("world_geo_view","map_id",sql`s.map_id in (${maps}) and s.surface_id in (${surfaces})`);
  const geoFeatures=sql`select f.id from world_geo_feature f join world_geo_head h on h.feature_id=f.id join world_geo_version v on v.id=h.version_id where f.world_id=${worldId} and not v.protected and not v.archived and f.geography_id in (${geography}) and f.surface_id in (${surfaces})`;
  add("world_geo_dataset","id",sql`s.id in(select v.dataset_id from world_geo_version v join world_geo_head h on h.version_id=v.id where v.world_id=${worldId} and v.feature_id in (${geoFeatures}))`);
  add("world_geo_feature","id",sql`s.id in (${geoFeatures})`);
  plans.push({table:"world_geo_version",key:sql`s.id`,batch:1,source:sql`select v.* from world_geo_version v join world_geo_head h on h.version_id=v.id where v.world_id=${worldId} and v.feature_id in (${geoFeatures})`});
  add("world_geo_head","feature_id",sql`s.feature_id in (${geoFeatures})`);
  plans.push({table:"world_geo_part",key:sql`s.version_id||':'||s.part||':'||s.box`,batch:1,source:sql`select p.* from world_geo_part p join world_geo_head h on h.version_id=p.version_id where p.world_id=${worldId} and p.feature_id in (${geoFeatures})`});
  plans.push({table:"canon_landforms",key:sql`s.map_id`,batch:1,source:sql`select c.map_id,c.terrain_id from world_map_canvas c where c.world_id=${worldId} and c.purpose='world' and c.map_id in (${maps})`});
  return plans;
}
