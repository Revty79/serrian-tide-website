import "server-only";
import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { worldCalendar, worldCalendarVersion } from "@/db/world-calendar-schema";
import { worldCalendarAdoption } from "@/db/world-calendar-history-schema";
import { worldDatingSystem } from "@/db/world-schema";
import { worldAtlasMap } from "@/db/world-atlas-schema";
import { worldLoreHead, worldLoreVersion, worldLoreDisplay } from "@/db/world-peoples-schema";
import { worldLinkIdentity as identity, worldLinkVersion as version, worldLinkHead as head } from "@/db/world-linking-schema";
import { worldReadAccess, worldWriteTransaction, WorldError } from "./world-service";
import { selectedTimeline, type HistoryTx } from "./history-version-service";
import { ordinaryLoreSource, ordinaryLorePinnedSource } from "./ordinary-knowledge";
import { isSocietyFamily, linkCommandSchema, type LinkBundle, type LinkDraft, type LinkSource, type WorldLink } from "./linking";
const unavailable = () => new WorldError("This connection or its saved source is unavailable in this timeline.",404);
const conflict = () => new WorldError("A newer connection was saved in another tab. Your draft is retained. Load the latest connection before saving again.",409);
const usableModes = ["authored", "inherited", "interpretation"];

// Match Atlas's server projection: a map attached to a protected place or any
// descendant of it cannot disclose its name through a bridge or its selectors.
function ordinaryMap(worldId: string) {
  return sql`not exists(with recursive hidden(id) as (
    select d.geography_id from world_dungeon_entity d where d.world_id=${worldId} and d.visibility<>'ordinary' and d.geography_id is not null
    union select g.id from world_geography g join hidden h on g.parent_id=h.id where g.world_id=${worldId}
  ) select 1 from hidden where id=${worldAtlasMap.geographyId})`;
}
async function choices(tx: HistoryTx,worldId:string,timelineId:string,ordinary:boolean,primary:boolean):Promise<LinkBundle["choices"]> {
  const lore=await tx.select({id:worldLoreHead.entityId,versionId:worldLoreHead.versionId,revision:worldLoreHead.revision,name:worldLoreDisplay.name,family:worldLoreVersion.family,archived:worldLoreVersion.archived,mode:worldLoreHead.mode}).from(worldLoreHead)
    .innerJoin(worldLoreVersion,eq(worldLoreHead.versionId,worldLoreVersion.id)).innerJoin(worldLoreDisplay,eq(worldLoreDisplay.versionId,worldLoreVersion.id))
    .where(and(eq(worldLoreHead.worldId,worldId),eq(worldLoreHead.timelineId,timelineId),ordinary?ordinaryLoreSource(worldId,timelineId,sql`${worldLoreVersion.id}`):undefined)).orderBy(asc(worldLoreDisplay.name)).limit(2001);
  const maps=await tx.select().from(worldAtlasMap).where(and(eq(worldAtlasMap.worldId,worldId),ordinary?ordinaryMap(worldId):undefined)).orderBy(asc(worldAtlasMap.name)).limit(2001);
  const calendars=await tx.select().from(worldCalendar).where(and(eq(worldCalendar.worldId,worldId),ordinary?eq(worldCalendar.visibility,"ordinary"):undefined)).orderBy(asc(worldCalendar.name)).limit(2001);
  const versions=await tx.select().from(worldCalendarVersion).where(and(eq(worldCalendarVersion.worldId,worldId),ordinary?sql`exists(select 1 from world_calendar c where c.id=${worldCalendarVersion.calendarId} and c.world_id=${worldId} and c.visibility='ordinary')`:undefined)).orderBy(asc(worldCalendarVersion.createdAt)).limit(2001);
  const dating=await tx.select().from(worldDatingSystem).where(eq(worldDatingSystem.worldId,worldId)).orderBy(asc(worldDatingSystem.name)).limit(2001);
  const adoptions=primary?await tx.select().from(worldCalendarAdoption).where(and(eq(worldCalendarAdoption.worldId,worldId),ordinary?sql`exists(select 1 from world_calendar_version cv join world_calendar c on c.id=cv.calendar_id where cv.id=${worldCalendarAdoption.versionId} and c.world_id=${worldId} and c.visibility='ordinary')`:undefined)).orderBy(asc(worldCalendarAdoption.createdAt)).limit(2001):[];
  if([lore,maps,calendars,versions,dating,adoptions].some(rows=>rows.length>2000))throw new WorldError("Too many records to open these saved connections safely. Narrow the World archive before continuing.",409);
  const calendarIds=new Set(calendars.map(c=>c.id)),safeVersions=versions.filter(v=>calendarIds.has(v.calendarId)),versionIds=new Set(safeVersions.map(v=>v.id));
  return {
    lore:lore.filter(l=>usableModes.includes(l.mode)&&(l.family==="realm"||isSocietyFamily(l.family))).map(l=>({...l,context:l.family})),
    maps:maps.map(m=>({id:m.id,name:m.name,context:`${m.scope} · ${m.mapKind} map`,revision:m.revision,archived:!!m.archivedAt})),
    calendars:calendars.map(c=>({id:c.id,name:c.name,context:"Continuing calendar tradition",revision:c.revision,archived:!!c.archivedAt})),
    versions:safeVersions.map(v=>({id:v.id,calendarId:v.calendarId,name:v.title,context:`Rules revision ${v.revision}`,revision:v.revision,archived:!!v.archivedAt})),
    dating:dating.map(d=>({id:d.id,name:d.name,context:`${d.numbering==="year-zero"?"Includes Year 0":"Skips Year 0"} · epoch ${d.epochYear}`,revision:d.revision,archived:!!d.archivedAt})),
    adoptions:adoptions.filter(a=>versionIds.has(a.versionId)).map(a=>({id:a.id,versionId:a.versionId,name:a.label,context:"Existing calendar adoption and period",revision:a.revision,archived:!!a.archivedAt})),
  };
}
async function rows(tx:HistoryTx,worldId:string,timelineId:string,ordinary:boolean,primary:boolean,refs:LinkBundle["choices"]):Promise<WorldLink[]> {
  const found=await tx.select({head,version}).from(head).innerJoin(version,eq(head.versionId,version.id)).where(and(eq(head.worldId,worldId),eq(head.timelineId,timelineId),ordinary?sql`
    ${version.draft}->>'visibility'='ordinary' and ${head.mode}<>'excluded'
    and ${ordinaryLorePinnedSource(worldId,timelineId,sql`${version.loreVersionId}`)}
    and coalesce(${version.source}->'target'->>'visibility','ordinary')='ordinary'
    and (${version.mapId} is null or exists(select 1 from world_atlas_map where id=${version.mapId} and world_id=${worldId} and ${ordinaryMap(worldId)}))
    and (${version.calendarId} is null or exists(select 1 from world_calendar c where c.id=${version.calendarId} and c.world_id=${worldId} and c.visibility='ordinary'))
    and (${version.adoptionId} is null or ${primary})`:undefined)).orderBy(asc(version.createdAt),asc(head.linkId)).limit(2001);
  if(found.length>2000)throw new WorldError("Too many connections to open this archive safely.",409);
  const result:WorldLink[]=[];
  for(const {head:h,version:v} of found){
    const lore=refs.lore.find(l=>l.id===v.loreId),target=v.mapId?refs.maps.find(m=>m.id===v.mapId):v.calendarId?refs.calendars.find(c=>c.id===v.calendarId):refs.dating.find(d=>d.id===v.datingSystemId);
    const safeRules=!v.calendarVersionId||refs.versions.some(r=>r.id===v.calendarVersionId);
    // Do not resurrect Primary-only adoption accounts in a different timeline.
    if(ordinary&&(!lore||!target||!safeRules||v.source.target.visibility==="protected"||v.adoptionId&&!primary))continue;
    const adoption=v.adoptionId&&primary?(await tx.select().from(worldCalendarAdoption).where(and(eq(worldCalendarAdoption.id,v.adoptionId),eq(worldCalendarAdoption.worldId,worldId))))[0]:undefined;
    if(ordinary&&v.adoptionId&&!adoption)continue;
    result.push({id:h.linkId,versionId:v.id,timelineId,revision:h.revision,mode:h.mode,archived:v.archived,draft:v.draft,source:v.source,currentLoreName:lore?.name??v.source.lore.name,currentTargetName:target?.name??v.source.target.name,unavailable:!lore||!target||!safeRules||!!lore.archived||!!target.archived||!!v.adoptionId&&!primary,...adoption?{adoption:{label:adoption.label,revision:adoption.revision,archived:!!adoption.archivedAt,period:adoption.period}}:{}});
  }
  return result;
}
export async function getWorldLinks(userId:string,worldId:string,timelineId:string,review=false,ordinary=false):Promise<LinkBundle> {
  const parent=await worldReadAccess(userId,worldId,review);
  return db.transaction(async tx=>{
    const timeline=await selectedTimeline(tx,worldId,timelineId),refs=await choices(tx,worldId,timelineId,ordinary,timeline.primary);
    const links=await rows(tx,worldId,timelineId,ordinary,timeline.primary,refs);
    const parentLinks:WorldLink[]=[];
    if(!ordinary&&timeline.parentId){const sourceTimeline=await selectedTimeline(tx,worldId,timeline.parentId),sourceRefs=await choices(tx,worldId,sourceTimeline.id,false,sourceTimeline.primary);parentLinks.push(...(await rows(tx,worldId,sourceTimeline.id,false,sourceTimeline.primary,sourceRefs)).filter(l=>l.mode!=="excluded"&&!l.archived));}
    return {worldId,timelineId,canEdit:parent.ownerId===userId&&!parent.archivedAt&&!timeline.archivedAt&&!review&&!ordinary,links,parentLinks,choices:refs};
  },{isolationLevel:"repeatable read",accessMode:"read only"});
}
async function sourceFor(tx:HistoryTx,worldId:string,timelineId:string,draft:LinkDraft,primary:boolean):Promise<LinkSource> {
  const refs=await choices(tx,worldId,timelineId,false,primary),lore=refs.lore.find(l=>l.id===draft.loreId&&!l.archived);
  if(!lore||!lore.versionId||!lore.family||(draft.kind==="realm-map"?lore.family!=="realm":!isSocietyFamily(lore.family)))throw unavailable();
  let target:LinkSource["target"];
  if(draft.kind==="realm-map"){
    const map=refs.maps.find(m=>m.id===draft.mapId&&!m.archived);if(!map)throw unavailable();target={id:map.id,name:map.name,revision:map.revision};
  }else if(draft.calendarId){
    const [calendar]=await tx.select().from(worldCalendar).where(and(eq(worldCalendar.worldId,worldId),eq(worldCalendar.id,draft.calendarId)));if(!calendar||calendar.archivedAt)throw unavailable();
    target={id:calendar.id,name:calendar.name,revision:calendar.revision,visibility:calendar.visibility};
    if(draft.calendarVersionId){const [rules]=await tx.select().from(worldCalendarVersion).where(and(eq(worldCalendarVersion.worldId,worldId),eq(worldCalendarVersion.id,draft.calendarVersionId)));if(!rules||rules.calendarId!==calendar.id||rules.archivedAt)throw unavailable();Object.assign(target,{calendarVersionId:rules.id,rulesRevision:rules.revision,rulesTitle:rules.title});}
    if(draft.adoptionId){const [adoption]=await tx.select().from(worldCalendarAdoption).where(and(eq(worldCalendarAdoption.worldId,worldId),eq(worldCalendarAdoption.id,draft.adoptionId)));if(!primary||!adoption||adoption.archivedAt||adoption.versionId!==draft.calendarVersionId)throw unavailable();}
  }else{
    const [dating]=await tx.select().from(worldDatingSystem).where(and(eq(worldDatingSystem.worldId,worldId),eq(worldDatingSystem.id,draft.datingSystemId!)));if(!dating||dating.archivedAt)throw unavailable();
    target={id:dating.id,name:dating.name,revision:dating.revision,epochYear:dating.epochYear,numbering:dating.numbering,beforeLabel:dating.beforeLabel,afterLabel:dating.afterLabel};
  }
  return {lore:{id:lore.id,versionId:lore.versionId,revision:lore.revision,name:lore.name,family:lore.family},target};
}
function endpoints(draft:LinkDraft){return draft.kind==="realm-map"?{mapId:draft.mapId,calendarId:null,calendarVersionId:null,datingSystemId:null,adoptionId:null}:{mapId:null,calendarId:draft.calendarId,calendarVersionId:draft.calendarVersionId,datingSystemId:draft.datingSystemId,adoptionId:draft.adoptionId};}
export async function changeWorldLink(userId:string,worldId:string,input:unknown){
  return worldWriteTransaction(userId,worldId,async tx=>{
    const c=linkCommandSchema.parse(input),timeline=await selectedTimeline(tx,worldId,c.timelineId);if(timeline.archivedAt)throw new WorldError("Restore this timeline before changing its connections.",409);
    const [current]=await tx.select({head,version}).from(head).innerJoin(version,eq(head.versionId,version.id)).where(and(eq(head.worldId,worldId),eq(head.timelineId,timeline.id),eq(head.linkId,c.id)));
    if(c.action==="save"&&!c.revision&&current){if(isDeepStrictEqual(current.version.draft,c.draft))return c.id;throw conflict();}
    if(current?c.revision!==current.head.revision:c.revision!==undefined)throw conflict();
    if(c.action==="include"){
      if(!timeline.parentId)throw unavailable();
      const [source]=await tx.select({head,version}).from(head).innerJoin(version,eq(head.versionId,version.id)).where(and(eq(head.worldId,worldId),eq(head.timelineId,timeline.parentId),eq(head.linkId,c.id)));
      if(!source||source.head.versionId!==c.sourceVersionId||source.head.revision!==c.sourceRevision)throw conflict();
      if(source.version.archived||source.head.mode==="excluded"||source.version.adoptionId)throw new WorldError("This source cannot be included here. Primary adoption records remain in Primary; author a separate cultural interpretation in this timeline.",409);
      await sourceFor(tx,worldId,timeline.id,source.version.draft,timeline.primary);
      const next={worldId,timelineId:timeline.id,linkId:c.id,versionId:source.version.id,revision:(current?.head.revision??0)+1,mode:"inherited" as const};
      if(current)await tx.update(head).set(next).where(and(eq(head.timelineId,timeline.id),eq(head.linkId,c.id)));else await tx.insert(head).values(next);
      return c.id;
    }
    if(c.action==="exclude"){
      if(!current)throw unavailable();await tx.update(head).set({mode:"excluded",revision:current.head.revision+1}).where(and(eq(head.timelineId,timeline.id),eq(head.linkId,c.id)));return c.id;
    }
    if(c.action!=="save"&&!current)throw unavailable();
    if(c.action==="save"&&current&&(current.version.archived||current.head.mode==="excluded"))throw new WorldError("Restore or explicitly include this connection before editing it.",409);
    const draft=c.action==="save"?c.draft:current!.version.draft;
    const fresh=c.action==="save"?await sourceFor(tx,worldId,timeline.id,draft,timeline.primary):undefined;
    if(current&&(draft.kind!==current.version.draft.kind||draft.loreId!==current.version.loreId||JSON.stringify(endpoints(draft))!==JSON.stringify(endpoints(current.version.draft))))throw new WorldError("A saved connection keeps its participants and source. Archive it and create another connection to describe different participants or rules.",400);
    const source=current?.version.source??fresh!;
    if(!current)await tx.insert(identity).values({id:c.id,worldId,kind:draft.kind,originTimelineId:timeline.id,creatorId:userId});
    const versionId=randomUUID();await tx.insert(version).values({id:versionId,worldId,linkId:c.id,timelineId:timeline.id,authorId:userId,loreId:draft.loreId,loreVersionId:source.lore.versionId,...endpoints(draft),draft,source,archived:c.action==="archive"});
    const next={worldId,timelineId:timeline.id,linkId:c.id,versionId,revision:(current?.head.revision??0)+1,mode:current?.head.mode==="inherited"||current?.head.mode==="interpretation"?"interpretation" as const:"authored" as const};
    if(current)await tx.update(head).set(next).where(and(eq(head.timelineId,timeline.id),eq(head.linkId,c.id)));else await tx.insert(head).values(next);
    return c.id;
  });
}
