import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { terrainCommandSchema, type TerrainTile } from "./terrain";
import { EMPTY_PROTECTION, isProtected, protectSamples, protectionGrid, type TerrainSource } from "./terrain-source";
import {expandedRefinementProtection,initializeExpandedRefinement,refinementExpansionFrame,refinementExpansionSchema,restoreRetainedRefinement,type RefinementExpansionDimensions} from "./terrain-refinement-expansion";
import { validateGenerationAcceptance } from "./terrain-generation-acceptance";
import {assertTerrainTransferRequest} from "./terrain-transfer-authority";
import {withTerrainResourceBudget} from "./terrain-resource-budget";
import { frameGeometry, rootFrame, terrainEditMask, overviewTile, refinementCreateSchema, validateRefinement, initializeRefinement, initializeRefinementAsync, framesOverlap, overviewLevels, gridTile, isRefinementBoundary, REFINEMENT_DEPTH, REFINEMENT_LIMIT, type RefinementMeta } from "./terrain-refinement";
import { regionContainsFrame } from "./terrain-regions";
import { readTerrainTile, stageTerrainTiles } from "./terrain-storage";
import { nativeResource, type NativeContentContext } from "./native-map-history-context";
import { nativeTerrainSource, nativeAllRefinementIndex, type NativeRefinementPayload } from "./native-map-history-terrain-read";
import { assertNativeRevision, assertNativeTarget, nativeSavedResource } from "./native-map-history-resources";
import { nativeContentHash, type NativeHistoryTx } from "./native-map-history-store";
import type { NativeTileObject } from "./native-map-history-capture";
import type { NativeComponentUpdate, NativeWriteResult } from "./native-map-history-write";
import { validateAdvancedTerrainTiles, type AdvancedContextPacket } from "./terrain-advanced-service";
import { hydroLayerSchema } from "./terrain-hydrology";
import { ADVANCED_TERRAIN_LIMITS } from "./terrain-advanced-spec";
import {nativeNumericPin} from "./native-map-history-sampling";
import {nativeConditions} from "./native-map-history-conditions";
import {nativeAbsentObjects} from "./native-map-history";
import type {TownBundle} from "./world-towns";
import { WorldError } from "./world-service";

export async function nativeAdvancedContext(tx: NativeHistoryTx, context: NativeContentContext, sourceId?: string): Promise<AdvancedContextPacket> {
  const root = await nativeTerrainSource(tx, context), index = await nativeAllRefinementIndex(tx, context);
  const original = structuredClone((await nativeResource(tx, context, "advanced")).payload) as unknown as AdvancedContextPacket;
  const meta = sourceId ? index.refinements.find(r => r.id === sourceId) : undefined;
  if (sourceId && !meta) throw new WorldError("Choose a numerical source retained by this dated appearance.", 404);
  if (root.document.region && (!meta || !regionContainsFrame(root.document.region, meta.frame, root.shape))) throw new WorldError("Open an eligible finer source wholly inside this region or its dated parent World.", 409);
  const water = await nativeResource(tx, context, "hydrology");
  const frame = meta?.frame ?? rootFrame(root.shape);
  const places=(await nativeResource(tx,context,"places")).payload as unknown as TownBundle,conditions=(await nativeConditions(tx,context)).values;
  const absent=nativeAbsentObjects(conditions),settlementIds=new Set(places.placements.map(p=>p.id));
  const sites=[...original.context.sites.filter(s=>!settlementIds.has(s.id)&&!absent.has(s.id)),...places.placements.filter(p=>!p.removed&&!p.archived&&!absent.has(p.townId)&&!absent.has(p.id)).map(p=>({id:p.id,x:p.x,y:p.y}))];
  const value = { ...original.context, sites,frame, seaLevel: root.document.seaLevel, water: hydroLayerSchema.parse(water.payload.layer) };
  const pin = createHash("sha256").update(JSON.stringify({ terrain: root.document.terrainId, frame, waterRevision: water.revision, sites: value.sites, volcanoes: value.volcanoes })).digest("hex");
  return { pin, context: value, sourceId: sourceId ?? null, sourceRevision: meta?.revision ?? root.document.revision, rootRevision: root.document.revision, canEdit: context.canEdit };
}

