import {terrainSourceState} from "./terrain-regions";
import {acceptCanonNumerical} from "./world-canon-numerical-copy";
import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { worldCanonCopy, worldCanonCopyIdentity as identities, worldCanonCopyRow as rows } from "@/db/world-canon-copy-schema";
import type { WorldTransaction } from "./world-access-service";
import { WorldError } from "./world-errors";
import { canonDefinedIds, canonStrictConnectionAccount, canonGeographyRow, canonReferencedIds, remapCanonGeography, rebaseCanonSourcePins } from "./world-canon-geography";
import { canonGeographyPlan } from "./world-canon-geography-plan";
import {sourceIndex} from "./terrain-hydrology-service";
import {labelSourceCatalog} from "./terrain-labels-sources";
import type {LabelsLayer} from "./terrain-labels";
import {projectWorldPinnedContent} from "./world-pinned-content";
import {projectWorldContent} from "./world-content-projection";
import type {WorldPermission} from "./world-permissions";
import { nativeContentHash } from "./native-map-history-store";
import {redactUnderground,undergroundDesignSchema} from "./underground";
import {canonVolcanoes} from "./world-canon-landforms";
import {ordinaryCanonHistoricalComponent} from "./world-canon-geography-projection";

export type CanonCopyJob=typeof worldCanonCopy.$inferSelect;
export type PersonalCanonResult={id:string;pending?:boolean;progress?:{section:string;prepared:number}};
export async function canonCopyAvailable(tx:WorldTransaction){return !!(await tx.execute<{ok:boolean}>(sql`select to_regclass('public.world_canon_copy') is not null and to_regclass('public.world_canon_copy_row') is not null and to_regclass('public.world_canon_copy_identity') is not null ok`)).rows[0].ok;}
async function ordinarySourceConnection(tx:WorldTransaction,job:CanonCopyJob,row:Record<string,unknown>){
  for(const endpoint of [row.source,row.destination]){
    const e=endpoint as {map:Record<string,string>;entranceId:string;anchor?:string};
    if(e.map.kind==="world")continue;
    const family={town:"world_town_map",interior:"world_building_floor",underground:"world_underground_level"}[e.map.kind];
    if(!family)return false;const id=e.map.townMapId??e.map.floorId??e.map.levelId;
    const [native]=(await tx.execute<{design:{features:{id:string;archived:boolean}[]}}>(sql`select design from ${sql.identifier(family)} where world_id=${job.sourceWorldId} and id=${id} and not archived and native_origin_version_id is null`)).rows;
    if(!native)return false;
    const design=e.map.kind==="underground"?redactUnderground(undergroundDesignSchema.parse(native.design)):native.design;
    if(e.anchor!=="position"&&!design.features.some(feature=>feature.id===e.entranceId&&!feature.archived))return false;
  }return true;
}
async function preparedComponents(tx:WorldTransaction,requestId:string,versionId:string,componentIds:string[]){
  const keys=componentIds.flatMap(id=>[id,id+":"+versionId]),prepared=keys.length?await tx.select({key:rows.key,payload:rows.payload}).from(rows).where(and(eq(rows.requestId,requestId),eq(rows.family,"world_map_state_component"),inArray(rows.key,keys))):[],result=new Map<string,string>();
  for(const id of componentIds){const row=prepared.find(row=>row.key===id+":"+versionId)??prepared.find(row=>row.key===id);if(row)result.set(id,String(row.payload.id));}return result;
}
export async function registerCanonIdentities(tx:WorldTransaction,requestId:string,values:Iterable<string>){
  const entries=[...new Set(values)];for(let start=0;start<entries.length;start+=500)await tx.insert(identities).values(entries.slice(start,start+500).map(sourceId=>({requestId,sourceId,targetId:randomUUID()}))).onConflictDoNothing();
}
export async function canonIdentityMap(tx:WorldTransaction,requestId:string,values:Iterable<string>){
  const list=[...new Set(values)],result=new Map<string,string>();
  for(let offset=0;offset<list.length;offset+=500)for(const row of await tx.select().from(identities).where(and(eq(identities.requestId,requestId),inArray(identities.sourceId,list.slice(offset,offset+500)))))result.set(row.sourceId,row.targetId);
  return result;
}

