import type { WorldCollaborationView, WorldEditorStatus } from "./world-collaboration";
import type { WorldEditorProof, WorldPermission } from "./world-permissions";

export type WorldEditorClient = {
  worldId: string; actorId: string; proof: WorldEditorProof; permission: WorldPermission;
  editor: WorldEditorStatus; available: boolean; error: string; version: number; generation: number; roots: number;
  autoClaimAttempted: boolean; bootstrapping: boolean; bootstrapChecks: number; readyFence: number | null; verifiedFence:number|null; loadingLatest: boolean;
  listeners: Set<()=>void>; permissionListeners: Set<()=>void>;
};
const clients=new Map<string,WorldEditorClient>(),active=new Map<string,WorldEditorClient>();
let draftActor:string|undefined;
const ownedWorlds=new Map<string,Set<string>>();
const ownedResources=new Map<string,Set<string>>();
export function currentWorldDraftActor(){return draftActor;}
export function initializeWorldDraftActor(actorId:string,worldIds:readonly string[]=[]){if(typeof window==="undefined")return;draftActor=actorId;let worlds=ownedWorlds.get(actorId);if(!worlds){worlds=new Set();ownedWorlds.set(actorId,worlds);}for(const id of worldIds)worlds.add(id);}
export function ownsWorldDraft(worldId:string,actorId=draftActor){return !!actorId&&!!ownedWorlds.get(actorId)?.has(worldId);}
export function ownsLegacyWorldDraftKey(key:string,actorId=draftActor){return !!actorId&&[...ownedWorlds.get(actorId)??[],...ownedResources.get(actorId)??[]].some(id=>key.includes(id));}
export function worldRequestActor(url:string){
 const target=new URL(url,typeof window==="undefined"?"https://atlas.invalid":window.location.href);
 if(typeof window!=="undefined"&&target.origin!==window.location.origin)return undefined;
 const id=target.pathname.match(/^\/api\/worlds\/([^/]+)(?:\/|$)/)?.[1];
 return id?active.get(id)?.actorId??draftActor:/^\/api\/(?:worlds|admin\/worlds)(?:\/|$)/.test(target.pathname)?draftActor:undefined;
}
export function acceptWorldResponse(url:string,actor:string|undefined,data:unknown,requestFence?:number){
 if(!actor||worldRequestActor(url)!==actor)throw Error("Your signed-in account changed. This response cannot replace the original account's retained draft.");
 const worldId=new URL(url,"https://atlas.invalid").pathname.match(/^\/api\/worlds\/([^/]+)(?:\/|$)/)?.[1];if(!worldId)return;
 const client=active.get(worldId),incoming=data&&typeof data==="object"&&"permission"in data?data.permission as WorldPermission|undefined:undefined;
 if(client&&incoming?.actorId===actor&&(incoming.canonRevision??0)>=(client.permission.canonRevision??0)&&(incoming.grantRevision===null||client.permission.grantRevision===null||incoming.grantRevision>=client.permission.grantRevision)){
  const sameFence=requestFence!==undefined&&requestFence===client.proof.fence,editable=!incoming.canon&&(incoming.role==="owner"||incoming.role==="editor"),changed=incoming.grantRevision!==client.permission.grantRevision;
  if(sameFence)client.verifiedFence=incoming.canEdit&&editable?requestFence:null;
  if(!editable||changed||sameFence&&!incoming.canEdit){client.readyFence=null;client.verifiedFence=null;client.editor={...client.editor,yours:false,available:false,holder:null,expiresAt:null,fence:null};}
  notifyWorldEditor(client,{...incoming,canEdit:editable&&!changed&&(sameFence?incoming.canEdit&&client.editor.yours&&client.readyFence===client.editor.fence:client.permission.canEdit)});
 }
 if(!ownsWorldDraft(worldId,actor))return;
 let resources=ownedResources.get(actor);if(!resources){resources=new Set();ownedResources.set(actor,resources);}
 const registry=resources;
 function visit(value:unknown){if(!value||typeof value!=="object")return;if(Array.isArray(value)){for(const child of value)visit(child);return;}const row=value as Record<string,unknown>;if(row.worldId===worldId&&typeof row.id==="string")registry.add(row.id);for(const [key,child]of Object.entries(row)){if(["mapId","terrainId","townMapId","buildingId","craftId","siteId","floorId","levelId"].includes(key)&&typeof child==="string")registry.add(child);else if(child&&typeof child==="object")visit(child);}}
 visit(data);
}
function secret(){const bytes=crypto.getRandomValues(new Uint8Array(32));return Array.from(bytes,n=>n.toString(16).padStart(2,"0")).join("");}
export function initializeWorldEditor(worldId:string,permission:WorldPermission):WorldEditorClient{
  const browser=typeof window!=="undefined",key=worldId+":"+permission.actorId;let client=browser?clients.get(key):undefined;
  if(!client){client={worldId,actorId:permission.actorId,proof:{clientId:browser?crypto.randomUUID():"00000000-0000-4000-8000-000000000000",token:browser?secret():"0".repeat(64)},permission:{...permission,canEdit:false},editor:{holder:null,expiresAt:null,fence:null,yours:false,available:false,requestPending:false},available:false,error:"",version:0,generation:0,roots:0,autoClaimAttempted:false,bootstrapping:permission.role==="owner",bootstrapChecks:0,readyFence:null,verifiedFence:null,loadingLatest:false,listeners:new Set(),permissionListeners:new Set()};if(browser)clients.set(key,client);}
  if(!browser)return client;
  draftActor=permission.actorId;
  if(permission.role==="owner"){let worlds=ownedWorlds.get(permission.actorId);if(!worlds){worlds=new Set();ownedWorlds.set(permission.actorId,worlds);}worlds.add(worldId);}
  active.set(worldId,client);return client;
}
export function worldEditorClient(worldId:string){return active.get(worldId);}
export function notifyWorldEditor(client:WorldEditorClient,permission?:WorldPermission){
  if(permission&&JSON.stringify(permission)!==JSON.stringify(client.permission)){client.permission=permission;for(const notify of client.permissionListeners)notify();}
  client.version++;for(const notify of client.listeners)notify();
}
export function applyWorldEditorStatus(client:WorldEditorClient,data:WorldCollaborationView){
  if(data.worldId!==client.worldId||data.permission.actorId!==client.actorId){client.error="Your signed-in account changed. This draft stays with its original account; synchronization is blocked.";notifyWorldEditor(client,{...client.permission,canEdit:false});return;}
  client.available=data.available;client.editor=data.editor;client.error="";
  if(data.editor.yours&&data.editor.fence!==null)client.proof={...client.proof,fence:data.editor.fence};
  else{client.proof={clientId:client.proof.clientId,token:client.proof.token};client.readyFence=null;}
  const ready=data.editor.yours&&client.readyFence===data.editor.fence;
  notifyWorldEditor(client,{...data.permission,canEdit:data.permission.canEdit&&ready});
}
export function markWorldEditorClaimAttempt(client:WorldEditorClient){client.autoClaimAttempted=true;}
/** Settle initial presentation without granting editing authority or changing drafts. */
export function finishWorldEditorBootstrap(client:WorldEditorClient){if(!client.bootstrapping||client.bootstrapChecks)return;client.bootstrapping=false;notifyWorldEditor(client);}
export function beginWorldEditorBootstrapCheck(client:WorldEditorClient){
 if(!client.bootstrapping)return()=>{};client.bootstrapChecks++;let done=false;
 return()=>{if(done)return;done=true;client.bootstrapChecks--;finishWorldEditorBootstrap(client);};
}
export function attachWorldEditorRoot(client:WorldEditorClient){client.roots++;return()=>{client.roots--;};}
export async function loadWorldEditorLatest(client:WorldEditorClient,load:()=>Promise<void>){
  if(!client.editor.yours||client.editor.fence===null||client.readyFence===client.editor.fence||client.loadingLatest)return;
  client.loadingLatest=true;client.verifiedFence=null;notifyWorldEditor(client);
  const fence=client.editor.fence;
  try{await load();if(client.editor.yours&&client.editor.fence===fence&&client.verifiedFence===fence&&(client.permission.role==="owner"||client.permission.role==="editor")){client.readyFence=fence;notifyWorldEditor(client,{...client.permission,canEdit:true});}}
  catch(error){client.error=error instanceof Error?error.message:"Load the latest accepted state before editing.";notifyWorldEditor(client,{...client.permission,canEdit:false});}
  finally{client.loadingLatest=false;notifyWorldEditor(client);}
}
/** Legacy editors use their review flag for any read-only presentation.
 * Privileged HTTP review is selected only by the actual World permission. */
