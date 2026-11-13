/** Canon copy projection is separate from editing a redacted original: this
 * creates new records, so hidden content is removed rather than preserved. */
import { redactUnderground, undergroundDesignSchema } from "./underground";
import type {HydroSources} from "./terrain-hydrology";

const privateKeys=new Set(["godNotes","god_notes","privateNotes","private_notes","creatorNotes","notes"]);
const foreignLinks=new Set(["shopId","shopLocationId","permanentShopId","cultureId","governmentId","loreId","loreVersionId","historyVersionId","calendarSource","sourceDating","datingSystemId","calendarId","realmId"]);
export const canonUuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

export function canonOrdinaryGeography(input:unknown):unknown {
  if(Array.isArray(input))return input.map(canonOrdinaryGeography).filter(value=>value!==undefined);
  if(!input||typeof input!=="object")return input;
  const row=input as Record<string,unknown>;
  if(row.version===1&&Array.isArray(row.features)&&row.attributes&&row.guides){const parsed=undergroundDesignSchema.safeParse(row);if(parsed.success){const clean=redactUnderground(parsed.data);return Object.fromEntries(Object.entries(clean).map(([key,value])=>[key,canonOrdinaryGeography(value)]));}}
  if(row.protected===true&&typeof row.startYear==="number"&&typeof row.endYear==="number"&&typeof row.account==="string"&&typeof row.status==="string")return undefined;
  if(typeof row.visibility==="string"&&["protected","secret","god-only"].includes(row.visibility))return undefined;
  const out:Record<string,unknown>={};
  for(const [key,value]of Object.entries(row)){
    if(key==="source"&&value&&typeof value==="object"&&"kind"in value&&["legacy","manual","blank","generated","imported","regenerated"].includes(String(value.kind))){out[key]={kind:"manual"};continue;}
    if(privateKeys.has(key)&&typeof value==="string"){out[key]="";continue;}
    if(foreignLinks.has(key)){out[key]=null;continue;}
    const next=canonOrdinaryGeography(value);if(next!==undefined)out[key]=next;
  }
  return out;
}

export function canonStrictConnectionAccount(row:Record<string,unknown>){const payload=row.payload as Record<string,unknown>|undefined;return row.kind==="connections"&&!!payload?.connection&&!!payload.draft&&!!payload.source&&!!payload.original;}

export function canonGeographyRow(family:string,input:Record<string,unknown>,actorId:string):Record<string,unknown>{
  const original=structuredClone(input);
  if(family==="world_underground_level")original.design=redactUnderground(undergroundDesignSchema.parse(original.design));
  const value=canonOrdinaryGeography(original) as Record<string,unknown>;
  for(const key of ["god_notes","private_notes","archive_reason"])if(key in value)value[key]="";
  for(const key of ["author_id","created_by_user_id","updated_by_user_id","creator_id","importer_id"])if(key in value)value[key]=actorId;
  for(const key of ["revision","parent_revision","root_revision","initial_source_revision","initial_parent_revision","source_appearance_revision","placement_revision"])if(typeof value[key]==="number")value[key]=1;
  if("previous_revision"in value)value.previous_revision=null;
  if("restored_from_revision"in value)value.restored_from_revision=null;
  if("source"in value&&["world_terrain_version","world_terrain_refinement_version"].includes(family))value.source={kind:"manual"};
  if(typeof original.__copy_revision==="number"){
    value.revision=original.__copy_revision;
    if("previous_revision"in value)value.previous_revision=original.__copy_revision>1?original.__copy_revision-1:null;
    if(typeof original.__copy_parent_revision==="number")value.parent_revision=original.__copy_parent_revision;
    if(typeof original.__copy_root_revision==="number")value.root_revision=original.__copy_root_revision;
  }
  if(family==="world_terrain_refinement_geometry"){value.from_revision=original.__copy_revision;delete value.revision;}
  if(family==="world_atlas_map"){value.generation=null;value.source_map_id=null;}
  if(family==="world_region_hierarchy")value.revision=1;
  if(family==="world_settlement_profile"){value.culture_id=null;value.government_id=null;}
  if(family==="world_geo_surface")value.realm_id=null;
  if(family==="world_geo_version"){value.previous_id=null;value.note="";}
  if(family==="world_map_state_version"){
    value.previous_version_id=null;value.generation=null;
    const envelope=value.payload as {nativeAtlas:{resources:{key:string}[]}};
    envelope.nativeAtlas.resources=envelope.nativeAtlas.resources.filter(resource=>resource.key!=="territories");
  }
  if(family==="world_map_state_head")value.mode="authored";
  if(family==="world_map_state_component"){
    value.revision=original.revision;
    const payload=value.payload as Record<string,unknown>;
    // Each imported immutable component keeps a distinct copy identity, even
    // when removing private fields makes two ordinary payloads identical.
    if(canonStrictConnectionAccount(value))delete payload.canonCopyIdentity;
    else payload.canonCopyIdentity=value.id;
    function clearCatalogs(input:unknown):unknown{
      if(Array.isArray(input))return input.map(clearCatalogs);
      if(!input||typeof input!=="object")return input;
      return Object.fromEntries(Object.entries(input).map(([key,child])=>[key,["history","candidates","states","parentStates","assets","library","cultures","governments","unavailableTownIds"].includes(key)&&Array.isArray(child)?[]:clearCatalogs(child)]));
    }
    value.payload=clearCatalogs(payload);
    if(value.kind==="composition"){
      const layer=(value.payload as {layer?:{placements:{assetId:string}[]}}).layer;
      if(layer)layer.placements=layer.placements.filter(placement=>!canonUuid.test(placement.assetId));
    }
  }
  for(const key of ["created_at","updated_at"])if(key in value)value[key]=new Date().toISOString();
  if(family==="world_craft_placement")value.request_id=value.craft_id;
  if(family==="world_craft_connection")value.request_id=value.id;
  if(family==="world_town_map"){
    const design=value.design as {features?:Record<string,unknown>[]};
    // Native settlement features are copied, never their external commerce links.
    if(design.features)for(const feature of design.features){if("permanent"in feature)feature.permanent=null;}
  }
  return value;
}

