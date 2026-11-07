import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { itemTagCatalog } from "@/db/item-schema";
import { itemTagDiscoveryWhere } from "@/features/catalog-visibility/item-catalog-service";
import { world, worldEra, worldEntry, worldEntryEra, worldTag, worldDatingSystem, worldChronologyPreference, worldTimeline } from "@/db/world-schema";
import { HISTORY_LIMIT, TIMELINE_LIMIT, type InheritanceReview } from "./branching-history";
import { capturePrimaryVersion, effectiveHistory, selectedTimeline, timelineDto } from "./history-version-service";
import { datingDraftSchema, toReckoning, type DatingSystem, type SourceDating } from "./chronology";
import { worldCalendarEntryDate } from "@/db/world-calendar-history-schema";
import type { CalendarSource } from "./calendar-dates";
import { saveEntryCalendarDate } from "./calendar-evolution-service";
import { entryDraftSchema, eraDraftSchema, worldDraftSchema, type EntryRecord, type EraRecord, type Tone, type WorldBundle, type WorldRecord } from "./history";
import { worldCreationSchema } from "./campaign-associations";
import { initialCampaignAssociations, lockCreationCampaigns } from "./campaign-association-service";
import { WorldError } from "./world-errors";
import { worldScopeAllowed, authorizeWorldRead, authorizedWorldWrite, lockWorldForWrite, requireWorldCreator, worldActor, type AuthorizedWorld } from "./world-access-service";
import { worldRequestAuthority } from "./world-authorization-context";
import { hasWorldScope, type WorldOperationScope } from "./world-permissions";

