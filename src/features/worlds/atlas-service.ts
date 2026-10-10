import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { world } from "@/db/world-schema";
import { worldAtlasMap, worldAtlasFeature, worldGeography } from "@/db/world-atlas-schema";
import { WorldError, worldReadAccess, worldWriteTransaction } from "./world-service";
import { atlasId, geographyDraftSchema, mapDraftSchema, validateMapDraft, validateParents, type AtlasBundle, type GeographyDraft } from "./atlas";
const revision=z.number().int().positive();
const command=z.discriminatedUnion("action",[
  z.object({action:z.literal("create"),name:z.string().trim().min(1).max(160),description:z.string().max(12000),scope:z.enum(["world","continent","regional","local"])}).strict(),
  z.object({action:z.literal("save"),id:atlasId,revision,draft:mapDraftSchema}).strict(),
  z.object({action:z.enum(["archive-map","restore-map"]),id:atlasId,revision}).strict(),
  z.object({action:z.literal("geography"),draft:geographyDraftSchema}).strict(),
  z.object({action:z.enum(["archive-geography","restore-geography"]),id:atlasId,revision}).strict(),
]);
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
const unavailable=()=>new WorldError("This map or geography is unavailable.",404);
const conflict=()=>new WorldError("A newer map or geography was saved in another tab. Your draft is retained. Reload the saved map to compare before trying again.",409);
function validate(run:()=>void) {try{run();}catch(failure){throw new WorldError((failure as Error).message,400);}}
export async function getAtlas(userId:string,worldId:string,review=false):Promise<AtlasBundle> {
  const parent=await worldReadAccess(userId,worldId,review);
  return db.transaction(async tx=>{
    const maps=await tx.select().from(worldAtlasMap).where(eq(worldAtlasMap.worldId,worldId)).orderBy(asc(worldAtlasMap.createdAt),asc(worldAtlasMap.id));
    const features=await tx.select().from(worldAtlasFeature).where(eq(worldAtlasFeature.worldId,worldId)).orderBy(asc(worldAtlasFeature.id));
    const geographies=await tx.select().from(worldGeography).where(eq(worldGeography.worldId,worldId)).orderBy(asc(worldGeography.name),asc(worldGeography.id));
    return {canEdit:parent.ownerId===userId&&!parent.archivedAt&&!review,maps:maps.map(m=>({id:m.id,name:m.name,description:m.description,scope:m.scope as AtlasBundle["maps"][number]["scope"],width:m.width,height:m.height,revision:m.revision,archived:!!m.archivedAt,features:features.filter(f=>f.mapId===m.id).map(f=>({id:f.id,geographyId:f.geographyId,geometry:f.geometry,archived:!!f.archivedAt}))})),geographies:geographies.map(g=>({id:g.id,revision:g.revision,name:g.name,description:g.description,kind:g.kind as GeographyDraft["kind"],parentId:g.parentId,archived:!!g.archivedAt}))};
  },{isolationLevel:"repeatable read",accessMode:"read only"});
}
async function saveGeographies(tx:Tx,worldId:string,drafts:GeographyDraft[]) {
  const existing=await tx.select().from(worldGeography).where(eq(worldGeography.worldId,worldId));
  const all=new Map(existing.map(g=>[g.id,g]));
  for(const draft of drafts) {
    const old=all.get(draft.id);
    if(old) {
      const changed=["name","description","kind","parentId"].some(key=>old[key as keyof typeof old]!==draft[key as keyof GeographyDraft]);
      if(changed&&(old.revision!==draft.revision||old.archivedAt))throw old.archivedAt?new WorldError("Restore this geography before editing it.",400):conflict();
      if(old.kind!==draft.kind)throw new WorldError("A saved geography's kind is stable. Create another record for a different kind.",400);
      // Even unchanged stale metadata must not silently replace the latest record.
      if(old.revision!==draft.revision)throw conflict();
    } else {if(draft.revision!==null)throw unavailable();const [collision]=await tx.select({id:worldGeography.id}).from(worldGeography).where(eq(worldGeography.id,draft.id));if(collision)throw unavailable();}
    all.set(draft.id,{...old,...draft,revision:draft.revision??1,archivedAt:old?.archivedAt??null,worldId,createdAt:old?.createdAt??new Date(),updatedAt:new Date()});
  }
  for(const draft of drafts){const parent=draft.parentId?all.get(draft.parentId):null,old=existing.find(g=>g.id===draft.id);if(parent?.archivedAt&&old?.parentId!==draft.parentId)throw new WorldError("Restore the parent geography before creating a new relationship.",400);}
  validate(()=>validateParents([...all.values()]));
  for(const draft of drafts) {
    const old=existing.find(g=>g.id===draft.id),{id,revision:expected,...values}=draft;
    if(!old)await tx.insert(worldGeography).values({id,worldId,...values});
    else if(old.name!==draft.name||old.description!==draft.description||old.parentId!==draft.parentId)await tx.update(worldGeography).set({...values,revision:expected!+1,updatedAt:new Date()}).where(eq(worldGeography.id,id));
  }
}
export async function changeAtlas(userId:string,worldId:string,input:unknown) {
  return worldWriteTransaction(userId,worldId,async tx=>{
    const c=command.parse(input);let result:string;
    if(c.action==="create") {result=randomUUID();await tx.insert(worldAtlasMap).values({id:result,worldId,name:c.name,description:c.description,scope:c.scope});}
    else if(c.action==="geography") {await saveGeographies(tx,worldId,[c.draft]);result=c.draft.id;}
    else if(c.action==="archive-geography"||c.action==="restore-geography") {
      const [g]=await tx.select().from(worldGeography).where(and(eq(worldGeography.id,c.id),eq(worldGeography.worldId,worldId)));if(!g)throw unavailable();if(g.revision!==c.revision)throw conflict();
      if(c.action==="archive-geography") {const [used]=await tx.select({id:worldAtlasFeature.id}).from(worldAtlasFeature).where(and(eq(worldAtlasFeature.geographyId,g.id),eq(worldAtlasFeature.worldId,worldId)));const [child]=await tx.select({id:worldGeography.id}).from(worldGeography).where(eq(worldGeography.parentId,g.id));if(used||child)throw new WorldError("This geography is linked to a map or child geography. Archive its map features instead; its stable identity is retained.",400);}
      await tx.update(worldGeography).set({archivedAt:c.action==="archive-geography"?new Date():null,revision:g.revision+1,updatedAt:new Date()}).where(eq(worldGeography.id,g.id));result=g.id;
    } else {
      const [map]=await tx.select().from(worldAtlasMap).where(and(eq(worldAtlasMap.id,c.id),eq(worldAtlasMap.worldId,worldId)));if(!map)throw unavailable();if(map.revision!==c.revision)throw conflict();
      if(c.action!=="save")await tx.update(worldAtlasMap).set({archivedAt:c.action==="archive-map"?new Date():null,revision:map.revision+1,updatedAt:new Date()}).where(eq(worldAtlasMap.id,map.id));
      else {
        if(map.archivedAt)throw new WorldError("Restore this map before editing it.",400);
        validate(()=>validateMapDraft(c.draft));
        const previous=await tx.select().from(worldAtlasFeature).where(eq(worldAtlasFeature.mapId,map.id));
        if(previous.some(f=>!c.draft.features.some(n=>n.id===f.id)))throw new WorldError("Keep saved features in the map and archive unwanted shapes. Reload if your draft is incomplete.",400);
        const ids=c.draft.features.map(f=>f.id);
        const collisions=ids.length?await tx.select().from(worldAtlasFeature).where(inArray(worldAtlasFeature.id,ids)):[];
        if(collisions.some(f=>f.mapId!==map.id||f.worldId!==worldId))throw unavailable();
        await saveGeographies(tx,worldId,c.draft.geographies);
        const geographies=await tx.select().from(worldGeography).where(eq(worldGeography.worldId,worldId));
        for(const f of c.draft.features) {
          const g=geographies.find(g=>g.id===f.geographyId),old=previous.find(n=>n.id===f.id);
          if(!g)throw unavailable();if(g.archivedAt&&!old)throw new WorldError("Restore this geography before placing a new feature.",400);
          if(old&&old.geographyId!==f.geographyId)throw new WorldError("A saved feature retains its geography identity. Add a distinct feature for another geography.",400);
          if((f.geometry.type==="point")!==(g.kind==="location"))throw new WorldError("Locations use markers; continents and islands use closed outlines.",400);
          await tx.insert(worldAtlasFeature).values({id:f.id,worldId,mapId:map.id,geographyId:f.geographyId,geometry:f.geometry,archivedAt:f.archived?new Date():null}).onConflictDoUpdate({target:worldAtlasFeature.id,set:{geometry:f.geometry,archivedAt:f.archived?old?.archivedAt??new Date():null}});
        }
        await tx.update(worldAtlasMap).set({name:c.draft.name,description:c.draft.description,scope:c.draft.scope,revision:map.revision+1,updatedAt:new Date()}).where(eq(worldAtlasMap.id,map.id));
      }result=map.id;
    }
    await tx.update(world).set({updatedAt:new Date()}).where(eq(world.id,worldId));return result;
  });
}