/** A single bounded step. Terrain samples are never decoded or sent through the
 * browser. Every acknowledgement may be lost: the same packet resumes this row. */
export async function prepareCanonGeography(tx:WorldTransaction,job:CanonCopyJob,permission:WorldPermission):Promise<PersonalCanonResult|null>{
  const plans=canonGeographyPlan(job.sourceWorldId),plan=plans[job.phase];
  if(plan){
    const batch=(await tx.execute<{payload:Record<string,unknown>;key:string}>(sql`select to_jsonb(s) payload,${plan.key} key from (${plan.source}) s where (${plan.key})>${job.cursor} order by ${plan.key} limit ${plan.batch}`)).rows;
    let accepted=0;
    for(const row of batch){
      if(plan.table==="world_underground_connection"&&!await ordinarySourceConnection(tx,job,row.payload))continue;
      if(plan.table==="canon_landforms")row.payload.volcanoes=await canonVolcanoes(tx,job.sourceWorldId,String(row.payload.map_id),String(row.payload.terrain_id));
      if(plan.table==="world_map_state_component_ref"&&!(await preparedComponents(tx,job.requestId,String(row.payload.version_id),[String(row.payload.component_id)])).size)continue;
      const raw=plan.table==="world_map_state_component"?await ordinaryCanonHistoricalComponent(tx,job.sourceWorldId,job.actorId,permission,row.payload):row.payload;
      if(!raw)continue;
      const ordinary=["world_map_state_component","world_map_state_version"].includes(plan.table)?await projectWorldPinnedContent(raw,job.sourceWorldId,undefined,tx,{ordinary:true}):raw;
      // Geometry must be redacted while its complete attribute map is present;
      // generic field projection alone can remove a secret attribute too early.
      const safe=canonGeographyRow(plan.table,ordinary,job.actorId);
      const projected=projectWorldContent(safe,{...permission,protectedContent:false});
      const defined=canonDefinedIds(projected);
      if(plan.table==="world_map_state_component"&&projected.__version_id&&!canonStrictConnectionAccount(projected))defined.add(String(projected.id)+":"+String(projected.__version_id));
      if(typeof projected.request_id==="string")defined.add(projected.request_id);
      if(plan.table==="world_underground_connection")for(const endpoint of [projected.source,projected.destination]){
        const e=endpoint as {anchor?:string;entranceId?:string};if(e.anchor==="position"&&e.entranceId)defined.add(e.entranceId);
      }
      await registerCanonIdentities(tx,job.requestId,defined);
      await tx.insert(rows).values({requestId:job.requestId,family:plan.table,key:row.key,payload:projected});
      accepted++;
    }
    await tx.update(worldCanonCopy).set({phase:batch.length===plan.batch?job.phase:job.phase+1,cursor:batch.length===plan.batch?batch.at(-1)!.key:"",rows:job.rows+accepted,updatedAt:new Date()}).where(eq(worldCanonCopy.requestId,job.requestId));
    return {id:job.targetWorldId,pending:true,progress:{section:"Preparing independent map records",prepared:job.rows+accepted}};
  }
  // All native identities now exist in the private preparation map. Remap one
  // bounded native document per request, including forward links and JSON keys.
  const pending=await tx.select().from(rows).where(and(eq(rows.requestId,job.requestId),eq(rows.ready,0))).orderBy(rows.family,rows.key).limit(1);
  if(pending.length){
    const first=pending[0],large=new Set(["world_map_state_component","world_map_state_version","world_town_map","world_building_floor","world_underground_level","world_hydrology","world_environment","world_labels","world_artwork","world_atlas_drawing","world_geo_version","world_geo_part"]);
    const batch=large.has(first.family)?pending:await tx.select().from(rows).where(and(eq(rows.requestId,job.requestId),eq(rows.ready,0),eq(rows.family,first.family))).orderBy(rows.key).limit(128);
    for(const row of batch){
    const ids=await canonIdentityMap(tx,job.requestId,canonReferencedIds(row.payload));
    if(row.family==="world_map_state_component"&&row.payload.__version_id&&!canonStrictConnectionAccount(row.payload)){const key=String(row.payload.id)+":"+String(row.payload.__version_id),scoped=await canonIdentityMap(tx,job.requestId,[key]);ids.set(String(row.payload.id),scoped.get(key)!);}
    if(row.family==="world_map_state_component_ref"){
      const mapped=await preparedComponents(tx,job.requestId,String(row.payload.version_id),[String(row.payload.component_id)]),target=mapped.get(String(row.payload.component_id));if(!target){await tx.delete(rows).where(and(eq(rows.requestId,job.requestId),eq(rows.family,row.family),eq(rows.key,row.key)));continue;}ids.set(String(row.payload.component_id),target);
    }
    if(row.family==="world_map_state_version"){
      const envelope=(row.payload.payload as {nativeAtlas:{resources:{componentId:string}[]}}).nativeAtlas,mapped=await preparedComponents(tx,job.requestId,String(row.payload.id),envelope.resources.map(resource=>resource.componentId));envelope.resources=envelope.resources.filter(resource=>mapped.has(resource.componentId));for(const resource of envelope.resources)ids.set(resource.componentId,mapped.get(resource.componentId)!);
    }
    let payload=remapCanonGeography(row.payload,ids) as Record<string,unknown>;
    const knownTargets=new Set(ids.values()),staged=new Map<string,Set<string>>(),references=[...ids.keys()];
    // Defining an ID inside a captured menu is not proof that its physical
    // record was inherited. Link only to actual reviewed staged primary keys.
    for(let offset=0;offset<references.length;offset+=500){
      const found=await tx.select({family:rows.family,key:rows.key}).from(rows).where(and(eq(rows.requestId,job.requestId),inArray(rows.key,references.slice(offset,offset+500))));
      for(const record of found){const set=staged.get(record.family)??new Set<string>();set.add(ids.get(record.key)??record.key);staged.set(record.family,set);}
    }
    const has=(family:string,id:unknown)=>typeof id==="string"&&!!staged.get(family)?.has(id);
    const catalogs:Record<string,string[]>={maps:["world_atlas_map","world_town_map"],towns:["world_settlement_profile"],floors:["world_building_floor"],levels:["world_underground_level"],sites:["world_underground_site","world_map_place"],places:["world_geography","world_town_place"],crafts:["world_craft"],decks:["world_craft_deck"]};
    function detach(value:unknown):unknown{
      if(Array.isArray(value))return value.map(detach);
      if(!value||typeof value!=="object")return value;
      const record=value as Record<string,unknown>,output:Record<string,unknown>={};
      for(const [key,child]of Object.entries(record)){
        if(key==="destination"&&child&&typeof child==="object"&&"floorId"in child&&!has("world_building_floor",child.floorId))output[key]=null;
        else if(key==="placeId"&&typeof child==="string"&&!has("world_town_place",child)&&!has("world_geography",child))output[key]=null;
        else if(key==="markers"&&Array.isArray(child))output[key]=child.filter(item=>item&&typeof item==="object"&&(has("world_craft",item.id)||has("world_map_place",item.id)&&has("world_settlement_profile",item.townId))).map(detach);
        else if(key==="positions"&&Array.isArray(child))output[key]=child.filter(item=>item&&typeof item==="object"&&!item.removed&&has("world_craft",item.craftId)&&has("world_atlas_map",item.sourceMapId)).map(detach);
        else if(key==="placements"&&Array.isArray(child))output[key]=child.filter(item=>!item||typeof item!=="object"||!("townId"in item)||has("world_map_place",item.id)&&has("world_settlement_profile",item.townId)).map(detach);
        else if(key==="connections"&&Array.isArray(child))output[key]=child.filter(item=>!item||typeof item!=="object"||typeof item.source!=="string"||!item.archived&&(item.source==="exterior"||has("world_craft_deck",item.source))&&(item.destination==="exterior"||has("world_craft_deck",item.destination))).map(detach);
        else if(catalogs[key]&&Array.isArray(child))output[key]=child.filter(item=>item&&typeof item==="object"&&catalogs[key].some(family=>has(family,item.id))).map(detach);
        else output[key]=detach(child);
      }return output;
    }
    payload=detach(payload) as Record<string,unknown>;
    for(const [family,field,target]of [["world_geography","parent_id","world_geography"],["world_underground_site","place_id","world_geography"],["world_region_hierarchy","organizing_parent_id","world_map_region"],["world_building_interior","place_id","world_town_place"]])if(row.family===family&&payload[field]&&!has(target,payload[field]))payload[field]=null;
    if(row.family==="world_town_map"&&payload.placement_id&&!has("world_map_place",payload.placement_id)){payload.placement_id=null;payload.placement_revision=null;}
    if(row.family==="world_map_state_component")payload.content_hash=nativeContentHash(payload.payload);
    if(row.family==="world_underground_connection"){
      let available=[payload.source,payload.destination].every(endpoint=>{
        const e=endpoint as {map:Record<string,string>;entranceId:string;anchor?:string};
        return (e.map.kind!=="world"||has("world_atlas_map",e.map.atlasMapId))&&Object.entries(e.map).every(([key,id])=>key==="kind"||knownTargets.has(id))&&(e.anchor==="position"||knownTargets.has(e.entranceId));
      });
      for(const endpoint of [payload.source,payload.destination]){
        const e=endpoint as {map:Record<string,string>;entranceId:string;anchor?:string};
        if(e.anchor==="position"||e.map.kind==="world")continue;
        const family={town:"world_town_map",interior:"world_building_floor",underground:"world_underground_level"}[e.map.kind];
        const mapId=e.map.townMapId??e.map.floorId??e.map.levelId;
        const original=await tx.select().from(identities).where(and(eq(identities.requestId,job.requestId),eq(identities.targetId,mapId)));
        const [native]=original.length?await tx.select().from(rows).where(and(eq(rows.requestId,job.requestId),eq(rows.family,family??""),eq(rows.key,original[0].sourceId))):[];
        const [entrance]=await tx.select().from(identities).where(and(eq(identities.requestId,job.requestId),eq(identities.targetId,e.entranceId)));
        const featureId=native?.ready?e.entranceId:entrance?.sourceId;
        const features=(native?.payload.design as {features?:{id:string;archived:boolean}[]}|undefined)?.features??[];
        if(!features.some(feature=>feature.id===featureId&&!feature.archived))available=false;
      }
      if(!available){await tx.delete(rows).where(and(eq(rows.requestId,job.requestId),eq(rows.family,row.family),eq(rows.key,row.key)));continue;}
    }
    await tx.update(rows).set({payload,ready:1}).where(and(eq(rows.requestId,job.requestId),eq(rows.family,row.family),eq(rows.key,row.key)));
    }
    await tx.update(worldCanonCopy).set({updatedAt:new Date()}).where(eq(worldCanonCopy.requestId,job.requestId));
    return {id:job.targetWorldId,pending:true,progress:{section:"Remapping independent map identities",prepared:job.rows}};
  }
  return null;
}