/** Publish the same native Int16 numerical overviews without baseline rows. */
export async function nativePyramid(worldId: string, sourceId: string, requestId: string, meta: RefinementMeta,
  tiles: TerrainTile[], masks: Map<string, string>, original: NativeTileObject[]) {
  const references = new Map(original.map(r => [`${r.lod ?? 0}:${r.x}:${r.y}`, r]));
  let changed = new Map(tiles.map(t => [`${t.x}:${t.y}`, t]));
  for (let lod = 0; lod <= meta.overviewLevels; lod++) {
    const objects = await stageTerrainTiles(requestId, worldId, sourceId, [...changed.values()]);
    const previous = new Map(references);
    for (const object of objects) references.set(`${lod}:${object.x}:${object.y}`, { ...object, lod, mask: lod === 0 ? masks.get(`${object.x}:${object.y}`) ?? EMPTY_PROTECTION : EMPTY_PROTECTION });
    if (lod === meta.overviewLevels) break;
    const parents = new Set([...changed.values()].map(t => `${Math.floor(t.x / 2)}:${Math.floor(t.y / 2)}`)), next = new Map<string, TerrainTile>();
    for (const parent of parents) {
      const [x, y] = parent.split(":").map(Number), children = new Map<string, number[]>();
      await Promise.all([0, 1, 2, 3].map(async n => {
        const key = `${x * 2 + n % 2}:${y * 2 + Math.floor(n / 2)}`, tile = changed.get(key), ref = previous.get(`${lod}:${key}`);
        if (!tile && !ref) throw new WorldError("An accepted numerical overview source is missing. Restore its paired backup.", 409);
        children.set(key, tile?.samples ?? await readTerrainTile(ref!));
      }));
      next.set(parent, overviewTile(x, y, children));
    }
    changed = next;
  }
  return [...references.values()];
}

