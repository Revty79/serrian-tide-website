import "server-only";
import { sql, type SQL } from "drizzle-orm";

// Resolve only the selected timeline's heads. A missing/pending/excluded source
// never falls back to Primary History or the identity's origin timeline.
// Propagate secrecy through relationship references, including cycles, while
// leaving public profiles with independently private affiliations available.
export function ordinaryLoreSources(worldId: string, timelineId: string) {
  return sql`with recursive sources as materialized (
    select h.entity_id, v.id version_id, v.family, v.visibility, v.archived, h.mode
    from world_lore_head h join world_lore_version v on v.id=h.version_id
    where h.world_id=${worldId} and h.timeline_id=${timelineId}
  ), unavailable(entity_id) as (
    select s.entity_id from sources s
    where s.mode not in ('authored','inherited','interpretation') or s.visibility<>'ordinary'
      or (s.family='relationship' and exists (
        select 1 from world_lore_participant p
        left join sources target on target.entity_id=p.target_id
        where p.version_id=s.version_id and (
          p.protected or (p.target_id is not null and (target.entity_id is null or target.archived))
        )
      ))
    union
    select s.entity_id from unavailable u
    join world_lore_participant p on p.target_id=u.entity_id and p.world_id=${worldId}
    join sources s on s.version_id=p.version_id and s.family='relationship'
  )
  select s.entity_id, s.version_id from sources s
  where not exists (select 1 from unavailable u where u.entity_id=s.entity_id)`;
}

export function ordinaryLoreSource(worldId: string, timelineId: string, versionId: SQL) {
  return sql`${versionId} in (select ordinary_source.version_id from (${ordinaryLoreSources(worldId, timelineId)}) ordinary_source)`;
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
