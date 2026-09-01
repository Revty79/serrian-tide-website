ALTER TABLE "creatures" ADD COLUMN "total_hp" integer;--> statement-breakpoint
ALTER TABLE "creature_hp_pools" ADD COLUMN "maximum_hp" integer;--> statement-breakpoint
ALTER TABLE "creatures" ADD CONSTRAINT "creatures_total_hp_valid" CHECK ("creatures"."total_hp" IS NULL OR "creatures"."total_hp" >= 0);--> statement-breakpoint
ALTER TABLE "creature_hp_pools" ADD CONSTRAINT "creature_hp_pools_maximum_hp_valid" CHECK ("creature_hp_pools"."maximum_hp" IS NULL OR "creature_hp_pools"."maximum_hp" >= 0);