async function nativeGrid(tx: NativeHistoryTx, context: NativeContentContext, id?: string, revision?: number) {
  const root = await nativeTerrainSource(tx, context);
  const fine = id ? await nativeSavedResource<NativeRefinementPayload>(tx, context, "refinement:" + id, revision) : undefined;
  const shape = fine ? frameGeometry(fine.meta, root.shape) : root.shape, refs = fine ? fine.tileObjects.filter(r => (r.lod ?? 0) === 0) : root.value.tileObjects;
  const grid = new Int16Array(shape.width * shape.height).fill(root.document.baseElevation);
  for (let offset = 0; offset < refs.length; offset += 16) await Promise.all(refs.slice(offset, offset + 16).map(async ref => {
    const samples = await readTerrainTile(ref);
    for (let y = 0; y < 32; y++) grid.set(samples.slice(y * 32, y * 32 + 32), (ref.y * 32 + y) * shape.width + ref.x * 32);
  }));
  return { grid, shape, frame: fine?.meta.frame ?? rootFrame(root.shape), fine };
}
export async function createNativeRefinement(tx: NativeHistoryTx, context: NativeContentContext, raw: unknown): Promise<NativeWriteResult> {const c=refinementCreateSchema.parse(raw);return withTerrainResourceBudget(c.gridWidth*c.gridHeight,()=>createNativeRefinementChecked(tx,context,raw));}
async function createNativeRefinementChecked(tx: NativeHistoryTx, context: NativeContentContext, raw: unknown): Promise<NativeWriteResult> {
  const c = refinementCreateSchema.parse(raw);
  assertNativeTarget(context, c.mapId, "terrain");
  const root = await nativeTerrainSource(tx, context), index = await nativeAllRefinementIndex(tx, context);
  if (index.refinements.length >= REFINEMENT_LIMIT || index.refinements.some(r => r.id === c.requestId)) throw new WorldError("Choose an unused finer-source identity within the existing 128-source capacity.", 409);
  const parent = c.parentId ? index.refinements.find(r => r.id === c.parentId) : undefined;
  if (c.parentId && !parent) throw new WorldError("Choose the retained dated parent source.", 404);
  assertNativeRevision(parent?.revision ?? root.document.revision, c.parentRevision);
  if ((parent?.level ?? 0) >= REFINEMENT_DEPTH) throw new WorldError("This numerical source has reached the existing depth limit.", 400);
  if (root.document.region && !regionContainsFrame(root.document.region, c.frame, root.shape)) throw new WorldError("Keep the complete numerical detail inside this region's saved outline.", 409);
  if (index.refinements.some(r => r.parentId === c.parentId && framesOverlap(r.frame, c.frame, root.shape.displayWidth, root.shape.wrap))) throw new WorldError("Choose adjacent coverage or use the overlapping retained source as parent.", 409);
  const inherited = await nativeGrid(tx, context, c.parentId ?? undefined);
  let grid: Int16Array;
  try { validateRefinement(c.frame, c.gridWidth, c.gridHeight, inherited.shape, inherited.frame, root.shape); grid = c.gridWidth*c.gridHeight>1048576?await initializeRefinementAsync(inherited.grid,inherited.shape,inherited.frame,c.frame,c.gridWidth,c.gridHeight,root.shape):initializeRefinement(inherited.grid,inherited.shape,inherited.frame,c.frame,c.gridWidth,c.gridHeight,root.shape); }
  catch (error) { throw new WorldError((error as Error).message, 400); }
  const bytes = Buffer.alloc(grid.length * 2); for (let i = 0; i < grid.length; i++) bytes.writeInt16LE(grid[i], i * 2);
  if (createHash("sha256").update(bytes).digest("hex") !== c.previewHash) throw new WorldError("The dated parent no longer matches this numerical preview. Retain the bounds and prepare it again.", 409);
  const meta: RefinementMeta = { id: c.requestId, worldId: context.worldId, terrainId: root.document.terrainId, mapId: c.mapId, name: c.name, parentId: c.parentId, parentRevision: c.parentRevision, level: (parent?.level ?? 0) + 1, revision: 1, frame: c.frame, gridWidth: c.gridWidth, gridHeight: c.gridHeight, overviewLevels: overviewLevels(c.gridWidth, c.gridHeight), updatedAt: new Date().toISOString() };
  const tiles: TerrainTile[] = [], masks = new Map<string, string>();
  for (let y = 0; y < c.gridHeight / 32; y++) for (let x = 0; x < c.gridWidth / 32; x++) {
    tiles.push(gridTile(grid, c.gridWidth, x, y)); const protectedIndices: number[] = [];
    for (let n = 0; n < 1024; n++) if (isRefinementBoundary(x * 32 + n % 32, y * 32 + Math.floor(n / 32), c.gridWidth, c.gridHeight)) protectedIndices.push(n);
    masks.set(`${x}:${y}`, protectSamples(EMPTY_PROTECTION, protectedIndices));
  }
  const sourceHash = nativeContentHash(c), fine: NativeRefinementPayload = { meta, baselineRevision: 0, tileObjects: await nativePyramid(context.worldId, meta.id, c.requestId, meta, tiles, masks, []), version: { revision: 1, requestId: c.requestId, rootRevision: root.document.revision, parentRevision: c.parentRevision, contentHash: sourceHash, source: { kind: "manual" } } };
  const original = (await nativeResource(tx, context, "refinements")).payload;
  const parentKey = `source:${meta.parentId ?? root.document.terrainId}:${c.parentRevision}`;
  const retainedParent: NativeComponentUpdate[] = context.manifest.resources.some(r => r.key === parentKey) ? [] : [{ key: parentKey, kind: meta.parentId ? "refinement" : "terrain", payload: await nativeNumericPin(tx, context, meta.parentId ?? root.document.terrainId, c.parentRevision) as unknown as Record<string, unknown> }];
  return { updates: [...retainedParent, { key: "refinement:" + meta.id, kind: "refinement", payload: fine as unknown as Record<string, unknown> }, { key: "refinements", kind: "refinement", payload: { ...original, index: { ...index, refinements: [...index.refinements, meta] }, sourceHashes: { ...original.sourceHashes as Record<string, string>, [meta.id]: sourceHash } } }], result: { id: c.mapId, refinementId: meta.id, revision: 1 } };
}
export async function expandNativeRefinement(tx:NativeHistoryTx,context:NativeContentContext,sourceId:string,raw:unknown):Promise<NativeWriteResult>{
 const c=refinementExpansionSchema.parse(raw);
 return withTerrainResourceBudget(c.gridWidth*c.gridHeight,async()=>{
  assertNativeTarget(context,c.mapId,"terrain");
  await assertTerrainTransferRequest(tx,context.userId,context.worldId,c.requestId);
  if(c.refinementId!==sourceId)throw new WorldError("Choose the retained source named by this original request.",409);
  const root=await nativeTerrainSource(tx,context),index=await nativeAllRefinementIndex(tx,context),meta=index.refinements.find(r=>r.id===sourceId);
  if(!meta)throw new WorldError("This finer source is not retained by the dated appearance.",404);
  assertNativeRevision(meta.revision,c.revision);
  if(root.document.region&&c.sourceState!==index.sourceState)throw new WorldError("The dated numerical context changed. Retain the original extension request and review the accepted sources.",409);
  const parent=meta.parentId?index.refinements.find(r=>r.id===meta.parentId):undefined;
  if(meta.parentId&&!parent)throw new WorldError("The retained parent source is unavailable.",409);
  const parentRevision=parent?.revision??root.document.revision;assertNativeRevision(parentRevision,c.parentRevision);
  const [inherited,old]=await Promise.all([nativeGrid(tx,context,meta.parentId??undefined),nativeGrid(tx,context,sourceId)]);
  if(!old.fine)throw new WorldError("The complete retained detail is unavailable.",409);
  const dimensions:RefinementExpansionDimensions={gridWidth:c.gridWidth,gridHeight:c.gridHeight,columnsToWest:c.columnsToWest,rowsToNorth:c.rowsToNorth,...c.advancedConfirmed?{advancedConfirmed:true}:{}};
  let frame;
  try{frame=refinementExpansionFrame(meta,dimensions,inherited.shape,inherited.frame,root.shape);}catch(error){throw new WorldError((error as Error).message,400);}
  if(root.document.region&&!regionContainsFrame(root.document.region,frame,root.shape))throw new WorldError("Keep the complete extended detail inside this region or open the parent World.",409);
  if(index.refinements.some(r=>r.id!==sourceId&&r.parentId===meta.parentId&&framesOverlap(r.frame,frame,root.shape.displayWidth,root.shape.wrap)))throw new WorldError("The extended coverage overlaps another retained area at the same level.",409);
  const {grid}=await initializeExpandedRefinement(old.grid,meta,inherited.grid,inherited.shape,inherited.frame,root.shape,dimensions);
  const bytes=Buffer.alloc(grid.length*2);for(let i=0;i<grid.length;i++)bytes.writeInt16LE(grid[i],i*2);
  if(createHash("sha256").update(bytes).digest("hex")!==c.previewHash)throw new WorldError("The retained source or parent no longer matches this extension preview. Keep the settings and prepare it again.",409);
  const protection=expandedRefinementProtection(protectionGrid(old.fine.tileObjects.filter(r=>(r.lod??0)===0),meta.gridWidth,meta.gridHeight),meta,dimensions),tiles:TerrainTile[]=[],masks=new Map<string,string>();
  for(let y=0;y<c.gridHeight/32;y++)for(let x=0;x<c.gridWidth/32;x++){
   tiles.push(gridTile(grid,c.gridWidth,x,y));const indices:number[]=[];
   for(let n=0;n<1024;n++)if(protection[(y*32+Math.floor(n/32))*c.gridWidth+x*32+n%32])indices.push(n);
   masks.set(`${x}:${y}`,protectSamples(EMPTY_PROTECTION,indices));
  }
  const revision=meta.revision+1,sourceHash=nativeContentHash(c),updated:RefinementMeta={...meta,revision,parentRevision,frame,gridWidth:c.gridWidth,gridHeight:c.gridHeight,overviewLevels:overviewLevels(c.gridWidth,c.gridHeight),updatedAt:new Date().toISOString()};
  const fine:NativeRefinementPayload={...old.fine,meta:updated,tileObjects:await nativePyramid(context.worldId,meta.id,c.requestId,updated,tiles,masks,old.fine.tileObjects),version:{revision,requestId:c.requestId,rootRevision:root.document.revision,parentRevision,contentHash:sourceHash,source:{kind:"manual"}}};
  const original=(await nativeResource(tx,context,"refinements")).payload,parentKey=`source:${meta.parentId??root.document.terrainId}:${parentRevision}`;
  const pins:NativeComponentUpdate[]=context.manifest.resources.some(r=>r.key===parentKey)?[]:[{key:parentKey,kind:meta.parentId?"refinement":"terrain",payload:await nativeNumericPin(tx,context,meta.parentId??root.document.terrainId,parentRevision) as unknown as Record<string,unknown>}];
  return {updates:[...pins,{key:"refinement:"+meta.id,kind:"refinement",payload:fine as unknown as Record<string,unknown>},{key:"refinements",kind:"refinement",payload:{...original,index:{...index,refinements:index.refinements.map(r=>r.id===meta.id?updated:r)},sourceHashes:{...original.sourceHashes as Record<string,string>,[meta.id]:sourceHash}}}],result:{id:c.mapId,refinementId:meta.id,revision}};
 });
}

