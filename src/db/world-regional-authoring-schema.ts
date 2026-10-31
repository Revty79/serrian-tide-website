import {sql} from "drizzle-orm";
import {check,foreignKey,index,integer,jsonb,pgTable,text,timestamp} from "drizzle-orm/pg-core";
import {worldMapRegion} from "./world-map-region-schema";
import {user} from "./auth-schema";

export type RegionalEditResult={revision:number;compositionRevision?:number;geographyChanged:boolean;compositionChanged?:boolean};
/** Compact scope-bound receipts, not copies of geographic layers or numerical data. */
export const worldRegionalEdit=pgTable("world_regional_edit",{
 requestId:text("request_id").primaryKey(),mapId:text("map_id").notNull(),worldId:text("world_id").notNull(),
 parentMapId:text("parent_map_id").notNull(),terrainId:text("terrain_id").notNull(),kind:text("kind").notNull(),
 baseRevision:integer("base_revision").notNull(),inputHash:text("input_hash").notNull(),result:jsonb("result").$type<RegionalEditResult>().notNull(),
 createdBy:text("created_by_user_id").notNull(),createdAt:timestamp("created_at").notNull().defaultNow(),
},t=>[
 foreignKey({name:"world_regional_edit_region_fk",columns:[t.mapId,t.worldId],foreignColumns:[worldMapRegion.mapId,worldMapRegion.worldId]}).onDelete("restrict"),
 foreignKey({name:"world_regional_edit_author_fk",columns:[t.createdBy],foreignColumns:[user.id]}).onDelete("restrict"),
 index("world_regional_edit_map_idx").on(t.mapId,t.kind,t.createdAt),
 check("world_regional_edit_valid",sql`${t.baseRevision}>=0 AND ${t.inputHash} ~ '^[a-f0-9]{64}$' AND ${t.kind} IN ('materials','water','environment','artwork','labels') AND jsonb_typeof(${t.result})='object' AND octet_length(${t.result}::text)<=8192 AND ${t.result} ?& ARRAY['revision','geographyChanged'] AND jsonb_typeof(${t.result}->'revision')='number' AND jsonb_typeof(${t.result}->'geographyChanged')='boolean' AND (${t.result}->>'revision')::integer BETWEEN ${t.baseRevision} AND ${t.baseRevision}+1 AND (${t.result}-ARRAY['revision','compositionRevision','geographyChanged','compositionChanged'])='{}'::jsonb`),
]);
