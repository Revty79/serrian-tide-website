CREATE OR REPLACE FUNCTION world_atlas_settlement_state_valid(v jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE k text;
BEGIN
 IF jsonb_typeof(v)<>'object' OR NOT (v ?& ARRAY['version','layers']) OR jsonb_typeof(v->'version')<>'number' OR v->>'version'<>'1' OR jsonb_typeof(v->'layers')<>'object' OR (SELECT count(*) FROM jsonb_object_keys(v))<>2 OR (SELECT count(*) FROM jsonb_object_keys(v->'layers'))<>7 THEN RETURN false; END IF;
 FOREACH k IN ARRAY ARRAY['waterways','roads','districts','buildings','walls','landmarks','labels'] LOOP
 IF jsonb_typeof(v->'layers'->k)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(v->'layers'->k))<>2 OR jsonb_typeof(v->'layers'->k->'visible')<>'boolean' OR jsonb_typeof(v->'layers'->k->'locked')<>'boolean' THEN RETURN false; END IF;
 END LOOP; RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false; END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION world_atlas_settlement_shape_valid(v jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE p jsonb; n integer; x numeric; y numeric; ids text[]:=ARRAY[]::text[]; last_x numeric; last_y numeric;
BEGIN
 IF jsonb_typeof(v)<>'object' OR v->>'version'<>'1' OR jsonb_typeof(v->'version')<>'number' OR jsonb_typeof(v->'archived')<>'boolean' OR NOT (v ?& ARRAY['id','geographyId','type','variant','archived','version']) OR v->>'variant' NOT IN ('plain','main','lane','trail','bridge','gate','tower','park','plaza','harbor','custom') THEN RETURN false; END IF;
 PERFORM (v->>'id')::uuid; PERFORM (v->>'geographyId')::uuid;
 IF v->>'type'='marker' THEN
 IF NOT (v ?& ARRAY['point','size','rotation']) OR (SELECT count(*) FROM jsonb_object_keys(v))<>9 OR jsonb_typeof(v->'size')<>'number' OR (v->>'size')::numeric NOT BETWEEN 4 AND 160 OR jsonb_typeof(v->'rotation')<>'number' OR (v->>'rotation')::numeric NOT BETWEEN -180 AND 180 THEN RETURN false; END IF;
 p:=v->'point';
 IF jsonb_typeof(p)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(p))<>2 OR jsonb_typeof(p->'x')<>'number' OR jsonb_typeof(p->'y')<>'number' THEN RETURN false; END IF;
 x:=(p->>'x')::numeric;y:=(p->>'y')::numeric; RETURN x BETWEEN 0 AND 2000 AND y BETWEEN 0 AND 1200 AND round(x,2)=x AND round(y,2)=y;
 END IF;
 IF NOT (v ? 'points') OR v->>'type' NOT IN ('area','line') OR jsonb_typeof(v->'points')<>'array' THEN RETURN false; END IF;
 n:=jsonb_array_length(v->'points');IF n>256 OR n<(CASE WHEN v->>'type'='area' THEN 3 ELSE 2 END) THEN RETURN false; END IF;
 IF v->>'type'='area' THEN RETURN (SELECT count(*) FROM jsonb_object_keys(v))=7 AND world_atlas_geometry_valid(jsonb_build_object('version',1,'type','polygon','points',v->'points')) IS TRUE; END IF;
 IF NOT (v ?& ARRAY['points','width','curve']) OR (SELECT count(*) FROM jsonb_object_keys(v))<>9 OR jsonb_typeof(v->'width')<>'number' OR (v->>'width')::numeric NOT BETWEEN 1 AND 100 OR jsonb_typeof(v->'curve')<>'number' OR (v->>'curve')::numeric NOT BETWEEN 0 AND 1 THEN RETURN false; END IF;
 FOR p IN SELECT * FROM jsonb_array_elements(v->'points') LOOP
 IF jsonb_typeof(p)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(p))<>3 OR jsonb_typeof(p->'x')<>'number' OR jsonb_typeof(p->'y')<>'number' THEN RETURN false; END IF;
 PERFORM (p->>'id')::uuid;IF p->>'id'=ANY(ids) THEN RETURN false; END IF;ids:=array_append(ids,p->>'id');x:=(p->>'x')::numeric;y:=(p->>'y')::numeric;
 IF x NOT BETWEEN 0 AND 2000 OR y NOT BETWEEN 0 AND 1200 OR round(x,2)<>x OR round(y,2)<>y OR (x=last_x AND y=last_y) THEN RETURN false; END IF;last_x:=x;last_y:=y;
 END LOOP; RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false; END $$;
