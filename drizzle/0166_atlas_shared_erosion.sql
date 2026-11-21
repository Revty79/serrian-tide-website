-- Extend the existing immutable native relief receipt; no stored geography changes.
ALTER TABLE world_terrain_relief_group
 DROP CONSTRAINT world_terrain_relief_group_operation_check,
 ADD CONSTRAINT world_terrain_relief_group_operation_check
 CHECK (jsonb_typeof(operation)='object' AND coalesce(operation->>'kind','') IN ('landform-profile','erosion'));
--> statement-breakpoint
CREATE FUNCTION world_native_shared_erosion_schema() RETURNS boolean LANGUAGE sql IMMUTABLE AS 'SELECT true';
