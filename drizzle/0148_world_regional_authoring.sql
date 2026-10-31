CREATE TABLE "world_regional_edit" (
	"request_id" text PRIMARY KEY NOT NULL,
	"map_id" text NOT NULL,
	"world_id" text NOT NULL,
	"parent_map_id" text NOT NULL,
	"terrain_id" text NOT NULL,
	"kind" text NOT NULL,
	"base_revision" integer NOT NULL,
	"input_hash" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_regional_edit_valid" CHECK ("world_regional_edit"."base_revision">=0 AND "world_regional_edit"."input_hash" ~ '^[a-f0-9]{64}$' AND "world_regional_edit"."kind" IN ('materials','water','environment','artwork','labels') AND jsonb_typeof("world_regional_edit"."result")='object' AND octet_length("world_regional_edit"."result"::text)<=8192 AND "world_regional_edit"."result" ?& ARRAY['revision','geographyChanged'] AND jsonb_typeof("world_regional_edit"."result"->'revision')='number' AND jsonb_typeof("world_regional_edit"."result"->'geographyChanged')='boolean' AND ("world_regional_edit"."result"->>'revision')::integer BETWEEN "world_regional_edit"."base_revision" AND "world_regional_edit"."base_revision"+1 AND ("world_regional_edit"."result"-ARRAY['revision','compositionRevision','geographyChanged','compositionChanged'])='{}'::jsonb)
);
--> statement-breakpoint
ALTER TABLE "world_regional_edit" ADD CONSTRAINT "world_regional_edit_region_fk" FOREIGN KEY ("map_id","world_id") REFERENCES "public"."world_map_region"("map_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_regional_edit" ADD CONSTRAINT "world_regional_edit_author_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_regional_edit_map_idx" ON "world_regional_edit" USING btree ("map_id","kind","created_at");
--> statement-breakpoint
CREATE FUNCTION world_regional_edit_validate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM world_map_region r WHERE r.map_id=NEW.map_id AND r.world_id=NEW.world_id AND r.parent_map_id=NEW.parent_map_id AND r.terrain_id=NEW.terrain_id)
 THEN RAISE EXCEPTION 'Regional edit receipts must retain their accepted parent and shared terrain identity.'; END IF;
 RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER world_regional_edit_validate BEFORE INSERT ON world_regional_edit FOR EACH ROW EXECUTE FUNCTION world_regional_edit_validate();
--> statement-breakpoint
CREATE TRIGGER world_regional_edit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON world_regional_edit FOR EACH STATEMENT EXECUTE FUNCTION world_terrain_history_immutable();