--> statement-breakpoint
CREATE TABLE "world_atlas_settlement_shape" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"map_id" text NOT NULL,
	"settlement_id" text NOT NULL,
	"geography_id" text NOT NULL,
	"content" jsonb NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "world_atlas_settlement_shape_valid" CHECK (world_atlas_settlement_shape_valid("world_atlas_settlement_shape"."content") AND "world_atlas_settlement_shape"."content"->>'id'="world_atlas_settlement_shape"."id" AND "world_atlas_settlement_shape"."content"->>'geographyId'="world_atlas_settlement_shape"."geography_id" AND "world_atlas_settlement_shape"."sort_order" BETWEEN 0 AND 3999)
);
--> statement-breakpoint
CREATE TABLE "world_settlement_entity" (
	"geography_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"settlement_id" text NOT NULL,
	"kind" text NOT NULL,
	"classification" text DEFAULT '' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "world_settlement_entity_place_uq" UNIQUE("geography_id","world_id","settlement_id"),
	CONSTRAINT "world_settlement_entity_kind_uq" UNIQUE("geography_id","world_id","settlement_id","kind"),
	CONSTRAINT "world_settlement_entity_valid" CHECK ("world_settlement_entity"."kind" IN ('street','district','building','wall','waterway','space','landmark') AND length("world_settlement_entity"."classification")<=160 AND "world_settlement_entity"."revision">0 AND "world_settlement_entity"."geography_id"<>"world_settlement_entity"."settlement_id")
);
--> statement-breakpoint
CREATE TABLE "world_settlement_membership" (
	"geography_id" text NOT NULL,
	"district_id" text NOT NULL,
	"world_id" text NOT NULL,
	"settlement_id" text NOT NULL,
	"district_kind" text DEFAULT 'district' NOT NULL,
	CONSTRAINT "world_settlement_membership_uq" UNIQUE("geography_id","district_id"),
	CONSTRAINT "world_settlement_membership_valid" CHECK ("world_settlement_membership"."district_kind"='district' AND "world_settlement_membership"."geography_id"<>"world_settlement_membership"."district_id")
);
--> statement-breakpoint
ALTER TABLE "world_atlas_map" ADD COLUMN "map_kind" text DEFAULT 'generic' NOT NULL;--> statement-breakpoint
ALTER TABLE "world_atlas_map" ADD COLUMN "settlement_state" jsonb DEFAULT '{"version":1,"layers":{"waterways":{"visible":true,"locked":false},"roads":{"visible":true,"locked":false},"districts":{"visible":true,"locked":false},"buildings":{"visible":true,"locked":false},"walls":{"visible":true,"locked":false},"landmarks":{"visible":true,"locked":false},"labels":{"visible":true,"locked":false}}}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "world_atlas_map" ADD CONSTRAINT "world_atlas_map_place_world_uq" UNIQUE("id","world_id","geography_id");--> statement-breakpoint
ALTER TABLE "world_atlas_settlement_shape" ADD CONSTRAINT "world_atlas_settlement_shape_map_fk" FOREIGN KEY ("map_id","world_id","settlement_id") REFERENCES "public"."world_atlas_map"("id","world_id","geography_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_atlas_settlement_shape" ADD CONSTRAINT "world_atlas_settlement_shape_entity_fk" FOREIGN KEY ("geography_id","world_id","settlement_id") REFERENCES "public"."world_settlement_entity"("geography_id","world_id","settlement_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_settlement_entity" ADD CONSTRAINT "world_settlement_entity_geography_fk" FOREIGN KEY ("geography_id","world_id") REFERENCES "public"."world_geography"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_settlement_entity" ADD CONSTRAINT "world_settlement_entity_parent_fk" FOREIGN KEY ("settlement_id","world_id") REFERENCES "public"."world_geography"("id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_settlement_membership" ADD CONSTRAINT "world_settlement_membership_member_fk" FOREIGN KEY ("geography_id","world_id","settlement_id") REFERENCES "public"."world_settlement_entity"("geography_id","world_id","settlement_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_settlement_membership" ADD CONSTRAINT "world_settlement_membership_district_fk" FOREIGN KEY ("district_id","world_id","settlement_id","district_kind") REFERENCES "public"."world_settlement_entity"("geography_id","world_id","settlement_id","kind") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_atlas_settlement_shape_map_idx" ON "world_atlas_settlement_shape" USING btree ("map_id");--> statement-breakpoint
CREATE INDEX "world_settlement_entity_parent_idx" ON "world_settlement_entity" USING btree ("settlement_id");--> statement-breakpoint
ALTER TABLE "world_atlas_map" ADD CONSTRAINT "world_atlas_map_kind_valid" CHECK ("world_atlas_map"."map_kind" IN ('generic','settlement') AND ("world_atlas_map"."map_kind"='generic' OR "world_atlas_map"."geography_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "world_atlas_map" ADD CONSTRAINT "world_atlas_settlement_state_valid" CHECK (world_atlas_settlement_state_valid("world_atlas_map"."settlement_state"));