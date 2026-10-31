CREATE TABLE "world_map_region_footprint" (
	"map_id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"footprint" jsonb NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "world_region_footprint_valid" CHECK (jsonb_typeof("world_map_region_footprint"."footprint")='object' AND "world_map_region_footprint"."footprint"->>'version'='1' AND "world_map_region_footprint"."footprint"->>'kind'='polygon' AND jsonb_typeof("world_map_region_footprint"."footprint"->'parts')='array' AND jsonb_array_length("world_map_region_footprint"."footprint"->'parts') BETWEEN 1 AND 8 AND octet_length("world_map_region_footprint"."footprint"::text)<=262144 AND ("world_map_region_footprint"."footprint"-ARRAY['version','kind','parts'])='{}'::jsonb)
);
--> statement-breakpoint
ALTER TABLE "world_map_region" ADD COLUMN "footprint_kind" text DEFAULT 'rectangle' NOT NULL;--> statement-breakpoint
ALTER TABLE "world_map_region_footprint" ADD CONSTRAINT "world_region_footprint_region_fk" FOREIGN KEY ("map_id","world_id") REFERENCES "public"."world_map_region"("map_id","world_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_map_region_footprint" ADD CONSTRAINT "world_region_footprint_author_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_map_region" ADD CONSTRAINT "world_map_region_footprint_kind" CHECK ("world_map_region"."footprint_kind" IN ('rectangle','polygon'));
--> statement-breakpoint
CREATE FUNCTION world_region_footprint_validate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r record; t record; part jsonb; p jsonb; px double precision; py double precision; lx double precision; total integer:=0; lowx double precision:=1e100; highx double precision:=-1e100; lowy double precision:=1e100; highy double precision:=-1e100; eps double precision;
BEGIN
 SELECT * INTO r FROM world_map_region WHERE map_id=NEW.map_id AND world_id=NEW.world_id;
 IF NOT FOUND OR r.footprint_kind<>'polygon' OR r.created_by_user_id<>NEW.created_by_user_id THEN RAISE EXCEPTION 'Footprint must belong to its original polygon region and author.'; END IF;
 SELECT * INTO t FROM world_terrain WHERE id=r.terrain_id AND world_id=r.world_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Accepted World terrain is unavailable.'; END IF;
 IF jsonb_typeof(NEW.footprint->'version') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Unsupported footprint version.'; END IF;
 eps:=greatest(0.0000001,greatest(t.width_metres,t.height_metres)*2.220446049250313e-16*32);
 FOR part IN SELECT value FROM jsonb_array_elements(NEW.footprint->'parts') LOOP
  IF jsonb_typeof(part) IS DISTINCT FROM 'array' OR jsonb_array_length(part) NOT BETWEEN 3 AND 1024 THEN RAISE EXCEPTION 'Each area requires 3 to 1024 vertices.'; END IF;
  total:=total+jsonb_array_length(part);
  FOR p IN SELECT value FROM jsonb_array_elements(part) LOOP
   IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR jsonb_typeof(p->'x') IS DISTINCT FROM 'number' OR jsonb_typeof(p->'y') IS DISTINCT FROM 'number' OR (p-ARRAY['x','y'])<>'{}'::jsonb THEN RAISE EXCEPTION 'Boundary points require canonical x/y coordinates only.'; END IF;
   px:=(p->>'x')::double precision;py:=(p->>'y')::double precision;
   IF NOT(px>=0 AND px<=t.width_metres AND py>=0 AND py<=t.height_metres) OR (t.wrap_east_west AND px=t.width_metres) THEN RAISE EXCEPTION 'Boundary point outside its World.'; END IF;
   lx:=px-r.x_metres;IF t.wrap_east_west THEN lx:=lx-floor(lx/t.width_metres)*t.width_metres;END IF;
   lowx:=least(lowx,lx);highx:=greatest(highx,lx);lowy:=least(lowy,py);highy:=greatest(highy,py);
  END LOOP;
 END LOOP;
 IF total>1024 OR abs(lowx)>eps OR abs(highx-r.width_metres)>eps OR abs(lowy-r.y_metres)>eps OR abs(highy-r.y_metres-r.height_metres)>eps THEN RAISE EXCEPTION 'Footprint vertices must match the accepted derived frame and vertex budget.';END IF;
 RETURN NEW;
END;$$;
--> statement-breakpoint
CREATE TRIGGER world_region_footprint_validate BEFORE INSERT ON world_map_region_footprint FOR EACH ROW EXECUTE FUNCTION world_region_footprint_validate();
--> statement-breakpoint
CREATE TRIGGER world_region_footprint_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON world_map_region_footprint FOR EACH STATEMENT EXECUTE FUNCTION world_terrain_history_immutable();
--> statement-breakpoint
CREATE FUNCTION world_region_footprint_required() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.footprint_kind='polygon' AND NOT EXISTS(SELECT 1 FROM world_map_region_footprint f WHERE f.map_id=NEW.map_id AND f.world_id=NEW.world_id AND f.created_by_user_id=NEW.created_by_user_id) THEN RAISE EXCEPTION 'A polygon region requires its immutable footprint in the same acceptance transaction.';END IF;
 RETURN NEW;
END;$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER world_region_footprint_required AFTER INSERT ON world_map_region DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION world_region_footprint_required();