export { WorldError } from "./world-errors";
const notFound = () => new WorldError("This world or historical record is unavailable.", 404);
const conflict = () => new WorldError("A newer version was saved in another tab. Your draft is still here. Load the latest version before editing again.", 409);
const idSchema = z.string().uuid();
const revisionSchema = z.number().int().positive();
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function actor(userId: string) {
  return worldActor(userId);
}
async function readWorld(userId: string, worldId: string, review: boolean) {
  return worldReadAccess(userId, worldId, review, "shell");
}
export async function worldReadAccess(userId:string,worldId:string,review=false,scope:WorldOperationScope|readonly WorldOperationScope[]="owner"){
  const authority=worldRequestAuthority();
  if(authority)return authorizeWorldRead(userId,worldId,authority.review,scope);
  // Established internal readers use review=true to request immutable owner
  // sources. Only HTTP's authenticated explicit review context grants the
  // administrator path; trusted owner reads retain their original identity.
  try{return await authorizeWorldRead(userId,worldId,review,scope);}catch(error){if(review&&error instanceof WorldError&&error.status===403)return authorizeWorldRead(userId,worldId,false,scope);throw error;}
}
export async function worldWriteTransaction<T>(userId:string,worldId:string,run:(tx:Tx,parent:AuthorizedWorld)=>Promise<T>,scope:WorldOperationScope|readonly WorldOperationScope[]="owner"){return authorizedWorldWrite(userId,worldId,run,scope);}
async function classificationWhere(userId: string, scope: "mine" | "review" = "mine", connection: typeof db | Tx = db) {
  // Retention comes only from server-read worlds in the authorized scope, never client IDs.
  const retained = await connection.selectDistinct({ id: worldTag.tagId }).from(worldTag)
    .innerJoin(world, eq(world.id, worldTag.worldId))
    .where(scope === "review" ? ne(world.ownerId, userId) : eq(world.ownerId, userId));
  return and(sql`lower(trim(${itemTagCatalog.tagGroup})) in ('era','genre')`,
    await itemTagDiscoveryWhere(userId, retained.map(({ id }) => id)));
}
async function tags(tx: Tx, userId: string, worldId: string, tagIds: number[]) {
  const ids = [...new Set(tagIds)];
  if (ids.length) {
    const retained=await tx.select({id:worldTag.tagId}).from(worldTag).where(eq(worldTag.worldId,worldId));
    const matches = await tx.select({ id: itemTagCatalog.id }).from(itemTagCatalog).where(and(inArray(itemTagCatalog.id, ids),sql`lower(trim(${itemTagCatalog.tagGroup})) in ('era','genre')`,await itemTagDiscoveryWhere(userId,retained.map(row=>row.id))));
    if (matches.length !== ids.length) throw new WorldError("Choose available Era or Genre classification tags.", 400);
  }
  await tx.delete(worldTag).where(eq(worldTag.worldId, worldId));
  if (ids.length) await tx.insert(worldTag).values(ids.map((tagId) => ({ worldId, tagId })));
}
function worldDto(row: typeof world.$inferSelect, ownerName: string, tagIds: number[], eraCount: number, entryCount: number): WorldRecord {
  return { id: row.id, ownerId: row.ownerId, ownerName, name: row.name, description: row.description, introduction: row.introduction, historicalOverview: row.historicalOverview, tone: row.tone as Tone, revision: row.revision, archived: !!row.archivedAt, updatedAt: row.updatedAt.toISOString(), tagIds, eraCount, entryCount };
}
export function eraDto(row: typeof worldEra.$inferSelect): EraRecord { return { id: row.id, worldId: row.worldId, name: row.name, description: row.description, startYear: row.startYear, endYear: row.endYear, tone: row.tone as Tone, revision: row.revision, archived: !!row.archivedAt, datingSystemId:row.datingSystemId,datingSystemRevision:row.sourceDating?.revision,sourceDating:row.sourceDating }; }
export function entryDto(row: typeof worldEntry.$inferSelect, eraIds: string[],calendarSource:CalendarSource|null): EntryRecord { return { id: row.id, worldId: row.worldId, eventType:row.eventType, prominence:row.prominence as EntryRecord["prominence"], title: row.title, account: row.account, notes: row.notes, ...(row.visibility === "protected" ? {visibility:"protected" as const} : {}), time: row.time, accuracy: row.accuracy as EntryRecord["accuracy"], narrative: row.narrative as EntryRecord["narrative"], revision: row.revision, archived: !!row.archivedAt, updatedAt: row.updatedAt.toISOString(), eraIds,datingSystemId:row.datingSystemId,datingSystemRevision:row.sourceDating?.revision,sourceDating:row.sourceDating,calendarSource }; }
function datingDto(row:typeof worldDatingSystem.$inferSelect):DatingSystem {return {id:row.id,worldId:row.worldId,name:row.name,description:row.description,origin:row.origin,epochYear:row.epochYear,numbering:row.numbering as DatingSystem["numbering"],beforeLabel:row.beforeLabel,afterLabel:row.afterLabel,notes:row.notes,revision:row.revision,archived:!!row.archivedAt,referenced:!!row.referencedAt};}
export async function listWorlds(userId: string, scope: "mine" | "review" = "mine") {
  const access = await actor(userId);
  if (scope === "review" && !access.admin) throw new WorldError("Administrator review requires administrator access.", 403);
  const rows = await db.select({ row: world, ownerName: user.name,
    eraCount: sql<number>`(select count(*)::integer from world_historical_era e where e.world_id = ${world.id} and e.archived_at is null and e.timeline_id = (select id from world_timeline where world_id = ${world.id} and is_primary))`,
    entryCount: sql<number>`(select count(*)::integer from world_historical_entry e where e.world_id = ${world.id} and e.archived_at is null and e.timeline_id = (select id from world_timeline where world_id = ${world.id} and is_primary))`,
  }).from(world).innerJoin(user, eq(user.id, world.ownerId)).where(scope === "review" ? ne(world.ownerId, userId) : eq(world.ownerId, userId)).orderBy(desc(world.updatedAt), asc(world.id));
  const associations = rows.length ? await db.select().from(worldTag).where(inArray(worldTag.worldId, rows.map(({row}) => row.id))) : [];
  return rows.map(({row, ownerName, eraCount, entryCount}) => worldDto(row, ownerName, associations.filter((tag) => tag.worldId === row.id).map((tag) => tag.tagId), eraCount, entryCount));
}
export async function worldReferences(userId: string, scope: "mine" | "review" = "mine") {
  const access = await actor(userId);
  if (scope === "review" && !access.admin) throw new WorldError("Administrator review requires administrator access.", 403);
  return db.select({ id: itemTagCatalog.id, name: itemTagCatalog.name, tagGroup: itemTagCatalog.tagGroup, description: itemTagCatalog.description }).from(itemTagCatalog).where(await classificationWhere(userId, scope)).orderBy(asc(itemTagCatalog.tagGroup), asc(itemTagCatalog.name));
}
export async function scopedWorldReferences(userId:string,worldId:string,review=false){
  await worldReadAccess(userId,worldId,review,"overview");
  const retained=await db.select({id:worldTag.tagId}).from(worldTag).where(eq(worldTag.worldId,worldId));
  return db.select({id:itemTagCatalog.id,name:itemTagCatalog.name,tagGroup:itemTagCatalog.tagGroup,description:itemTagCatalog.description}).from(itemTagCatalog).where(and(sql`lower(trim(${itemTagCatalog.tagGroup})) in ('era','genre')`,await itemTagDiscoveryWhere(userId,retained.map(row=>row.id)))).orderBy(asc(itemTagCatalog.tagGroup),asc(itemTagCatalog.name));
}
export async function getWorld(userId: string, worldId: string, review = false, timelineId?:string|null,ordinary=false): Promise<WorldBundle> {
  const row = await readWorld(userId, worldId, review);
  const preview=ordinary;
  // Read one consistent snapshot even while another tab saves associations.
  return db.transaction(async (tx) => {
    const [fresh] = await tx.select().from(world).where(eq(world.id, row.id));
    const [owner] = await tx.select({ name: user.name }).from(user).where(eq(user.id, fresh.ownerId));
    const timeline=await selectedTimeline(tx,worldId,timelineId);
    const timelines=await tx.select().from(worldTimeline).where(eq(worldTimeline.worldId,worldId)).orderBy(desc(worldTimeline.primary),asc(worldTimeline.createdAt)).limit(TIMELINE_LIMIT);
    const permission=row.permission;
    if (!timeline.primary&&!hasWorldScope(permission,"history")) throw notFound();
    ordinary ||= !permission.protectedContent;
    const history=hasWorldScope(permission,"history")?(timeline.primary&&!ordinary?await primaryHistoryRows(tx,worldId,timeline.id):await effectiveHistory(tx,worldId,timeline,ordinary)):{eras:[],entries:[],inheritanceReview:[]};
    const classifications = await tx.select().from(worldTag).where(eq(worldTag.worldId, worldId));
    const systems = await tx.select().from(worldDatingSystem).where(eq(worldDatingSystem.worldId,worldId)).orderBy(asc(worldDatingSystem.name),asc(worldDatingSystem.id));
    const [preference] = await tx.select().from(worldChronologyPreference).where(eq(worldChronologyPreference.worldId,worldId));
    const dto=worldDto(fresh,owner.name,classifications.map(tag=>tag.tagId),history.eras.filter(era=>!era.archived).length,history.entries.filter(entry=>!entry.archived).length);
    if(!hasWorldScope(permission,"overview")){dto.description="";dto.introduction="";dto.historicalOverview="";dto.tagIds=[];}
    return {world:dto,...history,permission,canEdit:!preview&&!review&&permission.canEdit&&hasWorldScope(permission,"history")&&!timeline.archivedAt,canManageTimelines:!preview&&!review&&permission.canEdit&&hasWorldScope(permission,"history"),datingSystems:hasWorldScope(permission,"timekeeping")?systems.map(datingDto):[],defaultDatingSystemId:hasWorldScope(permission,"timekeeping")?preference?.defaultDatingSystemId??null:null,timelines:timelines.filter(item=>item.primary||hasWorldScope(permission,"history")).map(item=>hasWorldScope(permission,"history")?timelineDto(item):{...timelineDto(item),name:"Primary History",description:"",explanation:""}),selectedTimeline:hasWorldScope(permission,"history")?timelineDto(timeline):{...timelineDto(timeline),name:"Primary History",description:"",explanation:""},inheritanceReview:history.inheritanceReview};
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
export async function primaryHistoryRows(tx:Tx,worldId:string,timelineId:string){
  const eras=await tx.select().from(worldEra).where(and(eq(worldEra.worldId,worldId),eq(worldEra.timelineId,timelineId))).orderBy(asc(worldEra.name),asc(worldEra.id)).limit(HISTORY_LIMIT+1);
  const entries=await tx.select().from(worldEntry).where(and(eq(worldEntry.worldId,worldId),eq(worldEntry.timelineId,timelineId))).orderBy(desc(worldEntry.updatedAt),asc(worldEntry.id)).limit(HISTORY_LIMIT+1);
  if(eras.length+entries.length>HISTORY_LIMIT)throw new WorldError(`This history exceeds the supported ${HISTORY_LIMIT.toLocaleString()} retained records.`,400);
  const ids=entries.map(entry=>entry.id);
  const memberships=ids.length?await tx.select().from(worldEntryEra).where(inArray(worldEntryEra.entryId,ids)):[];
  const dates=ids.length?await tx.select().from(worldCalendarEntryDate).where(inArray(worldCalendarEntryDate.entryId,ids)):[];
  const links=new Map<string,string[]>();for(const link of memberships)links.set(link.entryId,[...(links.get(link.entryId)??[]),link.eraId]);
  const sources=new Map(dates.map(date=>[date.entryId,date.source]));
  return {eras:eras.map(eraDto),entries:entries.map(entry=>entryDto(entry,links.get(entry.id)??[],sources.get(entry.id)??null)),inheritanceReview:[] as InheritanceReview[]};
}
export async function createWorld(userId: string, input: unknown) {
  await requireWorldCreator(userId);
  const { tagIds, associatedCampaigns, ...draft } = worldCreationSchema.parse(input);
  const id = randomUUID();
  await db.transaction(async (tx) => { await lockCreationCampaigns(tx,userId,associatedCampaigns); await tx.insert(world).values({ id, ownerId: userId, ...draft }); await tags(tx, userId, id, tagIds); await initialCampaignAssociations(tx,userId,id,associatedCampaigns); });
  return id;
}
export async function changeWorld(userId: string, worldId: string, input: unknown) {
  await actor(userId);
  const command = z.discriminatedUnion("action", [
    z.object({ action: z.literal("save"), revision: revisionSchema, draft: worldDraftSchema }).strict(),
    z.object({ action: z.enum(["archive","restore"]), revision: revisionSchema }).strict(),
  ]).parse(input);
  if(command.action!=="save")return (await import("./world-collaboration-service")).changeWorldLifecycle(userId,worldId,command.action,command.revision);
  await worldWriteTransaction(userId,worldId,async (tx,current) => {
    if (current.revision !== command.revision) throw conflict();
    if (command.action === "save") {
      const { tagIds, ...draft } = command.draft;
      await tx.update(world).set({ ...draft, revision: current.revision + 1, updatedAt: new Date() }).where(eq(world.id, worldId));
      await tags(tx, userId, worldId, tagIds);
    }
  },"overview");
}
const historyCommand = z.discriminatedUnion("entity", [
  z.object({ entity: z.literal("era"), timelineId:idSchema.optional(), id: idSchema.optional(), revision: revisionSchema.optional(), action: z.enum(["save","archive","restore"]), draft: eraDraftSchema.optional() }).strict(),
  z.object({ entity: z.literal("entry"), timelineId:idSchema.optional(), id: idSchema.optional(), revision: revisionSchema.optional(), action: z.enum(["save","archive","restore"]), draft: entryDraftSchema.optional() }).strict(),
]);
export async function sourceDatingFor(tx:Tx,worldId:string,systemId:string|null|undefined,revision:number|undefined,years:(number|null)[],previous:{datingSystemId:string|null;sourceDating:SourceDating|null}|undefined) {
  if(!worldScopeAllowed(worldId,"timekeeping")){if(systemId)throw new WorldError("Changing chronology sources requires Calendars and Chronology permission.",403);return {datingSystemId:previous?.datingSystemId??null,sourceDating:previous?.sourceDating??null};}
  if (!systemId || years.every((year)=>year === null)) return {datingSystemId:null,sourceDating:null};
  const [system] = await tx.select().from(worldDatingSystem).where(and(eq(worldDatingSystem.id,systemId),eq(worldDatingSystem.worldId,worldId))).for("update");
  if (!system) throw notFound();
  if (system.revision !== revision) throw conflict();
  if (system.archivedAt && previous?.datingSystemId !== systemId) throw new WorldError("Restore this dating system before assigning a new historical date to it.",400);
  const sourceYears = years.map((year)=>year === null ? null : toReckoning(year,{...system,numbering:system.numbering as DatingSystem["numbering"]}));
  const retained = previous?.datingSystemId === systemId && JSON.stringify(previous.sourceDating?.years) === JSON.stringify(sourceYears);
  if (!system.referencedAt) await tx.update(worldDatingSystem).set({referencedAt:new Date()}).where(eq(worldDatingSystem.id,systemId));
  const sourceDating:SourceDating = retained && previous.sourceDating ? previous.sourceDating : {version:1,kind:"year-reckoning",systemId,revision:system.revision,name:system.name,origin:system.origin,epochYear:system.epochYear,numbering:system.numbering as DatingSystem["numbering"],beforeLabel:system.beforeLabel,afterLabel:system.afterLabel,years:sourceYears};
  return {datingSystemId:systemId,sourceDating};
}
export async function changeHistory(userId: string, worldId: string, input: unknown) {
  return worldWriteTransaction(userId,worldId,tx=>changeHistoryInTransaction(tx,userId,worldId,input),"history");
}
export async function changeHistoryInTransaction(tx:Tx,userId:string,worldId:string,input:unknown) {
  const command = historyCommand.parse(input);
  const id = command.id ?? randomUUID();
    const access=await lockWorldForWrite(tx, userId, worldId,"history");
    const timeline=await selectedTimeline(tx,worldId,command.timelineId);
    if(timeline.archivedAt)throw new WorldError("Restore this timeline before editing its history.",400);
    if(command.entity==="entry"&&!access.permission.protectedContent){
      if(command.draft?.visibility==="protected"||command.draft?.notes.trim())throw new WorldError("Protected sources and creator notes require the owner's explicit permission.",403);
      if(command.id){const {historyEntryInTransaction}=await import("./history-index-service");await historyEntryInTransaction(tx,worldId,timeline.id,command.id,true);const original=await historyEntryInTransaction(tx,worldId,timeline.id,command.id,false);if(command.draft)command.draft.notes=original.notes;}
    }
    if(!timeline.primary){const {changeBranchHistory}=await import("./branching-history-service");await changeBranchHistory(tx,worldId,timeline,command,id);return id;}
    const table = command.entity === "era" ? worldEra : worldEntry;
    const [current] = command.id ? await tx.select({ revision: table.revision, archivedAt: table.archivedAt,datingSystemId:table.datingSystemId,sourceDating:table.sourceDating }).from(table).where(and(eq(table.id, id), eq(table.worldId, worldId),eq(table.timelineId,timeline.id))).for("update") : [];
    if (command.id && !current) throw notFound();
    if (current && current.revision !== command.revision) throw conflict();
    if(!current){const count=await tx.execute<{count:number}>(sql`select ((select count(*) from world_historical_entry where timeline_id=${timeline.id})+(select count(*) from world_historical_era where timeline_id=${timeline.id}))::integer as count`);if(count.rows[0].count>=HISTORY_LIMIT)throw new WorldError("This timeline has reached its retained-history limit.",400);}
    if (command.action !== "save") {
      if (!current) throw new WorldError("Choose a saved historical record.", 400);
      await tx.update(table).set({ archivedAt: command.action === "archive" ? new Date() : null, revision: current.revision + 1, updatedAt: new Date() }).where(and(eq(table.id, id), eq(table.worldId, worldId)));
    } else {
      if (current?.archivedAt) throw new WorldError("Restore this historical record before editing it.", 400);
      if (!command.draft) throw new WorldError("Enter the historical record's details.", 400);
      const lifecycle = { revision: (current?.revision ?? 0) + 1, updatedAt: new Date() };
      if (command.entity === "era") {
        const {datingSystemId,datingSystemRevision,...draft} = command.draft;
        const source = await sourceDatingFor(tx,worldId,datingSystemId,datingSystemRevision,[draft.startYear,draft.endYear],current);
        if (current) await tx.update(worldEra).set({ ...draft,...source, ...lifecycle }).where(and(eq(worldEra.id, id), eq(worldEra.worldId, worldId)));
        else await tx.insert(worldEra).values({ id, worldId,timelineId:timeline.id, ...draft,...source });
      } else {
        const { eraIds,datingSystemId,datingSystemRevision,calendarDate, ...draft } = command.draft;
        const years = draft.time.kind === "undated" ? [] : "year" in draft.time ? [draft.time.year] : [draft.time.startYear,draft.time.endYear];
        const source = await sourceDatingFor(tx,worldId,datingSystemId,datingSystemRevision,years,current);
        const ids = [...new Set(eraIds)];
        if (ids.length) {
          const matches = await tx.select({ id: worldEra.id, archivedAt: worldEra.archivedAt }).from(worldEra).where(and(inArray(worldEra.id, ids), eq(worldEra.worldId, worldId),eq(worldEra.timelineId,timeline.id)));
          if (matches.length !== ids.length) throw new WorldError("Every historical era must belong to this world.", 400);
          const retained = current ? await tx.select().from(worldEntryEra).where(eq(worldEntryEra.entryId, id)) : [];
          if (matches.some((era) => era.archivedAt && !retained.some((link) => link.eraId === era.id))) throw new WorldError("Restore an archived era before assigning new entries to it.", 400);
        }
        if (current) await tx.update(worldEntry).set({ ...draft,...source, ...lifecycle }).where(and(eq(worldEntry.id, id), eq(worldEntry.worldId, worldId)));
        else await tx.insert(worldEntry).values({ id, worldId,timelineId:timeline.id, ...draft,...source });
        await saveEntryCalendarDate(tx,worldId,id,calendarDate);
        await tx.delete(worldEntryEra).where(eq(worldEntryEra.entryId, id));
        if (ids.length) await tx.insert(worldEntryEra).values(ids.map((eraId) => ({ worldId, entryId: id, eraId })));
      }
    }
    if(command.entity==="era"){const [row]=await tx.select().from(worldEra).where(eq(worldEra.id,id));await capturePrimaryVersion(tx,timeline.id,eraDto(row));}
    else {const [row]=await tx.select().from(worldEntry).where(eq(worldEntry.id,id));const links=await tx.select().from(worldEntryEra).where(eq(worldEntryEra.entryId,id));const [date]=await tx.select().from(worldCalendarEntryDate).where(eq(worldCalendarEntryDate.entryId,id));await capturePrimaryVersion(tx,timeline.id,entryDto(row,links.map(link=>link.eraId),date?.source??null));}
    await tx.update(world).set({ updatedAt: new Date() }).where(eq(world.id, worldId));
  return id;
}
const chronologyCommand = z.union([
  z.object({action:z.literal("default"),revision:revisionSchema,systemId:idSchema.nullable()}).strict(),
  z.object({action:z.literal("save"),id:idSchema.optional(),revision:revisionSchema.optional(),draft:datingDraftSchema}).strict(),
  z.object({action:z.enum(["archive","restore"]),id:idSchema,revision:revisionSchema}).strict(),
]);
export async function changeChronology(userId:string,worldId:string,input:unknown) {
  await actor(userId);const command = chronologyCommand.parse(input);
  return worldWriteTransaction(userId,worldId,async(tx,parent)=>{
    if (command.action === "default") {
      if (parent.revision !== command.revision) throw conflict();
      if (command.systemId) {
        const [system] = await tx.select().from(worldDatingSystem).where(and(eq(worldDatingSystem.id,command.systemId),eq(worldDatingSystem.worldId,worldId)));
        if (!system) throw notFound();
        if (system.archivedAt) throw new WorldError("Restore the dating system before making it the default.",400);
      }
      await tx.insert(worldChronologyPreference).values({worldId,defaultDatingSystemId:command.systemId}).onConflictDoUpdate({target:worldChronologyPreference.worldId,set:{defaultDatingSystemId:command.systemId}});
      await tx.update(world).set({revision:parent.revision+1,updatedAt:new Date()}).where(eq(world.id,worldId));return command.systemId;
    }
    const id = command.id ?? randomUUID();
    const [current] = command.id ? await tx.select().from(worldDatingSystem).where(and(eq(worldDatingSystem.id,id),eq(worldDatingSystem.worldId,worldId))).for("update") : [];
    if (command.id && !current) throw notFound();
    if (current && current.revision !== command.revision) throw conflict();
    if (command.action === "save") {
      if (current?.archivedAt) throw new WorldError("Restore this dating system before editing it.",400);
      if (current?.referencedAt && (current.epochYear !== command.draft.epochYear || current.numbering !== command.draft.numbering)) throw new WorldError("This epoch and numbering rule are locked because historical dates use them. Create a separate reckoning for a different origin or rule.",400);
      if (current) await tx.update(worldDatingSystem).set({...command.draft,revision:current.revision+1,updatedAt:new Date()}).where(eq(worldDatingSystem.id,id));
      else await tx.insert(worldDatingSystem).values({id,worldId,...command.draft});
    } else {
      if (command.action === "archive") {
        const [preference] = await tx.select().from(worldChronologyPreference).where(and(eq(worldChronologyPreference.worldId,worldId),eq(worldChronologyPreference.defaultDatingSystemId,id)));
        if (preference) throw new WorldError("Choose another default display system before archiving this one.",400);
      }
      await tx.update(worldDatingSystem).set({archivedAt:command.action === "archive" ? new Date() : null,revision:current!.revision+1,updatedAt:new Date()}).where(eq(worldDatingSystem.id,id));
    }
    await tx.update(world).set({updatedAt:new Date()}).where(eq(world.id,worldId));return id;
  },"timekeeping");
}
