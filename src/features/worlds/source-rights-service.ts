import "server-only";
import {createHash,randomUUID} from "node:crypto";
import {and,desc,eq} from "drizzle-orm";
import {db} from "@/db";
import {world} from "@/db/world-schema";
import {atlasSource,atlasSourceReview} from "@/db/world-source-rights-schema";
import {worldAccessAudit} from "@/db/world-collaboration-schema";
import {activeWorldSession,authorizeWorldRead,databaseClock,lockWorldForWrite,worldActor} from "./world-access-service";
import {worldRequestAuthority} from "./world-authorization-context";
import {WorldError} from "./world-errors";
import {sourceRightsCommandSchema,type RightsSummary} from "./source-rights";
import {mandatorySourceCredits,recordSourceUse,requireSourceRights,rightsProblems,rightsSources,sourceRightsAvailable,worldRightsSources} from "./source-rights-store";
import {publicExportCredit} from "./atlas-export";

export async function readSourceRights(userId:string,worldId:string,review=false):Promise<RightsSummary>{
 const access=await authorizeWorldRead(userId,worldId,review,"shell"),actor=await worldActor(userId);
 const manager=access.permission.role==="owner"||access.permission.role==="administrator-review";
 if(!await sourceRightsAvailable())return{available:false,sources:[],uses:[],credits:[],holds:["Source review requires migration 0162."],canRegister:false,canReview:false};
 return db.transaction(async tx=>{
  const {sources,usages}=await worldRightsSources(tx,worldId);
  const library=manager?await tx.select({id:atlasSource.id}).from(atlasSource).where(eq(atlasSource.ownerId,access.ownerId)):[];
  const all=manager?await rightsSources(tx,[...new Set([...sources.map(s=>s.id),...library.map(s=>s.id)])]):[];
  return{available:true,sources:all,uses:manager?usages.map(u=>({sourceId:u.sourceId,kind:u.kind,targetId:u.targetId,version:u.version,note:u.note})):[],credits:mandatorySourceCredits(sources),holds:manager?[...new Set(rightsProblems(sources,["display","modify","customer-access","digital-images","print","editable-data"],true))]:[],canRegister:access.permission.role==="owner"&&access.permission.canEdit,canReview:manager&&actor.admin};
 },{accessMode:"read only",isolationLevel:"repeatable read"});
}
/** Review authority is administrative and auditable; it is never a content-editing lease. */
export async function changeSourceRights(userId:string,worldId:string,input:unknown){
 const c=sourceRightsCommandSchema.parse(input),hash=createHash("sha256").update(JSON.stringify(c)).digest("hex");
 return db.transaction(async tx=>{
  await requireSourceRights(tx);
  const [parent]=await tx.select().from(world).where(eq(world.id,worldId)).for("update");if(!parent)throw new WorldError("This World is unavailable.",404);
  const authority=worldRequestAuthority();if(!authority||authority.userId!==userId||!await activeWorldSession(tx,userId,authority.sessionId,await databaseClock(tx)))throw new WorldError("Sign in again before recording source rights.",401);
  const actor=await worldActor(userId,tx);
  if(c.action==="review"){
   if(!actor.admin)throw new WorldError("Only an administrator can record a source-rights review. An uploader's license claim is not approval.",403);
   await authorizeWorldRead(userId,worldId,true,"shell",tx);
  }else await lockWorldForWrite(tx,userId,worldId,"owner",false,true);
  const [retry]=await tx.select().from(worldAccessAudit).where(and(eq(worldAccessAudit.worldId,worldId),eq(worldAccessAudit.actorId,userId),eq(worldAccessAudit.requestId,c.requestId)));
  if(retry){if(retry.inputHash!==hash)throw new WorldError("This request identity already records different source work.",409);return retry.result;}
  if(c.action==="register"){
   if(c.evidence.classification==="original")throw new WorldError("Original drawing needs no external-source registration. Use the original-artwork declaration for your own uploads.",400);
   for(const notice of [c.evidence.requiredCredits,c.evidence.sourceUrl,c.evidence.licenseUrl])publicExportCredit(notice);
   await tx.insert(atlasSource).values({id:c.sourceId,ownerId:userId,subjectKind:"reference",subjectId:c.sourceId,subjectVersion:"1",evidence:c.evidence,original:false});
  }else{
   const [source]=await tx.select().from(atlasSource).where(eq(atlasSource.id,c.sourceId)).for("update");
   const linked=(await worldRightsSources(tx,worldId)).sources.some(s=>s.id===c.sourceId);
   if(!source||source.ownerId!==parent.ownerId&&!linked)throw new WorldError("This source is unavailable in this World.",404);
   if(c.action==="attach"){
    await recordSourceUse(tx,worldId,source.id,"world",worldId,String(parent.revision),c.note);
   }else{
    const [latest]=(await rightsSources(tx,[source.id]))[0].reviews;
    if((latest?.revision??0)!==c.revision)throw new WorldError("Another review was recorded. Reload Sources & rights before deciding again.",409);
    if(c.review.decision==="approved"){
     if(source.evidence&&(source.evidence.cost!=="no-cost"||["incompatible","special-review"].includes(source.evidence.classification)))throw new WorldError("Paid, incompatible or special-review evidence cannot be cleared by this workflow. Preserve it for the separately authorized licensing decision.",409);
     publicExportCredit(c.review.credits);
     if((source.evidence||["geographic","raster"].includes(source.subjectKind))&&c.review.classification==="original")throw new WorldError("An external source cannot be relabelled as original creator work.",400);
    }
    await tx.insert(atlasSourceReview).values({sourceId:source.id,revision:c.revision+1,reviewerId:userId,requestId:c.requestId,inputHash:hash,review:c.review});
   }
  }
  const result={sourceId:c.sourceId,saved:true};
  await tx.insert(worldAccessAudit).values({id:randomUUID(),worldId,actorId:userId,action:`source-rights-${c.action}`,requestId:c.requestId,inputHash:hash,outcome:"accepted",before:null,after:{sourceId:c.sourceId},result});
  if(!await activeWorldSession(tx,userId,authority.sessionId,await databaseClock(tx)))throw new WorldError("Sign in again. No source-rights change was saved.",401);
  if(c.action==="review"){if(!(await worldActor(userId,tx)).admin)throw new WorldError("Administrator access changed.",403);}else await lockWorldForWrite(tx,userId,worldId,"owner",false,true);
  return result;
 });
}
export async function readSourceReviewHistory(userId:string,worldId:string,sourceId:string,offset=0,review=false){
 const access=await authorizeWorldRead(userId,worldId,review,"shell");
 if(!["owner","administrator-review"].includes(access.permission.role))throw new WorldError("Source review history is private.",404);
 await requireSourceRights(db);const [source]=await db.select().from(atlasSource).where(eq(atlasSource.id,sourceId));
 if(!source||source.ownerId!==access.ownerId&&!(await worldRightsSources(db,worldId)).sources.some(s=>s.id===sourceId))throw new WorldError("This source is unavailable.",404);
 const rows=await db.select().from(atlasSourceReview).where(eq(atlasSourceReview.sourceId,sourceId)).orderBy(desc(atlasSourceReview.revision)).limit(51).offset(offset);
 return{sourceId,reviews:rows.slice(0,50).map(r=>({...r.review,revision:r.revision,reviewerId:r.reviewerId,createdAt:r.createdAt.toISOString()})),next:rows.length>50?offset+50:null};
}
