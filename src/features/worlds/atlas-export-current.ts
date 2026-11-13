import "server-only";
import {and,eq,sql} from "drizzle-orm";
import {worldTownMap} from "@/db/world-town-map-schema";
import {worldBuildingFloor,worldBuildingInterior,worldBuildingInteriorSource} from "@/db/world-building-floor-schema";
import {worldUndergroundLevel,worldUndergroundSite} from "@/db/world-underground-schema";
import {worldCraft,worldCraftDeck} from "@/db/world-craft-schema";
import {worldTerrainRefinement} from "@/db/world-terrain-refinement-schema";
import {refinementGeometryAtRevision} from "./terrain-refinement-geometry";
import {overviewLevels} from "./terrain-refinement";
import {atlasComposition} from "@/db/world-asset-schema";
import {buildingFloorAlignment} from "./building-floor-alignment";
import {terrainMapContext} from "./terrain-map-context";
import {geographicPrivateMaps,geographicPrivatePlaces} from "./geographic-privacy";
import {consumptionFloorDesign,consumptionTownDesign,consumptionUndergroundDesign} from "./atlas-map-consumption-projection";
import {type ConsumptionGeometry} from "./atlas-map-consumption";
import {exportResourceSchema,type ExportResource} from "./atlas-export";
import {worldScopeAllowed} from "./world-access-service";
import {projectWorldPinnedContent} from "./world-pinned-content";
import {worldAssetPins} from "./world-asset-permissions";
import {artworkAsset} from "./terrain-artwork-assets";
import {terrainGeometry} from "./terrain";
import {regionAreaContainsPath} from "./terrain-region-geometry";
import {frameContains} from "./terrain-refinement";
import {samplePinnedTerrainPoint,type NumericalSampleSource} from "./terrain-numerical-sampling";
import {townBackdropPoints,buildTownBackdrop} from "./town-backdrop";
import {sourceIndex} from "./terrain-hydrology-service";
import {readTerrainTile} from "./terrain-storage";
import {mapAppearanceSchema} from "./terrain-appearance";
import {EMPTY_HYDROLOGY} from "./terrain-hydrology";
import {EMPTY_ENVIRONMENT} from "./terrain-environment";
import {EMPTY_TERRAIN_MATERIALS} from "./terrain-materials";
import {EMPTY_ARTWORK} from "./terrain-artwork";
import {EMPTY_LABELS} from "./terrain-labels";
import type {NativeHistoryTx} from "./native-map-history-store";
import type {NativeMapTarget} from "./native-map-history";
import type {ExportFrame} from "./atlas-export";
import {WorldError} from "./world-errors";

export const exportUnavailable=()=>new WorldError("This ordinary saved map source is unavailable with your current access.",404);
export async function exportMapPrivacy(tx:NativeHistoryTx,worldId:string,mapId?:string,places:string[]=[]){
 const privateMaps=geographicPrivateMaps(worldId),privatePlaces=geographicPrivatePlaces(worldId);
 const result=await tx.execute<{ok:boolean}>(sql`select ${mapId?sql`not exists(select 1 from world_atlas_map m where m.world_id=${worldId} and m.id=${mapId} and (m.id in (${privateMaps}) or m.geography_id in (${privatePlaces})))`:sql`true`} and ${places.length?sql`not exists(select 1 from (${privatePlaces}) p where p.id in (${sql.join(places.map(id=>sql`${id}`),sql`,`)}))`:sql`true`} ok`);
 if(!result.rows[0]?.ok)throw exportUnavailable();
}
async function ordinaryPlaces(tx:NativeHistoryTx,worldId:string,ids:string[]){if(!worldScopeAllowed(worldId,"settlements"))return new Set(ids);if(!ids.length)return new Set<string>();const rows=await tx.execute<{id:string}>(sql`select id from (${geographicPrivatePlaces(worldId)}) p where p.id in (${sql.join(ids.map(id=>sql`${id}`),sql`,`)})`);return new Set(rows.rows.map(r=>r.id));}

