import "server-only";
import {and,eq,gte,or,sql} from "drizzle-orm";
import {atlasSource,atlasSourceParent,atlasSourceReview,atlasSourceUse} from "@/db/world-source-rights-schema";
import {worldAccessAudit} from "@/db/world-collaboration-schema";
import type {WorldConnection} from "./world-access-service";
import {referenceWithdrawalReceiptSchema,type ReferenceWithdrawal} from "./source-rights";
import {WorldError} from "./world-errors";

/** Append-only corrections apply only to an unused explicit reference. They
 * never clear a source, change its evidence, or remove a derivation. */
export async function referenceWithdrawals(tx:WorldConnection,worldId:string):Promise<ReferenceWithdrawal[]>{
 const rows=await tx.select({after:worldAccessAudit.after,createdAt:worldAccessAudit.createdAt}).from(worldAccessAudit).where(and(eq(worldAccessAudit.worldId,worldId),eq(worldAccessAudit.action,"source-rights-withdraw-unused-reference"),eq(worldAccessAudit.outcome,"accepted")));
 return rows.map(row=>{const receipt=referenceWithdrawalReceiptSchema.safeParse(row.after);if(!receipt.success)throw new WorldError("An unused-reference correction receipt is invalid. Preserve the source records for administrator review.",409);return {sourceId:receipt.data.sourceId,reason:receipt.data.reason,createdAt:row.createdAt.toISOString()};});
}

/** Caller holds the same World row lock as every accepted content write.
 * The original A3 reference attachment is always a single cumulative use.
 * Any accepted write after it conservatively makes withdrawal impossible,
 * even if that write appears unrelated or is subsequently undone. */
export async function unusedReferenceReceipt(tx:WorldConnection,worldId:string,source:typeof atlasSource.$inferSelect,reason:string){
 if(source.subjectKind!=="reference"||source.original||!source.evidence)throw new WorldError("Only an unused explicit reference can be withdrawn. Imported material and derivations retain their source rights.",409);
 if((await referenceWithdrawals(tx,worldId)).some(row=>row.sourceId===source.id))throw new WorldError("This unused reference was already withdrawn. Its evidence and reviews remain retained.",409);
 const uses=await tx.select().from(atlasSourceUse).where(and(eq(atlasSourceUse.worldId,worldId),eq(atlasSourceUse.sourceId,source.id))).limit(2);
 if(uses.length!==1||uses[0].kind!=="world"||uses[0].targetId!==worldId)throw new WorldError("Withdrawal requires exactly one explicit World-reference attachment and no accepted material uses.",409);
 const approved=await tx.select({id:atlasSourceReview.sourceId}).from(atlasSourceReview).where(and(eq(atlasSourceReview.sourceId,source.id),sql`${atlasSourceReview.review}->>'decision'='approved'`)).limit(1);
 if(approved.length)throw new WorldError("A reference with any recorded approval cannot be withdrawn. Its cumulative rights and later holds remain authoritative.",409);
 const ancestry=await tx.select({id:atlasSourceParent.sourceId}).from(atlasSourceParent).where(or(eq(atlasSourceParent.sourceId,source.id),eq(atlasSourceParent.parentId,source.id))).limit(1);
 if(ancestry.length)throw new WorldError("A reference with source ancestry or derived material cannot be withdrawn.",409);
 const [attachment]=await tx.select({createdAt:worldAccessAudit.createdAt}).from(worldAccessAudit).where(and(eq(worldAccessAudit.worldId,worldId),eq(worldAccessAudit.action,"source-rights-attach"),eq(worldAccessAudit.outcome,"accepted"),sql`${worldAccessAudit.after}->>'sourceId'=${source.id}`)).orderBy(worldAccessAudit.createdAt,worldAccessAudit.id).limit(1);
 if(!attachment)throw new WorldError("The original attachment audit is unavailable. Keep the cumulative reference for administrator review.",409);
 const content=await tx.select({id:worldAccessAudit.id}).from(worldAccessAudit).where(and(eq(worldAccessAudit.worldId,worldId),eq(worldAccessAudit.action,"content-write"),eq(worldAccessAudit.outcome,"accepted"),gte(worldAccessAudit.createdAt,attachment.createdAt))).limit(1);
 if(content.length)throw new WorldError("Accepted World content changed after this reference was attached. Its cumulative source link must remain; Undo does not remove derivation.",409);
 return referenceWithdrawalReceiptSchema.parse({sourceId:source.id,reason,firstUseAt:attachment.createdAt.toISOString(),proof:"never-approved-no-accepted-content-since-attachment"});
}
