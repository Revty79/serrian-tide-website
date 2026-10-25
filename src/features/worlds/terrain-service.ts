import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { worldAtlasMap } from "@/db/world-atlas-schema";
import { worldMapCanvas, worldTerrain, worldTerrainTile, worldTerrainVersion } from "@/db/world-terrain-schema";
import { WorldError, worldReadAccess, worldWriteTransaction } from "./world-service";
import { terrainCommandSchema,terrainGeometry, type TerrainDocument, type TerrainSummary } from "./terrain";
import {validateGenerationAcceptance} from "./terrain-generation-acceptance";
import {EMPTY_PROTECTION,isProtected,protectSamples} from "./terrain-source";
import {getRefinementEditMask} from "./terrain-refinement-service";
import {rootFrame} from "./terrain-refinement";
import { readTerrainTile, stageTerrainTiles, type TerrainObject } from "./terrain-storage";
const unavailable = () => new WorldError("This terrain map is unavailable.", 404);
const conflict = () => new WorldError("Another tab saved a newer terrain revision. Your local draft is retained. Load the saved map to compare; it will not be overwritten.", 409);
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const summary = (m: typeof worldAtlasMap.$inferSelect, t: typeof worldTerrain.$inferSelect): TerrainSummary => ({ id: m.id, name: m.name, revision: t.revision, seaLevel: t.seaLevel, updatedAt: t.updatedAt.toISOString() });
export async function getTerrain(userId: string, worldId: string, options: { review?: boolean; ordinary?: boolean; mapId?: string } = {}): Promise<{ maps: TerrainSummary[]; document: TerrainDocument | null; canEdit: boolean }> {
  const parent = await worldReadAccess(userId, worldId, !!options.review);
  if (options.ordinary) throw unavailable();
  return db.transaction(async tx => {
    const rows = await tx.select({ m: worldAtlasMap, t: worldTerrain }).from(worldMapCanvas)
      .innerJoin(worldAtlasMap, and(eq(worldAtlasMap.id, worldMapCanvas.mapId), eq(worldAtlasMap.worldId, worldMapCanvas.worldId)))
      .innerJoin(worldTerrain, and(eq(worldTerrain.id, worldMapCanvas.terrainId), eq(worldTerrain.worldId, worldMapCanvas.worldId)))
      .where(and(eq(worldMapCanvas.worldId, worldId), sql`${worldAtlasMap.archivedAt} IS NULL`)).orderBy(asc(worldAtlasMap.createdAt), asc(worldAtlasMap.id));
    const canEdit = parent.ownerId === userId && !parent.archivedAt && !options.review;
    const row = options.mapId ? rows.find(r => r.m.id === options.mapId) : undefined;
    if (options.mapId && !row) throw unavailable();
    let document: TerrainDocument | null = null;
    if (row) {
      const [accepted] = await tx.select({ requestId: worldTerrainVersion.requestId,source:worldTerrainVersion.source }).from(worldTerrainVersion).where(and(eq(worldTerrainVersion.terrainId, row.t.id), eq(worldTerrainVersion.revision, row.t.revision)));
      if (!accepted) throw new WorldError("The terrain revision is incomplete. Retain your draft and ask the administrator to restore the accepted data.", 500);
      const references = (await tx.execute<TerrainObject & { x: number; y: number;mask:string }>(sql`SELECT DISTINCT ON (detail_level,tile_x,tile_y) tile_x AS x,tile_y AS y,sha256,bytes,encoding,manual_protection AS mask FROM world_terrain_tile WHERE terrain_id=${row.t.id} AND world_id=${worldId} AND revision<=${row.t.revision} AND detail_level=0 ORDER BY detail_level,tile_x,tile_y,revision DESC`)).rows;
      const tiles = []; // Bounded batches avoid opening a whole world's files at once.
      for (let i = 0; i < references.length; i += 16) tiles.push(...await Promise.all(references.slice(i, i + 16).map(async ref => ({ x: ref.x, y: ref.y, samples: await readTerrainTile(ref) }))));
      const [origin]=row.t.revision===1?[accepted]:await tx.select({source:worldTerrainVersion.source}).from(worldTerrainVersion).where(and(eq(worldTerrainVersion.terrainId,row.t.id),eq(worldTerrainVersion.revision,1)));
      document = { ...summary(row.m, row.t), terrainId: row.t.id, worldId, format: 1, width: row.t.gridWidth, height: row.t.gridHeight, tileSize: row.t.tileSize, baseElevation: row.t.baseElevation, tiles, canEdit, acceptedRequestId: accepted.requestId,source:accepted.source,origin:origin?.source??{kind:"legacy"},protection:references.filter(r=>r.mask!==EMPTY_PROTECTION).map(r=>({x:r.x,y:r.y,mask:r.mask})),
        settings: { gridWidth: row.t.gridWidth, gridHeight: row.t.gridHeight, widthKm: row.t.widthMetres / 1000, heightKm: row.t.heightMetres / 1000, wrap: row.t.wrap, minElevation: row.t.minElevation, maxElevation: row.t.maxElevation } };
    }
    return { maps: rows.map(({ m, t }) => summary(m, t)), document, canEdit };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
export async function changeTerrain(userId: string, worldId: string, raw: unknown) {
  const command = terrainCommandSchema.parse(raw);
  return worldWriteTransaction(userId, worldId, async tx => {
    if (command.action === "create") {
      const creationHash = hash(command);
      const [existing] = await tx.select({ c: worldMapCanvas, t: worldTerrain }).from(worldMapCanvas).innerJoin(worldTerrain, eq(worldTerrain.id, worldMapCanvas.terrainId)).where(eq(worldMapCanvas.mapId, command.requestId));
      if (existing) { if (existing.c.worldId !== worldId || existing.t.creationHash !== creationHash) throw conflict(); return { id: existing.c.mapId, revision: existing.t.revision }; }
      if ((await tx.select({ id: worldMapCanvas.mapId }).from(worldMapCanvas).where(eq(worldMapCanvas.worldId, worldId))).length >= 64) throw new WorldError("This World has reached the first editor's limit of 64 terrain maps.", 400);
      const [collision] = await tx.select({ id: worldAtlasMap.id }).from(worldAtlasMap).where(eq(worldAtlasMap.id, command.requestId)); if (collision) throw unavailable();
      const s = command.settings, terrainId = randomUUID(),seaLevel=command.seaLevel??0,tiles=command.tiles??[];
      if(seaLevel<s.minElevation||seaLevel>s.maxElevation||tiles.some(t=>t.x>=s.gridWidth/32||t.y>=s.gridHeight/32||t.samples.some(v=>v<s.minElevation||v>s.maxElevation)))throw new WorldError("The proposed source exceeds this map's grid or elevation limits. Nothing was accepted.",400);
      try{if(command.source)validateGenerationAcceptance(terrainGeometry(s),command.source,seaLevel);}catch(error){throw new WorldError(error instanceof Error?error.message:"The physical-scale proposal is invalid.",400);}
      const objects=tiles.length?await stageTerrainTiles(command.requestId,worldId,terrainId,tiles):[];
      const source=command.source??{kind:"blank" as const,surface:command.initial as "ocean"|"land"};
      await tx.insert(worldAtlasMap).values({ id: command.requestId, worldId, name: command.name, scope: "world", mapKind: "generic" });
      await tx.insert(worldTerrain).values({ id: terrainId, worldId, gridWidth: s.gridWidth, gridHeight: s.gridHeight, widthMetres: s.widthKm * 1000, heightMetres: s.heightKm * 1000, wrap: s.wrap, minElevation: s.minElevation, maxElevation: s.maxElevation, baseElevation: command.initial === "ocean" ? Math.max(s.minElevation, seaLevel-500) : command.initial === "land" ? Math.min(s.maxElevation, seaLevel+500) : 0,seaLevel, creationHash });
      await tx.insert(worldTerrainVersion).values({ terrainId, worldId, revision: 1, previousRevision: null, seaLevel,source, requestId: command.requestId, contentHash: creationHash, authorId: userId });
      if(objects.length)await tx.insert(worldTerrainTile).values(objects.map(object=>({terrainId,worldId,revision:1,...object,manualProtection:EMPTY_PROTECTION})));
      await tx.insert(worldMapCanvas).values({ mapId: command.requestId, worldId, terrainId });
      return { id: command.requestId, revision: 1 };
    }
    const [row] = await tx.select({ t: worldTerrain, m: worldAtlasMap }).from(worldMapCanvas).innerJoin(worldAtlasMap, eq(worldAtlasMap.id, worldMapCanvas.mapId)).innerJoin(worldTerrain, eq(worldTerrain.id, worldMapCanvas.terrainId)).where(and(eq(worldMapCanvas.mapId, command.mapId), eq(worldMapCanvas.worldId, worldId))).for("update");
    if (!row || row.m.archivedAt) throw unavailable();
    const tiles = [...command.tiles].sort((a, b) => a.y - b.y || a.x - b.x), contentHash = hash({ ...command, tiles });
    const [retry] = await tx.select().from(worldTerrainVersion).where(eq(worldTerrainVersion.requestId, command.requestId));
    if (retry) { if (retry.terrainId !== row.t.id || retry.worldId !== worldId || retry.contentHash !== contentHash) throw conflict(); return { id: command.mapId, revision: retry.revision }; }
    if (row.t.revision !== command.revision) throw conflict();
    if (command.seaLevel < row.t.minElevation || command.seaLevel > row.t.maxElevation || tiles.some(t => t.x >= row.t.gridWidth / 32 || t.y >= row.t.gridHeight / 32 || t.samples.some(z => z < row.t.minElevation || z > row.t.maxElevation))) throw new WorldError("The edit exceeds this terrain's dimensions or elevation range. Your draft is retained.", 400);
    const source=command.source??{kind:"manual" as const},masks=new Map<string,string>();
    try{validateGenerationAcceptance({width:row.t.gridWidth,height:row.t.gridHeight,tileSize:32,displayWidth:row.t.widthMetres,displayHeight:row.t.heightMetres,min:row.t.minElevation,max:row.t.maxElevation,wrap:row.t.wrap},source,command.seaLevel);}catch(error){throw new WorldError(error instanceof Error?error.message:"The physical-scale proposal is invalid.",400);}
    const previous=(await tx.execute<TerrainObject&{x:number;y:number;mask:string}>(sql`SELECT DISTINCT ON (tile_x,tile_y) tile_x AS x,tile_y AS y,sha256,bytes,encoding,manual_protection AS mask FROM world_terrain_tile WHERE terrain_id=${row.t.id} AND world_id=${worldId} AND revision<=${row.t.revision} AND detail_level=0 ORDER BY tile_x,tile_y,revision DESC`)).rows;
    const references=new Map(previous.map(r=>[r.x+":"+r.y,r]));let changedSamples=0;
    const editShape={width:row.t.gridWidth,height:row.t.gridHeight,tileSize:32,displayWidth:row.t.widthMetres,displayHeight:row.t.heightMetres,min:row.t.minElevation,max:row.t.maxElevation,wrap:row.t.wrap},refinementMask=await getRefinementEditMask(tx,row.t.id,editShape,rootFrame(editShape),editShape);
    if(source.kind==="regenerated"&&command.seaLevel!==row.t.seaLevel)throw new WorldError("A selected-area regeneration must retain the saved sea level. Change sea level separately in the editor.",400);
    if(source.kind==="regenerated"&&(source.area.x+source.area.width>row.t.gridWidth||source.area.y+source.area.height>row.t.gridHeight))throw new WorldError("The selected regeneration area is outside this map.",400);
    for(let offset=0;offset<tiles.length;offset+=16)await Promise.all(tiles.slice(offset,offset+16).map(async tile=>{
      const key=tile.x+":"+tile.y,ref=references.get(key),before=ref?await readTerrainTile(ref):new Array<number>(1024).fill(row.t.baseElevation),mask=ref?.mask??EMPTY_PROTECTION,changed:number[]=[];
      for(let n=0;n<1024;n++)if(tile.samples[n]!==before[n]){
       if(refinementMask?.[(tile.y*32+(n>>5))*row.t.gridWidth+tile.x*32+(n&31)])throw new WorldError("This parent edit overlaps accepted finer terrain or its interpolation support. Edit the finer source instead. Your draft and all accepted detail are retained.",409);changed.push(n);if(source.kind==="regenerated"){const x=tile.x*32+(n&31),y=tile.y*32+(n>>5),a=source.area;if(x<a.x||x>=a.x+a.width||y<a.y||y>=a.y+a.height)throw new WorldError("Regeneration cannot change samples outside the explicitly selected area.",400);if(source.preserveManual&&isProtected(mask,n))throw new WorldError("This proposal would replace protected manual terrain. Prepare a new preview or explicitly allow replacement inside the selected area.",400);}
      }
      changedSamples+=changed.length;masks.set(key,source.kind==="manual"?protectSamples(mask,changed):mask);
    }));
    if(source.kind==="regenerated"&&!changedSamples)throw new WorldError("This selected-area preview makes no numerical change. Nothing was accepted.",400);
    // Private files are verified and published before the atomic revision/head
    // transaction commits references. A failed transaction leaves safe orphans.
    const objects = await stageTerrainTiles(command.requestId, worldId, row.t.id, tiles), revision = command.revision + 1;
    if(refinementMask)await tx.execute(sql`SELECT set_config('serrian.refinement_guard',${row.t.id},true)`);
    await tx.insert(worldTerrainVersion).values({ terrainId: row.t.id, worldId, revision, previousRevision: command.revision, requestId: command.requestId, contentHash,source, seaLevel: command.seaLevel, authorId: userId });
    if (objects.length) await tx.insert(worldTerrainTile).values(objects.map(object => ({ terrainId: row.t.id, worldId, revision, ...object,manualProtection:masks.get(object.x+":"+object.y)! })));
    await tx.update(worldTerrain).set({ revision, seaLevel: command.seaLevel, updatedAt: new Date() }).where(eq(worldTerrain.id, row.t.id));
    return { id: command.mapId, revision };
  });
}
