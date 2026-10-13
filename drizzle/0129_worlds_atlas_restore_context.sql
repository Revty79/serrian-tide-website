-- pg_restore deliberately uses an empty search_path. These existing CHECK
-- validators call public World helpers without qualifying their names and
-- otherwise reject valid restored artwork/sources. Keep all validation bodies
-- and permissions unchanged; make helper resolution independent of the caller.
ALTER FUNCTION public.world_atlas_dungeon_shape_valid(jsonb) SET search_path = pg_catalog, public;
--> statement-breakpoint
ALTER FUNCTION public.world_atlas_dungeon_state_valid(jsonb) SET search_path = pg_catalog, public;
--> statement-breakpoint
ALTER FUNCTION public.world_atlas_interior_shape_valid(jsonb) SET search_path = pg_catalog, public;
--> statement-breakpoint
ALTER FUNCTION public.world_atlas_settlement_shape_valid(jsonb) SET search_path = pg_catalog, public;
--> statement-breakpoint
ALTER FUNCTION public.world_link_content_valid(jsonb,jsonb,text,text,text,text,text,text,text) SET search_path = pg_catalog, public;
--> statement-breakpoint
ALTER FUNCTION public.world_map_state_6bb_payload_valid(jsonb) SET search_path = pg_catalog, public;
--> statement-breakpoint
ALTER FUNCTION public.world_map_state_generic_payload_valid(jsonb) SET search_path = pg_catalog, public;
--> statement-breakpoint
ALTER FUNCTION public.world_map_state_payload_valid(jsonb) SET search_path = pg_catalog, public;
--> statement-breakpoint
ALTER FUNCTION public.world_map_state_settlement_base_valid(jsonb) SET search_path = pg_catalog, public;
--> statement-breakpoint
ALTER FUNCTION public.world_map_territories_valid(jsonb) SET search_path = pg_catalog, public;