export async function restoreNativeRefinement(tx: NativeHistoryTx, context: NativeContentContext, sourceId: string, raw: unknown) {
  const c = z.object({ action: z.literal("restore"), mapId: z.uuid(), requestId: z.uuid(), revision: z.number().int().positive(), targetRevision: z.number().int().positive(), sourceState: z.string().max(8192).optional() }).strict().parse(raw);
  if (c.targetRevision >= c.revision) throw new WorldError("Choose an earlier retained finer-source revision.", 400);
  const [old, current] = await Promise.all([nativeGrid(tx, context, sourceId, c.targetRevision), nativeGrid(tx, context, sourceId)]);
  const root = await nativeTerrainSource(tx, context);
  if(!old.fine||!current.fine)throw new WorldError("Both complete retained detail revisions are required.",409);
  const restored=restoreRetainedRefinement(current.grid,current.fine.meta,old.grid,old.fine.meta,root.shape),tiles: TerrainTile[] = [];
  for (let y = 0; y < current.shape.height / 32; y++) for (let x = 0; x < current.shape.width / 32; x++) {
    const a = gridTile(restored, current.shape.width, x, y), b = gridTile(current.grid, current.shape.width, x, y);
    if (a.samples.some((v, i) => v !== b.samples[i])) tiles.push(a);
  }
  return saveNativeTerrain(tx, context, { action: "save", mapId: c.mapId, requestId: c.requestId, revision: c.revision, tiles, seaLevel: root.document.seaLevel, source: { kind: "manual" }, ...c.sourceState ? { sourceState: c.sourceState } : {} }, sourceId);
}

