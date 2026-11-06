import "server-only";
import { and, eq,sql } from "drizzle-orm";
import { worldBuildingFloor, worldBuildingInterior, worldBuildingInteriorSource } from "@/db/world-building-floor-schema";
import { nativeResource, type NativeContentContext } from "./native-map-history-context";
import { nativeChoices, type NativeHistoryTx } from "./native-map-history-store";
import { nativeObjectPresent, resolveNativeHistory } from "./native-map-history";
import { nativeConditions } from "./native-map-history-conditions";
import { assertNativeTarget } from "./native-map-history-resources";
import type { TownMapBundle } from "./town-map";
import { WorldError } from "./world-service";

/** Identity navigation reads this dated exterior first. It never resolves the
 * building against a current-day footprint or returns current floor geometry. */
export async function nativeFloorIdentities(tx: NativeHistoryTx, context: NativeContentContext, townMapId: string, featureId: string) {
  assertNativeTarget(context, townMapId, "town");
  const town = ((await nativeResource(tx, context, "town")).payload as unknown as { bundle: TownMapBundle }).bundle.document!;
  const feature = town.design.features.find(feature => feature.id === featureId && feature.kind === "building" && feature.shape === "area" && !feature.archived);
  if (!feature || !nativeObjectPresent((await nativeConditions(tx, context)).values, featureId)) throw new WorldError("This saved building is not present in the selected dated Town appearance.", 409);
  const [binding] = await tx.select().from(worldBuildingInteriorSource).where(and(eq(worldBuildingInteriorSource.worldId, context.worldId), eq(worldBuildingInteriorSource.townMapId, townMapId), eq(worldBuildingInteriorSource.featureId, featureId)));
  const [shared] = !binding && feature.placeId ? await tx.select({ id: worldBuildingInterior.id }).from(worldBuildingInterior).where(and(eq(worldBuildingInterior.worldId, context.worldId), eq(worldBuildingInterior.placeId, feature.placeId))) : [];
  const buildingId = binding?.buildingId ?? shared?.id ?? null;
  return { available: true, buildingId, floors: buildingId?await nativeFloorChoices(tx,context,buildingId):[], reason: "Floor identities are shared. Each floor resolves its own dated coverage before any geometry is shown." };
}
export async function nativeFloorChoices(tx:NativeHistoryTx,context:NativeContentContext,buildingId:string){
  const floors = await tx.select({ id: worldBuildingFloor.id, buildingId: worldBuildingFloor.buildingId, name: worldBuildingFloor.name, order: worldBuildingFloor.order, elevation: worldBuildingFloor.elevation, revision: worldBuildingFloor.revision, archived: worldBuildingFloor.archived }).from(worldBuildingFloor).where(and(eq(worldBuildingFloor.worldId, context.worldId), eq(worldBuildingFloor.buildingId, buildingId))).limit(65);
  if (floors.length > 64) throw new WorldError("This building exceeds its retained 64-floor identity bound. Its sources remain intact.", 413);
  const choices = [];
  for (const floor of floors) {
    const appearance = resolveNativeHistory(await nativeChoices(tx, context.worldId, context.scope.timelineId, { kind: "floor", id: floor.id }), { kind: "floor", id: floor.id }, context.scope.year);
    const metadata=appearance?(await tx.execute<{name:string;order:number;elevation:number|null;revision:number;archived:boolean}>(sql`select c.payload#>>'{bundle,document,name}' name,(c.payload#>>'{bundle,document,order}')::int "order",(c.payload#>>'{bundle,document,elevation}')::float8 elevation,(c.payload#>>'{bundle,document,revision}')::int revision,(c.payload#>>'{bundle,document,archived}')::boolean archived from world_map_state_component_ref r join world_map_state_component c on c.id=r.component_id and c.world_id=${context.worldId} where r.version_id=${appearance.versionId} and r.world_id=${context.worldId} and r.key='floor'`)).rows[0]:undefined;
    choices.push({ ...floor,...metadata, archived:metadata?.archived??false, historicalCoverage: metadata ? "established" as const : "unknown" as const });
  }
  return choices;
}
