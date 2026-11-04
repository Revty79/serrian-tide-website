import "server-only";
import {and,eq} from "drizzle-orm";
import {db} from "@/db";
import {atlasAsset,atlasAssetVersion,atlasComposition,atlasCompositionVersion,atlasAssetUsage} from "@/db/world-asset-schema";
import {compositionSchema,validateComposition,type AssetComposition,type AssetFrame,type CompositionTarget} from "./atlas-assets";
import {artworkAsset} from "./terrain-artwork-assets";
import {WorldError} from "./world-service";
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Only called inside an authorized native map-creation transaction. No new files are written. */
export async function createTemplateImages(tx:Tx,userId:string,worldId:string,target:CompositionTarget,frame:AssetFrame,layer?:AssetComposition){
 if(!layer?.placements.length)return;
 try{compositionSchema.parse(layer);validateComposition(layer,frame);}catch(e){throw new WorldError((e as Error).message,400);}
 const [existing]=await tx.select().from(atlasComposition).where(and(eq(atlasComposition.worldId,worldId),eq(atlasComposition.kind,target.kind),eq(atlasComposition.mapId,target.id)));if(existing)throw new WorldError("The new drawing already has an image layout. Its original layers are retained.",409);
 const refs=[...new Map(layer.placements.filter(p=>!artworkAsset(p.assetId)).map(p=>[p.assetId+":"+p.version,p])).values()];
 for(const p of refs){const [a]=await tx.select({ownerId:atlasAsset.ownerId,archived:atlasAsset.archived}).from(atlasAsset).innerJoin(atlasAssetVersion,and(eq(atlasAssetVersion.assetId,atlasAsset.id),eq(atlasAssetVersion.version,p.version))).where(eq(atlasAsset.id,p.assetId));if(!a||a.ownerId!==userId)throw new WorldError("This private template image is unavailable.",404);if(a.archived)throw new WorldError("Restore the archived reference image before creating another drawing from this template.",409);}
 const row={worldId,kind:target.kind,mapId:target.id,revision:1,layer};await tx.insert(atlasComposition).values(row);await tx.insert(atlasCompositionVersion).values(row);if(refs.length)await tx.insert(atlasAssetUsage).values(refs.map(p=>({worldId,kind:target.kind,mapId:target.id,revision:1,assetId:p.assetId,assetVersion:p.version})));
}
