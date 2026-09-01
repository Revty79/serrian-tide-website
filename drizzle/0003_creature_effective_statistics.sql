ALTER TABLE "creatures" ADD COLUMN "hp_multiplier_steps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "creatures" ADD COLUMN "base_movement_steps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "creatures" ADD COLUMN "base_magic_steps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "creatures" ADD CONSTRAINT "creatures_hp_multiplier_steps_valid" CHECK ("creatures"."hp_multiplier_steps" >= 0);--> statement-breakpoint
ALTER TABLE "creatures" ADD CONSTRAINT "creatures_base_movement_steps_valid" CHECK ("creatures"."base_movement_steps" >= 0);--> statement-breakpoint
ALTER TABLE "creatures" ADD CONSTRAINT "creatures_base_magic_steps_valid" CHECK ("creatures"."base_magic_steps" >= 0);