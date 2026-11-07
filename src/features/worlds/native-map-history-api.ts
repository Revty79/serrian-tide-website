import { worldProtectedContent } from "./world-access-service";
import { redactUnderground } from "./underground";
import { nativeConnectionReadable } from "./native-map-history-connections";
import "server-only";
import {readNativeTownBackdrop,sampleNativeTownBackdrop} from "./native-map-history-backdrop";
import {townFrameSchema} from "./town-map";
import {saveNativePlace} from "./native-map-history-places";
import { z } from "zod";
import { atlasId } from "./atlas";
import { ordinaryKnowledge } from "./knowledge-preview";
import { nativeHistoryScopeSchema, nativeGeographyContext, type NativeHistoryScope } from "./native-map-history";
import { withNativeHistoryRead, nativeResource, nativeRelatedContext, type NativeContentContext } from "./native-map-history-context";
import { withNativeHistoryWrite } from "./native-map-history-write";
import { nativeSavedResource, nativeResourceRevisions, assertNativeTarget } from "./native-map-history-resources";
import { readNativeTerrain, readNativeRefinement, nativeRefinementIndex, nativeAllRefinementIndex, nativeHydrologySources, nativeTerrainSource } from "./native-map-history-terrain-read";
import { nativeAdvancedContext, saveNativeTerrain, createNativeRefinement, restoreNativeRefinement } from "./native-map-history-terrain-write";
import { nativeLayerSchemas, saveNativeLayer, type NativeLayerKey } from "./native-map-history-layers";
import { saveNativeTown, saveNativeFloor, saveNativeUnderground, saveNativeCraft, saveNativeComposition } from "./native-map-history-shapes";
import { readTerrainRequest } from "./terrain-http";
import type { NativeHistoryTx } from "./native-map-history-store";
import type { TownMapBundle } from "./town-map";
import type { FloorBundle } from "./building-floor";
import type { UndergroundBundle } from "./underground";
import {createNativeUnderground,nativeUndergroundInventory} from "./native-map-history-underground-create";
import {createNativeCraft,nativeCraftIdentities,emptyNativeCraftBundle} from "./native-map-history-craft-create";
import {duplicateNativeCraft} from "./native-map-history-craft-copy";
import {changeNativeFloorRoute} from "./native-map-history-floor-connect";
import {nativeCraftRoutes,nativeCraftRouteView,navigateNativeCraft,saveNativeCraftRoute} from "./native-map-history-craft-routes";
import {readNativeTerritories,saveNativeTerritories} from "./native-map-history-territory-service";
import type { CraftBundle } from "./craft";
import {sampleNativeTerrain} from "./native-map-history-sampling";
import {saveNativeConnection} from "./native-map-history-connection-write";
import {navigateNativeUnderground,nativeConnectionView,nativeConnectionBundle} from "./native-map-history-connections";
import {readNativeConditions,saveNativeConditions,nativeConditions,presentNativePlaces} from "./native-map-history-conditions";
import { WorldError,worldReadAccess } from "./world-service";
import type { WorldScope } from "./world-permissions";
import { getTownMaps } from "./town-map-service";
import { getRegionHierarchy } from "./terrain-region-hierarchy-service";
import {nativeFloorIdentities,nativeFloorChoices} from "./native-map-history-floor-identities";
import {getWorldTowns} from "./world-town-service";
import { nativeContentHash } from "./native-map-history-store";
import {nativeCraftPlacements,nativeCraftPosition,saveNativeCraftPlacement} from "./native-map-history-craft-placement";
import {nativeLabelSourceCatalog} from "./native-map-history-label-sources";
import {LABEL_LIMITS,sourceLabelState} from "./terrain-labels";
import {saveNativeStyle} from "./native-map-history-styles";
import {previewNativeTown,createNativeTown,nativeTownChoices} from "./native-map-history-town-create";
import {readNativeFloorEntry,enterNativeBuilding,createNativeFloor,nativeFloorSourceContext} from "./native-map-history-floor-create";

