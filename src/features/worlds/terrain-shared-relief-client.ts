"use client";
import {worldFetch} from "./world-editor-credentials";
import {decodeSharedReliefPreview} from "./terrain-shared-relief-packet";
import type {SharedReliefCommand} from "./terrain-shared-relief-spec";
export const sharedReliefApi=(worldId:string,mapId:string)=>`/api/worlds/${worldId}/terrain/shared-relief?terrainMap=${encodeURIComponent(mapId)}`;
export type SharedReliefHistory={available:boolean;current:null|{groupId:string;action:"apply"|"undo"|"redo";revision:number;canUndo:boolean;canRedo:boolean;effects:{id:string;changed:number;maxLoweringM:number;maxRaisingM:number}[]};unavailableReason?:string};
export async function requestSharedReliefPreview(api:string,command:Extract<SharedReliefCommand,{action:"preview"}>,signal:AbortSignal){
 const response=await worldFetch(api,{method:"POST",credentials:"same-origin",cache:"no-store",signal,headers:{"Content-Type":"application/json"},body:JSON.stringify(command)},{readOnlyPreview:true});
 if(!response.ok){const data=await response.json().catch(()=>({error:"The native relief preview could not be read."}));throw Error(data.error??"The native relief preview could not be prepared.");}
 if(response.headers.get("Content-Type")!=="application/vnd.serrian.atlas-relief-preview")throw Error("The native relief preview has an unexpected format.");
 const preview=await decodeSharedReliefPreview(await response.arrayBuffer());if(preview.header.mapId!==command.mapId)throw Error("The native relief preview belongs to another map.");return preview;
}
