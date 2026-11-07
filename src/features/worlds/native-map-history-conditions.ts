import { worldProtectedContent,worldScopeAllowed } from "./world-access-service";
import { redactUnderground } from "./underground";
import "server-only";
import { nativeConditionsSchema, nativeConditionCommandSchema, nativeAbsentObjects, type NativeCondition } from "./native-map-history";
import { nativeResource, type NativeContentContext } from "./native-map-history-context";
import type { NativeHistoryTx } from "./native-map-history-store";
import type { NativeWriteResult } from "./native-map-history-write";
import { assertNativeRevision } from "./native-map-history-resources";
import { WorldError } from "./world-service";
import type { TownBundle } from "./world-towns";
import type { TownMapBundle } from "./town-map";
import type { FloorBundle } from "./building-floor";
import type { UndergroundBundle } from "./underground";
import type { CraftBundle } from "./craft";

export async function nativeConditions(tx:NativeHistoryTx,c:NativeContentContext){
  const row=await nativeResource(tx,c,"conditions");
  return {revision:row.revision,values:nativeConditionsSchema.parse(row.payload.values)};
}
/** Choices come exclusively from this retained source, never today's geometry. */
export async function nativeConditionChoices(tx:NativeHistoryTx,c:NativeContentContext){
  const values=new Map<string,{id:string;name:string;kind:string}>();
  const add=(id:string,name:string,kind:string)=>values.set(id,{id,name,kind});
  add(c.scope.target.id,c.selected.name,"Whole map");
  if(c.scope.target.kind==="terrain"){
    const places=(await nativeResource(tx,c,"places")).payload as unknown as TownBundle;
    for(const t of worldScopeAllowed(c.worldId,"settlements")?places.towns:[])add(t.id,t.name,"Settlement");
    const craft=(await nativeResource(tx,c,"craft-positions")).payload as unknown as CraftBundle;
    for(const t of worldScopeAllowed(c.worldId,"craft")?craft.markers:[])add(t.id,t.name,"Craft position");
  }else if(c.scope.target.kind==="town"){
    const b=(await nativeResource(tx,c,"town")).payload as unknown as {bundle:TownMapBundle};
    for(const f of b.bundle.document!.design.features)add(f.id,f.name||f.kind,f.kind);
  }else if(c.scope.target.kind==="floor"){
    const b=(await nativeResource(tx,c,"floor")).payload as unknown as {bundle:FloorBundle};
    for(const f of b.bundle.document!.design.features)add(f.id,f.name||f.kind,f.kind);
  }else if(c.scope.target.kind==="underground"){
    const b=(await nativeResource(tx,c,"underground")).payload as unknown as {bundle:UndergroundBundle};
    for(const f of (worldProtectedContent(c.worldId)?b.bundle.document!.design:redactUnderground(b.bundle.document!.design)).features)add(f.id,f.name||f.kind,f.kind);
  }else{
    const deck=c.scope.target.kind==="deck",b=(await nativeResource(tx,c,deck?"deck":"craft")).payload as unknown as {deck:CraftBundle["deck"];bundle:CraftBundle};
    const d=deck?b.deck:b.bundle.craft;
    for(const f of d!.surface.plan.features)add(f.id,f.name||f.kind,f.kind);
  }
  return [...values.values()];
}
export async function readNativeConditions(tx:NativeHistoryTx,c:NativeContentContext){const choices=await nativeConditionChoices(tx,c),saved=await nativeConditions(tx,c),known=new Set(choices.map(choice=>choice.id));return {...saved,values:saved.values.filter(value=>known.has(value.id)),choices,canEdit:c.canEdit};}
export async function saveNativeConditions(tx:NativeHistoryTx,c:NativeContentContext,raw:unknown):Promise<NativeWriteResult>{
  const command=nativeConditionCommandSchema.parse(raw),old=await nativeConditions(tx,c);
  assertNativeRevision(old.revision,command.revision);
  const known=new Set((await nativeConditionChoices(tx,c)).map(v=>v.id));
  if(!worldProtectedContent(c.worldId)&&!known.has(command.value.id))throw new WorldError("This retained object is unavailable within your current World permission.",404);
  if(!known.has(command.value.id)&&!old.values.some(v=>v.id===command.value.id))throw new WorldError("Choose an object retained by this historical source.",400);
  return {updates:[{key:"conditions",kind:"conditions",payload:{revision:old.revision+1,values:[...old.values.filter(v=>v.id!==command.value.id),command.value]}}],result:{revision:old.revision+1}};
}
export function presentNativePlaces<T extends {townId:string}>(items:T[],conditions:NativeCondition[]){const absent=nativeAbsentObjects(conditions);return items.filter(v=>!absent.has(v.townId));}