function revision(q: URLSearchParams, key = "revision") {
  const input = q.get(key);
  if (input === null) return undefined;
  if (!/^\d+$/.test(input) || !Number.isSafeInteger(Number(input))) throw new WorldError("Choose an accepted historical resource revision.", 400);
  return Number(input);
}
function layerKey(path: string): NativeLayerKey | undefined {
  const key = path.replace(/^terrain\//, "");
  return key in nativeLayerSchemas ? key as NativeLayerKey : undefined;
}
async function layerRead(tx: NativeHistoryTx, context: NativeContentContext, key: string, wanted?: number,suggestions=false) {
  const head = await nativeResource(tx, context, key);
  const value = await nativeSavedResource<Record<string, unknown>>(tx, context, key, wanted);
  const history = await nativeResourceRevisions(tx, context, key);
  let regional: Record<string, unknown> | undefined;
  if (context.authority) {
    const root = await nativeTerrainSource(tx, context), region = root.document.region!, index = await nativeAllRefinementIndex(tx, context);
    regional = { version: 1, regionMapId: region.mapId, parentMapId: region.parentMapId, terrainId: root.document.terrainId, regionRevision: region.revision, sourceState: index.sourceState };
    if (key === "labels") regional.compositionRevision = context.manifest.resources.some(r => r.key === "label-view") ? (await nativeResource(tx, context, "label-view")).revision : 0;
  }
  const catalog=key==="labels"?await nativeLabelSourceCatalog(tx,context):undefined;
  const labels=key==="labels"?(value.layer as import("./terrain-labels").LabelsLayer).labels:[];
  return { ...value, ...catalog?{candidates:suggestions?[...catalog.values()].slice(0,LABEL_LIMITS.candidates):[],candidateCount:catalog.size,sourceStates:labels.map(label=>sourceLabelState(label,catalog)).filter(state=>state!==null)}:{}, ...regional ? { regional } : {}, history: history.filter(h => h.revision > 0), headRevision: head.revision, ...key === "hydrology" || key === "environment" ? { sources: await nativeHydrologySources(tx, context) } : {} };
}
export async function readNativeContent(tx: NativeHistoryTx, context: NativeContentContext, path: string, q: URLSearchParams) {
  const initiating=context;
  if(path==="atlas-history/conditions")return readNativeConditions(tx,context);
  if(path==="atlas-history/territories")return readNativeTerritories(tx,context);
  if (path === "terrain/hierarchy") return { ...await getRegionHierarchy(context.userId, context.worldId, { review: true }), canEdit: false };
  if(path==="town-maps"&&q.has("backdrop")){
    if(context.scope.target.kind==="town")return readNativeTownBackdrop(tx,context);
    if(context.scope.target.kind!=="terrain")throw new WorldError("Choose a dated World or Town appearance before reading its ground source.",409);
    const root=await nativeTerrainSource(tx,context);
    if(q.get("sourceMap")!==root.document.region?.parentMapId&&q.get("sourceMap")!==context.scope.target.id)throw new WorldError("Retain the selected dated World source before preparing Town ground.",409);
    return sampleNativeTownBackdrop(tx,context.authority??context,townFrameSchema.parse(JSON.parse(q.get("frame")??"null")));
  }
  if (path === "town-maps" && !q.has("map")) {
    const inventory = await getTownMaps(context.userId, context.worldId, { historicalIdentities:true,townId: q.has("town")?atlasId.parse(q.get("town")):undefined,search:q.get("search")??undefined,offset:q.has("offset")?Number(q.get("offset")):undefined, review: true });
    return { ...inventory,maps:await nativeTownChoices(tx,context,inventory.maps), canEdit: false, document: null };
  }
  if (path === "building-floors" && q.get("identities") === "1") {
    if(context.scope.target.kind==="floor"&&q.has("floor"))return nativeFloorSourceContext(tx,context,atlasId.parse(q.get("floor")),q.has("townMap")?atlasId.parse(q.get("townMap")):undefined,q.has("building")?atlasId.parse(q.get("building")):undefined,q.has("returnMap")?atlasId.parse(q.get("returnMap")):undefined);
    return nativeFloorIdentities(tx,context,atlasId.parse(q.get("townMap")),atlasId.parse(q.get("building")));
  }
  if(path==="building-floors"&&!q.has("floor")&&context.scope.target.kind==="town")return readNativeFloorEntry(tx,context,atlasId.parse(q.get("townMap")),atlasId.parse(q.get("building")));
  const requested = path === "terrain" || path.startsWith("terrain/") ? q.get("terrainMap") ? { kind: "terrain" as const, id: atlasId.parse(q.get("terrainMap")) } : undefined
    : path === "town-maps" && q.has("map") ? { kind: "town" as const, id: atlasId.parse(q.get("map")) }
    : path === "building-floors" && q.has("floor") ? { kind: "floor" as const, id: atlasId.parse(q.get("floor")) }
    : path === "underground" && q.has("level") ? { kind: "underground" as const, id: atlasId.parse(q.get("level")) }
    : path === "crafts" && q.has("craft") ? q.has("surface") && q.get("surface") !== "exterior" ? { kind: "deck" as const, id: atlasId.parse(q.get("surface")) } : { kind: "craft" as const, id: atlasId.parse(q.get("craft")) } : undefined;
  if (requested) context = await nativeRelatedContext(tx, context, requested);
  const canEdit=context.canEdit||initiating.canEdit&&!context.scope.versionId;
  const key = layerKey(path);
  if (path.startsWith("terrain")) assertNativeTarget(context, q.get("terrainMap") ?? context.scope.target.id, "terrain");
  if (path === "terrain") return readNativeTerrain(tx, context);
  if (path === "terrain/revisions") {
    const root = await nativeTerrainSource(tx, context), index = await nativeAllRefinementIndex(tx, context);
    const head = async (key: string) => (await nativeResource(tx, context, key)).revision;
    return { worldId: context.worldId, mapId: context.scope.target.id, sourceMapId: root.document.region?.parentMapId ?? context.scope.target.id, sourceState: index.sourceState, rootRevision: root.document.revision, regionalAvailable: true, freeformAvailable: true, historyContext: nativeGeographyContext(context.scope), heads: { materials: await head("materials"), water: await head("hydrology"), environment: await head("environment"), artwork: await head("artwork"), labels: await head("labels"), composition: context.manifest.resources.some(r => r.key === "label-view") ? await head("label-view") : 0, towns: nativeContentHash({places:(await nativeResource(tx, context, "places")).payload,conditions:(await nativeConditions(tx,context)).values}) } };
  }
  if (path === "terrain/advanced") return nativeAdvancedContext(tx, context, q.get("source") ?? undefined);
  if (path === "terrain/refinements") {
    if (q.get("action") === "history") return { available: true, versions: await nativeResourceRevisions(tx, context, "refinement:" + atlasId.parse(q.get("refinement"))), next: null };
    if (q.get("action") === "sample") return sampleNativeTerrain(tx, context, JSON.parse(z.string().max(8192).parse(q.get("points"))));
    if (q.has("action")) throw new WorldError("Choose an exact historical numerical source before sampling it.", 400);
    if (!q.has("refinement")) return q.get("allSources") === "1" ? nativeAllRefinementIndex(tx, context) : nativeRefinementIndex(tx, context);
    return readNativeRefinement(tx, context, atlasId.parse(q.get("refinement")), { lod: Number(q.get("lod") ?? 0), keys: z.string().min(1).max(512).parse(q.get("keys")).split(",").map(Number), revision: revision(q), historical: q.get("historical") === "1" });
  }
  if (path === "terrain/hydrology" && q.get("sources") === "1") return { sources: await nativeHydrologySources(tx, context) };
  if (key) return layerRead(tx, context, key, revision(q, key === "hydrology" ? "waterRevision" : key === "environment" ? "environmentRevision" : key === "artwork" ? "artworkRevision" : key === "labels" ? "labelsRevision" : "revision"),q.get("suggestions")==="1");
  if (path === "terrain/styles") return structuredClone((await nativeResource(tx, context, "styles")).payload);
  if (path === "towns") {
    // Native shape editors use shared World profiles as identity choices. They
    // do not carry World terrain positions or assert dated profile facts.
    if(context.scope.target.kind!=="terrain"){
      const shared=await getWorldTowns(context.userId,context.worldId,{townId:q.has("town")?atlasId.parse(q.get("town")):undefined,review:true});
      return {...shared,placements:[],canEdit:false};
    }
    const value=structuredClone((await nativeResource(tx,context,"places")).payload) as unknown as import("./world-towns").TownBundle;
    if(q.has("town"))value.town=(await getWorldTowns(context.userId,context.worldId,{townId:atlasId.parse(q.get("town")),review:true})).town;
    return {...value,placements:presentNativePlaces(value.placements,(await nativeConditions(tx,context)).values),canEdit:context.canEdit};
  }
  if (path === "town-maps") {
    if (q.has("backdrop")) return structuredClone((await nativeResource(tx, context, "backdrop")).payload);
    assertNativeTarget(context, q.get("map") ?? context.scope.target.id, "town");
    const value = await nativeSavedResource<{ bundle: TownMapBundle }>(tx, context, "town", revision(q));
    const history=(await nativeResourceRevisions(tx,context,"town")).map(v=>({revision:v.revision,requestId:v.componentId}));
    return { ...value.bundle, canEdit: context.canEdit, document: value.bundle.document ? { ...value.bundle.document,history,canEdit: context.canEdit&&!value.bundle.document.archived } : null };
  }
  if (path === "building-floors") {
    assertNativeTarget(context, q.get("floor") ?? context.scope.target.id, "floor");
    const value = await nativeSavedResource<{ bundle: FloorBundle }>(tx, context, "floor", revision(q));
    if(value.bundle.document)value.bundle.document.history=(await nativeResourceRevisions(tx,context,"floor")).map(v=>({revision:v.revision,requestId:v.componentId}));
    return { ...value.bundle,floors:await nativeFloorChoices(tx,context,value.bundle.building!.id), canEdit: context.canEdit, reason: context.canEdit ? "" : "Viewing a retained dated floor. Choose Edit This Appearance to author it." };
  }
  if (path === "underground") {
    if(q.has("navigate")){const result=await navigateNativeUnderground(tx,context,atlasId.parse(q.get("navigate")),q.get("reverse")==="1");if(q.get("review")==="1"){const route=new URL(result.url,"https://atlas.invalid");route.searchParams.set("review","1");result.url=route.pathname+route.search;}return result;}
    const key = context.scope.target.kind === "underground" ? "underground" : "connections";
    const value = await nativeSavedResource<{ bundle: UndergroundBundle } & UndergroundBundle>(tx, context, key, revision(q));
    const bundle=structuredClone(value.bundle??value),inventory=await nativeUndergroundInventory(tx,context);
    bundle.levels=inventory.levels;bundle.sites=[...bundle.sites,...inventory.sites.filter(site=>!bundle.sites.some(retained=>retained.id===site.id))];bundle.connections=(await nativeConnectionBundle(tx,context)).connections;
    if(bundle.document)bundle.document.history=(await nativeResourceRevisions(tx,context,key)).map(v=>({revision:v.revision,requestId:v.componentId}));
    const visibleConnections=[];for(const connection of bundle.connections)if(await nativeConnectionReadable(tx,context,connection))visibleConnections.push(await nativeConnectionView(tx,context,connection));bundle.connections=visibleConnections;
    let permittedEdit=canEdit;
    if(bundle.document&&!worldProtectedContent(context.worldId)){const visible=redactUnderground(bundle.document.design);if(JSON.stringify(visible.features)!==JSON.stringify(bundle.document.design.features))permittedEdit=false;bundle.document.design=visible;}
    return {...bundle,canEdit:permittedEdit,canRecover:canEdit};
  }
  if (path === "crafts") {
    if(q.has("connection"))return navigateNativeCraft(tx,context,atlasId.parse(q.get("connection")),q.get("reverse")==="1");
    if (context.scope.target.kind === "terrain") return nativeCraftPlacements(tx,context,q);
    if(!q.has("craft")&&!q.has("connection")){const all=(await nativeCraftIdentities(tx,context)).crafts.filter(craft=>!q.get("q")||craft.name.toLowerCase().includes(q.get("q")!.slice(0,120).toLowerCase())),offset=Math.max(0,Math.min(512,Number(q.get("offset")??0)||0));return {...emptyNativeCraftBundle(context.worldId,canEdit),crafts:all.slice(offset,offset+50),next:all.length>offset+50?offset+50:null};}
    const deck = context.scope.target.kind === "deck";
    const value = await nativeSavedResource<{ bundle: CraftBundle }>(tx, context, deck ? "craft-context" : "craft");
    const result = { ...value.bundle,decks:(await nativeCraftIdentities(tx,context,value.bundle.craft!.id)).decks, ...await nativeCraftPosition(tx,context,value.bundle.craft!.id), canEdit };
    result.connections=[];for(const connection of(await nativeCraftRoutes(tx,context)).rows)result.connections.push(await nativeCraftRouteView(tx,context,connection));
    if (deck) {
      const surface = await nativeSavedResource<{ deck: CraftBundle["deck"]; history: CraftBundle["history"] }>(tx, context, "deck", revision(q));
      result.deck = surface.deck; result.history = surface.history;
    }
    result.history=(await nativeResourceRevisions(tx,context,deck?"deck":"craft")).map(v=>({revision:v.revision,createdAt:v.createdAt}));
    return result;
  }
  if (path === "assets" && q.has("kind")) {
    assertNativeTarget(context, q.get("map") ?? "");
    return layerRead(tx, context, "composition", revision(q));
  }
  throw new WorldError("This action has no dated source in the selected appearance. Your draft remains retained; current-map content was not substituted.", 409);
}

/** Invoked only after the normal session, CSRF and preview guards. */
export async function nativeContentRequest(request: Request, userId: string) {
  const url = new URL(request.url), match = url.pathname.match(/^\/api\/worlds\/([^/]+)\/(.+)$/);
  if (!match) throw new WorldError("Choose a private World content request.", 400);
  const worldId = atlasId.parse(decodeURIComponent(match[1])), path = match[2], encoded = url.searchParams.get("historicalAtlas");
  if (!encoded || encoded.length > 4096) throw new WorldError("Choose a bounded explicit historical map context.", 400);
  const scope: NativeHistoryScope = nativeHistoryScopeSchema.parse(JSON.parse(encoded));
  const options = { review: url.searchParams.get("review") === "1", ordinary: ordinaryKnowledge(url.searchParams) };
  const resourceScope:WorldScope|undefined=path==="towns"||path==="town-maps"?"settlements":path==="building-floors"?"interiors":path==="underground"?"underground":path==="crafts"?"craft":path==="assets"?"assets":path.startsWith("terrain")?"atlas":path==="atlas-history/territories"?"politics":undefined;
  if(resourceScope)await worldReadAccess(userId,worldId,options.review,resourceScope);
  if (request.method === "GET") return withNativeHistoryRead(userId, worldId, scope, options, (tx, context) => readNativeContent(tx, context, path, url.searchParams));
  if (request.method !== "POST" || options.review || options.ordinary) throw new WorldError("This dated map context is read-only.", 403);
  const raw = await readTerrainRequest(request);
  if(path==="town-maps"&&raw&&typeof raw==="object"&&"action"in raw&&raw.action==="preview")return withNativeHistoryRead(userId,worldId,scope,options,(tx,context)=>previewNativeTown(tx,context,raw));
  const envelope = z.object({ requestId: atlasId }).passthrough().parse(raw);
  const receipt = await withNativeHistoryWrite(userId, worldId, scope, { requestId: envelope.requestId, endpoint: path + (url.searchParams.get("refinement") ?? ""), command: raw }, async (tx, context) => {
    const key = layerKey(path);
    if(path==="atlas-history/conditions")return saveNativeConditions(tx,context,raw);
    if(path==="atlas-history/territories")return saveNativeTerritories(tx,context,raw);
    if(path==="terrain/styles")return saveNativeStyle(tx,context,raw);
    if (key) return saveNativeLayer(tx, context, key, raw);
    if (path === "terrain") return saveNativeTerrain(tx, context, raw);
    if (path === "terrain/refinements") {
      const id = url.searchParams.get("refinement");
      if (!id) return createNativeRefinement(tx, context, raw);
      if (raw && typeof raw === "object" && "action" in raw && raw.action === "restore") return restoreNativeRefinement(tx, context, atlasId.parse(id), raw);
      return saveNativeTerrain(tx, context, raw, atlasId.parse(id));
    }
    if(path==="towns")return saveNativePlace(tx,context,raw);
    if(path==="town-maps"&&raw&&typeof raw==="object"&&"action"in raw&&raw.action==="create")return createNativeTown(tx,context,raw);
    if (path === "town-maps") return saveNativeTown(tx, context, raw);
    if(path==="building-floors"&&raw&&typeof raw==="object"&&"action"in raw&&raw.action==="enter")return enterNativeBuilding(tx,context,raw);
    if(path==="building-floors"&&raw&&typeof raw==="object"&&"action"in raw&&raw.action==="create")return createNativeFloor(tx,context,raw);
    if(path==="building-floors"&&raw&&typeof raw==="object"&&"action"in raw&&(raw.action==="connect"||raw.action==="lifecycle"))return changeNativeFloorRoute(tx,context,raw);
    if (path === "building-floors") return saveNativeFloor(tx, context, raw);
    if(path==="underground"&&raw&&typeof raw==="object"&&"action"in raw&&(raw.action==="connect"||raw.action==="historical-account"||raw.action==="lifecycle"&&"kind"in raw&&raw.kind==="connection"))return saveNativeConnection(tx,context,raw);
    if(path==="underground"&&raw&&typeof raw==="object"&&"action"in raw&&(raw.action==="create-site"||raw.action==="create-level"))return createNativeUnderground(tx,context,raw);
    if (path === "underground") return saveNativeUnderground(tx, context, raw);
    if(path==="crafts"&&raw&&typeof raw==="object"&&"action"in raw&&(raw.action==="connect"||raw.action==="connection-lifecycle"||raw.action==="historical-account"))return saveNativeCraftRoute(tx,context,raw);
    if(path==="crafts"&&raw&&typeof raw==="object"&&"action"in raw&&raw.action==="duplicate")return duplicateNativeCraft(tx,context,raw);
    if(path==="crafts"&&raw&&typeof raw==="object"&&"action"in raw&&(raw.action==="create"||raw.action==="create-deck"))return createNativeCraft(tx,context,raw);
    if(path==="crafts"&&raw&&typeof raw==="object"&&"action"in raw&&(raw.action==="place"||raw.action==="unplace"))return saveNativeCraftPlacement(tx,context,raw);
    if (path === "crafts") return saveNativeCraft(tx, context, raw);
    if (path === "assets") return saveNativeComposition(tx, context, raw);
    throw new WorldError("This dated operation is unavailable. Your draft is retained and no current-map writer was called.", 409);
  });
  // The small retry ledger retains an exact immutable version, rather than a
  // second potentially multi-megabyte copy of the accepted layer.
  const historical = z.object({ versionId: atlasId }).passthrough().parse(receipt.historical);
  if (layerKey(path)) return withNativeHistoryRead(userId, worldId, { ...scope, edit: false, versionId: historical.versionId }, {}, async (tx, context) => ({ ...receipt, ...await layerRead(tx, context, layerKey(path)!) }));
  return receipt;
}
