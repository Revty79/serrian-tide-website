import "server-only";
import {assertNativeCraftObjectIdentities} from "./native-map-history-craft-identities";
import {randomUUID} from "node:crypto";
import {sql} from "drizzle-orm";
import {worldCraft as crafts,worldCraftDeck as decks,worldCraftOperation as operations,worldCraftVersion as versions,worldCraftDeckVersion as deckVersions} from "@/db/world-craft-schema";
import {craftCommandSchema,validateCraftSurface,CRAFT_LIMITS,type CraftBundle,type DeckDraft} from "./craft";
import {nativeResource,nativeRelatedContext,nativeContentContext,type NativeContentContext} from "./native-map-history-context";
import {createNativeMapAppearance,emptyNativeComposition,emptyNativeConnections} from "./native-map-history-create";
import {nativeContentHash,type NativeHistoryTx} from "./native-map-history-store";
import type {NativeWriteResult} from "./native-map-history-write";
import type {AssetComposition} from "./atlas-assets";
import {assertCraftBudget} from "./craft-budget";
import {boundedRegionalLayer} from "./terrain-regional-authoring-service";
import {WorldError} from "./world-service";

export const emptyNativeCraftBundle=(worldId:string,canEdit=false):CraftBundle=>({available:true,canEdit,worldId,crafts:[],next:null,craft:null,decks:[],deck:null,connections:[],placement:null,history:[],markers:[]});
export async function nativeCraftIdentities(tx:NativeHistoryTx,c:NativeContentContext,craftId?:string){
  if(craftId){
    const rows=(await tx.execute<CraftBundle["decks"][number]&{historicalCoverage:"established"|"unknown"}>(sql`select d.id,d.world_id "worldId",d.craft_id "craftId",coalesce(m.name,d.name) name,coalesce(m.deck_order,d.deck_order) "order",case when m.name is null then d.height else m.height end height,d.frame,coalesce(m.revision,d.revision) revision,coalesce(m.archived,false) archived,case when m.name is null then 'unknown' else 'established' end "historicalCoverage" from world_craft_deck d left join lateral (
      select r.payload#>>'{deck,name}' name,(r.payload#>>'{deck,order}')::int deck_order,(r.payload#>>'{deck,height}')::float8 height,(r.payload#>>'{deck,revision}')::int revision,(r.payload#>>'{deck,archived}')::boolean archived
      from world_map_state_head h join world_map_state_version v on v.id=h.version_id and v.world_id=h.world_id join world_map_state_component_ref p on p.version_id=v.id and p.world_id=h.world_id and p.key='deck' join world_map_state_component r on r.id=p.component_id and r.world_id=h.world_id
      where h.world_id=d.world_id and h.timeline_id=${c.scope.timelineId} and v.payload->'nativeAtlas'->'target'->>'kind'='deck' and v.payload->'nativeAtlas'->'target'->>'id'=d.id and not v.archived and v.start_year<=${c.scope.year} and v.end_year>=${c.scope.year}
    ) m on true where d.world_id=${c.worldId} and d.craft_id=${craftId} order by d.deck_order,d.id limit 65`)).rows;
    if(rows.length>CRAFT_LIMITS.decks)throw new WorldError("This craft exceeds its retained 64-deck identity bound.",413);return {crafts:[],decks:rows};
  }
  const rows=(await tx.execute<CraftBundle["crafts"][number]&{historicalCoverage:"established"|"unknown"}>(sql`select c.id,coalesce(m.name,c.name) name,coalesce(m.classification,c.classification) classification,coalesce(m.revision,c.revision) revision,coalesce(m.archived,false) archived,false placed,case when m.name is null then 'unknown' else 'established' end "historicalCoverage" from world_craft c left join lateral (
    select r.payload#>>'{bundle,craft,name}' name,r.payload#>>'{bundle,craft,classification}' classification,(r.payload#>>'{bundle,craft,revision}')::int revision,(r.payload#>>'{bundle,craft,archived}')::boolean archived from world_map_state_head h join world_map_state_version v on v.id=h.version_id and v.world_id=h.world_id join world_map_state_component_ref p on p.version_id=v.id and p.world_id=h.world_id and p.key='craft' join world_map_state_component r on r.id=p.component_id and r.world_id=h.world_id where h.world_id=c.world_id and h.timeline_id=${c.scope.timelineId} and v.payload->'nativeAtlas'->'target'->>'kind'='craft' and v.payload->'nativeAtlas'->'target'->>'id'=c.id and not v.archived and v.start_year<=${c.scope.year} and v.end_year>=${c.scope.year}
  ) m on true where c.world_id=${c.worldId} order by coalesce(m.name,c.name),c.id limit 513`)).rows;
  if(rows.length>CRAFT_LIMITS.crafts)throw new WorldError("This World exceeds its retained 512-craft identity bound.",413);return {crafts:rows,decks:[]};
}
export async function createNativeDeck(tx:NativeHistoryTx,c:NativeContentContext,input:{id:string;craftId:string;draft:DeckDraft;requestId:string;images?:AssetComposition;copySource?:NativeContentContext}){
  const count=(await tx.execute<{n:number}>(sql`select count(*)::int n from world_craft_deck where world_id=${c.worldId} and craft_id=${input.craftId}`)).rows[0].n;if(count>=CRAFT_LIMITS.decks)throw new WorldError("This craft supports 64 retained decks.",413);
  boundedRegionalLayer(()=>validateCraftSurface(input.draft.surface,input.draft.frame));await assertNativeCraftObjectIdentities(tx,c.worldId,input.craftId,input.draft.surface);
  const parentKey=c.scope.target.kind==="deck"?"craft-context":"craft",parent=structuredClone((await nativeResource(tx,c,parentKey)).payload) as unknown as {bundle:CraftBundle};
  if(parent.bundle.craft?.id!==input.craftId||parent.bundle.craft.archived)throw new WorldError("Choose this dated craft's active exterior identity.",409);
  const [row]=await tx.insert(decks).values({id:input.id,worldId:c.worldId,craftId:input.craftId,draft:input.draft,name:input.draft.name,order:input.draft.order,height:input.draft.height,frame:input.draft.frame,revision:1,nativeOriginVersionId:c.version.id}).returning();
  await tx.insert(deckVersions).values({deckId:row.id,craftId:row.craftId,worldId:c.worldId,revision:1,draft:row.draft,archived:false,requestId:input.requestId});
  parent.bundle.deck=null;parent.bundle.connections=[];parent.bundle.decks=[];
  return createNativeMapAppearance(tx,c,{kind:"deck",id:row.id},row.name,[{key:"craft-context",kind:"craft",payload:parent as unknown as Record<string,unknown>},{key:"deck",kind:"deck",payload:{deck:{...row.draft,id:row.id,worldId:c.worldId,craftId:row.craftId,revision:1,archived:false},history:[]}},{key:"connections",kind:"connections",payload:emptyNativeConnections()},{key:"composition",kind:"composition",payload:emptyNativeComposition()},{key:"conditions",kind:"conditions",payload:{revision:0,values:[]}}],input.images,input.copySource?[{target:input.copySource.scope.target,versionId:input.copySource.version.id}]:[]);
}
export async function createNativeCraft(tx:NativeHistoryTx,c:NativeContentContext,raw:unknown,copySources?:Map<string,NativeContentContext>):Promise<NativeWriteResult>{
  const command=craftCommandSchema.parse(raw);if(command.action!=="create"&&command.action!=="create-deck")throw new WorldError("Choose a new dated craft or independent deck.",400);
  if(command.action==="create"){
    const count=(await tx.execute<{n:number}>(sql`select count(*)::int n from world_craft where world_id=${c.worldId}`)).rows[0].n;if(count>=CRAFT_LIMITS.crafts)throw new WorldError("This World supports 512 retained craft identities.",413);
    boundedRegionalLayer(()=>validateCraftSurface(command.draft.surface,command.draft.frame));
    const result={craftId:command.craftId,surface:"exterior",revision:1};
    await tx.insert(operations).values({requestId:command.requestId,worldId:c.worldId,authorId:c.userId,inputHash:nativeContentHash({scope:c.scope,command}),result});
    const [row]=await tx.insert(crafts).values({id:command.craftId,worldId:c.worldId,draft:command.draft,name:command.draft.name,classification:command.draft.classification,frame:command.draft.frame,revision:1,nativeOriginVersionId:c.version.id}).returning();
    await tx.insert(versions).values({craftId:row.id,worldId:c.worldId,revision:1,draft:row.draft,archived:false,requestId:command.requestId});
    const bundle={...emptyNativeCraftBundle(c.worldId,true),craft:{...row.draft,id:row.id,worldId:c.worldId,revision:1,archived:false}};
    const childHistorical=await createNativeMapAppearance(tx,c,{kind:"craft",id:row.id},row.name,[{key:"craft",kind:"craft",payload:{bundle}},{key:"connections",kind:"connections",payload:emptyNativeConnections()},{key:"composition",kind:"composition",payload:emptyNativeComposition()},{key:"conditions",kind:"conditions",payload:{revision:0,values:[]}}],command.templateImages,[...copySources?.values()??[]].map(source=>({target:source.scope.target,versionId:source.version.id})));
    const suggested=command.templateDecks??[];
    if(new Set(suggested.map(deck=>deck.id)).size!==suggested.length||suggested.some(deck=>deck.id===row.id))throw new WorldError("Each template deck needs its own identity.",400);
    const parent=await nativeContentContext(tx,c.userId,c.worldId,{timelineId:c.scope.timelineId,year:c.scope.year,stateId:childHistorical.stateId,target:{kind:"craft",id:row.id},edit:true},{ownerId:c.userId,archived:false,review:false,ordinary:false});
    for(const deck of suggested)await createNativeDeck(tx,parent,{id:deck.id,craftId:row.id,draft:deck.draft,requestId:command.requestId,images:deck.images,copySource:copySources?.get(deck.id)});
    await assertCraftBudget(tx,c.worldId);return {updates:[],unchangedParent:true,result:{...result,childHistorical}};
  }
  if(c.scope.target.kind!=="craft"&&c.scope.target.kind!=="deck")throw new WorldError("Open this dated craft or deck before adding another surface.",409);
  let source:NativeContentContext|undefined,images=command.templateImages;
  if(command.copyFrom){const target=command.copyFrom==="exterior"?{kind:"craft" as const,id:command.craftId}:{kind:"deck" as const,id:command.copyFrom};source=await nativeRelatedContext(tx,c,target);const payload=(await nativeResource(tx,source,target.kind==="deck"?"deck":"craft")).payload as unknown as {bundle?:CraftBundle;deck?:NonNullable<CraftBundle["deck"]>},record=payload.deck??payload.bundle?.craft;if(!record||record.archived||record.revision!==command.copyRevision||"craftId"in record&&record.craftId!==command.craftId)throw new WorldError("Choose the exact active copy source in this same craft.",409);
    if(command.copyObjects&&!images){const original=(await nativeResource(tx,source,"composition")).payload as unknown as {layer:AssetComposition};images={version:1,placements:original.layer.placements.map(placement=>({...placement,id:randomUUID()}))};}
  }else if(command.copyRevision!==null||command.copyObjects)throw new WorldError("Choose the exact copy source before copying its objects or images.",400);
  const result={craftId:command.craftId,surface:command.deckId,revision:1};await tx.insert(operations).values({requestId:command.requestId,worldId:c.worldId,authorId:c.userId,inputHash:nativeContentHash({scope:c.scope,command}),result});
  const childHistorical=await createNativeDeck(tx,c,{id:command.deckId,craftId:command.craftId,draft:command.draft,requestId:command.requestId,images,copySource:source});
  await assertCraftBudget(tx,c.worldId);return {updates:[],unchangedParent:true,result:{...result,childHistorical}};
}
