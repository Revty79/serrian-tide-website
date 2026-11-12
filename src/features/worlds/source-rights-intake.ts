import "server-only";
import {randomUUID} from "node:crypto";
import {and,eq} from "drizzle-orm";
import {atlasSource,atlasSourceParent} from "@/db/world-source-rights-schema";
import {WorldError} from "./world-errors";
import type {WorldConnection} from "./world-access-service";
import type {AssetOrigin} from "./source-rights";
import {assetRightsId,assertSourceUse,recordSourceUse,requireSourceRights,rightsSources,sourceRightsAvailable} from "./source-rights-store";

export async function recordAssetOrigin(tx:WorldConnection,ownerId:string,assetId:string,version:number,sha256:string,origin:AssetOrigin|undefined){
 if(!await sourceRightsAvailable(tx))return; // Legacy private authoring; distribution requires 0162.
 const parents:string[]=[];
 if(version>1)parents.push(await assetRightsId(tx,assetId,version-1));
 if(origin?.kind==="external"){
  const [s]=await rightsSources(tx,[origin.sourceId]);if(s.ownerId!==ownerId||s.subjectKind!=="reference")throw new WorldError("Select one of your registered external sources.",404);
  if(s.evidence?.fileSha256!==sha256)throw new WorldError("The uploaded file does not match the exact bytes in the registered source evidence.",409);
  parents.push(s.id);
 }
 const id=randomUUID();await tx.insert(atlasSource).values({id,ownerId,subjectKind:"asset",subjectId:assetId,subjectVersion:String(version),original:origin?.kind==="original",evidence:null});
 for(const parentId of new Set(parents))await tx.insert(atlasSourceParent).values({sourceId:id,parentId});
}
/** Existing provider/dataset/edition/hash provenance stays authoritative. Review supplements it. */
export async function verifiedGeographicSource(tx:WorldConnection,ownerId:string,p:{provider:string;dataset:string;edition:string;fileSha256:string;license:string;licenseUrl:string;sourceUrl:string}){
 await requireSourceRights(tx);
 const candidates=await tx.select().from(atlasSource).where(and(eq(atlasSource.ownerId,ownerId),eq(atlasSource.subjectKind,"reference")));
 const s=candidates.find(s=>s.evidence&&["provider","dataset","edition","fileSha256","license","licenseUrl","sourceUrl"].every(k=>s.evidence![k as keyof typeof p]===p[k as keyof typeof p]));
 if(!s)throw new WorldError("Register and review this exact provider, dataset, edition, file hash and license in Sources & rights before importing it.",409);
 await assertSourceUse(tx,s.id,["display","modify"],ownerId);return s.id;
}
export async function recordGeographicSource(tx:WorldConnection,ownerId:string,worldId:string,parentId:string,kind:"geographic"|"raster",subjectId:string,version:string){
 let [source]=await tx.select().from(atlasSource).where(and(eq(atlasSource.subjectKind,kind),eq(atlasSource.subjectId,subjectId),eq(atlasSource.subjectVersion,version)));
 if(!source){[source]=await tx.insert(atlasSource).values({id:randomUUID(),ownerId,subjectKind:kind,subjectId,subjectVersion:version,original:false}).returning();await tx.insert(atlasSourceParent).values({sourceId:source.id,parentId});}
 await recordSourceUse(tx,worldId,source.id,kind,subjectId,version,"External source; original dataset and accepted revision remain authoritative.");return source.id;
}
