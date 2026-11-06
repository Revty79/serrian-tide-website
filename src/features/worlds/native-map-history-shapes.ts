import "server-only";
import {assertNativeCraftObjectIdentities} from "./native-map-history-craft-identities";
import { and, eq } from "drizzle-orm";
import { worldTownPlace, worldShopLocation } from "@/db/world-town-commerce-schema";
import { townMapCommandSchema, validateTownDesign, type TownMapBundle } from "./town-map";
import { floorCommandSchema, floorLayer, validateFloor, type FloorBundle, type FloorDesign } from "./building-floor";
import { undergroundCommandSchema, validateUnderground, type UndergroundBundle } from "./underground";
import { assertUndergroundLayerChanges } from "./underground-guards";
import { CRAFT_LIMITS,craftCommandSchema, craftDraftSchema, deckDraftSchema, validateCraftSurface, type CraftBundle } from "./craft";
import { assetCommandSchema, validateComposition, type AssetFrame, type CompositionSaved } from "./atlas-assets";
import { artworkAsset } from "./terrain-artwork-assets";
import { atlasAsset, atlasAssetVersion } from "@/db/world-asset-schema";
import { nativeResource,nativeRelatedContext, type NativeContentContext } from "./native-map-history-context";
import {nativeObjectPresent} from "./native-map-history";
import {nativeConditions} from "./native-map-history-conditions";
import { nativeTerrainSource } from "./native-map-history-terrain-read";
import { assertNativeRevision, assertNativeTarget } from "./native-map-history-resources";
import { nativeContentHash, type NativeHistoryTx } from "./native-map-history-store";
import type { NativeWriteResult } from "./native-map-history-write";
import {boundedRegionalLayer} from "./terrain-regional-authoring-service";
import { WorldError } from "./world-service";