export function worldClientUrl(url:string){
 if(typeof window==="undefined")return url;const target=new URL(url,window.location.href);if(target.origin!==window.location.origin)return url;
 const id=target.pathname.match(/^\/api\/worlds\/([^/]+)(?:\/|$)/)?.[1],client=id?active.get(id):undefined;
 if(!client||client.permission.role==="administrator-review"||target.searchParams.get("review")!=="1")return url;
 target.searchParams.delete("review");return /^[a-z][a-z0-9+.-]*:/i.test(url)?target.href:target.pathname+target.search+target.hash;
}
export function worldEditorHeaders(url:string):Record<string,string>{
  if(typeof window==="undefined"||!active.size)return {};
  const target=new URL(url,window.location.href);if(target.origin!==window.location.origin)return {};
  const pathname=target.pathname,id=pathname.match(/^\/api\/worlds\/([^/]+)(?:\/|$)/)?.[1],client=id?active.get(id):undefined;
  return client?{"X-World-Editor":JSON.stringify({...client.proof})}:{};
}
export async function worldFetch(url:string,init:RequestInit={}):Promise<Response>{
  url=worldClientUrl(url);const actor=worldRequestActor(url);
  const headers=new Headers(init.headers);for(const[key,value]of Object.entries(worldEditorHeaders(url)))headers.set(key,value);
  if(actor)headers.set("X-World-Actor",actor);
  const response=await fetch(url,{...init,headers});if(response.ok&&actor&&(response.headers.get("X-World-Actor")!==actor||worldRequestActor(url)!==actor))throw Error("World access or the signed-in account changed. The original draft is retained.");
  if(response.ok&&typeof window!=="undefined"&&!["GET","HEAD"].includes((init.method??"GET").toUpperCase())){const path=new URL(url,window.location.href).pathname,id=path.match(/^\/api\/worlds\/([a-f0-9-]{36})(?:\/|$)/i)?.[1];if(id&&!path.endsWith("/access"))window.dispatchEvent(new CustomEvent("atlas:source-content-saved",{detail:{worldId:id}}));}
  return response;
}
/** New World drafts are account-bound; old owner packets are not deleted. */
export function worldDraftKey(worldId:string,legacyKey:string){
  const client=active.get(worldId);return client?legacyKey+(legacyKey.endsWith(":")?"actor:":":actor:")+encodeURIComponent(client.actorId)+(legacyKey.endsWith(":")?":":""):legacyKey;
}

