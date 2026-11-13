import "server-only";
import {sql} from "drizzle-orm";
import type {WorldTransaction} from "./world-access-service";
import {WorldError} from "./world-errors";

/** Replay retained numerical snapshots with all creation and history guards
 * enabled, including growth after an ancestor advances to a later revision. */
export async function acceptCanonNumerical(tx:WorldTransaction,requestId:string){
 type Head=Record<string,unknown>&{id:string;terrain_id?:string;parent_id?:string|null;parent_revision?:number;revision:number};
 type Entry={family:string;record_key:string;payload:Head};
 const heads=(await tx.execute<Entry>(sql`select family,record_key,payload from world_canon_copy_row where request_id=${requestId} and family in ('world_terrain','world_terrain_refinement') and ready=1 order by record_key`)).rows;
 const retained=(await tx.execute<{family:string;payload:Record<string,unknown>}>(sql`select family,payload from world_canon_copy_row where request_id=${requestId} and family in ('world_terrain_version','world_terrain_refinement_version','world_terrain_refinement_geometry') and ready=1`)).rows;
 const versions=new Map<string,Record<string,unknown>>(),geometries=new Map<string,Record<string,unknown>>(),geometrySources=new Set<string>();
 for(const row of retained){
  if(row.family==="world_terrain_refinement_geometry"){const id=String(row.payload.refinement_id);geometries.set(`${id}:${row.payload.from_revision}`,row.payload);geometrySources.add(id);}
  else versions.set(`${row.family}:${row.payload.terrain_id}:${row.payload.refinement_id??""}:${row.payload.revision}`,row.payload);
 }
 const current=new Map<string,number>();
 if(new Set(heads.map(h=>h.payload.id)).size!==heads.length)throw new WorldError("The inherited numerical identities are inconsistent.",409);
 const isRoot=(entry:Entry)=>entry.family==="world_terrain";
 const parentId=(entry:Entry)=>entry.payload.parent_id??entry.payload.terrain_id;
 function version(entry:Entry,revision:number){
  const key=isRoot(entry)?`world_terrain_version:${entry.payload.id}::${revision}`:`world_terrain_refinement_version:${entry.payload.terrain_id}:${entry.payload.id}:${revision}`;
  const value=versions.get(key);if(!value)throw new WorldError("An inherited numerical revision is unavailable.",409);return value;
 }
 function geometry(entry:Entry,revision:number){
  const value=geometries.get(`${entry.payload.id}:${revision}`);
  if(!value&&geometrySources.has(entry.payload.id))throw new WorldError("An inherited numerical geometry is unavailable.",409);
  return value;
 }
 async function insertRows(entry:Entry,family:string,identity:string,revision?:number){
  const table=sql.identifier(family),prefix=entry.record_key+":"+(revision===undefined?"":revision+":");
  const keyed=revision!==undefined&&family.endsWith("_version")?sql`record_key=${entry.record_key+":"+revision}`:sql`record_key>=${prefix} AND record_key<${prefix+"~"}`;
  const chosen=revision===undefined?sql``:sql`AND (payload->>'revision')::int=${revision}`;
  await tx.execute(sql`insert into ${table} select (jsonb_populate_record(null::${table},payload)).* from world_canon_copy_row
    where request_id=${requestId} and family=${family} and ready=1 and ${keyed}
      and payload->>${identity}=${entry.payload.id} ${chosen} order by (payload->>'revision')::int,record_key`);
 }
 function geometryFields(value:Record<string,unknown>){return {parent_revision:value.parent_revision,x_metres:value.x_metres,y_metres:value.y_metres,width_metres:value.width_metres,height_metres:value.height_metres,grid_width:value.grid_width,grid_height:value.grid_height};}
 let completed=0,total=0;for(const head of heads)total+=head.payload.revision;
 while(completed<total){
  let advanced=false;
  for(const entry of heads){
   const head=entry.payload,previous=current.get(head.id)??0,next=previous+1;
   if(next>head.revision)continue;
   const root=isRoot(entry),snapshot=version(entry,next),frame=root?undefined:geometry(entry,next);
   if(!root&&(current.get(String(parentId(entry)))??0)!==Number(snapshot.parent_revision))continue;
   if(previous&&heads.some(child=>!isRoot(child)&&parentId(child)===head.id&&(current.get(child.payload.id)??0)<child.payload.revision&&Number(version(child,(current.get(child.payload.id)??0)+1).parent_revision)===previous))continue;
   const table=sql.identifier(entry.family);
   await tx.execute(sql`SELECT set_config('serrian.refinement_guard',${head.id},true)`);
   if(!previous){
    const initial={...head,revision:1,...(root?{sea_level:snapshot.sea_level}:frame?geometryFields(frame):{})};
    await tx.execute(sql`insert into ${table} select (jsonb_populate_record(null::${table},${JSON.stringify(initial)}::jsonb)).*`);
    if(root){
     // Root geometry is immutable; make captured root pins available to finer
     // source FK references before advancing its mutable head.
     await insertRows(entry,"world_terrain_version","terrain_id");
     await insertRows(entry,"world_terrain_tile","terrain_id");
    }
   }
   if(!root){
    if(frame&&previous){
     await tx.execute(sql`SELECT set_config('serrian.refinement_expand',${head.id},true)`);
     await tx.execute(sql`insert into world_terrain_refinement_geometry select (jsonb_populate_record(null::world_terrain_refinement_geometry,${JSON.stringify(frame)}::jsonb)).*`);
    }
    if(previous){
     if(frame){const g=geometryFields(frame);await tx.execute(sql`update world_terrain_refinement set revision=${next},parent_revision=${Number(g.parent_revision)},x_metres=${Number(g.x_metres)},y_metres=${Number(g.y_metres)},width_metres=${Number(g.width_metres)},height_metres=${Number(g.height_metres)},grid_width=${Number(g.grid_width)},grid_height=${Number(g.grid_height)} where id=${head.id}`);}
     else await tx.execute(sql`update world_terrain_refinement set revision=${next} where id=${head.id}`);
    }
    await insertRows(entry,"world_terrain_refinement_version","refinement_id",next);
    await insertRows(entry,"world_terrain_refinement_tile","refinement_id",next);
    if(frame&&!previous){
     await tx.execute(sql`SELECT set_config('serrian.refinement_expand',${head.id},true)`);
     await tx.execute(sql`insert into world_terrain_refinement_geometry select (jsonb_populate_record(null::world_terrain_refinement_geometry,${JSON.stringify(frame)}::jsonb)).*`);
    }
   }else if(previous)await tx.execute(sql`update world_terrain set revision=${next},sea_level=${Number(snapshot.sea_level)} where id=${head.id}`);
   current.set(head.id,next);completed++;advanced=true;
  }
  if(!advanced)throw new WorldError("The inherited numerical parent graph cannot retain its exact revision pins. Nothing was accepted.",409);
 }
}
