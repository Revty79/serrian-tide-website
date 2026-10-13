import "server-only";
import { sql, type SQL } from "drizzle-orm";

// Existing ordinary readers do not all carry a Realm's exact lore context.
// Keep new Realm-coordinate places private on those paths; the geographic
// owner/review reader validates the selected Realm before opening its frame.
export function geographicPrivatePlaces(worldId:string|SQL){return sql`with recursive geo_hidden(id) as (select gf.geography_id from world_geo_feature gf join world_geo_head gh on gh.feature_id=gf.id and gh.world_id=gf.world_id join world_geo_version gv on gv.id=gh.version_id join world_geo_surface gs on gs.id=gf.surface_id and gs.world_id=gf.world_id where gf.world_id=${worldId} and (gv.protected or gs.protected or gs.realm_id is not null) union select coalesce(d.geography_id,d.id) from world_dungeon_entity d where d.world_id=${worldId} and d.visibility<>'ordinary' union select g.id from world_geography g join geo_hidden p on g.parent_id=p.id where g.world_id=${worldId}) select id from geo_hidden`;}
export function geographicPrivateMaps(worldId:string){return sql`select gm.map_id from world_geo_view gm join world_geo_surface gs on gs.id=gm.surface_id and gs.world_id=gm.world_id where gm.world_id=${worldId} and (gs.protected or gs.realm_id is not null)`;}
