CREATE TABLE "world_map_style" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"version" integer NOT NULL,
	"name" text NOT NULL,
	"spec" jsonb NOT NULL,
	"source_map_id" text NOT NULL,
	"source_appearance_revision" integer NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_map_style_valid" CHECK ("world_map_style"."version"=1 AND length(trim("world_map_style"."name")) BETWEEN 1 AND 80 AND "world_map_style"."source_appearance_revision">=0 AND jsonb_typeof("world_map_style"."spec")='object' AND "world_map_style"."spec"->>'version' IN ('1','2') AND "world_map_style"."spec"->>'style' IN ('classic-elevation','physical-relief','topographic','illustrated-fantasy','realistic-terrain'))
);
--> statement-breakpoint
ALTER TABLE "world_map_style" ADD CONSTRAINT "world_map_style_source_fk" FOREIGN KEY ("source_map_id","world_id") REFERENCES "public"."world_map_canvas"("map_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_map_style" ADD CONSTRAINT "world_map_style_author_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_map_style_world_idx" ON "world_map_style" USING btree ("world_id","created_at");
--> statement-breakpoint
CREATE FUNCTION world_map_style_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Named styles are immutable snapshots; save a new variant.';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER world_map_style_immutable
BEFORE UPDATE OR DELETE ON world_map_style
FOR EACH ROW EXECUTE FUNCTION world_map_style_immutable();
