import "server-only";
import {and,eq} from "drizzle-orm";
import {db} from "@/db";
import {atlasTemplate,atlasTemplateVersion} from "@/db/world-template-schema";
import {atlasSourceUse} from "@/db/world-source-rights-schema";
import {authorizedWorldWrite,authorizeWorldRead} from "./world-access-service";
import {WorldError} from "./world-errors";
import {builtInTemplate} from "./map-template-catalogue";
import {assertSourceUse,assetRightsId,recordSourceUse,sourceRightsAvailable,worldRightsSources} from "./source-rights-store";
import type {WorldConnection} from "./world-access-service";

export async function checkTemplateSourceRead(worldId:string,sourceWorldId:string,templateId:string){
 if(!await sourceRightsAvailable())return;
 const source=await worldRightsSources(db,sourceWorldId),target=await worldRightsSources(db,worldId),ids=new Set(target.sources.map(s=>s.id));
 for(const s of source.sources){await assertSourceUse(db,s.id,["display","modify"]);if(!ids.has(s.id))throw new WorldError("Retain this template’s source links before loading its editable content. Use the template selector with editing control.",409);}
 const prior=await db.select().from(atlasSourceUse).where(and(eq(atlasSourceUse.kind,"template"),eq(atlasSourceUse.targetId,templateId)));
 for(const u of prior){await assertSourceUse(db,u.sourceId,["display","modify"]);if(!ids.has(u.sourceId))throw new WorldError("Retain this template's complete source links using its selector before loading editable content.",409);}
}
/** Each immutable template revision retains the capturing World's provenance and exact images. */
export async function retainSavedTemplateSources(tx:WorldConnection,worldId:string,templateId:string,revision:number,images:{assetId:string;version:number}[]){
 if(!await sourceRightsAvailable(tx))return;
 const {sources}=await worldRightsSources(tx,worldId);
 const prior=await tx.select().from(atlasSourceUse).where(and(eq(atlasSourceUse.kind,"template"),eq(atlasSourceUse.targetId,templateId)));
 const ids=new Set([...sources.map(s=>s.id),...prior.map(u=>u.sourceId)]);
 for(const image of images)ids.add(await assetRightsId(tx,image.assetId,image.version));
 for(const id of ids){await assertSourceUse(tx,id,["display","modify"]);await recordSourceUse(tx,worldId,id,"template",templateId,String(revision),"Provenance retained with this immutable template revision.");}
}
/** Deliberate selection retains source links before the editable template is returned. */
export async function retainTemplateSources(userId:string,worldId:string,templateId:string,revision?:number){
 await authorizeWorldRead(userId,worldId,false,"assets");
 if(builtInTemplate(templateId)||templateId.startsWith("atlas-style:"))return{retained:true};
 const [existing]=await db.select().from(atlasTemplate).where(eq(atlasTemplate.id,templateId));
 if(existing?.worldId===worldId)return{retained:true}; // Private inspection is not a new use.
 return authorizedWorldWrite(userId,worldId,async tx=>{
  const [head]=await tx.select().from(atlasTemplate).where(eq(atlasTemplate.id,templateId));
  if(!head||head.ownerId!==userId&&head.worldId!==worldId)throw new WorldError("This template is unavailable.",404);
  const [version]=await tx.select().from(atlasTemplateVersion).where(and(eq(atlasTemplateVersion.templateId,templateId),eq(atlasTemplateVersion.revision,revision??head.revision)));
  if(!version)throw new WorldError("This retained template version is unavailable.",404);
  const {sources}=await worldRightsSources(tx,head.worldId);
  for(const s of sources){await assertSourceUse(tx,s.id,["display","modify"]);await recordSourceUse(tx,worldId,s.id,"template",templateId,String(version.revision),"Source links retained before selecting an editable template.");}
  // Saved earlier in another World: preserve every earlier provenance link too.
  const previous=await tx.select().from(atlasSourceUse).where(and(eq(atlasSourceUse.kind,"template"),eq(atlasSourceUse.targetId,templateId)));
  for(const u of previous){await assertSourceUse(tx,u.sourceId,["display","modify"]);await recordSourceUse(tx,worldId,u.sourceId,"template",templateId,String(version.revision),u.note);}
  return{retained:true};
 },"assets");
}