function preserveFloorObjects(previous: FloorDesign, design: FloorDesign) {
  const incoming = new Map(design.features.map(f => [f.id, f]));
  if (previous.layers.ground.locked && design.layers.ground.locked && previous.flooring !== design.flooring) throw new WorldError("Unlock Ground before changing its appearance.", 400);
  for (const old of previous.features) {
    const next = incoming.get(old.id), layer = floorLayer(old);
    if (!next || next.kind !== old.kind || next.variant !== old.variant || next.entityId !== old.entityId) throw new WorldError("Retain saved object identities and archive unwanted shapes.", 400);
    if (previous.layers[layer].locked && design.layers[layer].locked && nativeContentHash(old) !== nativeContentHash(next)) throw new WorldError("Unlock the layer before changing its saved objects.", 400);
  }
  for (const next of design.features) if (!previous.features.some(f => f.id === next.id) && previous.layers[floorLayer(next)].locked && design.layers[floorLayer(next)].locked) throw new WorldError("Unlock the layer before adding objects.", 400);
}
export async function saveNativeTown(tx: NativeHistoryTx, context: NativeContentContext, raw: unknown): Promise<NativeWriteResult> {
  const c = townMapCommandSchema.parse(raw);
  if(c.action==="lifecycle"){
    assertNativeTarget(context,c.mapId,"town");const value=structuredClone((await nativeResource(tx,context,"town")).payload) as unknown as {bundle:TownMapBundle},old=value.bundle.document!;assertNativeRevision(old.revision,c.revision);
    const revision=old.revision+1;value.bundle.document={...old,revision,archived:c.archived,canEdit:!c.archived&&context.canEdit};return {updates:[{key:"town",kind:"town",payload:value as unknown as Record<string,unknown>}],result:{id:old.id,revision}};
  }
  if (c.action !== "save") throw new WorldError("Use the appearance's archive controls for dated archival status. Choose an existing historical Town Map to edit.", 400);
  assertNativeTarget(context, c.mapId, "town");
  const value = structuredClone((await nativeResource(tx, context, "town")).payload) as unknown as { bundle: TownMapBundle }, old = value.bundle.document;
  if (!old || old.archived) throw new WorldError("Restore the dated Town representation before editing.", 409);
  assertNativeRevision(old.revision, c.revision);
  boundedRegionalLayer(()=>validateTownDesign(c.design,old.frame));
  const incoming = new Map(c.design.features.map(f => [f.id, f]));
  const layers = { road: "roads", district: "districts", building: "buildings", wall: "walls", water: "waterways", square: "districts", landmark: "landmarks", label: "labels" } as const;
  for (const feature of old.design.features) {
    const next = incoming.get(feature.id);
    if (!next || next.kind !== feature.kind) throw new WorldError("Retain saved Town object identities and archive unwanted representations.", 400);
    const layer = layers[feature.kind];
    if (old.design.layers[layer].locked && c.design.layers[layer].locked && nativeContentHash(feature) !== nativeContentHash(next)) throw new WorldError("Unlock the Town layer before changing its geometry.", 400);
  }
  for (const feature of c.design.features) {
    const prior = old.design.features.find(f => f.id === feature.id);
    if (feature.placeId && feature.placeId !== prior?.placeId) {
      const [place] = await tx.select().from(worldTownPlace).where(and(eq(worldTownPlace.geographyId, feature.placeId), eq(worldTownPlace.worldId, context.worldId), eq(worldTownPlace.townId, old.townId)));
      if (!place) throw new WorldError("Choose an established permanent Place in this same Town.", 400);
    }
    if (feature.shopLocationId && feature.shopLocationId !== prior?.shopLocationId) {
      const [shop] = await tx.select().from(worldShopLocation).where(and(eq(worldShopLocation.id, feature.shopLocationId), eq(worldShopLocation.worldId, context.worldId), eq(worldShopLocation.townId, old.townId)));
      if (!shop || shop.placeId && shop.placeId !== feature.placeId) throw new WorldError("Choose this same Town's existing Shop entrance and Place identity.", 400);
    }
  }
  const revision = old.revision + 1;
  value.bundle.document = { ...old, revision, name: c.name, design: c.design, history: [{ revision, requestId: c.requestId }, ...old.history].slice(0, 30) };
  return { updates: [{ key: "town", kind: "town", payload: value as unknown as Record<string, unknown> }], result: { id: old.id, revision } };
}
export async function saveNativeFloor(tx: NativeHistoryTx, context: NativeContentContext, raw: unknown): Promise<NativeWriteResult> {
  const c = floorCommandSchema.parse(raw);
  if (c.action !== "save") throw new WorldError("Open a dated floor and use its appearance controls before changing this historical interior.", 400);
  assertNativeTarget(context, c.floorId, "floor");
  const value = structuredClone((await nativeResource(tx, context, "floor")).payload) as unknown as { bundle: FloorBundle }, old = value.bundle.document, building = value.bundle.building;
  if (!old || !building || old.archived) throw new WorldError("Restore this dated floor before editing.", 409);
  assertNativeRevision(old.revision, c.revision); boundedRegionalLayer(()=>{validateFloor(c.design,building.frame);preserveFloorObjects(old.design,c.design);});
  const arrivals = new Set<string>(),dependencies:NonNullable<NativeWriteResult["dependencies"]>=[];
  for (const feature of c.design.features) if (!feature.archived && feature.variant === "object" && feature.kind === "transition" && feature.destination) {
    const destination = feature.destination;
    if(destination.floorId===old.id||destination.point.x>building.frame.width||destination.point.y>building.frame.height)throw new WorldError("Choose another floor in this same building and an arrival inside its frame.",400);
    const previous=old.design.features.find(value=>value.id===feature.id);
    if(previous?.variant!=="object"||nativeContentHash(previous.destination??null)!==nativeContentHash(destination)){
      const source=await nativeRelatedContext(tx,context,{kind:"floor",id:destination.floorId}),floor=((await nativeResource(tx,source,"floor")).payload as unknown as {bundle:FloorBundle}).bundle.document;
      if(!floor||floor.archived||floor.buildingId!==building.id||!nativeObjectPresent((await nativeConditions(tx,source)).values,floor.id)||!nativeObjectPresent((await nativeConditions(tx,context)).values,feature.id))throw new WorldError("Establish the intended floor and stairs at this same year before adding a new destination. Earlier retained links remain intact.",409);
      dependencies.push({target:source.scope.target,versionId:source.version.id});
    }
    const key = `${destination.floorId}:${destination.point.x}:${destination.point.y}`;
    if (arrivals.has(key)) throw new WorldError("Choose a separate stair arrival or retain one connection.", 400);
    arrivals.add(key);
  }
  const revision = old.revision + 1;
  value.bundle.document = { ...old, revision, name: c.name, order: c.order, elevation: c.elevation, design: c.design, history: [{ revision, requestId: c.requestId }, ...old.history].slice(0, 30) };
  return { updates: [{ key: "floor", kind: "floor", payload: value as unknown as Record<string, unknown> }],dependencies, result: { buildingId: building.id, floorId: old.id, revision } };
}
export async function saveNativeUnderground(tx: NativeHistoryTx, context: NativeContentContext, raw: unknown): Promise<NativeWriteResult> {
  const c = undergroundCommandSchema.parse(raw);
  if(c.action==="lifecycle"&&(c.kind==="site"||c.kind==="level")){
    if(context.scope.target.kind!=="underground")throw new WorldError("Open this dated level before changing its retained status.",409);
    const value=structuredClone((await nativeResource(tx,context,"underground")).payload) as unknown as {bundle:UndergroundBundle},old=value.bundle.document!,site=value.bundle.sites.find(site=>site.id===old.siteId)!;
    if(c.id!==(c.kind==="site"?site.id:old.id))throw new WorldError("Choose this appearance's recorded site or level.",409);
    assertNativeRevision(c.kind==="site"?site.revision:old.revision,c.revision);
    const revision=c.revision+1;
    if(c.kind==="site")value.bundle.sites=value.bundle.sites.map(row=>row.id===site.id?{...row,archived:c.archived,revision}:row);
    else value.bundle.document={...old,archived:c.archived,revision};
    return {updates:[{key:"underground",kind:"underground",payload:value as unknown as Record<string,unknown>}],result:{siteId:site.id,levelId:old.id,connectionId:null,revision}};
  }
  if (c.action !== "save") throw new WorldError("Choose an established dated underground level before changing it.", 400);
  assertNativeTarget(context, c.levelId, "underground");
  const value = structuredClone((await nativeResource(tx, context, "underground")).payload) as unknown as { bundle: UndergroundBundle }, old = value.bundle.document;
  const site = value.bundle.sites.find(s => s.id === old?.siteId);
  if (!old || !site || old.archived || site.archived) throw new WorldError("Restore the dated underground site and level before editing.", 409);
  assertNativeRevision(old.revision, c.revision); boundedRegionalLayer(()=>{validateUnderground(c.design,site.frame);assertUndergroundLayerChanges(old.design,c.design);});
  for (const feature of old.design.features) {
    const next = c.design.features.find(f => f.id === feature.id);
    if (!next || next.kind !== feature.kind || next.variant !== feature.variant || next.entityId !== feature.entityId) throw new WorldError("Retain saved underground object identities; archive unwanted objects.", 400);
  }
  const revision = old.revision + 1;
  value.bundle.document = { ...old, revision, name: c.name, order: c.order, depth: c.depth, design: c.design, history: [{ revision, requestId: c.requestId }, ...old.history].slice(0, 30) };
  return { updates: [{ key: "underground", kind: "underground", payload: value as unknown as Record<string, unknown> }], result: { siteId: site.id, levelId: old.id, revision } };
}
export async function saveNativeCraft(tx: NativeHistoryTx, context: NativeContentContext, raw: unknown): Promise<NativeWriteResult> {
  const c = craftCommandSchema.parse(raw);
  if(c.action==="lifecycle"){
    const isDeck=context.scope.target.kind==="deck";assertNativeTarget(context,isDeck?c.surface:c.craftId,isDeck?"deck":"craft");
    if(isDeck===(c.surface==="exterior"))throw new WorldError("Choose this exact retained surface.",409);
    const key=isDeck?"deck":"craft",value=structuredClone((await nativeResource(tx,context,key)).payload) as unknown as {bundle?:CraftBundle;deck?:NonNullable<CraftBundle["deck"]>},old=isDeck?value.deck:value.bundle?.craft;
    if(!old||isDeck&&"craftId"in old&&old.craftId!==c.craftId)throw new WorldError("Choose this craft's recorded dated surface.",409);assertNativeRevision(old.revision,c.revision);
    const revision=old.revision+1;if(revision>CRAFT_LIMITS.revisions)throw new WorldError("This surface reached its retained revision allowance.",413);
    if(isDeck)value.deck={...value.deck!,archived:c.archived,revision};else value.bundle!.craft={...value.bundle!.craft!,archived:c.archived,revision};
    return {updates:[{key,kind:isDeck?"deck":"craft",payload:value as unknown as Record<string,unknown>}],result:{craftId:c.craftId,surface:c.surface,revision}};
  }
  if (c.action !== "save") throw new WorldError("Open the dated craft surface before changing this historical craft.", 400);
  const isDeck = context.scope.target.kind === "deck";
  assertNativeTarget(context, isDeck ? c.surface : c.craftId, isDeck ? "deck" : "craft");
  if (isDeck === (c.surface === "exterior")) throw new WorldError("Choose the exact retained craft surface.", 409);
  const key = isDeck ? "deck" : "craft";
  const value = structuredClone((await nativeResource(tx, context, key)).payload) as unknown as { bundle?: CraftBundle; deck?: NonNullable<CraftBundle["deck"]>; history?: CraftBundle["history"] };
  const old = isDeck ? value.deck : value.bundle?.craft;
  if (!old || old.archived || old.worldId !== context.worldId || isDeck && "craftId" in old && old.craftId !== c.craftId) throw new WorldError("Restore this dated craft surface before editing.", 409);
  assertNativeRevision(old.revision, c.revision);
  if(old.revision>=CRAFT_LIMITS.revisions)throw new WorldError("This historical craft surface has reached 512 retained revisions. Its accepted history remains intact.",413);
  const draft = isDeck ? deckDraftSchema.parse(c.draft) : craftDraftSchema.parse(c.draft);
  boundedRegionalLayer(()=>{validateCraftSurface(draft.surface,draft.frame);preserveFloorObjects(old.surface.plan,draft.surface.plan);});
  const before=new Map(old.surface.plan.features.map(feature=>[feature.id,feature]));
  for(const feature of draft.surface.plan.features){
    const previous=before.get(feature.id),layer=floorLayer(feature);
    if(previous&&old.surface.plan.layers[layer].locked&&draft.surface.plan.layers[layer].locked&&nativeContentHash(old.surface.details[feature.id]??null)!==nativeContentHash(draft.surface.details[feature.id]??null))throw new WorldError("Unlock this layer before changing its saved object details.",400);
    if(feature.variant==="opening"&&(!previous||nativeContentHash(previous)!==nativeContentHash(feature))){const wall=before.get(feature.wallId);if(wall&&old.surface.plan.layers.walls.locked&&draft.surface.plan.layers.walls.locked)throw new WorldError("Unlock the attached wall before changing this opening.",400);}
  }
  await assertNativeCraftObjectIdentities(tx,context.worldId,c.craftId,draft.surface,context.scope.target);
  const images = (await nativeResource(tx, context, "composition")).payload as unknown as CompositionSaved;
  boundedRegionalLayer(()=>validateComposition(images.layer,{...draft.frame,x:0,y:0}));
  const revision = old.revision + 1, updated = { ...old, ...draft, revision };
  if (isDeck) value.deck = updated as NonNullable<CraftBundle["deck"]>;
  else value.bundle!.craft = updated as NonNullable<CraftBundle["craft"]>;
  return { updates: [{ key, kind: isDeck ? "deck" : "craft", payload: value as unknown as Record<string, unknown> }], result: { craftId: c.craftId, surface: c.surface, revision } };
}
export async function nativeCompositionFrame(tx: NativeHistoryTx, context: NativeContentContext): Promise<AssetFrame> {
  if (context.scope.target.kind === "terrain") {
    const root = await nativeTerrainSource(tx, context), region = root.document.region;
    return region ? { ...region.frame, wrapWidth: root.shape.wrap ? root.shape.displayWidth : undefined } : { x: 0, y: 0, width: root.shape.displayWidth, height: root.shape.displayHeight, wrap: root.shape.wrap };
  }
  if (context.scope.target.kind === "town") return {...((await nativeResource(tx,context,"town")).payload as unknown as {bundle:TownMapBundle}).bundle.document!.frame,x:0,y:0};
  if (context.scope.target.kind === "floor") return {...((await nativeResource(tx,context,"floor")).payload as unknown as {bundle:FloorBundle}).bundle.building!.frame,x:0,y:0};
  if (context.scope.target.kind === "underground") {
    const bundle = (await nativeResource(tx, context, "underground")).payload as unknown as { bundle: UndergroundBundle };
    return {...bundle.bundle.sites.find(s => s.id === bundle.bundle.document!.siteId)!.frame,x:0,y:0};
  }
  const key = context.scope.target.kind === "deck" ? "deck" : "craft", payload = (await nativeResource(tx, context, key)).payload;
  const frame=context.scope.target.kind === "deck" ? (payload as unknown as { deck: NonNullable<CraftBundle["deck"]> }).deck.frame : (payload as unknown as { bundle: CraftBundle }).bundle.craft!.frame;return {...frame,x:0,y:0};
}
export async function saveNativeComposition(tx: NativeHistoryTx, context: NativeContentContext, raw: unknown): Promise<NativeWriteResult> {
  const c = assetCommandSchema.parse(raw);
  if (c.action !== "compose") throw new WorldError("Choose the private asset library for explicit library operations.", 400);
  assertNativeTarget(context, c.target.id);
  if (c.target.kind !== (context.scope.target.kind === "deck" ? "craft-deck" : context.scope.target.kind)) throw new WorldError("Choose this historical map's artwork layer.", 409);
  const original = (await nativeResource(tx, context, "composition")).payload as unknown as CompositionSaved;
  assertNativeRevision(original.revision,c.revision);const frame=await nativeCompositionFrame(tx,context);boundedRegionalLayer(()=>validateComposition(c.layer,frame));
  for (const placement of c.layer.placements) if (!artworkAsset(placement.assetId)) {
    const [asset] = await tx.select({ ownerId: atlasAsset.ownerId, archived: atlasAsset.archived }).from(atlasAsset).innerJoin(atlasAssetVersion, and(eq(atlasAssetVersion.assetId, atlasAsset.id), eq(atlasAssetVersion.version, placement.version))).where(eq(atlasAsset.id, placement.assetId));
    if (!asset || asset.ownerId !== context.userId) throw new WorldError("This private asset version is unavailable.", 404);
    if (asset.archived && !original.layer.placements.some(p => p.assetId === placement.assetId && p.version === placement.version)) throw new WorldError("Restore the archived asset before placing it in a dated map.", 400);
  }
  const revision = c.revision + 1;
  return { updates: [{ key: "composition", kind: "composition", payload: { ...original, revision, layer: c.layer, history: [] } }], result: { revision } };
}
