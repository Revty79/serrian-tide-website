import "server-only";
import { sql, and, eq } from "drizzle-orm";
import { db } from "@/db";
import { worldHistoryHead, worldHistoryVersion } from "@/db/world-timeline-schema";
import { worldReadAccess, WorldError } from "./world-service";
import { selectedTimeline, type HistoryTx } from "./history-version-service";
import { inheritedProjection, HISTORY_LIMIT } from "./branching-history";
import { historyFilterSchema, type HistoryIndex } from "./history-index";
import { chronologicalEntries, type EntryRecord } from "./history";
import { ordinaryLoreSource, ordinaryHistorySource } from "./ordinary-knowledge";

// One metadata relation per selected source. No narrative graph traversal or per-entity reads.
function visibleLinks(worldId:string,timelineId:string,ordinary:boolean) {
  return sql`select l.version_id,l.target_id,l.entity_category,l.event_type,
    coalesce(g.name,s.name,p.name,o.name,r.name,cu.name,ci.name,la.name,po.name,b.name,tr.name,iv.name) name
    from world_history_version_entity l
    left join world_geography g on g.id=l.geography_id and g.world_id=l.world_id
    left join world_lore_identity i on i.id=l.lore_id and i.world_id=l.world_id
    left join world_lore_head ch on ch.entity_id=i.id and ch.world_id=l.world_id and ch.timeline_id=${timelineId}
    left join world_lore_head oh on oh.entity_id=i.id and oh.world_id=l.world_id and oh.timeline_id=i.origin_timeline_id
    left join world_lore_version v on v.id=coalesce(ch.version_id,oh.version_id)
    left join world_species_version s on s.version_id=v.id left join world_people_version p on p.version_id=v.id
    left join world_origin_version o on o.version_id=v.id left join world_relationship_version r on r.version_id=v.id
    left join world_culture_version cu on cu.version_id=v.id left join world_civilization_version ci on ci.version_id=v.id
    left join world_language_version la on la.version_id=v.id left join world_population_version po on po.version_id=v.id
    left join world_belief_version b on b.version_id=v.id left join world_tradition_version tr on tr.version_id=v.id left join world_individual_version iv on iv.version_id=v.id
    where l.world_id=${worldId} and exists(select 1 from world_history_head selected where selected.world_id=l.world_id and selected.timeline_id=${timelineId} and selected.version_id=l.version_id and selected.mode in ('authored','inherited','partial','interpretation')) and ${ordinary?sql`(
      (l.geography_id is not null and not exists(select 1 from world_dungeon_entity d where d.world_id=l.world_id and d.visibility<>'ordinary' and (d.id=g.id or d.geography_id=g.id)))
      or (l.lore_id is not null and ${ordinaryLoreSource(worldId,timelineId,sql`ch.version_id`)}))`:sql`true`}`;
}
export async function historyEntryInTransaction(tx:HistoryTx,worldId:string,timelineId:string,id:string,ordinary=false) {
  const [row]=await tx.select({h:worldHistoryHead,v:worldHistoryVersion}).from(worldHistoryHead).innerJoin(worldHistoryVersion,eq(worldHistoryVersion.id,worldHistoryHead.versionId)).where(and(eq(worldHistoryHead.worldId,worldId),eq(worldHistoryHead.timelineId,timelineId),eq(worldHistoryHead.entityId,id),ordinary?ordinaryHistorySource(worldId,timelineId,sql`${worldHistoryVersion.id}`):undefined));
  if(!row?.v.entryId||["pending","excluded"].includes(row.h.mode)||(ordinary&&(row.v.payload as EntryRecord).visibility==="protected"))throw new WorldError("This historical account is unavailable.",404);
  const record=inheritedProjection({...row.v.payload,revision:row.h.revision},{mode:row.h.mode,timelineId,versionId:row.v.id,sourceTimelineId:row.h.sourceTimelineId,sourceVersionId:row.h.sourceVersionId,sourceRevision:row.h.sourceRevision,coveredUntil:row.h.coveredUntil,newerParent:false,parentRevision:null,parentVersionId:null}) as EntryRecord;
  return {...record,...ordinary?{notes:""}: {}};
}
export async function historyEntry(userId:string,worldId:string,timelineId:string,id:string,review=false,ordinary=false) {
  await worldReadAccess(userId,worldId,review);
  return db.transaction(async tx=>{await selectedTimeline(tx,worldId,timelineId);return historyEntryInTransaction(tx,worldId,timelineId,id,ordinary);},{isolationLevel:"repeatable read",accessMode:"read only"});
}
export async function searchHistory(userId:string,worldId:string,timelineId:string,input:unknown,review=false,ordinary=false):Promise<HistoryIndex> {
  await worldReadAccess(userId,worldId,review);
  const f=historyFilterSchema.parse(input);
  return db.transaction(async tx=>{
    await selectedTimeline(tx,worldId,timelineId);
    const base=sql`h.world_id=${worldId} and h.timeline_id=${timelineId} and h.mode in ('authored','inherited','partial','interpretation') and v.entry_id is not null and ${ordinary?ordinaryHistorySource(worldId,timelineId,sql`v.id`):sql`true`}`;
    const facets=(await tx.execute<{category:string|null;event_type:string|null}>(sql`with visible_links as (${visibleLinks(worldId,timelineId,ordinary)}) select distinct l.entity_category category,l.event_type from world_history_head h join world_history_version v on v.id=h.version_id join visible_links l on l.version_id=v.id where ${base} union select distinct null category,v.payload->>'eventType' event_type from world_history_head h join world_history_version v on v.id=h.version_id where ${base} and length(coalesce(v.payload->>'eventType',''))>0 limit 2000`)).rows;
    // Approximate dates match their authored anchor only; no precision tolerance is invented.
    const start=sql`coalesce((v.payload->'time'->>'year')::numeric,(v.payload->'time'->>'startYear')::numeric)`;
    const end=sql`coalesce((v.payload->'time'->>'year')::numeric,(v.payload->'time'->>'endYear')::numeric)`;
    const periodEnd=sql`case when h.mode='partial' and h.covered_until is not null then least(${end},h.covered_until) else ${end} end`;
    const conditions=[base,sql`coalesce((v.payload->>'archived')::boolean,false)=${f.archived}`];
    if(f.hiddenCategories.length)conditions.push(sql`(not exists(select 1 from visible_links l where l.version_id=v.id) or exists(select 1 from visible_links l where l.version_id=v.id and l.entity_category not in (${sql.join(f.hiddenCategories.map(c=>sql`${c}`),sql`,`)})))`);
    if(f.category)conditions.push(f.category==="unlinked"?sql`not exists(select 1 from visible_links l where l.version_id=v.id)`:sql`exists(select 1 from visible_links l where l.version_id=v.id and ${f.category==="geography"?sql`exists(select 1 from world_history_version_entity ge where ge.version_id=l.version_id and ge.target_id=l.target_id and ge.geography_id is not null)`:sql`l.entity_category=${f.category}`})`);
    if(f.eventType)conditions.push(sql`(lower(v.payload->>'eventType')=lower(${f.eventType}) or exists(select 1 from visible_links l where l.version_id=v.id and lower(l.event_type)=lower(${f.eventType})))`);
    if(f.era)conditions.push(f.era==="none"?sql`not exists(select 1 from world_history_version_era e where e.version_id=v.id)`:sql`exists(select 1 from world_history_version_era e where e.version_id=v.id and e.era_id=${f.era})`);
    if(f.accuracy)conditions.push(sql`v.payload->>'accuracy'=${f.accuracy}`);
    if(f.narrative)conditions.push(sql`v.payload->>'narrative'=${f.narrative}`);
    if(f.dateKind)conditions.push(sql`v.payload->'time'->>'kind'=${f.dateKind}`);
    if(f.from!==undefined)conditions.push(sql`${periodEnd}>=${f.from}`);
    if(f.to!==undefined)conditions.push(sql`${start}<=${f.to}`);
    if(f.q)conditions.push(sql`(to_tsvector('simple',coalesce(v.payload->>'title','') || ' ' || coalesce(v.payload->>'account','') || ' ' || ${ordinary?sql`''`:sql`coalesce(v.payload->>'notes','')`}) @@ plainto_tsquery('simple',${f.q}) or strpos(lower(concat_ws(' ',v.payload->>'title',v.payload->>'account',${ordinary?sql`''`:sql`v.payload->>'notes'`})),lower(${f.q}))>0 or exists(select 1 from visible_links l where l.version_id=v.id and strpos(lower(l.name),lower(${f.q}))>0))`);
    const rows=(await tx.execute<{payload:EntryRecord;revision:number;mode:string;covered_until:number|null}>(sql`with visible_links as (${visibleLinks(worldId,timelineId,ordinary)}) select
      (v.payload - 'notes' - 'account' - 'calendarSource' - 'sourceDating') || jsonb_build_object('account',left(v.payload->>'account',300),'notes','') payload,h.revision,h.mode,h.covered_until
      from world_history_head h join world_history_version v on v.id=h.version_id where ${sql.join(conditions,sql` and `)} order by ${start} nulls last,${periodEnd} nulls last,v.payload->>'title',h.entity_id limit ${HISTORY_LIMIT+1}`)).rows;
    if(rows.length>HISTORY_LIMIT)throw new WorldError("This history exceeds its retained record limit.",400);
    const entries=rows.map(row=>{const entry={...row.payload,revision:row.revision};if(row.mode==="partial"&&row.covered_until!==null&&entry.time.kind==="duration")entry.time={...entry.time,endYear:Math.min(entry.time.endYear,Number(row.covered_until))};return entry;});
    return {entries:chronologicalEntries(entries),categories:[...new Set(facets.flatMap(r=>r.category?[r.category]:[]))].sort(),eventTypes:[...new Set(facets.flatMap(r=>r.event_type?[r.event_type]:[]))].sort()};
  },{isolationLevel:"repeatable read",accessMode:"read only"});
}
