import type { WorldPermission } from "./world-permissions";
import { loreWorldScope, nativeWorldScope,worldScopes } from "./world-permissions";

const privateNoteKeys=new Set(["notes","privateNotes","godNotes","creatorNotes","authorNotes"]);
const timeSources=new Set(["sourceDating","calendarSource","anchorSource","anchorCalendar","calendarDate","calendarBindings","datingSystemId","datingSystemRevision","defaultDatingSystemId"]);
const loreFamilies=new Set(["species","people","origin","relationship","culture","civilization","language","population","belief","tradition","individual","polity","government","institution","office","appointment","claim","agreement","conflict","organization","organizationRole","membership","assignment","network","cosmicFramework","realm","celestial","cosmicPrinciple","cosmicConnection","skyCycle","skyObservation","skyCalendarLink","story"]);
const nativeKinds=new Set(["terrain","town","floor","underground","craft","deck","craft-deck"]);
const privateCollections=new Set(["sections","participants","periods","nameAccounts","relationshipPeriods","geographies","storySources","originals","calendarBindings","territories","states","parentStates","selected","storyContext"]);
/** Last-mile projection supplements resource/service checks; it never grants access. */
export function projectWorldContent<T>(payload:T,permission:WorldPermission):T{
  if(permission.protectedContent&&worldScopes.every(scope=>permission.scopes.includes(scope)))return payload;
  const has=(scope:string)=>permission.scopes.some(item=>item===scope),protectedContent=permission.protectedContent;
  function project(value:unknown,parentKey=""):unknown{
    if(Array.isArray(value))return value.map(item=>project(item,parentKey)).filter(item=>item!==undefined);
    if(!value||typeof value!=="object"||value instanceof Date||value instanceof Uint8Array)return value;
    const row=value as Record<string,unknown>;
    const protectedRecord=row.protected===true&&(privateCollections.has(parentKey)||!!row.coordinateSpace||typeof row.startYear==="number"&&!!row.target);
    const draftVisibility=(row.draft as {visibility?:string}|undefined)?.visibility;
    if(!protectedContent&&(protectedRecord||typeof row.visibility==="string"&&["protected","secret","god-only"].includes(row.visibility)||draftVisibility==="protected"))return undefined;
    if(typeof row.family==="string"&&loreFamilies.has(row.family)&&!has(loreWorldScope(row.family)))return undefined;
    const target=row.target as {kind?:string}|undefined;
    if(target?.kind&&nativeKinds.has(target.kind)&&!has(nativeWorldScope(target.kind)))return undefined;
    const hidden=!protectedContent&&Array.isArray(row.protectedFields)?new Set(row.protectedFields.filter(v=>typeof v==="string")):new Set();
    const output:Record<string,unknown>={};
    for(const [key,entry]of Object.entries(row)){
      if(!protectedContent&&(privateNoteKeys.has(key)&&typeof entry==="string"||hidden.has(key))){output[key]=typeof entry==="string"?"":null;continue;}
      if(!protectedContent&&key==="protectedFields"){output[key]=[];continue;}
      if(!has("timekeeping")&&timeSources.has(key)){if(Array.isArray(entry))output[key]=[];else if(["sourceDating","calendarSource","anchorSource","datingSystemId","defaultDatingSystemId"].includes(key))output[key]=null;continue;}
      if(!has("timekeeping")&&["datingSystems","calendars"].includes(key)){output[key]=[];continue;}
      if(!has("history")&&parentKey==="references"&&key==="history"){output[key]=[];continue;}
      if(!has("politics")&&key==="territories"){output[key]=[];continue;}
      if(!has("settlements")&&key==="geographies"){output[key]=[];continue;}
      if(!has("atlas")&&(key==="placement"||key==="map")){output[key]=null;continue;}
      if(!has("atlas")&&key==="placed")continue;
      if(key==="fields"&&entry&&typeof entry==="object"&&!Array.isArray(entry))output[key]=Object.fromEntries(Object.entries(entry).filter(([name])=>!hidden.has(name)).map(([name,value])=>[name,project(value)]));
      else{const next=project(entry,key);if(next!==undefined)output[key]=next;}
    }
    return output;
  }
  return project(payload) as T;
}
/** A redacted editor cannot clear another creator's retained notes by saving a drawing. */
export function preservePrivateCreatorNotes<T>(draft:T,source:T|undefined):T{
  if(Array.isArray(draft)){
    if(Array.isArray(source))for(const prior of source){if(prior&&typeof prior==="object"&&"id"in prior&&hasPrivateCreatorNotes(prior)&&!draft.some(value=>value&&typeof value==="object"&&"id"in value&&value.id===prior.id))throw Error("Keep the object containing retained creator notes, or ask its owner for protected-content permission.");}
    return draft.map((value,index)=>{const id=value&&typeof value==="object"&&"id"in value?value.id:undefined;const previous=Array.isArray(source)?id?source.find(item=>item&&typeof item==="object"&&"id"in item&&item.id===id):source[index]:undefined;return preservePrivateCreatorNotes(value,previous);}) as T;
  }
  if(!draft||typeof draft!=="object")return draft;
  const old=source&&typeof source==="object"?source as Record<string,unknown>:{},output:Record<string,unknown>={};
  for(const [key,value]of Object.entries(draft)){if(privateNoteKeys.has(key)&&typeof value==="string"){if(value&&value!==old[key])throw Error("Private creator notes require the owner's protected-content permission.");output[key]=old[key]??value;}else output[key]=preservePrivateCreatorNotes(value,old[key]);}
  for(const [key,value]of Object.entries(old))if(!(key in output)){if(privateNoteKeys.has(key)&&typeof value==="string")output[key]=value;else if(hasPrivateCreatorNotes(value))throw Error("Keep the retained details containing creator notes, or ask its owner for protected-content permission.");}
  return output as T;
}
function hasPrivateCreatorNotes(value:unknown):boolean{if(!value||typeof value!=="object")return false;return Object.entries(value).some(([key,entry])=>privateNoteKeys.has(key)?typeof entry==="string"&&!!entry:hasPrivateCreatorNotes(entry));}