/** One repeatable-read snapshot. No current head is promoted into native history. */
export async function currentExportResources(tx:NativeHistoryTx,worldId:string,target:NativeMapTarget){
 const resources=new Map<string,ExportResource>();let geometry:ConsumptionGeometry,title="",revision=0,extent:ExportFrame,wrapWidth:number|null=null,anchor:string|undefined;
 const add=async(key:string,value:unknown)=>{resources.set(key,exportResourceSchema.parse(await projectWorldPinnedContent(value,worldId,undefined,tx,{ordinary:true})));};
 if(target.kind==="terrain"){
  const c=await terrainMapContext(tx,worldId,target.id);anchor=c.sourceMapId;await exportMapPrivacy(tx,worldId,target.id);await exportMapPrivacy(tx,worldId,anchor);
  const t=c.terrain,settings={gridWidth:t.gridWidth,gridHeight:t.gridHeight,widthKm:t.widthMetres/1000,heightKm:t.heightMetres/1000,wrap:t.wrap,minElevation:t.minElevation,maxElevation:t.maxElevation},shape=terrainGeometry(settings);
  const [accepted]=(await tx.execute(sql`select content_hash from world_terrain_version where world_id=${worldId} and terrain_id=${t.id} and revision=${t.revision}`)).rows;if(!accepted)throw exportUnavailable();
  const tiles=(await tx.execute(sql`select distinct on(tile_x,tile_y) tile_x x,tile_y y,0 lod,sha256,bytes,encoding from world_terrain_tile where terrain_id=${t.id} and world_id=${worldId} and revision<=${t.revision} and detail_level=0 order by tile_x,tile_y,revision desc`)).rows;
  geometry={family:c.region?"regional":"world",settings,terrainId:t.id,revision:t.revision,baseElevation:t.baseElevation,seaLevel:t.seaLevel,tiles:tiles as Extract<ConsumptionGeometry,{family:"world"|"regional"}>["tiles"],region:c.region?{parentMapId:c.region.parentMapId,frame:{...c.region.frame,rotation:0},footprint:c.region.footprint??null}:null};
  title=c.map.name;revision=t.revision;extent=c.region?c.region.frame:{x:0,y:0,width:shape.displayWidth,height:shape.displayHeight};wrapWidth=shape.wrap?shape.displayWidth:null;
  for(const [key,table,fallback] of [["hydrology","world_hydrology",EMPTY_HYDROLOGY],["environment","world_environment",EMPTY_ENVIRONMENT],["materials","world_terrain_material",EMPTY_TERRAIN_MATERIALS],["artwork","world_artwork",EMPTY_ARTWORK],["labels","world_labels",EMPTY_LABELS]] as const){
   const [row]=(await tx.execute<{layer:unknown}>(sql`select layer from ${sql.identifier(table)} where world_id=${worldId} and map_id=${anchor}`)).rows;
   const value=structuredClone(row?.layer??fallback);
   if(key==="labels"){
    const layer=value as typeof EMPTY_LABELS,hidden=await ordinaryPlaces(tx,worldId,layer.labels.flatMap(l=>l.source?.kind==="town"?[l.source.id]:[]));layer.labels=layer.labels.filter(l=>l.visible&&!(l.source?.kind==="town"&&hidden.has(l.source.id))).map(l=>({...l,source:null}));
    if(c.region){const [local]=(await tx.execute<{layer:typeof EMPTY_LABELS}>(sql`select layer from world_labels where world_id=${worldId} and map_id=${target.id}`)).rows;if(local){layer.visible=local.layer.visible;layer.composition=local.layer.composition;layer.suggestions=local.layer.suggestions;}}
   }
   await add(key,{kind:key,value});
  }
  const [appearance]=(await tx.execute<{spec:unknown}>(sql`select spec from world_map_appearance where world_id=${worldId} and map_id in (${target.id},${anchor}) order by (map_id=${target.id}) desc limit 1`)).rows;
  await add("appearance",{kind:"appearance",value:appearance?mapAppearanceSchema.parse(appearance.spec):null});
  const metas=await tx.select().from(worldTerrainRefinement).where(and(eq(worldTerrainRefinement.worldId,worldId),eq(worldTerrainRefinement.terrainId,t.id))).orderBy(worldTerrainRefinement.level,worldTerrainRefinement.id);
  for(const m of metas){
   const objects=(await tx.execute(sql`select distinct on(lod,tile_x,tile_y) tile_x x,tile_y y,lod,sha256,bytes,encoding from world_terrain_refinement_tile where world_id=${worldId} and refinement_id=${m.id} and revision<=${m.revision} order by lod,tile_x,tile_y,revision desc`)).rows;
   await add("refinement:"+m.id,{kind:"numerical",terrainId:t.id,sourceId:m.id,parentId:m.parentId??t.id,parentRevision:m.parentRevision,revision:m.revision,frame:{x:m.x,y:m.y,width:m.width,height:m.height,rotation:0},gridWidth:m.gridWidth,gridHeight:m.gridHeight,baseElevation:t.baseElevation,tiles:objects});
  }
  const parents=metas.map(m=>({id:m.parentId??t.id,revision:m.parentRevision})),seen=new Set<string>();
  while(parents.length){const pin=parents.shift()!,key=pin.id+":"+pin.revision;if(seen.has(key))continue;seen.add(key);if(seen.size>512)throw new WorldError("This source has too many pinned numerical ancestors for one export.",413);const meta=metas.find(m=>m.id===pin.id);if(pin.id===t.id&&pin.revision===t.revision||meta?.revision===pin.revision)continue;if(!meta&&pin.id!==t.id)throw exportUnavailable();
   const [version]=(await tx.execute<{parentRevision:number|null}>(meta?sql`select parent_revision "parentRevision" from world_terrain_refinement_version where world_id=${worldId} and refinement_id=${pin.id} and revision=${pin.revision}`:sql`select null::integer "parentRevision" from world_terrain_version where world_id=${worldId} and terrain_id=${t.id} and revision=${pin.revision}`)).rows;if(!version)throw exportUnavailable();
   const retained=meta?await refinementGeometryAtRevision(tx,{...meta,frame:{x:meta.x,y:meta.y,width:meta.width,height:meta.height},overviewLevels:overviewLevels(meta.gridWidth,meta.gridHeight)},pin.revision):undefined;
   const objects=(await tx.execute(meta?sql`select distinct on(tile_x,tile_y) tile_x x,tile_y y,0 lod,sha256,bytes,encoding from world_terrain_refinement_tile where world_id=${worldId} and refinement_id=${pin.id} and revision<=${pin.revision} and lod=0 order by tile_x,tile_y,revision desc`:sql`select distinct on(tile_x,tile_y) tile_x x,tile_y y,0 lod,sha256,bytes,encoding from world_terrain_tile where world_id=${worldId} and terrain_id=${t.id} and revision<=${pin.revision} and detail_level=0 order by tile_x,tile_y,revision desc`)).rows;
   await add("source:"+key,{kind:"numerical",terrainId:t.id,sourceId:pin.id,parentId:meta?meta.parentId??t.id:null,parentRevision:version.parentRevision,revision:pin.revision,frame:retained?{...retained.frame,rotation:0}:{x:0,y:0,width:shape.displayWidth,height:shape.displayHeight,rotation:0},gridWidth:retained?.gridWidth??shape.width,gridHeight:retained?.gridHeight??shape.height,baseElevation:t.baseElevation,tiles:objects});if(meta&&version.parentRevision!==null)parents.push({id:meta.parentId??t.id,revision:version.parentRevision});
  }
  if(worldScopeAllowed(worldId,"settlements")){
   const hidden=geographicPrivatePlaces(worldId),towns=(await tx.execute(sql`select p.id,p.geography_id "townId",p.x_metres x,p.y_metres y,p.revision from world_map_place p join world_geography g on g.id=p.geography_id and g.world_id=p.world_id join world_map_canvas mc on mc.map_id=p.map_id and mc.world_id=p.world_id where p.world_id=${worldId} and mc.terrain_id=${t.id} and p.removed_at is null and g.archived_at is null and p.geography_id not in (${hidden}) and p.map_id not in (${geographicPrivateMaps(worldId)})`)).rows;
   await add("positions",{kind:"positions",towns,crafts:[]});
   const labels=(await tx.execute<{id:string;x:number;y:number;name:string}>(sql`select p.id,p.x_metres x,p.y_metres y,g.name from world_map_place p join world_geography g on g.id=p.geography_id and g.world_id=p.world_id join world_map_canvas mc on mc.map_id=p.map_id and mc.world_id=p.world_id where p.world_id=${worldId} and mc.terrain_id=${t.id} and p.removed_at is null and g.archived_at is null and p.geography_id not in (${hidden}) and p.map_id not in (${geographicPrivateMaps(worldId)})`)).rows;
   await add("presentation",{kind:"presentation",places:labels.map(p=>({...p,kind:"town"})),ruins:[]});
  }
  if(worldScopeAllowed(worldId,"craft")){
   const rows=(await tx.execute<{id:string;name:string;classification:import("./craft").CraftMarker["classification"];x:number;y:number;rotation:number;revision:number}>(sql`select c.id,c.name,c.classification,p.x,p.y,p.rotation,p.revision from world_craft_placement p join world_craft c on c.id=p.craft_id and c.world_id=p.world_id where p.world_id=${worldId} and p.terrain_id=${t.id} and p.source_map_id=${anchor} and not p.removed and not c.archived and c.native_origin_version_id is null`)).rows,crafts=rows.filter(p=>!c.region||regionAreaContainsPath({frame:c.region.frame,footprint:c.region.footprint??undefined},[p],{width:shape.displayWidth,height:shape.displayHeight,wrap:shape.wrap}));
   await add("craft-positions",{kind:"positions",towns:[],crafts:crafts.map(p=>({craftId:p.id,x:p.x,y:p.y,rotation:p.rotation,revision:p.revision}))});const presentation=resources.get("presentation");await add("presentation",{kind:"presentation",places:presentation?.kind==="presentation"?presentation.places:[],ruins:[],crafts});
  }
 }else if(target.kind==="town"){
  const [r]=await tx.select().from(worldTownMap).where(and(eq(worldTownMap.worldId,worldId),eq(worldTownMap.id,target.id)));if(!r||r.nativeOriginVersionId||r.archived)throw exportUnavailable();anchor=r.sourceMapId;await exportMapPrivacy(tx,worldId,anchor,[r.townId]);const design=consumptionTownDesign(r.design),hidden=await ordinaryPlaces(tx,worldId,design.features.flatMap(f=>f.placeId?[f.placeId]:[]));design.features=design.features.filter(f=>!f.placeId||!hidden.has(f.placeId));geometry={family:"town",frame:{width:r.frame.width,height:r.frame.height},design};title=r.name;revision=r.revision;extent={x:0,y:0,...geometry.frame};
  if(worldScopeAllowed(worldId,"atlas")){
   const root=await currentExportResources(tx,worldId,{kind:"terrain",id:anchor}),g=root.geometry;if(!("settings" in g))throw exportUnavailable();const shape=terrainGeometry(g.settings),water=root.resources.get("hydrology"),sources=await sourceIndex(tx,worldId,anchor),memo=new Map<string,Promise<number[]>>();
   const load=async(id:string,rev:number):Promise<NumericalSampleSource>=>{const resource=[...root.resources.values()].find(v=>v.kind==="numerical"&&v.sourceId===id&&v.revision===rev);const value=resource?.kind==="numerical"?resource:null,base=id===g.terrainId&&rev===g.revision;if(!base&&!value)throw exportUnavailable();const tiles=base?g.tiles:value!.tiles.filter(t=>t.lod===0),refs=new Map(tiles.map(t=>[t.x+":"+t.y,t]));return{id,revision:rev,parentId:base?null:value!.parentId,parentRevision:base?null:value!.parentRevision,shape:{...shape,width:base?shape.width:value!.gridWidth,height:base?shape.height:value!.gridHeight,displayWidth:base?shape.displayWidth:value!.frame.width,displayHeight:base?shape.displayHeight:value!.frame.height,wrap:base&&shape.wrap},frame:base?{x:0,y:0,width:shape.displayWidth,height:shape.displayHeight}:value!.frame,at:async(x,y)=>{const ref=refs.get(Math.floor(x/32)+":"+Math.floor(y/32));if(!ref){if(!base&&value!.parentId)throw new WorldError("A required pinned Town ground object is missing. Restore its paired backup.",409);return g.baseElevation;}let samples=memo.get(ref.sha256);if(!samples){samples=readTerrainTile(ref);memo.set(ref.sha256,samples);}return(await samples)[y%32*32+x%32];}};};
   const samples=[];for(const p of townBackdropPoints(r.frame,sources.world)){const fine=[...sources.sources].reverse().find(s=>frameContains(s.frame,p,shape.displayWidth,shape.wrap))??sources.sources[0];samples.push({elevation:await samplePinnedTerrainPoint(p,fine.id,fine.revision,shape,load),spacingX:fine.frame.width/fine.gridWidth,spacingY:fine.frame.height/fine.gridHeight});}
   const backdrop=buildTownBackdrop(r.frame,{layer:water?.kind==="hydrology"?water.value:EMPTY_HYDROLOGY,sources},samples,sources.fingerprint);await add("backdrop",{kind:"backdrop",value:{size:backdrop.size,spacing:backdrop.spacing,heights:backdrop.heights,wet:backdrop.wet,water:backdrop.water}});
  }
 }else if(target.kind==="floor"){
  const [r]=await tx.select({floor:worldBuildingFloor,building:worldBuildingInterior}).from(worldBuildingFloor).innerJoin(worldBuildingInterior,and(eq(worldBuildingInterior.id,worldBuildingFloor.buildingId),eq(worldBuildingInterior.worldId,worldId))).where(and(eq(worldBuildingFloor.worldId,worldId),eq(worldBuildingFloor.id,target.id)));
  if(!r||r.floor.nativeOriginVersionId||r.floor.archived)throw exportUnavailable();const [binding]=await tx.select({map:worldTownMap}).from(worldBuildingInteriorSource).innerJoin(worldTownMap,and(eq(worldTownMap.id,worldBuildingInteriorSource.townMapId),eq(worldTownMap.worldId,worldId))).where(and(eq(worldBuildingInteriorSource.worldId,worldId),eq(worldBuildingInteriorSource.buildingId,r.building.id))).limit(1);if(!binding)throw exportUnavailable();await exportMapPrivacy(tx,worldId,binding.map.sourceMapId,[binding.map.townId,...r.building.placeId?[r.building.placeId]:[]]);geometry={family:"floor",buildingId:r.building.id,frame:{width:r.building.frame.width,height:r.building.frame.height},order:r.floor.order,elevation:r.floor.elevation,design:consumptionFloorDesign(r.floor.design)};title=r.floor.name;revision=r.floor.revision;extent={x:0,y:0,...geometry.frame};const aligned=buildingFloorAlignment(r.building.footprint,r.building.frame);extent={x:0,y:0,width:aligned.frame.width,height:aligned.frame.height};resources.set("alignment",{kind:"alignment",value:{angle:aligned.angle,offset:aligned.offset,frame:extent}});
 }else if(target.kind==="underground"){
  const [r]=await tx.select({level:worldUndergroundLevel,site:worldUndergroundSite}).from(worldUndergroundLevel).innerJoin(worldUndergroundSite,and(eq(worldUndergroundSite.id,worldUndergroundLevel.siteId),eq(worldUndergroundSite.worldId,worldId))).where(and(eq(worldUndergroundLevel.worldId,worldId),eq(worldUndergroundLevel.id,target.id)));if(!r||r.level.nativeOriginVersionId||r.level.archived||r.site.archived)throw exportUnavailable();await exportMapPrivacy(tx,worldId,undefined,r.site.placeId?[r.site.placeId]:[]);geometry={family:"underground",siteId:r.site.id,frame:{width:r.site.frame.width,height:r.site.frame.height},depth:r.level.depth,order:r.level.order,design:consumptionUndergroundDesign(r.level.design)};title=r.level.name;revision=r.level.revision;extent={x:0,y:0,...geometry.frame};
 }else{
  const [deck]=target.kind==="deck"?await tx.select().from(worldCraftDeck).where(and(eq(worldCraftDeck.worldId,worldId),eq(worldCraftDeck.id,target.id))):[];
  const [craft]=await tx.select().from(worldCraft).where(and(eq(worldCraft.worldId,worldId),eq(worldCraft.id,deck?.craftId??target.id)));const r=deck??craft;if(!r||!craft||r.nativeOriginVersionId||r.archived||craft.archived||target.kind==="deck"&&!deck)throw exportUnavailable();const d=r.draft,plan=consumptionFloorDesign(d.surface.plan),outlineId=plan.features.some(f=>f.id===d.surface.outlineId)?d.surface.outlineId:null;
  geometry=deck?{family:"deck",craftId:craft.id,frame:{width:deck.draft.frame.width,height:deck.draft.frame.height},height:deck.draft.height,order:deck.draft.order,outlineId,plan}:{family:"craft",frame:{width:craft.draft.frame.width,height:craft.draft.frame.height},classification:craft.draft.classification,outlineId,plan};title=d.name;revision=r.revision;extent={x:0,y:0,...geometry.frame};
 }
 await add("geometry",{kind:"geometry",value:geometry});
 if(worldScopeAllowed(worldId,"assets")){
  const [composition]=await tx.select().from(atlasComposition).where(and(eq(atlasComposition.worldId,worldId),eq(atlasComposition.kind,target.kind==="deck"?"craft-deck":target.kind),eq(atlasComposition.mapId,target.id)));
  if(composition){const allowed=new Set((await worldAssetPins(tx,worldId)).pins.map(p=>p.assetId+":"+p.assetVersion));await add("composition",{kind:"composition",value:{...composition.layer,placements:composition.layer.placements.filter(p=>p.visible&&(artworkAsset(p.assetId)||allowed.has(p.assetId+":"+p.version)))}});}
 }
 return {resources,geometry,title,revision,extent,wrapWidth};
}
