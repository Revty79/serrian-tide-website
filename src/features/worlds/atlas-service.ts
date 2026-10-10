import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { world } from "@/db/world-schema";
import { worldAtlasMap, worldAtlasFeature, worldAtlasDrawing, worldGeography, worldAtlasConnection, worldSettlementEntity } from "@/db/world-atlas-schema";
import { WorldError, worldReadAccess, worldWriteTransaction } from "./world-service";
import { atlasId, geographyDraftSchema, mapDraftSchema, validateMapDraft, validateParents, type AtlasBundle, type GeographyDraft, type MapDraft } from "./atlas";
import { settlementSource, saveSettlement } from "./settlement-service";
import { defaultSettlementState } from "./settlement";
import { generationSpecSchema, generationProvenanceSchema } from "./generation-spec";
import { generateMap } from "./map-generator";
import { validateDescriptionSpec } from "./description-interpreter";
const revision=z.number().int().positive();
const command=z.discriminatedUnion("action",[
  z.object({action:z.literal("generate"),id:atlasId,name:z.string().trim().min(1).max(160),description:z.string().max(12000),spec:generationSpecSchema,sourceMapId:atlasId.nullable(),sourceRevision:revision.nullable(),descriptionWarningsAccepted:z.literal(true).optional()}).strict(),
  z.object({action:z.literal("duplicate"),id:atlasId,revision,newId:atlasId,name:z.string().trim().min(1).max(160)}).strict(),
  z.object({action:z.literal("create"),name:z.string().trim().min(1).max(160),description:z.string().max(12000),scope:z.enum(["world","continent","regional","local"]),geographyId:atlasId.nullable().optional(),mapKind:z.enum(["generic","settlement"]).optional(),settlement:geographyDraftSchema.optional()}).strict(),
  z.object({action:z.literal("adopt-settlement"),id:atlasId,revision,geographyId:atlasId}).strict(),
  z.object({action:z.literal("associate"),id:atlasId,revision,geographyId:atlasId.nullable()}).strict(),
  z.object({action:z.literal("connect"),id:atlasId,revision,geographyId:atlasId,destinationMapId:atlasId.nullable()}).strict(),
  z.object({action:z.literal("save"),id:atlasId,revision,draft:mapDraftSchema}).strict(),
  z.object({action:z.enum(["archive-map","restore-map"]),id:atlasId,revision}).strict(),
  z.object({action:z.literal("geography"),draft:geographyDraftSchema}).strict(),
  z.object({action:z.enum(["archive-geography","restore-geography"]),id:atlasId,revision}).strict(),
]);
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
const unavailable=()=>new WorldError("This map or geography is unavailable.",404);
const conflict=()=>new WorldError("A newer map or geography was saved in another tab. Your draft is retained. Reload the saved map to compare before trying again.",409);
function validate<T>(run:()=>T):T {try{return run();}catch(failure){throw new WorldError((failure as Error).message,400);}}
export async function getAtlas(userId:string,worldId:string,review=false,mapId?:string):Promise<AtlasBundle> {
  const parent=await worldReadAccess(userId,worldId,review);
  if(mapId&&!atlasId.safeParse(mapId).success)throw unavailable();
  return db.transaction(async tx=>{
    const maps=await tx.select().from(worldAtlasMap).where(eq(worldAtlasMap.worldId,worldId)).orderBy(asc(worldAtlasMap.createdAt),asc(worldAtlasMap.id));
    if(mapId&&!maps.some(m=>m.id===mapId&&!m.archivedAt))throw unavailable();
    const contentWhere=mapId?and(eq(worldAtlasFeature.worldId,worldId),eq(worldAtlasFeature.mapId,mapId)):eq(worldAtlasFeature.worldId,worldId);
    const features=await tx.select().from(worldAtlasFeature).where(contentWhere).orderBy(asc(worldAtlasFeature.id));
    const drawings=await tx.select().from(worldAtlasDrawing).where(mapId?and(eq(worldAtlasDrawing.worldId,worldId),eq(worldAtlasDrawing.mapId,mapId)):eq(worldAtlasDrawing.worldId,worldId)).orderBy(asc(worldAtlasDrawing.sortOrder),asc(worldAtlasDrawing.id));
    const geographyHeaders=await tx.select({id:worldGeography.id,parentId:worldGeography.parentId}).from(worldGeography).where(eq(worldGeography.worldId,worldId));
    const connections=await tx.select().from(worldAtlasConnection).where(eq(worldAtlasConnection.worldId,worldId));
    const settlement=mapId&&maps.find(m=>m.id===mapId)?.mapKind==="settlement"?await settlementSource(tx,worldId,mapId,maps.find(m=>m.id===mapId)!.geographyId!):null;
    const entityHeaders=mapId?await tx.select({geographyId:worldSettlementEntity.geographyId}).from(worldSettlementEntity).where(eq(worldSettlementEntity.worldId,worldId)):[];
    const entityIds=new Set(entityHeaders.map(e=>e.geographyId)),needed=new Set([...features.map(f=>f.geographyId),...drawings.flatMap(d=>d.geographyId?[d.geographyId]:[]),...maps.flatMap(m=>m.geographyId?[m.geographyId]:[]),...connections.map(c=>c.geographyId),...(settlement?.settlementEntities??[]).map(e=>e.geographyId)]);
    for(const g of geographyHeaders)if(!entityIds.has(g.id))needed.add(g.id);
    const ancestry=new Map(geographyHeaders.map(g=>[g.id,g.parentId]));for(const id of [...needed]){let parent=ancestry.get(id);while(parent&&!needed.has(parent)){needed.add(parent);parent=ancestry.get(parent);}}
    const readableGeographies=await tx.select().from(worldGeography).where(mapId&&needed.size?and(eq(worldGeography.worldId,worldId),inArray(worldGeography.id,[...needed])):eq(worldGeography.worldId,worldId)).orderBy(asc(worldGeography.name),asc(worldGeography.id));
    return {connections:connections.map(c=>({id:c.id,sourceMapId:c.sourceMapId,geographyId:c.geographyId,destinationMapId:c.destinationMapId,revision:c.revision})),canEdit:parent.ownerId===userId&&!parent.archivedAt&&!review,maps:maps.map(m=>({id:m.id,name:m.name,mapKind:m.mapKind as "generic"|"settlement",...(m.mapKind==="settlement"?{settlementState:m.settlementState,...(m.id===mapId?settlement:{})}:{}),description:m.description,geographyId:m.geographyId,scope:m.scope as AtlasBundle["maps"][number]["scope"],width:m.width,height:m.height,revision:m.revision,archived:!!m.archivedAt,presentation:m.presentation,generation:mapId&&m.id!==mapId?undefined:m.generation,drawings:drawings.filter(d=>d.mapId===m.id).map(d=>d.content),features:features.filter(f=>f.mapId===m.id).map(f=>({id:f.id,geographyId:f.geographyId,geometry:f.geometry,archived:!!f.archivedAt}))})),geographies:readableGeographies.map(g=>({id:g.id,revision:g.revision,name:g.name,description:g.description,kind:g.kind as GeographyDraft["kind"],context:g.context as GeographyDraft["context"],parentId:g.parentId,archived:!!g.archivedAt}))};
  },{isolationLevel:"repeatable read",accessMode:"read only"});
}
async function saveGeographies(tx:Tx,worldId:string,drafts:GeographyDraft[]) {
  const existing=await tx.select().from(worldGeography).where(eq(worldGeography.worldId,worldId));
  const settlementEntities=await tx.select().from(worldSettlementEntity).where(eq(worldSettlementEntity.worldId,worldId));
  for(const d of drafts){const e=settlementEntities.find(e=>e.geographyId===d.id);if(e&&d.parentId!==e.settlementId)throw new WorldError("A settlement place retains its settlement parent. District membership is separate and may overlap.",400);}
  // Old generators/editors omit context; retain existing classification instead of resetting it.
  drafts=drafts.map(d=>({...d,context:d.context??existing.find(g=>g.id===d.id)?.context as GeographyDraft["context"]??"place"}));
  for(const d of drafts)if(d.kind!=="location"&&d.context!=="place")throw new WorldError("Only location records have a location context.",400);
  const all=new Map(existing.map(g=>[g.id,g]));
  for(const draft of drafts) {
    const old=all.get(draft.id);
    if(old) {
      const changed=["name","description","kind","parentId","context"].some(key=>old[key as keyof typeof old]!==draft[key as keyof GeographyDraft]);
      if(changed&&(old.revision!==draft.revision||old.archivedAt))throw old.archivedAt?new WorldError("Restore this geography before editing it.",400):conflict();
      if(old.kind!==draft.kind)throw new WorldError("A saved geography's kind is stable. Create another record for a different kind.",400);
      // Even unchanged stale metadata must not silently replace the latest record.
      if(old.revision!==draft.revision)throw conflict();
    } else {if(draft.revision!==null)throw unavailable();const [collision]=await tx.select({id:worldGeography.id}).from(worldGeography).where(eq(worldGeography.id,draft.id));if(collision)throw unavailable();}
    all.set(draft.id,{...old,...draft,context:draft.context??old?.context??"place",revision:draft.revision??1,archivedAt:old?.archivedAt??null,worldId,createdAt:old?.createdAt??new Date(),updatedAt:new Date()});
  }
  for(const draft of drafts){const parent=draft.parentId?all.get(draft.parentId):null,old=existing.find(g=>g.id===draft.id);if(parent?.archivedAt&&old?.parentId!==draft.parentId)throw new WorldError("Restore the parent geography before creating a new relationship.",400);}
  validate(()=>validateParents([...all.values()]));
  for(const draft of drafts) {
    const old=existing.find(g=>g.id===draft.id),{id,revision:expected,...values}=draft;
    if(!old)await tx.insert(worldGeography).values({id,worldId,...values});
    else if(old.name!==draft.name||old.description!==draft.description||old.parentId!==draft.parentId||old.context!==draft.context)await tx.update(worldGeography).set({...values,revision:expected!+1,updatedAt:new Date()}).where(eq(worldGeography.id,id));
  }
}
async function saveMapContent(tx:Tx,worldId:string,map:typeof worldAtlasMap.$inferSelect,draft:MapDraft){
  validate(()=>{mapDraftSchema.parse(draft);validateMapDraft(draft);});
        const previous=await tx.select().from(worldAtlasFeature).where(eq(worldAtlasFeature.mapId,map.id));
        if(previous.some(f=>!draft.features.some(n=>n.id===f.id)))throw new WorldError("Keep saved features in the map and archive unwanted shapes. Reload if your draft is incomplete.",400);
        const ids=draft.features.map(f=>f.id);
        const collisions=ids.length?await tx.select().from(worldAtlasFeature).where(inArray(worldAtlasFeature.id,ids)):[];
        if(collisions.some(f=>f.mapId!==map.id||f.worldId!==worldId))throw unavailable();
        const oldDrawings=await tx.select().from(worldAtlasDrawing).where(eq(worldAtlasDrawing.mapId,map.id));
        const incoming=draft.drawings??[];
        if(oldDrawings.some(d=>!incoming.some(n=>n.id===d.id)))throw new WorldError("Keep saved drawings and archive unwanted artwork. This draft is incomplete; compare the saved map.",400);
        const drawingIds=incoming.map(d=>d.id),drawingCollisions=drawingIds.length?await tx.select().from(worldAtlasDrawing).where(inArray(worldAtlasDrawing.id,drawingIds)):[];
        if(drawingCollisions.some(d=>d.mapId!==map.id||d.worldId!==worldId))throw unavailable();
        await saveGeographies(tx,worldId,draft.geographies);
        const geographies=await tx.select().from(worldGeography).where(eq(worldGeography.worldId,worldId));
        for(const f of draft.features) {
          const g=geographies.find(g=>g.id===f.geographyId),old=previous.find(n=>n.id===f.id);
          if(!g)throw unavailable();if(g.archivedAt&&!old)throw new WorldError("Restore this geography before placing a new feature.",400);
          if(old&&old.geographyId!==f.geographyId)throw new WorldError("A saved feature retains its geography identity. Add a distinct feature for another geography.",400);
          if((f.geometry.type==="point")!==(g.kind==="location"))throw new WorldError("Locations use markers; continents and islands use closed outlines.",400);
          await tx.insert(worldAtlasFeature).values({id:f.id,worldId,mapId:map.id,geographyId:f.geographyId,geometry:f.geometry,archivedAt:f.archived?new Date():null}).onConflictDoUpdate({target:worldAtlasFeature.id,set:{geometry:f.geometry,archivedAt:f.archived?old?.archivedAt??new Date():null}});
        }
        for(const [sortOrder,d] of incoming.entries()){
          const old=oldDrawings.find(n=>n.id===d.id),g=d.geographyId?geographies.find(g=>g.id===d.geographyId):null;
          if(d.geographyId&&!g)throw unavailable();
          if(g?.archivedAt&&!old)throw new WorldError("Restore this geography before adding linked artwork.",400);
          if(old&&(old.geographyId!==d.geographyId||old.content.type!==d.type))throw new WorldError("Saved drawings retain their type and geography identity.",400);
          if(d.type==="terrain"&&d.geographyId)throw new WorldError("Decorative terrain strokes do not need geography records.",400);
          if(d.type==="symbol"&&["village","city","castle","tower","ruin","port"].includes(d.kind)&&(!g||g.kind!=="location"))throw new WorldError("Link a landmark or settlement symbol to a location in this World.",400);
          const archivedAt=d.archived?old?.archivedAt??new Date():null;
          await tx.insert(worldAtlasDrawing).values({id:d.id,worldId,mapId:map.id,geographyId:d.geographyId,content:d,archivedAt,sortOrder}).onConflictDoUpdate({target:worldAtlasDrawing.id,set:{content:d,archivedAt,sortOrder}});
        }
        if(map.mapKind==="settlement"){if(!draft.settlementState||!draft.settlementShapes||!draft.settlementEntities)throw new WorldError("This settlement draft is incomplete. Reload its specialized editor.",400);await saveSettlement(tx,worldId,map.id,map.geographyId!,draft);}
        else if(draft.settlementShapes?.length||draft.settlementEntities?.length)throw new WorldError("Adopt this map as a settlement before adding settlement objects.",400);
        await tx.update(worldAtlasMap).set({settlementState:draft.settlementState??map.settlementState,presentation:draft.presentation??map.presentation,name:draft.name,description:draft.description,scope:draft.scope,revision:map.revision+1,updatedAt:new Date()}).where(eq(worldAtlasMap.id,map.id));
}
export async function changeAtlas(userId:string,worldId:string,input:unknown) {
  return worldWriteTransaction(userId,worldId,async tx=>{
    const c=command.parse(input);let result:string;
    if(c.action==="generate"||c.action==="duplicate") {
      const newId=c.action==="generate"?c.id:c.newId;
      const requestHash=createHash("sha256").update(JSON.stringify(c)).digest("hex");
      const [existing]=await tx.select().from(worldAtlasMap).where(eq(worldAtlasMap.id,newId));
      if(existing){if(existing.worldId!==worldId||existing.archivedAt||existing.generation?.requestHash!==requestHash)throw unavailable();return newId;}
      const sourceId=c.action==="duplicate"?c.id:c.sourceMapId,expected=c.action==="duplicate"?c.revision:c.sourceRevision;
      if((sourceId===null)!==(expected===null))throw new WorldError("A source map needs its saved revision.",400);
      const [source]=sourceId?await tx.select().from(worldAtlasMap).where(and(eq(worldAtlasMap.id,sourceId),eq(worldAtlasMap.worldId,worldId))):[];
      if(sourceId&&(!source||source.archivedAt))throw unavailable();if(source&&source.revision!==expected)throw conflict();
      let draft:MapDraft;
      if(c.action==="generate"){
        validate(()=>validateDescriptionSpec(c.spec));
        if(c.spec.interpretation?.warnings.length&&!c.descriptionWarningsAccepted)throw new WorldError("Review and acknowledge the description's unsupported or ambiguous details before saving.",400);
        draft=validate(()=>generateMap(c.spec,randomUUID)).draft;draft.name=c.name;draft.description=c.description;
      }else{
        const features=await tx.select().from(worldAtlasFeature).where(eq(worldAtlasFeature.mapId,source!.id));
        const drawings=await tx.select().from(worldAtlasDrawing).where(eq(worldAtlasDrawing.mapId,source!.id)).orderBy(asc(worldAtlasDrawing.sortOrder),asc(worldAtlasDrawing.id));
        const geographies=await tx.select().from(worldGeography).where(eq(worldGeography.worldId,worldId));
        const settlement=source!.mapKind==="settlement"?await settlementSource(tx,worldId,source!.id,source!.geographyId!):null;
        const ids=new Set([...(settlement?.settlementEntities??[]).map(e=>e.geographyId),...features.map(f=>f.geographyId),...drawings.flatMap(d=>d.geographyId?[d.geographyId]:[])]);
        draft={...(settlement?{...settlement,settlementShapes:settlement.settlementShapes.map(s=>({...s,id:randomUUID(),...(s.type!=="marker"?{points:s.points.map(p=>({...p,id:randomUUID()}))}:{})})),settlementState:source!.settlementState}:{}),name:c.name,description:source!.description,scope:source!.scope as MapDraft["scope"],presentation:source!.presentation,
          features:features.map(f=>({id:randomUUID(),geographyId:f.geographyId,archived:!!f.archivedAt,geometry:f.geometry.type==="polygon"?{...f.geometry,points:f.geometry.points.map(p=>({...p,id:randomUUID()}))}:f.geometry})),
          drawings:drawings.map(({content:d})=>({...d,id:randomUUID(),...(d.type==="terrain"||d.type==="path"?{points:d.points.map(p=>({...p,id:randomUUID()}))}:{})})),
          geographies:geographies.filter(g=>ids.has(g.id)).map(g=>({id:g.id,revision:g.revision,name:g.name,description:g.description,kind:g.kind as GeographyDraft["kind"],parentId:g.parentId}))};
      }
      const generation=generationProvenanceSchema.parse({version:1,kind:c.action==="generate"?"generated":"duplicate",requestId:newId,requestHash,createdBy:userId,createdAt:new Date().toISOString(),sourceMapId:sourceId,sourceRevision:expected,spec:c.action==="generate"?c.spec:source!.generation?.spec??null});
      const [created]=await tx.insert(worldAtlasMap).values({id:newId,worldId,name:draft.name,description:draft.description,scope:draft.scope,mapKind:c.action==="duplicate"?source!.mapKind:"generic",settlementState:c.action==="duplicate"?source!.settlementState:defaultSettlementState(),generation,sourceMapId:sourceId,geographyId:c.action==="duplicate"?source!.geographyId:null}).returning();
      await saveMapContent(tx,worldId,created,draft);
      if(c.action==="duplicate"){
        const links=await tx.select().from(worldAtlasConnection).where(eq(worldAtlasConnection.sourceMapId,source!.id));
        for(const link of links)await tx.insert(worldAtlasConnection).values({id:randomUUID(),worldId,sourceMapId:newId,geographyId:link.geographyId,destinationMapId:link.destinationMapId});
      }result=newId;
    }
    else if(c.action==="create") {
      if(c.settlement){if(c.mapKind!=="settlement"||c.settlement.context!=="settlement"||c.settlement.kind!=="location"||c.settlement.revision!==null||c.settlement.id!==c.geographyId)throw new WorldError("Create a new settlement location for this chart.",400);await saveGeographies(tx,worldId,[c.settlement]);}
      if(c.geographyId){const [g]=await tx.select().from(worldGeography).where(and(eq(worldGeography.id,c.geographyId),eq(worldGeography.worldId,worldId)));if(!g||g.archivedAt)throw unavailable();if(c.mapKind==="settlement"&&(g.kind!=="location"||g.context!=="settlement"))throw new WorldError("Choose a settlement location for this chart.",400);}
      if(c.mapKind==="settlement"&&!c.geographyId)throw new WorldError("A settlement map needs its settlement place.",400);
      result=randomUUID();await tx.insert(worldAtlasMap).values({id:result,worldId,name:c.name,description:c.description,scope:c.scope,mapKind:c.mapKind??"generic",geographyId:c.geographyId??null});
    }
    else if(c.action==="geography") {await saveGeographies(tx,worldId,[c.draft]);result=c.draft.id;}
    else if(c.action==="archive-geography"||c.action==="restore-geography") {
      const [g]=await tx.select().from(worldGeography).where(and(eq(worldGeography.id,c.id),eq(worldGeography.worldId,worldId)));if(!g)throw unavailable();if(g.revision!==c.revision)throw conflict();
      if(c.action==="archive-geography") {const [used]=await tx.select({id:worldAtlasFeature.id}).from(worldAtlasFeature).where(and(eq(worldAtlasFeature.geographyId,g.id),eq(worldAtlasFeature.worldId,worldId)));const [child]=await tx.select({id:worldGeography.id}).from(worldGeography).where(eq(worldGeography.parentId,g.id));const [drawingUse]=await tx.select({id:worldAtlasDrawing.id}).from(worldAtlasDrawing).where(and(eq(worldAtlasDrawing.geographyId,g.id),eq(worldAtlasDrawing.worldId,worldId)));const [subject]=await tx.select({id:worldAtlasMap.id}).from(worldAtlasMap).where(eq(worldAtlasMap.geographyId,g.id));const [connection]=await tx.select({id:worldAtlasConnection.id}).from(worldAtlasConnection).where(eq(worldAtlasConnection.geographyId,g.id));const [settlementUse]=await tx.select({id:worldSettlementEntity.geographyId}).from(worldSettlementEntity).where(eq(worldSettlementEntity.geographyId,g.id));if(used||child||drawingUse||subject||connection||settlementUse)throw new WorldError("This geography is linked to a map or child geography. Archive its map features instead; its stable identity is retained.",400);}
      await tx.update(worldGeography).set({archivedAt:c.action==="archive-geography"?new Date():null,revision:g.revision+1,updatedAt:new Date()}).where(eq(worldGeography.id,g.id));result=g.id;
    } else {
      const [map]=await tx.select().from(worldAtlasMap).where(and(eq(worldAtlasMap.id,c.id),eq(worldAtlasMap.worldId,worldId)));if(!map)throw unavailable();if(map.revision!==c.revision)throw conflict();
      if(c.action==="adopt-settlement"){const [g]=await tx.select().from(worldGeography).where(and(eq(worldGeography.id,c.geographyId),eq(worldGeography.worldId,worldId)));if(map.archivedAt||map.mapKind!=="generic"||!g||g.archivedAt||g.kind!=="location"||g.context!=="settlement")throw new WorldError("Choose an active settlement for a generic map. Its original source will be retained.",400);await tx.update(worldAtlasMap).set({mapKind:"settlement",geographyId:g.id,revision:map.revision+1,updatedAt:new Date()}).where(eq(worldAtlasMap.id,map.id));}
      else if(c.action==="associate"||c.action==="connect"){
        if(map.archivedAt)throw new WorldError("Restore this map before changing connections.",400);
        const [g]=c.geographyId?await tx.select().from(worldGeography).where(and(eq(worldGeography.id,c.geographyId),eq(worldGeography.worldId,worldId))):[];
        if(c.geographyId&&(!g||g.archivedAt))throw unavailable();
        if(c.action==="associate"){
          if(map.mapKind==="settlement"&&c.geographyId!==map.geographyId)throw new WorldError("A settlement map retains its settlement. Create another representation for a different place.",400);
          await tx.update(worldAtlasMap).set({geographyId:c.geographyId,revision:map.revision+1,updatedAt:new Date()}).where(eq(worldAtlasMap.id,map.id));
        }else{
          const [destination]=c.destinationMapId?await tx.select().from(worldAtlasMap).where(and(eq(worldAtlasMap.id,c.destinationMapId),eq(worldAtlasMap.worldId,worldId))):[];
          if(c.destinationMapId&&(!destination||destination.archivedAt||destination.id===map.id))throw unavailable();
          const key=and(eq(worldAtlasConnection.sourceMapId,map.id),eq(worldAtlasConnection.geographyId,c.geographyId));
          if(c.destinationMapId)await tx.insert(worldAtlasConnection).values({id:randomUUID(),worldId,sourceMapId:map.id,geographyId:c.geographyId,destinationMapId:c.destinationMapId}).onConflictDoUpdate({target:[worldAtlasConnection.sourceMapId,worldAtlasConnection.geographyId],set:{destinationMapId:c.destinationMapId,revision:sql`${worldAtlasConnection.revision}+1`,updatedAt:new Date()}});
          else await tx.delete(worldAtlasConnection).where(key);
          await tx.update(worldAtlasMap).set({revision:map.revision+1,updatedAt:new Date()}).where(eq(worldAtlasMap.id,map.id));
        }
      }
      else if(c.action!=="save")await tx.update(worldAtlasMap).set({archivedAt:c.action==="archive-map"?new Date():null,revision:map.revision+1,updatedAt:new Date()}).where(eq(worldAtlasMap.id,map.id));
      else {
        if(map.archivedAt)throw new WorldError("Restore this map before editing it.",400);
        validate(()=>validateMapDraft(c.draft));
        await saveMapContent(tx,worldId,map,c.draft);
      }result=map.id;
    }
    await tx.update(world).set({updatedAt:new Date()}).where(eq(world.id,worldId));return result;
  });
}
