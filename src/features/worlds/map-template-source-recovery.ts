import {geographyTemplateEnvironmentSchema} from "./map-template-geography-spec";
import {z} from "zod";
import {terrainSettingsSchema} from "./terrain";
import {generationRecipeSchema,terrainAreaSchema} from "./terrain-source";
export const geographyTemplateStartSchema=z.object({version:z.literal(1),context:z.string().max(400),name:z.string().max(160),settings:terrainSettingsSchema,seaLevel:z.number().int().min(-30000).max(30000),recipe:generationRecipeSchema,environment:geographyTemplateEnvironmentSchema.optional(),area:terrainAreaSchema.nullable(),preserveManual:z.boolean(),feather:z.number().int().min(0).max(32)}).strict();
export type GeographyTemplateStart=z.infer<typeof geographyTemplateStartSchema>;
type Store=Pick<Storage,"getItem"|"setItem"|"removeItem"|"length"|"key">;
export type GeographyTemplateCandidate={key:string;raw:string;value?:GeographyTemplateStart};
export const geographyTemplatePrefix=(context:string)=>`st:geography-template-start:v1:${context}:`;
export function readGeographyTemplateStart(store:Store,context:string,ownKey:string):GeographyTemplateCandidate|undefined{
 const prefix=geographyTemplatePrefix(context);for(let i=0;i<store.length;i++){const key=store.key(i);if(!key?.startsWith(prefix)||key===ownKey)continue;const raw=store.getItem(key)!;try{if(raw.length>100000)throw Error("oversized");const value=geographyTemplateStartSchema.parse(JSON.parse(raw));if(value.context!==context)throw Error("another creator");return {key,raw,value};}catch{return {key,raw};}}
}
export function writeGeographyTemplateStart(store:Store,key:string,value:GeographyTemplateStart){
 geographyTemplateStartSchema.parse(value);const raw=JSON.stringify(value);if(raw.length>100000)throw Error("These geography settings exceed the recovery budget. Export them before closing.");if(!store.getItem(key)){let count=0;for(let i=0;i<store.length;i++)if(store.key(i)?.startsWith(geographyTemplatePrefix(value.context)))count++;if(count>=4)throw Error("Four geography template starts are retained here. Recover or export an earlier start before closing this one.");}store.setItem(key,raw);return raw;
}
export function retireGeographyTemplateStart(store:Store,candidate:GeographyTemplateCandidate|undefined,expected:GeographyTemplateStart){
 if(!candidate||!candidate.value||store.getItem(candidate.key)!==candidate.raw)return false;const a=candidate.value,b=expected;
 if(a.context!==b.context||a.name.trim()!==b.name.trim()||a.seaLevel!==b.seaLevel||a.preserveManual!==b.preserveManual||a.feather!==b.feather||JSON.stringify(a.settings)!==JSON.stringify(b.settings)||JSON.stringify(a.recipe)!==JSON.stringify(b.recipe)||JSON.stringify(a.area)!==JSON.stringify(b.area)||JSON.stringify(a.environment)!==JSON.stringify(b.environment))return false;
 store.removeItem(candidate.key);return true;
}
