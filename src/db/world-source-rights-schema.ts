import {sql} from "drizzle-orm";
import {boolean,check,index,integer,jsonb,pgTable,primaryKey,text,timestamp,unique} from "drizzle-orm/pg-core";
import {user} from "./auth-schema";
import {world} from "./world-schema";
import type {SourceEvidence,SourceReview} from "@/features/worlds/source-rights";

/** A review sidecar for existing identities, never a second asset/geography store. */
export const atlasSource=pgTable("atlas_source_rights",{
 id:text("id").primaryKey(),ownerId:text("owner_id").notNull().references(()=>user.id,{onDelete:"restrict"}),
 subjectKind:text("subject_kind").notNull(),subjectId:text("subject_id").notNull(),subjectVersion:text("subject_version").notNull(),
 evidence:jsonb("evidence").$type<SourceEvidence>(),original:boolean("original").notNull().default(false),
 createdAt:timestamp("created_at").notNull().defaultNow(),
},t=>[unique("atlas_source_subject_uq").on(t.subjectKind,t.subjectId,t.subjectVersion),index("atlas_source_owner_idx").on(t.ownerId),check("atlas_source_kind_valid",sql`${t.subjectKind} in ('reference','asset','geographic','raster','legacy-world')`)]);
export const atlasSourceReview=pgTable("atlas_source_review",{
 sourceId:text("source_id").notNull().references(()=>atlasSource.id,{onDelete:"restrict"}),revision:integer("revision").notNull(),
 reviewerId:text("reviewer_id").notNull().references(()=>user.id,{onDelete:"restrict"}),requestId:text("request_id").notNull(),
 inputHash:text("input_hash").notNull(),review:jsonb("review").$type<SourceReview>().notNull(),createdAt:timestamp("created_at").notNull().defaultNow(),
},t=>[primaryKey({columns:[t.sourceId,t.revision]}),unique("atlas_source_review_request_uq").on(t.requestId),check("atlas_source_review_valid",sql`${t.revision}>0 and ${t.inputHash} ~ '^[a-f0-9]{64}$' and ${t.review}->>'decision' in ('approved','hold','rejected')`)]);
export const atlasSourceUse=pgTable("atlas_source_use",{
 worldId:text("world_id").notNull().references(()=>world.id,{onDelete:"restrict"}),sourceId:text("source_id").notNull().references(()=>atlasSource.id,{onDelete:"restrict"}),
 kind:text("kind").notNull(),targetId:text("target_id").notNull(),version:text("version").notNull(),note:text("note").notNull(),createdAt:timestamp("created_at").notNull().defaultNow(),
},t=>[primaryKey({columns:[t.worldId,t.sourceId,t.kind,t.targetId,t.version]}),index("atlas_source_use_source_idx").on(t.sourceId)]);
export const atlasSourceParent=pgTable("atlas_source_parent",{
 sourceId:text("source_id").notNull().references(()=>atlasSource.id,{onDelete:"restrict"}),parentId:text("parent_id").notNull().references(()=>atlasSource.id,{onDelete:"restrict"}),
},t=>[primaryKey({columns:[t.sourceId,t.parentId]}),check("atlas_source_parent_distinct",sql`${t.sourceId}<>${t.parentId}`)]);
