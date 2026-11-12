import "server-only";
import {and,desc,eq,inArray,sql} from "drizzle-orm";
import {db} from "@/db";
import {atlasSource,atlasSourceParent,atlasSourceReview,atlasSourceUse} from "@/db/world-source-rights-schema";
import {atlasAssetUsage} from "@/db/world-asset-schema";
import {WorldError} from "./world-errors";
import {sourceUseProblem,type RightsSource,type SourceUse} from "./source-rights";
import type {WorldConnection} from "./world-access-service";

export async function sourceRightsAvailable(tx:Pick<WorldConnection,"execute">=db){
 return !!(await tx.execute<{ok:boolean}>(sql`select to_regclass('public.atlas_source_rights') is not null and to_regclass('public.atlas_source_review') is not null and to_regclass('public.atlas_source_use') is not null and to_regclass('public.atlas_source_parent') is not null as ok`)).rows[0]?.ok;
}
export async function requireSourceRights(tx:WorldConnection){if(!await sourceRightsAvailable(tx))throw new WorldError("Migration 0162 is required for source review and commercial distribution. Existing content is preserved.",409);}
export async function rightsSources(tx:WorldConnection,ids:string[]):Promise<RightsSource[]>{
 const result:RightsSource[]=[],seen=new Set<string>();let pending=[...new Set(ids)];
 for(let depth=0;pending.length;depth++){
  if(depth>32||seen.size+pending.length>512)throw new WorldError("Source lineage exceeds the bounded review allowance. Ask an administrator to inspect the retained provenance.",409);
  const rows=await tx.select().from(atlasSource).where(inArray(atlasSource.id,pending));
  if(rows.length!==pending.length)throw new WorldError("A required source-rights record is missing. Restore its paired database before distributing this content.",409);
  // Runtime authorization only needs the latest decision, not an ever-growing audit log.
  const reviews=await tx.selectDistinctOn([atlasSourceReview.sourceId]).from(atlasSourceReview).where(inArray(atlasSourceReview.sourceId,pending)).orderBy(atlasSourceReview.sourceId,desc(atlasSourceReview.revision));
  const parents=await tx.select().from(atlasSourceParent).where(inArray(atlasSourceParent.sourceId,pending));
  for(const row of rows){seen.add(row.id);result.push({...row,createdAt:row.createdAt.toISOString(),parentIds:parents.filter(p=>p.sourceId===row.id).map(p=>p.parentId),reviews:reviews.filter(r=>r.sourceId===row.id).map(r=>({...r.review,revision:r.revision,reviewerId:r.reviewerId,createdAt:r.createdAt.toISOString()}))});}
  pending=[...new Set(parents.map(p=>p.parentId).filter(id=>!seen.has(id)))];
 }
 return result;
}
export function rightsProblems(sources:RightsSource[],uses:readonly SourceUse[],output=false){return sources.flatMap(s=>uses.flatMap(use=>{const problem=sourceUseProblem(s,use,output);return problem?[`${s.evidence?.dataset??s.subjectKind}: ${problem}`]:[];}));}
export function mandatorySourceCredits(sources:RightsSource[]){return [...new Set(sources.flatMap(s=>{const r=s.reviews[0];if(r?.decision!=="approved")return[];const e=s.evidence;return [r.credits,e?.requiredCredits,e?`${e.provider} / ${e.dataset} / ${e.edition}. Source: ${e.sourceUrl}. License: ${e.license} ${e.licenseUrl}. Changes: ${e.modifications}`:null].filter((v):v is string=>!!v?.trim()).map(v=>`External source: ${v.trim()}`);} ))];}
export async function worldRightsSources(tx:WorldConnection,worldId:string){
 const usages=await tx.select().from(atlasSourceUse).where(eq(atlasSourceUse.worldId,worldId));
 // Usage is cumulative: removing a layer never erases derivation or old versions.
 const sources=await rightsSources(tx,[...new Set(usages.map(u=>u.sourceId))]);
 return {sources,usages};
}
/** Runs inside the original content transaction, covering templates and native copies too. */
export async function retainArtworkSourceUses(tx:WorldConnection,worldId:string){
 const pending=await tx.select({assetId:atlasAssetUsage.assetId,assetVersion:atlasAssetUsage.assetVersion,kind:atlasAssetUsage.kind,mapId:atlasAssetUsage.mapId,revision:atlasAssetUsage.revision}).from(atlasAssetUsage).where(and(eq(atlasAssetUsage.worldId,worldId),sql`not exists(select 1 from atlas_source_use u join atlas_source_rights s on s.id=u.source_id where u.world_id=${worldId} and s.subject_kind='asset' and s.subject_id=${atlasAssetUsage.assetId} and s.subject_version=${atlasAssetUsage.assetVersion}::text and u.kind=${atlasAssetUsage.kind} and u.target_id=${atlasAssetUsage.mapId} and u.version=${atlasAssetUsage.revision}::text)`));
 for(const p of pending){const id=await assetRightsId(tx,p.assetId,p.assetVersion);await assertSourceUse(tx,id,["display","modify"]);await recordSourceUse(tx,worldId,id,p.kind,p.mapId,String(p.revision),"Retained artwork composition; all accepted revisions remain linked.");}
}
export async function assertWorldSourceUse(tx:WorldConnection,worldId:string,uses:readonly SourceUse[],output=false){
 await requireSourceRights(tx);const {sources}=await worldRightsSources(tx,worldId),problems=rightsProblems(sources,uses,output);
 if(problems.length)throw new WorldError(`Source licensing hold. ${[...new Set(problems)].slice(0,4).join(" ")} Open Sources & rights in this World. Accepted history is preserved.`,409);
 return sources;
}
export async function assertSourceUse(tx:WorldConnection,sourceId:string,uses:readonly SourceUse[],ownerId?:string){
 await requireSourceRights(tx);const sources=await rightsSources(tx,[sourceId]);
 if(ownerId&&sources[0]?.ownerId!==ownerId)throw new WorldError("This source is unavailable.",404);
 const problems=rightsProblems(sources,uses);if(problems.length)throw new WorldError(`Source licensing hold. ${problems[0]} Open Sources & rights before using this material.`,409);
 return sources;
}
export async function recordSourceUse(tx:WorldConnection,worldId:string,sourceId:string,kind:string,targetId:string,version:string,note:string){
 await tx.insert(atlasSourceUse).values({worldId,sourceId,kind,targetId,version,note}).onConflictDoNothing();
}
export async function assetRightsId(tx:WorldConnection,assetId:string,version:number){const [s]=await tx.select({id:atlasSource.id}).from(atlasSource).where(and(eq(atlasSource.subjectKind,"asset"),eq(atlasSource.subjectId,assetId),eq(atlasSource.subjectVersion,String(version))));if(!s)throw new WorldError("This artwork version has no source review. Preserve it and request an administrator review before reuse.",409);return s.id;}
