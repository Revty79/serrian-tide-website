CREATE TABLE "world_terrain_material" (
	"map_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"revision" integer NOT NULL,
	"layer" jsonb NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_terrain_material_valid" CHECK ("world_terrain_material"."revision">0 AND "world_terrain_material"."layer"->>'version'='1' AND jsonb_typeof("world_terrain_material"."layer"->'strokes')='array')
);
--> statement-breakpoint
CREATE TABLE "world_terrain_material_version" (
	"map_id" text NOT NULL,
	"revision" integer NOT NULL,
	"layer" jsonb NOT NULL,
	"request_id" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_terrain_material_version_pk" PRIMARY KEY("map_id","revision"),
	CONSTRAINT "world_terrain_material_version_request_uq" UNIQUE("request_id"),
	CONSTRAINT "world_terrain_material_version_valid" CHECK ("world_terrain_material_version"."revision">0 AND "world_terrain_material_version"."layer"->>'version'='1' AND jsonb_typeof("world_terrain_material_version"."layer"->'strokes')='array')
);
--> statement-breakpoint
ALTER TABLE "world_map_appearance" DROP CONSTRAINT "world_map_appearance_valid";--> statement-breakpoint
ALTER TABLE "world_terrain_material" ADD CONSTRAINT "world_terrain_material_map_fk" FOREIGN KEY ("map_id","world_id") REFERENCES "public"."world_map_canvas"("map_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_terrain_material" ADD CONSTRAINT "world_terrain_material_editor_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_terrain_material_version" ADD CONSTRAINT "world_terrain_material_version_map_fk" FOREIGN KEY ("map_id") REFERENCES "public"."world_terrain_material"("map_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_terrain_material_version" ADD CONSTRAINT "world_terrain_material_version_author_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_map_appearance" ADD CONSTRAINT "world_map_appearance_valid" CHECK ("world_map_appearance"."revision">0 AND jsonb_typeof("world_map_appearance"."spec")='object' AND (("world_map_appearance"."spec"->>'version'='1' AND "world_map_appearance"."spec"->>'style' IN ('classic-elevation','physical-relief','topographic','illustrated-fantasy')) OR ("world_map_appearance"."spec"->>'version'='2' AND "world_map_appearance"."spec"->>'style' IN ('classic-elevation','physical-relief','topographic','illustrated-fantasy','realistic-terrain'))));
--> statement-breakpoint
CREATE FUNCTION world_terrain_material_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Accepted terrain material history is immutable; append a new revision.';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER world_terrain_material_history_immutable
BEFORE UPDATE OR DELETE ON world_terrain_material_version
FOR EACH ROW EXECUTE FUNCTION world_terrain_material_history_immutable();
