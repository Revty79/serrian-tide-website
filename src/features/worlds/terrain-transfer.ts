import {z} from "zod";
import {elevationSchema,terrainSettingsSchema,tileSchema} from "./terrain";
import {terrainSourceSchema} from "./terrain-source";
import {TERRAIN_RESOLUTION,TERRAIN_TRANSFER} from "./terrain-resolution";
import type {NativeHistoryScope} from "./native-map-history";
const id=z.uuid(),digest=z.string().regex(/^[a-f0-9]{64}$/);
const save=z.object({action:z.literal("save"),requestId:id,mapId:id,revision:z.number().int().positive(),seaLevel:elevationSchema,sourceState:z.string().max(8192).optional(),source:terrainSourceSchema.optional()}).strict();
const create=z.object({action:z.literal("create"),requestId:id,name:z.string().trim().min(1).max(160),initial:z.enum(["generated","imported"]),seaLevel:elevationSchema.optional(),source:terrainSourceSchema,settings:terrainSettingsSchema}).strict();
export const terrainTransferHeaderSchema=z.discriminatedUnion("action",[save,create]);
export type TerrainTransferHeader=z.infer<typeof terrainTransferHeaderSchema>&{nativeScope?:NativeHistoryScope};
export const terrainTransferTileSchema=z.object({x:z.number().int().min(0).max(127),y:z.number().int().min(0).max(127),sha256:digest}).strict();
export type TerrainTransferTile=z.infer<typeof terrainTransferTileSchema>;
export const terrainTransferBeginSchema=z.object({op:z.literal("begin"),command:terrainTransferHeaderSchema,refinementId:id.optional(),tiles:z.array(terrainTransferTileSchema).min(1).max(TERRAIN_RESOLUTION.detailTiles)}).strict().superRefine((v,c)=>{
 if(v.refinementId&&v.command.action!=="save")c.addIssue({code:"custom",message:"Create numerical detail through its inherited preview."});
 if(!v.refinementId&&(v.tiles.length>TERRAIN_RESOLUTION.worldTiles||v.tiles.some(t=>t.x>=64||t.y>=64)))c.addIssue({code:"custom",message:"This transfer exceeds the World base grid."});
 const seen=new Set<string>();for(const t of v.tiles){const key=t.x+":"+t.y;if(seen.has(key))c.addIssue({code:"custom",message:"Each logical edit includes a tile once."});seen.add(key);}
});
export const terrainTransferCommandSchema=z.discriminatedUnion("op",[
 terrainTransferBeginSchema,
 z.object({op:z.literal("chunk"),requestId:id,tiles:z.array(tileSchema).min(1).max(TERRAIN_TRANSFER.chunkTiles)}).strict(),
 z.object({op:z.literal("finish"),requestId:id}).strict(),
 z.object({op:z.literal("status"),requestId:id}).strict(),
 z.object({op:z.literal("retain"),requestId:id}).strict(),
]);
export type TerrainTransferResult={requestId:string;received:string[];total:number;state?:"receiving"|"retained"|"accepted";result?:{id:string;revision:number;refinementId?:string;historical?:unknown}};
