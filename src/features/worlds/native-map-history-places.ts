import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { worldGeography } from "@/db/world-atlas-schema";
import { townCommandSchema, normalizePlacePoint, type TownBundle, type TownResult } from "./world-towns";
import { getWorldTowns, saveTownInTransaction } from "./world-town-service";
import { nativeResource, type NativeContentContext } from "./native-map-history-context";
import { nativeAllRefinementIndex, nativeTerrainSource } from "./native-map-history-terrain-read";
import type { NativeHistoryTx } from "./native-map-history-store";
import type { NativeWriteResult } from "./native-map-history-write";
import { requireRegionalPath } from "./terrain-regional-scope";
import { boundedRegionalLayer } from "./terrain-regional-authoring-service";
import { assertNativeTarget } from "./native-map-history-resources";
import { WorldError } from "./world-service";

/** Permanent Town identity and date-specific position have separate authority.
 * A historical placement never inserts or updates world_map_place. */
export async function saveNativePlace(tx: NativeHistoryTx, context: NativeContentContext, raw: unknown): Promise<NativeWriteResult> {
  const command = townCommandSchema.parse(raw);
  if (command.action !== "place" && command.action !== "remove" && command.action !== "place-new") throw new WorldError("Use the shared Town record in Worlds to change its profile. This dated editor changes map appearances.", 409);
  assertNativeTarget(context, command.mapId, "terrain");
  const source = await nativeTerrainSource(tx, context), region = source.document.region;
  const world = { widthMetres: source.shape.displayWidth, heightMetres: source.shape.displayHeight, wrap: source.shape.wrap };
  if (!!region !== !!command.regional) throw new WorldError("Retain the exact regional source binding before changing a historical Town marker.", 409);
  if (region && command.regional) {
    const index = await nativeAllRefinementIndex(tx, context), pin = command.regional;
    if (pin.regionMapId !== command.mapId || pin.parentMapId !== region.parentMapId || pin.terrainId !== source.document.terrainId || pin.regionRevision !== region.revision || pin.sourceState !== index.sourceState) throw new WorldError("The dated regional geography changed. Your original placement request remains retained.", 409);
  }
  const row = await nativeResource(tx, context, "places"), value = structuredClone(row.payload) as unknown as TownBundle & { revision?: number };
  const townId = command.action === "place-new" ? command.requestId : command.townId;
  const old = value.placements.find(place => place.townId === townId);
  if (command.action !== "place-new" && (old ? old.revision !== command.revision : command.revision !== null)) throw new WorldError("A newer dated Town marker was saved. Your original request and draft remain retained.", 409);
  if (command.action === "remove" && (!old || old.removed)) throw new WorldError("This dated marker is already absent. Its Town identity remains retained.", 409);
  let town = value.towns.find(town => town.id === townId);
  if (command.action === "place-new") {
    const [collision] = await tx.select({ id: worldGeography.id }).from(worldGeography).where(eq(worldGeography.id, townId));
    if (collision) throw new WorldError("This identity request was already used. Retain the original request and choose a new creation intent.", 409);
    town = await saveTownInTransaction(tx, context.worldId, townId, command.draft, null);
    value.towns.push(town);
  } else if (!town) {
    const current = await getWorldTowns(context.userId, context.worldId, { townId });
    if (!current.town) throw new WorldError("Choose a saved Town in this World.", 404);
    town = current.town; value.towns.push(town);
  }
  const [identity] = await tx.select({ id: worldGeography.id }).from(worldGeography).where(and(eq(worldGeography.worldId, context.worldId), eq(worldGeography.id, townId)));
  if (!identity || !town || town.archived) throw new WorldError("Choose an available saved Town before placing its dated representation.", 409);
  if (old && region) boundedRegionalLayer(() => requireRegionalPath([old], 0, { frame: region.frame, footprint: region.footprint, world: { width: world.widthMetres, height: world.heightMetres, wrap: world.wrap } }, "The existing Town marker"));
  const point = command.action === "remove" ? old! : boundedRegionalLayer(() => normalizePlacePoint(command.x, command.y, world));
  if (region && command.action !== "remove") boundedRegionalLayer(() => requireRegionalPath([point], 0, { frame: region.frame, footprint: region.footprint, world: { width: world.widthMetres, height: world.heightMetres, wrap: world.wrap } }, "The Town placement"));
  if (!old && value.placements.length >= 1000) throw new WorldError("This dated World supports 1,000 retained Town markers. Saved appearances remain intact.", 400);
  const placement = { id: old?.id ?? randomUUID(), mapId: context.authority?.scope.target.id ?? context.scope.target.id, townId, name: town.name, category: town.category, revision: (old?.revision ?? 0) + 1, x: point.x, y: point.y, removed: command.action === "remove", archived: false, mapName: context.authority?.selected.name ?? context.selected.name };
  value.placements = old ? value.placements.map(place => place.id === old.id ? placement : place) : [...value.placements, placement];
  value.revision = row.revision + 1;
  const result: TownResult = { townId, placementId: placement.id, placementRevision: placement.revision };
  return { updates: [{ key: "places", kind: "places", payload: value as unknown as Record<string, unknown> }], result };
}
