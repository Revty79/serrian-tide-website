import {z} from "zod";
import {createHash} from "node:crypto";

export class EnvironmentError extends Error {
  constructor(public code:string,message:string){super(message);this.name="EnvironmentError";}
}
export function requireCondition(value:unknown,code:string,message:string):asserts value {if(!value)throw new EnvironmentError(code,message);}
export const digest=(bytes:Uint8Array|string)=>createHash("sha256").update(bytes).digest("hex");
export function canonicalJson(value:unknown):string {if(value===undefined)return "null";if(Array.isArray(value))return "["+value.map(canonicalJson).join(",")+"]";if(value!==null&&typeof value==="object")return "{"+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:1).map(([k,v])=>JSON.stringify(k)+":"+canonicalJson(v)).join(",")+"}";return JSON.stringify(value);}
const id=z.string().regex(/^[a-z][a-z0-9-]{2,79}$/),hash=z.string().regex(/^[a-f0-9]{64}$/),variable=z.string().regex(/^SERRIAN_INFRA_[A-Z][A-Z0-9_]*$/),absolute=z.string().min(1).max(4096);
export const rootsSchema=z.object({terrain:absolute,artwork:absolute,raster:absolute}).strict();
export const profileSchema=z.object({
  version:z.literal(1),environmentId:id,purpose:z.enum(["source","dev","production-candidate"]),
  database:z.object({urlEnv:variable,expectedName:z.string().regex(/^[a-z][a-z0-9_]{2,62}$/),expectedHost:z.string().min(1).max(253),expectedPort:z.number().int().min(1).max(65535),expectedRole:z.string().min(1).max(63),adminUrlEnv:variable.optional()}).strict(),
  roots:rootsSchema,environmentDirectory:absolute.optional(),pgBin:absolute.optional(),
  application:z.object({commit:z.string().regex(/^[a-f0-9]{40}$/).optional(),directory:absolute,origin:z.string().url(),trustFile:absolute,authSecretFile:absolute.optional(),hosting:z.enum(["local","ubuntu","render"]).default("local")}).strict(),
  reserveBytes:z.number().int().min(0).default(1073741824),
}).strict();
export type EnvironmentProfile=z.infer<typeof profileSchema>;
export const fileSchema=z.object({root:z.enum(["terrain","artwork","raster"]),key:z.string().min(1).max(1024),bytes:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),sha256:hash,linkTo:z.string().max(1100).optional()}).strict();
export type StoredFile=z.infer<typeof fileSchema>;
export const tableSchema=z.object({schema:z.string(),name:z.string(),rows:z.number().int().nonnegative(),sha256:hash}).strict();
export const databaseStateSchema=z.object({
  serverMajor:z.number().int().min(14).max(99),serverVersion:z.string(),encoding:z.literal("UTF8"),databaseBytes:z.number().nonnegative(),
  locale:z.object({provider:z.enum(["c","i","b"]),collate:z.string(),ctype:z.string(),locale:z.string().nullable(),version:z.string().nullable()}).strict(),
  tables:z.array(tableSchema).max(10000),sequences:z.array(z.object({schema:z.string(),name:z.string(),lastValue:z.string(),isCalled:z.boolean()}).strict()).max(10000),
  schemaSha256:hash,extensions:z.array(z.object({name:z.string(),version:z.string()}).strict()).max(100),
  largeObjects:z.array(z.object({oid:z.string(),bytes:z.number().int().nonnegative(),pages:z.number().int().nonnegative(),sha256:hash}).strict()).max(250000),
  migrations:z.array(z.object({hash,createdAt:z.string()}).strict()).max(10000),
  references:z.object({terrain:z.array(z.object({sha256:hash,bytes:z.literal(2048),encoding:z.literal("i16le-v1")}).strict()).max(250000),artwork:z.array(z.object({sha256:hash,bytes:z.number().int().positive()}).strict()).max(250000),rasters:z.array(z.object({bundle:hash,metadataSha256:hash,assets:z.array(z.object({key:z.string(),kind:z.string(),sha256:hash,bytes:z.number().int().positive()}).strict()).max(250000)}).strict()).max(10000)}).strict(),
}).strict();
export type DatabaseState=z.infer<typeof databaseStateSchema>;
export const manifestSchema=z.object({
  format:z.literal("serrian-environment"),version:z.literal(1),snapshotId:z.string().uuid(),createdAt:z.string().datetime(),sourceEnvironment:id,sourceDatabaseName:z.string(),applicationCommit:z.string().regex(/^[a-f0-9]{40}$/).nullable(),
  database:databaseStateSchema,archive:z.object({key:z.literal("database.dump"),bytes:z.number().int().positive(),sha256:hash}).strict(),files:z.array(fileSchema).max(250000),
  freeze:z.object({operator:z.string().min(1).max(160),statement:z.literal("ALL_APPLICATION_JOB_IMPORT_AND_DIRECT_WRITERS_STOPPED"),checkedOtherClients:z.literal(0),tableWriteLocks:z.literal(true),beforeAfterIdentical:z.literal(true)}).strict(),
}).strict();
export type SnapshotManifest=z.infer<typeof manifestSchema>;
export const MAX_MANIFEST_BYTES=64*1024*1024;
export const ROOT_KINDS=["terrain","artwork","raster"] as const;
export const quoteIdentifier=(name:string)=>'"'+name.replaceAll('"','""')+'"';
export const fileIdentity=(file:Pick<StoredFile,"root"|"key">)=>file.root+"/"+file.key;
export function safeKey(key:string){
  requireCondition(key.length<=1100&&!key.includes("\\")&&!key.includes(":")&&!/[\x00-\x1f]/.test(key),"UNSAFE_PATH","The snapshot contains an unsafe file path.");
  requireCondition(key.split("/").every(p=>p&&p!=="."&&p!==".."&&!/[. ]$/.test(p)&&! /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)),"UNSAFE_PATH","A snapshot path is not portable between Windows and Linux.");return key;
}
