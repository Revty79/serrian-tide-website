import "server-only";
import {worldRequestAuthority,withWorldRequestAuthority} from "./world-authorization-context";
import type {WorldTransaction} from "./world-access-service";
import {loadNativeVersion,nativeManifestOf} from "./native-map-history-store";
import {nativeContentContext} from "./native-map-history-context";
import {nativeConnectionReadable,nativeConnectionView} from "./native-map-history-connections";
import {nativeConditionChoices} from "./native-map-history-conditions";
import type {UndergroundConnection} from "./underground";
import type {WorldPermission} from "./world-permissions";
import {WorldError} from "./world-errors";

/** Narrow the same authenticated actor's read projection; never impersonate an
 * owner or grant a scope. Only immutable ordinary source reads occur here. */
export async function ordinaryCanonHistoricalComponent(tx:WorldTransaction,worldId:string,userId:string,permission:WorldPermission,input:Record<string,unknown>){
  if(!input.__version_id)return input;
  const authority=worldRequestAuthority(),cached=authority?.reads.get(worldId);
  if(!authority||!cached?.row)throw new WorldError("Reload the published canon source before copying its historical relationships.",409);
  const reads=new Map(authority.reads);reads.set(worldId,{...cached,permission:{...permission,scopes:permission.scopes.filter(scope=>scope!=="campaigns"),protectedContent:false,canEdit:false}});
  return withWorldRequestAuthority({...authority,proof:null,review:false,reads},async()=>{
    const value=structuredClone(input),payload=value.payload as Record<string,unknown>,version=await loadNativeVersion(tx,worldId,String(input.__version_id));
    if(!version.stateId){if(payload.connection)return null;if(value.kind==="conditions")payload.values=[];else{const bundle=(payload.bundle??payload) as Record<string,unknown>;bundle.connections=[];}return value;}
    const context=await nativeContentContext(tx,userId,worldId,{timelineId:version.timelineId,target:nativeManifestOf(version).target,stateId:version.stateId,versionId:version.id,year:version.startYear!,edit:false},{ownerId:"",archived:false,review:true,ordinary:false});
    if(payload.connection){
      if(typeof (payload.connection as {source?:unknown}).source==="object"){
        const account=payload as unknown as {connection:UndergroundConnection;draft:Record<string,unknown>;source:{sourceVersionId:string;destinationVersionId:string}};
        const connection={...account.connection,historicalAccount:{...account.draft,...account.source}} as UndergroundConnection;
        // A strict retained account owns explicit geometry pins for both ends.
        // Reauthorize those exact sources as normal retained navigation does;
        // unrelated manifest dependencies cannot replace its accepted pins.
        if(!(await nativeConnectionView(tx,context,connection)).available)return null;
      }
      return value;
    }
    if(value.kind==="conditions"){
      const known=new Set((await nativeConditionChoices(tx,context)).map(choice=>choice.id));payload.values=(payload.values as {id:string}[]).filter(condition=>known.has(condition.id));
    }else{
      const bundle=(payload.bundle??payload) as {connections?:UndergroundConnection[]},visible:UndergroundConnection[]=[];
      for(const connection of bundle.connections??[])if(await nativeConnectionReadable(tx,context,connection))visible.push(connection);
      bundle.connections=visible;
    }
    return value;
  });
}
