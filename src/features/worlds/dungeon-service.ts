import { activeMapFloor } from "./interior-service";
import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { worldAtlasDungeonShape, worldDungeonEntity, worldDungeonLevel, worldDungeonSite, worldAtlasMap, worldGeography, worldAtlasConnection } from "@/db/world-atlas-schema";
import { WorldError } from "./world-service";
import { dungeonSiteDraftSchema, dungeonLevelDraftSchema, geographicDungeon, validateDungeon, type DungeonEntity } from "./dungeon";
import { validateArrival } from "./atlas-destinations";
import type { MapDraft, GeographyDraft } from "./atlas";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
const id=z.string().uuid(),revision=z.number().int().positive(),mapName=z.string().trim().min(1).max(160);
export const dungeonCommandSchema=z.discriminatedUnion("action",[
 z.object({action:z.literal("create-dungeon"),geographyId:id.nullable(),draft:dungeonSiteDraftSchema,level:dungeonLevelDraftSchema,mapName}).strict(),
 z.object({action:z.literal("dungeon-level"),siteId:id,draft:dungeonLevelDraftSchema,mapName}).strict(),
 z.object({action:z.literal("dungeon-map"),levelId:id,name:mapName}).strict(),
 z.object({action:z.literal("edit-dungeon-site"),id,revision,geographyRevision:revision,draft:dungeonSiteDraftSchema}).strict(),
 z.object({action:z.literal("edit-dungeon-level"),id,revision,geographyRevision:revision,draft:dungeonLevelDraftSchema}).strict(),
 z.object({action:z.enum(["archive-dungeon-site","restore-dungeon-site","archive-dungeon-level","restore-dungeon-level"]),id,revision}).strict(),
]);
const unavailable=()=>new WorldError("This dungeon, level or destination is unavailable.",404);
const conflict=()=>new WorldError("Dungeon information changed in another map or tab. Your draft is retained; reload to compare.",409);
export async function activeDungeonSite(tx:Tx,worldId:string,id:string){const [s]=await tx.select().from(worldDungeonSite).where(and(eq(worldDungeonSite.worldId,worldId),eq(worldDungeonSite.geographyId,id)));if(!s||s.archivedAt)throw unavailable();return s;}
export async function activeDungeonLevel(tx:Tx,worldId:string,id:string){const [l]=await tx.select().from(worldDungeonLevel).where(and(eq(worldDungeonLevel.worldId,worldId),eq(worldDungeonLevel.geographyId,id)));if(!l||l.archivedAt)throw unavailable();await activeDungeonSite(tx,worldId,l.siteId);return l;}
export async function activeMapDungeon(tx:Tx,worldId:string,geographyId:string|null){if(!geographyId)return;const [l]=await tx.select().from(worldDungeonLevel).where(and(eq(worldDungeonLevel.worldId,worldId),eq(worldDungeonLevel.geographyId,geographyId)));if(l)await activeDungeonLevel(tx,worldId,geographyId);const [s]=await tx.select().from(worldDungeonSite).where(and(eq(worldDungeonSite.worldId,worldId),eq(worldDungeonSite.geographyId,geographyId)));if(s)await activeDungeonSite(tx,worldId,geographyId);}
export async function changeDungeon(tx:Tx,worldId:string,c:z.infer<typeof dungeonCommandSchema>){
 if(c.action==="create-dungeon"||c.action==="dungeon-level"){
  let siteId=c.action==="dungeon-level"?c.siteId:c.geographyId;
  if(c.action==="create-dungeon"){
   if(siteId){const [g]=await tx.select().from(worldGeography).where(and(eq(worldGeography.id,siteId),eq(worldGeography.worldId,worldId)));if(!g||g.archivedAt||g.kind!=="location")throw unavailable();await activeMapDungeon(tx,worldId,siteId);await activeMapFloor(tx,worldId,siteId);const [old]=await tx.select().from(worldDungeonSite).where(eq(worldDungeonSite.geographyId,siteId));if(old)throw new WorldError("This place already has a dungeon site. Add a level to it instead.",400);}
   else {if(c.draft.parentId){const [g]=await tx.select().from(worldGeography).where(and(eq(worldGeography.id,c.draft.parentId),eq(worldGeography.worldId,worldId)));if(!g||g.archivedAt)throw unavailable();await activeMapDungeon(tx,worldId,g.id);await activeMapFloor(tx,worldId,g.id);}siteId=randomUUID();await tx.insert(worldGeography).values({id:siteId,worldId,parentId:c.draft.parentId,name:c.draft.name,description:c.draft.description,kind:"location",context:"dungeon"});}
   await tx.insert(worldDungeonSite).values({geographyId:siteId,worldId,classification:c.draft.classification});
  }else await activeDungeonSite(tx,worldId,siteId!);
  const levels=await tx.select({id:worldDungeonLevel.geographyId}).from(worldDungeonLevel).where(eq(worldDungeonLevel.siteId,siteId!));if(levels.length>=512)throw new WorldError("A dungeon supports up to 512 retained levels or sections.",400);
  const d=c.action==="create-dungeon"?c.level:c.draft,levelId=randomUUID(),mapId=randomUUID();
  await tx.insert(worldGeography).values({id:levelId,worldId,parentId:siteId,name:d.name,description:d.description,kind:"location",context:"dungeon level"});
  await tx.insert(worldDungeonLevel).values({geographyId:levelId,worldId,siteId:siteId!,classification:d.classification,label:d.label,order:d.order,elevation:d.elevation});
  await tx.insert(worldAtlasMap).values({id:mapId,worldId,name:c.mapName,scope:"local",mapKind:"dungeon",geographyId:levelId});return mapId;
 }
 if(c.action==="dungeon-map"){await activeDungeonLevel(tx,worldId,c.levelId);const maps=await tx.select({id:worldAtlasMap.id}).from(worldAtlasMap).where(and(eq(worldAtlasMap.worldId,worldId),eq(worldAtlasMap.geographyId,c.levelId)));if(maps.length>=256)throw new WorldError("A dungeon level supports up to 256 retained maps.",400);const mapId=randomUUID();await tx.insert(worldAtlasMap).values({id:mapId,worldId,name:c.name,scope:"local",mapKind:"dungeon",geographyId:c.levelId});return mapId;}
 const site=c.action.endsWith("site"),table=site?worldDungeonSite:worldDungeonLevel;
 const [row]=await tx.select().from(table).where(and(eq(table.worldId,worldId),eq(table.geographyId,c.id)));if(!row)throw unavailable();if(row.revision!==c.revision)throw conflict();
 if(c.action==="edit-dungeon-site"||c.action==="edit-dungeon-level"){
  if(row.archivedAt)throw unavailable();if(!site)await activeDungeonLevel(tx,worldId,c.id);
  const [g]=await tx.select().from(worldGeography).where(and(eq(worldGeography.id,c.id),eq(worldGeography.worldId,worldId)));if(!g||g.revision!==c.geographyRevision)throw conflict();
  if(c.action==="edit-dungeon-site"&&g.parentId!==c.draft.parentId)throw new WorldError("Edit the existing geographic relationship through Geography records; site identity is retained.",400);
  await tx.update(worldGeography).set({name:c.draft.name,description:c.draft.description,revision:g.revision+1,updatedAt:new Date()}).where(eq(worldGeography.id,c.id));
  if(c.action==="edit-dungeon-level")await tx.update(worldDungeonLevel).set({classification:c.draft.classification,label:c.draft.label,order:c.draft.order,elevation:c.draft.elevation,revision:row.revision+1,updatedAt:new Date()}).where(eq(worldDungeonLevel.geographyId,c.id));
  else await tx.update(worldDungeonSite).set({classification:c.draft.classification,revision:row.revision+1,updatedAt:new Date()}).where(eq(worldDungeonSite.geographyId,c.id));
 }else await tx.update(table).set({archivedAt:c.action.startsWith("archive")?new Date():null,revision:row.revision+1,updatedAt:new Date()}).where(eq(table.geographyId,c.id));return c.id;
}
export async function dungeonSource(tx:Tx,worldId:string,mapId:string){
 const shapes=await tx.select().from(worldAtlasDungeonShape).where(and(eq(worldAtlasDungeonShape.worldId,worldId),eq(worldAtlasDungeonShape.mapId,mapId))).orderBy(asc(worldAtlasDungeonShape.sortOrder));
 const ids=[...new Set(shapes.map(s=>s.entityId))],entities=ids.length?await tx.select().from(worldDungeonEntity).where(and(eq(worldDungeonEntity.worldId,worldId),inArray(worldDungeonEntity.id,ids))):[];
 const geoIds=entities.flatMap(e=>e.geographyId?[e.geographyId]:[]),geos=geoIds.length?await tx.select().from(worldGeography).where(and(eq(worldGeography.worldId,worldId),inArray(worldGeography.id,geoIds))):[];
 const connections=await tx.select().from(worldAtlasConnection).where(and(eq(worldAtlasConnection.worldId,worldId),eq(worldAtlasConnection.sourceMapId,mapId)));
 return {dungeonShapes:shapes.map(s=>s.content),dungeonEntities:ids.map(id=>entities.find(e=>e.id===id)!).map(e=>({id:e.id,revision:e.revision,kind:e.kind as DungeonEntity["kind"],name:geos.find(g=>g.id===e.id)?.name===`Unnamed ${e.kind}`&&!e.name?"":geos.find(g=>g.id===e.id)?.name??e.name,description:geos.find(g=>g.id===e.id)?.description??e.description,classification:e.classification,visibility:e.visibility as DungeonEntity["visibility"],privateNotes:e.privateNotes,geographyId:e.geographyId})),dungeonLinks:entities.filter(e=>e.kind==="transition").map(e=>{const c=connections.find(c=>c.geographyId===e.id);return {entityId:e.id,destinationMapId:c?.destinationMapId??null,destinationGeographyId:c?.destinationGeographyId??null};})};
}
export async function guardDungeonGeographies(tx:Tx,worldId:string,drafts:GeographyDraft[]){
 const levels=await tx.select().from(worldDungeonLevel).where(eq(worldDungeonLevel.worldId,worldId)),entities=await tx.select().from(worldDungeonEntity).where(eq(worldDungeonEntity.worldId,worldId));
 for(const d of drafts){const l=levels.find(l=>l.geographyId===d.id),e=entities.find(e=>e.geographyId===d.id);if(l||e){await activeDungeonLevel(tx,worldId,l?.geographyId??e!.levelId);if(d.kind!=="location"||d.parentId!==(l?.siteId??e!.levelId)||d.context!==undefined&&d.context!==(l?"dungeon level":"dungeon"))throw new WorldError("Dungeon places retain their site or level parent and context.",400);}await activeMapDungeon(tx,worldId,d.id);}
}
export async function saveDungeon(tx:Tx,worldId:string,mapId:string,levelId:string,draft:MapDraft){
 await activeDungeonLevel(tx,worldId,levelId);const shapes=draft.dungeonShapes!,entities=draft.dungeonEntities!,links=draft.dungeonLinks!;
 try{validateDungeon(shapes,entities,links);}catch(e){throw new WorldError((e as Error).message,400);}
 const old=await tx.select().from(worldAtlasDungeonShape).where(eq(worldAtlasDungeonShape.mapId,mapId));if(old.some(s=>!shapes.some(n=>n.id===s.id)))throw new WorldError("Keep saved dungeon drawings and archive unwanted source. Reload to compare an incomplete draft.",400);
 const ids=shapes.map(s=>s.id),collisions=ids.length?await tx.select().from(worldAtlasDungeonShape).where(inArray(worldAtlasDungeonShape.id,ids)):[];if(collisions.some(s=>s.mapId!==mapId||s.worldId!==worldId))throw unavailable();
 const entityIds=entities.map(e=>e.id),existing=entityIds.length?await tx.select().from(worldDungeonEntity).where(inArray(worldDungeonEntity.id,entityIds)):[],byId=new Map(existing.map(e=>[e.id,e]));
 for(const e of entities){const p=byId.get(e.id);if(p&&(p.worldId!==worldId||p.levelId!==levelId))throw unavailable();if(p&&(p.kind!==e.kind||p.geographyId!==e.geographyId))throw new WorldError("A dungeon entity retains its kind, level and identity.",400);if(p?p.revision!==e.revision:e.revision!==null)throw conflict();const [g]=await tx.select().from(worldGeography).where(eq(worldGeography.id,e.id));if(geographicDungeon(e.kind)){if(!g||g.worldId!==worldId||g.parentId!==levelId||g.context!=="dungeon"||g.kind!=="location"||g.archivedAt||g.name!==(e.name||`Unnamed ${e.kind}`)||g.description!==e.description)throw new WorldError("Dungeon places must match their retained level and authored information.",400);}else if(!p&&g)throw unavailable();}
 const previousLinks=await tx.select().from(worldAtlasConnection).where(eq(worldAtlasConnection.sourceMapId,mapId));
 for(const e of entities.filter(e=>e.kind==="transition"))if(!links.some(l=>l.entityId===e.id))throw new WorldError("Retain each transition, including unconnected transitions.",400);
 for(const l of links){const p=previousLinks.find(c=>c.geographyId===l.entityId);if(l.destinationMapId&&(p?.destinationMapId!==l.destinationMapId||p?.destinationGeographyId!==l.destinationGeographyId))await validateArrival(tx,worldId,mapId,l.destinationMapId,l.destinationGeographyId);}
 for(const e of entities){const p=byId.get(e.id),{id,revision:_,...fields}=e;void _;if(!p)await tx.insert(worldDungeonEntity).values({id,worldId,levelId,...fields});else if(["name","description","classification","visibility","privateNotes"].some(k=>p[k as "name"]!==e[k as "name"]))await tx.update(worldDungeonEntity).set({...fields,revision:p.revision+1}).where(eq(worldDungeonEntity.id,id));}
 for(const [sortOrder,s] of shapes.entries()){const p=old.find(p=>p.id===s.id);if(p&&(p.entityId!==s.entityId||p.content.variant!==s.variant))throw new WorldError("Saved drawings retain their semantic entity and geometry type.",400);await tx.insert(worldAtlasDungeonShape).values({id:s.id,worldId,mapId,levelId,entityId:s.entityId,content:s,sortOrder}).onConflictDoUpdate({target:worldAtlasDungeonShape.id,set:{content:s,sortOrder}});}
 for(const l of links){const p=previousLinks.find(c=>c.geographyId===l.entityId);if(l.destinationMapId){if(p?.destinationMapId===l.destinationMapId&&p.destinationGeographyId===l.destinationGeographyId)continue;await tx.insert(worldAtlasConnection).values({id:randomUUID(),worldId,sourceMapId:mapId,geographyId:l.entityId,destinationMapId:l.destinationMapId,destinationGeographyId:l.destinationGeographyId}).onConflictDoUpdate({target:[worldAtlasConnection.sourceMapId,worldAtlasConnection.geographyId],set:{destinationMapId:l.destinationMapId,destinationGeographyId:l.destinationGeographyId,revision:(p?.revision??0)+1,updatedAt:new Date()}});}else if(p)await tx.delete(worldAtlasConnection).where(eq(worldAtlasConnection.id,p.id));}
}
