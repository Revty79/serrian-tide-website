import "server-only";
import { sql, type SQL } from "drizzle-orm";

// Resolve only the selected timeline's heads. A missing/pending/excluded source
// never falls back to Primary History or the identity's origin timeline.
// Propagate secrecy through relationship references, including cycles, while
// leaving public profiles with independently private affiliations available.
export function ordinaryLoreSources(worldId: string, timelineId: string, pinnedVersion?: SQL) {
  return sql`with recursive sources as materialized (
    select h.entity_id, v.id version_id, v.family, v.visibility, v.archived, h.mode
    from world_lore_head h join world_lore_version v on v.id=${pinnedVersion ? sql`case when h.entity_id=(select entity_id from world_lore_version where id=${pinnedVersion} and world_id=${worldId}) then ${pinnedVersion} else h.version_id end` : sql`h.version_id`}
    where h.world_id=${worldId} and h.timeline_id=${timelineId}
  ), unavailable(entity_id) as (
    select s.entity_id from sources s
    where s.mode not in ('authored','inherited','interpretation') or s.visibility<>'ordinary'
      or (s.family in ('skyCycle','skyObservation','skyCalendarLink') and exists(select 1 from world_lore_display d where d.version_id=s.version_id and jsonb_array_length(d.protected_fields)>0))
      or (s.family in ('skyCycle','skyObservation','skyCalendarLink') and exists(select 1 from world_sky_calendar_binding b join world_calendar_version cv on cv.id=b.calendar_version_id join world_calendar c on c.id=cv.calendar_id where b.version_id=s.version_id and (b.protected or c.visibility<>'ordinary')))
      or exists(select 1 from world_lore_version v join world_calendar_version cv on cv.id=v.start_version_id or cv.id=v.end_version_id join world_calendar c on c.id=cv.calendar_id where v.id=s.version_id and c.visibility<>'ordinary')
      or exists(select 1 from world_sky_rule r join world_calendar_version cv on cv.id=r.anchor_version_id join world_calendar c on c.id=cv.calendar_id where r.version_id=s.version_id and c.visibility<>'ordinary')
      or (s.family in ('relationship','appointment','claim','agreement','conflict','organizationRole','membership','assignment','network','cosmicPrinciple','cosmicConnection','skyCycle','skyObservation','skyCalendarLink') and exists (
        select 1 from world_lore_participant p
        left join sources target on target.entity_id=p.target_id
        where p.version_id=s.version_id and (
          p.protected or (p.target_id is not null and (target.entity_id is null or target.archived))
        )
      ))
      or (s.family in ('appointment','claim','agreement','conflict','organizationRole','membership','assignment','network','cosmicPrinciple','cosmicConnection','skyCycle','skyObservation','skyCalendarLink') and exists (select 1 from world_lore_geography a where a.version_id=s.version_id and (a.protected or exists(select 1 from world_dungeon_entity d where d.world_id=a.world_id and d.visibility<>'ordinary' and (d.id=a.geography_id or d.geography_id=a.geography_id or d.id=a.destination_id or d.geography_id=a.destination_id)))))
    union
    select s.entity_id from unavailable u
    join world_lore_participant p on p.target_id=u.entity_id and p.world_id=${worldId}
    join sources s on s.version_id=p.version_id and s.family in ('relationship','appointment','claim','agreement','conflict','organizationRole','membership','assignment','network','cosmicPrinciple','cosmicConnection','skyCycle','skyObservation','skyCalendarLink')
  )
  select s.entity_id, s.version_id from sources s
  where not exists (select 1 from unavailable u where u.entity_id=s.entity_id)`;
}

export function ordinaryLoreSource(worldId: string, timelineId: string, versionId: SQL) {
  return sql`${versionId} in (select ordinary_source.version_id from (${ordinaryLoreSources(worldId, timelineId)}) ordinary_source)`;
}

// A bridge retains its original source. Evaluate that source through the same
// recursive privacy rules and also require the selected effective source.
export function ordinaryLorePinnedSource(worldId: string, timelineId: string, versionId: SQL) {
  return sql`${versionId} in (select p.version_id from (${ordinaryLoreSources(worldId,timelineId,versionId)}) p)
    and exists(select 1 from world_lore_version pinned join world_lore_head h on h.entity_id=pinned.entity_id and h.world_id=pinned.world_id and h.timeline_id=${timelineId}
      where pinned.id=${versionId} and ${ordinaryLoreSource(worldId,timelineId,sql`h.version_id`)})
    and not exists(
      with recursive hidden(id) as (
        select coalesce(d.geography_id,d.id) from world_dungeon_entity d where d.world_id=${worldId} and d.visibility<>'ordinary'
        union select g.id from world_geography g join hidden h on g.parent_id=h.id where g.world_id=${worldId}
      ) select 1 from world_lore_geography g
      where (g.version_id=${versionId} or g.version_id in (select h.version_id from world_lore_head h join world_lore_version p on p.entity_id=h.entity_id and p.world_id=h.world_id where p.id=${versionId} and h.timeline_id=${timelineId}))
        and (g.protected or g.geography_id in (select id from hidden) or g.destination_id in (select id from hidden)))`;
}

// Withhold the complete historical narrative if any saved link is sensitive.
// Stripping a linked name cannot make an arbitrary event title/account safe.
// A retained old pin must be safe itself AND have an available, safe effective
// event in this timeline; older sources cannot bypass a later privacy decision.
export function ordinaryHistorySource(worldId: string, timelineId: string, versionId: SQL) {
  return sql`${versionId} in (
    with ordinary_lore as materialized (${ordinaryLoreSources(worldId, timelineId)}),
    safe_sources as materialized (
      select v.id, v.entity_id from world_history_version v
      where v.world_id=${worldId} and coalesce(v.payload->>'visibility','ordinary')='ordinary'
        and not exists(select 1 from world_calendar_version cv join world_calendar c on c.id=cv.calendar_id where (cv.id=v.start_version_id or cv.id=v.end_version_id) and c.visibility<>'ordinary')
        and not exists (
          select 1 from world_history_version_entity l where l.version_id=v.id and (
            (l.lore_id is not null and not exists (select 1 from ordinary_lore o where o.entity_id=l.lore_id))
            or (l.geography_id is not null and exists (
              select 1 from world_dungeon_entity d where d.world_id=${worldId}
                and d.visibility<>'ordinary' and (d.id=l.geography_id or d.geography_id=l.geography_id)
            ))
          )
        )
    )
    select pinned.id from safe_sources pinned
    join world_history_head h on h.entity_id=pinned.entity_id and h.world_id=${worldId} and h.timeline_id=${timelineId}
    join safe_sources effective on effective.id=h.version_id
    where h.mode in ('authored','inherited','partial','interpretation')
  )`;
}
