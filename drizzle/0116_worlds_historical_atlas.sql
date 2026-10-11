CREATE TABLE "world_atlas_milestone_receipt" (
	"world_id" text NOT NULL,
	"timeline_id" text NOT NULL,
	"request_id" text NOT NULL,
	"geography_id" text NOT NULL,
	"entry_id" text NOT NULL,
	"draft_hash" text NOT NULL,
	CONSTRAINT "world_atlas_milestone_receipt_world_id_timeline_id_request_id_pk" PRIMARY KEY("world_id","timeline_id","request_id"),
	CONSTRAINT "atlas_milestone_hash_valid" CHECK (length("world_atlas_milestone_receipt"."draft_hash")=64)
);
--> statement-breakpoint
ALTER TABLE "world_historical_entry" ADD COLUMN "event_type" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "world_historical_entry" ADD COLUMN "prominence" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "world_atlas_milestone_receipt" ADD CONSTRAINT "atlas_milestone_timeline_fk" FOREIGN KEY ("timeline_id","world_id") REFERENCES "public"."world_timeline"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_atlas_milestone_receipt" ADD CONSTRAINT "atlas_milestone_place_fk" FOREIGN KEY ("geography_id","world_id") REFERENCES "public"."world_geography"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_atlas_milestone_receipt" ADD CONSTRAINT "atlas_milestone_entry_fk" FOREIGN KEY ("entry_id","world_id") REFERENCES "public"."world_historical_entry"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "history_search_text_idx" ON "world_history_version" USING gin (to_tsvector('simple', coalesce("payload"->>'title','') || ' ' || coalesce("payload"->>'account','') || ' ' || coalesce("payload"->>'notes','')));--> statement-breakpoint
ALTER TABLE "world_historical_entry" ADD CONSTRAINT "world_entry_event_type_valid" CHECK (length("world_historical_entry"."event_type")<=160);--> statement-breakpoint
ALTER TABLE "world_historical_entry" ADD CONSTRAINT "world_entry_prominence_valid" CHECK ("world_historical_entry"."prominence" in ('featured','standard','index-only'));--> statement-breakpoint
ALTER TABLE "world_history_version" ADD CONSTRAINT "history_prominence_valid" CHECK (coalesce("world_history_version"."payload"->>'prominence','standard') in ('featured','standard','index-only'));