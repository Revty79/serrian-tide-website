import "server-only";
import {randomUUID} from "node:crypto";
import {sql} from "drizzle-orm";
import {floorCommandSchema,validateFloor,type FloorBundle} from "./building-floor";
import {nativeResource,nativeRelatedContext,nativeContentContext,type NativeContentContext} from "./native-map-history-context";
import {assertNativeTarget,assertNativeRevision} from "./native-map-history-resources";
import {commitNativeUpdates,type NativeWriteResult} from "./native-map-history-write";
import type {NativeHistoryTx} from "./native-map-history-store";
import {boundedRegionalLayer} from "./terrain-regional-authoring-service";
import {WorldError} from "./world-service";
import {nativeConditions} from "./native-map-history-conditions";
import {nativeObjectPresent} from "./native-map-history";

export async function changeNativeFloorRoute(tx:NativeHistoryTx,c:NativeContentContext,raw:unknown):Promise<NativeWriteResult>{
  const command=floorCommandSchema.parse(raw);if(command.action!=="connect"&&command.action!=="lifecycle")throw new WorldError("Choose this dated floor's stairs or retained status.",400);
  assertNativeTarget(c,command.floorId,"floor");
  const value=structuredClone((await nativeResource(tx,c,"floor")).payload) as unknown as {bundle:FloorBundle},old=value.bundle.document!,building=value.bundle.building!;assertNativeRevision(old.revision,command.revision);
  if(command.action==="lifecycle"){
    if(command.archived){
      const incoming=await tx.execute(sql`select 1 from world_map_state_head h join world_map_state_version v on v.id=h.version_id and v.world_id=h.world_id join world_map_state_component_ref r on r.version_id=v.id and r.world_id=h.world_id and r.key='floor' join world_map_state_component p on p.id=r.component_id and p.world_id=h.world_id cross join lateral jsonb_array_elements(p.payload#>'{bundle,document,design,features}') f where h.world_id=${c.worldId} and h.timeline_id=${c.scope.timelineId} and not v.archived and v.start_year<=${c.scope.year} and v.end_year>=${c.scope.year} and p.payload#>>'{bundle,building,id}'=${building.id} and p.payload#>>'{bundle,document,id}'<>${old.id} and p.payload#>>'{bundle,document,archived}'='false' and f->>'archived'='false' and f->'destination'->>'floorId'=${old.id} limit 1`);
      if(incoming.rows.length)throw new WorldError("Stairs on another dated floor lead here. Disconnect those stairs before archiving this appearance; no drawing was removed.",409);
    }
    const revision=old.revision+1;value.bundle.document={...old,revision,archived:command.archived};return {updates:[{key:"floor",kind:"floor",payload:value as unknown as Record<string,unknown>}],result:{buildingId:building.id,floorId:old.id,revision}};
  }
  if(old.archived)throw new WorldError("Restore this floor appearance before connecting stairs.",409);
  const selected=old.design.features.find(feature=>feature.id===command.featureId&&!feature.archived&&feature.kind==="transition"&&feature.variant==="object");
  if(!selected||selected.variant!=="object"||old.design.layers.transitions.locked)throw new WorldError("Select saved stairs on an unlocked transition layer.",400);
  const sourceConditions=(await nativeConditions(tx,c)).values;if(!nativeObjectPresent(sourceConditions,old.id)||!nativeObjectPresent(sourceConditions,selected.id))throw new WorldError("Establish this floor and stair's presence before connecting it.",409);
  const read=await nativeRelatedContext(tx,c,{kind:"floor",id:command.destinationFloorId});
  const destination=await nativeContentContext(tx,c.userId,c.worldId,{...read.scope,edit:true,versionId:undefined},{ownerId:c.userId,archived:false,review:false,ordinary:false});
  if(!destination.canEdit)throw new WorldError("Explicitly retain an editable destination floor appearance before connecting its stairs.",409);
  const other=structuredClone((await nativeResource(tx,destination,"floor")).payload) as unknown as {bundle:FloorBundle},target=other.bundle.document!;
  if(target.id===old.id||target.buildingId!==building.id||target.archived)throw new WorldError("Choose another active dated floor in this same building.",400);assertNativeRevision(target.revision,command.destinationRevision);
  const targetConditions=(await nativeConditions(tx,destination)).values;if(!nativeObjectPresent(targetConditions,target.id))throw new WorldError("The dated arrival floor is absent, destroyed or unknown.",409);
  let point=command.point;
  const design={...old.design,features:old.design.features.map(feature=>feature.id===selected.id?{...selected,destination:{floorId:target.id,point}}:feature)};
  let destinationVersion=destination.version.id;
  if(command.reciprocal){
    if(target.design.layers.transitions.locked)throw new WorldError("Unlock the dated arrival floor's transitions before making a two-way connection.",400);
    const candidates=target.design.features.filter(feature=>feature.variant==="object"&&feature.kind==="transition"&&!feature.archived&&Math.hypot(feature.point.x-point.x,feature.point.y-point.y)<.2);
    if(candidates.length>1)throw new WorldError("Several arrival transitions overlap. Move them apart or choose another arrival; existing work remains retained.",409);
    const existing=candidates[0];
    if(existing&&!nativeObjectPresent(targetConditions,existing.id))throw new WorldError("The selected arrival stairs are absent, destroyed or unknown at this date.",409);
    if(existing?.variant==="object"&&(existing.symbol!==selected.symbol||existing.destination&&(existing.destination.floorId!==old.id||Math.hypot(existing.destination.point.x-selected.point.x,existing.destination.point.y-selected.point.y)>=.2)))throw new WorldError("Those arrival stairs are incompatible or connected elsewhere. Choose matching stairs at another position; the existing object is retained.",409);
    const arrivalId=existing?.id??randomUUID(),arrival=existing?.variant==="object"?{...existing,destination:{floorId:old.id,point:selected.point}}:{...selected,id:arrivalId,entityId:arrivalId,point,destination:{floorId:old.id,point:selected.point}};
    if(existing?.variant==="object"){point=existing.point;design.features=design.features.map(feature=>feature.id===selected.id?{...selected,destination:{floorId:target.id,point}}:feature);}
    const targetDesign={...target.design,features:existing?target.design.features.map(feature=>feature.id===existing.id?arrival:feature):[...target.design.features,arrival]};boundedRegionalLayer(()=>validateFloor(targetDesign,building.frame));
    other.bundle.document={...target,revision:target.revision+1,design:targetDesign};
    const manifest=structuredClone(destination.manifest);manifest.dependencies=[...manifest.dependencies.filter(value=>value.target.kind!=="floor"||value.target.id!==old.id),{target:c.scope.target,versionId:c.version.id}];
    destinationVersion=(await commitNativeUpdates(tx,destination,[{key:"floor",kind:"floor",payload:other as unknown as Record<string,unknown>}],manifest)).version.id;
  }
  boundedRegionalLayer(()=>validateFloor(design,building.frame));
  const arrivals=new Set<string>();for(const feature of design.features)if(!feature.archived&&feature.variant==="object"&&feature.destination){const key=feature.destination.floorId+":"+feature.destination.point.x+":"+feature.destination.point.y;if(arrivals.has(key))throw new WorldError("Choose separate stair arrivals or retain one connection.",400);arrivals.add(key);}
  const revision=old.revision+1;value.bundle.document={...old,revision,design};
  return {updates:[{key:"floor",kind:"floor",payload:value as unknown as Record<string,unknown>}],dependencies:[{target:destination.scope.target,versionId:destinationVersion}],result:{buildingId:building.id,floorId:old.id,revision}};
}
