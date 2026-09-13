ALTER TABLE "weapon_firing_modes" ALTER COLUMN "base_cycling_initiative_cost" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "weapon_firing_modes" ALTER COLUMN "base_recoil_reset_initiative_cost" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "weapon_profiles" ALTER COLUMN "draw_initiative_cost" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "weapon_profiles" ALTER COLUMN "ready_initiative_cost" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "weapon_profiles" ALTER COLUMN "reload_initiative_cost" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "weapon_profiles" ALTER COLUMN "unload_initiative_cost" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "weapon_profiles" ALTER COLUMN "firing_mode_change_initiative_cost" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "weapon_profiles" ALTER COLUMN "ammunition_cycling_initiative_modifier" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "weapon_profiles" ALTER COLUMN "ammunition_recoil_reset_initiative_modifier" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "magazine_profiles" ALTER COLUMN "fill_initiative_cost_per_round" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "campaign_character_firearm_preparation" ALTER COLUMN "initiative_cost" SET DATA TYPE double precision;