export async function saveNativeTerrain(tx: NativeHistoryTx, context: NativeContentContext, raw: unknown, sourceId?: string): Promise<NativeWriteResult> {
  const command = terrainCommandSchema.parse(raw);
  await assertTerrainTransferRequest(tx,context.userId,context.worldId,command.requestId);
  if (command.action !== "save") throw new WorldError("Choose an established dated map before changing its terrain.", 400);
  assertNativeTarget(context, command.mapId, "terrain");
  const root = await nativeTerrainSource(tx, context), index = await nativeAllRefinementIndex(tx, context);
  const meta = sourceId ? index.refinements.find(r => r.id === sourceId) : undefined;
  if (sourceId && !meta) throw new WorldError("This finer source is not retained by the dated appearance.", 404);
  if (root.document.region && (!meta || !regionContainsFrame(root.document.region, meta.frame, root.shape))) throw new WorldError("Edit a dated finer source wholly inside the region or open the parent World.", 409);
  if (root.document.region && command.sourceState !== index.sourceState) throw new WorldError("The dated World or finer source changed. Keep the exact draft and reload its accepted context.", 409);
  const fine = meta ? structuredClone((await nativeResource(tx, context, "refinement:" + meta.id)).payload) as unknown as NativeRefinementPayload : undefined;
  assertNativeRevision(meta?.revision ?? root.document.revision, command.revision);
  const shape = meta ? frameGeometry(meta, root.shape) : root.shape, frame = meta?.frame ?? rootFrame(root.shape);
  const source: TerrainSource = command.source ?? { kind: "manual" };
  if (source.kind === "generated" && source.templateEnvironment) throw new WorldError("Choose the dated environment tools to change this established map's land coverage.", 400);
  if (command.seaLevel < shape.min || command.seaLevel > shape.max || meta && command.seaLevel !== root.document.seaLevel || source.kind === "regenerated" && command.seaLevel !== root.document.seaLevel)
    throw new WorldError("Keep the accepted sea level for finer terrain and selected-area operations. Change it deliberately on the dated World map.", 400);
  try { validateGenerationAcceptance(shape, source, command.seaLevel, meta ? { x: frame.x, y: frame.y, periodX: root.shape.wrap ? root.shape.displayWidth : null } : undefined); }
  catch (error) { throw new WorldError((error as Error).message, 400); }
  const children = index.refinements.filter(r => r.parentId === (meta?.id ?? null));
  const mask = children.length || meta ? terrainEditMask(shape, frame, children, root.shape, !!meta) : null;
  const refs = meta ? fine!.tileObjects.filter(r => (r.lod ?? 0) === 0) : root.value.tileObjects;
  const before = new Map(refs.map(r => [`${r.x}:${r.y}`, r])), masks = new Map<string, string>();
  const tiles = [...command.tiles].sort((a, b) => a.y - b.y || a.x - b.x);
  let changed = 0;
  for (let offset = 0; offset < tiles.length; offset += 16) await Promise.all(tiles.slice(offset, offset + 16).map(async tile => {
    if (tile.x >= shape.width / 32 || tile.y >= shape.height / 32 || tile.samples.some(z => z < shape.min || z > shape.max)) throw new WorldError("Keep numerical samples within this dated source's accepted grid and height limits.", 400);
    const key = `${tile.x}:${tile.y}`, ref = before.get(key);
    if (meta && !ref) throw new WorldError("The accepted finer-source object is missing.", 409);
    const values = ref ? await readTerrainTile(ref) : new Array<number>(1024).fill(root.document.baseElevation), indices: number[] = [];
    for (let n = 0; n < 1024; n++) if (values[n] !== tile.samples[n]) {
      const x = tile.x * 32 + n % 32, y = tile.y * 32 + Math.floor(n / 32);
      if (mask?.[y * shape.width + x]) throw new WorldError("Inherited boundaries and finer-source interpolation support remain protected. Edit the eligible finer source.", 409);
      if (source.kind === "regenerated") {
        const a = source.area;
        if (x < a.x || y < a.y || x >= a.x + a.width || y >= a.y + a.height || source.preserveManual && isProtected(ref?.mask ?? EMPTY_PROTECTION, n)) throw new WorldError("This proposal changes samples outside its selected area or replaces protected manual work.", 400);
      }
      indices.push(n);
    }
    changed += indices.length;
    masks.set(key, source.kind === "manual" ? protectSamples(ref?.mask ?? EMPTY_PROTECTION, indices) : ref?.mask ?? EMPTY_PROTECTION);
  }));
  if (source.kind === "regenerated" && (source.area.x + source.area.width > shape.width || source.area.y + source.area.height > shape.height)) throw new WorldError("Keep selected regeneration inside the accepted dated grid.", 400);
  if ((meta || source.kind === "regenerated") && !changed) throw new WorldError("This operation makes no eligible numerical change.", 400);
  if (source.kind === "manual" && source.advanced) {
    if (command.seaLevel !== root.document.seaLevel) throw new WorldError("Advanced operations retain the accepted sea level.", 400);
    await validateAdvancedTerrainTiles(await nativeAdvancedContext(tx, context, sourceId), source.advanced, shape, root.document.baseElevation, refs, tiles, mask);
  }
  const revision = command.revision + 1, sourceHash = nativeContentHash({ ...command, tiles }), updates: NativeComponentUpdate[] = [];
  if (meta && fine) {
    const updated = { ...meta, revision, updatedAt: new Date().toISOString() };
    fine.meta = updated;
    fine.tileObjects = await nativePyramid(context.worldId, meta.id, command.requestId, meta, tiles, masks, fine.tileObjects);
    fine.version = { revision, requestId: command.requestId, rootRevision: root.document.revision, parentRevision: meta.parentRevision, contentHash: sourceHash, source };
    updates.push({ key: "refinement:" + meta.id, kind: "refinement", payload: fine as unknown as Record<string, unknown> });
    const original = structuredClone((await nativeResource(tx, context, "refinements")).payload);
    updates.push({ key: "refinements", kind: "refinement", payload: { ...original, index: { ...index, refinements: index.refinements.map(r => r.id === meta.id ? updated : r) }, sourceHashes: { ...original.sourceHashes as Record<string, string>, [meta.id]: sourceHash } } });
  } else {
    const objects = await stageTerrainTiles(command.requestId, context.worldId, root.document.terrainId, tiles);
    for (const object of objects) before.set(`${object.x}:${object.y}`, { ...object, mask: masks.get(`${object.x}:${object.y}`)! });
    const document = { ...root.document, revision, seaLevel: command.seaLevel, acceptedRequestId: command.requestId, source, updatedAt: new Date().toISOString(), protection: [...before.values()].filter(r => r.mask !== EMPTY_PROTECTION).map(r => ({ x: r.x, y: r.y, mask: r.mask })) };
    updates.push({ key: "terrain", kind: "terrain", payload: { ...root.value, bundle: { ...root.value.bundle, document }, tileObjects: [...before.values()], sourceHash } });
  }
  if (source.kind === "manual" && source.advanced?.operation.kind === "volcano") {
    const packet = await nativeAdvancedContext(tx, context, sourceId);
    packet.context.volcanoes = [{ id: command.requestId, revision, sourceId: sourceId ?? null, operation: source.advanced.operation }, ...packet.context.volcanoes].slice(0, ADVANCED_TERRAIN_LIMITS.volcanoes);
    updates.push({ key: "advanced", kind: "terrain", payload: packet as unknown as Record<string, unknown> });
  }
  return { updates, result: { id: command.mapId, revision, ...meta ? { refinementId: meta.id } : {} } };
}
