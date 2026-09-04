CREATE TABLE "weapon_skill_path_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"weapon_profile_id" integer NOT NULL,
	"firing_mode_id" integer,
	"endpoint_skill_id" integer NOT NULL,
	"review_state" text DEFAULT 'review-required' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"sort_order" integer NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "weapon_skill_path_mappings_review_state_valid" CHECK ("weapon_skill_path_mappings"."review_state" IN ('review-required', 'approved')),
	CONSTRAINT "weapon_skill_path_mappings_sort_order_valid" CHECK ("weapon_skill_path_mappings"."sort_order" >= 0),
	CONSTRAINT "weapon_skill_path_mappings_notes_length_valid" CHECK (length("weapon_skill_path_mappings"."notes") <= 1000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "weapon_firing_modes_id_profile_uq" ON "weapon_firing_modes" USING btree ("id","weapon_profile_id");--> statement-breakpoint
ALTER TABLE "weapon_skill_path_mappings" ADD CONSTRAINT "weapon_skill_path_mappings_endpoint_skill_id_skill_id_fk" FOREIGN KEY ("endpoint_skill_id") REFERENCES "public"."skill"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weapon_skill_path_mappings" ADD CONSTRAINT "weapon_skill_path_mappings_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weapon_skill_path_mappings" ADD CONSTRAINT "weapon_skill_path_mappings_profile_fk" FOREIGN KEY ("weapon_profile_id") REFERENCES "public"."weapon_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weapon_skill_path_mappings" ADD CONSTRAINT "weapon_skill_path_mappings_mode_profile_fk" FOREIGN KEY ("firing_mode_id","weapon_profile_id") REFERENCES "public"."weapon_firing_modes"("id","weapon_profile_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "weapon_skill_path_mappings_default_endpoint_uq" ON "weapon_skill_path_mappings" USING btree ("weapon_profile_id","endpoint_skill_id") WHERE "weapon_skill_path_mappings"."firing_mode_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "weapon_skill_path_mappings_mode_endpoint_uq" ON "weapon_skill_path_mappings" USING btree ("weapon_profile_id","firing_mode_id","endpoint_skill_id") WHERE "weapon_skill_path_mappings"."firing_mode_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "weapon_skill_path_mappings_default_order_uq" ON "weapon_skill_path_mappings" USING btree ("weapon_profile_id","sort_order") WHERE "weapon_skill_path_mappings"."firing_mode_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "weapon_skill_path_mappings_mode_order_uq" ON "weapon_skill_path_mappings" USING btree ("weapon_profile_id","firing_mode_id","sort_order") WHERE "weapon_skill_path_mappings"."firing_mode_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "weapon_skill_path_mappings_scope_idx" ON "weapon_skill_path_mappings" USING btree ("weapon_profile_id","firing_mode_id","sort_order","id");--> statement-breakpoint
CREATE INDEX "weapon_skill_path_mappings_endpoint_idx" ON "weapon_skill_path_mappings" USING btree ("endpoint_skill_id","weapon_profile_id");
