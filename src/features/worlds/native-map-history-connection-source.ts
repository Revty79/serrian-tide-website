import "server-only";
import {and,eq,inArray} from "drizzle-orm";
import {worldMapStateComponent} from "@/db/world-native-map-state-schema";
import {nativeTargetKey} from "./native-map-history";
import {nativeConnectionAccountSchema,type NativeConnectionAccount} from "./native-map-history-connection-account";
import {loadNativeVersion,nativeManifestOf,nativeVersionReachable,type NativeHistoryTx} from "./native-map-history-store";
import {nativeContentContext,type NativeContentContext} from "./native-map-history-context";
import {WorldError} from "./world-service";
import type {UndergroundMap} from "./underground";

const target=(map:UndergroundMap)=>map.kind==="world"?{kind:"terrain" as const,id:map.atlasMapId}:map.kind==="town"?{kind:"town" as const,id:map.townMapId}:map.kind==="interior"?{kind:"floor" as const,id:map.floorId}:{kind:"underground" as const,id:map.levelId};
export type NativeAccountSource={componentId:string;account:NativeConnectionAccount;sourceVersionId:string};
export async function nativeConnectionAccounts(tx:NativeHistoryTx,c:NativeContentContext){
  const result=new Map<string,NativeAccountSource>();
  const collect=async(version:typeof c.version,external:boolean)=>{
    const refs=nativeManifestOf(version).resources.filter(r=>external?r.key==="connection:"+c.scope.connectionSourceId:r.key.startsWith("connection:"));
    if(refs.length>128)throw new WorldError("This map exceeds the 128 retained entrance-account limit.",409);
    for(let offset=0;offset<refs.length;offset+=64){
      const batch=refs.slice(offset,offset+64),rows=await tx.select().from(worldMapStateComponent).where(and(eq(worldMapStateComponent.worldId,c.worldId),eq(worldMapStateComponent.kind,"connections"),inArray(worldMapStateComponent.id,batch.map(r=>r.componentId))));
      if(rows.length!==new Set(batch.map(r=>r.componentId)).size)throw new WorldError("A retained historical entrance account is unavailable.",409);
      for(const ref of batch){const row=rows.find(r=>r.id===ref.componentId)!,account=nativeConnectionAccountSchema.parse(row.payload);
        if(ref.key!=="connection:"+account.connection.id)throw new WorldError("The historical connection source identifies another entrance.",409);
        const ends=[account.connection.source,account.connection.destination];
        if(!ends.some(e=>nativeTargetKey(target(e.map))===nativeTargetKey(c.scope.target))){if(external)continue;throw new WorldError("This connection account belongs to a different map.",409);}
        const prior=result.get(account.connection.id);
        if(prior&&!external&&prior.componentId!==row.id)throw new WorldError("The retained map and explicit connection source disagree. Select one compatible source before travelling.",409);
        result.set(account.connection.id,{componentId:row.id,account,sourceVersionId:version.id});
      }
    }
  };
  await collect(c.version,false);
  if(c.scope.connectionSourceVersionId){
    const version=await loadNativeVersion(tx,c.worldId,c.scope.connectionSourceVersionId),manifest=nativeManifestOf(version);
    if(!version.stateId||!await nativeVersionReachable(tx,c.worldId,c.scope.timelineId,manifest.target,version.id))throw new WorldError("Explicitly retain this connection's source in the selected timeline before following it.",409);
    await collect(version,true);
    if(![...result.values()].some(v=>v.sourceVersionId===version.id))throw new WorldError("This explicit historical connection source establishes no entrance on this map.",409);
  }
  return result;
}
export async function nativePinnedEntranceContext(tx:NativeHistoryTx,c:NativeContentContext,versionId:string,map:UndergroundMap,geographyVersionId?:string){
  const t=target(map),version=await loadNativeVersion(tx,c.worldId,versionId,t);
  if(!version.stateId||!await nativeVersionReachable(tx,c.worldId,c.scope.timelineId,t,version.id))throw new WorldError("The recorded entrance geometry has not been retained in this timeline.",409);
  return nativeContentContext(tx,c.userId,c.worldId,{...c.scope,target:t,stateId:version.stateId,versionId:version.id,edit:false,geographyStateId:undefined,geographyVersionId},{ownerId:"",archived:false,review:true,ordinary:false});
}
