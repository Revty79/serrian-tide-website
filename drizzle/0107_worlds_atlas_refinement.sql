-- Extend recipe recognition without rewriting 0106 or touching any saved map/source.
-- The original validator remains the authority for the unchanged recipe envelope.
ALTER FUNCTION world_atlas_generation_valid(jsonb) RENAME TO world_atlas_generation_valid_v1;
--> statement-breakpoint
CREATE FUNCTION world_atlas_generation_valid(g jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
BEGIN
  IF g #>> '{spec,algorithm}' = 'serrian-atlas-v2' THEN
    RETURN world_atlas_generation_valid_v1(jsonb_set(g, '{spec,algorithm}', '"serrian-atlas-v1"'::jsonb));
  END IF;
  RETURN world_atlas_generation_valid_v1(g);
END;
$$;
--> statement-breakpoint
-- PostgreSQL constraints bind the old function by identity; rebind explicitly and validate all data.
ALTER TABLE "world_atlas_map" DROP CONSTRAINT "world_atlas_generation_valid";
--> statement-breakpoint
ALTER TABLE "world_atlas_map" ADD CONSTRAINT "world_atlas_generation_valid" CHECK (("world_atlas_map"."generation" IS NULL AND "world_atlas_map"."source_map_id" IS NULL) OR ("world_atlas_map"."generation" IS NOT NULL AND world_atlas_generation_valid("world_atlas_map"."generation") IS TRUE AND "world_atlas_map"."generation"->>'requestId'="world_atlas_map"."id" AND ("world_atlas_map"."generation"->>'sourceMapId') IS NOT DISTINCT FROM "world_atlas_map"."source_map_id" AND ("world_atlas_map"."source_map_id" IS NULL OR "world_atlas_map"."source_map_id"<>"world_atlas_map"."id")));