/** IDs defined by ordinary native geometry, including attribute-map keys. */
export function canonDefinedIds(value:unknown,into=new Set<string>()):Set<string>{
  if(!value||typeof value!=="object")return into;
  if(Array.isArray(value)){for(const child of value)canonDefinedIds(child,into);return into;}
  for(const [key,child]of Object.entries(value)){
    if(canonUuid.test(key))into.add(key);
    if(["id","entityId"].includes(key)&&typeof child==="string"&&canonUuid.test(child))into.add(child);
    canonDefinedIds(child,into);
  }
  return into;
}
export function canonReferencedIds(value:unknown,into=new Set<string>()):Set<string>{
  if(typeof value==="string"&&canonUuid.test(value))into.add(value);
  else if(typeof value==="string"){const resource=/^([a-z][a-z-]*):([a-f0-9-]{36})(:[0-9]+)?$/i.exec(value);if(resource&&canonUuid.test(resource[2]))into.add(resource[2]);}
  else if(value&&typeof value==="object")for(const [key,child]of Object.entries(value)){if(canonUuid.test(key))into.add(key);canonReferencedIds(child,into);}
  return into;
}
export function remapCanonGeography(value:unknown,ids:ReadonlyMap<string,string>):unknown{
  if(typeof value==="string"){const direct=ids.get(value);if(direct)return direct;const resource=/^([a-z][a-z-]*):([a-f0-9-]{36})(:[0-9]+)?$/i.exec(value);return resource&&ids.has(resource[2])?resource[1]+":"+ids.get(resource[2])+(resource[3]??""):value;}
  if(Array.isArray(value))return value.map(child=>remapCanonGeography(child,ids));
  if(!value||typeof value!=="object")return value;
  return Object.fromEntries(Object.entries(value).map(([key,child])=>[ids.get(key)??key,remapCanonGeography(child,ids)]));
}

/** Current-layer counters start anew, while already-stale analyses stay stale.
 * Exact original pins remain in the retained private copy preparation. */
export function rebaseCanonSourcePins(value:unknown,before:HydroSources,after:HydroSources):unknown{
  if(Array.isArray(value))return value.map(item=>rebaseCanonSourcePins(item,before,after));
  if(!value||typeof value!=="object")return value;
  const row=value as Record<string,unknown>,output=Object.fromEntries(Object.entries(row).map(([key,child])=>[key,rebaseCanonSourcePins(child,before,after)]));
  if(row.fingerprint===before.fingerprint){output.fingerprint=after.fingerprint;if("rootRevision"in row)output.rootRevision=after.rootRevision;}
  if(typeof row.id==="string"&&typeof row.revision==="number"&&typeof row.contentHash==="string"){
    const source=after.sources.find(source=>source.id===row.id);if(source&&source.contentHash===row.contentHash){output.revision=source.revision;output.contentHash=source.contentHash;}
  }
  return output;
}
