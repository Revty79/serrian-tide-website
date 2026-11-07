import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { atlasAssetUsage } from "@/db/world-asset-schema";
import { atlasTemplate,atlasTemplateAssetUsage } from "@/db/world-template-schema";
import { nativeArtworkPins } from "./native-map-history-asset-access";
import { worldProtectedContent,worldScopeAllowed,type WorldConnection } from "./world-access-service";
import { type WorldScope } from "./world-permissions";

export const templateWorldScope=(family:string):WorldScope=>family==="town"?"settlements":family==="interior"?"interiors":family==="underground"?"underground":family==="craft"?"craft":"atlas";
import { permittedCompositionKinds } from "./world-resource-permissions";
/** Every cross-creator image pin is confined to this World and a readable resource family. */
export async function worldAssetPins(connection:WorldConnection,worldId:string){
  const kinds=permittedCompositionKinds(worldId);
  const usage=kinds.length?await connection.select().from(atlasAssetUsage).where(and(eq(atlasAssetUsage.worldId,worldId),inArray(atlasAssetUsage.kind,kinds))):[];
  const families=(["geography","town","interior","underground","craft","appearance"] as const).filter(f=>worldScopeAllowed(worldId,templateWorldScope(f))&&(f!=="underground"||worldProtectedContent(worldId)));
  const templatePins=families.length?await connection.select({assetId:atlasTemplateAssetUsage.assetId,assetVersion:atlasTemplateAssetUsage.assetVersion}).from(atlasTemplateAssetUsage).innerJoin(atlasTemplate,eq(atlasTemplate.id,atlasTemplateAssetUsage.templateId)).where(and(eq(atlasTemplate.worldId,worldId),inArray(atlasTemplate.family,families))):[];
  const historyPins=worldScopeAllowed(worldId,"appearances")&&worldScopeAllowed(worldId,"history")?await nativeArtworkPins(connection,worldId):[];
  return {usage,pins:[...usage,...templatePins,...historyPins]};
}
export function undergroundArtworkReadable(worldId:string,mapId:string){
  return worldProtectedContent(worldId)?sql`true`:sql`not exists(select 1 from world_underground_level l cross join lateral jsonb_each(l.design->'attributes') f where l.world_id=${worldId} and l.id=${mapId} and coalesce(f.value->>'visibility','ordinary')<>'ordinary')`;
}
