import "server-only";
import {sql} from "drizzle-orm";
import type {WorldTransaction} from "./world-access-service";
import {WorldError} from "./world-errors";

/** Recreate the minimal pinned numerical ancestry through the original native
 * creation guards. A child is introduced when its exact parent pin is current;
 * parent heads then advance through independent contiguous snapshots. All
 * numerical objects remain immutable and all constraints remain enabled. */
export async function acceptCanonNumerical(tx:WorldTransaction,requestId:string){
  type Head={id:string;terrain_id?:string;parent_id?:string|null;parent_revision?:number;revision:number};
  const staged=(await tx.execute<{family:string;payload:Head}>(sql`select family,payload from world_canon_copy_row where request_id=${requestId} and family in ('world_terrain','world_terrain_refinement') and ready=1 order by record_key`)).rows;
  const roots=staged.filter(row=>row.family==='world_terrain').map(row=>row.payload),details=staged.filter(row=>row.family==='world_terrain_refinement').map(row=>row.payload),visited=new Set<string>();
  async function source(head:Head,root:boolean){
    if(visited.has(head.id))throw new WorldError("The inherited numerical source graph is inconsistent.",409);
    visited.add(head.id);
    const family=root?'world_terrain':'world_terrain_refinement',table=sql.identifier(family),version=sql.identifier(family+'_version'),tiles=sql.identifier(family+'_tile'),identity=root?'terrain_id':'refinement_id';
    const initial=root?sql`jsonb_set(jsonb_set(s.payload,'{revision}','1'::jsonb),'{sea_level}',(select v.payload->'sea_level' from world_canon_copy_row v where v.request_id=${requestId} and v.family='world_terrain_version' and v.payload->>'terrain_id'=${head.id} and v.payload->>'revision'='1'))`:sql`jsonb_set(s.payload,'{revision}','1'::jsonb)`;
    await tx.execute(sql`insert into ${table} select (jsonb_populate_record(null::${table},${initial})).* from world_canon_copy_row s where s.request_id=${requestId} and s.family=${family} and s.payload->>'id'=${head.id} and s.ready=1`);
    for(const [name,target]of [[family+'_version',version],[family+'_tile',tiles]] as const)await tx.execute(sql`insert into ${target} select (jsonb_populate_record(null::${target},payload)).* from world_canon_copy_row where request_id=${requestId} and family=${name} and payload->>${identity}=${head.id} and ready=1 order by (payload->>'revision')::int,record_key`);
    for(let revision=1;revision<=head.revision;revision++){
      for(const child of details.filter(child=>(child.parent_id??child.terrain_id)===head.id&&child.parent_revision===revision))await source(child,false);
      if(revision<head.revision){
        if(root)await tx.execute(sql`update world_terrain set revision=${revision+1},sea_level=(select sea_level from world_terrain_version where terrain_id=${head.id} and revision=${revision+1}) where id=${head.id}`);
        else await tx.execute(sql`update world_terrain_refinement set revision=${revision+1} where id=${head.id}`);
      }
    }
  }
  for(const head of roots)await source(head,true);
  if(visited.size!==staged.length)throw new WorldError("An inherited numerical parent is unavailable. Retry the original request.",409);
}
