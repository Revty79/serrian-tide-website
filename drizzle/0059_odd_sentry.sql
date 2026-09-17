ALTER TABLE "weapon_profiles" ADD COLUMN "range_mode" text;--> statement-breakpoint
ALTER TABLE "weapon_profiles" ADD COLUMN "distance_unit" text;--> statement-breakpoint
ALTER TABLE "weapon_profiles" ADD COLUMN "reach_distance" double precision;--> statement-breakpoint
ALTER TABLE "weapon_profiles" ADD COLUMN "short_range_distance" double precision;--> statement-breakpoint
ALTER TABLE "weapon_profiles" ADD COLUMN "medium_range_distance" double precision;--> statement-breakpoint
ALTER TABLE "weapon_profiles" ADD COLUMN "long_range_distance" double precision;--> statement-breakpoint
ALTER TABLE "weapon_profiles" ADD CONSTRAINT "weapon_profiles_range_mode_valid" CHECK ("weapon_profiles"."range_mode" IS NULL OR "weapon_profiles"."range_mode" IN ('melee','ranged','hybrid'));--> statement-breakpoint
ALTER TABLE "weapon_profiles" ADD CONSTRAINT "weapon_profiles_distance_unit_valid" CHECK ("weapon_profiles"."distance_unit" IS NULL OR length(trim("weapon_profiles"."distance_unit")) > 0);--> statement-breakpoint
ALTER TABLE "weapon_profiles" ADD CONSTRAINT "weapon_profiles_reach_distance_valid" CHECK ("weapon_profiles"."reach_distance" IS NULL OR "weapon_profiles"."reach_distance" > 0);--> statement-breakpoint
ALTER TABLE "weapon_profiles" ADD CONSTRAINT "weapon_profiles_short_range_distance_valid" CHECK ("weapon_profiles"."short_range_distance" IS NULL OR "weapon_profiles"."short_range_distance" > 0);--> statement-breakpoint
ALTER TABLE "weapon_profiles" ADD CONSTRAINT "weapon_profiles_medium_range_distance_valid" CHECK ("weapon_profiles"."medium_range_distance" IS NULL OR "weapon_profiles"."medium_range_distance" > 0);--> statement-breakpoint
ALTER TABLE "weapon_profiles" ADD CONSTRAINT "weapon_profiles_long_range_distance_valid" CHECK ("weapon_profiles"."long_range_distance" IS NULL OR "weapon_profiles"."long_range_distance" > 0);--> statement-breakpoint
ALTER TABLE "weapon_profiles" ADD CONSTRAINT "weapon_profiles_range_order_valid" CHECK (("weapon_profiles"."short_range_distance" IS NULL OR "weapon_profiles"."medium_range_distance" IS NULL OR "weapon_profiles"."short_range_distance" <= "weapon_profiles"."medium_range_distance") AND ("weapon_profiles"."medium_range_distance" IS NULL OR "weapon_profiles"."long_range_distance" IS NULL OR "weapon_profiles"."medium_range_distance" <= "weapon_profiles"."long_range_distance"));