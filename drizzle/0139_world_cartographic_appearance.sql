CREATE TABLE "world_map_appearance" (
	"map_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"revision" integer NOT NULL,
	"spec" jsonb NOT NULL,
	"request_id" text NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_map_appearance_request_uq" UNIQUE("request_id"),
	CONSTRAINT "world_map_appearance_valid" CHECK ("world_map_appearance"."revision">0 AND jsonb_typeof("world_map_appearance"."spec")='object' AND "world_map_appearance"."spec"->>'version'='1' AND "world_map_appearance"."spec"->>'style' IN ('classic-elevation','physical-relief','topographic','illustrated-fantasy'))
);
--> statement-breakpoint
ALTER TABLE "world_map_appearance" ADD CONSTRAINT "world_map_appearance_map_fk" FOREIGN KEY ("map_id","world_id") REFERENCES "public"."world_map_canvas"("map_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_map_appearance" ADD CONSTRAINT "world_map_appearance_editor_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;