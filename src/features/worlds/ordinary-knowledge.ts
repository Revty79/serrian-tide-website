import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { ordinaryWorldSources } from "./ordinary-source-graph";

// Resolve only the selected timeline's heads. A missing/pending/excluded source
// never falls back to Primary History or the identity's origin timeline.
// Propagate secrecy through relationship references, including cycles, while
// leaving public profiles with independently private affiliations available.
export function ordinaryLoreSources(worldId: string, timelineId: string, pinnedVersion?: SQL) {
  return sql`select s.entity_id,s.version_id from (${ordinaryWorldSources(worldId,timelineId,pinnedVersion)}) s
    join world_lore_head h on h.entity_id=s.entity_id and h.world_id=${worldId} and h.timeline_id=${timelineId}
    where s.kind='lore' and s.version_id=${pinnedVersion ? sql`case when h.entity_id=(select entity_id from world_lore_version where id=${pinnedVersion} and world_id=${worldId}) then ${pinnedVersion} else h.version_id end` : sql`h.version_id`}`;
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
  return sql`${versionId} in (select s.version_id from (${ordinaryWorldSources(worldId,timelineId)}) s where s.kind='history')`;
}