/** Only called inside the final World creation transaction. New rows own all
 * mutable heads; immutable content-addressed terrain files are safely reused. */
export async function acceptCanonGeography(tx:WorldTransaction,job:CanonCopyJob,timelineId:string){
  // The World trigger assigns the final Primary timeline. Rehash only bounded
  // components containing its preparation placeholder after replacing it.
  if(job.targetTimelineId!==timelineId)for(;;){
    const [component]=await tx.select().from(rows).where(and(eq(rows.requestId,job.requestId),eq(rows.family,"world_map_state_component"),sql`${rows.payload}::text like ${"%"+job.targetTimelineId+"%"}`)).orderBy(rows.key).limit(1);if(!component)break;
    const payload=JSON.parse(JSON.stringify(component.payload).replaceAll(job.targetTimelineId,timelineId)) as Record<string,unknown>;payload.content_hash=nativeContentHash(payload.payload);await tx.update(rows).set({payload}).where(and(eq(rows.requestId,job.requestId),eq(rows.family,component.family),eq(rows.key,component.key)));
  }
  const plans=canonGeographyPlan(job.sourceWorldId);
  for(const plan of plans){
    if(plan.table==="world_terrain")await acceptCanonNumerical(tx,job.requestId);
    if(plan.table==="canon_landforms"||["world_terrain","world_terrain_version","world_terrain_tile","world_terrain_refinement","world_terrain_refinement_version","world_terrain_refinement_tile"].includes(plan.table))continue;
    if(plan.table==="world_craft_placement")await tx.execute(sql`insert into world_craft_operation(request_id,world_id,author_id,input_hash,result)
      select payload->>'id',${job.targetWorldId},${job.actorId},${job.inputHash},jsonb_build_object('craftId',coalesce(payload->>'craft_id',payload->>'id'),'revision',1,'placementRevision',1)
      from world_canon_copy_row where request_id=${job.requestId} and family in ('world_craft','world_craft_deck','world_craft_connection')`);
    if(plan.table==="world_map_region"){
      const prepared=await tx.select().from(rows).where(and(eq(rows.requestId,job.requestId),eq(rows.family,plan.table)));
      for(const row of prepared){const payload=row.payload,root=(await tx.execute<{revision:number}>(sql`select revision from world_terrain where id=${String(payload.terrain_id)} and world_id=${job.targetWorldId}`)).rows[0],details=(await tx.execute<{id:string;revision:number}>(sql`select id,revision from world_terrain_refinement where terrain_id=${String(payload.terrain_id)} and world_id=${job.targetWorldId}`)).rows;payload.initial_source_revision=root.revision;payload.initial_source_state=terrainSourceState(root.revision,details);await tx.update(rows).set({payload}).where(and(eq(rows.requestId,job.requestId),eq(rows.family,row.family),eq(rows.key,row.key)));}
    }
    if(plan.table==="world_map_state_component"){
      const inconsistent=(await tx.execute(sql`select 1 from world_canon_copy_row where request_id=${job.requestId} and family='world_map_state_component' group by payload->>'id' having count(distinct payload->>'content_hash')>1 limit 1`)).rows;if(inconsistent.length)throw new WorldError("An inherited immutable component has conflicting projections. Nothing was accepted.",409);
      await tx.execute(sql`insert into world_map_state_component select (jsonb_populate_record(null::world_map_state_component,payload)).* from (select distinct on(payload->>'id') payload from world_canon_copy_row where request_id=${job.requestId} and family='world_map_state_component' and ready=1 order by payload->>'id',record_key) c`);continue;
    }
    const table=sql.identifier(plan.table);
    await tx.execute(sql`insert into ${table} select (jsonb_populate_record(null::${table},replace(payload::text,${JSON.stringify(job.targetTimelineId)},${JSON.stringify(timelineId)})::jsonb)).*
      from world_canon_copy_row where request_id=${job.requestId} and family=${plan.table} and ready=1 order by record_key`);
  }
  const worldId=job.targetWorldId,actor=job.actorId,hash=job.inputHash;
  const roots=(await tx.execute<{source:string;target:string}>(sql`select c.map_id source,i.target_id target from world_map_canvas c join world_canon_copy_identity i on i.request_id=${job.requestId} and i.source_id=c.map_id join world_map_canvas own on own.map_id=i.target_id and own.world_id=${job.targetWorldId} where c.world_id=${job.sourceWorldId} and c.purpose='world'`)).rows;
  for(const root of roots){
    const before=await sourceIndex(tx,job.sourceWorldId,root.source),after=await sourceIndex(tx,worldId,root.target);
    const oldWater=(await tx.execute<{revision:number}>(sql`select revision from world_hydrology where world_id=${job.sourceWorldId} and map_id=${root.source}`)).rows[0]?.revision??0;
    for(const family of ["world_hydrology","world_environment"]){
      const table=sql.identifier(family),[head]=(await tx.execute<{layer:Record<string,unknown>}>(sql`select layer from ${table} where world_id=${worldId} and map_id=${root.target}`)).rows;
      if(!head)continue;const layer=rebaseCanonSourcePins(head.layer,before,after) as {fields?:{waterRevision:number}[]};
      if(family==="world_environment")for(const field of layer.fields??[])if(field.waterRevision===oldWater)field.waterRevision=oldWater?1:0;
      await tx.execute(sql`update ${table} set layer=${JSON.stringify(layer)}::jsonb where world_id=${worldId} and map_id=${root.target}`);
    }
    const [labels]=(await tx.execute<{layer:LabelsLayer}>(sql`select layer from world_labels where world_id=${worldId} and map_id=${root.target}`)).rows;
    if(labels){
      const original=await labelSourceCatalog(tx,job.sourceWorldId,root.source),current=await labelSourceCatalog(tx,worldId,root.target),ids=await canonIdentityMap(tx,job.requestId,[...original.values()].map(candidate=>candidate.source.id));
      for(const label of labels.layer.labels){
        if(!label.source)continue;
        const before=[...original.values()].find(candidate=>candidate.source.kind===label.source!.kind&&(ids.get(candidate.source.id)??candidate.source.id)===label.source!.id);
        const after=current.get(label.source.kind+":"+label.source.id);
        if(before&&after&&before.source.fingerprint===label.source.fingerprint)label.source=after.source;
      }
      await tx.execute(sql`update world_labels set layer=${JSON.stringify(labels.layer)}::jsonb where world_id=${worldId} and map_id=${root.target}`);
    }
  }
  // First independent revisions use the existing native version formats. No
  // accepted source receipt, audit author, or mutable head is borrowed.
  for(const family of ["hydrology","environment","artwork","labels"]){const head=sql.identifier("world_"+family),version=sql.identifier("world_"+family+"_version");await tx.execute(sql`insert into ${version}(map_id,world_id,revision,previous_revision,restored_from_revision,layer,request_id,created_by_user_id)
    select map_id,world_id,1,null,null,layer,map_id,${actor} from ${head} where world_id=${worldId}`);}
  await tx.execute(sql`insert into world_terrain_material_version(map_id,revision,layer,request_id,created_by_user_id) select map_id,1,layer,map_id,${actor} from world_terrain_material where world_id=${worldId}`);
  await tx.execute(sql`insert into world_region_hierarchy_change(request_id,map_id,world_id,terrain_id,source_world_map_id,revision,previous_revision,previous_parent_id,organizing_parent_id,action,request_hash,created_by_user_id)
    select h.map_id,h.map_id,h.world_id,h.terrain_id,h.source_world_map_id,1,0,null,h.organizing_parent_id,'create',r.creation_hash,${actor} from world_region_hierarchy h join world_map_region r on r.map_id=h.map_id and r.world_id=h.world_id where h.world_id=${worldId}`);
  await tx.execute(sql`insert into world_town_map_version(request_id,map_id,world_id,revision,author_id,input_hash,name,archived,design)
    select id,id,world_id,1,${actor},${hash},name,false,design from world_town_map where world_id=${worldId}`);
  await tx.execute(sql`insert into world_building_floor_operation(request_id,world_id,building_id,author_id,input_hash,result)
    select id,world_id,building_id,${actor},${hash},jsonb_build_object('buildingId',building_id,'floorId',id,'revision',1) from world_building_floor where world_id=${worldId}`);
  await tx.execute(sql`insert into world_building_floor_version(id,floor_id,world_id,revision,request_id,name,floor_order,elevation_metres,archived,design)
    select gen_random_uuid()::text,id,world_id,1,id,name,floor_order,elevation_metres,false,design from world_building_floor where world_id=${worldId}`);
  for(const [table,kind]of [["world_underground_site","site"],["world_underground_level","level"],["world_underground_connection","connection"]]){
    const native=sql.identifier(table);
    await tx.execute(sql`insert into world_underground_operation(request_id,world_id,author_id,input_hash,result) select id,world_id,${actor},${hash},jsonb_build_object(${kind+"Id"}::text,id,'revision',1) from ${native} where world_id=${worldId}`);
    await tx.execute(sql`insert into world_underground_version(id,world_id,kind,record_id,revision,request_id,snapshot) select gen_random_uuid()::text,world_id,${kind},id,1,id,world_underground_snapshot(${kind}::text,to_jsonb(s)) from ${native} s where world_id=${worldId}`);
  }
  await tx.execute(sql`insert into world_craft_version(craft_id,world_id,revision,draft,archived,request_id) select id,world_id,1,draft,false,id from world_craft where world_id=${worldId}`);
  await tx.execute(sql`insert into world_craft_deck_version(deck_id,craft_id,world_id,revision,draft,archived,request_id) select id,craft_id,world_id,1,draft,false,id from world_craft_deck where world_id=${worldId}`);
  await tx.execute(sql`insert into world_craft_connection_version(connection_id,revision,snapshot,request_id) select id,1,jsonb_build_object('id',id,'worldId',world_id,'craftId',craft_id,'revision',1,'source',source,'sourceFeatureId',source_feature_id,'sourcePoint',source_point,'destination',destination,'arrivalFeatureId',arrival_feature_id,'arrivalPoint',arrival_point,'kind',kind,'twoWay',two_way,'archived',archived),id from world_craft_connection where world_id=${worldId}`);
  await tx.execute(sql`insert into world_settlement_history(geography_id,world_id,entry_id)
    select g.target_id,${worldId},e.target_id from world_settlement_history s
    join world_canon_copy_identity g on g.request_id=${job.requestId} and g.source_id=s.geography_id
    join world_canon_copy_identity e on e.request_id=${job.requestId} and e.source_id=s.entry_id
    join world_settlement_profile p on p.geography_id=g.target_id and p.world_id=${worldId}
    join world_historical_entry h on h.id=e.target_id and h.world_id=${worldId}
    where s.world_id=${job.sourceWorldId}`);
  await tx.execute(sql`insert into world_history_version_entity(version_id,world_id,entry_id,target_id,lore_id,geography_id,event_type,entity_category)
    select head.version_id,${worldId},entry.target_id,geo.target_id,null,geo.target_id,s.event_type,s.entity_category
    from world_history_version_entity s join world_history_head original on original.version_id=s.version_id and original.world_id=s.world_id
    join world_timeline timeline on timeline.id=original.timeline_id and timeline.is_primary
    join world_canon_copy_identity entry on entry.request_id=${job.requestId} and entry.source_id=s.entry_id
    join world_canon_copy_identity geo on geo.request_id=${job.requestId} and geo.source_id=s.geography_id
    join world_geography g on g.id=geo.target_id and g.world_id=${worldId}
    join world_history_head head on head.entity_id=entry.target_id and head.world_id=${worldId} and head.timeline_id=${timelineId}
    where s.world_id=${job.sourceWorldId} and s.lore_id is null`);
  const [unready]=await tx.select({key:rows.key}).from(rows).where(and(eq(rows.requestId,job.requestId),eq(rows.ready,0))).limit(1);
  if(unready)throw new WorldError("The independent map preparation is incomplete. Retry the original request.",409);
  await tx.update(identities).set({targetId:timelineId}).where(and(eq(identities.requestId,job.requestId),eq(identities.targetId,job.targetTimelineId)));
  await tx.update(worldCanonCopy).set({status:"accepted",updatedAt:new Date()}).where(eq(worldCanonCopy.requestId,job.requestId));
  return (await tx.select({payload:rows.payload}).from(rows).where(and(eq(rows.requestId,job.requestId),eq(rows.family,"canon_landforms"),eq(rows.ready,1)))).map(row=>row.payload);
}
