CREATE TABLE "world_hydrology" (
	"map_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"revision" integer NOT NULL,
	"layer" jsonb NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_hydrology_world_identity_uq" UNIQUE("map_id","world_id"),
	CONSTRAINT "world_hydrology_layer_valid" CHECK ("world_hydrology"."revision">0 AND "world_hydrology"."layer"->>'version'='1' AND jsonb_typeof("world_hydrology"."layer"->'nodes')='array' AND jsonb_typeof("world_hydrology"."layer"->'edges')='array' AND jsonb_array_length("world_hydrology"."layer"->'nodes')<=8192 AND jsonb_array_length("world_hydrology"."layer"->'edges')<=4096)
);
--> statement-breakpoint
CREATE TABLE "world_hydrology_version" (
	"map_id" text NOT NULL,
	"world_id" text NOT NULL,
	"revision" integer NOT NULL,
	"previous_revision" integer,
	"restored_from_revision" integer,
	"layer" jsonb NOT NULL,
	"request_id" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_hydrology_version_pk" PRIMARY KEY("map_id","revision"),
	CONSTRAINT "world_hydrology_request_uq" UNIQUE("request_id"),
	CONSTRAINT "world_hydrology_version_valid" CHECK ("world_hydrology_version"."revision">0 AND (("world_hydrology_version"."revision"=1 AND "world_hydrology_version"."previous_revision" IS NULL) OR ("world_hydrology_version"."revision">1 AND "world_hydrology_version"."previous_revision" IS NOT NULL AND "world_hydrology_version"."previous_revision"="world_hydrology_version"."revision"-1)) AND ("world_hydrology_version"."restored_from_revision" IS NULL OR ("world_hydrology_version"."restored_from_revision">0 AND "world_hydrology_version"."restored_from_revision"<"world_hydrology_version"."revision")) AND "world_hydrology_version"."layer"->>'version'='1' AND jsonb_typeof("world_hydrology_version"."layer"->'nodes')='array' AND jsonb_typeof("world_hydrology_version"."layer"->'edges')='array')
);
--> statement-breakpoint
ALTER TABLE "world_hydrology" ADD CONSTRAINT "world_hydrology_map_fk" FOREIGN KEY ("map_id","world_id") REFERENCES "public"."world_map_canvas"("map_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_hydrology" ADD CONSTRAINT "world_hydrology_editor_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_hydrology_version" ADD CONSTRAINT "world_hydrology_version_map_fk" FOREIGN KEY ("map_id","world_id") REFERENCES "public"."world_hydrology"("map_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_hydrology_version" ADD CONSTRAINT "world_hydrology_version_author_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_hydrology_version" ADD CONSTRAINT "world_hydrology_version_parent_fk" FOREIGN KEY ("map_id","previous_revision") REFERENCES "public"."world_hydrology_version"("map_id","revision") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_hydrology_version" ADD CONSTRAINT "world_hydrology_version_restore_fk" FOREIGN KEY ("map_id","restored_from_revision") REFERENCES "public"."world_hydrology_version"("map_id","revision") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION world_hydrology_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Accepted water history is immutable; append a new revision.';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER world_hydrology_history_immutable
BEFORE UPDATE OR DELETE ON world_hydrology_version
FOR EACH ROW EXECUTE FUNCTION world_hydrology_history_immutable();
