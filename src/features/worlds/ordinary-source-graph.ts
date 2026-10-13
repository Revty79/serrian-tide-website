import { geographicPrivatePlaces } from "./geographic-privacy";
import "server-only";
import { sql, type SQL } from "drizzle-orm";

// Resolve secrecy on source versions, not just identities: a public retelling
// cannot release an older protected original or bypass its current protection.
// UNION makes contradictory/cyclic story and History references terminate.
export function ordinaryWorldSources(worldId: string, timelineId: string, pinnedLore?: SQL) {
  const relationships = sql`('relationship','appointment','claim','agreement','conflict','organizationRole','membership','assignment','network','cosmicPrinciple','cosmicConnection','skyCycle','skyObservation','skyCalendarLink','story')`;
  return sql`with recursive
  lore_heads as materialized (
    select h.entity_id,h.version_id,h.mode,v.archived from world_lore_head h
    join world_lore_version v on v.id=h.version_id where h.world_id=${worldId} and h.timeline_id=${timelineId}
  ), history_heads as materialized (
    select entity_id,version_id,mode from world_history_head where world_id=${worldId} and timeline_id=${timelineId}
  ), hidden_places(id) as (
    select coalesce(d.geography_id,d.id) from world_dungeon_entity d where d.world_id=${worldId} and d.visibility<>'ordinary'
    union select id from (${geographicPrivatePlaces(worldId)}) geo_private(id)
    union select g.id from world_geography g join hidden_places p on g.parent_id=p.id where g.world_id=${worldId}
  ), edges(source_kind,source_id,target_kind,target_id) as materialized (
    select 'lore',p.version_id,'lore',h.version_id from world_lore_participant p
    join world_lore_version v on v.id=p.version_id join lore_heads h on h.entity_id=p.target_id
    where p.world_id=${worldId} and v.family in ${relationships}
    union all select 'lore',s.version_id,'lore',s.source_version_id from world_story_source s where s.world_id=${worldId}
    union all select 'lore',r.version_id,'history',r.history_version_id from world_lore_history r
      join world_lore_version v on v.id=r.version_id where r.world_id=${worldId} and v.family='story'
    union all select 'history',l.version_id,'lore',h.version_id from world_history_version_entity l
      join lore_heads h on h.entity_id=l.lore_id where l.world_id=${worldId}
    union all select 'lore',v.id,'lore',h.version_id from world_lore_version v
      join lore_heads h on h.entity_id=v.entity_id where v.world_id=${worldId} and v.id<>h.version_id
    union all select 'history',v.id,'history',h.version_id from world_history_version v
      join history_heads h on h.entity_id=v.entity_id where v.world_id=${worldId} and v.id<>h.version_id
  ), reachable(kind,version_id) as (
    select 'lore',version_id from lore_heads
    union select 'history',id from world_history_version where world_id=${worldId}
    ${pinnedLore ? sql`union select 'lore',id from world_lore_version where world_id=${worldId} and id=${pinnedLore}` : sql``}
    union select e.target_kind,e.target_id from reachable r join edges e on e.source_kind=r.kind and e.source_id=r.version_id
  ), blocked_seed(kind,version_id) as materialized (
    select 'lore',v.id from reachable r join world_lore_version v on r.kind='lore' and r.version_id=v.id
    left join lore_heads h on h.entity_id=v.entity_id
    where h.entity_id is null or h.mode not in ('authored','inherited','interpretation') or v.visibility<>'ordinary'
      or (v.family in ('skyCycle','skyObservation','skyCalendarLink','story') and exists(select 1 from world_lore_display d where d.version_id=v.id and jsonb_array_length(d.protected_fields)>0))
      or (v.family in ('skyCycle','skyObservation','skyCalendarLink') and exists(select 1 from world_sky_calendar_binding b join world_calendar_version cv on cv.id=b.calendar_version_id join world_calendar c on c.id=cv.calendar_id where b.version_id=v.id and (b.protected or c.visibility<>'ordinary')))
      or exists(select 1 from world_calendar_version cv join world_calendar c on c.id=cv.calendar_id where (cv.id=v.start_version_id or cv.id=v.end_version_id) and c.visibility<>'ordinary')
      or exists(select 1 from world_sky_rule a join world_calendar_version cv on cv.id=a.anchor_version_id join world_calendar c on c.id=cv.calendar_id where a.version_id=v.id and c.visibility<>'ordinary')
      or (v.family in ${relationships} and exists(select 1 from world_lore_participant p left join lore_heads target on target.entity_id=p.target_id where p.version_id=v.id and (p.protected or (p.target_id is not null and (target.entity_id is null or target.archived)))))
      or (v.family in ('appointment','claim','agreement','conflict','organizationRole','membership','assignment','network','cosmicPrinciple','cosmicConnection','skyCycle','skyObservation','skyCalendarLink') and exists(select 1 from world_lore_geography a where a.version_id=v.id and (a.protected or a.geography_id in (select id from hidden_places) or a.destination_id in (select id from hidden_places) or exists(select 1 from world_dungeon_entity d where d.world_id=a.world_id and d.visibility<>'ordinary' and (d.id=a.geography_id or d.geography_id=a.geography_id or d.id=a.destination_id or d.geography_id=a.destination_id)))))
      or (v.family='story' and (
        exists(select 1 from world_lore_section a where a.version_id=v.id and a.protected)
        or exists(select 1 from world_lore_period a where a.version_id=v.id and a.protected)
        or exists(select 1 from world_lore_geography a where a.version_id=v.id and (a.protected or a.geography_id in (select id from hidden_places) or a.destination_id in (select id from hidden_places)))
        or exists(select 1 from world_story_source a where a.version_id=v.id and a.protected)
        or exists(select 1 from world_story_context a where a.version_id=v.id and (a.protected or exists(select 1 from world_calendar_version cv join world_calendar c on c.id=cv.calendar_id where (cv.id=a.start_version_id or cv.id=a.end_version_id) and c.visibility<>'ordinary')))
      ))
    union all
    select 'history',v.id from reachable r join world_history_version v on r.kind='history' and r.version_id=v.id
    left join history_heads h on h.entity_id=v.entity_id
    where h.entity_id is null or h.mode not in ('authored','inherited','partial','interpretation')
      or coalesce(v.payload->>'visibility','ordinary')<>'ordinary'
      or exists(select 1 from world_calendar_version cv join world_calendar c on c.id=cv.calendar_id where (cv.id=v.start_version_id or cv.id=v.end_version_id) and c.visibility<>'ordinary')
      or exists(select 1 from world_history_version_entity l where l.version_id=v.id and (
        (l.lore_id is not null and not exists(select 1 from lore_heads target where target.entity_id=l.lore_id))
        or (l.geography_id in (select id from hidden_places)) or (l.geography_id is not null and exists(select 1 from world_dungeon_entity d where d.world_id=${worldId} and d.visibility<>'ordinary' and (d.id=l.geography_id or d.geography_id=l.geography_id)))
      ))
  ), blocked(kind,version_id) as (
    select kind,version_id from blocked_seed
    union select e.source_kind,e.source_id from blocked b join edges e on e.target_kind=b.kind and e.target_id=b.version_id
  )
  select r.kind,r.version_id,coalesce(l.entity_id,h.entity_id) entity_id from reachable r
  left join world_lore_version l on r.kind='lore' and l.id=r.version_id
  left join world_history_version h on r.kind='history' and h.id=r.version_id
  where not exists(select 1 from blocked b where b.kind=r.kind and b.version_id=r.version_id)`;
}
